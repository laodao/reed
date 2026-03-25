# 知识库模块代码复盘分析

## 一、架构概览

### 1.1 模块结构

```
知识库模块
├── 主进程 (Main Process)
│   ├── services/
│   │   ├── knowledge-base.service.ts    # 核心业务服务
│   │   ├── embedding.service.ts          # 向量化服务
│   │   ├── retrieval.service.ts          # 检索服务
│   │   ├── document-parser.service.ts    # 文档解析服务（未被使用！）
│   │   ├── document-worker-manager.ts    # 工作线程管理器
│   │   └── lance-db.service.ts           # 向量数据库
│   ├── workers/
│   │   └── document-worker.ts            # 文档处理工作线程
│   ├── ipc/handlers/
│   │   └── knowledge-base.handler.ts     # IPC 处理器
│   └── database/repositories/
│       ├── knowledge-base.repository.ts  # 知识库仓库
│       ├── kb-document.repository.ts     # 文档仓库
│       ├── kb-chunk.repository.ts        # 切片仓库
│       ├── kb-vector.repository.ts       # 向量仓库
│       └── kb-inverted-index.repository.ts # 倒排索引仓库
├── 渲染进程 (Renderer)
│   └── views/KnowledgeBase.vue           # 知识库页面
└── 共享类型
    └── types/knowledge-base.types.ts     # 类型定义
```

### 1.2 数据流

```
用户上传文件
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ uploadDocuments()                                            │
│ 1. 检查知识库是否存在                                         │
│ 2. 检查文件数量限制                                           │
│ 3. 创建存储目录                                               │
│ 4. 复制文件到数据目录                                          │
│ 5. 创建文档记录                                               │
│ 6. 异步触发 processDocument()                                │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ processDocument() [后台处理]                                  │
│                                                              │
│ Step 1: 解析文档 (Worker 线程)                               │
│   └── workerManager.parseAndChunk()                          │
│       → document-worker.ts                                   │
│           → parseDocument() 支持 txt/md/docx/xlsx           │
│           → chunkDocument() 按固定大小切分                    │
│                                                              │
│ Step 2: 存储切片                                             │
│   └── kbChunks.createBatch() 批量创建                        │
│                                                              │
│ Step 3: 生成向量                                             │
│   └── embeddingService.embedBatch()                          │
│       → 支持多提供商: OpenAI, DashScope, Zhipu, VolcEngine   │
│                                                              │
│ Step 4: 存储向量                                             │
│   └── kbVectors.createBatch() → LanceDB                     │
│                                                              │
│ Step 5: 构建倒排索引                                         │
│   └── buildInvertedIndex()                                   │
│       → tokenize() 使用 nodejieba 分词                       │
│       → kbInvertedIndex.insertBatch()                        │
│                                                              │
│ Step 6: 更新状态                                             │
│   └── markCompleted() / markFailed()                         │
└─────────────────────────────────────────────────────────────┘
```

## 二、发现的问题

### 2.1 架构问题

#### 问题1: DocumentParserService 未被使用
- `document-parser.service.ts` 定义了完整的文档解析逻辑
- 但实际使用的是 `document-worker.ts` 中的简化版实现
- 两者存在重复代码，且功能不一致

#### 问题2: Worker 线程方案过于复杂
- 引入了工作线程，但配置复杂
- 构建配置需要单独处理 worker 入口
- 容易出现"找不到模块"错误
- 当前错误：工作线程文件找不到

#### 问题3: 分词逻辑重复
- `knowledge-base.service.ts` 中的 `tokenize()` 使用 nodejieba
- `retrieval.service.ts` 中的 `tokenize()` 使用简单分词
- 两者逻辑不一致，可能导致索引和检索不匹配

### 2.2 错误处理问题

#### 问题4: 静默失败
```typescript
// knowledge-base.service.ts 第 383-386 行
private async processDocument(document: KbDocument, kb: KnowledgeBase): Promise<void> {
  const dbManager = getDatabaseManager()
  if (!dbManager.kbDocuments || !dbManager.kbChunks || ...) {
    return  // 静默返回，不报错！
  }
```
- 多处存在静默失败，不抛出错误
- 前端无法获知失败原因

