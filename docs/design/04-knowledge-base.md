# 知识库模块设计文档

## 1. 模块概述

知识库模块提供文档管理和智能检索功能，为 AI 对话和内容生成提供外部知识支撑。

### 1.1 技术选型

| 组件 | 技术方案 | 说明 |
|------|----------|------|
| 向量数据库 | LanceDB | 嵌入式向量数据库，支持高效向量索引和元数据过滤 |
| 关系数据库 | SQLite | 存储知识库、文档、切片元数据 |
| Embedding | 云端 API + 本地模型 | 双模式支持 |
| 文档解析 | pdf-parse, mammoth, marked 等 | 多格式支持 |
| 全文检索 | BM25 算法 | 关键词检索 |

#### LanceDB 选型说明

**选择 LanceDB 的原因：**

1. **嵌入式架构**：类似 SQLite，无需独立服务进程，完美适配 Electron 桌面应用
2. **高性能向量索引**：内置向量索引，搜索性能远超暴力计算，支持大规模向量检索
3. **多平台支持**：支持 Windows/macOS/Linux，与 Electron 跨平台特性匹配
4. **TypeScript 原生支持**：提供 `@lancedb/lancedb` npm 包，与项目技术栈一致
5. **混合查询能力**：支持向量搜索 + 元数据过滤，满足知识库多条件检索需求
6. **活跃社区**：成熟稳定，社区活跃，文档完善

**与其他方案对比：**

| 方案 | 优点 | 缺点 | 适用性 |
|------|------|------|--------|
| LanceDB | 嵌入式、高性能、多平台、TypeScript 支持 | 相对较新 | ✅ 最佳选择 |
| Zvec | 轻量级、基于阿里 Proxima | 社区较小、功能较少 | 备选 |
| SQLite BLOB | 简单、无额外依赖 | 无索引、暴力搜索、性能差 | ❌ 不推荐 |
| FAISS | 高性能、成熟 | 需要编译原生模块、部署复杂 | ❌ 不适合桌面应用 |
| Pinecone/Weaviate | 云服务、功能强大 | 需要网络、付费 | ❌ 不适合离线应用 |

### 1.2 模块架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                           渲染进程                                   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  KnowledgeBaseView / KnowledgeBaseStore / useKnowledgeBase  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                    IPC Bridge (contextBridge)                       │
│                              │                                      │
├──────────────────────────────┼──────────────────────────────────────┤
│                              │                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                      主进程                                  │   │
│  │  ┌─────────────────────────────────────────────────────┐   │   │
│  │  │              KnowledgeBaseHandler (IPC)              │   │   │
│  │  └─────────────────────────────────────────────────────┘   │   │
│  │                              │                              │   │
│  │  ┌─────────────────────────────────────────────────────┐   │   │
│  │  │              KnowledgeBaseService                     │   │   │
│  │  │  - 知识库管理  - 文档管理  - 检索服务                  │   │   │
│  │  └─────────────────────────────────────────────────────┘   │   │
│  │          │              │              │                    │   │
│  │  ┌───────────┐   ┌───────────┐   ┌───────────┐            │   │
│  │  │  Document │   │ Embedding │   │  Retrieval│            │   │
│  │  │  Parser   │   │  Service  │   │  Service  │            │   │
│  │  └───────────┘   └───────────┘   └───────────┘            │   │
│  │          │              │              │                    │   │
│  │  ┌─────────────────────────────────────────────────────┐   │   │
│  │  │              Repository Layer                        │   │   │
│  │  │  KnowledgeBaseRepo / DocumentRepo / ChunkRepo       │   │   │
│  │  └─────────────────────────────────────────────────────┘   │   │
│  │                              │                              │   │
│  │  ┌─────────────────────────────────────────────────────┐   │   │
│  │  │         SQLite (元数据)  +  LanceDB (向量)           │   │   │
│  │  └─────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.3 数据存储架构

```
{userData}/
├── the_bot.db                    # SQLite 数据库（元数据）
├── lancedb/                      # LanceDB 向量数据库
│   └── vectors/                  # 向量表存储
│       ├── data.lance
│       └── ...
└── knowledge-base/               # 文档文件存储
    └── {knowledgeBaseId}/
        └── documents/
```

---

## 2. 数据库设计

### 2.1 知识库表 (knowledge_bases)

