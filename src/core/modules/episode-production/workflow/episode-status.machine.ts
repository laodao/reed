/**
 * 剧集状态机（spec §2.4 · P6-T10）
 * @module modules/episode-production/workflow/episode-status.machine
 *
 * 定义 EpisodeStatus 7 个状态 + 合法转换规则（spec §2.3 软引导 + 末端硬锁）。
 *
 * 状态序列：
 *   pending（① 内容）→ asset_prep（② 资产）→ scripting（③ 剧本）→
 *   storyboarding（④ 分镜）→ producing（⑤ 制作）→ composing（⑥ 合成）→
 *   completed（成片）
 *
 * 合法转换：
 *   - 正向：可推进到下一状态（满足 stage-gate.canEnterStage 条件）
 *   - 任意跳转：除"末端硬锁"composing → completed 必须 stage-gate 通过外，前向跳转可放过
 *   - 回退：任意状态可回到任何更前状态（用户手动撤回）
 *
 * 纯函数模块，无 IO。
 */

import type { EpisodeStatus } from '@shared/types/episode-production'

/** 状态对应的阶段编号（① 到 ⑥；completed = ⑦ 完成）*/
export const STAGE_ORDER: Record<EpisodeStatus, number> = {
  pending: 1,
  asset_prep: 2,
  scripting: 3,
  storyboarding: 4,
  producing: 5,
  composing: 6,
  completed: 7,
}

export const STAGE_LABELS: Record<EpisodeStatus, string> = {
  pending: '① 内容',
  asset_prep: '② 资产',
  scripting: '③ 剧本',
  storyboarding: '④ 分镜',
  producing: '⑤ 制作',
  composing: '⑥ 合成',
  completed: '✓ 完成',
}

/** 全部 EpisodeStatus 排序数组（UI 渲染进度条用） */
export const ALL_EPISODE_STATUSES: EpisodeStatus[] = [
  'pending',
  'asset_prep',
  'scripting',
  'storyboarding',
  'producing',
  'composing',
  'completed',
]

/**
 * 计算从 from → to 的转换方向。
 * @returns
 *   'forward' = 正向推进（可能需要 stage-gate 校验）
 *   'backward' = 回退（合法）
 *   'same' = 同状态（无转换）
 */
export function classifyTransition(
  from: EpisodeStatus,
  to: EpisodeStatus,
): 'forward' | 'backward' | 'same' {
  const fromOrder = STAGE_ORDER[from]
  const toOrder = STAGE_ORDER[to]
  if (toOrder === fromOrder) return 'same'
  return toOrder > fromOrder ? 'forward' : 'backward'
}

/**
 * 给定 from 状态，列出所有"下一步可能"的状态（非空集 = 终态除外）。
 *
 * - 正向：from 后一个状态
 * - 任意：用户可手动跳到任一非 completed 状态（completed 必须经 stage-gate）
 *
 * 注：此函数仅返回拓扑可能；具体能否执行需结合 stage-gate.canEnterStage。
 */
export function getNextPossibleStatuses(from: EpisodeStatus): EpisodeStatus[] {
  if (from === 'completed') return []
  return ALL_EPISODE_STATUSES.filter((s) => s !== from)
}

/**
 * 定位到 status 对应的"阶段编号"（spec §2.2 进度条 1~6）。
 * completed 返回 7。
 */
export function stageNumberOf(status: EpisodeStatus): number {
  return STAGE_ORDER[status]
}

/**
 * 把状态映射到 UI 进度条的视觉标记（✓ / ● / ○）。
 * - ✓：current 之前的（已完成）
 * - ●：current
 * - ○：current 之后的（未到）
 */
export function visualMarkOfStage(
  stageStatus: EpisodeStatus,
  currentStatus: EpisodeStatus,
): '✓' | '●' | '○' {
  const ord = STAGE_ORDER[stageStatus]
  const cur = STAGE_ORDER[currentStatus]
  if (ord < cur) return '✓'
  if (ord === cur) return '●'
  return '○'
}
