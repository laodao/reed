/**
 * 人名资格门（NameGate · G0 规则层）
 * @module core/platform/services/longwriting/graph/name-gate.service
 *
 * 背景（天下女捕实测）：R9 姓氏正则与 LLM 实体检测双双误报，"张纸/白天/何时/朱笔/
 * 沈家"等非人名混入名册成为永久孤立节点，并污染 R9 扫描与写作上下文。
 *
 * 职责：一切自动入册路径（未登记人物入队、0b 自动入册、共现补挂登记）的候选名，
 * 必须先过本门。G0 只做高置信确定性拦截（拦截即正确）；边界情况放行给既有
 * 人工确认队列（G1 LLM 批量复核属 P1）。
 *
 * 口径：宁放行勿误杀——G0 拦截的每一类都有可解释的确定性依据。
 */

import { NAME_SCAN_STOPWORDS, NAME_SCAN_SURNAMES } from './consistency.service'

/** 拦截原因（可解释性：每条拦截都要能告诉作者为什么） */
export type NameGateRejectReason =
  | 'too_short'            // 单字不成名
  | 'time_interrogative'   // 时间词/疑问词（何时/白天/当时…）
  | 'family_reference'     // 家族指称（沈家/贺家二公子…）
  | 'generic_role'         // 泛称/职务统称（账房先生/船家婆…）
  | 'quantifier_fragment'  // 量词搭配残片（"一张纸"→张纸）
  | 'artifact_concept'     // 器物/文书词（朱笔/金纹/银票…）

export interface NameGateVerdict {
  name: string
  pass: boolean
  reason?: NameGateRejectReason
}

/** 时间词/疑问词/方位时段——姓氏正则的高频误报源（"何时回京""白天带话"） */
const TIME_INTERROGATIVE_WORDS = new Set([
  '何时', '白天', '黑夜', '当时', '此刻', '方才', '顿时', '随即', '如今', '这时', '那时',
  '当日', '当天', '次日', '翌日', '往日', '平日', '终日', '整日', '今日', '明日', '昨夜',
  '现在', '从前', '今后', '往后', '忽然', '突然', '其间', '此时', '彼时', '同时', '当时分',
  '怎么', '为何', '何人', '何事', '何处', '哪里', '什么', '这样', '那样', '这般', '那般',
])

/**
 * 家族指称：X家（E2E 实测"万家"误报阻断）及扩展形态（贺家二公子/林家老爷）。
 * 与 consistency.service isFamilyReferenceName 口径一致并外扩称谓后缀。
 */
const FAMILY_REFERENCE_RE = /^[\u4e00-\u9fa5]{1,2}家(大|二|三|四)?(公子|小姐|少爷|老爷|夫人|太太|奶奶|管家|家主|主人)?$/

/**
 * 泛称/职务统称后缀——纯统称不是名字（"账房先生""船家婆""运河渔户三人"）。
 * 注意不拦"老冯掌柜/贾掌柜"这类姓氏+职务的可用人名把手，只拦裸统称与
 * "非姓氏前缀+称谓"组合；"裴先生"这类姓氏+称谓保留给队列/人工判断。
 */
const GENERIC_ROLE_WORDS = new Set([
  '账房先生', '账房', '船家婆', '船家', '渔户', '更夫', '门房', '轿夫', '樵夫', '渔翁',
  '货郎', '郎中', '大夫', '和尚', '道士', '道人', '尼姑', '乞丐', '叫花子', '说书人',
  ...NAME_SCAN_STOPWORDS,
])

const GENERIC_ROLE_SUFFIX_RE = /(?:先生|婆子|婆|娘子|公子|老爷|大叔|大婶|老汉|老妪|孩童|少年|少女|汉子|妇人)$/

/** 姓氏字符集（判定"姓+称谓"是否可作人名把手，如"裴先生"） */
const SURNAME_CHARS = new Set(NAME_SCAN_SURNAMES.split(''))

/**
 * 器物/文书尾字——2 字候选以此类字收尾时几乎必是器物而非人名
 * （实测误报：朱笔/金纹；纸/册/单已被量词规则覆盖，此处收尾字兜底）。
 */
