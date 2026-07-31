# 长文写作模块优化方案 Spec

> 版本：v1.0
> 日期：2026-07-31
> 分支：feat/portrait-design-redesign
> 关联文档：[调研报告](./2026-07-31-longwriting-quality-research.md)、旧 PRD `docs/archive/prd/09-longwriting-design.md`
> 决策记录：向量库采用「扩展现有 IVectorStore」方案

---

## 1. 背景与目标

### 1.1 背景
长文写作模块后端数据模型已较完整（含角色/地点/物品/情节/大纲/章节/记忆/实体状态/章节状态摘要），但写作效果不佳。根因：上下文构建靠"扁平表 + 截断注入"，无语义检索、无图关系、无结构化时间线、前端上下文黑盒。

### 1.2 目标
将"扁平表 + 截断注入"升级为「**故事知识图谱 + 向量检索 + 智能上下文构建器**」，系统性提升写作连贯性、一致性、可控性。

### 1.3 核心指标
- 第 N 章（N≥30）生成时，相关记忆/设定召回率提升（不再被截断丢失）
- 角色状态、时间线、伏笔在跨章写作中保持一致
- 用户可在生成前预览/编辑注入的上下文
- 设定/章节内容可被语义检索复用

---

## 2. 设计原则（遵循项目铁律）

1. **双端统一**：所有业务逻辑在 `packages/core`（实际为 `src/core`），Service 只一套，Repository 接口一套，Electron/Web 各实现一套。禁止 Controller/IPC 直接写 SQL。
2. **扩展现有 IVectorStore**：不另起向量库，在现有抽象上加元数据过滤（破坏性变更需双端同步）。
3. **图数据用关系型表建模**：项目用 SQLite/PostgreSQL，不引入图数据库；用「节点表（复用现有 lw_* 实体）+ 通用边表」表达图。
4. **时间字段统一 `datetime`**（SQLite/PostgreSQL 双端兼容，epoch ms 存储）。
5. **严禁字段映射/重命名**：Entity 字段名 = 数据库列名 = 前端类型字段名。
6. **Entity 用 TypeORM 类型**，自定义创建方法用 `createNew`，继承 BaseEntity 约定（id/createdAt/updatedAt/deletedAt/userId）。
7. **API 只新增不破坏**；必须修改时双端同步。
8. **TDD**：core 层逻辑先写测试。

---

## 3. 总体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         渲染进程 (Vue3)                          │
│  StoryEditor + 上下文预览面板 + 故事图谱视图 + 时间线 + 快照面板  │
│                     longwriting Pinia store                      │
└──────────────────────────────┬──────────────────────────────────┘
                               │ IPC (window.electronAPI.longwriting.*)
┌──────────────────────────────┴──────────────────────────────────┐
│                    Electron IPC Handler 层                       │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────┴──────────────────────────────────┐
│                        Core Service 层                          │
│                                                                  │
│  ┌─────────────────┐  ┌──────────────────┐  ┌────────────────┐  │
│  │ ContextBuilder  │←─│ LwVectorIndex    │  │ StoryGraph     │  │
│  │ 智能上下文构建器 │  │ Service 向量索引 │  │ Service 图谱   │  │
│  └────────┬────────┘  └────────┬─────────┘  └────────┬───────┘  │
│           │                    │                     │          │
│  ┌────────┴────────┐  ┌────────┴─────────┐  ┌────────┴───────┐  │
│  │ TimelineService │  │ Extraction       │  │ Snapshot       │  │
│  │ 时间线引擎      │  │ Pipeline 正文提取│  │ Service 快照   │  │
│  └─────────────────┘  └──────────────────┘  └────────────────┘  │
│           │                    │                     │          │
└───────────┼────────────────────┼─────────────────────┼──────────┘
            │                    │                     │
