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
  /** 模型级生成能力（design image-provider-capability-model-design §4.3，由 ImageService 聚合层注入） */
  capabilities?: ImageModelCapabilities
}

/**
 * 尺寸控制模式
 * - pixels：直接 宽*高（万相、Seedream、OpenAI）
 * - aspect_ratio_resolution：宽高比 + 分辨率档位（可灵）
 * - tiered：仅档位 1K/2K/4K
 */
export type ImageSizeMode = 'pixels' | 'aspect_ratio_resolution' | 'tiered'

/**
 * 模型级图像生成能力声明（design image-provider-capability-model-design §4.1）
 * 能力是模型级而非 provider 级（如 seedream-3.0-t2i 支持 seed，4.5 不支持）。
 */
export interface ImageModelCapabilities {
  negativePrompt: boolean
  seed: boolean
  quality: boolean
  style: boolean
  guidanceScale: boolean
  /** 重绘强度（目前万相/Seedream/可灵官方均不支持） */
  strength: boolean
  sizeMode: ImageSizeMode
  /** 参考图上限；0 = 不支持参考图 */
  maxReferenceImages: number
  /** default_on = 官方默认带水印（需显式关闭） */
  watermark: 'not_supported' | 'optional' | 'default_on'
  /** 提示词优化（万相 prompt_extend / 火山 optimize_prompt）；optional_default_on = 官方默认开启会改写提示词 */
  promptRewrite: 'none' | 'optional' | 'optional_default_on'
  /** 组图能力（人像场景暂不需要，预留） */
  sequentialGeneration: boolean
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
  /** 重绘强度 0-1（图生图/局部重绘；provider 不支持时忽略）。spec 2026-07-24 新版人像设计 */
  strength?: number
  /** 聚焦区域（不支持蒙版的 provider 用 prompt 引导）。spec 2026-07-24 新版人像设计 */
  focusRegion?: 'face' | 'face_and_hair' | 'upper' | 'full'
  /**
   * 提示词智能改写开关（万相 prompt_extend；缺省 = 官方默认 true，保现状）。
   * 人像一致性场景（editFace/generateFullBody/带参考图生成）应显式传 false，
   * 防止一致性约束被 LLM 改写。design image-provider-capability-model-design §5.3
   */
  promptExtend?: boolean
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
export type ImageProviderType = 'dashscope' | 'bailian' | 'openai' | 'volcengine' | 'minimax' | 'zhipu' | 'comfyui' | 'custom'

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