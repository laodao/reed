/**
 * 人像设计相关类型定义
 * @module types/portrait.types
 */

/**
 * 生成角度类型
 */
export type PortraitAngle = 'front' | 'left' | 'right' | 'back'

/**
 * 取景范围类型
 * half = 半身（ bust，面部细节优先，便于先定脸）
 * full = 全身（完整形象）
 */
export type PortraitFraming = 'half' | 'full'

/**
 * 参考图语义角色（每张参考图标注用途）
 */
export type ReferenceImageRole = 'character' | 'face' | 'pose' | 'clothing' | 'background'

/**
 * 变体类型
 */
export type PortraitVariantType = 'base' | 'clothes' | 'background' | 'face'

/**
 * 背景类型
 */
export type PortraitBackgroundType = 'solid' | 'transparent'

/**
 * 人种类型
 */
export type PortraitRace = 'asian' | 'european'

/**
 * 性别类型
 */
export type PortraitGender = 'male' | 'female'

/**
 * 人物项目（顶层容器）
 */
export interface PortraitProject {
  id: string
  name: string
  description?: string
  defaultProviderId?: string    // 默认AI提供商ID
  defaultModelId?: string       // 默认模型ID
  createdAt: number
  updatedAt: number
}

/**
 * 人物角色（属于项目，包含基本信息）
 */
export interface PortraitCharacter {
  id: string
  projectId: string
  name: string                    // 姓名
  gender: PortraitGender          // 性别
  age: number                     // 年龄
  height: number                  // 身高(cm)
  weight: number                  // 体重(kg)
  race: PortraitRace              // 人种
  description?: string            // 人物简介
  prompt?: string                 // 生成提示词（生成时设置）
  referenceImages: string[]       // 参考图片
  providerId?: string             // AI提供商ID（生成时设置）
  modelId?: string                // 模型ID（生成时设置）
  config: PortraitGenerateConfig  // 生成配置
  createdAt: number
  updatedAt: number
}

/**
 * 人物变体（属于人物角色）
 */