┌───────────┴────────────────────┴─────────────────────┴──────────┐
│                    IRepository 接口 + 实现                       │
│  lw_* Repository (SQLite)  │  IVectorStore (LanceDB/pgvector)   │
└─────────────────────────────────────────────────────────────────┘
```

**与现有模块关系**：
- 复用 `LongWritingService`（扩展，不重写）、`LongWritingAIService`（重构 generateChapter 的上下文构建部分）
- 复用 `IVectorStore`、`getEmbeddingVectors`、`HybridSplitter`
- 新增 service 放 `src/core/services/longwriting/` 子目录

---

## 4. 数据模型设计

### 4.1 新增 Entity（均放 `src/core/database/entities/`，前缀 `lw-`）

#### 4.1.1 `lw-graph-edge.entity.ts` — 通用图边表

统一表达实体间关系，弥补 CharacterRelation 仅覆盖角色-角色的不足。

```typescript
@Entity({ name: 'lw_graph_edges' })
@Index('idx_lw_graph_edge_project', ['projectId'])
@Index('idx_lw_graph_edge_src', ['srcEntityType', 'srcEntityId'])
@Index('idx_lw_graph_edge_dst', ['dstEntityType', 'dstEntityId'])
@Unique('uq_lw_graph_edge', ['projectId', 'srcEntityType', 'srcEntityId', 'dstEntityType', 'dstEntityId', 'edgeType'])
export class LwGraphEdgeEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' }) id!: string
  @Index() @Column({ name: 'user_id', type: 'varchar', nullable: true }) userId!: string | null
  @Column({ name: 'project_id', type: 'varchar' }) projectId!: string
  // 源节点
  @Column({ name: 'src_entity_type', type: 'text' }) srcEntityType!: LwGraphNodeType  // character/location/item/faction/skill/plot/outline/event
  @Column({ name: 'src_entity_id', type: 'varchar' }) srcEntityId!: string
  // 目标节点
  @Column({ name: 'dst_entity_type', type: 'text' }) dstEntityType!: LwGraphNodeType
  @Column({ name: 'dst_entity_id', type: 'varchar' }) dstEntityId!: string
  // 边类型
  @Column({ name: 'edge_type', type: 'text' }) edgeType!: LwGraphEdgeType
  // 见 4.1.1.edgeType 枚举
  @Column({ name: 'edge_label', type: 'text', nullable: true }) edgeLabel!: string | null  // 关系具体描述，如"师徒"
  @Column({ name: 'strength', type: 'integer', default: 50, nullable: true }) strength!: number | null  // 0-100 关系强度
  @Column({ name: 'status', type: 'text', default: 'active' }) status!: 'active' | 'broken' | 'dormant'
  @Column({ name: 'established_chapter', type: 'integer', nullable: true }) establishedChapter!: number | null  // 建立章节
  @Column({ name: 'ended_chapter', type: 'integer', nullable: true }) endedChapter!: number | null  // 结束章节
  @Column({ name: 'metadata', type: 'simple-json', nullable: true }) metadata!: Record<string, unknown> | null
  @Column({ name: 'created_at', type: Date }) createdAt!: Date
  @Column({ name: 'updated_at', type: Date }) updatedAt!: Date
}

export type LwGraphNodeType = 'character' | 'location' | 'item' | 'faction' | 'skill' | 'plot' | 'outline' | 'event' | 'foreshadow'
export type LwGraphEdgeType =
  | 'related_to'      // 通用关联
  | 'owns'            // 持有（角色-物品）
  | 'knows'           // 认识/掌握（角色-技能）
  | 'located_at'      // 位于（角色/物品-地点）
  | 'belongs_to'      // 归属（角色/地点-势力）
  | 'participates'    // 参与（角色/地点/物品-情节/事件）
  | 'conflicts'       // 冲突
  | 'allied'          // 结盟
  | 'family'          // 亲属
  | 'mentor'          // 师徒
  | 'lover'           // 情感
  | 'foreshadows'     // 伏笔指向
  | 'resolves'        // 回收（事件-伏笔）
  | 'causes'          // 因果（事件-事件）
  | 'targets'         // 针对性（如反派针对主角）
```

#### 4.1.2 `lw-timeline-event.entity.ts` — 结构化时间线事件

替代 ChapterStateSummary 中纯文本 storyTime。

```typescript
@Entity({ name: 'lw_timeline_events' })
@Index('idx_lw_timeline_project', ['projectId'])
@Index('idx_lw_timeline_chapter', ['projectId', 'chapterNumber'])
@Index('idx_lw_timeline_sort', ['projectId', 'storyTimeEpoch'])
export class LwTimelineEventEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' }) id!: string
  @Index() @Column({ name: 'user_id', type: 'varchar', nullable: true }) userId!: string | null
  @Column({ name: 'project_id', type: 'varchar' }) projectId!: string
  @Column({ name: 'source_outline_id', type: 'varchar', nullable: true }) sourceOutlineId!: string | null  // 来源章节大纲
  @Column({ name: 'chapter_number', type: 'integer' }) chapterNumber!: number
  // 结构化故事内时间（可部分填充）
  @Column({ name: 'time_era', type: 'text', nullable: true }) timeEra!: string | null  // 纪元，如"第一年"
  @Column({ name: 'time_year', type: 'integer', nullable: true }) timeYear!: number | null
  @Column({ name: 'time_month', type: 'integer', nullable: true }) timeMonth!: number | null
  @Column({ name: 'time_day', type: 'integer', nullable: true }) timeDay!: number | null
  @Column({ name: 'time_period', type: 'text', nullable: true }) timePeriod!: string | null  // 晨/午/暮/夜
  @Column({ name: 'story_time_epoch', type: 'integer', nullable: true }) storyTimeEpoch!: number | null  // 归一化排序值（由结构化字段计算）
  @Column({ name: 'story_time_text', type: 'text', nullable: true }) storyTimeText!: string | null  // 原始文本，如"第一年春三月十五日傍晚"
  @Column({ name: 'event_title', type: 'text' }) eventTitle!: string
  @Column({ name: 'event_summary', type: 'text' }) eventSummary!: string
  @Column({ name: 'involved_entities', type: 'simple-json', nullable: true }) involvedEntities!: LwGraphEntityRef[] | null
  @Column({ name: 'importance', type: 'text', default: 'normal' }) importance!: 'critical' | 'normal' | 'minor'
  @Column({ name: 'order_index', type: 'integer', default: 0 }) orderIndex!: number  // 同章节内顺序
  @Column({ name: 'created_at', type: Date }) createdAt!: Date
  @Column({ name: 'updated_at', type: Date }) updatedAt!: Date
}

