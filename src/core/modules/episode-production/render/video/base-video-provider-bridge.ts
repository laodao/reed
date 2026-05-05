/**
 * BaseVideoProvider → VideoProviderAdapter 桥接（spec §4.4 · P5-T12）
 * @module modules/episode-production/render/video/base-video-provider-bridge
 *
 * 把既有 src/core/video-providers/* 下的 BaseVideoProvider 实现（Bailian / DashScope /
 * Volcengine 等）包装成 VideoProviderAdapter（spec 三模式契约），让 P5-T11
 * VideoSegmentService 能直接驱动它们生成视频片段。
 *
 * 翻译规则：
 *   - textToVideo({ prompt, durationSec }) →
 *       baseProvider.generateVideo({ prompt, duration, width, height })
 *   - imageToVideo({ imagePath, prompt, durationSec }) →
 *       baseProvider.generateVideo({ image: imagePath, prompt, duration, width, height })
 *   - keyframesToVideo：
 *       底层 BaseVideoProvider 不直接支持多关键帧（VideoGenerationRequest 只有 image 单字段）。
 *       策略 A（保守）：用首帧走 imageToVideo，丢失中间帧信息（capabilities.keyframes=false 兜底）
 *       策略 B（DashScope wanx 2.5 keyframes 模式）：扩展 generateVideo 入参或新建 method
 *       本桥接采用策略 A——首帧 fallback；具体多帧 provider 接入后续可重写本桥接的
 *       keyframesToVideo 方法以走原生 keyframes API
 *
 * 异步轮询：
 *   - generateVideo 可能返回 taskId（异步任务）；本桥接内置 polling，每 2 秒查 getTaskStatus
 *   - 超时 minutes=10 抛错
 *   - completed → 取 video.localPath / url
 *   - failed → 抛错
 */

import type {
  VideoProviderAdapter,
  VideoProviderCapabilities,
  TextToVideoInput,
  ImageToVideoInput,
  KeyframesToVideoInput,
  VideoSegmentOutput,
} from './video-provider-adapter'
import type { BaseVideoProvider } from '@core/video-providers'
import type {
  VideoModel,
  VideoTaskStatus,
} from '@shared/types/video-provider.types'

const POLL_INTERVAL_MS = 2_000
const POLL_MAX_DURATION_MS = 10 * 60 * 1000 // 10 分钟

/** 桥接选项 */
export interface BridgeOptions {
  /** Provider model ID（必填，generateVideo 入参） */
  modelId: string
  /** Provider config ID（可选，generateVideo 入参） */
  providerConfigId?: string
  /**
   * Provider 能力声明（覆盖默认推断）。
   * 不传则按 baseProvider.getModels() 自动推断（features.textToVideo / imageToVideo）。
   */
  capabilitiesOverride?: VideoProviderCapabilities
}

/**
 * 把 BaseVideoProvider 包装成 VideoProviderAdapter。
 *
 * @param baseProvider 已构造的 BaseVideoProvider 实例
 * @param opts 桥接选项（必含 modelId）
 */
export async function adaptBaseVideoProvider(
  baseProvider: BaseVideoProvider,
  opts: BridgeOptions,
): Promise<VideoProviderAdapter> {
  const capabilities =
    opts.capabilitiesOverride ??
    (await inferCapabilitiesFromBase(baseProvider, opts.modelId))

  const adapter: VideoProviderAdapter = {
    capabilities,
  }

  if (capabilities.text) {
    adapter.textToVideo = async (input: TextToVideoInput) => {
      return await callAndPoll(baseProvider, {
        providerConfigId: opts.providerConfigId,
        model: opts.modelId,
        prompt: input.prompt,
        negativePrompt: input.negativePrompt,
        duration: input.durationSec,
        width: input.width,
        height: input.height,
      })
    }
  }

  if (capabilities.image) {
    adapter.imageToVideo = async (input: ImageToVideoInput) => {
      return await callAndPoll(baseProvider, {
        providerConfigId: opts.providerConfigId,
        model: opts.modelId,
        image: input.imagePath,
        prompt: input.prompt,
        negativePrompt: input.negativePrompt,
        duration: input.durationSec,
        width: input.width,
        height: input.height,
      })
    }
  }

  if (capabilities.keyframes) {
    // 策略 A：首帧 fallback（多关键帧原生 API 后续 provider-specific 重写）
    adapter.keyframesToVideo = async (input: KeyframesToVideoInput) => {
      const firstFrame = input.keyframes[0]
      if (!firstFrame) {
        throw new Error('keyframesToVideo 需要至少一帧关键帧')
      }
      return await callAndPoll(baseProvider, {
        providerConfigId: opts.providerConfigId,
        model: opts.modelId,
        image: firstFrame.imagePath,
        prompt: input.prompt,
        negativePrompt: input.negativePrompt,
        duration: input.durationSec,
        width: input.width,
        height: input.height,
      })
    }
  }

  return adapter
}

