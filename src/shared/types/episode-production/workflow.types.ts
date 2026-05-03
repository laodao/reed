/**
 * episode-production · 流程（项目/剧集状态） · 类型定义
 * @module shared/types/episode-production/workflow.types
 * @description 剧集生产流程类型：项目状态枚举、剧集状态枚举、项目/剧集领域对象及数据库记录。
 *
 * 注：原类型定义来自 src/shared/types/story-to-video.types.ts，
 *     P1 拆分后旧文件改为 deprecated re-export。修改请改本文件。
 */

import type { TransitionType } from './compose.types'
// TODO(P2): VideoEpisode.audioTracks 应改为 audioTrackIds: string[]（关系引用），届时可移除对 render.types 的依赖。
import type { AudioTrack } from './render.types'

/**
 * 项目状态
 */
export type ProjectStatus = 'draft' | 'producing' | 'completed'

/**
 * 剧集状态
 *
 * P2 变更（spec §2.4）：
 * - 新增 'asset_prep'：已识别角色/地点/物品，等待素材确认
 * - 'reviewing' 改名为 'composing'：合成/后期审查阶段
 */
export type EpisodeStatus =
  | 'pending'
  | 'asset_prep'      // P2 新增（spec §2.4）：已识别要素，等待素材确认
  | 'scripting'
  | 'storyboarding'
  | 'producing'
  | 'composing'       // P2 改名（旧 'reviewing'）：合成/后期审查阶段
  | 'completed'

/**
 * 剧集内容来源类型
 */
export type EpisodeSourceType = 'outline' | 'uploaded'

/**
 * 上传长文识别的角色
 */
export interface UploadedCharacter {
  name: string
  description?: string
  role?: string // 主角、配角、反派等
}

/**
 * 上传长文识别的地点
 */
export interface UploadedLocation {
  name: string
  description?: string
  type?: string // 地点类型
}

/**
 * 上传长文识别的物品
 */
export interface UploadedItem {
  name: string
  description?: string
  type?: string // 物品类型
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

  // 模型设置（各环节独立配置）
  // 剧本生成模型
  scriptModel?: {
    providerConfigId: string
    modelId: string
  }
  // 分镜生成模型
  storyboardModel?: {
    providerConfigId: string
    modelId: string
  }
  // 画面生成模型
  imageModel?: {
    providerConfigId: string
    modelId: string
  }
  // 视频合成模型
  videoModel?: {
    providerConfigId: string
    modelId: string
  }
  // 音频生成模型
  audioModel?: {
    providerConfigId: string
    modelId: string
  }

  // 图像设置
  imageProviderId: string // 图像生成提供商
  imageModelId: string // 图像模型
  imageStyle: string // 图像风格（写实/动漫/插画等）

  // 默认镜头设置
  defaultShotDuration: number // 默认分镜时长（秒）
  defaultTransitionType: TransitionType // 默认转场类型
  defaultTransitionDuration: number // 默认转场时长（毫秒）
}

/**
 * 剧集项目
 */
export interface VideoProject {
  id: string
  name: string
  longWritingProjectId?: string // 关联的长文项目（可选）
  status: ProjectStatus
  config: VideoProjectConfig
  createdAt: number
  updatedAt: number
}

/**
 * 剧集（对应一个章节或上传的长文）
 */
export interface VideoEpisode {
  id: string
  projectId: string
  sourceType: EpisodeSourceType // 内容来源类型
  outlineId?: string // 关联的长文大纲节点（outline 模式时有值）
  uploadedContent?: string // 上传的长文内容（uploaded 模式时有值）
  uploadedCharacters?: UploadedCharacter[] // 识别的角色（uploaded 模式时有值）
  uploadedLocations?: UploadedLocation[] // 识别的地点（uploaded 模式时有值）
  uploadedItems?: UploadedItem[] // 识别的物品（uploaded 模式时有值）
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

/**
 * 数据库中的剧集项目记录
 */
export interface VideoProjectRecord {
  id: string
  name: string
  long_writing_project_id: string | null  // 可能为空
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
  source_type: string // 内容来源类型
  outline_id: string | null // 关联的大纲ID（可空）
  uploaded_content: string | null // 上传的长文内容
  uploaded_characters: string | null // 识别的角色（JSON）
  uploaded_locations: string | null // 识别的地点（JSON）
  uploaded_items: string | null // 识别的物品（JSON）
  episode_number: number
  title: string
  status: EpisodeStatus
  duration: number
  script_id: string | null
  audio_tracks: string // JSON
  deleted_at: number | null
  created_at: number
  updated_at: number
}
