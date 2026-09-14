/**
 * 圣经就绪门（50 号）
 * @module core/platform/services/longwriting/bible-readiness-gate
 *
 * 固定流程约束：核心故事（概要）、角色、故事线三类关键设定就位之前，不允许生成大纲与章节正文。
 * 依据：《大宋女捕》实跑证实——大纲/正文生成时若名册为空，模型会自由造名（正文顾清玄/王铁/赵德），
 * 而角色设定作为独立采样另造一套（圣经沈墨/展昭），两套命名无对账机制即产生角色漂移。
 * 纯函数 + 无依赖，便于单测与后续在其他宿主复用。
 */

export interface BibleReadinessInput {
  overview?: { summary?: string | null; title?: string | null } | null
  characters?: Array<{ name?: string | null }> | null
  plots?: Array<{ title?: string | null; summary?: string | null }> | null
}

export interface BibleReadinessResult {
  ready: boolean
  /** 缺失项名称，顺序固定：核心故事 → 角色 → 故事线 */
  missing: string[]
}

/** 实质内容判定：全空白（含纯空白符）视为未设定——建行可空名/空摘要，行数≠就绪（评审 P1-1/P2-2） */
function hasText(v?: string | null): boolean {
  return Boolean(v && String(v).trim())
}

/**
 * 设定就绪判定：概要需有实质 summary；角色需至少 1 个有姓名者；
 * 故事线需至少 1 条有标题或摘要者。判定口径与名册渲染一致。
 */
export function assessBibleReadiness(input: BibleReadinessInput): BibleReadinessResult {
  const missing: string[] = []
  if (!input.overview || !hasText(input.overview.summary)) missing.push('核心故事（故事概要）')
  const namedCharacters = (input.characters || []).filter((c) => hasText(c?.name))
  if (namedCharacters.length === 0) missing.push('角色')
  const substantivePlots = (input.plots || []).filter((p) => hasText(p?.title) || hasText(p?.summary))
  if (substantivePlots.length === 0) missing.push('故事线')
  return { ready: missing.length === 0, missing }
}

/**
 * 生成前置检查的报错文案。就绪时返回 null；未就绪时给出缺失项与固定流程指引，
 * 让用户在界面上能直接知道该先做什么。
 */
export function buildBibleGateError(purpose: string, missing: string[]): string | null {
  if (missing.length === 0) return null
  return `无法生成${purpose}：故事圣经关键设定未就绪（缺少：${missing.join('、')}）。固定流程为 概要 → 角色 → 故事线 → 大纲 → 正文，请先在故事圣经中完成上述设定后再生成。`
}

/**
 * 大纲人物名册硬约束段：有名册时拼入大纲提示词，禁止模型另造人名。
 * 名册外的功能性角色一律用身份称呼（证人、掌柜等），从源头掐掉角色漂移。
 * 排序：主角 → 反派 → 配角（评审 P1-2：cap 截断时保证关键人物必在名册内）；
 * 截断时注明总数，避免暗示未列出者可虚构。
 */
export function buildCastRosterConstraint(characters: Array<{ name?: string | null; rolePosition?: string | null }>, cap = 20): string {
  const roster = (characters || []).filter((c) => hasText(c?.name))
  if (roster.length === 0) return ''
  const rank = (rp?: string | null) => (rp === 'protagonist' ? 0 : rp === 'antagonist' ? 1 : 2)
  const sorted = [...roster].sort((a, b) => rank(a.rolePosition) - rank(b.rolePosition))
  const listed = sorted.slice(0, cap)
  const roleText = (rp?: string | null) => (rp === 'protagonist' ? '主角' : rp === 'antagonist' ? '反派' : '配角')
  const line = listed.map((c) => `${String(c.name).trim()}（${roleText(c.rolePosition)}）`).join('、')
  const totalNote = roster.length > listed.length ? `（名册共 ${roster.length} 人，此处列前 ${listed.length} 位，其余以故事圣经为准）` : ''
  return `【人物名册·硬约束】全篇所有具名人物必须且只能使用故事圣经名册中的姓名，禁止虚构任何新的人名；名册之外的功能性角色一律用身份称呼（如：证人、掌柜、仵作）。${totalNote}名册：${line}`
}
