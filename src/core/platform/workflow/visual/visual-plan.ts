/**
 * 镜头画面规划与视觉质检（纯函数层）
 * @module platform/workflow/visual/visual-plan
 * @description 把「拆镜产出的镜头语义」翻译成三条供给路径都能用的输入：
 *              - 真实素材检索词（英文，优先用 LLM 给的 searchQuery，缺失时回落场景词典）
 *              - 文生图提示词（强制"真实可拍场景 + 无任何画面文字"）
 *              - 视觉质检提示词与打分解析（相关性 / 是否被画成文字海报）
 *
 *              纯函数、无 IO：工厂/解析规则可被单测穷举，节点只负责编排 IO。
 */

import { matchSceneRules } from '@shared/types/video-scene-lexicon'

/** 镜头视觉语义（拆镜产物 → 画面生产的输入契约） */
export interface VisualShotSpec {
  /** 语义主题（相关性判定的锚点） */
  concept?: string
  /** 画面主体实体（如"龙门吊与集装箱"） */
  subject?: string
  /** 场所环境（如"集装箱码头堆场"） */
  setting?: string
  /** 素材库检索词（英文短语，拆镜 LLM 直接给时优先） */
  searchQuery?: string
  /** 备选检索词 */
  altQueries?: string[]
  /** 可执行画面描述（光线/色调/构图/运镜） */
  visual?: string
  /** 景别 */
  shotSize?: string
  /** 运镜 */
  cameraMove?: string
  /** 字幕 */
  caption?: string
  /** 时长（秒） */
  duration?: number
}

/**
 * 画面纪律负向词：任何文字/图形/UI 一律不许出现在画面里（文字只走字幕层）。
 * 打散成词组便于各图像模型（中英文提示词）复用。
 */
export const NO_TEXT_NEGATIVE =
  '文字,字体,字母,字幕,水印,logo,标志,UI元素,界面,图表,表格,数据图,柱状图,折线图,海报字,贴纸,图标,按钮,二维码,边框,画中画'

/** 真实场景纪律（正向）：必须落到"能实拍的物理场景" */
export const REAL_SCENE_DISCIPLINE =
  '写实摄影风格，真实世界可拍摄的物理场景：明确的主体实体 + 明确场所环境 + 自然光线与空间纵深；避免抽象概念图、避免任何画面文字。'

/** 检索词链：raw 里的备选词（去重去空） */
export function buildQueryChain(primary: string, alts?: string[]): string[] {
  const out: string[] = []
  const push = (v: unknown): void => {
    const s = String(v ?? '').trim()
    if (s && !out.includes(s)) out.push(s)
  }
  push(primary)
  for (const a of alts || []) push(a)
  return out
}

/**
 * 解析该镜头的素材检索词：LLM 给的 searchQuery 优先；缺失时用场景词典兜底
 * （按 concept/subject/setting/visual 命中主题簇取英文检索词）。
 */
export function resolveSceneQueries(spec: VisualShotSpec): { primary: string; alts: string[] } {
  const explicit = String(spec.searchQuery || '').trim()
  if (explicit) {
    return { primary: explicit, alts: buildQueryChain('', spec.altQueries).slice(0) }
  }
  const text = [spec.concept, spec.subject, spec.setting, spec.visual].filter(Boolean).join(' ')
  const rules = matchSceneRules(text, 3)
  if (rules.length === 0) return { primary: '', alts: [] }
  const primary = rules[0].searchQuery
  const alts: string[] = []
  for (const q of rules[0].altQueries || []) alts.push(q)
  for (const r of rules.slice(1)) alts.push(r.searchQuery)
  return { primary, alts: buildQueryChain('', alts) }
}

/**
 * 组装文生图提示词：镜头语义 + 预设风格 + 真实场景纪律。
 * `extra` 用于质检失败后的**强化重试**（追加针对性纠偏语）。
 */
export function buildGenerationPrompt(
  spec: VisualShotSpec,
  opts?: { styleText?: string; extra?: string },
): string {
  const parts: string[] = []
  const subject = String(spec.subject || '').trim()
  const setting = String(spec.setting || '').trim()
  const visual = String(spec.visual || '').trim()
  const concept = String(spec.concept || '').trim()
  if (subject || setting) {
    parts.push(`画面主体：${[subject, setting].filter(Boolean).join('，')}`)
  }
  if (visual) parts.push(`画面内容：${visual}`)
  if (!visual && concept) parts.push(`语义主题：${concept}`)
  if (spec.shotSize) parts.push(`景别：${spec.shotSize}`)
  if (spec.cameraMove) parts.push(`运镜：${spec.cameraMove}`)
  parts.push(REAL_SCENE_DISCIPLINE)
  const style = String(opts?.styleText || '').trim()
  if (style) parts.push(`画面风格：${style}`)
  const extra = String(opts?.extra || '').trim()
  if (extra) parts.push(extra)
  return parts.join('\n')
}

