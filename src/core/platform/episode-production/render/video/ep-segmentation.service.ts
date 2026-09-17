/**
 * 剧集自动分段 service（tasks/2026-09-04-ep-video-segment-redesign §3）
 * @module platform/episode-production/render/video/ep-segmentation.service
 *
 * 输入 episodeId → 幂等重算该集的视频片段（ep_video_segments）：
 *   1. 剧集 → 剧本 → 场景（scene_number 升序）→ 分镜（shot_number 升序）
 *   2. 场景边界必切；场景内按镜头 duration 累加、超预算（默认 15s，项目级可配）切分；
 *      单镜超预算独成段（规则实现见 segment-planner.ts 纯函数）
 *   3. 幂等：先删该 episode 未完成的 segment（pending/generating/error）并清除其
 *      分镜回填关系；已 completed 的 segment 做有效性校验——其关联分镜
 *      （storyboards.segment_id 回填）若已全部不存在（cogen/重拆替换），
 *      标记 status='superseded'（保留行与 video_path 可追溯，不参与合成/导出）；
 *      其余 completed 段及其分镜不动，剩余分镜重新分段，seq 从现有 max(seq) 续排
 *   4. 输出分段预览（segment 列表含 shot 数/预估时长/状态）
 *   5. S-03 手动分段：mergeSegments（同场景相邻段合并，合计 ≤15s）/
 *      splitSegment（断点镜后另起一段），均重排 seq 并按 buildSegmentPrompt 重算 prompt；
 *      S-07 片段排序：moveSegment（同场景相邻交换 seq，跨场景不允许）
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
  buildSegmentPrompt,
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
  /** 实际视频时长（生成完成后写回；未生成为 null） */
  duration: number | null
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

  /** 读取当前分段（不重算），供 UI 展示；默认排除 superseded（合成/导出语义） */
  async preview(
    episodeId: string,
    opts?: { includeSuperseded?: boolean },
  ): Promise<SegmentPreview> {
    const { scenes, budgetSec } = await this.loadContext(episodeId)
    const all = await this.segmentRepo.listByEpisode(episodeId)
    const segments = opts?.includeSuperseded
      ? all
      : all.filter(s => s.status !== 'superseded')
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
        duration: seg.duration ?? null,
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

    // 1. 清掉未完成的 segment + 其分镜回填；completed 的先做有效性校验
    const existing = await this.segmentRepo.listByEpisode(episodeId)
    const kept: EpVideoSegment[] = []
    for (const seg of existing) {
      if (seg.status !== 'completed') {
        await this.storyboardRepo.clearSegment(seg.id)
        await this.segmentRepo.delete(seg.id)
        continue
      }
      // completed 段的关联分镜（storyboards.segment_id 回填）已全部不存在
      // （被 cogen/重拆替换删除）→ superseded，不再保留参与分段/合成/导出
      const shots = await this.storyboardRepo.getBySegmentId(seg.id)
      if (shots.length === 0) {
        await this.segmentRepo.update(seg.id, { status: 'superseded' })
        console.warn(
          `[ep-segmentation] 片段 seq=${seg.seq} (${seg.id}) 关联分镜已全部不存在，标记 superseded`,
        )
        continue
      }
      kept.push(seg)
    }
    const keptIds = new Set(kept.map(s => s.id))

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

  // ─── S-03 手动分段（merge / split，tasks/2026-09-16-ep-studio-polish） ───

  /**
   * 合并两个相邻片段（同场景、seq 相邻、合计预估时长 ≤15s、均非 generating）。
   * 保留 seq 较小的一段作为合并结果：另一方分镜按 segment_seq 续接到其后，
   * prompt 按 buildSegmentPrompt 对合并后全部镜头重算；另一方片段行物理删除，
   * 最后全剧 seq 重排为连续 1..N。
   *
   * 内容已变化 → 合并结果一律重置为 pending 并清掉 videoPath 等产出快照
   * （磁盘视频文件保留，不再参与合成/导出），需重新生成。
   */
  async mergeSegments(segIdA: string, segIdB: string): Promise<SegmentPreview> {
    const [a, b] = await Promise.all([
      this.segmentRepo.getById(segIdA),
      this.segmentRepo.getById(segIdB),
    ])
    if (!a || !b) throw new Error('片段不存在或已被移除')
    if (a.episodeId !== b.episodeId) throw new Error('只能合并同一剧集内的片段')
    if (a.sceneId !== b.sceneId) throw new Error('只能合并同一场景内的片段')
    if (Math.abs(a.seq - b.seq) !== 1) throw new Error('只能合并 seq 相邻的片段')
    if (a.status === 'generating' || b.status === 'generating') {
      throw new Error('片段正在生成中，不能合并')
    }
    const estA = a.estDuration ?? 0
    const estB = b.estDuration ?? 0
    if (estA + estB > DEFAULT_SEGMENT_BUDGET_SEC) {
      throw new Error(
        `合并后预估时长 ${estA + estB}s 超过 ${DEFAULT_SEGMENT_BUDGET_SEC}s 上限，不能合并`,
      )
    }

    const [first, second] = a.seq < b.seq ? [a, b] : [b, a]
    const shotsFirst = await this.storyboardRepo.getBySegmentId(first.id)
    const shotsSecond = await this.storyboardRepo.getBySegmentId(second.id)
    const merged = [...shotsFirst, ...shotsSecond]
    if (merged.length === 0) throw new Error('两个片段内都没有分镜，无法合并')

    for (let i = 0; i < merged.length; i++) {
      await this.storyboardRepo.assignSegment(merged[i].id, first.id, i + 1)
    }
    await this.segmentRepo.update(first.id, {
      shotCount: merged.length,
      estDuration: estA + estB,
      prompt: buildSegmentPrompt(
        merged.map(s => ({ frameDescription: s.frameDescription ?? '', duration: s.duration })),
      ),
      status: 'pending',
      videoPath: null,
      videoMode: null,
      duration: null,
      providerTaskId: null,
      error: null,
    })
    await this.segmentRepo.delete(second.id)
    await this.resequenceSegments(first.episodeId)
    return this.preview(first.episodeId)
  }

  /**
   * 在指定断点镜之后把片段拆成两段（段内须 ≥2 镜，afterShotId 不能是最后一镜）。
   * 头段保留原 segment 行（重算 shotCount/estDuration/prompt），尾段新建一行
   * 临时插在原 seq 之后，最后全剧 seq 重排为连续 1..N。
   * 两段均重置为 pending（原片段产出快照随内容变化作废，磁盘视频文件保留）。
   */
  async splitSegment(segId: string, afterShotId: string): Promise<SegmentPreview> {
    const seg = await this.segmentRepo.getById(segId)
    if (!seg) throw new Error('片段不存在或已被移除')
    if (seg.status === 'generating') throw new Error('片段正在生成中，不能拆分')

    const shots = await this.storyboardRepo.getBySegmentId(segId)
    if (shots.length < 2) throw new Error('片段内不足 2 镜，无法拆分')
    const idx = shots.findIndex(s => s.id === afterShotId)
    if (idx < 0) throw new Error('断点镜不属于该片段')
    if (idx === shots.length - 1) throw new Error('断点不能是最后一镜（之后没有镜头可另起一段）')

    const head = shots.slice(0, idx + 1)
    const tail = shots.slice(idx + 1)
    const headDuration = head.reduce((n, s) => n + (s.duration || 0), 0)
    const tailDuration = tail.reduce((n, s) => n + (s.duration || 0), 0)

    // 目标顺序：新段紧跟原段（先记下来，建段后按此重排 seq）
    const order: string[] = []
    for (const s of await this.segmentRepo.listByEpisode(seg.episodeId)) {
      order.push(s.id)
      if (s.id === seg.id) order.push('__new__')
    }

    const newSeg = await this.segmentRepo.create({
      episodeId: seg.episodeId,
      sceneId: seg.sceneId,
      seq: seg.seq + 1, // 临时值，随后 resequence 统一重排
      shotCount: tail.length,
      estDuration: tailDuration,
      prompt: buildSegmentPrompt(
        tail.map(s => ({ frameDescription: s.frameDescription ?? '', duration: s.duration })),
      ),
    })
    for (let i = 0; i < tail.length; i++) {
      await this.storyboardRepo.assignSegment(tail[i].id, newSeg.id, i + 1)
    }
    await this.segmentRepo.update(seg.id, {
      shotCount: head.length,
      estDuration: headDuration,
      prompt: buildSegmentPrompt(
        head.map(s => ({ frameDescription: s.frameDescription ?? '', duration: s.duration })),
      ),
      status: 'pending',
      videoPath: null,
      videoMode: null,
      duration: null,
      providerTaskId: null,
      error: null,
    })

    await this.applySeqOrder(
      order.map(id => (id === '__new__' ? newSeg.id : id)),
    )
    return this.preview(seg.episodeId)
  }

  /**
   * S-07 片段排序：与相邻片段交换 seq（仅同场景内允许；跨场景/越界报错由 UI 置灰前置，
   * 服务端仍校验兜底）。seq 交换走两步偏移（与 applySeqOrder 同策略，避免临时撞序）。
   */
  async moveSegment(
    segmentId: string,
    direction: 'up' | 'down',
  ): Promise<SegmentPreview> {
    const seg = await this.segmentRepo.getById(segmentId)
    if (!seg) throw new Error('片段不存在或已被移除')
    if (seg.status === 'generating') throw new Error('片段正在生成中，不能移动')

    const all = await this.segmentRepo.listByEpisode(seg.episodeId)
    const idx = all.findIndex(s => s.id === seg.id)
    if (idx < 0) throw new Error('片段不存在或已被移除')
    const neighbor = direction === 'up' ? all[idx - 1] : all[idx + 1]
    if (!neighbor) throw new Error(direction === 'up' ? '已是第一个片段' : '已是最后一个片段')
    if (neighbor.sceneId !== seg.sceneId) throw new Error('不能跨场景移动片段')
    if (neighbor.status === 'generating') throw new Error('相邻片段正在生成中，不能移动')

    const TEMP_OFFSET = 10000
    await this.segmentRepo.update(seg.id, { seq: seg.seq + TEMP_OFFSET })
    await this.segmentRepo.update(neighbor.id, { seq: seg.seq })
    await this.segmentRepo.update(seg.id, { seq: neighbor.seq })

    return this.preview(seg.episodeId)
  }

  /** 全剧片段 seq 重排为连续 1..N（保持当前 seq 升序的相对顺序） */
  private async resequenceSegments(episodeId: string): Promise<void> {
    const all = await this.segmentRepo.listByEpisode(episodeId)
    await this.applySeqOrder(all.map(s => s.id))
  }

  /**
   * 按给定顺序重排 seq 为 1..N。两步走（先整体偏移避开临时 seq 撞序，
   * 再按目标顺序写回），与 storyboard reorderInScene 同策略。
   */
  private async applySeqOrder(orderedIds: string[]): Promise<void> {
    const TEMP_OFFSET = 10000
    for (const id of orderedIds) {
      const seg = await this.segmentRepo.getById(id)
      if (seg) await this.segmentRepo.update(id, { seq: seg.seq + TEMP_OFFSET })
    }
    for (let i = 0; i < orderedIds.length; i++) {
      await this.segmentRepo.update(orderedIds[i], { seq: i + 1 })
    }
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
