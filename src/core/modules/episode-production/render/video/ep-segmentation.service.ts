/**
 * 剧集自动分段 service（tasks/2026-09-04-ep-video-segment-redesign §3）
 * @module modules/episode-production/render/video/ep-segmentation.service
 *
 * 输入 episodeId → 幂等重算该集的视频片段（ep_video_segments）：
 *   1. 剧集 → 剧本 → 场景（scene_number 升序）→ 分镜（shot_number 升序）
 *   2. 场景边界必切；场景内按镜头 duration 累加、超预算（默认 15s，项目级可配）切分；
 *      单镜超预算独成段（规则实现见 segment-planner.ts 纯函数）
 *   3. 幂等：先删该 episode 未完成的 segment（pending/generating/error）并清除其
 *      分镜回填关系；已 completed 的 segment 及其分镜不动，剩余分镜重新分段，
 *      seq 从现有 max(seq) 续排
 *   4. 输出分段预览（segment 列表含 shot 数/预估时长/状态）
 *
 * 预算来源优先级：调用方 opts.budgetSec → 项目 config.segmentDurationBudgetSec → 15s。
 */

import type { DataSource } from 'typeorm'
import { EpisodeScriptRepository } from '@core/database/repositories/episode-script.repository'
import { SceneScriptRepository } from '@core/database/repositories/scene-script.repository'
import { StoryboardRepository } from '@core/database/repositories/storyboard.repository'
import { VideoEpisodeRepository } from '@core/database/repositories/video-episode.repository'
import { VideoProjectRepository } from '@core/database/repositories/video-project.repository'
import {
  EpVideoSegmentRepository,
  type EpVideoSegment,
} from '@core/database/repositories/video-segment.repository'
import {
  splitShotsIntoSegments,
  clampBudgetSec,
  DEFAULT_SEGMENT_BUDGET_SEC,
} from './segment-planner'

/** 分段预览条目（供 UI"N 个场景 → M 个片段 / 共 K 镜"展示） */
export interface SegmentPreviewItem {
  segmentId: string
  seq: number
  sceneId: string
  sceneNumber: number
  sceneLocation: string
  status: EpVideoSegment['status']
  shotCount: number
  estDuration: number
  videoPath: string | null
  /** 片段内分镜 ID（按 segment_seq 升序） */
  storyboardIds: string[]
}

export interface SegmentPreview {
  episodeId: string
  budgetSec: number
  sceneCount: number
  totalShotCount: number
  segments: SegmentPreviewItem[]
}

export class EpSegmentationService {
  private readonly scriptRepo: EpisodeScriptRepository
  private readonly sceneRepo: SceneScriptRepository
  private readonly storyboardRepo: StoryboardRepository
  private readonly episodeRepo: VideoEpisodeRepository
  private readonly projectRepo: VideoProjectRepository
  private readonly segmentRepo: EpVideoSegmentRepository

  constructor(ds: DataSource) {
    this.scriptRepo = new EpisodeScriptRepository(ds)
    this.sceneRepo = new SceneScriptRepository(ds)
    this.storyboardRepo = new StoryboardRepository(ds)
    this.episodeRepo = new VideoEpisodeRepository(ds)
    this.projectRepo = new VideoProjectRepository(ds)
    this.segmentRepo = new EpVideoSegmentRepository(ds)
  }

  /** 读取当前分段（不重算），供 UI 展示 */
  async preview(episodeId: string): Promise<SegmentPreview> {
    const { scenes, budgetSec } = await this.loadContext(episodeId)
    const segments = await this.segmentRepo.listByEpisode(episodeId)
    const sceneMap = new Map(scenes.map(s => [s.id, s]))
    const items: SegmentPreviewItem[] = []
    for (const seg of segments) {
      const shots = await this.storyboardRepo.getBySegmentId(seg.id)
      const scene = sceneMap.get(seg.sceneId)
      items.push({
        segmentId: seg.id,
        seq: seg.seq,
        sceneId: seg.sceneId,
        sceneNumber: scene?.sceneNumber ?? 0,
        sceneLocation: scene?.location ?? '',
        status: seg.status,
        shotCount: seg.shotCount,
        estDuration: seg.estDuration ?? 0,
        videoPath: seg.videoPath,
        storyboardIds: shots.map(s => s.id),
      })
    }
    return {
      episodeId,
      budgetSec,
      sceneCount: scenes.length,
      totalShotCount: items.reduce((n, i) => n + i.shotCount, 0),
      segments: items,
    }
  }

  /**
   * 幂等重算分段。返回重算后的预览（含保留的 completed 段）。
   */
  async recompute(
    episodeId: string,
    opts?: { budgetSec?: number },
  ): Promise<SegmentPreview> {
    const { scenes, budgetSec: ctxBudget } = await this.loadContext(episodeId)
    const budgetSec = clampBudgetSec(opts?.budgetSec ?? ctxBudget)

    // 1. 清掉未完成的 segment + 其分镜回填；completed 的不动
    const existing = await this.segmentRepo.listByEpisode(episodeId)
    const kept = existing.filter(s => s.status === 'completed')
    const keptIds = new Set(kept.map(s => s.id))
    for (const seg of existing) {
      if (seg.status === 'completed') continue
      await this.storyboardRepo.clearSegment(seg.id)
      await this.segmentRepo.delete(seg.id)
    }

    // 2. 逐场景拆分未归入 completed 段的分镜
    let nextSeq = existing.reduce((max, s) => Math.max(max, s.seq), 0) + 1
    for (const scene of scenes) {
      const shots = await this.storyboardRepo.getBySceneScriptId(scene.id)
      const pending = shots.filter(
        s => !s.segmentId || !keptIds.has(s.segmentId),
      )
      if (pending.length === 0) continue

      const groups = splitShotsIntoSegments(
        pending.map(s => ({ id: s.id, duration: s.duration })),
        budgetSec,
      )
      for (const group of groups) {
        const estDuration = group.reduce((sum, g) => sum + g.duration, 0)
        const seg = await this.segmentRepo.create({
          episodeId,
          sceneId: scene.id,
          seq: nextSeq++,
          shotCount: group.length,
          estDuration,
        })
        for (let i = 0; i < group.length; i++) {
          await this.storyboardRepo.assignSegment(group[i].id, seg.id, i + 1)
        }
      }
    }

    return this.preview(episodeId)
  }

  // ─── 内部 ──────────────────────────────────────────────

  /** 加载 剧集→剧本→场景 链路 + 解析时长预算 */
  private async loadContext(episodeId: string): Promise<{
    scenes: Awaited<ReturnType<SceneScriptRepository['getByEpisodeScriptId']>>
    budgetSec: number
  }> {
    const script = await this.scriptRepo.getByEpisodeId(episodeId)
    if (!script) {
      throw new Error(`剧集 ${episodeId} 还没有剧本，无法分段`)
    }
    const scenes = await this.sceneRepo.getByEpisodeScriptId(script.id)

    let budgetSec = DEFAULT_SEGMENT_BUDGET_SEC
    const episode = await this.episodeRepo.getById(episodeId)
    if (episode?.projectId) {
      const project = await this.projectRepo.getById(episode.projectId)
      const configured = (project?.config as { segmentDurationBudgetSec?: number } | undefined)
        ?.segmentDurationBudgetSec
      budgetSec = clampBudgetSec(configured)
    }
    return { scenes, budgetSec }
  }
}
