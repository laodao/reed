/**
 * episode-production · 资产/设定/通用枚举 · 类型定义
 * @module shared/types/episode-production/domain.types
 * @description 资产卡、设定卡、通用枚举类型（地点、时间段、天气、角色/地点/物品绑定、图像/音频资产）。
 *
 * 注：原类型定义来自 src/shared/types/story-to-video.types.ts，
 *     P1 拆分后旧文件改为 deprecated re-export。修改请改本文件。
 */

/** 资产卡数据来源（spec §3.7） */
export type AssetBindingSourceType = 'linked_lw' | 'standalone'

/**
 * 场景地点类型
 */
export type LocationType = 'interior' | 'exterior' | 'mixed'

/**
 * 时间段
 */
export type TimeOfDay =
  | 'morning'
  | 'noon'
  | 'afternoon'
  | 'evening'
  | 'night'
  | 'dawn'
  | 'dusk'

/**
 * 天气类型
 */
export type WeatherType =
  | 'sunny'
  | 'cloudy'
  | 'rainy'
  | 'snowy'
  | 'foggy'
  | 'stormy'

/**
 * 音频类型
 */
export type AudioType = 'narration' | 'dialogue' | 'music' | 'sfx' | 'ambient'

/**
 * 图像资产类型
 */
export type ImageAssetType = 'generated' | 'uploaded'

/**
 * 图像资产
 */
export interface ImageAsset {
  id: string
  type: ImageAssetType
  provider?: string // 生成提供商
  model?: string // 生成模型
  prompt: string // 生成提示词
  negativePrompt?: string // 负面提示词
  imagePath: string // 图片路径
  thumbnailPath?: string // 缩略图路径
  width: number
  height: number
  metadata?: Record<string, any>
  createdAt: number
}

/**
 * 音频资产
 */
export interface AudioAsset {
  id: string
  type: AudioType
  text?: string // 文本内容（TTS用）
  voiceId?: string // 声音ID
  audioPath: string // 音频路径
  duration: number // 时长（毫秒）
  volume: number // 音量 0-100
  fadeIn?: number // 淡入（毫秒）
  fadeOut?: number // 淡出（毫秒）
  createdAt: number
}

/**
 * 角色形象绑定
 */
export interface CharacterBinding {
  id: string
  projectId: string
  /**
   * 长文写作角色ID。仅 source_type='linked_lw' 时有值；standalone 模式必须为 null
   * （migration: relax-binding-lw-id-nullable）。
   */
  longWritingCharacterId: string | null
  portraitId?: string // 人像设计ID

  // 如果没有人像，使用配置生成
  generateConfig?: {
    baseDescription: string // 基础描述
    styleReference?: string // 风格参考图
    additionalPrompts?: string // 额外提示词
  }

  // 声音配置
  voiceConfig: {
    voiceId: string // 声音ID
    speed: number // 语速
    pitch: number // 音调
  }

  // P2 task 1 双源字段（spec §3.7）
  sourceType: AssetBindingSourceType
  overrideName?: string | null
  overrideDescription?: string | null
  overrideAppearance?: string | null
  overrideOutfit?: string | null
  standaloneName?: string | null
  standaloneDescription?: string | null

  createdAt: number
  updatedAt: number
}

/**
 * 地点形象绑定
 */
export interface LocationBinding {
  id: string
  projectId: string
  /**
   * 长文写作地点ID。仅 source_type='linked_lw' 时有值；standalone 模式必须为 null
   * （migration: relax-binding-lw-id-nullable）。
   */
  longWritingLocationId: string | null
  locationName: string // 地点名称

  // 图片资产
  imagePaths: string[] // 地点图片路径列表
  thumbnailPath?: string // 缩略图路径

  // 图片生成配置
  generateConfig?: {
    baseDescription: string // 基础描述（从地点设定提取）
    styleReference?: string // 风格参考图
    additionalPrompts?: string // 额外提示词
    timeOfDay?: TimeOfDay // 时间段
    weather?: WeatherType // 天气
  }

  // 是否自动生成图片
  generateImages: boolean

