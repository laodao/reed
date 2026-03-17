/**
 * 对话相关类型定义
 * @module types/dialog.types
 */

/**
 * 对话
 */
export interface Dialog {
  id: string
  title: string
  modelId: string
  roleId?: string
  systemPrompt?: string
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
  roleId?: string
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
