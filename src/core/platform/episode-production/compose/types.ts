/**
 * compose/types
 * @module platform/episode-production/compose/types
 * @description 合成域共享类型定义：视频合成配置、转场配置、合成结果等。
 *              从原 video-synthesis.service.ts 迁移，供 compose 子域 service 和外部消费方使用。
 */

/**
 * 视频合成配置
 */
export interface VideoSynthesisConfig {
  width: number
  height: number
  fps: number
  videoBitrate: string
  audioBitrate: string
  preset: string
  crf: number
}

/**
 * 预设视频配置
 */
export const PRESET_VIDEO_CONFIGS: Record<string, VideoSynthesisConfig> = {
  standard: {
    width: 1920,
    height: 1080,
    fps: 30,
    videoBitrate: '5000k',
    audioBitrate: '128k',
    preset: 'medium',
    crf: 23
  },
  high: {
    width: 1920,
    height: 1080,
    fps: 30,
    videoBitrate: '8000k',
    audioBitrate: '192k',
    preset: 'slow',
    crf: 18
  },
  low: {
    width: 1280,
    height: 720,
    fps: 24,
    videoBitrate: '2500k',
    audioBitrate: '96k',
    preset: 'fast',
    crf: 28
  },
  vertical: {
    width: 1080,
    height: 1920,
    fps: 30,
    videoBitrate: '4000k',
    audioBitrate: '128k',
    preset: 'medium',
    crf: 23
  }
}

/**
 * 转场效果类型
 */
export type TransitionType =
  | 'fade'
  | 'fadein'
  | 'fadeout'
  | 'xfade'
  | 'dissolve'
  | 'wipeleft'
  | 'wiperight'
  | 'wipeup'
  | 'wipedown'
  | 'slideleft'
  | 'slideright'
  | 'circlecrop'
  | 'rectcrop'
  | 'distance'
  | 'none'

/**
 * 转场效果配置
 */
export interface TransitionConfig {
  type: TransitionType
  duration: number // 转场时长（秒）
  offset?: number // 转场开始时间点
}

/**
 * 视频合成结果
 */
export interface SynthesisResult {
  success: boolean
  outputPath?: string
  duration?: number
  error?: string
}
