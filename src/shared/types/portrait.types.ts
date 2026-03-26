/**
 * 人像设计相关类型定义
 * @module types/portrait.types
 */

/**
 * 生成角度类型
 */
export type PortraitAngle = 'front' | 'left' | 'right' | 'back'

/**
 * 变体类型
 */
export type PortraitVariantType = 'base' | 'clothes' | 'background'

/**
 * 背景类型
 */
export type PortraitBackgroundType = 'solid' | 'transparent'

/**
 * 人物项目
 */
export interface PortraitProject {
  id: string
  name: string
  description?: string
  prompt: string
  referenceImages: string[]
  providerId: string
  modelId: string
  config: PortraitGenerateConfig
  createdAt: number
  updatedAt: number
}

/**
 * 人物变体
 */
export interface PortraitVariant {
  id: string
  projectId: string
  type: PortraitVariantType
  parentId?: string
  angle: PortraitAngle
  imagePath: string
  prompt: string
  config: Record<string, any>
  variantInfo?: PortraitVariantInfo
  createdAt: number
}

/**
 * 变体信息
 */
export interface PortraitVariantInfo {
  clothesDescription?: string
  backgroundDescription?: string
  backgroundType?: 'solid' | 'preset' | 'custom'
  backgroundColor?: string
  presetScene?: string
}

/**
 * 生成配置
 */
export interface PortraitGenerateConfig {
  angles: PortraitAngle[]
  backgroundType: PortraitBackgroundType
  backgroundColor?: string
  similarity?: 'low' | 'medium' | 'high'
  quality?: 'standard' | 'hd'
  seed?: number
  width?: number
  height?: number
}

/**
 * 创建项目请求
 */
export interface CreatePortraitProjectRequest {
  name: string
  description?: string
  prompt: string
  referenceImages?: string[]
  providerId: string
  modelId: string
  config?: Partial<PortraitGenerateConfig>
}

/**
 * 更新项目请求
 */
export interface UpdatePortraitProjectRequest {
  id: string
  name?: string
  description?: string
  prompt?: string
  referenceImages?: string[]
  providerId?: string
  modelId?: string
  config?: Partial<PortraitGenerateConfig>
}

/**
 * 生成人物请求
 */
export interface GeneratePortraitRequest {
  projectId?: string
  prompt: string
  referenceImages?: string[]
  providerId: string
  modelId: string
  config: PortraitGenerateConfig
}

/**
 * 生成人物响应
 */
export interface GeneratePortraitResponse {
  success: boolean
  projectId?: string
  variants?: PortraitVariant[]
  error?: string
}

/**
 * 换衣请求
 */
export interface ChangeClothesRequest {
  projectId: string
  variantId?: string
  clothesDescription: string
  angles: PortraitAngle[]
}

/**
 * 换衣响应
 */
export interface ChangeClothesResponse {
  success: boolean
  variants?: PortraitVariant[]
  error?: string
}

/**
 * 换背景请求
 */
export interface ChangeBackgroundRequest {
  projectId: string
  variantId?: string
  backgroundType: 'solid' | 'preset' | 'custom'
  backgroundColor?: string
  presetScene?: string
  customDescription?: string
  angles: PortraitAngle[]
}

/**
 * 换背景响应
 */
export interface ChangeBackgroundResponse {
  success: boolean
  variants?: PortraitVariant[]
  error?: string
}

/**
 * 重生成角度请求
 */
export interface RegenerateAngleRequest {
  projectId: string
  variantId: string
  angle: PortraitAngle
}

/**
 * 生成多角度请求（第二步）
 */
export interface GenerateAnglesRequest {
  projectId: string
  angles: PortraitAngle[]
}

/**
 * 生成多角度响应
 */
export interface GenerateAnglesResponse {
  success: boolean
  variants?: PortraitVariant[]
  error?: string
}

/**
 * 导出请求
 */
export interface ExportPortraitRequest {
  projectId: string
  variantIds?: string[]
  type: 'single' | 'grid' | 'zip'
  gridLayout?: 'horizontal' | 'vertical' | '2x2'
}

/**
 * 导出响应
 */
export interface ExportPortraitResponse {
  success: boolean
  filePath?: string
  error?: string
}

/**
 * 项目列表响应
 */
export interface ListPortraitProjectsResponse {
  success: boolean
  projects: PortraitProject[]
  total: number
}

/**
 * 变体列表响应
 */
export interface ListPortraitVariantsResponse {
  success: boolean
  variants: PortraitVariant[]
  total: number
}

/**
 * 预设背景场景
 */
export interface PresetBackgroundScene {
  id: string
  name: string
  description: string
  icon: string
}

/**
 * 预设背景场景列表
 */
export const PRESET_BACKGROUNDS: PresetBackgroundScene[] = [
  { id: 'indoor', name: '室内', description: '温馨的室内环境', icon: '🏠' },
  { id: 'outdoor', name: '户外', description: '自然户外场景', icon: '🌳' },
  { id: 'office', name: '办公室', description: '专业办公环境', icon: '🏢' },
  { id: 'studio', name: '工作室', description: '专业摄影工作室', icon: '🎬' },
  { id: 'gallery', name: '画廊', description: '艺术画廊背景', icon: '🖼️' },
  { id: 'street', name: '街道', description: '城市街道场景', icon: '🛣️' },
  { id: 'beach', name: '海滩', description: '海滩度假场景', icon: '🏖️' },
  { id: 'mountain', name: '山景', description: '壮丽山景背景', icon: '🏔️' }
]

/**
 * 角度显示名称
 */
export const ANGLE_LABELS: Record<PortraitAngle, string> = {
  front: '正面',
  left: '左侧',
  right: '右侧',
  back: '背面'
}

/**
 * 变体类型显示名称
 */
export const VARIANT_TYPE_LABELS: Record<PortraitVariantType, string> = {
  base: '基础形象',
  clothes: '换衣变体',
  background: '换背景变体'
}

/**
 * 角度提示词映射
 */
export const ANGLE_PROMPTS: Record<PortraitAngle, string> = {
  front: 'front view, facing camera, full face visible, looking at viewer',
  left: 'left side view, profile view, left side of face visible',
  right: 'right side view, profile view, right side of face visible',
  back: 'back view, from behind, rear view, seen from behind'
}