export interface LwGraphEntityRef { type: LwGraphNodeType; id: string; name: string }
```

#### 4.1.3 `lw-foreshadow.entity.ts` — 伏笔追踪

```typescript
@Entity({ name: 'lw_foreshadows' })
@Index('idx_lw_foreshadow_project', ['projectId'])
@Index('idx_lw_foreshadow_status', ['projectId', 'status'])
export class LwForeshadowEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' }) id!: string
  @Index() @Column({ name: 'user_id', type: 'varchar', nullable: true }) userId!: string | null
  @Column({ name: 'project_id', type: 'varchar' }) projectId!: string
  @Column({ name: 'title', type: 'text' }) title!: string
  @Column({ name: 'description', type: 'text' }) description!: string
  @Column({ name: 'planted_chapter', type: 'integer', nullable: true }) plantedChapter!: number | null  // 埋下章节
  @Column({ name: 'planted_outline_id', type: 'varchar', nullable: true }) plantedOutlineId!: string | null
  @Column({ name: 'expected_payoff_chapter', type: 'integer', nullable: true }) expectedPayoffChapter!: number | null  // 预期回收章节
  @Column({ name: 'resolved_chapter', type: 'integer', nullable: true }) resolvedChapter!: number | null  // 实际回收章节
  @Column({ name: 'resolved_outline_id', type: 'varchar', nullable: true }) resolvedOutlineId!: string | null
  @Column({ name: 'status', type: 'text', default: 'open' }) status!: 'open' | 'resolved' | 'abandoned'
  @Column({ name: 'priority', type: 'text', default: 'normal' }) priority!: 'critical' | 'normal' | 'minor'
  @Column({ name: 'involved_entities', type: 'simple-json', nullable: true }) involvedEntities!: LwGraphEntityRef[] | null
  @Column({ name: 'created_at', type: Date }) createdAt!: Date
  @Column({ name: 'updated_at', type: Date }) updatedAt!: Date
}
```

#### 4.1.4 `lw-story-snapshot.entity.ts` — 故事进展快照

```typescript
@Entity({ name: 'lw_story_snapshots' })
@Index('idx_lw_snapshot_project_chapter', ['projectId', 'chapterNumber'])
export class LwStorySnapshotEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' }) id!: string
  @Index() @Column({ name: 'user_id', type: 'varchar', nullable: true }) userId!: string | null
  @Column({ name: 'project_id', type: 'varchar' }) projectId!: string
  @Column({ name: 'chapter_number', type: 'integer' }) chapterNumber!: number  // 截至该章结束
  @Column({ name: 'overall_summary', type: 'text' }) overallSummary!: string  // 全局故事进展摘要
  @Column({ name: 'character_states', type: 'simple-json', nullable: true }) characterStates!: Array<{ id: string; name: string; state: string; location: string; alive: boolean }> | null
  @Column({ name: 'active_relationships', type: 'simple-json', nullable: true }) activeRelationships!: Array<{ from: string; to: string; type: string; strength: number }> | null
  @Column({ name: 'open_foreshadows', type: 'simple-json', nullable: true }) openForeshadows!: string[] | null  // 未回收伏笔 id 列表
  @Column({ name: 'world_state', type: 'text', nullable: true }) worldState!: string | null  // 势力/世界状态
  @Column({ name: 'current_story_time', type: 'text', nullable: true }) currentStoryTime!: string | null
  @Column({ name: 'current_location', type: 'text', nullable: true }) currentLocation!: string | null
  @Column({ name: 'next_leads', type: 'text', nullable: true }) nextLeads!: string | null  // 下一步可发展的线索
  @Column({ name: 'created_at', type: Date }) createdAt!: Date
  @Column({ name: 'updated_at', type: Date }) updatedAt!: Date
}
```

#### 4.1.5 `lw-vector-index.entity.ts` — 长文向量索引元数据表

记录长文模块入库到 IVectorStore 的向量元信息（向量本身在 LanceDB/pgvector，此表做索引管理）。

```typescript
@Entity({ name: 'lw_vector_indices' })
@Index('idx_lw_vector_project', ['projectId'])
@Index('idx_lw_vector_entity', ['projectId', 'entityType', 'entityId'])
@Unique('uq_lw_vector_chunk', ['chunkId'])
export class LwVectorIndexEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' }) id!: string
  @Index() @Column({ name: 'user_id', type: 'varchar', nullable: true }) userId!: string | null
  @Column({ name: 'project_id', type: 'varchar' }) projectId!: string
  @Column({ name: 'entity_type', type: 'text' }) entityType!: 'character' | 'location' | 'item' | 'faction' | 'skill' | 'plot' | 'outline' | 'chapter' | 'memory' | 'event'
  @Column({ name: 'entity_id', type: 'varchar' }) entityId!: string
  @Column({ name: 'chapter_number', type: 'integer', nullable: true }) chapterNumber!: number | null  // 章节切片用
  @Column({ name: 'chunk_id', type: 'varchar' }) chunkId!: string  // 对应 IVectorStore 的 chunkId
  @Column({ name: 'content_hash', type: 'text', nullable: true }) contentHash!: string | null  // 用于增量更新判断
  @Column({ name: 'created_at', type: Date }) createdAt!: Date
  @Column({ name: 'updated_at', type: Date }) updatedAt!: Date
}
```

### 4.2 现有 Entity 扩展

#### 4.2.1 `lw-character-relation.entity.ts` 扩展
增加字段（migration ALTER）：
- `strength` integer default 50
- `status` text default 'active'
- `established_chapter` integer nullable
- `ended_chapter` integer nullable
- `evolution` simple-json nullable（演变历史数组）

> 注：CharacterRelation 保留为角色-角色专用（语义更明确）；通用跨实体关系走 lw_graph_edges。两者并存，CharacterRelation 的记录同步镜像到 graph_edges（或查询时 union）。

#### 4.2.2 `lw-chapter-state-summary.entity.ts` 扩展
- 增加 `timeline_event_ids` simple-json nullable（关联的时间线事件）
- `story_time` 保留文本兼容，新增 `story_time_epoch` integer nullable（归一化排序值）

### 4.3 Entity 注册
在 `src/core/database/entities/index.ts` 导出新增 entity，加入对应 `*_ENTITIES` 数组。

---

## 5. 向量索引层设计（扩展现有 IVectorStore）

### 5.1 接口扩展（`src/core/services/vector/vector-store.interface.ts`）

```typescript
export interface VectorMetadataFilter {
  projectId?: string
  entityType?: string
  entityId?: string
  chapterNumber?: number          // 精确匹配
  chapterNumberLte?: number       // <= 某章（检索历史）
}