/** 质检系统提示词（视觉模型：只输出 JSON） */
export const VISUAL_QA_SYSTEM_PROMPT =
  '你是短视频画面质检员。用户给你一张镜头画面和该镜头的脚本语义，你要判断这张图能不能用。\n' +
  '只输出一个 JSON 对象，不要任何解释文字，结构：' +
  '{"score":0-100的整数,"hasText":true/false,"reason":"20字以内的中文理由"}。\n' +
  'score 判定标准（从宽到严都要考虑）：\n' +
  '- 90~100：画面就是脚本所说的场景与主体，写实、干净、可直接投放；\n' +
  '- 60~89：场景与主体基本对得上，细节略有出入，可用；\n' +
  '- 30~59：只有气氛沾边，主体不对或过于抽象；\n' +
  '- 0~29：跑题、抽象图形、海报/信息图、有明显AI畸形或不可用。\n' +
  'hasText：画面中出现任何可读文字（含招牌字、屏幕字、水印、字幕条）则为 true。'

/** 质检用户提示词 */
export function buildQaPrompt(spec: VisualShotSpec): string {
  const lines = [
    `脚本语义主题：${String(spec.concept || '（无）')}`,
    `画面主体应为：${String(spec.subject || '（未指定）')}`,
    `场所应为：${String(spec.setting || '（未指定）')}`,
  ]
  const visual = String(spec.visual || '').trim()
  if (visual) lines.push(`画面要求：${visual}`)
  lines.push('请判断这张图能否用于该镜头，按要求只输出 JSON。')
  return lines.join('\n')
}

/** 质检结果 */
export interface VisualQaResult {
  score: number
  hasText: boolean
  reason: string
}

/**
 * 解析质检输出：容忍 ```json 围栏、前后说明文字；取第一个 JSON 对象。
 * 解析失败返回 null（调用方按"无质检"降级处理，绝不因解析失败阻断成片）。
 */
export function parseVisualQa(text: string): VisualQaResult | null {
  const raw = String(text || '')
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  let obj: Record<string, unknown>
  try {
    obj = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return null
  }
  const rawScore = obj.score
  if (rawScore === undefined || rawScore === null || String(rawScore).trim() === '') return null
  let score = typeof rawScore === 'number' ? rawScore : Number(String(rawScore).replace(/[^\d.]/g, ''))
  if (!Number.isFinite(score)) return null
  // 宽容：模型偶尔按 0-10 给分（且明确不是 0-100 语义时按十分制折算）
  if (score > 0 && score <= 10 && !String(rawScore).includes('100')) score = score * 10
  score = Math.max(0, Math.min(100, Math.round(score)))
  const hasTextRaw = obj.hasText ?? obj.has_text ?? obj.text
  const hasText = hasTextRaw === true || String(hasTextRaw).toLowerCase() === 'true'
  return { score, hasText, reason: String(obj.reason ?? '').slice(0, 80) }
}

/**
 * 质检失败后的强化提示词片段（按失败原因给纠偏语，而不是盲目重试）。
 * 目的是把"再生成一次"变成"针对性地再生成一次"。
 */
export function buildRetryExtra(qa: VisualQaResult | null): string {
  const base = '重新生成：务必是真实可拍的具体物理场景，主体清晰居中，不要任何文字与图形元素。'
  if (!qa) return base
  const bits = [base]
  if (qa.hasText) bits.push('上一版出现了文字/标语/水印，本版画面内不得出现任何字符。')
  if (qa.score < 30) bits.push('上一版与脚本场景无关（疑似抽象图形或海报），本版必须画出脚本点名的场所与实体。')
  else if (qa.score < 60) bits.push('上一版的场所或主体与脚本不符，本版严格按"画面主体/场所"重画。')
  return bits.join('')
}

/** 生成路径的最终判定：质检通过，或（无质检时）有图即用 */
export function isGeneratedAcceptable(
  qa: VisualQaResult | null,
  minScore: number,
): boolean {
  if (!qa) return true // 无质检能力时不阻断
  if (qa.hasText && qa.score < 90) return false
  return qa.score >= minScore
}