# RAG 知识库切分策略优化设计文档

**日期**: 2026-04-10
**状态**: ✅ 已实施完成

## 一、目标

### 优化目标

1. **实现层级混合切分策略**：
   - 检测文档是否有章节结构（Markdown 标题、小说章节、PDF 目录）
   - 有结构：先按章节切分；章节过长（>1000字符）时，内部再做段落级语义切分
   - 无结构：直接做段落级语义切分
   - 每个 chunk 保留层级信息（标题、层级、父 chunk）

2. **成本控制**：按段落切分，批量调用 Embedding API，成本降低 90%+

3. **解决当前问题**：
   - 语义割裂：一个段落被切到两个 chunk，语义不完整
   - 结构丢失：章节标题和内容分离，检索结果缺乏层级信息
   - 检索效果差：用户问"第三章讲了什么"，无法准确定位

### 范围说明

- 暂不实现知识图谱增强（成本过高）
- 暂不实现 BM25 混合检索（本次聚焦切分优化）
- 前端配置界面不在本次范围（预留 API 支持）

## 二、架构设计

### 模块结构

```
src/main/services/chunk-splitter/
├── index.ts              # 模块入口，导出 HybridSplitter
├── types.ts              # 类型定义
├── structure-detector.ts # 文档结构检测器
├── structure-splitter.ts # 结构化切分器（Markdown/章节）
├── semantic-splitter.ts  # 语义切分器（段落级）
├── chunk-merger.ts       # Chunk 合并器（处理小段落）
├── hierarchy-builder.ts  # 层级信息构建器
└── hybrid-splitter.ts    # 混合切分器（整合所有切分器）
```

### 切分策略枚举

- `hybrid`（默认）: 层级混合切分
- `structure`: 仅结构化切分
- `semantic`: 仅语义切分
- `fixed`: 固定窗口切分（兼容旧版）

### 关键流程

```
文档输入 → StructureDetector → 有结构？
  → YES: StructureSplitter（按章节） → 章节过长？（>1000字符）
    → YES: SemanticSplitter（内部段落级）
    → NO: 保持为单个 chunk
  → NO: SemanticSplitter（段落级）
→ ChunkMerger（合并小段落）
→ HierarchyBuilder（添加层级信息）
→ 输出 chunks
```

## 三、数据设计

### 数据库变更 - kb_chunks 表新增字段

```sql
ALTER TABLE kb_chunks ADD COLUMN title TEXT;
ALTER TABLE kb_chunks ADD COLUMN level INTEGER DEFAULT 1;
ALTER TABLE kb_chunks ADD COLUMN parent_chunk_id TEXT;
ALTER TABLE kb_chunks ADD COLUMN split_method TEXT;
ALTER TABLE kb_chunks ADD COLUMN section_path TEXT; -- JSON 格式存储层级路径
```

### 数据库变更 - knowledge_bases 表新增字段

```sql
ALTER TABLE knowledge_bases ADD COLUMN split_strategy TEXT DEFAULT 'hybrid';
ALTER TABLE knowledge_bases ADD COLUMN split_config TEXT; -- JSON 格式存储切分参数
```

### 类型定义扩展

```typescript
// 切分策略枚举
export type SplitStrategy = 'hybrid' | 'structure' | 'semantic' | 'fixed'

// 切分配置
export interface SplitConfig {
  strategy: SplitStrategy
  similarityThreshold?: number  // 默认 0.5
  minChunkSize?: number         // 默认 200
  maxChunkSize?: number         // 默认 1500
  structureOnly?: boolean       // 仅结构切分，不做语义切分
}

// 扩展 ChunkMetadata
export interface ChunkMetadata {
  page?: number
  section?: string
  title?: string           // 新增：章节标题
  level?: number           // 新增：层级深度
  parentChunkId?: string   // 新增：父 chunk ID
  splitMethod?: string     // 新增：切分方法
  sectionPath?: string[]   // 新增：层级路径
}

// 扩展 CreateKnowledgeBaseRequest
export interface CreateKnowledgeBaseRequest {
  // ... 原有字段
  splitConfig?: SplitConfig  // 新增：切分配置
}
```

## 四、核心组件设计

### HybridSplitter 核心逻辑

```typescript
async split(content: string, config: SplitConfig): SplitChunk[] {
  // 1. 检测结构
  const structure = await structureDetector.detect(content)

  // 2. 根据策略选择切分方式
  if (config.strategy === 'fixed') {
    return fixedSplitter.split(content)
  }

  if (structure.hasStructure) {
    // 结构化切分
    const sectionChunks = structureSplitter.split(content, structure)

    // 对过长的章节进行语义切分（>1000字符）
    const finalChunks: SplitChunk[] = []
    for (const chunk of sectionChunks) {
      if (chunk.content.length > 1000) {
        const subChunks = await semanticSplitter.split(chunk.content, config)
        // 继承父 chunk 的层级信息
        finalChunks.push(...hierarchyBuilder.build(subChunks, chunk))
      } else {
        finalChunks.push(chunk)
      }
    }
    return finalChunks
  }

  // 无结构：直接语义切分
  return await semanticSplitter.split(content, config)
}
```

### SemanticSplitter 批量调用设计

