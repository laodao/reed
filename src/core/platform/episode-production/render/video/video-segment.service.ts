/**
 * 分镜视频片段生成 service（spec §4.4 · P5-T11）
 * @module platform/episode-production/render/video/video-segment.service
 *
 * 串联 keyframes + capability-matcher + VideoProviderAdapter，按选中的
 * mode 调对应方法生成视频片段，落 storyboard.video_path。
 *
 * 流程：
 *   1. 加载 storyboard + 首尾关键帧（frame_role=start + end 各一张，O1；end 缺则仅首帧）
 *      + image_assets 取每帧 imagePath
 *   2. matcher 按 keyframeCount + adapter.capabilities 选 mode
 *   3. 按 mode 调 adapter.textToVideo / imageToVideo / keyframesToVideo
 *   4. 写 storyboard.videoPath / video_mode / video_provider_id / video_model_id
 *   5. 返回结果（含降级 trace + 实际帧数）
 *
 * Provider adapter 通过依赖注入；具体 provider（DashScope wanx 视频 / 百炼视频 / ...）
 * 由 P5-T12 follow-up 接入实现 VideoProviderAdapter。本 service 不绑定任何具体 provider。
 */

import type { DataSource, Repository } from 'typeorm'
import { advanceEpisodeStatusForStoryboard } from '../../workflow/episode-status-advance'
import { StoryboardEntity } from '@core/database/entities/episode-production/storyboard.entity'
import {
  StoryboardKeyframeRepository,
  type StoryboardKeyframe,
} from '@core/database/repositories/storyboard-keyframe.repository'
import { ImageAssetRepository } from '@core/database/repositories/image-asset.repository'
import {
  pickVideoMode,
  clampKeyframesToCapability,
  pickStartEndKeyframes,
  type VideoModeMatch,
} from './provider-capability-matcher'
import { buildSegmentPrompt } from './segment-planner'
import { loadShotDialogues } from './shot-dialogue-loader'
import { resolveVideoParamsForStoryboard } from './project-video-params'
import { assertKeyframeGate, evaluateKeyframeGate } from './keyframe-gate'
import type {
  VideoProviderAdapter,
  VideoMode,
  VideoSegmentOutput,
  KeyframeInput,
} from './video-provider-adapter'

const DEFAULT_DURATION_SEC = 4
const DEFAULT_WIDTH = 1920
const DEFAULT_HEIGHT = 1080

export interface GenerateVideoSegmentInput {
  storyboardId: string
  /** 时长秒数；不传用 storyboard.duration（默认 4 秒） */
  durationSec?: number
  width?: number
  height?: number
  /** 强制使用某个 mode（用户在 UI 选择时传）；不传则按 capability-matcher 自动选 */
  forceMode?: VideoMode
  /** 实际调用的 providerConfigId / modelId（提交时记录到 storyboard，H5 崩溃恢复用） */
  providerId?: string
  modelId?: string
  /** E3：人工强制跳过关键帧闸门（闸门拦截时 UI 让用户确认后重试传 true） */
  force?: boolean
}

export interface VideoSegmentResult {
  storyboardId: string
  match: VideoModeMatch
  output: VideoSegmentOutput
  /** 实际喂给 provider 的关键帧（截断后） */
  keyframesUsed: KeyframeInput[]
}

/**
 * 视频片段生成 service。adapter 由调用方注入（双端共用 + 测试 mock 友好）。
 */
export class VideoSegmentService {
  private readonly keyframeRepo: StoryboardKeyframeRepository
  private readonly imageAssetRepo: ImageAssetRepository

  constructor(
    private readonly ds: DataSource,
    private readonly adapter: VideoProviderAdapter,
  ) {
    this.keyframeRepo = new StoryboardKeyframeRepository(ds)
    this.imageAssetRepo = new ImageAssetRepository(ds)
  }

  private get sbRepo(): Repository<StoryboardEntity> {
    return this.ds.getRepository(StoryboardEntity)
  }

