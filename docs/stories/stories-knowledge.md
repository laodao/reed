# 知识库模块 - 用户故事

**模块名称：** 知识库
**所属Epic：** EPIC-004 知识管理与智能搜索
**优先级：** Should Have
**Sprint：** 第3周
**日期：** 2026-03-01

---

## 故事列表

| 故事ID | 故事名称 | 故事点数 | 优先级 | 状态 |
|--------|----------|----------|--------|------|
| KNO-001 | 知识库创建与文档导入 | 5 | Must Have | 待开发 |
| KNO-002 | 知识库检索与RAG | 5 | Must Have | 待开发 |
| KNO-003 | 知识库与对话集成 | 3 | Must Have | 待开发 |

---

## KNO-001: 知识库创建与文档导入

### 用户故事

```
作为一个 专业用户
我想要 创建知识库并导入文档
以便 构建个人知识体系
```

### 描述

**背景：**
用户需要管理大量文档资料，并通过知识库的方式进行组织和利用。

**范围：**
- 创建知识库
- 导入文档
- 文档解析
- 向量化处理

**用户流程：**
1. 用户进入知识库页面
2. 点击"新建知识库"
3. 填写名称和描述
4. 创建知识库
5. 进入知识库管理
6. 导入文档
7. 系统解析和向量化
8. 显示处理进度

### 验收标准

- [ ] 支持创建知识库
- [ ] 知识库可设置名称和描述
- [ ] 支持选择嵌入模型
- [ ] 支持导入文档：
  - [ ] PDF
  - [ ] Word (DOCX)
  - [ ] TXT
  - [ ] Markdown
  - [ ] HTML
- [ ] 支持拖拽上传
- [ ] 显示上传进度
- [ ] 文档自动解析
- [ ] 显示解析进度
- [ ] 显示文档列表
- [ ] 显示文档状态（处理中/已完成/失败）
- [ ] 支持删除文档
- [ ] 显示知识库统计信息

### 技术说明

**涉及的组件：**
- 前端：KnowledgeView.vue, KnowledgeCreator.vue, DocumentUploader.vue
- 后端：knowledge.service.ts, document-parser.service.ts, embedding.service.ts
- 数据库：knowledge_bases, documents, chunks表

**API接口：**
```typescript
// 创建知识库
IPC.createKnowledgeBase(params: {
  name: string,
  description?: string,
  embeddingModel: string
}): Promise<Result<KnowledgeBase>>

// 导入文档
IPC.importDocument(params: {
  knowledgeBaseId: string,
  filePath: string
}): Promise<Result<Document>>

// 获取知识库详情
IPC.getKnowledgeBase(id: string): Promise<Result<KnowledgeBase>>

// 获取文档列表
IPC.getDocuments(knowledgeBaseId: string): Promise<Result<Document[]>>
```

### 故事点数：5

**估算依据：**
- 知识库CRUD：1.5点
- 文档上传：1点
- 文档解析：1.5点
- 向量化：1点

### 依赖

- SET-001（API密钥管理，嵌入模型API）

---

## KNO-002: 知识库检索与RAG

### 用户故事

```
作为一个 专业用户
我想要 在知识库中搜索相关内容
以便 快速找到所需信息
```

### 描述

**背景：**
用户需要在知识库中进行语义搜索，找到与查询相关的内容片段。

**范围：**
- 语义搜索
- 向量检索
- 结果展示
- 来源定位

**用户流程：**
1. 用户进入知识库
2. 在搜索框输入查询
3. 系统进行语义检索
4. 显示相关片段列表
5. 显示相关度得分
6. 点击可查看原文位置

### 验收标准

- [ ] 支持语义搜索
- [ ] 输入搜索词后自动搜索
- [ ] 显示搜索结果列表
- [ ] 显示每个结果的相关度
- [ ] 显示来源文档名称
- [ ] 显示文本片段预览
- [ ] 高亮显示关键词
- [ ] 支持查看原文位置
- [ ] 支持复制片段内容
- [ ] 支持设置返回结果数量
- [ ] 支持设置相关度阈值

### 技术说明

**涉及的组件：**
- 前端：KnowledgeSearch.vue, SearchResult.vue
- 后端：search.service.ts, vector-store.service.ts

**检索流程：**
1. 将查询文本向量化
2. 在向量数据库中进行相似度搜索
3. 返回Top-K结果
4. 组装结果信息

**API接口：**
```typescript
// 搜索知识库
IPC.searchKnowledge(params: {
  knowledgeBaseId: string,
  query: string,
  topK: number,
  threshold?: number
}): Promise<Result<SearchResult[]>>

interface SearchResult {
  chunkId: string;
  content: string;
  score: number;
  documentName: string;
  metadata: object;
}
```

### 故事点数：5

**估算依据：**
- 搜索界面：1.5点
- 向量检索：2点
- 结果展示：1.5点

### 依赖

- KNO-001（知识库创建与文档导入）

---

## KNO-003: 知识库与对话集成

### 用户故事

```
作为一个 专业用户
我想要 在AI对话中使用知识库
以便 基于我的知识进行问答
```

### 描述

**背景：**
用户希望AI能够基于自己的知识库内容进行回答，实现个性化的知识问答。

**范围：**
- 对话关联知识库
- RAG增强生成
- 来源引用显示

**用户流程：**
1. 用户在对话界面
2. 选择"关联知识库"
3. 选择要使用的知识库
4. 输入问题
5. 系统检索相关内容
6. AI基于检索结果生成回答
7. 显示来源引用

### 验收标准

- [ ] 对话界面显示知识库选择器
- [ ] 可选择要关联的知识库
- [ ] 可同时关联多个知识库
- [ ] AI回答基于知识库内容
- [ ] 回答下方显示来源引用
- [ ] 引用显示文档名称和片段
- [ ] 点击引用可查看原文
- [ ] 未关联知识库时正常对话
- [ ] 知识库无相关内容时正常回答
- [ ] 显示检索到的相关片段数量

### 技术说明

**涉及的组件：**
- 前端：KnowledgeSelector.vue, SourceReference.vue
- 后端：rag.service.ts

**RAG流程：**
1. 用户提问
2. 检索关联知识库
3. 获取相关片段
4. 将片段作为上下文注入Prompt
5. 调用AI生成回答
6. 返回回答和来源信息

**API接口：**
```typescript
// RAG对话
IPC.ragChat(params: {
  conversationId?: string,
  message: string,
  knowledgeBaseIds: string[],
  model: string
}): Promise<Result<{
  response: string,
  sources: Source[]
}>>
```

### 故事点数：3

**估算依据：**
- 知识库选择器：1点
- RAG集成：1.5点
- 来源显示：0.5点

### 依赖

- KNO-002（知识库检索与RAG）
- DIA-002（对话界面）

---

## 模块验收标准

- [ ] 所有3个故事完成
- [ ] 知识库创建和管理功能正常
- [ ] 文档导入和解析功能正常
- [ ] 语义检索功能正常
- [ ] RAG对话功能正常
- [ ] 来源引用显示正常

---

**返回：** [故事总体大纲](./stories-overview.md)
