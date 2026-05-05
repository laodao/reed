/**
 * 视频生成 Provider 适配器接口（spec §4.4 · P5-T9）
 * @module modules/episode-production/render/video/video-provider-adapter
 *
 * 不同视频 provider（DashScope wanx 视频 / 百炼视频 / Volcengine / Pika / Runway / ...）
 * 对外暴露的协议各异。本接口定义"分镜片段"层面的最小公共契约：
 *
 *   - textToVideo：纯 prompt → 视频
 *   - imageToVideo：单图 + prompt → 视频
 *   - keyframesToVideo：多关键帧 → 视频（按时间序）
 *   - capabilities：声明本 provider 支持哪些模式 + 上限
 *
 * P5-T10 capability-matcher 用 capabilities 给定 keyframeCount 选模式 + 不支持时降级。
 *
 * 各家 provider 的具体适配器（DashScope / 百炼 / 等）通过 createXxxVideoProvider() 工厂
 * 实现本接口，传入 video-segment.service。
 *
 * 注：与既有 src/shared/types/video-provider.types VideoProvider（provider 元信息查询）
 *      不同——那个是 UI 列出可用 provider 用的，此接口是"调用契约"。
 */

/** Provider 支持矩阵 */
export interface VideoProviderCapabilities {
  /** 是否支持纯文本生成视频 */
  text: boolean
  /** 是否支持单图生成视频 */
  image: boolean
  /** 是否支持多关键帧生成视频 */
  keyframes: boolean
  /** 关键帧模式下支持的最大关键帧数（不支持 keyframes 时忽略） */
  maxKeyframes: number
  /** 单段视频最大时长（秒） */
  maxDurationSec: number
}

/** 一帧输入 */
export interface KeyframeInput {
  /** 关键帧本地路径或 URL */
  imagePath: string
  /** 在视频片段中的时间位置（0~1） */
  timePercent: number
}

/** 视频生成结果 */
export interface VideoSegmentOutput {
  /** 落盘后的视频路径 */
  videoPath: string
  /** 实际产出时长（秒） */
  durationSec: number
  /** 视频宽高（provider 报告或采样得到） */
  width: number
  height: number
  /** 可选：缩略图路径 */
  thumbnailPath?: string | null
  /** Provider 元信息（model id / 任务 ID 等，存 metadata） */
  meta?: Record<string, unknown>
}

/** 三种生成模式入参 */
export interface TextToVideoInput {
  prompt: string
  durationSec: number
  width?: number
  height?: number
  negativePrompt?: string
}

export interface ImageToVideoInput {
  imagePath: string
  prompt?: string
  durationSec: number
  width?: number
  height?: number
  negativePrompt?: string
}

export interface KeyframesToVideoInput {
  keyframes: KeyframeInput[]
  /** 可选 prompt 辅助语义引导（不是所有 provider 都用） */
  prompt?: string
  durationSec: number
  width?: number
  height?: number
  negativePrompt?: string
}

/**
 * 视频 Provider 适配器统一接口。
 * 实现者按 capabilities 决定哪些方法被定义；caller 通过 P5-T10 capability-matcher
 * 选定模式后再调对应方法。未定义的方法 caller 不会调（capability-matcher 已挡住）。
 */
export interface VideoProviderAdapter {
  /** Provider 能力声明（必填） */
  readonly capabilities: VideoProviderCapabilities

  /** 文生视频；capabilities.text=false 时可不实现 */
  textToVideo?(input: TextToVideoInput): Promise<VideoSegmentOutput>

  /** 图生视频；capabilities.image=false 时可不实现 */
  imageToVideo?(input: ImageToVideoInput): Promise<VideoSegmentOutput>

  /** 关键帧生视频；capabilities.keyframes=false 时可不实现 */
  keyframesToVideo?(input: KeyframesToVideoInput): Promise<VideoSegmentOutput>
}

/** 视频生成模式 */
export type VideoMode = 'text2video' | 'image2video' | 'keyframes2video'
