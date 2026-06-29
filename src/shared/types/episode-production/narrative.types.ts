/**
 * episode-production · 剧本/场景/分镜结构 · 类型定义
 * @module shared/types/episode-production/narrative.types
 * @description 剧本、场景、分镜及 AI 生成结果的结构化类型定义。
 *
 * 注：原类型定义来自 src/shared/types/story-to-video.types.ts，
 *     P1 拆分后旧文件改为 deprecated re-export。修改请改本文件。
 */

import type { LocationType, TimeOfDay, WeatherType, AudioAsset, ImageAsset } from './domain.types'
import type { TransitionConfig } from './compose.types'

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
 * 转场类型
 */
export type TransitionType =
  | 'cut' // 硬切
  | 'fade' // 淡入淡出
  | 'dissolve' // 叠化
  | 'wipe' // 划像
  | 'slide' // 滑动
  | 'zoom' // 缩放
  | 'iris' // 圈入圈出
  | 'whip' // 甩镜

/**
 * 焦距预设（字符串，带 mm 单位）
 */
export type LensFocalMm = '24mm' | '35mm' | '50mm' | '85mm' | '125mm'

/**
 * 光圈预设
 */
export type Aperture = 'f/1.8' | 'f/2.8' | 'f/4' | 'f/8' | 'f/11'

/**
 * 相机风格
 */
export type CameraStyle = 'cinematic' | 'digital' | 'film_35mm' | 'vintage'

/**
 * 打光预设
 */
export type LightingPreset =
  | 'rembrandt' // 伦勃朗光
  | 'three_point' // 三点照明
  | 'butterfly' // 蝴蝶光
  | 'split' // 分割光
  | 'rim_backlight' // 逆光轮廓
  | 'flat_softbox' // 平铺柔光
  | 'golden_hour' // 黄金时刻
  | 'blue_hour' // 蓝调时刻
  | 'noir_hard' // 黑色电影硬光
  | 'cyberpunk_neon' // 赛博朋克霓虹
  | 'cozy_candle' // 温暖烛光
  | 'cold_clinical' // 冷峻照明

/**
 * 镜头语言枚举常量（供提示词使用）
 * @description 将所有镜头语言枚举汇总，便于提示词引用和 VLM 映射
 */
export const SHOT_LANGUAGE_ENUMS = {
  shotTypes: ['extreme_long', 'long', 'full', 'medium', 'medium_close', 'close', 'extreme_close', 'detail'] as const,
  cameraAngles: ['eye_level', 'high', 'low', 'dutch', 'birds_eye', 'worms_eye'] as const,
  cameraMovements: ['static', 'pan_left', 'pan_right', 'tilt_up', 'tilt_down', 'dolly_in', 'dolly_out', 'truck_left', 'truck_right', 'zoom_in', 'zoom_out', 'crane_up', 'crane_down', 'handheld', 'orbit'] as const,
  transitionTypes: ['cut', 'fade', 'dissolve', 'wipe', 'slide', 'zoom', 'iris', 'whip'] as const,
  lensFocalMms: ['24mm', '35mm', '50mm', '85mm', '125mm'] as const,
  apertures: ['f/1.8', 'f/2.8', 'f/4', 'f/8', 'f/11'] as const,
  cameraStyles: ['cinematic', 'digital', 'film_35mm', 'vintage'] as const,
  lightingPresets: ['rembrandt', 'three_point', 'butterfly', 'split', 'rim_backlight', 'flat_softbox', 'golden_hour', 'blue_hour', 'noir_hard', 'cyberpunk_neon', 'cozy_candle', 'cold_clinical'] as const,
} as const

/**
 * VLM 景别到标准景别的映射
 * @description VLM 模型使用的景别枚举与标准不同，需要映射转换
 *
 * 映射依据（VLM 提示词定义）：
 * - big_close_up: "局部脸部/眼睛/手部细节" → detail（极小细节）
 * - close_up: "完整面部，展示表情" → extreme_close（人物面部）
 * - medium: "腰部以上，展示互动" → medium_close（人物腰部以上）
 * - long: "人物全身，展示动作" → full（人物全身）
 * - wide: "环境为主，人物较小" → extreme_long（展示宏大环境）
 */
