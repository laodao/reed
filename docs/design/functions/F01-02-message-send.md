# F01-02 - 消息发送

## 1. 功能概述

| 属性 | 值 |
|-----|-----|
| 所属模块 | M01 - AI对话 |
| 功能编号 | F01-02 |
| 功能名称 | 消息发送 |
| 优先级 | P0 |
| 功能描述 | 发送消息并获取AI回复，支持流式输出 |

## 2. 操作流程

### 2.1 发送消息

```
用户在输入框输入消息
    │
    ▼
用户点击"发送"或按 Enter
    │
    ▼
前端验证消息非空
    │
    ├── 为空 → 不处理
    │
    ▼
创建用户消息，立即显示在界面
    │
    ▼
清空输入框
    │
    ▼
显示"AI正在输入..."状态
    │
    ▼
创建 AI 消息占位符
    │
    ▼
调用 dialog:send IPC（带 EventChannel）
    │
    ▼
主进程接收请求
    │
    ├── 获取对话信息
    │
    ├── 获取历史消息（根据上下文限制）
    │
    ├── 构建请求上下文
    │   │
    │   ├── 系统提示词（如果有）
    │   │
    │   ├── 历史消息
    │   │
    │   └── 当前用户消息
    │
    ▼
保存用户消息到数据库
    │
    ▼
调用 Provider API（流式）
    │
    ▼
通过 EventChannel 流式返回内容
    │   ┌─────────────────────────────────┐
    ├──▶│ 每收到一个 token 就发送一次     │
    │   └─────────────────────────────────┘
    │
    ▼
前端接收并实时更新 AI 消息
    │
    ▼
流式完成
    │
    ├── 保存 AI 消息到数据库
    │
    ├── 更新对话的 updated_at
    │
    ├── 如果是首次对话，生成标题
    │
    ▼
前端标记消息完成
```

### 2.2 中断生成

```
用户点击"停止生成"按钮
    │
    ▼
调用 IPC 取消请求
    │
    ▼
主进程中断 API 请求
    │
    ▼
保存已生成的内容
    │
    ▼
前端显示中断状态
```

## 3. 界面设计

### 3.1 消息输入区域

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│  [角色: 代码助手 ▼]                                              │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                                                            │ │
│  │  输入消息...                                               │ │
│  │                                                            │ │
│  │                                                            │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Shift+Enter 换行，Enter 发送                   [发送] 或 [停止] │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 消息显示区域

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 👤 你                                                       │ │
│  │    请帮我写一个 Python 爬虫                                 │ │
│  │                                         10:30  [复制]       │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 🤖 AI助手                                                   │ │
│  │    好的，我来帮你写一个简单的 Python 爬虫...                │ │
│  │                                                            │ │
│  │    ```python                                               │ │
│  │    import requests                                         │ │
│  │    from bs4 import BeautifulSoup                           │ │
│  │    ...                                                     │ │
│  │    ```                                                     │ │
│  │                                                            │ │
│  │    █  (光标闪烁，正在生成)                                  │ │
│  │                                         10:30  [复制]       │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 正在输入状态

```
┌─────────────────────────────────────────────────────────────────┐
│  🤖 AI助手                                                      │
│     ●●● 正在思考...                                             │
│     (三个点动画)                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 4. 数据设计

### 4.1 数据类型

```typescript
// 消息
interface Message {
  id: string                    // 消息ID（UUID）
  dialogId: string              // 对话ID
  role: 'user' | 'assistant' | 'system'  // 角色
  content: string               // 消息内容
  createdAt: Date               // 创建时间
  tokenCount?: number           // Token数量
}

// 发送消息请求
interface SendMessageRequest {
  dialogId: string              // 对话ID
  content: string               // 消息内容
}

// 流式响应事件
interface StreamEvent {
  type: 'start' | 'delta' | 'done' | 'error'
  messageId?: string            // 消息ID
  content?: string              // 内容片段
  error?: string                // 错误信息
}

// 上下文配置
interface ContextConfig {
  maxMessages: number           // 最大历史消息数
  maxTokens: number             // 最大Token数
}
```

### 4.2 数据库表

```sql
-- 消息表
CREATE TABLE dialog_messages (
  id TEXT PRIMARY KEY,
  dialog_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  token_count INTEGER,
  FOREIGN KEY (dialog_id) REFERENCES dialogs(id) ON DELETE CASCADE
);

