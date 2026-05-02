/**
 * episode-production · 渲染层（图像/音频产物记录） · 类型定义
 * @module shared/types/episode-production/render.types
 * @description 渲染产物数据库记录类型：图像资产记录、音频资产记录、音轨记录、音轨条目记录及音轨领域对象。
 *
 * 注：原类型定义来自 src/shared/types/story-to-video.types.ts，
 *     P1 拆分后旧文件改为 deprecated re-export。修改请改本文件。
 */

import type { AudioType } from './domain.types'
import type { AudioAsset } from './domain.types'

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