```sql
CREATE TABLE IF NOT EXISTS knowledge_bases (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  embedding_model TEXT NOT NULL,
  embedding_provider TEXT NOT NULL,
  embedding_dimension INTEGER NOT NULL DEFAULT 1536,
  document_count INTEGER DEFAULT 0,
  vector_count INTEGER DEFAULT 0,
  total_size INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)

CREATE INDEX IF NOT EXISTS idx_knowledge_bases_created_at ON knowledge_bases(created_at)
```

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | UUID |
| name | TEXT | 知识库名称 |
| description | TEXT | 描述 |
| embedding_model | TEXT | Embedding 模型 ID |
| embedding_provider | TEXT | 提供商类型：cloud/local |
| embedding_dimension | INTEGER | 向量维度 |
| document_count | INTEGER | 文档数量 |
| vector_count | INTEGER | 向量条数 |
| total_size | INTEGER | 总大小（字节） |

---

### 2.2 文档表 (kb_documents)

```sql
CREATE TABLE IF NOT EXISTS kb_documents (
  id TEXT PRIMARY KEY,
  knowledge_base_id TEXT NOT NULL,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  status TEXT DEFAULT 'pending',
  progress INTEGER DEFAULT 0,
  chunk_count INTEGER DEFAULT 0,
  error_message TEXT,
  metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
)

CREATE INDEX IF NOT EXISTS idx_kb_documents_knowledge_base_id ON kb_documents(knowledge_base_id)
CREATE INDEX IF NOT EXISTS idx_kb_documents_status ON kb_documents(status)
```

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | UUID |
| knowledge_base_id | TEXT | 所属知识库 ID |
| name | TEXT | 文件名 |
| file_path | TEXT | 本地存储路径 |
| file_type | TEXT | 文件类型：pdf/docx/txt/md/epub/xlsx |
| file_size | INTEGER | 文件大小（字节） |
| status | TEXT | 状态：pending/processing/completed/failed |
| progress | INTEGER | 处理进度（0-100） |
| chunk_count | INTEGER | 切片数量 |
| error_message | TEXT | 错误信息 |
| metadata | TEXT | 元数据（JSON） |

---

### 2.3 文档切片表 (kb_chunks)

```sql
CREATE TABLE IF NOT EXISTS kb_chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  knowledge_base_id TEXT NOT NULL,
  content TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  start_offset INTEGER,
  end_offset INTEGER,
  metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (document_id) REFERENCES kb_documents(id) ON DELETE CASCADE,
  FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
)

CREATE INDEX IF NOT EXISTS idx_kb_chunks_document_id ON kb_chunks(document_id)
CREATE INDEX IF NOT EXISTS idx_kb_chunks_knowledge_base_id ON kb_chunks(knowledge_base_id)
```

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | UUID |
| document_id | TEXT | 所属文档 ID |
| knowledge_base_id | TEXT | 所属知识库 ID |
| content | TEXT | 切片内容 |
| chunk_index | INTEGER | 切片序号 |
| start_offset | INTEGER | 原文起始位置 |
| end_offset | INTEGER | 原文结束位置 |
| metadata | TEXT | 元数据（JSON）：页码、章节等 |

---

### 2.4 向量存储 (LanceDB)

> **重要变更**：向量数据不再存储在 SQLite 中，改用 LanceDB 进行专业化向量存储和检索。

**LanceDB 表结构 (vectors)**

```typescript
// LanceDB 向量记录结构
interface VectorRecord {
  id: string              // 主键 (UUID)
  chunkId: string         // 关联切片 ID
  knowledgeBaseId: string // 所属知识库 ID
  vector: number[]        // 向量数据 (Float32 数组)
  createdAt: Date         // 创建时间
}
```

**LanceDB 服务 API**

```typescript
// main/services/lance-db.service.ts
export class LanceDBService {
  /**
   * 初始化数据库连接
   */
  async initialize(dataPath: string): Promise<void>

  /**
   * 创建向量表
   */
  async createTable(tableName: string): Promise<void>

  /**
   * 插入向量
   */
  async insertVectors(records: VectorRecord[]): Promise<void>

  /**
   * 向量相似度搜索
   */
  async searchSimilar(
    knowledgeBaseId: string,
    queryVector: number[],
    topK: number
  ): Promise<Array<{ chunkId: string; score: number }>>

  /**
   * 根据条件删除向量
   */
  async deleteVectors(filter: string): Promise<void>

  /**
   * 统计向量数量
   */
  async countVectors(knowledgeBaseId: string): Promise<number>

  /**
   * 关闭数据库连接
   */
  async close(): Promise<void>
}
```

**向量索引**

