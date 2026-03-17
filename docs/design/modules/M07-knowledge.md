# M07 - 知识库模块设计

## 1. 模块概述

| 属性 | 值 |
|-----|-----|
| 模块编号 | M07 |
| 模块名称 | 知识库 |
| 模块代码 | knowledge |
| 优先级 | P2 |
| 描述 | 提供知识库管理功能，支持文档上传、向量化存储和RAG检索 |

## 2. 功能列表

| 功能编号 | 功能名称 | 功能描述 | 优先级 |
|---------|---------|---------|-------|
| F07-01 | 知识库管理 | 创建、删除知识库 | P0 |
| F07-02 | 文档上传 | 上传文档到知识库 | P0 |
| F07-03 | 文档处理 | 文档分块和向量化 | P0 |
| F07-04 | 知识检索 | 检索相关知识片段 | P0 |
| F07-05 | 对话集成 | AI对话中使用知识库 | P1 |
| F07-06 | 文档管理 | 查看、删除文档 | P1 |

## 3. 界面设计

### 3.1 知识库管理页面

```
┌─────────────────────────────────────────────────────────────────────────┐
│  知识库管理                                              [+ 新建知识库] │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 📚 产品文档                                                       │  │
│  │    15个文档 · 2024-01-15更新                                      │  │
│  │    ─────────────────────────────────────────────────────────────  │  │
│  │    包含产品说明、使用手册等技术文档                                │  │
│  │                                              [查看] [编辑] [删除] │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 📚 法律法规                                                       │  │
│  │    32个文档 · 2024-01-10更新                                      │  │
│  │    ─────────────────────────────────────────────────────────────  │  │
│  │    各类法律法规文档合集                                            │  │
│  │                                              [查看] [编辑] [删除] │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 📚 公司制度                                                       │  │
│  │    8个文档 · 2024-01-05更新                                       │  │
│  │    ─────────────────────────────────────────────────────────────  │  │
│  │    公司内部规章制度文档                                            │  │
│  │                                              [查看] [编辑] [删除] │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 知识库详情页面

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ← 返回    产品文档                                        [上传文档]  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │ 文档列表                                              15个文档    │ │
│  │ ─────────────────────────────────────────────────────────────────│ │
│  │                                                                   │ │
│  │ 📄 用户手册v2.0.pdf                    2.3MB  处理完成  [删除]   │ │
│  │ 📄 API接口文档.md                      156KB  处理完成  [删除]   │ │
│  │ 📄 常见问题.docx                       89KB   处理完成  [删除]   │ │
│  │ 📄 安装指南.pdf                        1.1MB  处理中...  [删除]   │ │
│  │ 📄 快速开始.md                         45KB   处理完成  [删除]   │ │
│  │ ...                                                              │ │
│  │                                                                   │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │ 知识检索测试                                                       │ │
│  │ ─────────────────────────────────────────────────────────────────│ │
│  │                                                                   │ │
│  │ [如何安装软件？                                        ] [检索]   │ │
│  │                                                                   │ │
│  │ 检索结果:                                                         │ │
│  │ ┌───────────────────────────────────────────────────────────────┐│ │
│  │ │ 相关度 0.92 - 安装指南.pdf                                    ││ │
│  │ │ "软件安装步骤：1. 下载安装包 2. 双击运行 3. 跟随向导..."      ││ │
│  │ └───────────────────────────────────────────────────────────────┘│ │
│  │                                                                   │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## 4. 数据设计

### 4.1 数据结构

```typescript
// 知识库
interface KnowledgeBase {
  id: string                    // 知识库ID
  name: string                  // 名称
  description?: string          // 描述
  documentCount: number         // 文档数量
  createdAt: Date               // 创建时间
  updatedAt: Date               // 更新时间
}

// 知识文档
interface KnowledgeDocument {
  id: string                    // 文档ID
  baseId: string                // 知识库ID
  name: string                  // 文件名
  type: string                  // 文件类型
  size: number                  // 文件大小
  path: string                  // 本地存储路径
  status: 'pending' | 'processing' | 'completed' | 'failed'  // 处理状态
  chunkCount?: number           // 分块数量
  createdAt: Date               // 创建时间
}

// 文档分块
interface DocumentChunk {
  id: string                    // 分块ID
  documentId: string            // 文档ID
  content: string               // 内容
  embedding?: number[]          // 向量
  metadata: {                   // 元数据
    pageNumber?: number         // 页码
    position: number            // 位置
  }
}

// 检索请求
interface SearchRequest {
  baseId: string                // 知识库ID
  query: string                 // 查询文本
  topK?: number                 // 返回数量
  threshold?: number            // 相似度阈值
}

