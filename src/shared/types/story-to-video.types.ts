/**
 * 剧集制作模块类型定义
 * @module types/story-to-video
 * @description 长文转剧集视频功能的所有数据类型定义
 */

// ==================== 枚举类型 ====================

/**
 * 转场类型
 */
export type TransitionType =
  | 'cut' // 硬切
  | 'fade' // 淡入淡出
  | 'dissolve' // 溶解
  | 'wipe' // 擦除
  | 'slide' // 滑动
  | 'zoom' // 缩放
  | 'iris' // 光圈
  | 'whip' // 甩镜

/**
 * 景别类型
 */
export type ShotType =
  | 'extreme_long' // 大远景 - 展示宏大环境
  | 'long' // 远景 - 展示完整场景
  | 'full' // 全景 - 人物全身
  | 'medium' // 中景 - 人物膝盖以上
  | 'medium_close' // 中近景 - 人物腰部以上
  | 'close' // 近景 - 人物胸部以上
  | 'extreme_close' // 特写 - 人物面部或局部
  | 'detail' // 大特写 - 极小细节

/**
 * 镜头运动
 */
export type CameraMovement =
  | 'static' // 固定
  | 'pan_left' // 左摇
  | 'pan_right' // 右摇
  | 'tilt_up' // 上仰
  | 'tilt_down' // 下俯
  | 'dolly_in' // 推镜
  | 'dolly_out' // 拉镜
  | 'truck_left' // 左移
  | 'truck_right' // 右移
  | 'zoom_in' // 变焦推进
  | 'zoom_out' // 变焦拉远
  | 'crane_up' // 升镜
  | 'crane_down' // 降镜
  | 'handheld' // 手持晃动
  | 'orbit' // 环绕

/**
 * 镜头角度
 */
export type CameraAngle =
  | 'eye_level' // 平视
  | 'high' // 俯拍
  | 'low' // 仰拍
  | 'dutch' // 荷兰角（倾斜）
  | 'birds_eye' // 鸟瞰
  | 'worms_eye' // 虫视（极低角度）

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
 * 项目状态
 */
export type ProjectStatus = 'draft' | 'producing' | 'completed'

/**
 * 剧集状态
 */
export type EpisodeStatus =
  | 'pending'
  | 'scripting'
  | 'storyboarding'
  | 'producing'
  | 'reviewing'
  | 'completed'

/**
 * 剧本状态
 */
export type ScriptStatus = 'pending' | 'generating' | 'reviewing' | 'approved'

/**
 * 分镜状态
 */
export type StoryboardStatus =
  | 'pending' // 待处理
  | 'generating' // 生成中
  | 'reviewing' // 待审核
  | 'approved' // 已通过
  | 'error' // 错误

/**
 * 音频类型
 */
export type AudioType = 'narration' | 'dialogue' | 'music' | 'sfx' | 'ambient'

/**
 * 图像资产类型
 */
export type ImageAssetType = 'generated' | 'uploaded'

// ==================== 配置类型 ====================

/**
 * 转场配置
 */
export interface TransitionConfig {
  type: TransitionType
  duration: number // 转场时长（毫秒）
  direction?: 'left' | 'right' | 'up' | 'down' // 滑动/擦除方向
  easing?: 'linear' | 'ease_in' | 'ease_out' | 'ease_in_out'
  color?: string // 淡入淡出颜色（hex）
}

/**
 * 剧集项目配置
 */
export interface VideoProjectConfig {
  // 视频设置
  resolution: '1080p' | '720p' | '4k'
  aspectRatio: '16:9' | '9:16' | '1:1'
  fps: 24 | 30 | 60

  // 音频设置
  defaultNarratorVoice: string // 默认旁白声音
  defaultCharacterVoice: string // 默认角色声音
  backgroundMusicEnabled: boolean
  backgroundMusicVolume: number // 0-100

  // 图像设置
  imageProviderId: string // 图像生成提供商
  imageModelId: string // 图像模型
  imageStyle: string // 图像风格（写实/动漫/插画等）

