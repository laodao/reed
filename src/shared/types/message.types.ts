/**
 * 消息相关类型定义
 * @module types/message.types
 */

/**
 * 消息角色
 */
export type MessageRole = 'user' | 'assistant' | 'system'

/**
 * 消息内容块 - 用于多模态消息
 */
export interface MessageContentBlock {
  type: 'text' | 'image'
  text?: string
  image_url?: {
    url: string  // data:image/jpeg;base64,... 格式
  }
}

/**
 * 消息内容类型 - 支持纯文本和多模态
 */
export type MessageContent = string | MessageContentBlock[]

/**
 * 附件内容 - 用于传递给 Provider
 * 包含附件的完整数据，供 AI 提供商使用
 */
export interface AttachmentContent {
  id: string
  type: 'image' | 'document'
  fileName: string
  mimeType: string
  base64Data: string
  textContent?: string  // 文档类文件的文本内容
}

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
 * 知识库引用
 */
export interface KnowledgeBaseReference {
  documentId: string
  documentName: string
  score: number
  snippet?: string  // 引用的文档片段内容
}

/**
 * 消息元数据
 */
export interface MessageMetadata {
  thinkingChain?: string  // 思维链内容
  webSearch?: WebSearchResult[]  // 联网搜索结果
  knowledgeBase?: KnowledgeBaseReference[]  // 知识库引用
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
  /** 知识库检索配置 - 关联的知识库 ID 列表 */
  knowledgeBaseIds?: string[]
  /** 知识库检索数量 */
  knowledgeRetrieveCount?: number
  /** 知识库检索相似度阈值 */
  knowledgeThreshold?: number
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
 * Token 使用量
 */
export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
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
  /** 对话 ID，用于验证事件是否属于当前对话 */
  dialogId?: string
  messageId?: string
  content?: string
  /** 思维链内容 */
  thinkingContent?: string
  error?: string
  interrupted?: boolean
  /** Token 使用量（在 done 事件中返回） */
  usage?: TokenUsage
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
    content: MessageContent  // 支持多模态内容
    attachments?: AttachmentContent[]  // 附件内容（可选，用于 Provider 处理）
  }>
}