  /** 生成单个分镜的视频片段并落 storyboard.video_path */
  async generateForStoryboard(
    input: GenerateVideoSegmentInput,
  ): Promise<VideoSegmentResult> {
    const sb = await this.sbRepo.findOne({ where: { id: input.storyboardId } })
    if (!sb) throw new Error(`Storyboard not found: ${input.storyboardId}`)

    const durationSec = Math.max(
      1,
      input.durationSec ?? sb.duration ?? DEFAULT_DURATION_SEC,
    )
    const width = input.width ?? DEFAULT_WIDTH
    const height = input.height ?? DEFAULT_HEIGHT

    // 加载首尾关键帧（O1：start + end 各一张，end 缺 → 仅首帧退 image2video）+ 取每帧 image asset 路径
    const keyframes = await this.keyframeRepo.listByStoryboard(sb.id)
    const candidateKfs: KeyframeInput[] = []
    const gatedKfs: StoryboardKeyframe[] = []
    for (const kf of pickStartEndKeyframes(keyframes)) {
      const imagePath = await this.resolveKeyframeImagePath(kf)
      if (imagePath) {
        candidateKfs.push({ imagePath, timePercent: kf.timePercent })
        gatedKfs.push(kf)
      }
    }

    /*
     * E3 关键帧闸门（2026-09-21 雪麓山庄 v2 复盘）：参考图模式生成前强制校验
     * 实际消费的首尾帧（machineCheck.pass + review.status ∈ pass/skipped）。
     * 不满足 → KeyframeGateBlockedError（IPC 透出 code+frames 给 UI）；
     * force=true 人工强制跳过；text2video 模式无关键帧输入，不走闸门。
     */
    if (input.forceMode !== 'text2video' && !input.force && gatedKfs.length > 0) {
      assertKeyframeGate(
        await evaluateKeyframeGate(this.ds, gatedKfs),
        `分镜 #${sb.shotNumber}`,
      )
    }

    // 选 mode
    const keyframeCount = candidateKfs.length
    const match = input.forceMode
      ? this.matchForced(input.forceMode, keyframeCount)
      : pickVideoMode(keyframeCount, this.adapter.capabilities)

    if (!match.mode) {
      throw new Error(
        `当前 video provider 无法生成视频：keyframeCount=${keyframeCount}，` +
          `capabilities=${JSON.stringify(this.adapter.capabilities)}`,
      )
    }

    // 按 mode 截断 keyframes（仅 keyframes2video 用得到）+ 调 adapter
    const keyframesUsed =
      match.mode === 'keyframes2video'
        ? clampKeyframesToCapability(candidateKfs, this.adapter.capabilities)
        : candidateKfs

    // D6：项目 config.videoQuality/videoSteps/stylePrompt 透传（未配置 → provider 默认 high/20）
    const videoParams = await resolveVideoParamsForStoryboard(this.ds, sb.id)
    // 与片段级共用同一拼接器：景别/角度/运镜 + 风格词进 prompt，@[资产] 标记换成纯文本；
    // 台词（2026-10-05）：links/JSON 列加载，结构化台词段提交给音视频模型
    const dialogueMap = await loadShotDialogues(this.ds, [sb as any])
    const promptForVideo = buildSegmentPrompt(
      [
        {
          frameDescription: sb.frameDescription || sb.subject || '',
          duration: durationSec,
          shotType: sb.shotType,
          cameraAngle: sb.cameraAngle,
          cameraMovement: sb.cameraMovement,
          dialogues: dialogueMap.get(sb.id),
        },
      ],
      { width, height, stylePrompt: videoParams.stylePrompt },
    )
    // H5 崩溃恢复：提交前先把 provider/model 落库（后续 onTaskId 再补 provider_task_id），
    // 进程重启后启动恢复凭 video_provider_id 解析网关地址回查任务终态
    if (input.providerId || input.modelId) {
      await this.sbRepo.update(sb.id, {
        videoProviderId: input.providerId ?? sb.videoProviderId,
        videoModelId: input.modelId ?? sb.videoModelId,
        updatedAt: new Date(),
      })
    }
    let output: VideoSegmentOutput
    try {
      output = await this.invokeAdapter({
        storyboardId: sb.id,
        mode: match.mode,
        durationSec,
        width,
        height,
        keyframes: keyframesUsed,
        prompt: promptForVideo,
        quality: videoParams.quality,
        steps: videoParams.steps,
      })
    } catch (e) {
      // 失败写回 error 状态，UI 不再停留在"待生成/生成中"
      await this.sbRepo.update(sb.id, { status: 'error', updatedAt: new Date() })
      throw e
    }

    // 写回 storyboard.video_path + video_mode + duration + status（让 P6 合成域知道用什么模式产出的；
    // duration 同步成视频实际时长——避免 timeline 用过时的"理论"shot 时长导致 ffmpeg
    // xfade 链 offset 错位、合成出来视频"画面只剩 5 秒、剩余黑屏"的 bug；
    // status='completed' 让列表状态从"待生成"变成"已完成"——见 shot-labels.statusLabels）
    await this.sbRepo.update(sb.id, {
      videoPath: output.videoPath,
      videoMode: match.mode,
      duration: output.durationSec,
      status: 'completed',
      // 不在这里写 video_provider_id / model_id —— adapter 不暴露这些；UI 已知
      updatedAt: new Date(),
    })

    // 状态闭环（2026-09-16 P0-CM2）：出片 → episode.producing（只前进不回退）
    await advanceEpisodeStatusForStoryboard(this.ds, sb.id, 'producing').catch(() => {})

    return {
      storyboardId: sb.id,
      match,
      output,
      keyframesUsed,
    }
  }

