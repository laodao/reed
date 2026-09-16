/**
 * 片段级视频生成 service（tasks/2026-09-04-ep-video-segment-redesign §5）
 * @module platform/episode-production/render/video/segment-video.service
 *
 * 与单镜生成的 VideoSegmentService 并列（单镜生成保留不动）：
 *   1. 按 segment_seq 取片段内分镜，拼接多镜头提示词（segment-planner.buildSegmentPrompt；
 *      @资产引用沿用现有行为——标记文本原样传入，与单镜路径一致）
 *   2. 参考图模式下首帧用首镜头的关键帧（按 frameIndex 升序取有图的帧）
 *   3. 一次视频调用产出整段，写 segment.video_path / video_mode / duration / prompt 快照
 *   4. 状态机 pending → generating → completed/error；
 *      completed 后联动把片段内 shots 的 status 置 completed
 *
 * Provider adapter 依赖注入（双端共用 + mock 单测友好），复用现有 video provider 适配链。
 */

import type { DataSource } from 'typeorm'
import {
  EpVideoSegmentRepository,
  type EpVideoSegment,
} from '@core/database/repositories/video-segment.repository'
import { StoryboardRepository } from '@core/database/repositories/storyboard.repository'
import {
  StoryboardKeyframeRepository,
  type StoryboardKeyframe,
} from '@core/database/repositories/storyboard-keyframe.repository'
import { ImageAssetRepository } from '@core/database/repositories/image-asset.repository'
import {
  pickVideoMode,
  type VideoModeMatch,
} from './provider-capability-matcher'
import type {
  VideoProviderAdapter,
  VideoMode,
  VideoSegmentOutput,
  KeyframeInput,
} from './video-provider-adapter'
import { buildSegmentPrompt } from './segment-planner'
import { advanceEpisodeStatusForStoryboard } from '../../workflow/episode-status-advance'

const DEFAULT_WIDTH = 1920
const DEFAULT_HEIGHT = 1080

export interface GenerateSegmentVideoInput {
  segmentId: string
  /** 覆盖时长；不传用 segment.estDuration */
  durationSec?: number
  width?: number
  height?: number
  /** 强制 mode；不传按首镜关键帧数 + capabilities 自动选 */
  forceMode?: VideoMode
  /** 实际调用的 provider/model（仅记录到 segment 上，adapter 由调用方创建） */
  providerId?: string
  modelId?: string
}

export interface SegmentVideoResult {
  segmentId: string
  match: VideoModeMatch
  output: VideoSegmentOutput
  prompt: string
  /** 实际喂给 provider 的首帧参考图（若有） */
  keyframesUsed: KeyframeInput[]
  /** 联动置 completed 的分镜 ID */
  completedStoryboardIds: string[]
}

export class SegmentVideoService {
  private readonly segmentRepo: EpVideoSegmentRepository
  private readonly storyboardRepo: StoryboardRepository
  private readonly keyframeRepo: StoryboardKeyframeRepository
  private readonly imageAssetRepo: ImageAssetRepository

  constructor(
    private readonly ds: DataSource,
    private readonly adapter: VideoProviderAdapter,
  ) {
    this.segmentRepo = new EpVideoSegmentRepository(ds)
    this.storyboardRepo = new StoryboardRepository(ds)
    this.keyframeRepo = new StoryboardKeyframeRepository(ds)
    this.imageAssetRepo = new ImageAssetRepository(ds)
  }

  /** 生成一个视频片段并写回 segment.video_path（状态机 pending→generating→completed/error） */
  async generateForSegment(
    input: GenerateSegmentVideoInput,
  ): Promise<SegmentVideoResult> {
    const seg = await this.segmentRepo.getById(input.segmentId)
    if (!seg) throw new Error(`视频片段不存在: ${input.segmentId}`)

    const shots = await this.storyboardRepo.getBySegmentId(seg.id)
    if (shots.length === 0) {
      throw new Error(`视频片段 ${input.segmentId} 内没有分镜`)
    }

    const width = input.width ?? DEFAULT_WIDTH
    const height = input.height ?? DEFAULT_HEIGHT
    const durationSec = Math.max(
      1,
      Math.round(input.durationSec ?? seg.estDuration ?? shots.reduce((n, s) => n + (s.duration || 3), 0)),
    )
    const prompt = buildSegmentPrompt(
      shots.map(s => ({ frameDescription: s.frameDescription, duration: s.duration })),
      { width, height },
    )

    // generating + prompt 快照先落库（崩溃可追）
    await this.segmentRepo.update(seg.id, {
      status: 'generating',
      prompt,
      error: null,
      providerId: input.providerId ?? seg.providerId,
      modelId: input.modelId ?? seg.modelId,
    })

    try {
      const result = await this.invokeGeneration(seg, shots, {
        prompt,
        durationSec,
        width,
        height,
        forceMode: input.forceMode,
      })

      await this.segmentRepo.update(seg.id, {
        status: 'completed',
        videoPath: result.output.videoPath,
        videoMode: result.match.mode,
        duration: result.output.durationSec,
        error: null,
      })
      // 联动：片段内 shots status=completed（与单镜生成写回值一致）
      for (const shot of shots) {
        await this.storyboardRepo.setStatus(shot.id, 'completed')
      }

      // 状态闭环（2026-09-16 P0-CM2）：片段出片 → episode.producing
      await advanceEpisodeStatusForStoryboard(this.ds, shots[0].id, 'producing').catch(() => {})

      return {
        segmentId: seg.id,
        match: result.match,
        output: result.output,
        prompt,
        keyframesUsed: result.keyframesUsed,
        completedStoryboardIds: shots.map(s => s.id),
      }
    } catch (e: any) {
      await this.segmentRepo.update(seg.id, {
        status: 'error',
        error: e?.message ?? String(e),
      })
      throw e
    }
  }