LanceDB 自动创建向量索引，支持：
- IVF-PQ 索引（默认）
- HNSW 索引
- 自定义索引参数

**混合查询示例**

```typescript
// 向量搜索 + 元数据过滤
const results = await table
  .search(queryVector)
  .where(`knowledgeBaseId = '${knowledgeBaseId}'`)
  .limit(topK)
  .toArray()
```

**原 SQLite 向量表 (kb_vectors) 已废弃**

~~kb_vectors 表~~ 不再使用，保留表结构仅用于数据迁移。

---

### 2.5 倒排索引表 (kb_inverted_index)

用于 BM25 关键词检索。

```sql
CREATE TABLE IF NOT EXISTS kb_inverted_index (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  term TEXT NOT NULL,
  chunk_id TEXT NOT NULL,
  knowledge_base_id TEXT NOT NULL,
  term_frequency INTEGER DEFAULT 1,
  positions TEXT,
  FOREIGN KEY (chunk_id) REFERENCES kb_chunks(id) ON DELETE CASCADE,
  FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
)

CREATE INDEX IF NOT EXISTS idx_kb_inverted_index_term ON kb_inverted_index(term)
CREATE INDEX IF NOT EXISTS idx_kb_inverted_index_chunk_id ON kb_inverted_index(chunk_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_kb_inverted_index_unique ON kb_inverted_index(term, chunk_id)
```

| 字段 | 类型 | 说明 |
|------|------|------|
| term | TEXT | 分词后的词项 |
| chunk_id | TEXT | 切片 ID |
| knowledge_base_id | TEXT | 知识库 ID |
| term_frequency | INTEGER | 词频 |
| positions | TEXT | 位置信息（JSON） |

---

## 3. 核心服务设计

### 3.1 KnowledgeBaseService

```typescript
// main/services/knowledge-base.service.ts
export class KnowledgeBaseService {
  // ==================== 知识库管理 ====================

  /**
   * 创建知识库
   */
  async createKnowledgeBase(request: CreateKnowledgeBaseRequest): Promise<{
    success: boolean
    data?: KnowledgeBase
    error?: string
  }>

  /**
   * 获取知识库列表
   */
  async getKnowledgeBases(): Promise<{
    success: boolean
    data?: KnowledgeBase[]
    error?: string
  }>

  /**
   * 获取知识库详情
   */
  async getKnowledgeBase(id: string): Promise<{
    success: boolean
    data?: KnowledgeBase
    error?: string
  }>

  /**
   * 更新知识库
   */
  async updateKnowledgeBase(id: string, data: Partial<KnowledgeBase>): Promise<{
    success: boolean
    error?: string
  }>

  /**
   * 删除知识库
   */
  async deleteKnowledgeBase(id: string): Promise<{
    success: boolean
    error?: string
  }>

  // ==================== 文档管理 ====================

  /**
   * 上传文档
   */
  async uploadDocuments(
    knowledgeBaseId: string,
    files: { path: string; name: string }[]
  ): Promise<{
    success: boolean
    data?: Document[]
    error?: string
  }>

  /**
   * 获取文档列表
   */
  async getDocuments(knowledgeBaseId: string): Promise<{
    success: boolean
    data?: Document[]
    error?: string
  }>

  /**
   * 删除文档
   */
  async deleteDocument(documentId: string): Promise<{
    success: boolean
    error?: string
  }>

  /**
   * 重新处理文档
   */
  async reprocessDocument(documentId: string): Promise<{
    success: boolean
    error?: string
  }>

  // ==================== 检索服务 ====================

  /**
   * 检索知识库
   */
  async search(request: SearchRequest): Promise<{
    success: boolean
    data?: SearchResult[]
    error?: string
  }>
}
```

---

### 3.2 DocumentParserService

文档解析服务，负责解析各种格式的文档并智能切分。

```typescript
// main/services/document-parser.service.ts
export class DocumentParserService {
  /**
   * 解析文档
   */
  async parse(filePath: string, fileType: string): Promise<{
    success: boolean
    content?: string
    metadata?: DocumentMetadata
    error?: string
  }>

  /**
   * 切分文档
   */
  chunk(content: string, fileType: string, metadata: DocumentMetadata): Chunk[]

  /**
   * 获取支持的文件类型
   */
  getSupportedTypes(): string[]
}

interface DocumentMetadata {
  title?: string
  author?: string
  pageCount?: number
  sections?: { title: string; startIndex: number }[]
}

interface Chunk {
  content: string
  index: number
  startOffset: number
  endOffset: number
  metadata: {
    page?: number
    section?: string
  }
}
```

