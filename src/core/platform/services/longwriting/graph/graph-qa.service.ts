/**
 * 图谱质检（P0 章节级规则校验器）
 * @module core/platform/services/longwriting/graph/graph-qa.service
 *
 * 确定性校验，零 token，每章流水线必跑。warn 级问题随 ChapterGraphProcessResult
 * 返回并打日志——不阻断重跑；正式问题台账（lw_graph_issues）P1 落库。
 *
 * 规则（对齐设计文档 §L4，P0 先落 4 条最高价值规则）：
 * - ANCHOR：事件 evidence 锚定缺失/未命中正文（事件提取 prompt 硬约束的复核）
 * - V4    ：名册重要人物（primary/secondary）本章正文出现却零事件挂载（P1 补漏二遍的输入）
 * - V6    ：零挂载事件（involved_entities 全部解析失败的事件节点会在图上悬空）
 * - TRUNC ：正文超事件提取输入上限（12000 字）——尾部事件静默丢失风险
 */

import type { MemoryEntity, StoryEvent } from '@shared/types/longwriting.types'

export interface GraphQaWarning {
  rule: 'ANCHOR' | 'V4' | 'V6' | 'TRUNC'
  message: string
  /** 定位目标（事件名/人物名） */
  target?: string
}

/** 事件提取输入截断上限（与 longwriting-ai.service extractChapterEvents 的 substring 同步） */
export const EVENT_EXTRACT_INPUT_LIMIT = 12000

const clean = (s: string): string => String(s ?? '').replace(/[「」『』【】\s，。！？、；：]/g, '')

/**
 * ANCHOR：事件锚定复核。evidence 缺失 = 模型违反硬约束（旧 prompt 产物或降级路径）；
 * evidence 清洗后未命中正文 = 疑似幻觉锚点。两者都 warn 不拒绝——事件内容本身
 * 可能仍然正确，严格拒绝留给 P1 审计（judge）带着证据裁决。
 */
export function checkEventAnchors(
  events: Array<{ name?: string; evidence?: string }>,
  chapterContent: string,
): GraphQaWarning[] {
  const warnings: GraphQaWarning[] = []
  const contentClean = clean(chapterContent)
  for (const ev of events) {
    const evidence = String(ev.evidence ?? '').trim()
    if (!evidence) {
      warnings.push({ rule: 'ANCHOR', message: `事件缺少正文锚定（evidence 为空）`, target: ev.name })
      continue
    }
    if (contentClean && !contentClean.includes(clean(evidence))) {
      warnings.push({ rule: 'ANCHOR', message: `事件锚定原句未在正文命中，疑似幻觉锚点：「${evidence}」`, target: ev.name })
    }
  }
  return warnings
}

/**
 * V4：重要人物出场却零挂载。判定"出场"= 人物名在本章正文出现；
 * "挂载"= 本章任一事件的 involvedEntities 含该人物。
 * P1 的定向补漏二遍以本清单为输入。
 */
export function checkUnlinkedRosterMentions(
  characters: Array<{ id: string; name: string; importance?: string }>,
  events: Array<{ involvedEntities?: MemoryEntity[] | string | null }>,
  chapterContent: string,
): GraphQaWarning[] {
  const linked = new Set<string>()
  for (const ev of events) {
    const ents = typeof ev.involvedEntities === 'string'
      ? safeParseArray(ev.involvedEntities)
      : (ev.involvedEntities ?? [])
    for (const ent of ents) {
      if (ent?.type === 'character' && ent?.id) linked.add(ent.id)
    }
  }
  const warnings: GraphQaWarning[] = []
  for (const c of characters) {
    if (!['primary', 'secondary'].includes(String(c.importance ?? ''))) continue
    const name = String(c.name ?? '').trim()
    if (name.length < 2) continue
    if (linked.has(c.id)) continue
    if (!chapterContent.includes(name)) continue
    warnings.push({ rule: 'V4', message: `重要人物本章出场但零事件挂载`, target: name })
  }
  return warnings
}

/**
 * V6：零挂载事件——involved_entities 为空（或全部解析失败）的事件在图上无任何边。
 */
export function checkEmptyEvents(events: StoryEvent[]): GraphQaWarning[] {
  return events
    .filter(ev => (ev.involvedEntities || []).length === 0)
    .map(ev => ({ rule: 'V6' as const, message: `事件零挂载（图上将成为孤立节点）`, target: ev.name }))
}

/** TRUNC：正文超输入上限，事件提取只见到前 12000 字 */
export function checkInputTruncation(chapterContent: string): GraphQaWarning[] {
  if (chapterContent.length <= EVENT_EXTRACT_INPUT_LIMIT) return []
  return [{
    rule: 'TRUNC',
    message: `正文 ${chapterContent.length} 字超出事件提取输入上限 ${EVENT_EXTRACT_INPUT_LIMIT} 字，尾部 ${chapterContent.length - EVENT_EXTRACT_INPUT_LIMIT} 字未参与提取`,
  }]
}

function safeParseArray(raw: string): Array<{ type?: string; id?: string }> {
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
