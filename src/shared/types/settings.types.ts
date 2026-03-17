/**
 * 系统设置相关类型定义
 * @module types/settings.types
 */

/**
 * 主题模式
 */
export type ThemeMode = 'light' | 'dark' | 'auto'

/**
 * 语言
 */
export type Language = 'zh-CN' | 'en-US'

/**
 * 字体大小
 */
export type FontSize = 'small' | 'medium' | 'large'

/**
 * 字体大小映射
 */
export const fontSizeMap: Record<FontSize, string> = {
  small: '14px',
  medium: '16px',
  large: '18px'
}

/**
 * 应用设置
 */
export interface AppSettings {
  theme: ThemeMode
  language: Language
  fontSize: FontSize
  dataPath?: string
}

/**
 * API密钥信息
 */
export interface ApiKeyInfo {
  provider: string
  name: string
  configured: boolean
  hasEndpoint?: boolean
}

/**
 * 设置API密钥请求
 */
export interface SetApiKeyRequest {
  provider: string
  key: string
  endpoint?: string
}

/**
 * 删除API密钥请求
 */
export interface DeleteApiKeyRequest {
  provider: string
}

/**
 * 测试API密钥响应
 */
export interface TestApiKeyResponse {
  success: boolean
  message: string
}

/**
 * API密钥列表响应
 */
export interface ListApiKeysResponse {
  success: boolean
  keys: ApiKeyInfo[]
}

/**
 * 设置API密钥响应
 */
export interface SetApiKeyResponse {
  success: boolean
  error?: string
}