**智能切分策略**：

| 文档类型 | 切分策略 |
|----------|----------|
| PDF | 按页切分，长页按段落二次切分 |
| Word | 按段落切分，保留标题结构 |
| Markdown | 按标题层级切分，保留代码块完整性 |
| TXT | 按段落切分，固定 500 字重叠 |
| EPUB | 按章节切分 |
| Excel | 每行作为一个独立切片 |

---

### 3.3 EmbeddingService

Embedding 向量化服务。

```typescript
// main/services/embedding.service.ts
export class EmbeddingService {
  /**
   * 生成单个文本的向量
   */
  async embed(text: string, config: EmbeddingConfig): Promise<{
    success: boolean
    vector?: number[]
    error?: string
  }>

  /**
   * 批量生成向量
   */
  async embedBatch(texts: string[], config: EmbeddingConfig): Promise<{
    success: boolean
    vectors?: number[][]
    error?: string
  }>

  /**
   * 获取可用的 Embedding 模型列表
   */
  async getAvailableModels(): Promise<EmbeddingModel[]>
}

interface EmbeddingConfig {
  provider: 'cloud' | 'local'
  modelId: string
  providerConfigId?: string  // 云端 API 需要关联提供商配置
  ollamaBaseUrl?: string     // 本地 Ollama 服务地址
}

interface EmbeddingModel {
  id: string
  name: string
  provider: 'cloud' | 'local'
  dimension: number
  maxTokens: number
}
```

**云端 Embedding 提供商**：

| 提供商 | 模型 | 维度 |
|--------|------|------|
| OpenAI | text-embedding-3-small | 1536 |
| OpenAI | text-embedding-3-large | 3072 |
| 阿里百炼 | text-embedding-v2 | 1536 |
| 智谱 AI | embedding-2 | 1024 |

**本地 Embedding 模型（Ollama）**：

| 模型 | 维度 | 说明 |
|------|------|------|
| nomic-embed-text | 768 | 轻量级，适合快速检索 |
| mxbai-embed-large | 1024 | 高质量，适合精确检索 |
| all-minilm | 384 | 极轻量，适合大规模文档 |

---

### 3.4 RetrievalService

检索服务，实现混合检索。

```typescript
// main/services/retrieval.service.ts
export class RetrievalService {
  /**
   * 混合检索
   */
  async hybridSearch(request: HybridSearchRequest): Promise<SearchResult[]>

  /**
   * 向量检索
   */
  async vectorSearch(
    knowledgeBaseId: string,
    queryVector: number[],
    topK: number
  ): Promise<VectorSearchResult[]>

  /**
   * BM25 关键词检索
   */
  async keywordSearch(
    knowledgeBaseId: string,
    query: string,
    topK: number
  ): Promise<KeywordSearchResult[]>

  /**
   * 结果融合（RRF 算法）
   */
  mergeResults(
    vectorResults: VectorSearchResult[],
    keywordResults: KeywordSearchResult[],
    vectorWeight: number,
    topK: number
  ): SearchResult[]
}

interface HybridSearchRequest {
  knowledgeBaseId: string
  query: string
  topK: number
  vectorWeight?: number  // 向量检索权重，默认 0.7
  threshold?: number     // 相似度阈值，默认 0.7
}

interface SearchResult {
  chunkId: string
  documentId: string
  documentName: string
  content: string
  score: number
  metadata: {
    page?: number
    section?: string
  }
}
```

**RRF（Reciprocal Rank Fusion）融合算法**：

```typescript
function mergeResults(
  vectorResults: VectorSearchResult[],
  keywordResults: KeywordSearchResult[],
  vectorWeight: number = 0.7,
  topK: number
): SearchResult[] {
  const k = 60  // RRF 常数
  const scores = new Map<string, number>()

  // 向量检索得分
  vectorResults.forEach((r, i) => {
    const current = scores.get(r.chunkId) || 0
    scores.set(r.chunkId, current + vectorWeight / (k + i + 1))
  })

  // 关键词检索得分
  keywordResults.forEach((r, i) => {
    const current = scores.get(r.chunkId) || 0
    scores.set(r.chunkId, current + (1 - vectorWeight) / (k + i + 1))
  })

  // 按得分排序，返回 Top-K
  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([chunkId, score]) => {
      // 查找对应的切片信息
      const chunk = chunkRepo.getById(chunkId)
      const document = documentRepo.getById(chunk.documentId)
      return {
        chunkId,
        documentId: chunk.documentId,
        documentName: document.name,
        content: chunk.content,
        score,
        metadata: JSON.parse(chunk.metadata)
      }
    })
}
```

