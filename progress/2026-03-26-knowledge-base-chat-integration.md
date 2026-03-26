# AI 对话关联知识库功能实现记录

**日期**: 2026-03-26

## 概述

实现了 AI 对话与知识库的集成功能，让 AI 能够参考知识库内容回答问题。

## 实现内容

### 1. 前端知识库列表加载

**文件**: `src/renderer/src/components/chat/AssistantEditor.vue`

- 实现了 `loadKnowledgeBases()` 函数
- 从知识库 API 获取列表并过滤出已有向量数据的知识库
- 支持在助手编辑器中选择关联知识库

### 2. 消息请求类型扩展

**文件**: `src/shared/types/message.types.ts`

- 在 `SendMessageRequest` 中添加了知识库相关字段：
  - `knowledgeBaseIds`: 关联的知识库 ID 列表
  - `knowledgeRetrieveCount`: 检索数量
  - `knowledgeThreshold`: 相似度阈值
- 新增 `KnowledgeBaseReference` 类型用于元数据存储

### 3. 前端发送消息逻辑

**文件**: `src/renderer/src/stores/dialog.ts`

- 在 `sendMessage` 方法中添加了从角色获取知识库配置的逻辑
- 将知识库配置传递给后端

### 4. Preload API 更新

**文件**: `src/preload/index.ts`

- 更新 `chat.send` 的参数类型，添加知识库字段

### 5. 后端知识库检索逻辑

**文件**: `src/main/services/chat.service.ts`

- 引入 `KnowledgeBaseService` 和 `SearchResult` 类型
- 在 `sendMessage` 方法中添加知识库检索逻辑：
  - 优先使用请求中的知识库配置，否则从角色获取
  - 对每个知识库执行向量检索
  - 按相似度排序并取 Top N 结果
  - 格式化为上下文字符串
- 更新消息元数据，记录知识库引用
- 添加 `formatKnowledgeContext` 辅助方法

### 6. Provider 知识库上下文注入

**文件**: `src/main/providers/sdk/openai-sdk-provider.ts`

- 在 `buildMessages` 方法中处理 `knowledgeContext`
- 将知识库上下文注入到 system prompt

**文件**: `src/main/providers/base-provider.ts`

- 在 `ChatOptions` 接口中添加 `knowledgeContext` 字段

### 7. 前端知识库引用显示

**文件**: `src/renderer/src/components/chat/MessageItem.vue`

- 添加知识库引用显示区域
- 显示引用的文档名称和相关度评分

## 技术细节

### 知识库检索流程

1. 用户发送消息
2. 前端从角色配置获取知识库参数
3. 后端对每个关联知识库执行向量检索
4. 合并所有检索结果并按相似度排序
5. 取 Top N 结果格式化为上下文
6. 注入到 AI 的 system prompt 中
7. AI 基于知识库内容回答问题

### 知识库上下文格式

```
【1】来源: 文档名称.docx
相关度: 95.2%

文档内容...

---

【2】来源: 另一个文档.md
相关度: 87.5%

文档内容...
```

## 验证步骤

1. 创建知识库并上传文档
2. 创建助手并关联知识库
3. 使用助手进行对话
4. 提问与知识库内容相关的问题
5. 观察 AI 是否引用了知识库内容
6. 检查消息元数据中的知识库引用

## 相关文件

- `src/renderer/src/components/chat/AssistantEditor.vue`
- `src/renderer/src/stores/dialog.ts`
- `src/shared/types/message.types.ts`
- `src/preload/index.ts`
- `src/main/services/chat.service.ts`
- `src/main/providers/sdk/openai-sdk-provider.ts`
- `src/main/providers/base-provider.ts`
- `src/renderer/src/components/chat/MessageItem.vue`

---

## 更新：2026-03-26 下午

### 问题修复

#### 1. txt 文件编码问题修复

**文件**: `src/main/services/knowledge-base.service.ts`

- 添加了 `decodeTextFile()` 方法，支持多种编码检测
- 支持的编码：UTF-8（含 BOM）、GBK、GB2312、Latin1
- 添加了 `hasGarbledChars()` 方法检测乱码
- 自动尝试多种编码直到找到无乱码的解码方式

#### 2. 文档分片查看功能

**文件**: `src/main/services/knowledge-base.service.ts`

- 添加了 `getDocumentChunks(documentId)` 方法
- 返回指定文档的所有分片数据

**文件**: `src/main/ipc/handlers/knowledge-base.handler.ts`

- 注册了 `knowledge-base:get-document-chunks` IPC 处理器

**文件**: `src/preload/index.ts`

- 添加了 `getDocumentChunks` API 暴露给渲染进程

**文件**: `src/renderer/src/stores/knowledge-base.ts`

- 添加了 `getDocumentChunks()` 方法调用 IPC API

**文件**: `src/renderer/src/composables/useKnowledgeBase.ts`

- 添加了 `getDocumentChunks()` 方法供组件使用

**文件**: `src/renderer/src/views/KnowledgeBase.vue`

- 在文档列表操作栏添加了"查看"按钮
- 添加了文档分片查看对话框
- 显示分片序号、页码和内容
- 仅在文档状态为 `completed` 时显示查看按钮

### 功能验证

1. 运行 `npm run build` 编译成功
2. 知识库模块的 txt 文件检索不再出现乱码
3. 文档列表的操作栏增加了"查看"按钮
4. 点击查看按钮可以查看文档的所有分片