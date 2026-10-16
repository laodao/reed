/**
 * episode-with-progress.types.ts
 *
 * 聚合 IPC `ep:list-episodes-with-progress` 的响应类型 +
 * EpisodeStatus → 中文标签映射（用于集卡 currentStageLabel）。
 */
import type { EpisodeStatus } from './workflow.types'

export interface EpisodeWithProgress {
  id: string
  projectId: string
  episodeNumber: number
  title: string
  status: EpisodeStatus
  /** 0-100 整数；按 6 个生产阶段平均的简化进度 */
  progressPct: number
  /** 中文当前阶段标签，由 status 映射，便于前端直接渲染 */
  currentStageLabel: string
}

/**
 * EpisodeStatus → 集卡 currentStageLabel 中文标签
 *
 * 注：与 core/platform/episode-production/workflow/episode-status.machine 中的
 *     STAGE_LABELS（侧重 stage 名 "① 内容" 等）独立。这里给"集状态"标签，
 * pending/completed 是终态（不属 6 个生产 stage），单独定义。
 */
export const STAGE_LABEL_FOR_STATUS: Record<EpisodeStatus, string> = {
  pending: '未开始',
  asset_prep: '资产准备',
  scripting: '剧本中',
  storyboarding: '分镜中',
  producing: '制作中',
  composing: '合成中',
  completed: '已完成',
}
