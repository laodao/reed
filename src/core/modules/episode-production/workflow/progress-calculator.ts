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

import type { DataSource } from 'typeorm'
import type { EpisodeStatus } from '@shared/types/episode-production'
import { StageGateService } from './stage-gate.service'
import { VideoEpisodeEntity } from '@core/database/entities/episode-production/video-episode.entity'
import {
  ALL_EPISODE_STATUSES,
  STAGE_LABELS,
  visualMarkOfStage,
} from './episode-status.machine'

/** 单阶段进度 */
export interface StageProgress {
  stage: EpisodeStatus
  label: string
  complete: boolean
  /** 0~1，1 表示完成 */
  progress: number
  mark: '✓' | '●' | '○'
  /** 缺失项（incomplete 时） */
  gapCount: number
}

/** 整剧进度 */
export interface EpisodeProgress {
  episodeId: string
  currentStatus: EpisodeStatus
  /** 6 个阶段（不含 completed） */
  stages: StageProgress[]
  /** 整剧进度 0~1，6 个阶段平均 */
  overallProgress: number
}

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

    const currentStatus = (ep as any).status as EpisodeStatus
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
}
