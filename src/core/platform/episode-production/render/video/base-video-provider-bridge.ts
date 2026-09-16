/**
 * BaseVideoProvider → VideoProviderAdapter 桥接（spec §4.4 · P5-T12）
 * @module platform/episode-production/render/video/base-video-provider-bridge
 *
 * 把既有 src/core/platform/providers/video/* 下的 BaseVideoProvider 实现（Bailian / DashScope /
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

import * as fs from 'fs'
import * as path from 'path'
import { getPathProvider } from '@core/interfaces/path.interface'
import type {
  VideoProviderAdapter,
  VideoProviderCapabilities,
  TextToVideoInput,
  ImageToVideoInput,
  KeyframesToVideoInput,
  VideoSegmentOutput,
} from './video-provider-adapter'
import type { BaseVideoProvider } from '@core/platform/providers/video'
import type {
  VideoModel,
  VideoTaskStatus,
} from '@shared/types/video-provider.types'

const POLL_INTERVAL_MS = 2_000
// 局域网 ComfyUI 网关实测 15~25 分钟（评审 #103），原 10 分钟会在远端仍在跑时
// 假失败写回 error（用户重试即双份计费）。图生视频高质量模式实测 30~45 分钟
//（H3 实测），默认提至 75 分钟，可用环境变量覆盖。
const POLL_MAX_DURATION_MS = Number(process.env.EP_VIDEO_POLL_TIMEOUT_MS) || 75 * 60 * 1000

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
        quality: input.quality,
        steps: input.steps,
      }, input.onTaskId)
    }
  }

  if (capabilities.image) {
    adapter.imageToVideo = async (input: ImageToVideoInput) => {
      return await callAndPoll(baseProvider, {
        providerConfigId: opts.providerConfigId,
        model: opts.modelId,
        image: resolveImagePath(input.imagePath),
        prompt: input.prompt,
        negativePrompt: input.negativePrompt,
        duration: input.durationSec,
        width: input.width,
        height: input.height,
        quality: input.quality,
        steps: input.steps,
      }, input.onTaskId)
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
        image: resolveImagePath(firstFrame.imagePath),
        prompt: input.prompt,
        negativePrompt: input.negativePrompt,
        duration: input.durationSec,
        width: input.width,
        height: input.height,
        quality: input.quality,
        steps: input.steps,
      }, input.onTaskId)
    }
  }

  return adapter
}

// ─── 内部 helpers ────────────────────────────────────

/**
 * 解析 image path：把业务层传来的 user-rel 相对路径（来自 image_assets.image_path，
 * e.g. "images/2026/05/05/img_xxx.png"）拼成绝对路径，让底层 BaseVideoProvider
 * 的 isLocalFilePath 能识别成本地文件、走 OSS 上传链路（百炼临时上传 / 用户配置的 OSS）。
 *
 * 透传规则：
 *   - http(s)://、file://、local-image://、data: 等已是 URL/scheme 形式 → 原样
 *   - 以 / 开头 → 已是绝对路径，原样
 *   - Windows 盘符路径（C:\...） → 原样
 *   - 其它（user-rel 相对路径） → 拼 getPathProvider().getDataPath() 前缀成绝对路径
 *     （getDataPath 在 Web 端 = rootDataPath/users/<userId>，Electron 端 = userData）
 */
function resolveImagePath(imagePath: string): string {
  if (!imagePath) return imagePath
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(imagePath)) return imagePath  // http://、file://、local-image://、data:
  if (imagePath.startsWith('/')) return imagePath
  if (/^[A-Za-z]:[\\/]/.test(imagePath)) return imagePath  // Windows
  // user-rel 相对路径：拼当前用户数据根
  const userDataPath = getPathProvider().getDataPath()
  return path.join(userDataPath, imagePath)
}

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
 *
 * @param onTaskId 异步路径拿到 taskId 后、进入轮询前回调（H5：service 层落库
 *                 provider_task_id，进程崩溃后启动恢复可凭 taskId 回网关查终态）。
 *                 回调失败不阻断生成（仅记日志）——taskId 落库是兜底，不是主流程。
 */
