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
  /** @deprecated spec 2026-05-09 ep-redesign §3.2 D1：保留兼容老调用方；新代码用 referenceImages */
  referenceImage?: string
  /**
   * 多张参考图绝对路径或 URL（spec 2026-05-09 ep-redesign §3.2 D1 · multi-reference）。
   * 各 provider adapter 适配各自 multi-reference 入参形态：
   *   - dashscope（万相 wan2.5/2.6 image-edit）：ref_images: string[]，1-4 张
   *   - volcengine（Seedream 4.5 / 5.0 lite）：reference_images: string[]，多张 + 组图
   *   - bailian（百炼托管 kling-v3）：element_list[]，10 张
   *   - openai（DALL-E）：不原生支持，仅用第一张
   *   - minimax / zhipu：单参考，仅用第一张
   *   - custom：透传到用户配置的 baseUrl
   * 本字段优先于 referenceImage 单值；都为空时 fallback 到 referenceImage（兼容老调用）。
   */
  referenceImages?: string[]
  skipHistory?: boolean  // 是否跳过历史记录（用于其他模块调用，如人像设计）
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