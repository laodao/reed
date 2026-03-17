# AI对话模块 - 用户故事

**模块名称：** AI对话
**所属Epic：** EPIC-001 AI对话核心系统
**优先级：** Must Have
**Sprint：** 第2周
**日期：** 2026-03-01

---

## 故事列表

| 故事ID | 故事名称 | 故事点数 | 优先级 | 状态 |
|--------|----------|----------|--------|------|
| DIA-001 | 多模型支持与切换 | 5 | Must Have | 待开发 |
| DIA-002 | 对话界面与消息收发 | 5 | Must Have | 待开发 |
| DIA-003 | 角色预设系统 | 5 | Must Have | 待开发 |
| DIA-004 | 对话历史管理 | 3 | Should Have | 待开发 |
| DIA-005 | 流式输出与Markdown渲染 | 3 | Must Have | 待开发 |

---

## DIA-001: 多模型支持与切换

### 用户故事

```
作为一个 用户
我想要 在不同AI模型之间切换
以便 根据不同场景选择最合适的模型
```

### 描述

**背景：**
不同的AI模型有不同的特点和优势，用户需要能够根据任务需求选择合适的模型。

**范围：**
- 支持多个AI服务提供商
- 模型快速切换
- 模型状态显示

**用户流程：**
1. 用户进入对话页面
2. 点击顶部模型选择器
3. 展开模型列表
4. 查看各模型状态（已配置/未配置/可用/不可用）
5. 选择目标模型
6. 系统切换模型并更新状态指示

### 验收标准

- [ ] 支持以下模型提供商：
  - [ ] 通义千问 (qwen-turbo, qwen-plus, qwen-max)
  - [ ] 豆包 (doubao-pro, doubao-lite)
  - [ ] GLM (glm-4, glm-3-turbo)
  - [ ] DeepSeek (deepseek-chat, deepseek-coder)
- [ ] 模型选择器显示在对话页面顶部
- [ ] 显示当前选中的模型
- [ ] 显示模型连接状态（绿色=已连接，灰色=未配置）
- [ ] 点击模型选择器展开模型列表
- [ ] 未配置的模型显示"配置"入口
- [ ] 切换模型后后续对话使用新模型
- [ ] 记住用户上次选择的模型

### 技术说明

**涉及的组件：**
- 前端：DialogView.vue, ModelSelector.vue
- 后端：dialog.service.ts, providers/
- IPC：dialog-handler.ts

**API接口：**
```typescript
// 获取可用模型列表
IPC.getAvailableModels(): Promise<Result<Model[]>>

// 切换模型
IPC.switchModel(modelId: string): Promise<Result<void>>

// 检查模型状态
IPC.checkModelStatus(modelId: string): Promise<Result<{ available: boolean, latency?: number }>>
```

**数据模型：**
```typescript
interface Model {
  id: string;
  name: string;
  provider: string;
  configured: boolean;
  available: boolean;
}
```

### 故事点数：5

**估算依据：**
- 前端模型选择器：2点
- 后端多模型适配：2点
- 状态检测：1点

### 依赖

- SET-001（API密钥管理）

---

## DIA-002: 对话界面与消息收发

### 用户故事

```
作为一个 用户
我想要 在友好的界面中进行AI对话
以便 与AI进行多轮交流
```

### 描述

**背景：**
对话界面是用户与AI交互的核心入口，需要提供清晰、流畅的对话体验。

**范围：**
- 对话消息显示区域
- 消息输入区域
- 消息发送和接收
- 多轮对话上下文保持

**用户流程：**
1. 用户在输入框输入消息
2. 按Enter或点击发送按钮
3. 用户消息显示在对话区
4. 系统显示加载状态
5. AI响应流式显示
6. 对话历史自动保存

### 验收标准

- [ ] 对话区域显示用户和AI消息
- [ ] 用户消息和AI消息有明显区分（位置、颜色）
- [ ] 支持多轮对话，保持上下文
- [ ] 输入框支持多行文本
- [ ] Enter发送，Shift+Enter换行
- [ ] 发送时显示加载状态
- [ ] AI响应流式显示（逐字出现）
- [ ] 支持停止生成按钮
- [ ] 空消息不允许发送
- [ ] 消息支持复制功能
- [ ] 支持清空当前对话

### 技术说明

**涉及的组件：**
- 前端：DialogView.vue, ChatMessage.vue, ChatInput.vue
- 后端：dialog.service.ts
- IPC：dialog-handler.ts

**API接口：**
```typescript
// 发送消息
IPC.sendMessage(params: {
  conversationId?: string,
  message: string,
  model: string,
  roleId?: string
}): Promise<Result<{ conversationId: string, messageId: string }>>

// 流式接收（SSE）
IPC.streamMessage(conversationId: string): EventEmitter

// 停止生成
IPC.stopGeneration(conversationId: string): Promise<Result<void>>
```

### 故事点数：5

**估算依据：**
- 对话界面布局：2点
- 消息收发逻辑：2点
- 流式处理：1点

### 依赖

- DIA-001（多模型支持）

---

## DIA-003: 角色预设系统

### 用户故事

```
作为一个 用户
我想要 使用预设的AI角色
以便 获得专业领域的定制化回答
```

### 描述

**背景：**
不同的使用场景需要不同风格的AI助手。通过角色预设，用户可以快速切换AI的专业领域和回答风格。

