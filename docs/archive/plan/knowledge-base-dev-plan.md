# 知识库模块开发计划

## 1. 开发概述

### 1.1 目标
实现知识库功能，支持多格式文档上传、智能切分、向量化存储、混合检索，为对话和内容生成提供知识支撑。

### 1.2 技术栈
- 向量存储：SQLite + 向量扩展 / FAISS
- 文档解析：pdf-parse, mammoth, marked, epub-parser, xlsx
- Embedding：云端 API + Ollama 本地模型
- 检索算法：向量相似度 + BM25 + RRF 融合

### 1.3 开发周期
预计 5-6 个工作日

---

## 2. 任务分解

### 阶段一：基础设施（Day 1）

#### 任务 1.1 数据库表结构
- [ ] 创建 `knowledge_bases` 表
- [ ] 创建 `kb_documents` 表
- [ ] 创建 `kb_chunks` 表
- [ ] 创建 `kb_vectors` 表
- [ ] 创建 `kb_inverted_index` 表
- [ ] 编写数据库迁移脚本

#### 任务 1.2 类型定义
- [ ] 创建 `src/shared/types/knowledge-base.types.ts`
- [ ] 定义 KnowledgeBase、Document、Chunk、Vector 等类型
- [ ] 定义 IPC 请求/响应类型

#### 任务 1.3 Repository 层
- [ ] 创建 `KnowledgeBaseRepository`
- [ ] 创建 `DocumentRepository`
- [ ] 创建 `ChunkRepository`
- [ ] 创建 `VectorRepository`
- [ ] 创建 `InvertedIndexRepository`

---

### 阶段二：核心服务（Day 2-3）

#### 任务 2.1 文档解析服务
- [ ] 创建 `DocumentParserService`
- [ ] 实现 PDF 解析（pdf-parse）
- [ ] 实现 Word 解析（mammoth）
- [ ] 实现 TXT 解析
- [ ] 实现 Markdown 解析（marked）
- [ ] 实现 EPUB 解析（epub-parser）
- [ ] 实现 Excel 解析（xlsx）
- [ ] 实现智能切分策略

#### 任务 2.2 Embedding 服务
- [ ] 创建 `EmbeddingService`
- [ ] 实现云端 Embedding API 调用
  - [ ] OpenAI embedding
  - [ ] 阿里百炼 embedding
  - [ ] 智谱 AI embedding
- [ ] 实现 Ollama 本地模型调用
- [ ] 实现批量向量化
- [ ] 实现错误重试机制

#### 任务 2.3 检索服务
- [ ] 创建 `RetrievalService`
- [ ] 实现向量相似度检索（余弦相似度）
- [ ] 实现 BM25 关键词检索
- [ ] 实现 RRF 结果融合算法
- [ ] 实现分词功能（jieba 或简单实现）

#### 任务 2.4 文档处理服务
- [ ] 创建 `DocumentProcessorService`
- [ ] 实现文档处理流程编排
- [ ] 实现进度追踪
- [ ] 实现错误处理和重试

---

### 阶段三：业务服务与 IPC（Day 3-4）

#### 任务 3.1 知识库服务
- [ ] 创建 `KnowledgeBaseService`
- [ ] 实现知识库 CRUD
- [ ] 实现文档上传和管理
- [ ] 实现知识库检索接口
- [ ] 实现统计信息更新

#### 任务 3.2 IPC Handler
- [ ] 创建 `knowledge-base.handler.ts`
- [ ] 注册 IPC 通道
- [ ] 实现各接口处理函数
- [ ] 更新 preload/index.ts 暴露 API

#### 任务 3.3 文件选择
- [ ] 实现文件选择对话框
- [ ] 支持多文件选择
- [ ] 文件类型过滤

---

### 阶段四：前端界面（Day 4-5）

#### 任务 4.1 Store 和 Composable
- [ ] 创建 `useKnowledgeBaseStore`
- [ ] 创建 `useKnowledgeBase` composable
- [ ] 实现状态管理逻辑

#### 任务 4.2 知识库管理界面
- [ ] 创建 `KnowledgeBase.vue` 页面
- [ ] 创建 `KnowledgeBaseList.vue` 列表组件
- [ ] 创建 `KnowledgeBaseCard.vue` 卡片组件
- [ ] 创建 `CreateDialog.vue` 创建对话框
- [ ] 实现知识库 CRUD 交互

