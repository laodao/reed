/**
 * 图像相关类型定义
 * @module types/image.types
 */

/**
 * 图像记录
 */
export interface ImageRecord {
  id: string
  dialogId?: string
  messageId?: string
  filePath: string
  fileName?: string
  fileSize?: number
  mimeType?: string
  width?: number
  height?: number
  favorite: boolean
  createdAt: Date
}

/**
 * 生成图像请求
 */
export interface GenerateImageRequest {
  provider: string
  model: string
  prompt: string
  negativePrompt?: string
  width: number
  height: number
  style?: string
  quality?: string
  count?: number
  referenceImage?: string
}

/**
 * 生成图像响应
 */
export interface GenerateImageResponse {
  success: boolean
  images?: ImageRecord[]
  error?: string
}

/**
 * 图像列表响应
 */
export interface ListImagesResponse {
  success: boolean
  images: ImageRecord[]
  total: number
  hasMore: boolean
}

/**
 * 尺寸选项
 */
export interface SizeOption {
  label: string
  value: string
  width: number
  height: number
}

/**
 * 风格选项
 */
export interface StyleOption {
  label: string
  value: string
  preview?: string
}

/**
 * 品质选项
 */
export interface QualityOption {
  label: string
  value: string
  description: string
}

/**
 * 预定义尺寸选项
 */
export const SIZE_OPTIONS: SizeOption[] = [
  { label: '512x512 (方形)', value: '512x512', width: 512, height: 512 },
  { label: '1024x1024 (大方形)', value: '1024x1024', width: 1024, height: 1024 },
  { label: '1024x768 (横版)', value: '1024x768', width: 1024, height: 768 },
  { label: '768x1024 (竖版)', value: '768x1024', width: 768, height: 1024 }
]

/**
 * 预定义风格选项
 */
export const STYLE_OPTIONS: StyleOption[] = [
  { label: '写实', value: 'realistic' },
  { label: '动漫', value: 'anime' },
  { label: '油画', value: 'oil_painting' },
  { label: '水彩', value: 'watercolor' },
  { label: '素描', value: 'sketch' },
  { label: '像素', value: 'pixel' },
  { label: '赛博朋克', value: 'cyberpunk' },
  { label: '3D渲染', value: '3d_render' }
]