export interface VectorSearchOptions {
  knowledgeBaseId?: string        // 旧参数，保留兼容
  filter?: VectorMetadataFilter   // 新参数
  topK?: number
  scoreThreshold?: number
}

export interface VectorRecord {
  id: string
  chunkId: string
  knowledgeBaseId?: string
  vector: number[]
  // 新增元数据字段
  projectId?: string
  entityType?: string
  entityId?: string
  chapterNumber?: number
  createdAt: number
}

export interface IVectorStore {
  insert(record: Omit<VectorRecord, 'id' | 'createdAt'>): Promise<string>
  insertBatch(records: Array<Omit<VectorRecord, 'id' | 'createdAt'>>): Promise<string[]>
  getByChunkId(chunkId: string): Promise<VectorRecord | null>
  searchSimilar(queryVector: number[], opts: VectorSearchOptions): Promise<VectorSearchResult[]>
  deleteByChunkId(chunkId: string): Promise<boolean>
  deleteByChunkIds(chunkIds: string[]): Promise<boolean>
  deleteByFilter(filter: VectorMetadataFilter): Promise<number>  // 新增：按元数据批量删
  deleteByKnowledgeBaseId(knowledgeBaseId: string): Promise<boolean>  // 保留兼容
  countByFilter(filter: VectorMetadataFilter): Promise<number>  // 新增
}
```

> **破坏性变更**：searchSimilar 签名从 `(knowledgeBaseId, queryVector, topK, opts?)` 改为 `(queryVector, opts)`。需同步更新所有调用方（knowledge-base 模块 + 新增长文模块）。向后兼容：opts.knowledgeBaseId 仍生效。

### 5.2 LanceDB schema 扩展（`src/core/services/lance-db.service.ts`）

- vectors 表 schema 增加 `projectId`/`entityType`/`entityId`/`chapterNumber` 列（均 nullable，兼容旧知识库数据）
- `searchSimilar` 实现：根据 opts.filter 构造 `.where()` 条件链（`projectId = '...' AND entityType = '...' AND chapterNumber <= N`）
- **迁移**：LanceDB 表 schema 变更需重建。策略：
  1. 启动时检测旧 schema（无 projectId 列）
  2. 创建新表 `vectors_v2`，迁移旧数据（projectId/entityType 留空）
  3. 重命名替换
  - 旧知识库数据 projectId 为空，长文检索用 `projectId = 'xxx'` 过滤天然隔离，互不影响。

### 5.3 pgvector 实现（`src/core/services/vector/pg-vector-store.ts`）
- 对应表 ALTER 加列、查询加 WHERE 条件。

### 5.4 LwVectorIndexService（`src/core/services/longwriting/lw-vector-index.service.ts`）

```typescript
export class LwVectorIndexService {
  // 设定入库：角色/地点/物品/情节/大纲序列化为文本 -> embedding -> insert
  async indexEntity(projectId: string, entityType: LwIndexedEntityType, entityId: string): Promise<void>
  // 章节切片入库
  async indexChapter(projectId: string, outlineId: string, chapterNumber: number, content: string): Promise<void>
  // 记忆/事件入库
  async indexMemory(projectId: string, memoryId: string): Promise<void>
  // 语义检索：返回命中的实体/章节/记忆 + 分数
  async search(projectId: string, query: string, opts: { entityType?: string; chapterNumberLte?: number; topK?: number }): Promise<LwVectorSearchResult[]>
  // 增量更新：内容 hash 变化才重新 embedding
  async upsertEntity(projectId: string, entityType: LwIndexedEntityType, entityId: string): Promise<void>
  // 删除项目的所有向量
  async deleteByProject(projectId: string): Promise<void>
  // 删除某章节向量（章节重写时）
  async deleteByChapter(projectId: string, chapterNumber: number): Promise<void>
}
```

**序列化策略**（设定 -> 文本）：
- 角色：`姓名 + 定位 + 外貌 + 性格 + 背景 + 能力 + 主要事件 + 当前状态`
- 地点：`名称 + 类型 + 描述 + 重要程度`
- 情节：`标题 + 概要 + 涉及角色`
- 大纲节点：`层级 + 名称 + 概要 + 涉及实体`
- 章节：按 HybridSplitter 切片（复用现有），每片带 chapterNumber 元数据

**embedding**：复用 `getEmbeddingVectors`，维度由项目 embeddingConfig 决定（当前 1024）。

---

## 6. 智能上下文构建器（ContextBuilder）— 写作质量核心

`src/core/services/longwriting/context-builder.service.ts`

### 6.1 接口

```typescript
export interface ContextBuildInput {
  projectId: string
  outlineId: string
  targetWords?: number
  userExtraPrompt?: string  // 用户附加提示
  forcedContext?: ForcedContextItem[]  // 用户在预览面板强制注入/排除的项
}