  // 默认镜头设置
  defaultShotDuration: number // 默认分镜时长（秒）
  defaultTransitionType: TransitionType // 默认转场类型
  defaultTransitionDuration: number // 默认转场时长（毫秒）
}

// ==================== 资产类型 ====================

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

// ==================== 剧集项目 ====================

/**
 * 剧集项目
 */
export interface VideoProject {
  id: string
  name: string
  longWritingProjectId: string // 关联的长文项目
  status: ProjectStatus
  config: VideoProjectConfig
  createdAt: number
  updatedAt: number
}

// ==================== 角色绑定 ====================

/**
 * 角色形象绑定
 */
export interface CharacterBinding {
  id: string
  projectId: string
  longWritingCharacterId: string // 长文写作角色ID
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

  createdAt: number
  updatedAt: number
}

// ==================== 剧本相关 ====================

/**
 * 场景中的角色
 */
export interface SceneCharacter {
  characterId: string // 长文写作中的角色ID
  characterName: string // 角色名称
  portraitId?: string // 绑定的人像ID

  // 角色状态
  position?: 'left' | 'center' | 'right' | 'foreground' | 'background'
  expression?: string // 表情
  action?: string // 当前动作
  outfit?: string // 服装描述
  props?: string[] // 道具
}

/**
 * 动作描述
 */
export interface ActionDescription {
  id: string
  characterId?: string // 执行动作的角色（空表示群像动作）
  description: string // 动作描述
  timing: 'before' | 'during' | 'after' // 动作时机（相对于对话）
  duration?: number // 预计时长（秒）
}

/**
 * 对话
 */
export interface Dialogue {
  id: string
  characterId: string
  characterName: string
  text: string // 对话内容
  emotion?: string // 情感
  volume?: 'normal' | 'loud' | 'whisper' // 音量
  pace?: 'normal' | 'fast' | 'slow' // 语速
  pause?: number // 停顿（毫秒）

  // 配音信息
  voiceId?: string // 指定的声音ID
  audioAsset?: AudioAsset // 生成的音频资产
}

/**
 * 场景剧本
 */
export interface SceneScript {
  id: string
  episodeScriptId: string
  sceneNumber: number

  // 场景信息
  location: string // 地点名称
  locationType: LocationType // 内景/外景
  timeOfDay: TimeOfDay
  weather?: WeatherType

  // 场景描述
  sceneDescription: string // 场景视觉描述
  mood: string // 氛围：紧张/温馨/悲伤等
  lighting?: string // 光线描述

  // 出场角色
  characters: SceneCharacter[]

  // 内容
  originalText: string // 原文片段
  narration: string // 旁白文本
  dialogues: Dialogue[] // 对话列表
  actions: ActionDescription[] // 动作描述

  createdAt: number
  updatedAt: number
}

/**
 * 剧本（章节级别）
 */
export interface EpisodeScript {
  id: string
  projectId: string
  episodeId: string
  outlineId: string // 关联的长文大纲节点
  status: ScriptStatus

  // 剧本内容
  synopsis: string // 章节梗概
  scriptContent?: string // 完整剧本正文（标准格式）
  scriptFormat?: string // 剧本格式类型
  scenes: SceneScript[] // 场景剧本列表

  // 元信息
  totalDuration: number // 预计总时长（秒）
  characterAppearances: string[] // 出场角色ID列表

  createdAt: number
  updatedAt: number
}

// ==================== 分镜相关 ====================

/**
 * 分镜中的角色
 */
export interface StoryboardCharacter {
  characterId: string
  position: {
    x: number // 相对位置 0-100
    y: number
    scale: number // 缩放比例
  }
  expression?: string
  action?: string
  facing?: 'front' | 'left' | 'right' | 'back' | 'three_quarter_left' | 'three_quarter_right'
}

/**
 * 分镜（Storyboard / Shot）
 */
export interface Storyboard {
  id: string
  sceneScriptId: string
  shotNumber: number // 分镜序号

  // 镜头语言
  shotType: ShotType // 景别
  cameraAngle: CameraAngle // 角度
  cameraMovement: CameraMovement // 镜头运动
  movementDuration?: number // 运动时长（秒）

  // 画面内容
  frameDescription: string // 画面描述
  subject?: string // 主体
  composition?: string // 构图描述