#### 问题5: 异步处理错误丢失
```typescript
// knowledge-base.service.ts 第 262-266 行
for (const doc of createdDocs) {
  this.processDocument(doc, kb).catch(err => {
    console.error('[KnowledgeBaseService] 文档处理错误:', err)
  })
}
```
- 文档处理是异步的，错误只打印到控制台
- 用户看不到错误信息
- 应该更新文档状态为 failed 并记录错误

#### 问题6: Worker 线程错误处理不足
```typescript
// document-worker-manager.ts 第 130-137 行
setTimeout(() => {
  if (this.pendingCallback) {
    this.pendingCallback = { success: false, error: '处理超时' }
    this.pendingCallback = null
  }
}, 60000)
```
- 超时处理后没有清理 worker 状态
- 可能导致后续请求无法处理

### 2.3 代码质量问题

#### 问题7: 类型不一致
```typescript
// document-worker.ts 定义的 ParseResult
interface ParseResult {
  success: boolean
  content?: string
  error?: string
  chunks?: Array<{...}>
}

// document-worker-manager.ts 定义的 ParseResult
interface ParseResult {
  success: boolean
  content?: string
  error?: string
  chunks?: Array<{...}>
}
```
- 相同接口定义了两次，应该共享

#### 问题8: 文件路径问题
```typescript
// document-worker-manager.ts 第 51-53 行
const workerPath = app.isPackaged
  ? path.join(process.resourcesPath, 'workers', 'document-worker.js')
  : path.join(__dirname, '../workers/document-worker.js')
```
- 开发模式下路径是 `out/workers/document-worker.js`
- 但实际构建后路径可能不同
- 需要检查 electron.vite.config.ts 的输出配置

#### 问题9: 进度计算不准确
```typescript
// knowledge-base.service.ts 第 429 行
const progress = 40 + Math.floor((i / chunks.length) * 10)
```
- 进度百分比计算分散在多处
- 魔法数字 40, 50, 80, 90 等
- 难以维护

### 2.4 功能缺失

#### 问题10: 重复上传检测缺失
- 同一文件可以重复上传
- 可能导致重复处理和资源浪费

#### 问题11: 处理进度无实时推送
- 文档处理进度更新到数据库
- 但前端需要手动刷新才能看到
- 应该通过 IPC 事件推送进度

#### 问题12: 取消处理功能缺失
- 大文件上传后无法取消处理
- 只能等待完成或失败

## 三、清理方案

### 3.1 短期修复（优先级高）

#### 修复1: 统一 Worker 文件路径
- 确保 electron.vite.config.ts 正确配置 worker 输出
- 修改 document-worker-manager.ts 使用正确的路径

#### 修复2: 改进错误处理
- processDocument() 失败时正确记录到数据库
- 移除静默失败，改为抛出异常或记录错误

#### 修复3: 统一分词逻辑
- 将 nodejieba 分词提取到独立模块
- 在索引和检索时使用相同的分词函数

### 3.2 中期重构（建议）

#### 重构1: 简化 Worker 方案
- 考虑移除 Worker 线程
- 使用 child_process 或直接异步处理
- 或者保留但简化初始化流程

#### 重构2: 添加事件推送
- 文档处理进度通过 IPC 推送到前端
- 前端监听进度事件实时更新 UI

#### 重构3: 统一文档解析服务
- 合并 DocumentParserService 和 document-worker
- 只保留一套实现

### 3.3 代码清理清单

1. [ ] 删除未使用的 `document-parser.service.ts` 或将其与 worker 合并
2. [ ] 统一 `ParseResult` 类型定义，放到 shared/types
3. [ ] 提取分词逻辑到 `tokenization.service.ts`
4. [ ] 移除所有静默失败，改为明确错误处理
5. [ ] 添加常量定义处理进度百分比
6. [ ] 修复 Worker 文件路径问题
7. [ ] 添加文档处理错误的前端提示

## 四、已完成修复

### 修复1: Worker 文件路径问题 ✅
- **问题**: 开发模式下 Worker 文件路径错误
- **修复**: 将 `../workers/document-worker.js` 改为 `./workers/document-worker.js`
- **文件**: `document-worker-manager.ts`