export interface ContextBuildOutput {
  systemPrompt: string
  userPrompt: string
  maxTokens: number
  contextManifest: ContextManifest  // 上下文清单，供前端展示与编辑
}

export interface ContextManifest {
  sections: Array<{
    key: string  // 'storyOverview' | 'characters' | 'locations' | 'memory' | 'entityState' | 'previousChapter' | 'timeline' | 'foreshadow' | 'prewrite'
    title: string
    items: Array<{ id: string; type: string; summary: string; source: 'vector' | 'graph' | 'timeline' | 'manual'; score?: number; included: boolean; editable: boolean }>
    tokenEstimate: number
  }>
  totalTokenEstimate: number
  budgetAllocation: Record<string, number>  // 各分区 token 预算
}
```

### 6.2 构建流程

```
输入: outlineId + projectId
  │
  1. 加载基础: 大纲节点 / 故事概要 / 背景 / 涉及实体(大纲标记)
  │
  2. 语义检索 (LwVectorIndexService.search)
     - query = 大纲 summary + 章节名 + 用户附加提示
     - 过滤: projectId, chapterNumberLte = 当前章-1 (不检索未写章节)
     - topK: 角色5/地点3/情节5/章节片段8/记忆8
     -> 得到相关实体/记忆/历史片段 (带 score)
  │
  3. 图扩展 (StoryGraphService)
     - 从涉及实体出发, 1-2 跳邻居
     - 取邻居当前状态 (EntityStateSnapshot @ chapterNumber-1)
     -> 补全关联角色/物品/地点状态
  │
  4. 时间线对齐 (TimelineService)
     - 取当前章节前最近 N 个时间线事件
     - 取当前故事时间点 (上一章 storyTimeEpoch)
  │
  5. 伏笔检查 (ForeshadowService)
     - 检索 status='open' 且预期回收章节 <= 当前章 的伏笔
     - 提示"本章可回收的伏笔"
  │
  6. 前文衔接
     - 上一章结尾 (按段落截取, 字数动态 = min(targetWords*0.15, 800))
     - 上一章章节状态摘要
  │
  7. token 预算分配 (见 6.3)
  │
  8. 结构化输出
     - systemPrompt: 写作原则 + 禁忌 (已死亡角色不再出现 等)
     - userPrompt: 分区拼接 (一、宏观背景 二、当前任务 三、角色 四、场景 五、前文衔接 六、记忆 七、实体状态 八、时间线 九、伏笔提示 十、预写)
     - contextManifest: 清单
  │
  9. 应用 forcedContext (用户在预览面板的勾选/排除)
     - 重新计算 token, 必要时压缩低优先级分区