-- 索引
CREATE INDEX idx_messages_dialog_id ON dialog_messages(dialog_id, created_at);
```

## 5. 涉及文件

### 5.1 前端文件

| 文件路径 | 描述 |
|---------|------|
| `src/renderer/src/stores/dialog.ts` | 对话状态管理 |
| `src/renderer/src/components/dialog/MessageList.vue` | 消息列表组件 |
| `src/renderer/src/components/dialog/MessageInput.vue` | 消息输入组件 |
| `src/renderer/src/components/dialog/MessageItem.vue` | 单条消息组件 |

### 5.2 后端文件

| 文件路径 | 描述 |
|---------|------|
| `src/main/ipc/handlers/message.handler.ts` | 消息IPC处理器 |
| `src/main/database/repositories/message.repository.ts` | 消息数据访问 |
| `src/main/services/dialog.service.ts` | 对话业务服务 |
| `src/main/providers/base-provider.ts` | Provider基类 |

### 5.3 共享文件

| 文件路径 | 描述 |
|---------|------|
| `src/shared/types/message.types.ts` | 消息类型定义 |
| `src/shared/types/provider.types.ts` | Provider类型定义 |

## 6. 函数设计

### 6.1 前端函数

#### stores/dialog.ts

```typescript
/**
 * 当前对话的消息列表
 */
const messages = ref<Message[]>([])

/**
 * 是否正在生成
 */
const isGenerating = ref(false)

/**
 * 当前生成的消息ID
 */
const generatingMessageId = ref<string | null>(null)

/**
 * 发送消息
 * @param content - 消息内容
 * @returns Promise<void>
 * 逻辑：
 * 1. 验证内容非空
 * 2. 创建用户消息，添加到列表
 * 3. 创建AI消息占位符
 * 4. 设置 isGenerating = true
 * 5. 调用 window.electronAPI.sendMessage()
 * 6. 监听 EventChannel 事件
 * 7. 实时更新AI消息内容
 * 8. 完成后设置 isGenerating = false
 */
async function sendMessage(content: string): Promise<void>

/**
 * 停止生成
 * @returns void
 * 逻辑：
 * 1. 调用 window.electronAPI.stopGeneration()
 * 2. 设置 isGenerating = false
 */
function stopGeneration(): void

/**
 * 加载消息列表
 * @param dialogId - 对话ID
 * @returns Promise<void>
 * 逻辑：
 * 1. 调用 window.electronAPI.getMessages(dialogId)
 * 2. 更新 messages
 */
async function loadMessages(dialogId: string): Promise<void>

/**
 * 添加消息到列表
 * @param message - 消息对象
 * @returns void
 */
function addMessage(message: Message): void

/**
 * 更新消息内容
 * @param messageId - 消息ID
 * @param content - 新内容
 * @returns void
 */
function updateMessageContent(messageId: string, content: string): void
```

#### components/dialog/MessageInput.vue

```typescript
/**
 * 输入内容
 */
const inputContent = ref('')

/**
 * 处理键盘事件
 * @param event - 键盘事件
 * @returns void
 * 逻辑：
 * 1. Enter 且无 Shift → 发送
 * 2. Enter 且有 Shift → 换行
 */
function handleKeydown(event: KeyboardEvent): void

/**
 * 发送消息
 * @returns void
 * 逻辑：
 * 1. 验证非空
 * 2. 调用 store.sendMessage()
 * 3. 清空输入框
 */
function send(): void
```

### 6.2 后端函数

#### message.handler.ts

```typescript
/**
 * 处理发送消息
 * @param event - IPC事件
 * @param request - 发送请求
 * @returns Promise<void>
 * 逻辑：
 * 1. 获取对话信息
 * 2. 获取历史消息
 * 3. 保存用户消息
 * 4. 获取 Provider 实例
 * 5. 调用 Provider.chat() 流式
 * 6. 通过 event.reply 发送流式事件
 * 7. 保存 AI 消息
 */
async function handleSendMessage(
  event: IpcMainInvokeEvent,
  request: SendMessageRequest
): Promise<void>

/**
 * 处理获取消息列表
 * @param event - IPC事件
 * @param dialogId - 对话ID
 * @returns Promise<{ success: boolean, messages: Message[] }>
 */