  // ─── 内部 ──────────────────────────────────────────────

  private matchForced(mode: VideoMode, keyframeCount: number): VideoModeMatch {
    return {
      mode,
      degraded: false,
      trace: [mode],
      effectiveKeyframeCount: mode === 'keyframes2video' ? keyframeCount : undefined,
    }
  }

  /** keyframe 的 image_asset_id → image_assets.imagePath */
  private async resolveKeyframeImagePath(
    kf: StoryboardKeyframe,
  ): Promise<string | null> {
    if (!kf.imageAssetId) return null
    const ia = await this.imageAssetRepo.getById(kf.imageAssetId)
    return ia?.imagePath ?? null
  }

  /** dispatch by mode */
  private async invokeAdapter(opts: {
    storyboardId: string
    mode: VideoMode
    durationSec: number
    width: number
    height: number
    keyframes: KeyframeInput[]
    prompt: string
    quality?: 'high' | 'low'
    steps?: number
  }): Promise<VideoSegmentOutput> {
    const { mode, durationSec, width, height, keyframes, prompt, quality, steps } = opts
    // 全局 logger 结构化日志（spec 2026-05-10 e2e 补充）
    const { createLogger } = await import('@core/utils/logger')
    const aiLogger = createLogger('ai-call')
    const t0 = Date.now()
    const logCommon = {
      callType: 'video' as const,
      mode,
      userPrompt: prompt,
      referenceImages: keyframes.map(k => k.imagePath),
      size: `${width}x${height}`,
      durationSec,
      quality,
      steps,
    }
    // H5 崩溃恢复：异步任务拿到 taskId 立即落库 provider_task_id
    const onTaskId = async (taskId: string) => {
      await this.sbRepo.update(opts.storyboardId, {
        providerTaskId: taskId,
        updatedAt: new Date(),
      })
    }
    let result: VideoSegmentOutput
    try {
      if (mode === 'text2video') {
        if (!this.adapter.textToVideo) {
          throw new Error('Provider 声明支持 text2video 但未实现 textToVideo 方法')
        }
        result = await this.adapter.textToVideo({ prompt, durationSec, width, height, quality, steps, onTaskId })
      } else if (mode === 'image2video') {
        if (!this.adapter.imageToVideo) {
          throw new Error('Provider 声明支持 image2video 但未实现 imageToVideo 方法')
        }
        const firstFrame = keyframes[0]
        if (!firstFrame) throw new Error('image2video 需要至少一帧关键帧')
        result = await this.adapter.imageToVideo({
          imagePath: firstFrame.imagePath,
          prompt,
          durationSec,
          width,
          height,
          quality,
          steps,
          onTaskId,
        })
      } else {
        // keyframes2video
        if (!this.adapter.keyframesToVideo) {
          throw new Error('Provider 声明支持 keyframes2video 但未实现 keyframesToVideo 方法')
        }
        if (keyframes.length < 2) {
          throw new Error('keyframes2video 需要至少 2 帧关键帧')
        }
        result = await this.adapter.keyframesToVideo({
          keyframes,
          prompt,
          durationSec,
          width,
          height,
          quality,
          steps,
          onTaskId,
        })
      }
    } catch (e: any) {
      aiLogger.error('video 调用失败', {
        ...logCommon,
        durationMs: Date.now() - t0,
        error: e?.message ?? String(e),
      })
      throw e
    }
    aiLogger.info('video 调用完成', {
      ...logCommon,
      response: result.videoPath,
      durationMs: Date.now() - t0,
    })
    return result
  }
}
