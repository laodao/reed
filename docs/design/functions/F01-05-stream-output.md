# F01-05 - 流式输出

## 1. 功能概述

| 属性 | 值 |
|-----|-----|
| 所属模块 | M01 - AI对话 |
| 功能编号 | F01-05 |
| 功能名称 | 流式输出 |
| 优先级 | P0 |
| 功能描述 | AI回复以流式方式实时显示，提供打字机效果 |

## 2. 操作流程

### 2.1 流式输出流程

```
用户发送消息
    │
    ▼
前端创建AI消息占位符
    │
    ▼
调用 IPC（使用 EventChannel）
    │
    ▼
主进程开始流式请求
    │
    ├── 发送 'start' 事件（包含 messageId）
    │
    ▼
AI返回第一个 token
    │
    ├── 发送 'delta' 事件（包含内容片段）
    │
    ▼
前端接收并更新消息内容
    │
    ├── 显示打字机效果
    │
    ▼
继续接收 tokens（循环）
    │
    ├── 每个都发送 'delta' 事件
    │
    ├── 前端持续更新
    │
    ▼
流式完成
    │
    ├── 发送 'done' 事件
    │
    ├── 保存完整消息到数据库
    │
    ▼
前端标记消息完成
```

### 2.2 错误处理流程

```
流式过程中发生错误
    │
    ▼
发送 'error' 事件
    │
    ├── 包含错误信息
    │
    ▼
前端显示错误状态
    │
    ├── 在消息中显示错误提示
    │
    ├── 提供"重试"按钮
    │
    ▼
保存已生成的内容（如果有）
```

### 2.3 中断流程

```
用户点击"停止生成"
    │
    ▼
前端发送中断信号
    │
    ▼
主进程中断 API 请求
    │
    ▼
发送 'done' 事件（标记中断）
    │
    ▼
保存已生成的内容
    │
    ▼
前端显示中断状态
```

## 3. 界面设计

### 3.1 流式输出状态

```
正在生成中：
┌─────────────────────────────────────────────────────────────────┐
│  🤖 AI助手                                                      │
│     好的，我来帮你写一个简单的 Python 爬虫。                     │
│                                                                  │
│     首先需要安装依赖：█                                          │
│                     ↑                                            │
│                  光标闪烁                                         │
└─────────────────────────────────────────────────────────────────┘

底部显示停止按钮：
┌─────────────────────────────────────────────────────────────────┐
│  [■ 停止生成]                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 生成完成状态

```
┌─────────────────────────────────────────────────────────────────┐
│  🤖 AI助手                                                      │
│     好的，我来帮你写一个简单的 Python 爬虫。                     │
│                                                                  │
│     首先需要安装依赖：                                           │
│     ```bash                                                      │
│     pip install requests beautifulsoup4                          │
│     ```                                                          │
│                                                                  │
│     然后编写代码：...                                            │
│                                              10:30  [复制]       │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 错误状态

```
┌─────────────────────────────────────────────────────────────────┐
│  🤖 AI助手                                                      │
│     ⚠️ 生成过程中发生错误                                        │
│                                                                  │
│     错误信息：网络连接超时                                        │
│                                                                  │
│     已生成内容：                                                 │
│     好的，我来帮你...                                            │
│                                                                  │
│                                        [重试]  [复制已有内容]    │
└─────────────────────────────────────────────────────────────────┘
```

## 4. 数据设计

### 4.1 事件类型

```typescript
// 流式事件类型
type StreamEventType = 'start' | 'delta' | 'done' | 'error'

// 流式事件
interface StreamEvent {
  type: StreamEventType
  messageId?: string            // 消息ID（start时提供）
  content?: string              // 内容片段（delta时提供）
  error?: string                // 错误信息（error时提供）
  interrupted?: boolean         // 是否被中断（done时提供）
}

// 流式状态
interface StreamState {
  isStreaming: boolean          // 是否正在流式输出
  messageId: string | null      // 当前消息ID
  content: string               // 已累积的内容
  error: string | null          // 错误信息
}
```

## 5. 涉及文件

### 5.1 前端文件

| 文件路径 | 描述 |
|---------|------|
| `src/renderer/src/stores/dialog.ts` | 对话状态管理，流式处理逻辑 |
| `src/renderer/src/components/dialog/MessageItem.vue` | 消息项，显示流式状态 |
| `src/renderer/src/components/dialog/StreamIndicator.vue` | 流式指示器组件 |

### 5.2 后端文件

| 文件路径 | 描述 |
|---------|------|
| `src/main/ipc/handlers/message.handler.ts` | 消息IPC处理，EventChannel管理 |
| `src/main/providers/base-provider.ts` | Provider基类，流式API调用 |

## 6. 函数设计

### 6.1 前端函数

#### stores/dialog.ts