  // 角色信息
  characters: StoryboardCharacter[]

  // 关联内容
  narrationId?: string // 关联旁白ID
  dialogueIds: string[] // 关联对话ID列表
  actionIds: string[] // 关联动作ID列表

  // 画面资产
  frameImage?: ImageAsset // 帧画面图片

  // 时长
  duration: number // 分镜时长（秒）

  // 转场设置
  transition: TransitionConfig

  // 状态
  status: StoryboardStatus

  createdAt: number
  updatedAt: number
}

// ==================== 剧集 ====================

/**
 * 音轨
 */
export interface AudioTrack {
  id: string
  episodeId: string
  type: AudioType
  name: string
  audios: AudioAsset[]
  volume: number // 音量 0-100
  muted: boolean
  solo: boolean
}

/**
 * 剧集（对应一个章节）
 */
export interface VideoEpisode {
  id: string
  projectId: string
  outlineId: string // 关联的长文大纲节点
  episodeNumber: number // 剧集序号
  title: string
  status: EpisodeStatus
  duration: number // 时长（秒）

  // 关联剧本
  scriptId?: string

  // 音轨
  audioTracks: AudioTrack[]

  createdAt: number
  updatedAt: number
}

// ==================== 数据库类型 ====================

/**
 * 数据库中的剧集项目记录
 */
export interface VideoProjectRecord {
  id: string
  name: string
  long_writing_project_id: string
  status: ProjectStatus
  config: string // JSON
  created_at: number
  updated_at: number
}

/**
 * 数据库中的剧集记录
 */
export interface VideoEpisodeRecord {
  id: string
  project_id: string
  outline_id: string
  episode_number: number
  title: string
  status: EpisodeStatus
  duration: number
  script_id: string | null
  audio_tracks: string // JSON
  created_at: number
  updated_at: number
}

/**
 * 数据库中的剧本记录
 */
export interface EpisodeScriptRecord {
  id: string
  project_id: string
  episode_id: string
  outline_id: string
  status: ScriptStatus
  synopsis: string
  script_content: string | null // 完整剧本正文
  script_format: string | null // 剧本格式类型
  scenes: string // JSON
  total_duration: number
  character_appearances: string // JSON
  created_at: number
  updated_at: number
}

/**
 * 数据库中的场景剧本记录
 */
export interface SceneScriptRecord {
  id: string
  episode_script_id: string
  scene_number: number
  location: string
  location_type: LocationType
  time_of_day: TimeOfDay
  weather: WeatherType | null
  scene_description: string
  mood: string
  lighting: string | null
  characters: string // JSON
  original_text: string
  narration: string
  dialogues: string // JSON
  actions: string // JSON
  created_at: number
  updated_at: number
}

/**
 * 数据库中的分镜记录
 */
export interface StoryboardRecord {
  id: string
  scene_script_id: string
  shot_number: number
  shot_type: ShotType
  camera_angle: CameraAngle
  camera_movement: CameraMovement
  movement_duration: number | null
  frame_description: string
  subject: string | null
  composition: string | null
  characters: string // JSON
  narration_id: string | null
  dialogue_ids: string // JSON
  action_ids: string // JSON
  frame_image: string | null // JSON
  duration: number
  transition: string // JSON
  status: StoryboardStatus
  created_at: number
  updated_at: number
}

/**
 * 数据库中的角色绑定记录
 */
export interface CharacterBindingRecord {
  id: string
  project_id: string
  long_writing_character_id: string
  portrait_id: string | null
  generate_config: string | null // JSON
  voice_config: string // JSON
  created_at: number
  updated_at: number
}

// ==================== 新增：符合第三范式的子表记录类型 ====================

/**
 * 场景角色记录
 */
export interface SceneCharacterRecord {
  id: string
  scene_script_id: string
  character_id: string
  character_name: string
  position: string | null
  expression: string | null
  action: string | null
  outfit: string | null
  sort_order: number
}

/**
 * 场景道具记录
 */
export interface ScenePropRecord {
  id: string
  scene_character_id: string
  prop_name: string
}

/**
 * 场景对话记录
 */
