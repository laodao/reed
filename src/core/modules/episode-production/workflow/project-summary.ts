/**
 * project-summary · 项目聚合视图（FU5-A1）
 *
 * 给项目列表卡片用：把 VideoProject + N 个 VideoEpisode 聚合成
 * VideoProjectSummary（episodeCount / progressPct / currentStageLabel / sourceType）。
 *
 * 抽成纯函数，便于单测；caller（IPC handler）拿 projects + episodes 后调用。
 */

import type {
  EpisodeStatus,
  VideoEpisode,
  VideoProject,
  VideoProjectSummary,
} from '@shared/types/episode-production'

/**
 * 各 stage 的进度权重（0-100）。
 *
 * 设计原则：到达某 stage 即算"刚开始这一阶段"，所以 producing=70 表示
 * "用户进入了 ⑤ 制作但还没出片"；producing 完成（所有分镜出片）会推到
 * composing=85 / completed=100。
 *
 * spec §2.2 定义的状态机：pending → asset_prep → scripting → storyboarding →
 * producing → composing → completed
 */
const STAGE_PROGRESS_WEIGHT: Record<EpisodeStatus, number> = {
  pending: 5,
  asset_prep: 20,
  scripting: 35,
  storyboarding: 55,
  producing: 70,
  composing: 90,
  completed: 100,
}

const STAGE_LABEL: Record<EpisodeStatus, string> = {
  pending: '内容识别',
  asset_prep: '资产准备',
  scripting: '剧本编辑',
  storyboarding: '分镜配置',
  producing: '画面+音频',
  composing: '合成',
  completed: '已完成',
}

/**
 * 计算单集进度（0-100）。
 */
export function episodeProgressPct(status: EpisodeStatus): number {
  return STAGE_PROGRESS_WEIGHT[status] ?? 0
}

/**
 * 把 project + episodes 聚合成 summary。
 *
 * - episodeCount: episodes.length
 * - progressPct:
 *   - 0 集：0
 *   - 全部 completed：100
 *   - 否则：所有剧集 episodeProgressPct 的平均，向下取整
 * - currentStageLabel:
 *   - 0 集：null
 *   - 全部 completed：'已完成'
 *   - 否则：取进度最低（最早未完成）的剧集 → "第 N 集 · stage 中文"
 * - sourceType:
 *   - 项目有 longWritingProjectId → linked_lw
 *   - 否则 → standalone
 */
export function buildProjectSummary(
  project: VideoProject,
  episodes: VideoEpisode[],
): VideoProjectSummary {
  const episodeCount = episodes.length

  let progressPct: number
  let currentStageLabel: string | null

  if (episodeCount === 0) {
    progressPct = 0
    currentStageLabel = null
  } else {
    const sum = episodes.reduce(
      (acc, e) => acc + episodeProgressPct(e.status),
      0,
    )
    progressPct = Math.floor(sum / episodeCount)

    const allCompleted = episodes.every(e => e.status === 'completed')
    if (allCompleted) {
      currentStageLabel = '已完成'
    } else {
      // 找进度最低（最早未完成）的剧集
      const sorted = [...episodes].sort(
        (a, b) =>
          episodeProgressPct(a.status) - episodeProgressPct(b.status) ||
          a.episodeNumber - b.episodeNumber,
      )
      const target = sorted.find(e => e.status !== 'completed') ?? sorted[0]
      currentStageLabel = `第 ${target.episodeNumber} 集 · ${STAGE_LABEL[target.status]}`
    }
  }

  const sourceType: 'linked_lw' | 'standalone' =
    project.longWritingProjectId ? 'linked_lw' : 'standalone'

  return {
    ...project,
    episodeCount,
    progressPct,
    currentStageLabel,
    sourceType,
  }
}
