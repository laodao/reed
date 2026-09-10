/**
 * 讲义难度门禁（纯函数；2026-09-09 复盘「初学者评估」落地）
 * @module packs/domain-learning/rules/learning-difficulty.rules
 *
 * 背景：初学者评估发现「目标=入门」的空间里出现研究生级讲义（经验贝叶斯：∫、分布族记号、
 * iid、oracle 等），零基础读者到这里直接劝退。
 *
 * 口径（用户拍板：遇超纲先补前置基础卡）：
 * - 仅当空间目标为「入门」时才设门禁（工作应用/前沿目标不过滤）；
 * - 讲义正文出现「进阶记号」（积分/偏导/极限/期望方差记号/iid/分布族/测度）时，
 *   要求它**已做记号教学**（首区 meta 的「记号热身」、或文中给出「读法/读作/符号表」）；
 * - 未做教学即视为超纲 → 拒绝直接落卡，并把「先建前置基础概念 + prerequisite 关系、
 *   为最基础者先出讲义」的路径写进错误信息，交给研究会话按 S 阶段补前置。
 */

/** 进阶记号识别（label 用于给人看的提示） */
export const ADVANCED_NOTATION: Array<{ id: string; label: string; re: RegExp }> = [
  { id: 'integral', label: '积分符号 ∫', re: /∫|\\int\b/ },
  { id: 'partial', label: '偏导 ∂', re: /∂|\\partial\b/ },
  { id: 'limit', label: '极限 lim', re: /\\lim\b|lim[_ ]|\blim\b/ },
  { id: 'expectation', label: '期望/方差记号 E[·]、Var(·)', re: /\\mathbb\{E\}|\\operatorname\{Var\}|\bE\[|\bVar\(|\\mathrm\{Var\}/ },
  { id: 'iid', label: 'iid（独立同分布）', re: /\biid\b|独立同分布/ },
  { id: 'distribution', label: '分布族记号（N(·)/Θ/𝒩）', re: /\\mathcal\{N\}|\\Theta|\\theta_\{?k|N\(\\mu|\\sim\\mathcal|N\([Θθμ]|[Θθ]_[A-Za-z0-9]/ },
  { id: 'measure', label: '测度/σ-代数', re: /σ-?代数|西格玛代数|测度/ },
  { id: 'matrix', label: '矩阵/向量记号（⊤、∇）', re: /⊤|\\top\b|∇|\\nabla\b/ },
]

/** 记号教学的迹象（有其一即视为已做教学，不设门禁） */
const NOTATION_TEACHING_MARKERS = ['记号热身', '读法', '读作', '符号表', '这个符号的意思']

/** 判定该目标是否属于「入门」口径（含"入门级/零基础"等写法） */
export function isBeginnerGoal(goal: string | null | undefined): boolean {
  const g = String(goal ?? '')
  if (!g) return false
  return /入门|零基础|初学|小白/.test(g)
}

/** 正文里出现的进阶记号（去重，返回给人看的 label 列表） */
export function detectAdvancedNotation(text: string): string[] {
  const src = String(text ?? '')
  const hit: string[] = []
  for (const n of ADVANCED_NOTATION) {
    if (n.re.test(src)) hit.push(n.label)
  }
  return hit
}

/** 是否存在记号教学迹象 */
export function hasNotationTeaching(text: string): boolean {
  const src = String(text ?? '')
  return NOTATION_TEACHING_MARKERS.some((m) => src.includes(m))
}

export interface DifficultyGateInput {
  /** 空间学习目标（如「入门」「工作应用」「前沿」） */
  goal: string | null | undefined
  /** 讲义区集（key/title/md） */
  sections: Array<{ key: string; title?: string | null; md: string }>
  /** 空间内已有概念名（诊断用；当前口径不强制前置已存在） */
  knownConceptNames?: string[]
}

export interface DifficultyGateResult {
  /** true = 应拒绝直接落卡，先补前置/补记号教学 */
  gated: boolean
  /** 命中的进阶记号 label 列表 */
  notation: string[]
  /** 是否检测到记号教学 */
  teaching: boolean
  /** 给人看的理由（未 gated 时为空串） */
  reason: string
}

/**
 * 难度门禁判定。
 * 规则：入门目标 + 出现进阶记号 + 未做记号教学 → gated。
 */
export function checkLessonDifficulty(input: DifficultyGateInput): DifficultyGateResult {
  const merged = (input.sections ?? []).map((s) => `## ${s.title ?? s.key}\n${s.md}`).join('\n\n')
  const notation = detectAdvancedNotation(merged)
  if (!isBeginnerGoal(input.goal)) {
    return { gated: false, notation, teaching: hasNotationTeaching(merged), reason: '' }
  }
  if (notation.length === 0) {
    return { gated: false, notation, teaching: false, reason: '' }
  }
  const teaching = hasNotationTeaching(merged)
  if (teaching) {
    return { gated: false, notation, teaching, reason: '' }
  }
  const missing = notation.join('、')
  return {
    gated: true,
    notation,
    teaching,
    reason:
      `本讲义用到进阶记号（${missing}），而空间目标是「${input.goal}」且讲义未做记号教学——` +
      `请先补前置：用 dl_save_concept 建立这些记号所需的基础概念（如"积分基础""随机变量与分布""期望与方差"），` +
      `用 dl_save_relation 建 prerequisite 关系（基础 → 本概念），并为最基础的那个先 dl_save_card 出讲义；` +
      `或者在本讲义首区（key=meta）加「记号热身」逐条给出读法与最小例子后重试。`,
  }
}