// 检索结果
interface SearchResult {
  chunkId: string               // 分块ID
  documentId: string            // 文档ID
  documentName: string          // 文档名
  content: string               // 内容
  score: number                 // 相似度分数
}
```

### 4.2 数据库表

```sql
-- 知识库表
CREATE TABLE knowledge_bases (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  document_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 知识文档表
CREATE TABLE knowledge_documents (
  id TEXT PRIMARY KEY,
  base_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  size INTEGER NOT NULL,
  path TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  chunk_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
);

-- 文档分块表（向量存储在单独的向量数据库）
CREATE TABLE document_chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata TEXT,                -- JSON格式
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (document_id) REFERENCES knowledge_documents(id) ON DELETE CASCADE
);

-- 索引
CREATE INDEX idx_docs_base_id ON knowledge_documents(base_id);
CREATE INDEX idx_chunks_doc_id ON document_chunks(document_id);
```

## 5. IPC接口设计

### 5.1 知识库管理

| 通道 | 方法 | 参数 | 返回值 | 描述 |
|-----|------|-----|-------|------|
| knowledge:list | GET | - | { success, bases } | 获取知识库列表 |
| knowledge:get | GET | id | { success, base } | 获取知识库详情 |
| knowledge:create | CREATE | name, description? | { success, base } | 创建知识库 |
| knowledge:update | UPDATE | id, name?, description? | { success } | 更新知识库 |
| knowledge:delete | DELETE | id | { success } | 删除知识库 |

### 5.2 文档管理

| 通道 | 方法 | 参数 | 返回值 | 描述 |
|-----|------|-----|-------|------|
| knowledge:upload | UPLOAD | baseId, filePath | { success, document } | 上传文档 |
| knowledge:documents | GET | baseId | { success, documents } | 获取文档列表 |
| knowledge:delete-document | DELETE | documentId | { success } | 删除文档 |

### 5.3 知识检索

| 通道 | 方法 | 参数 | 返回值 | 描述 |
|-----|------|-----|-------|------|
| knowledge:search | SEARCH | request: SearchRequest | { success, results } | 检索知识 |

## 6. 文件结构

```
src/
├── main/
│   ├── database/
│   │   └── repositories/
│   │       ├── knowledge.repository.ts     # 知识库数据访问
│   │       └── document.repository.ts      # 文档数据访问
│   ├── ipc/
│   │   └── handlers/
│   │       └── knowledge.handler.ts        # 知识库IPC处理
│   ├── services/
│   │   ├── knowledge.service.ts            # 知识库服务
│   │   ├── document-processor.service.ts   # 文档处理服务
│   │   └── embedding.service.ts            # 向量化服务
│   └── utils/
│       └── text-splitter.ts                # 文本分块工具
├── renderer/
│   └── src/
│       ├── views/
│       │   ├── KnowledgeView.vue           # 知识库列表页面
│       │   └── KnowledgeDetailView.vue     # 知识库详情页面
│       ├── stores/
│       │   └── knowledge.ts                # 知识库状态管理
│       └── components/
│           └── knowledge/
│               ├── KnowledgeCard.vue       # 知识库卡片
│               ├── DocumentList.vue        # 文档列表
│               ├── DocumentUploader.vue    # 文档上传
│               └── SearchTest.vue          # 检索测试
└── shared/
    └── types/
        └── knowledge.types.ts              # 知识库类型定义
```

## 7. 核心流程

### 7.1 文档处理流程

```
用户上传文档
    │
    ▼
保存到本地存储
    │
    ▼
创建文档记录（状态: pending）
    │
    ▼
异步处理任务
    │
    ├── 读取文档内容
    │
    ├── 文本分块
    │
    ├── 向量化（调用Embedding API）
    │
    ├── 存储向量
    │
    ▼
更新文档状态（completed）
```

### 7.2 知识检索流程

```
用户输入查询
    │
    ▼
调用 knowledge:search IPC
    │
    ▼
主进程接收请求
    │
    ├── 向量化查询文本
    │
    ├── 向量相似度检索
    │
    ├── 按相似度排序
    │
    ├── 取TopK结果
    │
    ▼
返回检索结果
    │
    ▼
前端显示结果
```

## 8. 错误处理

| 错误场景 | 错误码 | 错误信息 | 处理方式 |
|---------|-------|---------|---------|
| 知识库名称为空 | E701 | 请输入知识库名称 | 前端提示 |
| 文件格式不支持 | E702 | 不支持的文件格式 | 前端提示 |
| 文件过大 | E703 | 文件大小超过限制（最大50MB） | 前端提示 |
| 向量化失败 | E704 | 文档处理失败 | 弹窗提示 |
| 检索失败 | E705 | 检索失败：{原因} | 弹窗提示 |

## 9. 测试要点

- [ ] 创建知识库
- [ ] 上传文档
- [ ] 文档处理状态
- [ ] 知识检索
- [ ] 删除文档
- [ ] 删除知识库