---

## 4. IPC Handler 设计

### 4.1 KnowledgeBaseHandler

```typescript
// main/ipc/handlers/knowledge-base.handler.ts
export function registerKnowledgeBaseHandlers(): void {
  // 知识库管理
  ipcMain.handle('kb:list', handleListKnowledgeBases)
  ipcMain.handle('kb:get', handleGetKnowledgeBase)
  ipcMain.handle('kb:create', handleCreateKnowledgeBase)
  ipcMain.handle('kb:update', handleUpdateKnowledgeBase)
  ipcMain.handle('kb:delete', handleDeleteKnowledgeBase)

  // 文档管理
  ipcMain.handle('kb:documents:list', handleListDocuments)
  ipcMain.handle('kb:documents:upload', handleUploadDocuments)
  ipcMain.handle('kb:documents:delete', handleDeleteDocument)
  ipcMain.handle('kb:documents:reprocess', handleReprocessDocument)

  // 检索
  ipcMain.handle('kb:search', handleSearch)

  // Embedding 模型
  ipcMain.handle('kb:embedding-models', handleGetEmbeddingModels)

  // 文件选择
  ipcMain.handle('kb:select-files', handleSelectFiles)
}
```

### 4.2 预加载脚本 API

```typescript
// preload/index.ts
contextBridge.exposeInMainWorld('electronAPI', {
  // ... 其他 API

  knowledgeBase: {
    // 知识库管理
    list: () => ipcRenderer.invoke('kb:list'),
    get: (id: string) => ipcRenderer.invoke('kb:get', id),
    create: (request: CreateKnowledgeBaseRequest) =>
      ipcRenderer.invoke('kb:create', request),
    update: (id: string, data: Partial<KnowledgeBase>) =>
      ipcRenderer.invoke('kb:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('kb:delete', id),

    // 文档管理
    documents: {
      list: (knowledgeBaseId: string) =>
        ipcRenderer.invoke('kb:documents:list', knowledgeBaseId),
      upload: (knowledgeBaseId: string, files: FileInfo[]) =>
        ipcRenderer.invoke('kb:documents:upload', knowledgeBaseId, files),
      delete: (documentId: string) =>
        ipcRenderer.invoke('kb:documents:delete', documentId),
      reprocess: (documentId: string) =>
        ipcRenderer.invoke('kb:documents:reprocess', documentId)
    },

    // 检索
    search: (request: SearchRequest) =>
      ipcRenderer.invoke('kb:search', request),

    // Embedding 模型
    getEmbeddingModels: () =>
      ipcRenderer.invoke('kb:embedding-models'),

    // 文件选择
    selectFiles: () =>
      ipcRenderer.invoke('kb:select-files')
  }
})
```

---

## 5. Repository 层设计

### 5.1 KnowledgeBaseRepository

```typescript
// main/database/repositories/knowledge-base.repository.ts
export class KnowledgeBaseRepository {
  constructor(private db: Database) {}

  findById(id: string): KnowledgeBase | undefined
  findAll(): KnowledgeBase[]
  create(data: CreateKnowledgeBaseRequest): KnowledgeBase
  update(id: string, data: Partial<KnowledgeBase>): boolean
  delete(id: string): boolean

  // 统计更新
  updateStats(id: string, stats: {
    documentCount?: number
    vectorCount?: number
    totalSize?: number
  }): void

  // 增加/减少计数
  incrementDocumentCount(id: string, delta: number): void
  incrementVectorCount(id: string, delta: number): void
}
```

### 5.2 DocumentRepository

```typescript
// main/database/repositories/document.repository.ts
export class DocumentRepository {
  constructor(private db: Database) {}

  findById(id: string): Document | undefined
  findByKnowledgeBaseId(knowledgeBaseId: string): Document[]
  create(data: CreateDocumentRequest): Document
  update(id: string, data: Partial<Document>): boolean
  delete(id: string): boolean

  // 按状态查询
  findByStatus(status: DocumentStatus): Document[]

  // 更新处理进度
  updateProgress(id: string, progress: number): void
  markCompleted(id: string, chunkCount: number): void
  markFailed(id: string, errorMessage: string): void
}
```

### 5.3 ChunkRepository