async function callAndPoll(
  baseProvider: BaseVideoProvider,
  request: any, // VideoGenerationRequest（避免再次导入循环）
  onTaskId?: (taskId: string) => void | Promise<void>,
): Promise<VideoSegmentOutput> {
  const resp = await baseProvider.generateVideo(request)

  if (!resp.success) {
    throw new Error(resp.error || '视频生成失败')
  }

  // 同步路径：直接拿到 video
  if (resp.video) {
    return await mapGeneratedVideo(resp.video, request)
  }

  // 异步路径：taskId → polling
  if (resp.taskId) {
    if (onTaskId) {
      try {
        await onTaskId(resp.taskId)
      } catch (e) {
        console.warn('[base-video-provider-bridge] onTaskId 回调失败（不阻断生成）:', e)
      }
    }
    const final = await pollUntilDone(baseProvider, resp.taskId)
    if (!final.video) {
      throw new Error('任务完成但 provider 未返回视频信息')
    }
    return await mapGeneratedVideo(final.video, request)
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

/**
 * 把 provider 返回的临时 URL（典型是百炼 OSS 带签名链接 ~1h 过期）下载到本地，
 * 落到 <userDataPath>/episode-production/video-segments/seg_<ts>_<rand>.mp4，
 * 返回 user-rel 相对路径（与 image_assets.image_path 同一约定，兼容 web /assets
 * 路由直接播放 + ffmpeg 通过 resolveImagePath 反向解析为绝对路径）。
 *
 * 导出给 startup-recovery 复用（H5：崩溃恢复时把网关已完成的产物下载落盘）。
 */
export async function downloadVideoToLocal(url: string, defaultExt = '.mp4'): Promise<string> {
  if (!/^https?:\/\//i.test(url)) {
    // 不是 http URL，原样返回（可能是 file:// 或别的本地形式）
    return url
  }
  const userDataPath = getPathProvider().getDataPath()
  const dir = path.join(userDataPath, 'episode-production', 'video-segments')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  // 推断扩展名：从 URL 路径取（忽略 query），找不到用 defaultExt
  const urlPath = url.split('?')[0]
  const extMatch = urlPath?.match(/\.([a-zA-Z0-9]{2,5})$/)
  const ext = extMatch ? `.${extMatch[1]!.toLowerCase()}` : defaultExt
  const fileName = `seg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`
  const absPath = path.join(dir, fileName)

  const resp = await fetch(url)
  if (!resp.ok) {
    throw new Error(`下载视频失败: HTTP ${resp.status} ${resp.statusText}`)
  }
  const buf = Buffer.from(await resp.arrayBuffer())
  if (buf.length === 0) {
    throw new Error('下载视频失败: 数据为空')
  }
  fs.writeFileSync(absPath, buf)

  // 返回 user-rel 相对路径（与 image_assets.image_path 同一约定）
  return path.relative(userDataPath, absPath).replace(/\\/g, '/')
}

async function mapGeneratedVideo(
  video: { url?: string; localPath?: string; duration?: number; width?: number; height?: number; thumbnailUrl?: string },
  request: any,
): Promise<VideoSegmentOutput> {
  // 优先用 provider 已落盘的 localPath；否则下载 url 到本地
  // —— provider 返回的 url 通常是带签名的临时 OSS 链接（百炼默认 1 小时过期），
  // 必须立刻下载落盘成稳定的本地路径，后续 ffmpeg 合成 / 用户回看才不会失效。
  let videoPathOut: string
  if (video.localPath) {
    videoPathOut = video.localPath
  } else if (video.url) {
    videoPathOut = await downloadVideoToLocal(video.url)
  } else {
    throw new Error('Provider 返回的视频信息缺少 localPath / url')
  }

  // 缩略图同理：如果是 http URL 也下到本地
  let thumbnailPathOut: string | null = null
  if (video.thumbnailUrl) {
    if (/^https?:\/\//i.test(video.thumbnailUrl)) {
      try {
        thumbnailPathOut = await downloadVideoToLocal(video.thumbnailUrl, '.jpg')
      } catch {
        // 缩略图下载失败不致命
        thumbnailPathOut = null
      }
    } else {
      thumbnailPathOut = video.thumbnailUrl
    }
  }

  return {
    videoPath: videoPathOut,
    durationSec: video.duration ?? request.duration ?? 0,
    width: video.width ?? request.width ?? 1920,
    height: video.height ?? request.height ?? 1080,
    thumbnailPath: thumbnailPathOut,
    meta: {
      provider: request.providerConfigId,
      model: request.model,
    },
  }
}
