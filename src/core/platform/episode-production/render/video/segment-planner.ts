/**
 * 视频片段拆分规则 + 多镜头提示词拼接（纯函数，无 IO）
 * @module platform/episode-production/render/video/segment-planner
 *
 * tasks/2026-09-04-ep-video-segment-redesign §3 / §5：
 *   1. 场景边界必切（由调用方按场景分组后逐场景调用，天然不跨场景）
 *   2. 时长预算：按镜头顺序累加预估时长，加入下一镜会超预算则切分
 *   3. 单镜头超预算则独成一段
 *   提示词：V1 直接拼接各镜 frameDescription（@资产引用沿用现有行为——
 *   标记文本原样传入，与单镜生成 ep:generate-video-segment 一致）。
 */

/** 拆分输入的最小镜头形状 */
export interface SegmentShotInput {
  id: string
  /** 预估时长（秒）；<=0 / NaN 按 defaultDurationSec 计 */
  duration: number
}

export const DEFAULT_SEGMENT_BUDGET_SEC = 15
export const MIN_SEGMENT_BUDGET_SEC = 5
export const MAX_SEGMENT_BUDGET_SEC = 30
const DEFAULT_SHOT_DURATION_SEC = 3

/** 项目级预算收敛到合法区间（5–30s，默认 15s） */
export function clampBudgetSec(budgetSec: number | null | undefined): number {
  if (budgetSec == null || !Number.isFinite(budgetSec) || budgetSec <= 0) {
    return DEFAULT_SEGMENT_BUDGET_SEC
  }
  return Math.min(MAX_SEGMENT_BUDGET_SEC, Math.max(MIN_SEGMENT_BUDGET_SEC, budgetSec))
}

/**
 * 把同一场景内的有序镜头按预算切成若干段。
 *
 * 规则（§3）：
 *   - 顺序累加，加入下一镜会超预算（严格大于）→ 在下一镜前切分
 *   - 单镜头时长超预算 → 独成一段（不影响后续镜头继续累加）
 *   - 空输入 → 空数组
 */
export function splitShotsIntoSegments<T extends SegmentShotInput>(
  shots: T[],
  budgetSec: number,
): T[][] {
  const budget = clampBudgetSec(budgetSec)
  const segments: T[][] = []
  let current: T[] = []
  let currentDur = 0

  for (const shot of shots) {
    const dur =
      Number.isFinite(shot.duration) && shot.duration > 0
        ? shot.duration
        : DEFAULT_SHOT_DURATION_SEC

    if (current.length > 0 && currentDur + dur > budget) {
      segments.push(current)
      current = []
      currentDur = 0
    }
    current.push(shot)
    currentDur += dur
    // 单镜超预算 → 独成一段，立刻闭合
    if (dur > budget) {
      segments.push(current)
      current = []
      currentDur = 0
    }
  }
  if (current.length > 0) segments.push(current)
  return segments
}

/** 提示词拼接输入的镜头形状 */
export interface SegmentPromptShot {
  frameDescription: string
  duration: number
}

export interface SegmentPromptOptions {
  width?: number
  height?: number
}

/**
 * 拼接片段级多镜头提示词（§5）：
 *   镜头1（约5s）：<frameDescription>；镜头2（约4s）：<frameDescription>。
 *   总时长约 9 秒，画面比例 16:9（1920x1080）。多个镜头之间保持人物、场景、
 *   光影与风格一致，镜头切换自然连贯。
 */
export function buildSegmentPrompt(
  shots: SegmentPromptShot[],
  opts: SegmentPromptOptions = {},
): string {
  const parts = shots.map((s, i) => {
    const dur =
      Number.isFinite(s.duration) && s.duration > 0
        ? s.duration
        : DEFAULT_SHOT_DURATION_SEC
    return `镜头${i + 1}（约${formatSec(dur)}）：${s.frameDescription ?? ''}`
  })
  const total = shots.reduce((sum, s) => {
    const d = Number.isFinite(s.duration) && s.duration > 0 ? s.duration : DEFAULT_SHOT_DURATION_SEC
    return sum + d
  }, 0)

  const constraints: string[] = [`总时长约${formatSec(total)}`]
  if (opts.width && opts.height) {
    constraints.push(`画面比例 ${aspectRatioText(opts.width, opts.height)}（${opts.width}x${opts.height}）`)
  }
  if (shots.length > 1) {
    constraints.push('多个镜头之间保持人物、场景、光影与风格一致，镜头切换自然连贯')
  }
  return `${parts.join('；')}。${constraints.join('，')}。`
}

function formatSec(n: number): string {
  return `${Number(n.toFixed(1))}s`
}

function aspectRatioText(width: number, height: number): string {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
  const g = gcd(width, height) || 1
  return `${width / g}:${height / g}`
}