  // P2 task 1 双源字段
  sourceType: AssetBindingSourceType
  overrideName?: string | null
  overrideDescription?: string | null
  standaloneName?: string | null
  standaloneDescription?: string | null
  panorama3dId?: string | null      // 接入点 P3c 用
  sceneLayoutId?: string | null     // 接入点 Phase 8 用

  createdAt: number
  updatedAt: number
}

/**
 * 物品形象绑定
 */
export interface ItemBinding {
  id: string
  projectId: string
  /**
   * 长文写作物品ID。仅 source_type='linked_lw' 时有值；standalone 模式必须为 null
   * （migration: relax-binding-lw-id-nullable）。
   */
  longWritingItemId: string | null
  itemName: string // 物品名称

  // 图片资产
  imagePaths: string[] // 物品图片路径列表
  thumbnailPath?: string // 缩略图路径

  // 图片生成配置
  generateConfig?: {
    baseDescription: string // 基础描述（从物品设定提取）
    styleReference?: string // 风格参考图
    additionalPrompts?: string // 额外提示词
  }

  // 是否自动生成图片
  generateImages: boolean

  // P2 task 1 双源字段
  sourceType: AssetBindingSourceType
  overrideName?: string | null
  overrideDescription?: string | null
  standaloneName?: string | null
  standaloneDescription?: string | null

  createdAt: number
  updatedAt: number
}

/**
 * 数据库中的角色绑定记录
 */
export interface CharacterBindingRecord {
  id: string
  project_id: string
  long_writing_character_id: string
  portrait_id: string | null
  // 旧JSON字段（保留兼容）
  generate_config: string | null // JSON
  voice_config: string | null // JSON
  // 规范化字段：声音配置
  voice_id: string | null
  voice_speed: number | null
  voice_pitch: number | null
  // 规范化字段：生成配置
  base_description: string | null
  style_reference: string | null
  additional_prompts: string | null
  created_at: number
  updated_at: number
}

/**
 * 数据库中的地点绑定记录
 */
export interface LocationBindingRecord {
  id: string
  project_id: string
  long_writing_location_id: string
  location_name: string
  image_paths: string // JSON 数组
  thumbnail_path: string | null
  // 生成配置
  generate_config: string | null // JSON
  base_description: string | null
  style_reference: string | null
  additional_prompts: string | null
  time_of_day: string | null
  weather: string | null
  generate_images: number // 0 或 1
  created_at: number
  updated_at: number
}

/**
 * 数据库中的物品绑定记录
 */
export interface ItemBindingRecord {
  id: string
  project_id: string
  long_writing_item_id: string
  item_name: string
  image_paths: string // JSON 数组
  thumbnail_path: string | null
  // 生成配置
  generate_config: string | null // JSON
  base_description: string | null
  style_reference: string | null
  additional_prompts: string | null
  generate_images: number // 0 或 1
  created_at: number
  updated_at: number
}

/**
 * 资产生效数据（spec §3.7）：
 * source_type 决定字段来源——linked_lw 走"长文基础值 + override"；standalone 直接读 standalone_*。
 *
 * 设定卡上的非 override / 非 standalone_* 字段（alias / role / gender / age / race /
 * styleAnchors / outfitsExtra）直接从 binding 自身读，不参与双源投影。
 * AI 主图 / 派生图 prompt 拼装时按需引用。
 */
export interface EffectiveCharacterData {
  name: string
  description: string
  appearance?: string | null
  outfit?: string | null
  voiceId?: string | null
  portraitId?: string | null
  source: AssetBindingSourceType
  /** 别名（"三爷 / 浪剑客"） */
  alias?: string | null
  /** 定位（protagonist / antagonist / supporting / minor） */
  role?: string | null
  /** 性别（male / female / other） */
  gender?: string | null
  /** 年龄 */
  age?: number | null
  /** 人种（east_asian / south_asian / southeast_asian / central_asian / european / african / south_american） */
  race?: string | null
  /** 风格锚点列表 */
  styleAnchors?: string[] | null
  /** 备选服装列表 */
  outfitsExtra?: string[] | null
}

export interface EffectiveLocationData {
  name: string
  description: string
  source: AssetBindingSourceType
}

export interface EffectiveItemData {
  name: string
  description: string
  source: AssetBindingSourceType
  /** 风格锚点（spec 2026-05-08 与 character/location 对齐） */
  styleAnchors?: string[]
}
