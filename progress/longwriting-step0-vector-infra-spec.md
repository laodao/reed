# 步骤 0 Spec - 向量库基础设施扩展

> 步骤：0 / 8
> 名称：向量库基础设施（IVectorStore 向后兼容扩展 + LanceDB 迁移 + LwVectorIndexService）
> 日期：2026-07-31
> 依赖：无（基础设施层）
> 修复 Review：R1（向后兼容）、R2（LanceDB 迁移）、R6（轻量路径）
> 关联：[总 Spec](./2026-07-31-longwriting-optimization-spec.md) §5、[实施规划](./2026-07-31-longwriting-implementation-plan.md)

---

## 1. 目标

为长文写作模块提供"按元数据过滤的语义检索"能力，作为后续 ContextBuilder（步骤1）和 ExtractionPipeline（步骤2）的基础。

**核心约束**：不破坏现有 knowledge-base 模块（R1 向后兼容）。

---

## 2. 现状

- `IVectorStore`（`src/core/services/vector/vector-store.interface.ts`）：`searchSimilar(knowledgeBaseId, queryVector, topK, opts?)` 仅按 knowledgeBaseId 过滤
- `VectorRecord`：id/chunkId/knowledgeBaseId/vector/createdAt（LanceDB 实现丢弃了 userId/dim/model）
- LanceDB 实现（`src/core/services/lance-db.service.ts`）：单表 `vectors`，`.where('knowledgeBaseId = ...')`
- pgvector 实现（`src/core/services/vector/pg-vector-store.ts`）：Web 端
- embedding：`getEmbeddingVectors(texts: string[], config: EmbeddingConfig): Promise<number[][] | null>`（`src/core/services/knowledge-base.service.ts:729`），支持 dashscope/bailian/zhipu/openai；**维度由项目 embeddingConfig 决定（非固定值）**
- longwriting 模块与 knowledge-base **零耦合**

---

## 3. 接口设计（向后兼容扩展）

### 3.1 新增类型

```typescript
// src/core/services/vector/vector-store.interface.ts

/** 向量元数据过滤条件（新增） */
export interface VectorMetadataFilter {
  projectId?: string
  entityType?: string
  entityId?: string
  chapterNumber?: number          // 精确
  chapterNumberLte?: number       // <= 某章（检索历史章节）
  chapterNumberGte?: number       // >= 某章
}

/** 向量检索选项（新增，opts 复用） */
export interface VectorSearchOptions {
  topK?: number
  scoreThreshold?: number
  filter?: VectorMetadataFilter   // 新增：元数据过滤
}

/** 元数据过滤删除条件（新增） */
export interface VectorDeleteByFilter {
  projectId?: string
  entityType?: string
  entityId?: string
  chapterNumber?: number
}

/** 检索结果 */
export interface VectorSearchResult {
  chunkId: string
  score: number
  metadata: {
    projectId?: string
    entityType?: string
    entityId?: string
    chapterNumber?: number
    knowledgeBaseId?: string
  }
}
```

### 3.2 VectorRecord 扩展（新增可选字段，向后兼容）

```typescript
export interface VectorRecord {
  id: string
  chunkId: string
  knowledgeBaseId?: string         // 旧字段，保留
  vector: number[]
  // 新增元数据（均可选，旧数据为空）
  projectId?: string
  entityType?: string
  entityId?: string
  chapterNumber?: number
  createdAt: number
}
```

### 3.3 IVectorStore 接口扩展（R1 向后兼容）