export const VLM_SHOT_TYPE_MAP: Record<string, ShotType> = {
  'big_close_up': 'detail',
  'close_up': 'extreme_close',
  'medium': 'medium_close',
  'long': 'full',
  'wide': 'extreme_long',
}

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
 * 场景道具引用（spec §4.1：每个 prop 含 item_binding_id）。
 * JSON 列中支持两种表示——纯字符串（老数据）或 {itemBindingId, name} 对象（新数据）。
 */
export interface ScenePropRef {
  itemBindingId: string | null
  name: string
}

/**
 * 场景中的角色
 */
export interface SceneCharacter {
  /** spec §4.1：character_binding.id 强引用（定稿前 validator 要求非空） */
  characterBindingId?: string | null
  characterId: string // 长文写作中的角色ID（兼容字段）
  characterName: string // 角色名称
  portraitId?: string // 绑定的人像ID

  // 角色状态
  position?: 'left' | 'center' | 'right' | 'foreground' | 'background'
  expression?: string // 表情
  action?: string // 当前动作
  outfit?: string // 服装描述
  /** 道具：兼容老格式（string[]）和新格式（ScenePropRef[]） */
  props?: Array<string | ScenePropRef>
}

/**
 * 动作描述
 */
export interface ActionDescription {
  id: string
  /** spec §4.1：执行者 character_binding.id；群像动作为 null */
  characterBindingId?: string | null
  characterId?: string // 兼容字段
  description: string // 动作描述
  timing: 'before' | 'during' | 'after' // 动作时机（相对于对话）
  duration?: number // 预计时长（秒）
}

/**
 * 对话
 */
export interface Dialogue {
  id: string
  /** spec §4.1：讲话人 character_binding.id */
  characterBindingId?: string | null
  characterId: string
  characterName: string
  text: string // 对话内容
  emotion?: string // 情感
  volume?: 'normal' | 'loud' | 'whisper' // 音量
  pace?: 'normal' | 'fast' | 'slow' // 语速
  pause?: number // 停顿（毫秒）

  // 配音信息
  voiceId?: string | null // 指定的声音ID
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
  location: string // 地点名称（兜底显示）
  /** spec §4.1：场景对地点 binding 的强引用；定稿前 validator 要求非空 */
  locationBindingId?: string | null
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
  outlineId?: string // 关联的长文大纲节点（可空）
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

  // 生成的视频路径
  videoPath?: string // 生成的视频路径

  // 时长
  duration: number // 分镜时长（秒）

  // 关键帧总数（前端编辑面板按钮组持久化字段，spec §4.2 / §4.7）
  keyframeCount?: number

  /**
   * 是否走关键帧流程（默认 true）。
   * false → 跳过关键帧，VideoSegmentPanel 直接用 frameDescription + 资产引用生成视频。
   */
  useKeyframes?: boolean

  /**
   * ⑥ 合成时是否入最终成片（默认 true）。
   * false → buildEpisodeTimeline 跳过该分镜，不参与最终视频。
   */
  includeInFinal?: boolean

  // 转场设置
  transition: TransitionConfig

  // 状态
  status: StoryboardStatus

  /**
   * 用户在 ⑤ 制作 stage 为本分镜挑选的资产参考图覆盖。
   * key: `${kind}:${bindingId}`，value: imageId（asset_image.id）。
   * NULL/缺失 → 按现有 reference-image-selector 评分逻辑自动选图。
   */
  referenceImageIds?: Record<string, string> | null

  /**
   * 分镜级 location binding 列表（spec 2026-05-09）。
   * 非空覆盖 scene.location_binding_id；空 / 缺失走 scene 默认。
   */
  locationBindingIds?: string[]

  /**
   * 分镜级 item binding 列表（spec 2026-05-09）。
   * 非空覆盖 scene.characters[*].props 推导；空 / 缺失走 scene 默认。
   */
  itemBindingIds?: string[]

  createdAt: number
  updatedAt: number
}

/**
 * 数据库中的剧本记录
 */