#### 任务 4.3 知识库详情界面
- [ ] 创建 `KnowledgeBaseDetail.vue` 详情页
- [ ] 创建 `DocumentList.vue` 文档列表
- [ ] 创建 `DocumentCard.vue` 文档卡片
- [ ] 创建 `UploadDialog.vue` 上传对话框
- [ ] 实现文档上传和管理交互
- [ ] 实现处理进度展示

#### 任务 4.4 设置页面集成
- [ ] 在设置页面添加知识库入口
- [ ] 添加路由配置

---

### 阶段五：模块集成（Day 5-6）

#### 任务 5.1 对话模块集成
- [ ] 对话界面添加知识库选择器
- [ ] 发送消息时调用知识库检索
- [ ] 格式化知识库上下文注入提示词
- [ ] AI 回复中添加引用标注
- [ ] 引用标注可点击查看原文

#### 任务 5.2 测试与优化
- [ ] 单元测试编写
- [ ] 集成测试
- [ ] 性能测试（大批量文档）
- [ ] 内存优化
- [ ] 错误处理完善

---

## 3. 文件清单

### 3.1 后端文件

```
src/main/
├── database/
│   └── repositories/
│       ├── knowledge-base.repository.ts    # 知识库仓库
│       ├── kb-document.repository.ts       # 文档仓库
│       ├── kb-chunk.repository.ts          # 切片仓库
│       ├── kb-vector.repository.ts         # 向量仓库
│       └── kb-inverted-index.repository.ts # 倒排索引仓库
├── ipc/handlers/
│   └── knowledge-base.handler.ts           # IPC 处理器
├── services/
│   ├── knowledge-base.service.ts           # 知识库服务
│   ├── document-parser.service.ts          # 文档解析服务
│   ├── embedding.service.ts                # 向量化服务
│   ├── retrieval.service.ts                # 检索服务
│   └── document-processor.service.ts       # 文档处理服务
└── embedding-providers/
    ├── base-embedding-provider.ts          # 基类
    ├── openai-embedding-provider.ts        # OpenAI
    ├── dashscope-embedding-provider.ts     # 阿里百炼
    ├── zhipu-embedding-provider.ts         # 智谱 AI
    └── ollama-embedding-provider.ts        # Ollama 本地
```

### 3.2 前端文件

```
src/renderer/src/
├── views/
│   └── KnowledgeBase.vue                   # 知识库页面
├── components/knowledge-base/
│   ├── KnowledgeBaseList.vue               # 知识库列表
│   ├── KnowledgeBaseCard.vue               # 知识库卡片
│   ├── CreateDialog.vue                    # 创建对话框
│   ├── KnowledgeBaseDetail.vue             # 知识库详情
│   ├── DocumentList.vue                    # 文档列表
│   ├── DocumentCard.vue                    # 文档卡片
│   └── UploadDialog.vue                    # 上传对话框
├── stores/
│   └── knowledge-base.ts                   # Pinia Store
└── composables/
    └── useKnowledgeBase.ts                 # Composable
```

### 3.3 共享类型文件

```
src/shared/types/
└── knowledge-base.types.ts                 # 类型定义
```

---

## 4. 依赖安装

```bash
# 文档解析
npm install pdf-parse mammoth marked epub-parser xlsx

# 分词（可选，用于 BM25）
npm install nodejieba  # 或 jieba-js

# 向量计算（可选，用于优化向量检索）
npm install hnswlib-node  # 或 faiss-node
```

---

## 5. 风险与应对

| 风险 | 影响 | 应对措施 |
|------|------|----------|
| PDF 扫描件无法解析 | 部分文档无法处理 | 提示用户，后续可集成 OCR |
| 大文件处理内存溢出 | 处理失败 | 分块读取，流式处理 |
| Embedding API 限流 | 批量处理慢 | 添加请求队列，限速处理 |
| 向量检索性能差 | 检索延迟 | 使用 FAISS/hnswlib 优化 |

---

## 6. 验收标准

### 功能验收
- [ ] 可创建、编辑、删除知识库
- [ ] 可上传 PDF、Word、TXT、MD、EPUB、Excel 文档
- [ ] 文档处理状态正确显示
- [ ] 对话时可选择知识库
- [ ] AI 回复正确引用知识库内容
- [ ] 引用标注可查看来源

### 性能验收
- [ ] 单个文档（10MB）处理时间 < 60 秒
- [ ] 检索响应时间 < 500ms
- [ ] 支持单个知识库 1GB 容量

### 兼容性验收
- [ ] Windows 10/11 正常运行
- [ ] macOS 正常运行
- [ ] 云端和本地 Embedding 模型均可正常使用