```typescript
// main/database/repositories/chunk.repository.ts
export class ChunkRepository {
  constructor(private db: Database) {}

  findById(id: string): Chunk | undefined
  findByDocumentId(documentId: string): Chunk[]
  findByKnowledgeBaseId(knowledgeBaseId: string): Chunk[]
  create(data: CreateChunkRequest): Chunk
  createBatch(chunks: CreateChunkRequest[]): void
  deleteByDocumentId(documentId: string): void
  deleteByKnowledgeBaseId(knowledgeBaseId: string): void

  // 获取切片数量
  countByDocumentId(documentId: string): number
  countByKnowledgeBaseId(knowledgeBaseId: string): number
}
```

### 5.4 VectorRepository (LanceDB)

```typescript
// main/database/repositories/kb-vector.repository.ts
import { LanceDBService } from '../services/lance-db.service'

export class KbVectorRepository {
  private lanceDB: LanceDBService

  constructor(lanceDB: LanceDBService) {
    this.lanceDB = lanceDB
  }

  // 存储
  async create(data: { chunkId: string; knowledgeBaseId: string; vector: number[] }): Promise<void>
  async createBatch(vectors: { chunkId: string; knowledgeBaseId: string; vector: number[] }[]): Promise<void>

  // 删除
  async deleteByChunkId(chunkId: string): Promise<void>
  async deleteByDocumentId(documentId: string): Promise<void>
  async deleteByKnowledgeBaseId(knowledgeBaseId: string): Promise<void>

  // 向量相似度搜索（LanceDB 索引加速）
  async searchSimilar(
    knowledgeBaseId: string,
    queryVector: number[],
    topK: number
  ): Promise<{ chunkId: string; score: number }[]>

  // 统计
  async countByKnowledgeBaseId(knowledgeBaseId: string): Promise<number>
}
```
```

---

## 6. 文档处理流程

### 6.1 处理流程图

```
上传文档 → 存储文件 → 解析文档 → 智能切分 → 生成向量 → 构建索引 → 完成
    │         │          │          │          │          │
    ▼         ▼          ▼          ▼          ▼          ▼
 pending  pending   processing  processing  processing  completed
                      (progress)  (progress)  (progress)
                                                    │
                                              失败 → failed
```

### 6.2 处理服务实现

```typescript
// main/services/document-processor.service.ts
export class DocumentProcessorService {
  private parserService: DocumentParserService
  private embeddingService: EmbeddingService
  private chunkRepo: ChunkRepository
  private vectorRepo: VectorRepository
  private invertedIndexRepo: InvertedIndexRepository

  /**
   * 处理文档
   */
  async processDocument(
    documentId: string,
    knowledgeBase: KnowledgeBase
  ): Promise<void> {
    const document = this.documentRepo.findById(documentId)
    if (!document) return

    try {
      // 更新状态为处理中
      this.documentRepo.update(documentId, { status: 'processing', progress: 0 })

      // 1. 解析文档
      this.documentRepo.updateProgress(documentId, 10)
      const parseResult = await this.parserService.parse(
        document.filePath,
        document.fileType
      )
      if (!parseResult.success) {
        throw new Error(parseResult.error)
      }

      // 2. 切分文档
      this.documentRepo.updateProgress(documentId, 30)
      const chunks = this.parserService.chunk(
        parseResult.content!,
        document.fileType,
        parseResult.metadata!
      )

      // 3. 存储切片
      this.documentRepo.updateProgress(documentId, 40)
      const chunkData = chunks.map(chunk => ({
        documentId,
        knowledgeBaseId: knowledgeBase.id,
        content: chunk.content,
        chunkIndex: chunk.index,
        startOffset: chunk.startOffset,
        endOffset: chunk.endOffset,
        metadata: JSON.stringify(chunk.metadata)
      }))
      this.chunkRepo.createBatch(chunkData)

      // 4. 生成向量
      this.documentRepo.updateProgress(documentId, 50)
      const texts = chunks.map(c => c.content)
      const embeddingConfig = {
        provider: knowledgeBase.embeddingProvider,
        modelId: knowledgeBase.embeddingModel,
        // ...
      }
      const embedResult = await this.embeddingService.embedBatch(texts, embeddingConfig)
      if (!embedResult.success) {
        throw new Error(embedResult.error)
      }

      // 5. 存储向量
      this.documentRepo.updateProgress(documentId, 80)
      const vectorData = embedResult.vectors!.map((vector, i) => ({
        chunkId: chunkData[i].id,
        knowledgeBaseId: knowledgeBase.id,
        vector
      }))
      this.vectorRepo.createBatch(vectorData)

      // 6. 构建倒排索引（BM25）
      this.documentRepo.updateProgress(documentId, 90)
      await this.buildInvertedIndex(chunks, knowledgeBase.id)

      // 7. 完成
      this.documentRepo.markCompleted(documentId, chunks.length)
      this.knowledgeBaseRepo.incrementDocumentCount(knowledgeBase.id, 1)
      this.knowledgeBaseRepo.incrementVectorCount(knowledgeBase.id, chunks.length)

    } catch (error: any) {
      this.documentRepo.markFailed(documentId, error.message)
    }
  }

