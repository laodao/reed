/**
 * 对话相关类型定义
 * @module types/dialog.types
 */

/**
 * 上下文配置
 */
export interface ContextConfig {
  maxMessages: number
  maxTokens: number
}

/**
 * 对话
 */
export interface Dialog {
  id: string
  title: string
  modelId: string
  providerConfigId?: string  // 使用的提供商配置 ID
  roleId: string | null  // 角色 ID，null 表示默认助手
  systemPrompt?: string
  contextConfig?: ContextConfig  // 上下文配置
  createdAt: Date
  updatedAt: Date
  messageCount: number
}

/**
 * 创建对话请求
 */
export interface CreateDialogRequest {
  title?: string
  modelId: string
  providerConfigId?: string
  roleId?: string
  systemPrompt?: string
  contextConfig?: ContextConfig
}

/**
 * 更新对话请求
 */
export interface UpdateDialogRequest {
  title?: string
  systemPrompt?: string
  contextConfig?: ContextConfig
  modelId?: string
  providerConfigId?: string
}

/**
 * 对话列表项（显示用）
 */
export interface DialogListItem {
  id: string
  title: string
  modelId: string
  messageCount: number
  updatedAt: Date
  preview?: string
}

/**
 * 对话列表响应
 */
export interface ListDialogsResponse {
  success: boolean
  dialogs: Dialog[]
}

/**
 * 获取对话响应
 */
export interface GetDialogResponse {
  success: boolean
  dialog?: Dialog
}

/**
 * 创建对话响应
 */
export interface CreateDialogResponse {
  success: boolean
  dialog?: Dialog
  error?: string
}