// ─── 内部 helpers ────────────────────────────────────

/**
 * 从 BaseVideoProvider 的 model features 推断 capabilities。
 * - features.textToVideo / imageToVideo 直读
 * - keyframes：BaseVideoProvider 不暴露此字段；保守置 false（依赖具体 provider override）
 * - maxDurationSec：取 features.maxDuration
 */
async function inferCapabilitiesFromBase(
  baseProvider: BaseVideoProvider,
  modelId: string,
): Promise<VideoProviderCapabilities> {
  let model: VideoModel | undefined
  try {
    const models = await baseProvider.getModels()
    model = models.find((m) => m.id === modelId)
  } catch {
    // 静默：失败时给默认 capabilities
  }
  const f = model?.features
  return {
    text: !!f?.textToVideo,
    image: !!f?.imageToVideo,
    keyframes: false,
    maxKeyframes: 0,
    maxDurationSec: f?.maxDuration ?? 5,
  }
}

/**
 * 调 generateVideo + 同步等待结果（处理同步 + 异步 taskId 两路）。
 */
async function callAndPoll(
  baseProvider: BaseVideoProvider,
  request: any, // VideoGenerationRequest（避免再次导入循环）
): Promise<VideoSegmentOutput> {
  const resp = await baseProvider.generateVideo(request)

  if (!resp.success) {
    throw new Error(resp.error || '视频生成失败')
  }

  // 同步路径：直接拿到 video
  if (resp.video) {
    return mapGeneratedVideo(resp.video, request)
  }

  // 异步路径：taskId → polling
  if (resp.taskId) {
    const final = await pollUntilDone(baseProvider, resp.taskId)
    if (!final.video) {
      throw new Error('任务完成但 provider 未返回视频信息')
    }
    return mapGeneratedVideo(final.video, request)
  }

  throw new Error('Provider 返回了 success 但既无 taskId 也无 video')
}

async function pollUntilDone(
  baseProvider: BaseVideoProvider,
  taskId: string,
): Promise<VideoTaskStatus> {
  const start = Date.now()
  while (Date.now() - start < POLL_MAX_DURATION_MS) {
    const status = await baseProvider.getTaskStatus(taskId)
    if (status.status === 'completed') return status
    if (status.status === 'failed') {
      throw new Error(`视频生成失败：${status.error ?? '未知错误'}`)
    }
    // pending / processing → 继续等
    await sleep(POLL_INTERVAL_MS)
  }
  throw new Error(`视频生成超时（${POLL_MAX_DURATION_MS / 1000} 秒）`)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function mapGeneratedVideo(
  video: { url?: string; localPath?: string; duration?: number; width?: number; height?: number; thumbnailUrl?: string },
  request: any,
): VideoSegmentOutput {
  const path = video.localPath || video.url
  if (!path) {
    throw new Error('Provider 返回的视频信息缺少 localPath / url')
  }
  return {
    videoPath: path,
    durationSec: video.duration ?? request.duration ?? 0,
    width: video.width ?? request.width ?? 1920,
    height: video.height ?? request.height ?? 1080,
    thumbnailPath: video.thumbnailUrl ?? null,
    meta: {
      provider: request.providerConfigId,
      model: request.model,
    },
  }
}