**范围：**
- 预设角色列表
- 自定义角色创建
- 角色选择和应用
- 角色管理

**用户流程：**
1. 用户在对话界面点击角色选择器
2. 显示角色列表
3. 用户选择一个角色
4. 后续对话使用该角色的系统提示词
5. 用户可以创建自定义角色

### 验收标准

- [ ] 提供至少10个预设角色：
  - [ ] 通用助手
  - [ ] 编程专家
  - [ ] 设计顾问
  - [ ] 文案策划
  - [ ] 翻译专家
  - [ ] 数据分析师
  - [ ] 教学助手
  - [ ] 视频创作者
  - [ ] 图像创作者
  - [ ] 项目经理
- [ ] 用户可以创建自定义角色
- [ ] 自定义角色可设置：名称、描述、系统提示词、头像
- [ ] 用户可以编辑自定义角色
- [ ] 用户可以删除自定义角色
- [ ] 角色选择器显示在对话界面
- [ ] 选择角色后对话中生效

### 技术说明

**涉及的组件：**
- 前端：RoleSelector.vue, RoleCard.vue, RoleEditor.vue
- 后端：role.service.ts
- 数据库：roles表

**数据模型：**
```typescript
interface Role {
  id: string;
  name: string;
  description?: string;
  systemPrompt: string;
  avatar?: string;
  isPreset: boolean;
  createdAt: Date;
}
```

**API接口：**
```typescript
IPC.getRoles(): Promise<Result<Role[]>>
IPC.createRole(role: Omit<Role, 'id' | 'isPreset' | 'createdAt'>): Promise<Result<Role>>
IPC.updateRole(id: string, role: Partial<Role>): Promise<Result<void>>
IPC.deleteRole(id: string): Promise<Result<void>>
```

### 故事点数：5

**估算依据：**
- 角色选择器：1.5点
- 角色管理界面：2点
- 后端CRUD：1.5点

### 依赖

- DIA-002（对话界面）

---

## DIA-004: 对话历史管理

### 用户故事

```
作为一个 用户
我想要 查看和管理历史对话
以便 继续之前的对话或回顾内容
```

### 描述

**背景：**
用户可能需要回顾之前的对话内容，或者继续某个未完成的话题。

**范围：**
- 对话历史列表
- 搜索历史对话
- 继续历史对话
- 导出/删除对话

**用户流程：**
1. 用户点击侧边栏"历史记录"
2. 显示历史对话列表（按日期分组）
3. 用户可以搜索关键词
4. 点击对话可查看详情并继续
5. 用户可以导出或删除对话

### 验收标准

- [ ] 自动保存所有对话历史
- [ ] 历史对话按日期分组显示
- [ ] 支持搜索历史对话内容
- [ ] 点击历史对话可继续对话
- [ ] 支持导出对话为Markdown格式
- [ ] 支持删除单个对话
- [ ] 支持批量删除对话
- [ ] 删除前需二次确认
- [ ] 显示对话的基本信息（标题、时间、消息数）

### 技术说明

**涉及的组件：**
- 前端：HistoryPanel.vue, ConversationDetail.vue
- 后端：conversation.service.ts
- 数据库：conversations, messages表

**数据模型：**
```typescript
interface Conversation {
  id: string;
  title: string;
  model: string;
  roleId?: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}
```

### 故事点数：3

**估算依据：**
- 历史列表界面：1.5点
- 搜索和导出：1点
- 后端查询：0.5点

### 依赖

- DIA-002（对话界面）

---

## DIA-005: 流式输出与Markdown渲染

### 用户故事

```
作为一个 用户
我想要 看到AI响应实时显示并正确渲染格式
以便 获得流畅的阅读体验
```

### 描述

**背景：**
AI响应可能包含代码块、列表、表格等Markdown格式，需要正确渲染。同时流式输出可以提供更好的交互体验。

**范围：**
- 流式文本输出
- Markdown渲染
- 代码语法高亮
- 代码复制

**用户流程：**
1. 用户发送消息
2. AI响应逐字流式显示
3. Markdown内容实时渲染
4. 代码块显示语法高亮
5. 用户可复制代码

### 验收标准

- [ ] AI响应流式显示，逐字出现
- [ ] 支持Markdown渲染：
  - [ ] 标题（h1-h6）
  - [ ] 列表（有序/无序）
  - [ ] 代码块
  - [ ] 引用
  - [ ] 表格
  - [ ] 链接
  - [ ] 图片
- [ ] 代码块支持语法高亮
- [ ] 代码块显示复制按钮
- [ ] 复制成功显示提示
- [ ] 数学公式渲染（可选）

### 技术说明

**涉及的组件：**
- 前端：ChatMessage.vue, MarkdownRenderer.vue
- 依赖库：marked.js, highlight.js

**实现要点：**
- 使用marked.js解析Markdown
- 使用highlight.js实现代码高亮
- 流式输出时实时更新DOM

### 故事点数：3

**估算依据：**
- Markdown渲染：1.5点
- 代码高亮：1点
- 流式显示优化：0.5点

### 依赖

- DIA-002（对话界面）

---

## 模块验收标准

- [ ] 所有5个故事完成
- [ ] 完整的多模型对话体验
- [ ] 角色系统正常工作
- [ ] 历史记录功能完整
- [ ] Markdown渲染正确

---

**返回：** [故事总体大纲](./stories-overview.md)