```typescript
export interface IVectorStore {
  // === 旧方法签名完全保留，knowledge-base 模块零改动 ===
  insert(record: Omit<VectorRecord, 'id' | 'createdAt'>): Promise<string>
  insertBatch(records: Array<Omit<VectorRecord, 'id' | 'createdAt'>>): Promise<string[]>
  getByChunkId(chunkId: string): Promise<VectorRecord | null>
  searchSimilar(knowledgeBaseId: string, queryVector: number[], topK?: number, opts?: VectorSearchOptions): Promise<VectorSearchResult[]>
  deleteByChunkId(chunkId: string): Promise<boolean>
  deleteByChunkIds(chunkIds: string[]): Promise<boolean>
  deleteByKnowledgeBaseId(knowledgeBaseId: string): Promise<boolean>
  countByKnowledgeBaseId(knowledgeBaseId: string): Promise<number>

  // === 新增方法（长文模块专用，不影响旧接口）===
  /** 按元数据过滤检索（长文模块用） */
  searchByMetadata(queryVector: number[], filter: VectorMetadataFilter, topK?: number, scoreThreshold?: number): Promise<VectorSearchResult[]>
  /** 按元数据批量删除 */
  deleteByMetadata(filter: VectorDeleteByFilter): Promise<number>
  /** 按 projectId 统计 */
  countByProject(projectId: string): Promise<number>
}
```

> **关键决策（R1）**：不修改 `searchSimilar` 签名，新增 `searchByMetadata`。旧 knowledge-base 调用点零改动。`searchSimilar` 的 opts 也可选支持 filter（向前兼容增强），但不是必须。

---

## 4. LanceDB 实现扩展

文件：`src/core/services/lance-db.service.ts`

### 4.1 Schema 扩展

vectors 表新增列：`projectId`/`entityType`/`entityId`/`chapterNumber`（均 nullable string/integer）。

### 4.2 迁移策略（R2 懒迁移）

```typescript
// 启动时检测 + 迁移
async ensureSchema(): Promise<void> {
  const table = await this.db.openTable('vectors')
  const schema = table.schema()
  const hasProjectId = schema.columns.some(c => c.name === 'projectId')

  if (!hasProjectId) {
    // 旧 schema：创建新表迁移
    // LanceDB 不支持 ALTER ADD COLUMN，需 drop + recreate
    // 1. 读取旧数据全部记录（含 vector）
    // 2. drop 旧表
    // 3. create 新表（含新列）
    // 4. 批量写入旧数据（新列留空/null）
    // 旧知识库数据 projectId 为空，长文检索 projectId IS NOT NULL 天然隔离
  }
}
```

**风险控制**：
- 迁移前打印日志 + 数据量
- 旧数据量大时（>10万条）分批迁移
- 迁移失败回滚（保留旧表备份名 `vectors_backup_<timestamp>`，迁移成功后删）

### 4.3 searchByMetadata 实现

```typescript
async searchByMetadata(queryVector, filter, topK = 10, scoreThreshold?): Promise<VectorSearchResult[]> {
  let query = this.table.search(queryVector).limit(topK)
  // 构造 where 条件链
  const conditions: string[] = []
  if (filter.projectId) conditions.push(`projectId = '${filter.projectId}'`)
  if (filter.entityType) conditions.push(`entityType = '${filter.entityType}'`)
  if (filter.entityId) conditions.push(`entityId = '${filter.entityId}'`)
  if (filter.chapterNumber !== undefined) conditions.push(`chapterNumber = ${filter.chapterNumber}`)
  if (filter.chapterNumberLte !== undefined) conditions.push(`chapterNumber <= ${filter.chapterNumberLte}`)
  if (filter.chapterNumberGte !== undefined) conditions.push(`chapterNumber >= ${filter.chapterNumberGte}`)
  if (conditions.length > 0) {
    query = query.where(conditions.join(' AND '))
  }
  const results = await query.execute()
  return results.map(r => ({ chunkId: r.chunkId, score: r._distance, metadata: {...} }))
}
```

### 4.4 pgvector 实现同步
`src/core/services/vector/pg-vector-store.ts`：对应表 ALTER 加列、searchByMetadata 加 WHERE。

---

## 5. 数据模型 - lw_vector_indices

### 5.1 Entity（`src/core/database/entities/lw-vector-index.entity.ts`）

