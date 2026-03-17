# M07 - 知识库模块功能设计

## F07-01 知识库管理

### 功能概述
| 属性 | 值 |
|-----|-----|
| 功能编号 | F07-01 |
| 功能名称 | 知识库管理 |
| 优先级 | P0 |
| 描述 | 创建、查看、删除知识库 |

### 界面
```
┌─────────────────────────────────────────────────────────────────────────┐
│  知识库管理                                              [+ 新建知识库] │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 📚 产品文档                                                       │  │
│  │    15个文档 · 2024-01-15更新                                      │  │
│  │    包含产品说明、使用手册等技术文档                                │  │
│  │                                              [查看] [编辑] [删除] │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 📚 法律法规                                                       │  │
│  │    32个文档 · 2024-01-10更新                                      │  │
│  │    各类法律法规文档合集                                            │  │
│  │                                              [查看] [编辑] [删除] │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 函数
```typescript
/**
 * 创建知识库
 * @param request - 创建请求
 * @returns Promise<KnowledgeBase>
 */
async function createKnowledgeBase(request: CreateKBRequest): Promise<KnowledgeBase>

/**
 * 获取知识库列表
 * @returns Promise<KnowledgeBase[]>
 */
async function listKnowledgeBases(): Promise<KnowledgeBase[]>

/**
 * 删除知识库
 * @param id - 知识库ID
 */
async function deleteKnowledgeBase(id: string): Promise<void>

interface KnowledgeBase {
  id: string
  name: string
  description?: string
  documentCount: number
  createdAt: Date
  updatedAt: Date
}
```

---

## F07-02 文档上传

### 功能概述
| 属性 | 值 |
|-----|-----|
| 功能编号 | F07-02 |
| 功能名称 | 文档上传 |
| 优先级 | P0 |
| 描述 | 上传文档到知识库 |

### 界面
```
┌─────────────────────────────────────────────────────────────────────────┐
│  产品文档                                                  [上传文档]    │
├─────────────────────────────────────────────────────────────────────────┤
│  文档列表                                                  15个文档     │
│  ────────────────────────────────────────────────────────────────────  │
│  📄 用户手册v2.0.pdf                    2.3MB  ✓ 处理完成  [删除]       │
│  📄 API接口文档.md                      156KB  ✓ 处理完成  [删除]       │
│  📄 常见问题.docx                       89KB   ⏳ 处理中...  [删除]      │
│  📄 安装指南.pdf                        1.1MB  ✓ 处理完成  [删除]       │
└─────────────────────────────────────────────────────────────────────────┘
```

### 支持的文档格式
- PDF (.pdf)
- Word (.docx, .doc)
- Markdown (.md)
- 纯文本 (.txt)

### 函数
```typescript
/**
 * 上传文档
 * @param baseId - 知识库ID
 * @param file - 文件
 * @returns Promise<Document>
 */
async function uploadDocument(baseId: string, file: File): Promise<Document>

interface Document {
  id: string
  baseId: string
  name: string
  type: string
  size: number
  path: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  chunkCount?: number
  createdAt: Date
}
```

---

## F07-03 文档处理

### 功能概述
| 属性 | 值 |
|-----|-----|
| 功能编号 | F07-03 |
| 功能名称 | 文档处理 |
| 优先级 | P0 |
| 描述 | 文档分块和向量化 |

### 处理流程
```
上传文档
    │
    ▼
读取文档内容
    │
    ▼
文本分块（按段落/固定长度）
    │
    ▼
向量化（调用Embedding API）
    │
    ▼
存储向量到向量数据库
    │
    ▼
更新文档状态为"完成"
```

### 函数
```typescript
/**
 * 处理文档
 * @param documentId - 文档ID
 * @returns Promise<void>
 * 逻辑：
 * 1. 读取文档内容
 * 2. 文本分块（每块约500字）
 * 3. 调用Embedding API向量化
 * 4. 存储到向量数据库
 */
async function processDocument(documentId: string): Promise<void>
```

---

## F07-04 知识检索

### 功能概述
| 属性 | 值 |
|-----|-----|
| 功能编号 | F07-04 |
| 功能名称 | 知识检索 |
| 优先级 | P0 |
| 描述 | 检索相关知识片段 |

### 界面
```
┌─────────────────────────────────────────────────────────────────────────┐
│  知识检索测试                                                            │
│  ────────────────────────────────────────────────────────────────────  │
│  [如何安装软件？                                        ] [检索]        │
│                                                                          │
│  检索结果:                                                               │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 相关度 0.92 - 安装指南.pdf                                       │  │
│  │ "软件安装步骤：1. 下载安装包 2. 双击运行 3. 跟随向导..."          │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 相关度 0.85 - 用户手册.pdf                                       │  │
│  │ "安装完成后，首次启动需要进行初始化设置..."                      │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 函数
```typescript
/**
 * 检索知识
 * @param request - 检索请求
 * @returns Promise<SearchResult[]>
 */
async function searchKnowledge(request: SearchRequest): Promise<SearchResult[]>

interface SearchRequest {
  baseId: string           // 知识库ID
  query: string            // 查询文本
  topK?: number            // 返回数量，默认5
  threshold?: number       // 相似度阈值，默认0.7
}

interface SearchResult {
  chunkId: string
  documentId: string
  documentName: string
  content: string          // 内容片段
  score: number            // 相似度分数
}
```
