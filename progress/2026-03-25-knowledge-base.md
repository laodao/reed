# 知识库模块开发进度

## 2026-03-25

### 已完成工作

#### 阶段一：基础设施
- ✅ 创建类型定义 `src/shared/types/knowledge-base.types.ts`
  - KnowledgeBase、KbDocument、KbChunk、KbVector 等核心类型
  - CreateKnowledgeBaseRequest、SearchRequest 等请求类型
  - EmbeddingModel、EmbeddingConfig 等配置类型
  - Chunk、DocumentMetadata、ChunkMetadata 等辅助类型

- ✅ 创建数据库表结构（在 `src/main/database/index.ts`）
  - knowledge_bases：知识库表
  - kb_documents：文档表
  - kb_chunks：切片表
  - kb_vectors：向量表（已废弃，改用 LanceDB）
  - kb_inverted_index：倒排索引表

- ✅ 创建 Repository 层
  - `knowledge-base.repository.ts`：知识库 CRUD 操作
  - `kb-document.repository.ts`：文档管理操作
  - `kb-chunk.repository.ts`：切片批量操作
  - `kb-vector.repository.ts`：向量存储和相似度搜索（待重构使用 LanceDB）
  - `kb-inverted-index.repository.ts`：BM25 倒排索引操作

#### 阶段二：核心服务
- ✅ `document-parser.service.ts`：文档解析服务
  - 支持 PDF、Word、TXT、Markdown、EPUB、Excel 格式
  - 智能切分策略（按页、按段落、按标题层级等）
  - 多编码支持（UTF-8、GBK、GB2312）

- ✅ `embedding.service.ts`：向量化服务
  - 云端 API：OpenAI、DashScope（阿里百炼）、智谱 AI
  - 本地模型：Ollama（nomic-embed-text、mxbai-embed-large）
  - 批量向量化支持

- ✅ `retrieval.service.ts`：检索服务
  - 向量检索（余弦相似度）
  - BM25 关键词检索
  - RRF（Reciprocal Rank Fusion）结果融合

#### 阶段三：业务服务 & IPC
- ✅ `knowledge-base.service.ts`：知识库核心业务服务
  - 知识库 CRUD
  - 文档上传与异步处理
  - 混合检索
  - Embedding 模型管理

- ✅ `knowledge-base.handler.ts`：IPC 处理器
  - 知识库管理相关 IPC
  - 文档管理相关 IPC
  - 检索服务相关 IPC

- ✅ 更新 `src/preload/index.ts`：暴露知识库 API

#### 阶段四：前端 UI
- ✅ `stores/knowledge-base.ts`：Pinia 状态管理
- ✅ `composables/useKnowledgeBase.ts`：组合式函数
- ✅ `views/KnowledgeBase.vue`：知识库管理页面
  - 知识库列表侧边栏
  - 文档管理（上传、删除、重试）
  - 检索面板
  - 创建/编辑知识库对话框

- ✅ 更新路由配置 `router/index.ts`
- ✅ 更新导航菜单 `layouts/MainLayout.vue`

### 技术要点

1. **混合检索**：结合向量检索和 BM25 关键词检索，使用 RRF 算法融合结果
2. **智能切分**：根据文档类型采用不同的切分策略
3. **异步处理**：文档上传后异步处理，不阻塞 UI
4. **多 Embedding 支持**：支持云端和本地多种 Embedding 模型

### 技术变更（2026-03-25）

#### 引入 LanceDB 向量数据库

**变更原因：**
- 原方案使用 SQLite BLOB 存储向量，每次检索需加载全部向量到内存
- 无索引支持，采用暴力计算余弦相似度，O(N) 复杂度
- 不适合大规模数据，性能瓶颈明显

**LanceDB 优势：**
- 嵌入式架构，无需独立服务，完美适配 Electron
- 内置向量索引（IVF-PQ、HNSW），高性能检索
- 多平台支持（Windows/macOS/Linux）
- TypeScript 原生支持
- 支持向量搜索 + 元数据过滤

