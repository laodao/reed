/**
 * 章节设计卡（54 号章法：先设计→自检→后动笔）
 * @module core/platform/services/longwriting/chapter-card
 *
 * 用户意见（2026-09-14）：写章节不能自由发挥，应按固定章法——
 * 先设计本章情节概要与爽点/钩子 → 自检 → 依据设计确定出场角色/物品/地点
 * → 一致性检查 → 才允许写正文。本模块是设计卡的纯函数层（可单测）：
 * 结构化数据 ⇄ markdown 卡片（落 lw_prewrites.content，正文生成时作为
 * 【预写提纲】注入），以及钩型解析（供相邻章钩型轮换检查）。
 */

export const CARD_HOOK_TYPES = ['悬念', '危机', '情绪', '信息', '反转'] as const

export interface ChapterCardCharacter {
  /** 角色名（须与项目人物册名字一致） */
  name: string
  /** 本章定位/目标/状态（如"首次登场，奉命暗查粮仓"） */
  roleThisChapter: string
}

export interface ChapterCardData {
  /** 本章情节概要（150-300字：起→承→转 + 章尾落点，与大纲概要呼应） */
  plotSummary: string
  /** 开场钩子（1-2句，承接上一章卡点） */
  openingHook: string
  /** 本章爽点（1-2句，读者情绪回报点） */
  highlight: string
  /** 章尾卡点（1-2句） */
  endingCliffhanger: string
  /** 钩型：悬念/危机/情绪/信息/反转 */
  hookType: string
  /** 出场角色（含本章目标/状态） */
  involvedCharacters: ChapterCardCharacter[]
  /** 出场地点 */
  involvedLocations: string[]
  /** 出场物品 */
  involvedItems: string[]
  /** 伏笔动作（如"收第3章'格印'伏笔"；无则写"无"） */
  foreshadowAction: string
}

/** 卡片字段校验：缺主干的卡片不允许进入确认环节 */
export function validateChapterCard(card: ChapterCardData | null | undefined): string[] {
  const issues: string[] = []
  if (!card) return ['设计卡为空']
  if (!card.plotSummary || card.plotSummary.trim().length < 80) issues.push('本章概要过短（应≥80字，含起承转与章尾落点）')
  if (!card.openingHook?.trim()) issues.push('缺少开场钩子')
  if (!card.highlight?.trim()) issues.push('缺少本章爽点')
  if (!card.endingCliffhanger?.trim()) issues.push('缺少章尾卡点')
  if (!CARD_HOOK_TYPES.includes(card.hookType as any)) issues.push(`钩型必须是 ${CARD_HOOK_TYPES.join('/')} 之一`)
  if (!Array.isArray(card.involvedCharacters) || card.involvedCharacters.length === 0) issues.push('出场角色为空（至少写主角）')
  return issues
}

/** 结构化卡片 → markdown（落库格式；正文生成时经【预写提纲】注入） */
export function buildChapterCardMarkdown(card: ChapterCardData, chapterTitle?: string): string {
  const chars = (card.involvedCharacters || [])
    .map(c => `- ${c.name}：${c.roleThisChapter || ''}`)
    .join('\n')
  return [
    `## 本章设计卡${chapterTitle ? `（${chapterTitle}）` : ''}`,
    '',
    `【本章概要】${card.plotSummary}`,
    `【开场钩子】${card.openingHook}`,
    `【本章爽点】${card.highlight}`,
    `【章尾卡点】${card.endingCliffhanger}（钩型：${card.hookType}）`,
    `【出场角色】`,
    chars || '- （无）',
    `【出场地点】${(card.involvedLocations || []).join('、') || '（无）'}`,
    `【出场物品】${(card.involvedItems || []).join('、') || '（无）'}`,
    `【伏笔动作】${card.foreshadowAction || '无'}`,
  ].join('\n')
}

/** 从卡片 markdown 解析钩型（相邻章轮换检查用） */
export function parseCardHookType(content: string | null | undefined): string | null {
  if (!content) return null
  const m = content.match(/【章尾卡点】[^\n]*（钩型：([^）]+)）/)
  return m ? m[1].trim() : null
}