export interface PortraitVariant {
  id: string
  characterId: string             // 改为关联人物角色
  type: PortraitVariantType
  parentId?: string
  angle: PortraitAngle
  framing?: PortraitFraming       // 取景范围；undefined 视为 'full'（存量数据）
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
  backgroundType?: 'solid' | 'preset' | 'custom' | 'image'
  backgroundColor?: string
  presetScene?: string
  faceDescription?: string        // 面部修改描述（type='face' 时记录）
  faceTemplateId?: string         // 使用的面部模板 ID（type='face' 时记录）
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

// ==================== 项目相关请求/响应 ====================

/**
 * 创建项目请求
 */
export interface CreatePortraitProjectRequest {
  name: string
  description?: string
}

/**
 * 更新项目请求
 */
export interface UpdatePortraitProjectRequest {
  id: string
  name?: string
  description?: string
  defaultProviderId?: string    // 默认AI提供商ID
  defaultModelId?: string       // 默认模型ID
}

// ==================== 人物角色相关请求/响应 ====================

/**
 * 创建人物角色请求
 */
export interface CreatePortraitCharacterRequest {
  projectId: string
  name: string
  gender: PortraitGender
  age: number
  height: number
  weight: number
  race: PortraitRace
  description?: string
  prompt?: string                  // 可选，生成时设置
  referenceImages?: string[]
  providerId?: string              // 可选，生成时设置
  modelId?: string                 // 可选，生成时设置
  config?: Partial<PortraitGenerateConfig>
}

/**
 * 更新人物角色请求
 */
export interface UpdatePortraitCharacterRequest {
  id: string
  name?: string
  gender?: PortraitGender
  age?: number
  height?: number
  weight?: number
  race?: PortraitRace
  description?: string
  prompt?: string
  referenceImages?: string[]
  providerId?: string
  modelId?: string
  config?: Partial<PortraitGenerateConfig>
}

// ==================== 变体相关请求/响应 ====================

/**
 * 生成人物请求（基于人物角色）
 */
export interface GeneratePortraitRequest {
  characterId: string              // 改为人物角色ID
  prompt: string
  negativePrompt?: string          // 反向提示词
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
  characterId?: string
  variants?: PortraitVariant[]
  error?: string
}

/**
 * 换衣请求
 */
export interface ChangeClothesRequest {
  characterId: string              // 改为人物角色ID
  variantId?: string
  clothesDescription: string
  referenceImage?: string
  angles: PortraitAngle[]
  width?: number                   // 生成图片宽度（不传则继承 baseVariant.config / 默认值）
  height?: number                  // 生成图片高度
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
  characterId: string              // 改为人物角色ID
  variantId?: string
  backgroundType: 'solid' | 'preset' | 'custom' | 'image'
  backgroundColor?: string
  presetScene?: string
  customDescription?: string
  backgroundImage?: string
  angles: PortraitAngle[]
  width?: number                   // 生成图片宽度（不传则继承 baseVariant.config / 默认值）
  height?: number                  // 生成图片高度
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
  characterId: string
  variantId: string
  angle: PortraitAngle
}

/**
 * 生成多角度请求
 */
export interface GenerateAnglesRequest {
  characterId: string              // 改为人物角色ID
  angles: PortraitAngle[]
  variantId?: string
  width?: number                   // 生成图片宽度（不传则继承 referenceVariant.config / 默认值）
  height?: number                  // 生成图片高度
}

/**
 * 编辑图片请求（基于已有 variant 编辑，保留人物一致性）
 */
export interface EditImageRequest {
  characterId: string
  variantId: string
  editPrompt: string
  width?: number                   // 生成图片宽度（不传则继承 variant.config / 默认值）
  height?: number                  // 生成图片高度
}

/**
 * 编辑图片响应
 */
export interface EditImageResponse {
  success: boolean
  variant?: PortraitVariant
  error?: string
}

/**
 * 生成多角度响应
 */
export interface GenerateAnglesResponse {
  success: boolean
  variants?: PortraitVariant[]
  warning?: string
  error?: string
}

/**
 * 导出请求
 */
export interface ExportPortraitRequest {
  characterId: string              // 改为人物角色ID
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

// ==================== 列表响应 ====================

/**
 * 项目列表响应
 */
export interface ListPortraitProjectsResponse {
  success: boolean
  projects: PortraitProject[]
  total: number
}

/**
 * 人物角色列表响应
 */
export interface ListPortraitCharactersResponse {
  success: boolean
  characters: PortraitCharacter[]
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

// ==================== 常量 ====================

/**
 * 人像生成默认可选尺寸列表（前端尺寸下拉候选的回退基准 + 后端尺寸 fallback 的基准）
 *
 * 设计：前端 SizeSelector 在模型未提供 supportedSizes 时回退到此列表，
 * 并与模型 supportedSizes 取并集展示；后端 Service 在 request/variant.config
 * 均无尺寸时回退到 DEFAULT_PORTRAIT_SIZES[0]（768x1024，竖版更适合全身照）。
 */
export const DEFAULT_PORTRAIT_SIZES: string[] = [
  '768x1024',   // 竖版全身（默认）
  '896x1152',   // 竖版全身
  '1024x1792',  // 竖版全身（高清）
  '1024x1024',  // 正方形
  '512x512',
  '768x768',
  '1024x768',   // 横版
  '1792x1024'   // 横版
]

/**
 * 人像生成默认尺寸（前端/后端 fallback 基准，对应 DEFAULT_PORTRAIT_SIZES[0]）
 */
export const DEFAULT_PORTRAIT_WIDTH = 768
export const DEFAULT_PORTRAIT_HEIGHT = 1024

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
  background: '换背景变体',
  face: '面部变体'
}

/**
 * 取景范围显示名称
 */
export const FRAMING_LABELS: Record<PortraitFraming, string> = {
  half: '半身',
  full: '全身'
}

/**
 * framing 对应的 prompt 取景后缀（默认值，可被调用方覆盖）
 */
export const FRAMING_PROMPT_SUFFIX: Record<PortraitFraming, string> = {
  half: 'upper body shot, bust portrait, head and shoulders visible',
  full: 'full body shot, standing upright, complete figure from head to toe'
}

/**
 * 性别显示名称
 */
export const GENDER_LABELS: Record<PortraitGender, string> = {
  male: '男',
  female: '女'
}

/**
 * 人种显示名称
 */
export const RACE_LABELS: Record<PortraitRace, string> = {
  asian: '亚洲人',
  european: '欧洲人'
}

/**
 * 角度提示词映射
 */
export const ANGLE_PROMPTS: Record<PortraitAngle, string> = {
  front: 'front view, facing camera, full face visible, looking at viewer',
  left: 'left side view, profile from the left, left ear visible, facing left',
  right: 'right side view, profile from the right, right ear visible, facing right',
  back: 'back view, from behind, rear view, full back visible'
}