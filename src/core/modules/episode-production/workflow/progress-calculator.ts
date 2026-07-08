/**
 * 剧集进度计算器（spec §2.2 · P6-T11）
 * @module modules/episode-production/workflow/progress-calculator
 *
 * 给一个剧集，计算 6 个阶段的完成度（0~1）+ 视觉标记（✓/●/○），
 * 供 UI 顶部进度条 + 工作台总览展示。
 *
 * 阶段进度规则：
 *   - 阶段已完成（StageGateService.checkStageComplete=true）→ 1.0
 *   - 阶段未完成但有部分进展 → totalGaps 反算（gaps 越少进度越高，简化为线性）
 *   - 完全未触达 → 0
 *
 * 整剧总进度 = 6 个阶段平均（不含 'completed' 终态，避免重复计数）。
 */

import { IsNull, type DataSource } from 'typeorm'
import type {
  EpisodeStatus,
  StageProgress,
  EpisodeProgress,
} from '@shared/types/episode-production'
import type { EpisodeWithProgress } from '@shared/types/episode-production/episode-with-progress.types'
import { STAGE_LABEL_FOR_STATUS } from '@shared/types/episode-production/episode-with-progress.types'
import { StageGateService } from './stage-gate.service'
import { VideoEpisodeEntity } from '@core/database/entities/episode-production/video-episode.entity'
import { VideoProjectEntity } from '@core/database/entities/episode-production/video-project.entity'
import {
  ALL_EPISODE_STATUSES,
  STAGE_LABELS,
  visualMarkOfStage,
} from './episode-status.machine'

// P6-T13：StageProgress / EpisodeProgress 接口已迁移到 shared/types，前端组件可直接 import
export type { StageProgress, EpisodeProgress }

/** 剧集进度计算器 */
export class ProgressCalculator {
  private readonly gate: StageGateService

  constructor(private readonly ds: DataSource) {
    this.gate = new StageGateService(ds)
  }

  /** 一站式：拿剧集 6 阶段 + 整剧进度 */
  async calculateEpisodeProgress(
    episodeId: string,
  ): Promise<EpisodeProgress> {
    const ep = await this.ds
      .getRepository(VideoEpisodeEntity)
      .findOne({ where: { id: episodeId } })
    if (!ep) throw new Error(`Episode not found: ${episodeId}`)

    const currentStatus = ((ep as any).status === 'draft' ? 'pending' : (ep as any).status) as EpisodeStatus
    const stages: StageProgress[] = []
    // 只算 6 个生产阶段（不含 'completed' 终态）
    const productionStages = ALL_EPISODE_STATUSES.filter(
      (s) => s !== 'completed',
    )
    let totalProgress = 0
    for (const stage of productionStages) {
      const completion = await this.gate.checkStageComplete(episodeId, stage)
      const progress = completion.complete ? 1 : 0 // 简化：二值；后续按 gap 数加权
      stages.push({
        stage,
        label: STAGE_LABELS[stage],
        complete: completion.complete,
        progress,
        mark: visualMarkOfStage(stage, currentStatus),
        gapCount: completion.gaps.length,
      })
      totalProgress += progress
    }
    return {
      episodeId,
      currentStatus,
      stages,
      overallProgress: totalProgress / productionStages.length,
    }
  }

  /**
   * 一次性返回项目下所有集的简化进度（聚合 IPC 用）。
   *
   * 注：内部仍循环调用 calculateEpisodeProgress，只消除前端多次往返；
   * 后端 N+1 留作后续 SQL 聚合优化。
   */
  async listEpisodesWithProgress(
    projectId: string,
  ): Promise<EpisodeWithProgress[]> {
    // 项目存在性检查：让调用方可区分"项目不存在"与"项目下无集"
    const project = await this.ds
      .getRepository(VideoProjectEntity)
      .findOne({ where: { id: projectId } })
    if (!project) throw new Error(`Project not found: ${projectId}`)

    const eps = await this.ds
      .getRepository(VideoEpisodeEntity)
      .find({
        where: { projectId, deletedAt: IsNull() } as any, // 过滤已逻辑删除的剧集（与 VideoEpisodeRepository.getByProjectId 一致）
        order: { episodeNumber: 'ASC' } as any, // 同上
      })

    const result: EpisodeWithProgress[] = []
    for (const ep of eps) {
      const progress = await this.calculateEpisodeProgress(ep.id)
      const status = (ep.status === 'draft' ? 'pending' : ep.status) as EpisodeStatus
      result.push({
        id: ep.id,
        projectId: ep.projectId,
        episodeNumber: ep.episodeNumber,
        title: ep.title,
        status,
        progressPct: Math.round(progress.overallProgress * 100),
        currentStageLabel: STAGE_LABEL_FOR_STATUS[status],
      })
    }
    return result
  }
}
