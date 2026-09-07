/**
 * 对话相关类型定义
 * @module types/dialog.types
 */

import type { SearchEngineType, SearchEngineConfigId } from './search-engine.types'

/**
 * 上下文配置
 */
export interface ContextConfig {
  maxMessages: number
  maxTokens: number
}

/**
 * 对话联网搜索配置
 */
export interface DialogWebSearchConfig {
  /** 是否启用联网搜索 */
  enabled: boolean
  /** 搜索引擎类型 */
  engine: SearchEngineType
  /** 搜索引擎配置 ID（快速搜索使用模板 ID，配置型使用用户配置 ID） */
  configId?: SearchEngineConfigId
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
  knowledgeBaseIds?: string[]  // 关联的知识库 ID 列表
  webSearchConfig?: DialogWebSearchConfig  // 联网搜索配置
  /** Agent 模式（28 号 M5）：消息分流到系统 agent（工具调用/工作流/技能/任务树） */
  agentEnabled?: boolean
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
  knowledgeBaseIds?: string[]  // 关联的知识库 ID 列表
  webSearchConfig?: DialogWebSearchConfig  // 联网搜索配置
  agentEnabled?: boolean  // Agent 模式开关（28 号 M5）
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
