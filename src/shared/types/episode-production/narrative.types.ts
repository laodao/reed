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

  // 转场设置
  transition: TransitionConfig

  // 状态
  status: StoryboardStatus

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
