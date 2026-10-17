/**
 * 选区 AI 编辑的 excerpt 级复查（W4 / OQ-2 默认方案）
 * @module core/platform/services/longwriting/excerpt-review
 *
 * 边界（OQ-2）：选区改写是章法收口指令的豁免通道，红线是"只动选区文本 + 必过
 * excerpt 复查 + 必建版本"。复查不跑整章 R1-R11 门禁，只做 excerpt 级最小扫描：
 * - R1 近似：状态追踪中已死亡的角色名字出现在结果里（死亡语义取自实体状态摘要）
 * 扫描是 warning 性质（提示可继续），不阻断采纳。
 */

/** 死亡语义关键词（与 consistency R1 的死亡判定同族，excerpt 级放宽为状态摘要关键词） */
const DEATH_KEYWORDS = [
  '死亡', '已死', '殒命', '身亡', '毙命', '去世', '殁', '被杀', '处死',
  '斩杀', '杀害', '葬身', '断气', '咽气', '气绝', '尸', '阵亡', '丧命',
]

export interface ExcerptCharacterInfo {
  name: string
  aliases?: string[]
  /** 该角色截至最近章节的状态摘要（死亡判定依据） */
  stateSummary?: string
}

/**
 * 扫描选区结果中的 excerpt 级冲突，返回 warning 文案列表（空=无提示）。
 * @param text AI 处理后的结果文本
 * @param characters 项目人物（含别名与最新状态摘要）
 */
export function scanExcerptConflicts(text: string, characters: ExcerptCharacterInfo[]): string[] {
  const warnings: string[] = []
  if (!text) return warnings
  for (const c of characters) {
    const names = [String(c.name || '').trim(), ...(Array.isArray(c.aliases) ? c.aliases.map(String) : [])]
      .filter((n) => n.length >= 2)
    if (names.length === 0) continue
    const state = String(c.stateSummary || '')
    const isDead = DEATH_KEYWORDS.some((k) => state.includes(k))
    if (!isDead) continue
    const hit = names.find((n) => text.includes(n))
    if (!hit) continue
    warnings.push(`「${hit}」在实体状态追踪中已死亡，结果文本中出现该名字——请确认不是回忆/闪回以外的活人出场`)
  }
  return warnings
}