### 修复2: LanceDB API 兼容性问题 ✅
- **问题**: LanceDB 0.27.1 版本中 `filter` 方法不存在
- **修复**: 改用 `query().where()` 方法
- **文件**: `lance-db.service.ts`

### 修复3: 统一分词服务 ✅
- **问题**: 知识库服务和检索服务使用不同的分词逻辑
- **修复**: 创建统一的 `TokenizationService`，两处都使用它
- **文件**: 新增 `tokenization.service.ts`，更新 `knowledge-base.service.ts` 和 `retrieval.service.ts`

### 修复4: 移除未使用的依赖 ✅
- **问题**: `DocumentParserService` 已不再使用但仍在导入
- **修复**: 移除导入，清理构造函数

### 修复5: 改进错误处理 ✅
- **问题**: `processDocument` 中数据库未初始化时静默返回
- **修复**: 添加错误日志，并在可能的情况下标记文档失败

## 五、测试结果

启动日志显示所有服务正常：
```
[LanceDBService] 已打开现有向量表，维度: 1024
[TokenizationService] nodejieba 加载成功
[DocumentWorkerManager] 工作线程已就绪
[DocumentWorker] 工作线程已启动
```

## 六、待优化项

1. **进度实时推送**: 文档处理进度应通过 IPC 事件推送到前端
2. **取消处理功能**: 大文件上传后无法取消处理
3. **重复上传检测**: 同一文件可能被重复上传
4. **代码清理**: `document-parser.service.ts` 保留备用，但当前未使用

## 七、关键修复：切分函数无限循环导致内存崩溃

### 问题现象
- 上传任意文档都会导致内存爆炸（几GB）然后崩溃
- 几十KB 的 txt 文件也会触发问题

### 根本原因
**切分函数 `splitText` 有无限循环 bug**

```typescript
// 有 bug 的代码
while (start < text.length) {
  let end = Math.min(start + CHUNK_SIZE, text.length)
  // ...
  start = end - OVERLAP  // 这里可能不前进！
  if (start >= text.length) break
}
```

当文本长度接近 CHUNK_SIZE 整数倍时：
1. `end = text.length`（到达末尾）
2. `start = text.length - OVERLAP`
3. 如果 `start` 已经等于或大于上一个 `start`，循环会卡住
4. 每次循环都创建新字符串，内存无限增长

### 修复方案
```typescript
// 修复后的代码
const nextStart = end - OVERLAP
start = (nextStart <= start) ? end : nextStart  // 确保 start 总是前进
```

### 测试验证
```
[KB] 开始处理: 中华人民共和国政府采购法.docx
[KB] 解析完成, 长度: 9488
[KB] 切分完成, 数量: 15
[LanceDBService] 已插入 10 条向量记录
[LanceDBService] 已插入 5 条向量记录
[KB] 处理完成: 中华人民共和国政府采购法.docx
```

### 经验教训
1. **循环必须有明确的退出条件**：`while` 循环中，循环变量必须保证每次迭代都在前进
2. **边界条件测试很重要**：当文本长度接近 CHUNK_SIZE 整数倍时最容易触发
3. **单元测试能有效定位问题**：逐步隔离测试每个方法，最终找到问题所在

## 八、UI 自动刷新问题修复（2026-03-25）

### 问题现象
1. 文档处理进度和状态不会自动刷新
2. 知识库列表中的文档数量不会自动刷新
3. 知识库的向量数会小于0（删除未处理完成的文档导致）

### 根本原因分析

#### 问题1和2：缺少 IPC 事件推送
- 文档处理是异步的，进度更新只写入数据库
- 前端没有机制获知进度变化
- 知识库统计（文档数、向量数）变化也没有通知前端

#### 问题3：向量计数逻辑错误
```typescript
// 错误代码
const chunkCount = db.kbChunks.countByDocumentId(docId)  // 从数据库统计切片数
db.knowledgeBases.incrementVectorCount(doc.knowledgeBaseId, -chunkCount)
```
问题：
- 切片创建后立即写入数据库
- 但向量只有在处理完成时才添加
- 删除未完成文档时，切片数 > 实际向量数
- 知识库的 `vector_count` 可能变成负数