```typescript
/**
 * 流式状态
 */
const streamState = ref<StreamState>({
  isStreaming: false,
  messageId: null,
  content: '',
  error: null
})

/**
 * 开始流式输出
 * @param dialogId - 对话ID
 * @param userMessage - 用户消息
 * @returns Promise<void>
 * 逻辑：
 * 1. 创建用户消息并显示
 * 2. 创建AI消息占位符
 * 3. 设置 streamState.isStreaming = true
 * 4. 调用 IPC，监听 EventChannel
 * 5. 处理各类事件
 */
async function startStream(dialogId: string, userMessage: string): Promise<void>

/**
 * 处理流式事件
 * @param event - 流式事件
 * @returns void
 * 逻辑：
 * - start: 设置 messageId
 * - delta: 追加内容，更新显示
 * - done: 标记完成，保存消息
 * - error: 显示错误
 */
function handleStreamEvent(event: StreamEvent): void

/**
 * 停止流式输出
 * @returns void
 * 逻辑：
 * 1. 发送中断信号
 * 2. 更新状态
 */
function stopStream(): void

/**
 * 重试生成
 * @returns Promise<void>
 * 逻辑：
 * 1. 使用最后的用户消息重新发送
 */
async function retryStream(): Promise<void>
```

#### components/dialog/MessageItem.vue

```typescript
/**
 * 是否正在流式输出
 */
const isStreaming = computed(() => {
  return props.message.id === streamState.messageId && streamState.isStreaming
})

/**
 * 显示内容（实时更新）
 */
const displayContent = computed(() => {
  if (isStreaming.value) {
    return streamState.content
  }
  return props.message.content
})
```

### 6.2 后端函数

#### message.handler.ts

```typescript
/**
 * 处理流式发送消息
 * @param event - IPC事件
 * @param request - 发送请求
 * @returns Promise<void>
 * 逻辑：
 * 1. 创建 EventChannel
 * 2. 发送 'start' 事件
 * 3. 获取 Provider 实例
 * 4. 调用 Provider.chat() 流式方法
 * 5. 每收到 delta 调用 event.reply 发送事件
 * 6. 完成时发送 'done' 事件
 * 7. 错误时发送 'error' 事件
 */
async function handleStreamMessage(
  event: IpcMainInvokeEvent,
  request: SendMessageRequest
): Promise<void>
```

#### providers/base-provider.ts

```typescript
/**
 * 流式聊天方法
 * @param context - 对话上下文
 * @param onDelta - 增量回调
 * @param signal - 中断信号
 * @returns Promise<string>
 * 逻辑：
 * 1. 构建 API 请求（stream: true）
 * 2. 发送请求
 * 3. 解析 SSE 响应
 * 4. 每收到 token 调用 onDelta
 * 5. 检查 signal 是否中断
 * 6. 返回完整响应
 */
async chat(
  context: ChatContext,
  onDelta: (content: string) => void,
  signal?: AbortSignal
): Promise<string>
```

## 7. 技术实现细节

### 7.1 Electron EventChannel 使用

```typescript
// 主进程
ipcMain.handle('dialog:send', async (event, request) => {
  const channel = new EventChannel()
  event.reply('stream-channel', channel)

  // 流式发送事件
  channel.send({ type: 'start', messageId: 'xxx' })

  // 在 Provider 中
  for await (const chunk of streamResponse) {
    channel.send({ type: 'delta', content: chunk })
  }

  channel.send({ type: 'done' })
})

// 渲染进程
const result = await ipcRenderer.invoke('dialog:send', request)
result.channel.on('data', (event) => {
  handleStreamEvent(event)
})
```

### 7.2 打字机效果

```typescript
/**
 * 打字机效果更新
 * @param content - 完整内容
 * @param speed - 速度（ms/字符）
 */
function typewriterEffect(content: string, speed: number = 20): void {
  // 直接显示（无延迟），让滚动跟随
  displayContent.value = content

  // 自动滚动到底部
  scrollToBottom()
}
```

### 7.3 滚动跟随

```typescript
/**
 * 滚动到底部
 */
function scrollToBottom(): void {
  nextTick(() => {
    const container = messageListRef.value
    if (container) {
      container.scrollTop = container.scrollHeight
    }
  })
}
```

## 8. 边界检查

| 场景 | 处理方式 |
|-----|---------|
| 网络中断 | 发送 error 事件，保存已生成内容 |
| API 超时 | 发送 error 事件，提供重试选项 |
| Token 限制 | 发送 error 事件，提示对话过长 |
| 并发请求 | 阻止新的发送，直到当前完成 |

## 9. 测试用例

| 用例ID | 描述 | 步骤 | 预期结果 |
|-------|------|-----|---------|
| TC001 | 正常流式输出 | 发送消息 | 内容逐字显示 |
| TC002 | 停止生成 | 生成中点击停止 | 停止，保留已生成内容 |
| TC003 | 网络错误 | 模拟网络断开 | 显示错误，可重试 |
| TC004 | 长消息流式 | 发送需要长回复的消息 | 持续流式直到完成 |
| TC005 | 滚动跟随 | 生成中查看历史消息 | 可滚动，新内容提示 |
| TC006 | 代码块流式 | 请求代码回复 | 代码块正确渲染 |
| TC007 | 表格流式 | 请求表格回复 | 表格正确渲染 |