**相关文件变更：**
- 新增 `src/main/services/lance-db.service.ts`（待创建）
- 重构 `src/main/database/repositories/kb-vector.repository.ts`（待完成）
- 更新 `docs/design/04-knowledge-base.md` 设计文档

**依赖：**
```bash
npm install @lancedb/lancedb
```

### 待完成工作

- [x] 安装 `@lancedb/lancedb` 依赖
- [x] 创建 `lance-db.service.ts` 服务
- [x] 重构 `kb-vector.repository.ts` 使用 LanceDB
- [x] 更新数据库初始化逻辑
- [ ] 数据迁移（如有旧数据）
- [ ] 与对话模块集成
  - 在对话中选择知识库
  - 基于知识库内容生成回复
  - 显示引用来源

### LanceDB 集成完成（2026-03-25）

**已完成工作：**

1. **安装依赖**
   ```bash
   npm install @lancedb/lancedb
   ```

2. **新增文件**
   - `src/main/services/lance-db.service.ts` - LanceDB 服务封装

3. **修改文件**
   - `src/main/database/index.ts` - 集成 LanceDB 初始化
   - `src/main/database/repositories/kb-vector.repository.ts` - 重构为使用 LanceDB
   - `src/main/services/knowledge-base.service.ts` - 适配异步向量操作
   - `src/main/services/retrieval.service.ts` - 适配异步向量搜索
   - `src/main/index.ts` - 异步关闭数据库

4. **数据存储结构**
   ```
   {userData}/
   ├── the_bot.db                    # SQLite（元数据）
   ├── lancedb/                      # LanceDB（向量）
   │   └── vectors/
   └── knowledge-base/               # 文档文件
   ```

**构建验证：** ✅ 通过

---

### 问题修复记录（2026-03-25）

#### 问题6：大文件处理导致 UI 卡顿（最终方案）

**问题描述：**
- 上传 6MB 的 txt 文件时界面完全卡住
- 文档处理过程中的同步操作阻塞了事件循环

**根本原因：**
1. 文件复制、文档解析、切分都是 CPU 密集操作
2. `setImmediate` 只能让出事件循环，不能真正并行执行
3. 同步代码块仍然会阻塞主线程

**最终方案：使用 Worker Threads**
1. 创建独立的工作线程处理文档解析和切分
2. 主线程只负责数据库操作和向量化 API 调用
3. 工作线程与主线程通过消息通信

**新增文件：**
- `src/main/workers/document-worker.ts` - 工作线程，处理解析和切分
- `src/main/services/document-worker-manager.ts` - 线程管理器

**修改文件：**
- `src/main/services/knowledge-base.service.ts` - 使用工作线程处理文档
- `src/main/database/index.ts` - 添加 `getDbPath()` 和 `getDataPath()` 方法

#### 问题7：中文分词效果差

**问题描述：**
- 原分词方案按字符切分中文
- "知识库" 被分成 "知"、"识"、"库" 三个 token
- BM25 检索精度受影响

**解决方案：**
- 安装 `nodejieba` 专业中文分词库
- 使用 `cutForSearch` 搜索引擎模式
- 添加中英文停用词过滤

**安装：**
```bash
npm install nodejieba
```

**分词效果：**
- "知识库管理系统" → ["知识库", "管理", "系统"]
- "人工智能技术" → ["人工智能", "技术"]

#### 问题1：Embedding 调用总是走 Ollama

**根本原因：**
- `EmbeddingConfig` 类型定义中没有 `provider` 字段
- `EmbeddingService` 代码检查 `config.provider === 'cloud'`
- 由于 `provider` 不存在，值为 `undefined`，代码总是走 else 分支调用 Ollama
- Ollama 未运行时连接失败