### 修复方案

#### 修复1：添加 IPC 事件推送
新增三个 IPC 事件通道：
```typescript
const KB_EVENTS = {
  DOCUMENT_PROGRESS: 'kb:document-progress',   // 文档处理进度
  DOCUMENT_STATUS: 'kb:document-status',       // 文档状态变化
  KNOWLEDGE_BASE_STATS: 'kb:stats'             // 知识库统计更新
}
```

主进程在关键节点发送事件：
- `emitProgress()` - 处理进度变化时
- `emitStatus()` - 状态变化时（完成/失败）
- `emitKnowledgeBaseStats()` - 统计更新时

#### 修复2：前端监听事件更新 UI
Store 中设置事件监听：
```typescript
// 监听文档处理进度
window.electronAPI.knowledgeBase.onDocumentProgress((data) => {
  const doc = documents.value.find(d => d.id === data.documentId)
  if (doc) {
    doc.progress = data.progress
    if (doc.status === 'pending') doc.status = 'processing'
  }
})

// 监听知识库统计更新
window.electronAPI.knowledgeBase.onStatsUpdate((data) => {
  // 更新列表和当前知识库的统计数据
})
```

#### 修复3：使用文档的 chunkCount 字段计算向量数
```typescript
// 正确代码
const vectorCount = doc.chunkCount || 0  // 只有处理完成时才设置
db.knowledgeBases.incrementVectorCount(kbId, -vectorCount)
```
- `chunkCount` 只有在 `markCompleted()` 时才设置
- 如果处理未完成，`chunkCount` 为 0
- 避免向量数变成负数

### 修改的文件
1. `src/main/services/knowledge-base.service.ts`
   - 添加 IPC 事件发送方法
   - 在 `processDocument()` 中发送进度和状态事件
   - 在 `uploadDocuments()` 和 `deleteDocument()` 中发送统计更新事件
   - 修复 `deleteDocument()` 中的向量计数逻辑

2. `src/preload/index.ts`
   - 添加三个事件监听方法到 `knowledgeBase` API

3. `src/renderer/src/stores/knowledge-base.ts`
   - 添加 `setupEventListeners()` 设置事件监听
   - 添加 `cleanupEventListeners()` 清理事件监听
   - 添加 `dispose()` 方法用于清理
   - Store 初始化时自动设置事件监听

## 九、预估完成时间功能（2026-03-25）

### 功能描述
在文档处理过程中，实时显示预计剩余时间，让用户了解处理进度。

### 实现方案

#### 时间估算逻辑
1. **初始化预估**：基于切片数量和预估批次时间（约 2 秒/批次）
2. **动态调整**：根据实际 API 响应时间动态调整剩余时间
3. **阶段区分**：
   - 解析阶段：不显示预估时间
   - 向量生成阶段：根据剩余批次和平均处理时间计算
   - 索引阶段：固定显示约 3 秒

#### 前端显示
- 状态列宽度从 120px 增加到 160px
- 处理中状态显示：状态标签 + 进度条 + 预估剩余时间
- 时间格式化：
  - < 60 秒：`约 30 秒`
  - < 1 小时：`约 5 分 30 秒`
  - >= 1 小时：`约 2 小时 15 分`

### 示例显示
```
处理中
[=========>          ] 45%
约 8 分 30 秒
```

### 修改的文件
1. `src/main/services/knowledge-base.service.ts`
   - `emitProgress()` 方法添加 `estimatedSeconds` 参数
   - `processDocument()` 中计算并推送预估时间

2. `src/preload/index.ts`
   - 更新事件回调参数类型

3. `src/renderer/src/stores/knowledge-base.ts`
   - 添加 `documentEstimatedTimes` 状态保存预估时间
   - 状态变化时自动清理预估时间

4. `src/renderer/src/composables/useKnowledgeBase.ts`
   - 添加 `formatEstimatedTime()` 格式化时间函数
   - 添加 `getEstimatedTime()` 获取预估时间

5. `src/renderer/src/views/KnowledgeBase.vue`
   - 状态列显示预估剩余时间
   - 添加 `.estimated-time` 样式