```typescript
@Entity({ name: 'lw_vector_indices' })
@Index('idx_lw_vector_project', ['projectId'])
@Index('idx_lw_vector_entity', ['projectId', 'entityType', 'entityId'])
@Unique('uq_lw_vector_chunk', ['chunkId'])
export class LwVectorIndexEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' }) id!: string
  @Index() @Column({ name: 'user_id', type: 'varchar', nullable: true }) userId!: string | null
  @Column({ name: 'project_id', type: 'varchar' }) projectId!: string
  @Column({ name: 'entity_type', type: 'text' }) entityType!: LwVectorEntityType
  @Column({ name: 'entity_id', type: 'varchar' }) entityId!: string
  @Column({ name: 'chapter_number', type: 'integer', nullable: true }) chapterNumber!: number | null
  @Column({ name: 'chunk_id', type: 'varchar' }) chunkId!: string
  @Column({ name: 'content_hash', type: 'text', nullable: true }) contentHash!: string | null
  @Column({ name: 'created_at', type: Date }) createdAt!: Date
  @Column({ name: 'updated_at', type: Date }) updatedAt!: Date
}

export type LwVectorEntityType =
  | 'character' | 'location' | 'item' | 'faction' | 'skill'
  | 'plot' | 'outline' | 'chapter' | 'memory' | 'event'
```

### 5.2 Repository（`src/core/database/repositories/lw-vector-index.repository.ts`）

```typescript
export class LwVectorIndexRepository {
  async getByEntity(projectId, entityType, entityId): Promise<LwVectorIndexEntity[]>        // 一个实体可能多 chunk
  async getByChapter(projectId, chapterNumber): Promise<LwVectorIndexEntity[]>
  async getByProject(projectId): Promise<LwVectorIndexEntity[]>
  async create(data): Promise<LwVectorIndexEntity>
  async batchCreate(dataList): Promise<LwVectorIndexEntity[]>
  async deleteByChunkIds(chunkIds: string[]): Promise<number>
  async deleteByEntity(projectId, entityType, entityId): Promise<number>
  async deleteByChapter(projectId, chapterNumber): Promise<number>
  async deleteByProject(projectId): Promise<number>
  async getContentHash(projectId, entityType, entityId): Promise<Map<string, string>>  // 增量更新判断
}
```

注册到 `database-manager.interface.ts`：`lwVectorIndices: LwVectorIndexRepository | null`

---

## 6. LwVectorIndexService

文件：`src/core/services/longwriting/lw-vector-index.service.ts`

### 6.1 序列化策略（设定 -> 文本，R6 轻量路径）

```typescript
// 不入 kb_documents/kb_chunks，内存构建文本即弃
private serializeEntity(entityType, entity): string {
  switch (entityType) {
    case 'character': return `${entity.name}（${roleLabel}）。外貌：${entity.appearance}。性格：${entity.personality}。背景：${entity.background}。能力：${entity.abilities}。主要事件：${entity.majorEvents}`
    case 'location': return `${entity.name}（${typeLabel}）。${entity.description}。重要程度：${importanceLabel}`
    case 'item': return `${entity.name}（${typeLabel}，${levelLabel}）。${entity.description}`
    case 'plot': return `情节：${entity.title}。${entity.summary}。涉及：${entity.involvedCharacters?.join('、')}`
    case 'outline': return `[${nodeType}] ${entity.name}。${entity.summary}`
    // ...
  }
}
```

### 6.2 章节切片

复用 `HybridSplitter`（`src/core/services/chunk-splitter/hybrid-splitter.ts`），配置用 `SplitConfig{strategy, minChunkSize, maxChunkSize, similarityThreshold?, structureOnly?}`（**注意**：CHUNK_SIZE=800/OVERLAP=80 是 `fixedSplit` 内部硬编码常量，非 SplitConfig 字段）。每片带 chapterNumber 元数据。

### 6.3 接口