**修复方案：**
1. 在 `EmbeddingConfig` 类型中添加 `provider?: 'cloud' | 'local'` 字段
2. 在 `EmbeddingService` 中添加 `shouldUseCloud()` 方法智能判断：
   - 如果明确指定了 `provider`，使用指定值
   - 如果有 `providerConfigId`，使用云端
   - 否则使用本地 Ollama
3. 在前端 `selectEmbeddingModel()` 中，创建 `embeddingConfig` 时包含 `provider` 字段

**修改文件：**
- `src/shared/types/knowledge-base.types.ts` - 添加 `provider` 字段
- `src/main/services/embedding.service.ts` - 添加 `shouldUseCloud()` 方法
- `src/renderer/src/composables/useKnowledgeBase.ts` - 保存 `provider` 到配置

#### 问题2：DashScope API 批量请求限制

**错误信息：**
```
batch size is invalid, it should not be larger than 10
```

**根本原因：**
- DashScope Embedding API 一次最多处理 10 个文本
- 文档切片超过 10 个时请求失败

**修复方案：**
- 添加 `embedBatchWithCloudChunked()` 方法
- 将大量文本分批（每批 10 个）调用 API
- 合并所有批次的结果

**修改文件：**
- `src/main/services/embedding.service.ts` - 添加分批处理逻辑

#### 问题3：PDF 解析在 Electron 主进程中失败

**错误信息：**
```
ReferenceError: DOMMatrix is not defined
```

**根本原因：**
- `pdf-parse` 底层使用 pdf.js
- pdf.js 是为浏览器设计的，需要 `DOMMatrix`, `ImageData`, `Path2D` 等 DOM API
- Electron 主进程是 Node.js 环境，没有这些 API

**修复方案：**
- 使用 `pdf2json` 替代 `pdf-parse`
- `pdf2json` 是纯 JavaScript 实现，不依赖任何浏览器 API

**安装依赖：**
```bash
npm install pdf2json
```

**修改文件：**
- `src/main/services/document-parser.service.ts` - 使用 pdf2json 解析 PDF

#### 问题4：向量维度不匹配

**错误信息：**
```
No vector column found to match with the query vector dimension: 1024
```

**根本原因：**
- LanceDB 表创建时使用了 1536 维占位符
- DashScope 返回的是 1024 维向量
- 查询向量维度与表 schema 不匹配

**修复方案：**
- 修改 LanceDB 服务，在第一次插入向量时动态创建表
- 根据实际向量维度创建表 schema

**修改文件：**
- `src/main/services/lance-db.service.ts` - 延迟创建表，动态确定维度

#### 问题5：UI 卡顿

**问题描述：**
- 文档处理时界面卡住

**根本原因：**
- 文档处理（解析、向量化）在主进程事件循环中执行
- 长时间操作阻塞了 UI 响应

**修复方案：**
- 使用 `setImmediate()` 让出事件循环控制权
- 在处理步骤之间插入 yield 点

**修改文件：**
- `src/main/services/knowledge-base.service.ts` - 添加 `yieldToEventLoop()` 方法

---

**构建验证：** ✅ 通过

### 文件清单

```
src/
├── main/
│   ├── database/
│   │   └── repositories/
│   │       ├── knowledge-base.repository.ts
│   │       ├── kb-document.repository.ts
│   │       ├── kb-chunk.repository.ts
│   │       ├── kb-vector.repository.ts
│   │       └── kb-inverted-index.repository.ts
│   ├── ipc/
│   │   └── handlers/
│   │       ├── knowledge-base.handler.ts
│   │       ├── export.handler.ts（新增）
│   │       └── file.handler.ts（更新）
│   └── services/
│       ├── knowledge-base.service.ts
│       ├── document-parser.service.ts
│       ├── embedding.service.ts
│       └── retrieval.service.ts
├── preload/
│   └── index.ts (已更新)
├── renderer/
│   └── src/
│       ├── stores/
│       │   └── knowledge-base.ts
│       ├── composables/
│       │   └── useKnowledgeBase.ts
│       ├── components/
│       │   └── chat/
│       │       └── MessageItem.vue（更新 - 添加导出/保存菜单）
│       └── views/
│           └── KnowledgeBase.vue
└── shared/
    └── types/
        └── knowledge-base.types.ts
```

