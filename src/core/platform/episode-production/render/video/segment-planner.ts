/**
 * 视频片段拆分规则 + 多镜头提示词拼接（纯函数，无 IO）
 * @module platform/episode-production/render/video/segment-planner
 *
 * tasks/2026-09-04-ep-video-segment-redesign §3 / §5：
 *   1. 场景边界必切（由调用方按场景分组后逐场景调用，天然不跨场景）
 *   2. 时长预算：按镜头顺序累加预估时长，加入下一镜会超预算则切分
 *   3. 单镜头超预算则独成一段
 *   提示词（2026-09-18 数据面补全）：拼接各镜 frameDescription + 景别/角度/运镜
 *   中文标签 + 项目风格词；@[资产@索引] 标记替换为资产名纯文本（视频模型
 *   不认识引用语法，界面所见即模型所得）。
 */

import { replaceAssetRefMarkers } from '../keyframe/parse-asset-refs'

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
  /** 景别（shotType 枚举值；传入则拼进镜头头，让视频模型收到界面上的景别选择） */
  shotType?: string
  /** 镜头角度（cameraAngle 枚举值） */
  cameraAngle?: string
  /** 镜头运动（cameraMovement 枚举值） */
  cameraMovement?: string
}

export interface SegmentPromptOptions {
  width?: number
  height?: number
  /** 项目风格词（config.stylePrompt）；传入则追加「画面风格」约束 */
  stylePrompt?: string
}

/** 景别/角度/运动枚举 → 中文标签（取值域与 storyboard-cogen 镜头语言说明一致） */
const SHOT_TYPE_LABELS: Record<string, string> = {
  extreme_long: '大远景',
  long: '远景',
  full: '全景',
  medium: '中景',
  medium_close: '中近景',
  close: '近景',
  extreme_close: '特写',
  detail: '大特写',
}
const CAMERA_ANGLE_LABELS: Record<string, string> = {
  eye_level: '平视',
  high: '俯拍',
  low: '仰拍',
  dutch: '荷兰角',
  birds_eye: '鸟瞰',
  worms_eye: '虫视',
}
const CAMERA_MOVEMENT_LABELS: Record<string, string> = {
  static: '固定镜头',
  pan_left: '左摇',
  pan_right: '右摇',
  tilt_up: '上仰',
  tilt_down: '下俯',
  dolly_in: '推镜',
  dolly_out: '拉镜',
  zoom_in: '变焦推近',
  zoom_out: '变焦拉远',
  crane_up: '升镜头',
  crane_down: '降镜头',
  tracking_left: '左移',
  tracking_right: '右移',
  handheld: '手持',
  steadicam: '稳定器跟随',
}

/** 镜头头里的景别/角度/运动标签（只放认识的枚举值，未知值静默省略） */
function shotHeaderMeta(s: SegmentPromptShot): string[] {
  const meta: string[] = []
  const st = s.shotType && SHOT_TYPE_LABELS[s.shotType]
  if (st) meta.push(st)
  const ca = s.cameraAngle && CAMERA_ANGLE_LABELS[s.cameraAngle]
  if (ca) meta.push(ca)
  const cm = s.cameraMovement && CAMERA_MOVEMENT_LABELS[s.cameraMovement]
  if (cm) meta.push(cm)
  return meta
}

/**
 * 拼接片段级多镜头提示词（§5，2026-09-18 补全数据面）：
 *   镜头1（约5s，全景，推镜）：<frameDescription>；镜头2（约4s，近景）：<frameDescription>。
 *   总时长约 9 秒，画面比例 16:9（1920x1080）。多个镜头之间保持人物、场景、
 *   光影与风格一致，镜头切换自然连贯。画面风格：<stylePrompt>。
 *
 * 数据面原则：界面上已选的景别/角度/运镜、项目风格词必须到达视频模型；
 * @[资产@索引] 标记替换为资产名纯文本（模型不认识引用语法）。
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
    const meta = shotHeaderMeta(s)
    const header = `镜头${i + 1}（约${formatSec(dur)}${meta.length ? '，' + meta.join('，') : ''}）`
    return `${header}：${replaceAssetRefMarkers(s.frameDescription ?? '')}`
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
  if (opts.stylePrompt?.trim()) {
    constraints.push(`画面风格：${opts.stylePrompt.trim()}`)
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