```typescript
export class LwVectorIndexService {
  /** 设定入库（单实体）*/
  async indexEntity(projectId: string, entityType: LwVectorEntityType, entityId: string): Promise<void>
  /** 章节切片入库 */
  async indexChapter(projectId: string, outlineId: string, chapterNumber: number, content: string): Promise<void>
  /** 记忆/事件入库 */
  async indexMemory(projectId: string, memoryId: string): Promise<void>
  /** 语义检索 */
  async search(projectId: string, query: string, opts: {
    entityType?: LwVectorEntityType
    chapterNumberLte?: number
    topK?: number
    scoreThreshold?: number
  }): Promise<LwVectorSearchResult[]>
  /** 增量更新（hash 变化才重新 embedding）*/
  async upsertEntity(projectId: string, entityType: LwVectorEntityType, entityId: string): Promise<{ indexed: boolean; reason?: string }>
  /** 删除项目的所有向量 */
  async deleteByProject(projectId: string): Promise<void>
  /** 删除某章节向量（章节重写时）*/
  async deleteByChapter(projectId: string, chapterNumber: number): Promise<void>
  /** 重建项目索引（旧项目首次启用）*/
  async rebuildProjectIndex(projectId: string, onProgress?: (done: number, total: number) => void): Promise<void>
}

export interface LwVectorSearchResult {
  entityType: LwVectorEntityType
  entityId: string
  chunkId: string
  score: number
  preview: string  // 命中片段预览（前 200 字）
}
```

### 6.4 增量更新逻辑

```
upsertEntity(projectId, entityType, entityId):
  1. 加载实体 -> 序列化为文本
  2. contentHash = sha256(text)
  3. 查 lw_vector_indices 该实体现有 hash
  4. 若 hash 相同 -> 跳过（indexed=false, reason='unchanged'）
  5. 若不同或不存在：
     a. 删除旧 chunk（IVectorStore.deleteByChunkIds + lw_vector_indices.deleteByEntity）
     b. embedding = await getEmbeddingVectors(text)
     c. chunkId = uuid
     d. IVectorStore.insert({ chunkId, vector, projectId, entityType, entityId })
     e. lw_vector_indices.create({ ..., contentHash })
```

### 6.5 检索逻辑

```
search(projectId, query, opts):
  1. queryVector = await getEmbeddingVectors(query)
  2. results = IVectorStore.searchByMetadata(queryVector, {
       projectId, entityType: opts.entityType,
       chapterNumberLte: opts.chapterNumberLte
     }, opts.topK ?? 10, opts.scoreThreshold)
  3. 关联 lw_vector_indices 取 entityType/entityId
  4. 取原文片段作 preview（character 从 lw_characters 取，chapter 从 lw_chapters 取对应切片）
  5. 返回 LwVectorSearchResult[]
```

---

## 7. IPC 通道

`src/electron/ipc/handlers/longwriting.handler.ts` 新增：
- `longwriting:vectorIndex:rebuildProject` (projectId) -> 进度事件 `longwriting:vectorIndex:progress:<eventId>`
- `longwriting:vectorIndex:search` (projectId, query, opts) -> results
- `longwriting:vectorIndex:stats` (projectId) -> { entityCount, chapterCount, totalChunks }

preload `src/preload/index.ts` 注册对应 API。

Web 端 `packages/web-server/src/modules/longwriting/` 新增 controller 调用同一 Core Service。

---

## 8. 数据库迁移

`src/main/database/migrations/add-lw-vector-indices.ts`：
- CREATE TABLE lw_vector_indices（含索引）

LanceDB schema 迁移由 `LanceDBService.ensureSchema()` 启动时处理（R2）。

---

## 9. 测试计划（TDD）

### 9.1 单元测试
- `LwVectorIndexRepository`：CRUD、按 entity/chapter/project 删除、getContentHash
- `LwVectorIndexService`：
  - 序列化各 entityType 正确性
  - 增量更新：hash 相同跳过、不同重新入库
  - 检索：按 entityType/chapterNumberLte 过滤生效
  - mock IVectorStore + getEmbeddingVectors
- `LanceDBService.searchByMetadata`：where 条件构造正确（多条件 AND）
- `LanceDBService.ensureSchema`：旧 schema 检测 + 迁移（用临时表测试）

### 9.2 集成测试
- 设定入库 -> 检索 -> 命中
- 章节切片入库 -> 按 chapterNumberLte 检索历史
- 删除实体 -> 向量同步删除
- 增量更新：改角色名 -> 重新检索命中新名
- 与现有 knowledge-base 隔离：长文向量检索不返回知识库数据（projectId 过滤）

### 9.3 回归测试
- 现有 knowledge-base 向量检索功能不受影响（旧 searchSimilar 调用）

---

## 10. 验收标准（可量化）

