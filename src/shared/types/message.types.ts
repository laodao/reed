/**
 * 消息相关类型定义
 * @module types/message.types
 */

/**
 * 消息角色
 */
export type MessageRole = 'user' | 'assistant' | 'system'

/**
 * 附件类型
 */
export type AttachmentType = 'image' | 'document'

/**
 * 附件
 */
export interface Attachment {
  id: string
  type: AttachmentType
  fileName: string
  filePath: string
  fileSize: number
  mimeType: string
}

/**
 * 网页搜索结果
 */
export interface WebSearchResult {
  title: string
  url: string
  snippet: string
  source: 'baidu' | 'bing' | 'google' | 'model'
}

/**
 * 网页搜索响应
 */
export interface WebSearchResponse {
  success: boolean
  results: WebSearchResult[]
  error?: string
}

/**
 * 消息元数据
 */
export interface MessageMetadata {
  thinkingChain?: string  // 思维链内容
  webSearch?: WebSearchResult[]  // 联网搜索结果
  knowledgeBase?: string[]  // 知识库引用
}

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
  attachments?: Attachment[]  // 附件列表
  metadata?: MessageMetadata  // 元数据
  createdAt: Date
}

/**
 * 联网搜索引擎类型
 */
export type WebSearchEngine = 'model' | 'baidu' | 'bing' | 'google'

/**
 * 联网搜索配置
 */
export interface WebSearchConfig {
  enabled: boolean
  engine: WebSearchEngine
}

/**
 * 发送消息请求
 */
export interface SendMessageRequest {
  dialogId: string
  content: string
  attachments?: Attachment[]  // 附件列表
  /** 联网搜索配置 */
  webSearch?: WebSearchConfig
  /** 启用思维链 */
  enableThinkingChain?: boolean
  /** 当前选中的模型ID（使用内存中的值，不从数据库读取） */
  modelId?: string
  /** 当前选中的提供商配置ID（使用内存中的值，不从数据库读取） */
  providerConfigId?: string
}

/**
 * 创建消息请求（内部使用）
 */
export interface CreateMessageRequest {
  dialogId: string
  role: MessageRole
  content: string
  modelId?: string
  tokensUsed?: number
  attachments?: Attachment[]
  metadata?: MessageMetadata
}

/**
 * 流式事件类型
 */
export type StreamEventType = 'start' | 'delta' | 'done' | 'error' | 'thinking'

/**
 * 流式事件
 */
export interface StreamEvent {
  type: StreamEventType
  messageId?: string
  content?: string
  /** 思维链内容 */
  thinkingContent?: string
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