  /**
   * 构建倒排索引
   */
  private async buildInvertedIndex(
    chunks: Chunk[],
    knowledgeBaseId: string
  ): Promise<void> {
    for (const chunk of chunks) {
      const terms = this.tokenize(chunk.content)
      const termFreq = new Map<string, number>()

      for (const term of terms) {
        termFreq.set(term, (termFreq.get(term) || 0) + 1)
      }

      for (const [term, freq] of termFreq) {
        this.invertedIndexRepo.upsert({
          term,
          chunkId: chunk.id,
          knowledgeBaseId,
          termFrequency: freq
        })
      }
    }
  }

  /**
   * 分词
   */
  private tokenize(text: string): string[] {
    // 简单分词：中英文分词
    // 实际可使用 jieba 等分词库
    return text
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 0)
  }
}
```

---

## 7. 前端模块设计

### 7.1 Store 设计

```typescript
// renderer/src/stores/knowledge-base.ts
export const useKnowledgeBaseStore = defineStore('knowledgeBase', () => {
  // 状态
  const knowledgeBases = ref<KnowledgeBase[]>([])
  const currentKnowledgeBase = ref<KnowledgeBase | null>(null)
  const documents = ref<Document[]>([])
  const loading = ref(false)

  // 计算属性
  const hasKnowledgeBases = computed(() => knowledgeBases.value.length > 0)

  // 方法
  async function loadKnowledgeBases(): Promise<void> { ... }
  async function createKnowledgeBase(request: CreateKnowledgeBaseRequest): Promise<boolean> { ... }
  async function deleteKnowledgeBase(id: string): Promise<boolean> { ... }
  async function loadDocuments(knowledgeBaseId: string): Promise<void> { ... }
  async function uploadDocuments(knowledgeBaseId: string, files: FileInfo[]): Promise<boolean> { ... }
  async function deleteDocument(documentId: string): Promise<boolean> { ... }

  return {
    knowledgeBases,
    currentKnowledgeBase,
    documents,
    loading,
    hasKnowledgeBases,
    loadKnowledgeBases,
    createKnowledgeBase,
    deleteKnowledgeBase,
    loadDocuments,
    uploadDocuments,
    deleteDocument
  }
})
```

### 7.2 Composable 设计

```typescript
// renderer/src/composables/useKnowledgeBase.ts
export function useKnowledgeBase() {
  const store = useKnowledgeBaseStore()

  // 状态
  const loading = computed(() => store.loading)
  const knowledgeBases = computed(() => store.knowledgeBases)
  const currentKnowledgeBase = computed(() => store.currentKnowledgeBase)

  // 方法
  async function refresh(): Promise<void> {
    await store.loadKnowledgeBases()
  }

  async function create(request: CreateKnowledgeBaseRequest): Promise<boolean> {
    return store.createKnowledgeBase(request)
  }

  async function remove(id: string): Promise<boolean> {
    return store.deleteKnowledgeBase(id)
  }

  return {
    loading,
    knowledgeBases,
    currentKnowledgeBase,
    refresh,
    create,
    remove
  }
}
```

### 7.3 组件层级

```
views/
└── KnowledgeBase.vue              # 知识库管理页面
    ├── components/
    │   ├── KnowledgeBaseList.vue  # 知识库列表
    │   ├── KnowledgeBaseCard.vue  # 知识库卡片
    │   ├── CreateDialog.vue       # 创建对话框
    │   ├── KnowledgeBaseDetail.vue # 知识库详情
    │   ├── DocumentList.vue       # 文档列表
    │   ├── DocumentCard.vue       # 文档卡片
    │   └── UploadDialog.vue       # 上传对话框
    └── composables/
        └── useKnowledgeBase.ts