| # | 验收点 | 可量化指标 / 断言 |
|---|--------|------------------|
| 0.1 | 向后兼容 | knowledge-base 现有 `searchSimilar(kbid,vec,topK)` 调用零改动；kb 单测/e2e 100% 通过；IVectorStore 接口 diff = 0 删除 / 0 修改 / 纯新增方法 |
| 0.2 | 元数据过滤 | 入库 10 角色 + 5 章节切片（P1, ch=1..5）后：`searchByMetadata({projectId:'P1',entityType:'character'})` 返回全 character、0 条 chapter；`{chapterNumberLte:3}` 返回 ch∈{1,2,3}、0 条 ch>3 |
| 0.3 | LanceDB 迁移 | 迁移前 vectors 列数=5，迁移后=9（+projectId/entityType/entityId/chapterNumber）；迁移前后 `countByKnowledgeBaseId(kbid)` 相等；旧数据 projectId 均 null |
| 0.4 | 入库检索 | indexEntity 角色"林锋"后 `search("林锋",topK=5)` 命中（entityId 匹配，score>0）；indexChapter 第3章后 `search("第3章关键词")` 命中 entityType='chapter'/ch=3 |
| 0.5 | 增量更新 | upsertEntity 同角色连调2次（未变）：`getEmbeddingVectors` 调用 1 次、contentHash 不变；改名后：调用 2 次、旧 chunkId 删除 / 新 chunkId 写入 |
| 0.6 | 隔离 | 知识库数据（projectId=null）+ 长文数据（P1）共存；`searchByMetadata({projectId:'P1'})` 返回 0 条 knowledgeBaseId 非空 |
| 0.7 | 双端一致 | pgvector 实现通过 0.2 / 0.4 / 0.5 / 0.6 等价测试 |
| 0.8 | 测试覆盖 | 新增单测 ≥15（repo/service/lance-db）+ 集成 ≥5（入库-检索-增量-隔离-迁移），全通过 |

---

## 10.5 接口细节补充（review 补充）

### P0-1 search 的 preview 取数路径
`LwVectorSearchResult.preview`（命中片段前 200 字）按 entityType 取数：
- character/location/item/faction/skill/plot/outline：从对应 lw_* 表取序列化文本前 200 字（复用 §6.1 序列化函数）
- chapter：从 `lw_chapters.content` 取对应切片原文（chunkId 关联 lw_vector_indices，入库时记录切片起止）
- memory：从 `lw_memories.title + description` 取
> 实现：LwVectorIndexService 入库时维护 chunkId -> 原文片段映射（内存或 lw_vector_indices.content_hash 旁存 preview），查询时直接取

### P0-2 indexMemory 序列化策略
memory 文本：`[${memoryType}] ${title}：${description}（涉及：${involvedEntities.map(e=>e.name).join('、')}）@第${chapterNumber}章`

### P0-3 rebuildProjectIndex onProgress 单位
`onProgress(done, total)`：total = 项目内待索引实体数（角色+地点+物品+情节+大纲节点+已写章节数），done = 已完成数。每实体索引完成回调一次。

### P0-4 ensureSchema 持久化标记
新增 LanceDB 元数据表 `schema_meta`（key/value），记录 `vectors_schema_version`。启动读版本，已是目标版本则跳过迁移。迁移成功后更新版本号，避免每次启动重跑。

### P0-5 迁移失败回滚流程
1. 旧表重命名为 `vectors_backup_<ts>`（非 drop）
2. 创建新表 `vectors`（含新列）
3. 分批从备份表读旧数据写入新表（新列留 null）
4. count 校验通过 -> 删除备份表
5. 任一步失败 -> 保留备份表 + 日志 + 回滚（drop 新表 + 重命名备份表为 vectors）+ 启动报错提示

---

## 11. 开放问题

1. 章节切片配置是否与知识库共用 splitConfig，还是长文独立配置？- 倾向长文独立（CHUNK_SIZE 可更小，章节检索需细粒度）。
2. embedding 模型是否与知识库共用项目 embeddingConfig？- 倾向共用，减少配置负担。
3. LanceDB 迁移旧数据量大时是否需要进度反馈？- 倾向加日志 + 启动耗时统计，UI 不阻塞（后台迁移）。