---

## 2026-03-26 更新

### AI 消息导出/保存功能

**需求：** 在 AI 回答消息的操作栏中添加导出和保存功能

**实现功能：**
1. **保存功能**
   - 保存为本地 Markdown 文件：弹出保存对话框，选择路径后保存
   - 保存到知识库：弹出知识库选择对话框，将 AI 回答保存到选中的知识库

2. **导出功能**
   - 导出为图片：开发中
   - 导出为 Word：开发中
   - 导出到 Obsidian：选择 Obsidian vault 路径后保存为 Markdown 文件

**修改文件：**
- `src/renderer/src/components/chat/MessageItem.vue`
  - 添加下拉菜单按钮（More 图标）
  - 实现嵌套子菜单（保存、导出）
  - 添加知识库选择对话框
  - 实现各功能处理函数

- `src/preload/index.ts`
  - 添加 `file.saveFile()` - 保存文件对话框
  - 添加 `file.writeTextFile()` - 写入文本文件
  - 添加 `file.openFolderDialog()` - 打开文件夹选择对话框
  - 添加 `knowledgeBase.addDocument()` - 直接添加文本到知识库
  - 添加 `export` API 命名空间

- `src/main/ipc/handlers/file.handler.ts`
  - 添加 `file:save-dialog` 处理器
  - 添加 `file:write-text` 处理器
  - 添加 `file:open-folder-dialog` 处理器

- `src/main/ipc/handlers/export.handler.ts`（新增）
  - 添加 `export:message-image` 处理器（开发中）
  - 添加 `export:message-word` 处理器（开发中）

- `src/main/ipc/handlers/knowledge-base.handler.ts`
  - 添加 `knowledge-base:add-document` 处理器

- `src/main/services/knowledge-base.service.ts`
  - 添加 `addDocument()` 方法 - 直接添加文本内容到知识库

- `src/main/index.ts`
  - 注册导出处理器

**构建验证：** ✅ 通过

---

## 2026-03-28 更新

### 数据库空间占用问题修复

**问题描述：**
- 数据库文件 + WAL 文件占用约 700+ MB
- 用户感觉数据量不大，不应该占用这么大空间

**根本原因分析：**
1. **倒排索引表（kb_inverted_index）异常膨胀**
   - 表中有 191 万条记录
   - 但实际只有 4 个文档、5470 个切片

2. **分词逻辑错误**
   - 原代码对中文逐字分词（`chunk.content.match(/[\u4e00-\u9fa5]/g)`）
   - 每个切片约 350 个单字，5470 个切片 × 350 ≈ 191 万条索引
   - nodejieba 已安装但未被使用

3. **WAL 文件未正确 checkpoint**
   - WAL 文件达到 381 MB，几乎等于主数据库大小

**修复方案：**

1. **清理垃圾索引数据**
   ```sql
   DELETE FROM kb_inverted_index;  -- 清理 191 万条错误数据
   VACUUM;  -- 回收空间
   PRAGMA wal_checkpoint(TRUNCATE);  -- 合并 WAL 文件
   ```

2. **修复分词逻辑**
   - 导入 nodejieba 模块
   - 使用 `nodejieba.cutForSearch()` 搜索引擎模式分词
   - 添加中文停用词过滤
   - 过滤单字（除非特定场景）

**修复后效果：**
- 主数据库: 380 MB → **21 MB**（减少约 95%）
- WAL 文件: 381 MB → **0 bytes**
- 总空间占用: ~760 MB → **~22 MB**

**修改文件：**
- `src/main/services/knowledge-base.service.ts` - 修复 buildIndex 分词逻辑

**注意：**
- 已清理的文档需要重新处理才能建立正确的倒排索引
- LanceDB 向量数据不受影响（已单独存储）