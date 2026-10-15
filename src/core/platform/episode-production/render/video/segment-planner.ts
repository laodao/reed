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
import {
  cameraAngleLabel,
  movementLabel,
  shotTypeLabel,
} from '../../prompts/cinematic-registry'

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
  /**
   * 该镜头承接的台词（说话人 + 原文；来自 storyboard_dialogue_links / dialogue_ids）。
   * 音视频联合模型需要「镜头时段 → 说话人 → 台词」的结构化输入才能正确发声；
   * 埋在画面描述散文里的台词会被念成乱码（2026-10-05 seq3 实锤）。
   */
  dialogues?: SegmentDialogue[]
}

/** 一条镜头台词（视频 prompt 台词段用） */
export interface SegmentDialogue {
  speaker: string
  text: string
  /** scene_dialogues.id（前端编辑回写用；prompt 组装忽略此字段） */
  id?: string
}

/**
 * 剥离画面描述中的台词引文（2026-10-05 台词乱码修复，M10 修正引号配对缺口）。
 *
 * 台词统一由 shots[].dialogues 台词段承载（说话人+原文+镜头时段三段对应），
 * frameDescription 里的 `说道："…"` 引文若一并提交，模型会看到两份台词且散文版
 * 没有结构——只剥「言语动词 + 引号」结构（说道："…" → 说道）；非言语语境的
 * 引号（匾额写着"雪麓山庄"）保留。DB 中的分镜原文不动，仅在拼 prompt 时剥离。
 *
 * 引号配对按类型各自成支（每支只排除自身类型的引号，不再混合开/闭类）：
 *   「…」『…』"…"“…”'…'‘…'，单引号两式旧正则完全漏剥。
 * 弯双引号支额外允许一层同类型嵌套（“…“…”…”）：若也禁止内层“，嵌套文本会在
 * 内层动词处错位匹配、剥出 `她说：“我说就走了”。` 这类残缺文本——外层整段
 * 剥掉（她说。）才是正确行为。各支首字符互斥，无灾难回溯。
 */
const SPEECH_QUOTE_RE =
  /(说道|说|问道|问|答道|答|回答道|回答|喊道|喊|叫道|叫|嚷道|嚷|喝道|怒道|笑道|叹道|嘀咕|嘟囔|念叨|沉声|轻声|低声|回应|开口)[：:]?\s*(?:「[^「」]*」|『[^『』]*』|"[^"]*"|“(?:[^“”]|“[^“”]*”)*”|'[^']*'|‘[^‘’]*’)/g

export function stripDialogueQuotes(text: string): string {
  if (!text) return text
  return text.replace(SPEECH_QUOTE_RE, '$1')
}

export interface SegmentPromptOptions {
  width?: number
  height?: number
  /** 项目风格词（config.stylePrompt）；传入则追加「画面风格」约束 */
  stylePrompt?: string
  /**
   * 剧情确需画面内文字（如手机屏/信件特写不由关键帧承载时）置 true，
   * 跳过默认的「不得出现字幕、文字、水印、LOGO」负向约束；缺省/false 一律追加
   */
  allowOnScreenText?: boolean
}

/**
 * 镜头头里的景别/角度/运动标签（提示词优化方案 §3.14：标签一律从镜头语言注册表取，
 * 25 个运镜预设全部可达视频模型）。
 *
 * 优化前这里手写 15 项 cogen 词表，与 UI 真值（camera-movements.ts 的 25 预设）不同源——
 * 除 static/pan_left/pan_right/crane_up/crane_down 外，其余 19 个真实预设与历史值
 * 全部被静默省略（"界面所见即模型所得"对这部分运镜不成立）。
 * 现在未命中注册表（含 legacyValues/aliases 解析）才省略，并记 warn 留痕。
 *
 * @param onUnmapped 未映射值的回调（默认记 warn），仅对"非空且不认识"的值触发
 */
export function shotHeaderMeta(
  s: SegmentPromptShot,
  onUnmapped?: (field: string, value: string) => void,
): string[] {
  const notify = (field: string, value: string) => {
    if (onUnmapped) onUnmapped(field, value)
    else console.warn(`[segment-planner] 镜头 ${field} 取值 "${value}" 不在镜头语言注册表内，已省略该标签`)
  }

  const meta: string[] = []

  if (s.shotType) {
    const label = shotTypeLabel(s.shotType)
    if (label) meta.push(label)
    else notify('shotType', s.shotType)
  }
  if (s.cameraAngle) {
    const label = cameraAngleLabel(s.cameraAngle)
    if (label) meta.push(label)
    else notify('cameraAngle', s.cameraAngle)
  }
  if (s.cameraMovement) {
    const label = movementLabel(s.cameraMovement)
    if (label) meta.push(label)
    else notify('cameraMovement', s.cameraMovement)
  }
  return meta
}

/**
 * 拼接片段级多镜头提示词（§5，2026-09-18 补全数据面）：
 *   镜头1（约5s，全景，推镜）：<frameDescription>；台词：{沈云萝：…}；镜头2（约4s，近景）：<frameDescription>。
 *   总时长约 9 秒，画面比例 16:9（1920x1080）。多个镜头之间保持人物、场景、
 *   光影与风格一致，镜头切换自然连贯。画面风格：<stylePrompt>。
 *   画面中不得出现字幕、文字、水印、LOGO（默认负向尾巴，allowOnScreenText 可豁免）。
 *
 * 数据面原则：界面上已选的景别/角度/运镜、项目风格词必须到达视频模型；
 * @[资产@索引] 标记替换为资产名纯文本（模型不认识引用语法）；
 * frameDescription 中 `说道："…"` 形式的台词引文被剥离（stripDialogueQuotes），
 * 台词改由 shots[].dialogues 台词段结构化承载（2026-10-05 台词乱码修复）。
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
    let body = `${header}：${replaceAssetRefMarkers(stripDialogueQuotes(s.frameDescription ?? ''))}`
    // 台词段（声音符号协议 {}）：紧跟镜头时段头，音视频模型据此对口型发声
    if (s.dialogues && s.dialogues.length > 0) {
      body += `；台词：${s.dialogues.map((d) => `{${d.speaker}：${d.text}}`).join('，')}`
    }
    return body
  })
  const total = shots.reduce((sum, s) => {
    const d = Number.isFinite(s.duration) && s.duration > 0 ? s.duration : DEFAULT_SHOT_DURATION_SEC
    return sum + d
  }, 0)
  const hasDialogue = shots.some((s) => (s.dialogues?.length ?? 0) > 0)

  const constraints: string[] = [`总时长约${formatSec(total)}`]
  if (opts.width && opts.height) {
    constraints.push(`画面比例 ${aspectRatioText(opts.width, opts.height)}（${opts.width}x${opts.height}）`)
  }
  if (shots.length > 1) {
    constraints.push('多个镜头之间保持人物、场景、光影与风格一致，镜头切换自然连贯')
  }
  // 音频口径：有台词 → 结构化台词段是唯一台词来源；无台词 → 显式禁人声防幻觉配音
  constraints.push(
    hasDialogue
      ? '台词由对应人物以自然语速清晰说出，语音与各镜头时长匹配，不得加速、不得含糊、不得念错字'
      : '画面中人物不说话，无人物对白语音，仅环境音',
  )
  if (opts.stylePrompt?.trim()) {
    constraints.push(`画面风格：${opts.stylePrompt.trim()}`)
  }
  // 默认负向尾巴（ep-video-prompt 方法论）：字幕在合成阶段后加，烧进画面是事故
  if (!opts.allowOnScreenText) {
    constraints.push('画面中不得出现字幕、文字、水印、LOGO')
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