const ARTIFACT_TAIL_CHARS = new Set([
  '笔', '墨', '砚', '纹', '票', '契', '据', '簿', '卷', '档', '印', '灯', '炉', '瓶', '匣',
])

/**
 * 量词前置字：候选在正文中的出现语境里，紧邻前字大量命中这些字 →
 * 是"一张纸/半张纸"式量词搭配而非人名（天下女捕"张纸"27 次全由此产生）。
 */
const QUANTIFIER_PRECEDING_CHARS = new Set(['一', '半', '几', '这', '那', '张', '个', '条', '份', '叠', '沓'])

/** 量词语境判定的命中比例阈值 */
const QUANTIFIER_RATIO_THRESHOLD = 0.6

export interface NameGateInput {
  /** 候选名 */
  name: string
  /**
   * 出现语境片段数组（每个出现点的前 2~4 字最佳，如"拿一"之于"张纸"）。
   * 缺省时跳过量词语境规则（其余规则不受影响）。
   */
  contexts?: string[]
}

/**
 * G0 规则层判定。规则顺序即置信度顺序，首个命中即返回。
 */
export function checkNameCandidate(input: NameGateInput): NameGateVerdict {
  const name = String(input?.name ?? '').trim()
  if (!name || name.length < 2) {
    return { name, pass: false, reason: 'too_short' }
  }
  if (TIME_INTERROGATIVE_WORDS.has(name)) {
    return { name, pass: false, reason: 'time_interrogative' }
  }
  if (FAMILY_REFERENCE_RE.test(name)) {
    return { name, pass: false, reason: 'family_reference' }
  }
  if (GENERIC_ROLE_WORDS.has(name)) {
    return { name, pass: false, reason: 'generic_role' }
  }
  if (GENERIC_ROLE_SUFFIX_RE.test(name)) {
    // "裴先生"（姓氏+称谓）可作人名把手放行；"账房先生"（无姓氏前缀）拦下
    const stem = name.replace(GENERIC_ROLE_SUFFIX_RE, '')
    const stemHasSurname = [...stem].some(ch => SURNAME_CHARS.has(ch))
    if (!stemHasSurname) {
      return { name, pass: false, reason: 'generic_role' }
    }
  }
  if (name.length === 2 && ARTIFACT_TAIL_CHARS.has(name[name.length - 1])) {
    return { name, pass: false, reason: 'artifact_concept' }
  }
  // 量词语境：contexts 提供"出现点前缀"片段，统计紧邻前字命中量词字的比例
  if (input.contexts && input.contexts.length > 0) {
    let hits = 0
    for (const ctx of input.contexts) {
      const prev = String(ctx ?? '').trim().slice(-1)
      if (prev && QUANTIFIER_PRECEDING_CHARS.has(prev)) hits++
    }
    if (hits / input.contexts.length >= QUANTIFIER_RATIO_THRESHOLD) {
      return { name, pass: false, reason: 'quantifier_fragment' }
    }
  }
  return { name, pass: true }
}

/**
 * 从正文中提取候选名的出现语境前缀（每个出现点取前 2 字，供量词语境规则）。
 */
export function collectNameContexts(name: string, content: string, max = 8): string[] {
  const contexts: string[] = []
  if (!name || !content) return contexts
  let idx = content.indexOf(name)
  while (idx >= 0 && contexts.length < max) {
    contexts.push(content.slice(Math.max(0, idx - 2), idx))
    idx = content.indexOf(name, idx + name.length)
  }
  return contexts
}

/**
 * 便捷判定：自动携带正文语境跑全量 G0 规则（content 缺省时量词语境规则跳过）。
 */
export function checkNameCandidateInContent(name: string, content?: string): NameGateVerdict {
  return checkNameCandidate({ name, contexts: content ? collectNameContexts(name, content) : undefined })
}

/** 供上层日志/台账输出的可读原因 */
export function describeRejectReason(reason: NameGateRejectReason): string {
  switch (reason) {
    case 'too_short': return '单字不成名'
    case 'time_interrogative': return '时间词/疑问词，非人名'
    case 'family_reference': return '家族指称，非具体人物'
    case 'generic_role': return '泛称/职务统称，非具体人物'
    case 'quantifier_fragment': return '量词搭配残片（如"一张纸"截取）'
    case 'artifact_concept': return '器物/文书词，非人名'
  }
}