```

### 6.3 token 预算策略

模型上下文窗口假设 32K（可配）。预留：生成 token = `min(targetWords*2, 16000)`（放开到 16K，解决旧 8192 截断问题）。剩余给上下文 ≈ 16K。

优先级（高->低，低优先级在超预算时先压缩/丢弃）：
1. 当前章节任务（大纲名+概要+目标字数）— 必留
2. 涉及角色完整信息 + 当前状态 — 必留
3. 上一章结尾 + 章节状态摘要 — 必留
4. 核心冲突 + 故事概要 — 必留
5. 待回收伏笔提示 — 高
6. 关键记忆（critical）— 高
7. 涉及场景环境 — 中
8. 相关记忆（vector 检索，normal）— 中
9. 时间线事件 — 中
10. 背景设定 — 低（超预算时摘要）
11. 次要记忆（minor）— 低（超预算先丢）

### 6.4 集成到 LongWritingAIService.generateChapter

重构 `generateChapter`（`longwriting-ai.service.ts:1201`）：
- 删除现有手工拼接的 prompt（`:1361-1413`）
- 改为调用 `ContextBuilder.build(input)`
- maxTokens 改为 `Math.min((targetWords || 3000) * 2, 16000)`
- 生成前通过事件发送 `contextManifest` 给前端预览（可选：先生成预览，用户确认后再正式生成）

---

## 7. 从正文自动提取流水线（ExtractionPipeline）

`src/core/services/longwriting/extraction-pipeline.service.ts`

### 7.1 触发时机
- 章节正文保存后（手动保存 + 自动保存防抖触发后）
- AI 生成完成并保存后
- 替代当前"手动点提取状态按钮"（按钮保留作为手动重提入口）

### 7.2 流水线

```
章节正文保存
  │
  ├─ 1. extractMemories (输入改为 chapterContent, 非 prewrite)
  ├─ 2. extractEntityStates (输入 chapterContent + involvedEntities)
  ├─ 3. extractChapterStateSummary (输入 chapterContent)
  ├─ 4. [新] extractTimelineEvents (结构化时间线事件)
  ├─ 5. [新] extractForeshadows (识别埋下/回收的伏笔)
  ├─ 6. [新] extractGraphEdges (识别实体关系, 写入 lw_graph_edges)
  ├─ 7. [新] LwVectorIndexService.indexChapter + upsertEntity (向量入库)
  └─ 8. [新] StorySnapshotService.generateSnapshot (生成进展快照)
  │
  └─ 全部结果通过事件 longwriting:extraction:<eventId> 流式反馈前端