  // ─── 内部 ──────────────────────────────────────────────

  private async invokeGeneration(
    seg: EpVideoSegment,
    shots: Array<{ id: string }>,
    opts: {
      prompt: string
      durationSec: number
      width: number
      height: number
      forceMode?: VideoMode
    },
  ): Promise<{ match: VideoModeMatch; output: VideoSegmentOutput; keyframesUsed: KeyframeInput[] }> {
    // 首帧参考图：首镜头的关键帧（按 frameIndex 升序，取有图的帧）
    const firstShotKfs = await this.keyframeRepo.listByStoryboard(shots[0].id)
    const candidateKfs: KeyframeInput[] = []
    for (const kf of firstShotKfs) {
      const imagePath = await this.resolveKeyframeImagePath(kf)
      if (imagePath) candidateKfs.push({ imagePath, timePercent: kf.timePercent })
    }

    const match: VideoModeMatch = opts.forceMode
      ? { mode: opts.forceMode, degraded: false, trace: [opts.forceMode] }
      : pickVideoMode(candidateKfs.length, this.adapter.capabilities)

    if (!match.mode) {
      throw new Error(
        `当前 video provider 无法生成视频：keyframeCount=${candidateKfs.length}，` +
          `capabilities=${JSON.stringify(this.adapter.capabilities)}`,
      )
    }

    // 片段级 V1 只做"首帧参考图"（§5）：image2video 用首帧；keyframes2video 不在片段模式使用
    const keyframesUsed = match.mode === 'image2video' ? candidateKfs.slice(0, 1) : []

    const { createLogger } = await import('@core/utils/logger')
    const aiLogger = createLogger('ai-call')
    const t0 = Date.now()
    const logCommon = {
      callType: 'video' as const,
      mode: match.mode,
      segmentId: seg.id,
      shotCount: seg.shotCount,
      userPrompt: opts.prompt,
      referenceImages: keyframesUsed.map(k => k.imagePath),
      size: `${opts.width}x${opts.height}`,
      durationSec: opts.durationSec,
    }

    let output: VideoSegmentOutput
    try {
      if (match.mode === 'text2video') {
        if (!this.adapter.textToVideo) {
          throw new Error('Provider 声明支持 text2video 但未实现 textToVideo 方法')
        }
        output = await this.adapter.textToVideo({
          prompt: opts.prompt,
          durationSec: opts.durationSec,
          width: opts.width,
          height: opts.height,
        })
      } else if (match.mode === 'image2video') {
        if (!this.adapter.imageToVideo) {
          throw new Error('Provider 声明支持 image2video 但未实现 imageToVideo 方法')
        }
        const firstFrame = keyframesUsed[0]
        if (!firstFrame) throw new Error('image2video 需要首帧参考图（首镜头无可用关键帧）')
        output = await this.adapter.imageToVideo({
          imagePath: firstFrame.imagePath,
          prompt: opts.prompt,
          durationSec: opts.durationSec,
          width: opts.width,
          height: opts.height,
        })
      } else {
        throw new Error('片段级生成 V1 不支持 keyframes2video（逐镜关键帧请用单镜生成）')
      }
    } catch (e: any) {
      aiLogger.error('video 调用失败（片段级）', {
        ...logCommon,
        durationMs: Date.now() - t0,
        error: e?.message ?? String(e),
      })
      throw e
    }
    aiLogger.info('video 调用完成（片段级）', {
      ...logCommon,
      response: output.videoPath,
      durationMs: Date.now() - t0,
    })
    return { match, output, keyframesUsed }
  }

  /** keyframe 的 image_asset_id → image_assets.imagePath */
  private async resolveKeyframeImagePath(
    kf: StoryboardKeyframe,
  ): Promise<string | null> {
    if (!kf.imageAssetId) return null
    const ia = await this.imageAssetRepo.getById(kf.imageAssetId)
    return ia?.imagePath ?? null
  }
}