```typescript
async split(content: string, config: SplitConfig): SplitChunk[] {
  // 1. 按段落分割（约50个段落）
  const paragraphs = content.split(/\n\n+/).filter(p => p.trim())

  // 2. 批量调用 Embedding API（一次性调用全部段落）
  try {
    const embeddings = await embeddingService.getBatchEmbeddings(paragraphs)

    // 3. 计算相邻段落相似度
    // 4. 在低相似度边界切分（阈值 < 0.5）
    // 5. 合并过小的 chunk
    return chunkMerger.merge(chunks, config)
  } catch (error) {
    // API 失败：抛出错误，由上层处理
    throw new Error(`Embedding API 调用失败: ${error.message}`)
  }
}
```

### processDocument() 集成改动

```typescript
// 在 knowledge-base.service.ts 中
private async processDocument(doc: KbDocument, kb: KnowledgeBase): Promise<void> {
  // ... 现有解析逻辑 ...

  // 2. 切分（使用新策略）
  const splitConfig: SplitConfig = kb.splitConfig
    ? JSON.parse(kb.splitConfig)
    : { strategy: 'hybrid', similarityThreshold: 0.5 }

  try {
    const chunks = await hybridSplitter.split(content, splitConfig)
    // ... 存储切片 ...
  } catch (error) {
    // API 失败时标记文档失败
    db.kbDocuments.markFailed(doc.id, error.message)
    this.emitStatus(doc.id, 'failed', undefined, error.message)
    return
  }
}
```

## 五、用户确认的设计决策

1. **切分策略配置**：可配置选项，默认使用层级混合切分
2. **Embedding API 失败处理**：标记文档失败，允许用户手动重试
3. **相似度阈值默认值**：0.5

## 六、风险与应对

| 风险 | 应对措施 |
|------|----------|
| Embedding API 调用失败 | 标记文档失败，用户可手动重试 |
| 语义切分效果不佳 | 阈值可配置，用户可调整 |
| PDF 目录提取不完整 | 无目录时 fallback 到语义切分 |
| 迁移影响现有数据 | 新字段允许 NULL，向后兼容 |
| 数据库迁移失败 | **迁移前自动备份数据库** |

### 数据库备份策略

在执行数据库迁移前，系统将自动创建数据库备份：
1. 备份文件存储在用户数据目录下的 `backups/` 子目录
2. 备份文件命名格式：`kb-backup-{timestamp}.db`
3. 迁移失败时自动恢复备份
4. 用户可手动删除旧备份文件

## 七、修改文件清单

### 新增文件

| 文件 | 功能 |
|------|------|
| `src/main/services/chunk-splitter/index.ts` | 模块入口 |
| `src/main/services/chunk-splitter/types.ts` | 类型定义 |
| `src/main/services/chunk-splitter/structure-detector.ts` | 文档结构检测器 |
| `src/main/services/chunk-splitter/structure-splitter.ts` | 结构化切分器 |
| `src/main/services/chunk-splitter/semantic-splitter.ts` | 语义切分器 |
| `src/main/services/chunk-splitter/chunk-merger.ts` | Chunk 合并器 |
| `src/main/services/chunk-splitter/hierarchy-builder.ts` | 层级信息构建器 |
| `src/main/services/chunk-splitter/hybrid-splitter.ts` | 混合切分器 |

### 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/main/database/index.ts` | 添加数据库迁移 |
| `src/main/database/repositories/kb-chunk.repository.ts` | 新增字段支持 |
| `src/main/database/repositories/knowledge-base.repository.ts` | 新增字段支持 |
| `src/main/services/knowledge-base.service.ts` | 集成新切分策略 |
| `src/shared/types/knowledge-base.types.ts` | 类型扩展 |

## 八、参考资料

- `docs/webdocs/RAG优化方案讨论.md`：原始讨论
- `docs/webdocs/RAG优化技术方案.md`：详细技术方案
- `src/main/services/knowledge-base.service.ts`：现有实现
- `src/main/database/repositories/kb-chunk.repository.ts`：Chunk 存储

---

## 九、实施完成总结（2026-04-10）

### 已完成的工作

1. **基础架构**：
   - 创建 `chunk-splitter/` 目录和类型定义
   - 实现 `StructureDetector`（Markdown/小说章节检测）

2. **结构化切分器**：
   - 实现 `StructureSplitter`（按章节切分）
   - 每个 chunk 记录 title、level、parent

3. **语义切分器**：
   - 实现 `SemanticSplitter`（段落级切分）
   - 实现 `ChunkMerger`（合并小段落）
   - 批量调用 Embedding API

4. **数据库迁移**：
   - 添加 kb_chunks 表新字段
   - 添加 knowledge_bases 表新字段
   - 更新 KbChunkRepository 支持新字段

5. **集成与测试**：
   - 实现 `HierarchyBuilder`（层级信息构建）
   - 实现 `HybridSplitter`（整合所有切分器）
   - 集成到 `knowledge-base.service.ts`
   - 创建 `EmbeddingServiceAdapter` 适配器
   - 修改 `processDocument()` 方法

### 测试结果

- 单元测试：40 个测试全部通过
- 测试文件：4 个测试文件全部通过

### 关键代码变更

**knowledge-base.service.ts**：
- 新增 `EmbeddingServiceAdapter` 类
- 修改 `processDocument()` 方法使用 HybridSplitter
- `getEmbeddingVectors` 方法改为 public

**数据库迁移**：
- kb_chunks 新增字段：title, level, parent_chunk_id, split_method, section_path
- knowledge_bases 新增字段：split_strategy, split_config