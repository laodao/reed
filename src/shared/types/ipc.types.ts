/**
 * IPC 类型定义
 * @module types/ipc.types
 */

import type {
  AppSettings,
  ApiKeyInfo,
  Dialog,
  Message,
  Role
} from './index'

// ==================== 通用响应类型 ====================

/**
 * 通用 IPC 响应
 */
export interface IpcResponse<T = any> {
  success: boolean
  data?: T
  error?: string
}

// ==================== 设置相关 ====================

export interface SettingsGetResponse extends IpcResponse<Record<string, any> | any> {}
export interface SettingsSetResponse extends IpcResponse<void> {}

// ==================== API 密钥相关 ====================

export interface ListApiKeysResponse extends IpcResponse<ApiKeyInfo[]> {
  keys: ApiKeyInfo[]
}
export interface SetApiKeyResponse extends IpcResponse<void> {}
export interface TestApiKeyResponse extends IpcResponse<void> {
  message: string
}

// ==================== 对话相关 ====================

export interface ListDialogsResponse extends IpcResponse<Dialog[]> {
  dialogs: Dialog[]
}
export interface GetDialogResponse extends IpcResponse<Dialog> {
  dialog?: Dialog
}
export interface CreateDialogResponse extends IpcResponse<Dialog> {
  dialog?: Dialog
}

// ==================== 消息相关 ====================

export interface ListMessagesResponse extends IpcResponse<Message[]> {
  messages: Message[]
}
export interface CreateMessageResponse extends IpcResponse<Message> {
  message?: Message
}

// ==================== 角色相关 ====================

export interface ListRolesResponse extends IpcResponse<Role[]> {
  roles: Role[]
}
export interface GetRoleResponse extends IpcResponse<Role> {
  role?: Role
}
export interface CreateRoleResponse extends IpcResponse<Role> {
  role?: Role
}