async function handleGetMessages(
  event: IpcMainInvokeEvent,
  dialogId: string
): Promise<{ success: boolean, messages: Message[] }>
```

#### services/dialog.service.ts

```typescript
/**
 * 构建对话上下文
 * @param dialog - 对话信息
 * @param messages - 历史消息
 * @param newMessage - 新消息
 * @param config - 上下文配置
 * @returns ChatContext
 * 逻辑：
 * 1. 按时间排序消息
 * 2. 截取最近 N 条消息
 * 3. 计算总 Token 数
 * 4. 如果超限，从最早的开始移除
 * 5. 返回上下文对象
 */
function buildContext(
  dialog: Dialog,
  messages: Message[],
  newMessage: string,
  config: ContextConfig
): ChatContext

/**
 * 生成对话标题
 * @param firstMessage - 首条消息
 * @returns Promise<string>
 * 逻辑：
 * 1. 如果消息长度 <= 20，直接返回
 * 2. 否则截取前20字符 + "..."
 */
function generateTitle(firstMessage: string): string
```

#### providers/base-provider.ts

```typescript
/**
 * Provider 基类
 */
abstract class BaseProvider {
  /**
   * 流式聊天
   * @param context - 对话上下文
   * @param onDelta - 增量回调
   * @returns Promise<string> - 完整响应
   * 逻辑：
   * 1. 构建 API 请求
   * 2. 发送请求（stream: true）
   * 3. 解析 SSE 响应
   * 4. 每收到 token 调用 onDelta
   * 5. 返回完整响应
   */
  abstract async chat(
    context: ChatContext,
    onDelta: (content: string) => void
  ): Promise<string>

  /**
   * 测试连接
   * @returns Promise<boolean>
   */
  abstract async testConnection(): Promise<boolean>
}
```

#### message.repository.ts

```typescript
/**
 * 获取对话的消息列表
 * @param dialogId - 对话ID
 * @returns Promise<Message[]>
 */
async function getByDialogId(dialogId: string): Promise<Message[]>

/**
 * 创建消息
 * @param message - 消息数据
 * @returns Promise<Message>
 */
async function create(message: Omit<Message, 'id' | 'createdAt'>): Promise<Message>

/**
 * 获取最近 N 条消息
 * @param dialogId - 对话ID
 * @param limit - 数量限制
 * @returns Promise<Message[]>
 */
async function getRecent(dialogId: string, limit: number): Promise<Message[]>

/**
 * 统计对话消息数量
 * @param dialogId - 对话ID
 * @returns Promise<number>
 */
async function count(dialogId: string): Promise<number>
```

## 7. 边界检查

### 7.1 输入验证

| 场景 | 验证规则 | 处理方式 |
|-----|---------|---------|
| 消息为空 | `!content.trim()` | 不发送 |
| 消息过长 | `content.length > 10000` | 提示"消息过长" |
| 对话不存在 | `!dialog` | 返回错误 |

### 7.2 错误处理

| 错误场景 | 处理方式 |
|---------|---------|
| API密钥未配置 | 显示"请先配置API密钥" |
| API调用失败 | 显示错误信息在消息中 |
| 网络错误 | 显示"网络错误，请重试" |
| Token超限 | 显示"对话过长，请开启新对话" |
| 流式中断 | 保存已生成内容 |

## 8. 测试用例

| 用例ID | 描述 | 步骤 | 预期结果 |
|-------|------|-----|---------|
| TC001 | 发送简单消息 | 输入"你好"→发送 | 显示用户消息+AI回复 |
| TC002 | 发送多行消息 | Shift+Enter换行→发送 | 消息保留换行 |
| TC003 | 流式输出 | 发送消息 | AI回复逐字显示 |
| TC004 | 停止生成 | 生成中点击停止 | 停止生成，保留已生成内容 |
| TC005 | 快速连续发送 | 发送→立即再发送 | 第二次等待第一次完成 |
| TC006 | 空消息 | 输入空格→发送 | 不发送 |
| TC007 | 长消息 | 输入超长文本 | 显示提示，可发送 |
| TC008 | 复制消息 | 点击复制按钮 | 内容复制到剪贴板 |
| TC009 | 代码高亮 | 发送包含代码的消息 | 代码块正确高亮 |
| TC010 | 上下文保持 | 多轮对话 | AI记住上下文 |
