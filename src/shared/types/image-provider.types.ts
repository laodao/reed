/**
 * 图像 Provider 相关类型定义
 * @module types/image-provider.types
 */

/**
 * 图像 Provider 信息
 */
export interface ImageProvider {
  id: string
  name: string
  configured: boolean
  models: ImageModel[]
}

/**
 * 图像模型信息
 */
export interface ImageModel {
  id: string
  name: string
  providerId: string
  providerName: string
  features: ImageModelFeatures
}

/**
 * 图像模型功能特性
 */
export interface ImageModelFeatures {
  textToImage: boolean
  imageToImage: boolean
  imageEdit: boolean
  maxResolution: string
  supportedSizes: string[]
}

/**
 * 图像 Provider 配置
 */
export interface ImageProviderConfig {
  id: string
  apiKey: string
  baseUrl?: string
  customHeaders?: Record<string, string>
  customParams?: Record<string, any>
}

/**
 * 图像生成任务状态
 */
export interface ImageTaskStatus {
  taskId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress?: number
  images?: GeneratedImage[]
  error?: string
}

/**
 * 生成的图像信息
 */
export interface GeneratedImage {
  url?: string
  base64?: string
  width?: number
  height?: number
  format?: string
}

/**
 * 图像生成请求（内部）
 */
export interface ImageGenerationRequest {
  providerConfigId?: string  // Provider 配置 ID
  model: string
  prompt: string
  negativePrompt?: string
  width: number
  height: number
  style?: string
  quality?: string
  count?: number
  seed?: number
  referenceImage?: string
}

/**
 * 图像生成响应（内部）
 */
export interface ImageGenerationResponse {
  success: boolean
  taskId?: string
  images?: GeneratedImage[]
  error?: string
}

/**
 * 图像 Provider 类型标识
 */
export type ImageProviderType = 'dashscope' | 'bailian' | 'openai' | 'volcengine' | 'minimax' | 'zhipu' | 'custom'

/**
 * 图像 Provider 定义（用于工厂创建）
 */
export interface ImageProviderDefinition {
  type: ImageProviderType
  name: string
  description: string
  defaultBaseUrl?: string
  requiresApiKey: boolean
  supportedFeatures: ImageModelFeatures
}