export interface SceneDialogueRecord {
  id: string
  scene_script_id: string
  character_id: string
  character_name: string
  text: string
  emotion: string | null
  volume: string
  pace: string
  pause: number
  voice_id: string | null
  audio_asset_id: string | null
  sort_order: number
}

/**
 * 场景动作记录
 */
export interface SceneActionRecord {
  id: string
  scene_script_id: string
  character_id: string | null
  description: string
  timing: string
  duration: number | null
  sort_order: number
}

/**
 * 分镜角色记录
 */
export interface StoryboardCharacterRecord {
  id: string
  storyboard_id: string
  character_id: string
  position_x: number
  position_y: number
  position_scale: number
  expression: string | null
  action: string | null
  facing: string
  sort_order: number
}

/**
 * 分镜对话关联记录
 */
export interface StoryboardDialogueLinkRecord {
  id: string
  storyboard_id: string
  dialogue_id: string
  sort_order: number
}

/**
 * 分镜动作关联记录
 */
export interface StoryboardActionLinkRecord {
  id: string
  storyboard_id: string
  action_id: string
  sort_order: number
}

/**
 * 图像资产记录
 */
export interface ImageAssetRecord {
  id: string
  project_id: string
  type: string
  provider: string | null
  model: string | null
  prompt: string
  negative_prompt: string | null
  image_path: string
  thumbnail_path: string | null
  width: number
  height: number
  metadata: string | null
  created_at: number
}

/**
 * 音频资产记录
 */
export interface AudioAssetRecord {
  id: string
  project_id: string
  type: string
  text: string | null
  voice_id: string | null
  audio_path: string
  duration: number
  volume: number
  fade_in: number | null
  fade_out: number | null
  created_at: number
}

/**
 * 音轨记录
 */
export interface AudioTrackRecord {
  id: string
  episode_id: string
  type: string
  name: string
  volume: number
  muted: number
  solo: number
  sort_order: number
}

/**
 * 音轨音频关联记录
 */
export interface AudioTrackItemRecord {
  id: string
  track_id: string
  audio_asset_id: string
  start_time: number
  sort_order: number
}

// ==================== AI 生成结果类型 ====================

/**
 * AI 生成的场景角色
 */
export interface GeneratedSceneCharacter {
  characterId: string // 角色ID
  characterName: string // 角色名称
  portraitId?: string // 人像ID
  position?: 'left' | 'center' | 'right' | 'foreground' | 'background'
  expression?: string // 表情
  action?: string // 动作
  outfit?: string // 服装描述
  props?: string[] // 道具
}

/**
 * AI 生成的对话
 */
export interface GeneratedDialogue {
  id: string
  characterId: string
  characterName: string
  text: string // 对话内容
  emotion?: string // 情感
  volume?: 'normal' | 'loud' | 'whisper' // 音量
  pace?: 'normal' | 'fast' | 'slow' // 语速
  pause?: number // 停顿（毫秒）
}

/**
 * AI 生成的动作
 */
export interface GeneratedAction {
  id: string
  characterId?: string // 执行动作的角色（空表示群像动作）
  description: string // 动作描述
  timing: 'before' | 'during' | 'after' // 动作时机（相对于对话）
  duration?: number // 预计时长（秒）
}

/**
 * AI 生成的场景数据
 */
export interface GeneratedScene {
  sceneNumber: number
  location: string // 地点名称
  locationType: LocationType // 内景/外景
  timeOfDay: TimeOfDay
  weather?: WeatherType
  sceneDescription: string // 场景视觉描述
  mood: string // 氛围
  lighting?: string // 光线描述
  characters: GeneratedSceneCharacter[] // 出场角色
  originalText: string // 原文片段
  narration: string // 旁白文本
  dialogues: GeneratedDialogue[] // 对话列表
  actions: GeneratedAction[] // 动作描述
}

/**
 * AI 剧本生成结果
 */
export interface FullScriptGenerationResult {
  synopsis: string // 章节梗概（50-100字）
  scriptContent: string // 完整剧本正文（标准格式）
  scenes: GeneratedScene[] // 结构化场景数据（用于系统处理）
}