```

### 7.3 幂等与重试
- 每个提取步骤基于 (outlineId, chapterNumber) 幂等：重提时先删旧再写新
- `deleteEntityStatesByChapter` 已有；新增 `deleteTimelineByChapter`/`deleteGraphEdgesByChapter`/`deleteSnapshotByChapter`
- 单步失败不影响其他步骤（try-catch 隔离），失败记录到 lw_chapter_state_summary.errorMessage 或新日志表

### 7.4 提取 prompt 优化
- 现有 extractMemories 等 prompt 复用，输入参数从 prewriteContent 改为 chapterContent
- 新增 extractTimelineEvents / extractForeshadows / extractGraphEdges 的 system prompt（见附录 A）

---

## 8. StoryGraphService — 故事知识图谱

`src/core/services/longwriting/story-graph.service.ts`

```typescript
export class StoryGraphService {
  async addEdge(data: CreateGraphEdgeInput): Promise<LwGraphEdge>
  async updateEdge(id: string, data: Partial<LwGraphEdge>): Promise<LwGraphEdge | null>
  async deleteEdge(id: string): Promise<boolean>
  async getEdgesByEntity(projectId: string, entityType: LwGraphNodeType, entityId: string, opts?: { hop?: number; edgeTypes?: LwGraphEdgeType[] }): Promise<LwGraphEdge[]>
  async getNeighbors(projectId: string, entityType: LwGraphNodeType, entityId: string, hop: 1 | 2): Promise<LwGraphNode[]>  // 图遍历
  async getFullGraph(projectId: string, opts?: { chapterNumber?: number }): Promise<GraphData>  // 前端可视化用 { nodes, edges }
  async getRelationshipAtChapter(projectId: string, charAId: string, charBId: string, chapterNumber: number): Promise<LwGraphEdge | null>  // 查某章时关系
}
```

**图遍历**：1 跳 = 直接邻居；2 跳 = 邻居的邻居。用 SQL 递归 CTE（PostgreSQL）或应用层两步查询（SQLite 兼容）实现。`status='broken'` 且 `endedChapter <= chapterNumber` 的边在指定章节视图下排除。

---

## 9. TimelineService — 时间线引擎

`src/core/services/longwriting/timeline.service.ts`

```typescript
export class TimelineService {
  async createEvent(data: CreateTimelineEventInput): Promise<LwTimelineEvent>
  async updateEvent(id: string, data: Partial<LwTimelineEvent>): Promise<LwTimelineEvent | null>
  async deleteEvent(id: string): Promise<boolean>
  async deleteByChapter(projectId: string, chapterNumber: number): Promise<number>
  async getEventsByProject(projectId: string, opts?: { chapterLte?: number }): Promise<LwTimelineEvent[]>  // 按 storyTimeEpoch 排序
  async getEventsByChapter(projectId: string, chapterNumber: number): Promise<LwTimelineEvent[]>
  async detectTimeConflicts(projectId: string): Promise<TimeConflict[]>  // 时间冲突检测（同章节事件时间矛盾）
  // 结构化 storyTime 文本 -> 各字段 + epoch
  parseStoryTime(text: string): { era?: string; year?: number; month?: number; day?: number; period?: string; epoch?: number }
}
```

**storyTimeEpoch 计算**：归一化为可比较整数（如 `year*10000 + month*100 + day`，period 映射 0-3）。支持"第一年"纪元转 year。

---

## 10. SnapshotService — 故事进展快照

`src/core/services/longwriting/snapshot.service.ts`

```typescript
export class SnapshotService {
  async generateSnapshot(projectId: string, chapterNumber: number): Promise<LwStorySnapshot>  // AI 聚合生成
  async getSnapshot(projectId: string, chapterNumber: number): Promise<LwStorySnapshot | null>
  async getLatestSnapshot(projectId: string): Promise<LwStorySnapshot | null>  // 写下一章时用
  async getSnapshotDiff(projectId: string, fromChapter: number, toChapter: number): Promise<SnapshotDiff>  // 两个快照差异
}
```

**生成逻辑**：聚合 `EntityStateSnapshot`(全部角色) + `ChapterStateSummary` + `openForeshadows` + `activeRelationships`，AI 总结为 overallSummary + nextLeads。

---

## 11. Service / Repository / IPC 设计

### 11.1 新增 Repository（`src/core/database/repositories/`）
- `lw-graph-edge.repository.ts` -> `LwGraphEdgeRepository`
- `lw-timeline-event.repository.ts` -> `LwTimelineEventRepository`
- `lw-foreshadow.repository.ts` -> `LwForeshadowRepository`
- `lw-story-snapshot.repository.ts` -> `LwStorySnapshotRepository`
- `lw-vector-index.repository.ts` -> `LwVectorIndexRepository`

### 11.2 database-manager.interface.ts 扩展（133-153 行区域新增）
```typescript
lwGraphEdges: LwGraphEdgeRepository | null
lwTimelineEvents: LwTimelineEventRepository | null
lwForeshadows: LwForeshadowRepository | null
lwStorySnapshots: LwStorySnapshotRepository | null
lwVectorIndices: LwVectorIndexRepository | null
```

### 11.3 新增 Service（`src/core/services/longwriting/`）
- `context-builder.service.ts`
- `extraction-pipeline.service.ts`
- `story-graph.service.ts`
- `timeline.service.ts`
- `snapshot.service.ts`
- `lw-vector-index.service.ts`
- `foreshadow.service.ts`

均单例，导出 `getXxxService()`。在 `LongWritingService` 中组合调用，或 IPC 直接调用。

### 11.4 IPC 通道（`src/electron/ipc/handlers/longwriting.handler.ts` + preload）
新增命名空间 `window.electronAPI.longwriting.*`：
- `graph:getFullGraph` / `graph:getNeighbors` / `graph:addEdge` / `graph:updateEdge` / `graph:deleteEdge`
- `timeline:list` / `timeline:create` / `timeline:update` / `timeline:delete` / `timeline:detectConflicts`
- `foreshadow:list` / `foreshadow:create` / `foreshadow:resolve` / `foreshadow:abandon`
- `snapshot:get` / `snapshot:getLatest` / `snapshot:generate` / `snapshot:diff`
- `context:buildPreview`（生成上下文清单供前端预览，不调用 AI 写作）
- `extraction:run`（手动触发提取流水线）
- `vectorIndex:rebuild`（重建项目向量索引）

**Web 端同步**：`packages/web-server/src/modules/` 新增对应 controller，调用同一 Core Service。

---

## 12. 前端设计

### 12.1 Pinia store（`src/renderer/src/stores/longwriting.ts`）— 新建
集中管理：当前项目、大纲树、章节内容、角色/地点/物品列表、记忆统计、快照统计、图谱数据、时间线、上下文清单。替代组件内分散 ref。

### 12.2 上下文预览/编辑面板（核心体验）
- 章节写作 Tab 新增"上下文"侧栏
- 生成前点"预览上下文" -> 调 `context:buildPreview` -> 展示 contextManifest
- 分区展示（角色/记忆/状态/前文/伏笔...），每项可勾选/取消/编辑
- 用户调整后点"生成"，forcedContext 传入 `context:buildPreview` -> `generateChapter`
- 显示各分区 token 占用

### 12.3 故事图谱可视化
- "设定集"按钮（当前空的 el-empty）-> 图谱视图
- 组件：`components/longwriting/story/StoryGraphView.vue`
- 用 ECharts Graph 或 Cytoscape.js（二选一，倾向 ECharts 减少依赖）
- 节点按 entityType 着色，边按 edgeType 样式，可点击节点查看详情
- 支持按章节过滤（查"第 N 章时的关系网"）

### 12.4 时间线视图
- 组件：`components/longwriting/story/TimelineView.vue`
- 横向时间轴，事件按 storyTimeEpoch 排列
- 标注伏笔回收点、关键事件
- 时间冲突高亮

### 12.5 进展快照面板
- 组件：`components/longwriting/story/SnapshotPanel.vue`
- 显示截至当前章节的角色状态卡、关系网现状、未回收伏笔列表、下一步线索

---

## 13. 数据库迁移

迁移脚本放 `src/main/database/migrations/`（按现有 chunks 模式），命名：
- `add-lw-graph-edges.ts` — 建 lw_graph_edges 表
- `add-lw-timeline-events.ts` — 建 lw_timeline_events 表
- `add-lw-foreshadows.ts` — 建 lw_foreshadows 表
- `add-lw-story-snapshots.ts` — 建 lw_story_snapshots 表
- `add-lw-vector-indices.ts` — 建 lw_vector_indices 表
- `extend-lw-character-relation.ts` — ALTER character_relations 加 strength/status/established_chapter/ended_chapter/evolution
- `extend-lw-chapter-state-summary.ts` — ALTER chapter_state_summaries 加 timeline_event_ids/story_time_epoch

向量库迁移（LanceDB）由 LwVectorIndexService 启动时检测处理。

---

## 14. 双端兼容

- 所有新 Entity 字段类型选 SQLite/PostgreSQL 通用类型（text/integer/simple-json/datetime）
- 向量库：PC 用 LanceDB，Web 用 pgvector，均实现扩展后的 IVectorStore
- Service 在 core 层，两端共用
- IPC 通道与 Web controller 路由一一对应

---

## 15. 实施分期与里程碑

### 第一期 MVP（写作质量立竿见影，约 2-3 周）
- [ ] 5.1-5.4 向量索引层（IVectorStore 扩展 + LwVectorIndexService + LanceDB 迁移）
- [ ] 6 ContextBuilder（含 token 预算）
- [ ] 7 ExtractionPipeline（从正文提取 + 向量入库）
- [ ] 12.1 Pinia store
- [ ] 12.2 上下文预览/编辑面板
- [ ] generateChapter 重构集成
- **验收**：第 30 章生成时上下文不再截断丢失，用户可预览编辑上下文

### 第二期（图谱与时间线，约 2-3 周）
- [ ] 4.1.1 lw_graph_edges + 8 StoryGraphService
- [ ] 4.1.2 lw_timeline_events + 9 TimelineService
- [ ] 4.2.1 CharacterRelation 扩展
- [ ] 12.3 故事图谱可视化
- [ ] 12.4 时间线视图
- **验收**：可查看角色关系图（按章节过滤）、结构化时间线

### 第三期（快照与一致性，约 2 周）
- [ ] 4.1.3 lw_foreshadows + ForeshadowService
- [ ] 4.1.4 lw_story_snapshots + 10 SnapshotService
- [ ] 12.5 进展快照面板
- [ ] 一致性校验（时间冲突、伏笔遗漏、设定矛盾）
- **验收**：伏笔可追踪回收，快照可查看，一致性检测可用

---

## 16. 风险与对策

| 风险 | 影响 | 对策 |
|------|------|------|
| IVectorStore 签名变更破坏现有知识库 | 高 | opts.knowledgeBaseId 向后兼容；LanceDB 旧数据 projectId 留空，长文检索天然隔离 |
| LanceDB 重建表数据丢失 | 高 | 迁移脚本先备份再建 v2 表迁移，启动时检测 |
| 提取流水线耗时长（多次 AI 调用） | 中 | 异步并行可并行的步骤；用户可配置开关哪些步骤自动跑 |
| token 预算超模型窗口 | 中 | ContextBuilder 严格按预算压缩；模型窗口可配 |
| 图遍历性能（大图谱 2 跳） | 中 | 限制 hop<=2；加索引；前端懒加载 |
| 旧项目无向量索引 | 低 | 首次打开项目提示"构建索引"，后台批量入库 |

---

## 17. 验收标准

1. 写第 30 章：上下文清单包含按相关性检索的记忆/设定，无关键信息截断
2. 上下文预览面板：可查看、勾选、编辑注入项
3. 角色死亡后后续章节不再出现（实体状态注入生效）
4. 伏笔埋下后能在指定章节提示回收
5. 时间线事件按故事内时间排序，冲突可检测
6. 图谱视图可按章节过滤查看关系网
7. 进展快照可查看截至任一章的全局状态
8. 双端（Electron/Web）行为一致

---

## 18. 开放问题

1. 模型上下文窗口与 maxTokens 上限：是否统一可配（per-project/per-stage）？— 倾向是，复用现有 StageModelConfig 扩展。
2. 图谱可视化库选型：ECharts vs Cytoscape.js？— 待技术验证后定（ECharts 优先，项目可能已依赖）。
3. CharacterRelation 与 graph_edges 是否合并为一张表？— 倾向保留 CharacterRelation 专表 + 同步镜像，避免大迁移。
4. 提取流水线是否全部自动跑，还是用户可配置？— 倾向 per-project 配置开关。
5. 向量索引的 embedding 模型与知识库是否共用？— 倾向共用项目 embeddingConfig。

---

## 附录 A：新增提取 prompt 提纲

### A.1 extractTimelineEvents
输入：章节正文 + 章节序号 + 上一章 storyTime
输出 JSON 数组：`[{ storyTimeText, eventTitle, eventSummary, involvedEntities, importance }]`
要求：识别章节内按时间顺序发生的事件，时间需与上一章连续。

### A.2 extractForeshadows
输入：章节正文 + 已有 open 伏笔列表
输出：`{ planted: [...], resolved: [{ foreshadowId, howResolved }] }`
要求：识别本章新埋的伏笔 + 本章回收的旧伏笔。

### A.3 extractGraphEdges
输入：章节正文 + 实体参考列表 + 上一章关系状态
输出：`[{ srcType, srcId, dstType, dstId, edgeType, edgeLabel, strength, status, changeType: 'new'|'updated'|'broken' }]`
要求：识别实体间关系的新建/变化/破裂。

---

> 本 spec 为方案设计，待评审确认后进入第一期实施计划（plan mode）。
