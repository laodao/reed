/**
 * 视频 Provider 相关类型定义
 * @module types/video-provider.types
 */

/**
 * 视频 Provider 信息
 */
export interface VideoProvider {
  id: string
  name: string
  configured: boolean
  models: VideoModel[]
}

/**
 * 视频模型信息
 */
export interface VideoModel {
  id: string
  name: string
  providerId: string
  providerName: string
  features: VideoModelFeatures
}

/**
 * 视频模型功能特性
 */
export interface VideoModelFeatures {
  textToVideo: boolean      // 文生视频
  imageToVideo: boolean     // 图生视频
  videoToVideo: boolean     // 视频生视频
  maxDuration: number       // 最大时长（秒）
  supportedResolutions: string[]  // 支持的分辨率
  supportedAspectRatios: string[] // 支持的宽高比
}

/**
 * 视频 Provider 配置
 */
export interface VideoProviderConfig {
  id: string
  apiKey: string
  baseUrl?: string
  customHeaders?: Record<string, string>
  customParams?: Record<string, any>
}

/**
 * 视频生成任务状态
 */
export interface VideoTaskStatus {
  taskId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress?: number
  video?: GeneratedVideo
  error?: string
}

/**
 * 生成的视频信息
 */
export interface GeneratedVideo {
  url?: string
  localPath?: string
  duration?: number
  width?: number
  height?: number
  format?: string
  thumbnailUrl?: string
}

/**
 * 视频生成请求
 */
export interface VideoGenerationRequest {
  providerConfigId?: string  // Provider 配置 ID
  model: string              // 模型 ID

  // 图生视频参数
  image?: string             // 输入图片（URL 或 base64）

  // 文生视频参数
  prompt?: string            // 视频描述提示词
  negativePrompt?: string    // 负面提示词

  // 视频参数
  duration?: number          // 视频时长（秒）
  width?: number
  height?: number
  aspectRatio?: string       // 宽高比 '16:9' | '9:16' | '1:1'

  // 运动参数
  motion?: string            // 运动描述
  cameraMovement?: string    // 镜头运动

  // 其他参数
  seed?: number
  skipHistory?: boolean      // 是否跳过历史记录
}

/**
 * 视频生成响应
 */
export interface VideoGenerationResponse {
  success: boolean
  taskId?: string            // 异步任务 ID
  video?: GeneratedVideo     // 同步返回的视频
  error?: string
}

/**
 * 视频 Provider 类型标识
 */
export type VideoProviderType = 'bailian' | 'dashscope' | 'volcengine' | 'runway' | 'pika' | 'kling' | 'luma' | 'minimax' | 'zhipu' | 'custom'

/**
 * 视频 Provider 定义（用于工厂创建）
 */
export interface VideoProviderDefinition {
  type: VideoProviderType
  name: string
  description: string
  defaultBaseUrl?: string
  requiresApiKey: boolean
  supportedFeatures: VideoModelFeatures
}