export interface EpisodeScriptRecord {
  id: string
  project_id: string
  episode_id: string
  outline_id: string | null // 关联的大纲ID（可空）
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
  characters: string // JSON（保留兼容，推荐使用 storyboard_characters 表）
  narration_id: string | null
  dialogue_ids: string // JSON（保留兼容，推荐使用 storyboard_dialogue_links 表）
  action_ids: string // JSON（保留兼容，推荐使用 storyboard_action_links 表）
  frame_image: string | null // JSON（保留兼容，推荐使用 frame_image_id）
  frame_image_id: string | null // 外键关联图像资产
  video_path: string | null // 生成的视频路径
  duration: number
  // 转场配置（规范化字段）
  transition: string // JSON（保留兼容）
  transition_type: string | null
  transition_duration_ms: number | null
  transition_direction: string | null
  transition_easing: string | null
  transition_color: string | null
  status: StoryboardStatus
  created_at: number
  updated_at: number
}

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
 * AI 生成的场景道具（spec §4.1：每个 prop 含 item_binding_id）。
 * 与 SceneCharacter.props 内嵌的 ScenePropRef 同形（保持别名是为了语义清晰：
 * Generated* 系列代表 AI 输出阶段，SceneCharacter 系列代表持久化形态）。
 */
export type GeneratedScenePropRef = ScenePropRef

/**
 * AI 生成的场景角色
 */
export interface GeneratedSceneCharacter {
  /** spec §4.1 强约束：character_binding.id；命中 roster 时为 binding ID；未命中为 null */
  characterBindingId: string | null
  characterId: string // 长文角色 ID（兼容字段，逐步淘汰）
  characterName: string // 角色名称
  portraitId?: string // 人像ID
  position?: 'left' | 'center' | 'right' | 'foreground' | 'background'
  expression?: string // 表情
  action?: string // 动作
  outfit?: string // 服装描述
  /** 道具列表，spec §4.1：每个 prop 含 item_binding_id */
  props?: GeneratedScenePropRef[]
}

/**
 * AI 生成的对话
 */
export interface GeneratedDialogue {
  id: string
  /** spec §4.1：每个 Dialogue 含 character_binding_id + voice_id */
  characterBindingId: string | null
  characterId: string
  characterName: string
  text: string // 对话内容
  emotion?: string // 情感
  volume?: 'normal' | 'loud' | 'whisper' // 音量
  pace?: 'normal' | 'fast' | 'slow' // 语速
  pause?: number // 停顿（毫秒）
  /** 指定声音；空时由角色 binding.voiceId 兜底 */
  voiceId?: string | null
}

/**
 * AI 生成的动作
 */
export interface GeneratedAction {
  id: string
  /** spec §4.1：动作执行者 character_binding.id；群像动作（无角色）为 null */
  characterBindingId: string | null
  characterId?: string // 兼容字段
  description: string // 动作描述
  timing: 'before' | 'during' | 'after' // 动作时机（相对于对话）
  duration?: number // 预计时长（秒）
}

/**
 * AI 生成的场景数据
 */
export interface GeneratedScene {
  sceneNumber: number
  location: string // 地点名称（兜底显示）
  /** spec §4.1：每个 SceneScript 含 location_binding_id；未命中 roster 为 null */
  locationBindingId: string | null
  locationType: LocationType // 内景/外景
  timeOfDay: TimeOfDay
  weather?: WeatherType
  sceneDescription: string // 场景视觉描述
  /** 地点关键物件列表（用于地点绑定 baseDescription 参考） */
  locationKeyObjects?: string[]
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

/**
 * 剧本生成入参的资产花名册（spec §4.1）
 *
 * 由调用方（script handler）从 character_bindings / location_bindings / item_bindings
 * 表读取项目级资产构建。Generator 把花名册注入提示词，AI 用 binding ID 引用。
 */
export interface AssetRosterEntry {
  bindingId: string
  name: string
  description?: string
}

export interface AssetRosterForScript {
  characters: AssetRosterEntry[]
  locations: AssetRosterEntry[]
  items: AssetRosterEntry[]
}