```

---

## 8. 与其他模块集成

### 8.1 与对话模块集成

```typescript
// 在 ChatService 中集成知识库检索
export class ChatService {
  async sendMessage(
    window: BrowserWindow,
    request: ChatRequest,
    onStreamEvent: (event: StreamEvent) => void
  ): Promise<{ success: boolean; error?: string }> {
    // ...

    // 如果选择了知识库，先检索相关内容
    let knowledgeContext = ''
    if (request.knowledgeBaseId) {
      const searchResult = await this.retrievalService.hybridSearch({
        knowledgeBaseId: request.knowledgeBaseId,
        query: request.content,
        topK: 5
      })

      if (searchResult.length > 0) {
        knowledgeContext = this.formatKnowledgeContext(searchResult)
      }
    }

    // 构建消息上下文
    const messages = this.buildMessages(context, knowledgeContext)

    // 调用 AI 生成
    // ...
  }

  /**
   * 格式化知识库上下文
   */
  private formatKnowledgeContext(results: SearchResult[]): string {
    const parts = results.map((r, i) => {
      return `[${i + 1}] 来源: ${r.documentName}\n${r.content}`
    })
    return `以下是从知识库检索到的相关信息：\n\n${parts.join('\n\n---\n\n')}`
  }
}
```

### 8.2 引用标注处理

```typescript
// 在 AI 回复中添加引用标注
interface StreamEvent {
  type: 'start' | 'delta' | 'citation' | 'done' | 'error'
  // ...
  citations?: Citation[]
}

interface Citation {
  documentName: string
  page?: number
  section?: string
  content: string
}

// 处理 AI 回复，提取引用
function processResponseWithCitations(
  response: string,
  searchResults: SearchResult[]
): { content: string; citations: Citation[] } {
  // 在回复中查找引用标记并替换
  // 如：将 [1] 替换为可点击的引用链接
  // ...
}
```

---

## 9. 文件存储结构

```
{userData}/
└── knowledge-base/
    ├── {knowledgeBaseId}/
    │   ├── documents/
    │   │   ├── {documentId}.pdf
    │   │   ├── {documentId}.docx
    │   │   └── ...
    │   └── metadata.json
    └── ...
```

---

## 10. 性能优化

### 10.1 向量检索优化

**已采用 LanceDB 解决方案：**

LanceDB 内置高效的向量索引，自动优化检索性能：
- **IVF-PQ 索引**：默认索引类型，平衡精度和速度
- **HNSW 索引**：高精度近邻搜索
- **自动索引管理**：数据量达到阈值自动创建索引
- **元数据过滤下推**：先过滤再搜索，减少计算量

**性能指标（参考）：**
| 数据量 | 搜索延迟 |
|--------|----------|
| 10万向量 | < 10ms |
| 100万向量 | < 50ms |
| 1000万向量 | < 100ms |

### 10.2 批量处理优化

- 文档处理使用队列，避免阻塞主线程
- 向量生成使用批量接口，减少 API 调用次数

### 10.3 缓存策略

- 缓存热门知识库的向量索引
- 缓存 Embedding 结果，避免重复计算

---

## 11. 依赖说明

### 11.1 LanceDB 依赖

```bash
npm install @lancedb/lancedb
```

**版本要求**：`^0.4.0` 或更高

**平台支持**：
- Windows (x64)
- macOS (x64, arm64)
- Linux (x64, arm64)

**官方文档**：https://docs.lancedb.com/

**Node.js API 参考**：

```typescript
import * as lancedb from '@lancedb/lancedb'

// 连接数据库
const db = await lancedb.connect('/path/to/database')

// 创建表
const table = await db.createTable('vectors', [
  { id: '1', chunkId: 'chunk-1', knowledgeBaseId: 'kb-1', vector: [0.1, 0.2, ...] }
])

// 向量搜索
const results = await table
  .search(queryVector)
  .where(`knowledgeBaseId = 'kb-1'`)
  .limit(10)
  .toArray()

// 添加数据
await table.add([
  { id: '2', chunkId: 'chunk-2', knowledgeBaseId: 'kb-1', vector: [0.3, 0.4, ...] }
])

// 删除数据
await table.delete(`chunkId = 'chunk-1'`)

// 获取表列表
const tables = await db.tableNames()
```

### 11.2 相关依赖

| 依赖 | 版本 | 用途 |
|------|------|------|
| @lancedb/lancedb | ^0.4.0 | 向量数据库 |
| better-sqlite3 | ^11.0.0 | 关系数据库（元数据） |
| pdf-parse | ^2.4.0 | PDF 解析 |
| mammoth | ^1.12.0 | Word 解析 |
| marked | ^17.0.0 | Markdown 解析 |
| epub-parser | ^0.2.5 | EPUB 解析 |
| xlsx | ^0.18.5 | Excel 解析 |