/**
 * 消息相关类型定义
 * @module types/message.types
 */

/**
 * 消息角色
 */
export type MessageRole = 'user' | 'assistant' | 'system'

/**
 * 消息
 */
export interface Message {
  id: string
  dialogId: string
  role: MessageRole
  content: string
  modelId?: string
  tokensUsed?: number
  createdAt: Date
}

/**
 * 发送消息请求
 */
export interface SendMessageRequest {
  dialogId: string
  content: string
}

/**
 * 流式事件类型
 */
export type StreamEventType = 'start' | 'delta' | 'done' | 'error'

/**
 * 流式事件
 */
export interface StreamEvent {
  type: StreamEventType
  messageId?: string
  content?: string
  error?: string
  interrupted?: boolean
}

/**
 * 流式状态
 */
export interface StreamState {
  isStreaming: boolean
  messageId: string | null
  content: string
  error: string | null
}

/**
 * 消息列表响应
 */
export interface ListMessagesResponse {
  success: boolean
  messages: Message[]
}

/**
 * 上下文配置
 */
export interface ContextConfig {
  maxMessages: number
  maxTokens: number
}

/**
 * 对话上下文
 */
export interface ChatContext {
  systemPrompt?: string
  messages: Array<{
    role: MessageRole
    content: string
  }>
}
