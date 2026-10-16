/**
 * 领域学习「讲义导出」纯规则（2026-09-15 用户需求：知识点正文导出 md/pdf/长图）
 * @module packs/domain-learning/rules/learning-lesson-export
 *
 * 只做两件纯事（无 IO、无 db、无平台依赖，便于 TDD 直测）：
 *  1. 把一个知识点的「概念节点 + 讲义卡」拼成一篇可独立阅读的 markdown 讲义正文；
 *  2. 生成导出文件名（含非法字符清洗）。
 *
 * 版式产物（PDF/长图）由平台文档工具层（core/platform/services/document-tools）渲染，
 * 本模块不碰渲染——避免"各业务自建一套导出"。
 */

import { cardStatusLabel, essenceLabel, masteryLabel, nodeTypeLabel } from '@shared/utils/domain-learning-labels'
import type { DlCardSection, DlEvidenceRef, DlWorkRef } from '@shared/types/domain-learning.types'

/** 导出所需的「知识点节点」字段（dl_concept 子集） */
export interface LessonExportConcept {
  name: string
  /** 节点类型（concept/theory/... 仅作展示） */
  nodeType?: string | null
  /** 英文术语 */
  en?: string | null
  /** 一句话定义 */
  desc?: string | null
  /** 掌握度 */
  mastery?: string | null
  /** 图上前置（prerequisite 边派生名） */
  prereqs?: string[]
  /** 声明的前置（attrs.prerequisites；可能尚未建边） */
  declaredPrereqs?: string[]
}

/** 导出所需的「讲义卡」字段（dl_card 子集；任一历史版本同样适用） */
export interface LessonExportCard {
  essenceType?: string | null
  sections: DlCardSection[]
  works?: DlWorkRef[] | null
  evidenceSources?: DlEvidenceRef[] | null
  version: number
  status: string
}

/** 导出上下文（文件名/元信息用） */
export interface LessonExportContext {
  spaceName: string
  /** 学习目标（入门/工作应用/前沿） */
  goal?: string | null
  /** 已格式化的导出时间文案（格式化属服务层职责，纯规则不做时区处理） */
  exportedAtLabel: string
  /** 是否输出元信息头（默认 true；拼合集正文时可关） */
  includeMeta?: boolean
}

export interface LessonExportInput {
  concept: LessonExportConcept
  card: LessonExportCard
  context: LessonExportContext
}

/** 前置名合并去重（图上前置在前、声明前置补后；去空、去重、保持顺序） */
export function mergePrereqNames(prereqs?: string[], declared?: string[]): string[] {
  const out: string[] = []
  for (const raw of [...(prereqs ?? []), ...(declared ?? [])]) {
    const name = String(raw ?? '').trim()
    if (!name || out.includes(name)) continue
    out.push(name)
  }
  return out
}

/** 相关著作 → markdown 列表行 */
function workLine(w: DlWorkRef): string {
  const bits: string[] = []
  if (w.authors) bits.push(w.authors)
  if (w.year) bits.push(String(w.year))
  if (w.kind) bits.push(`[${w.kind}]`)
  const tail = bits.length ? ` · ${bits.join(' · ')}` : ''
  const note = w.note ? ` — ${w.note}` : ''
  const url = w.url ? ` · ${w.url}` : ''
  return `- **${w.title}**${tail}${note}${url}`
}

/** 证据来源 → markdown 列表行（只存引用摘要，全文在项目知识库） */
function evidenceLine(e: DlEvidenceRef): string {
  const bits: string[] = []
  if (e.kind) bits.push(`[${e.kind}]`)
  const url = e.url ? ` · ${e.url}` : e.kbDocId ? ` · 知识库文档 ${e.kbDocId}` : ''
  const quote = e.quote ? `\n  > ${e.quote}` : ''
  return `- ${bits.length ? `${bits.join(' ')} ` : ''}${e.title}${url}${quote}`
}

/** 区标题（title 缺省回退 key，key 也缺则「正文」） */
function sectionTitle(s: DlCardSection): string {
  return String(s.title ?? s.key ?? '').trim() || '正文'
}

/**
 * 拼装单篇讲义 markdown。
 *
 * 结构：概念名标题 → 元信息引用块 → 各内容区（区标题 + 结论条 + 正文）
 *      → 相关著作 → 证据来源。空区/空清单整段消失，不输出空小节。
 */
export function buildLessonMarkdown(input: LessonExportInput): string {
  const { concept, card, context } = input
  const lines: string[] = []

  lines.push(`# ${concept.name.trim()}`)
  if (concept.en?.trim()) lines.push(`*${concept.en.trim()}*`)
  lines.push('')

  if (context.includeMeta !== false) {
    const head: string[] = [`领域：${context.spaceName}`]
    if (context.goal) head.push(`学习目标：${context.goal}`)
    lines.push(`> ${head.join(' · ')}`)

    const second: string[] = [`类型：${nodeTypeLabel(concept.nodeType)}`, `掌握度：${masteryLabel(concept.mastery)}`]
    second.push(`讲义：v${card.version}（${cardStatusLabel(card.status)}）`)
    if (card.essenceType) second.push(`本质：${essenceLabel(card.essenceType)}`)
    lines.push(`> ${second.join(' · ')}`)

    if (concept.desc?.trim()) lines.push(`> 一句话定义：${concept.desc.trim()}`)
    const prereqs = mergePrereqNames(concept.prereqs, concept.declaredPrereqs)
    if (prereqs.length) lines.push(`> 前置：${prereqs.join('、')}`)
    if (context.exportedAtLabel) lines.push(`> 导出于 ${context.exportedAtLabel}`)
    lines.push('')
  }

  for (const s of card.sections ?? []) {
    const md = String(s.md ?? '').trim()
    if (!md && !s.takeaway) continue
    lines.push(`## ${sectionTitle(s)}`)
    lines.push('')
    if (s.takeaway?.trim()) {
      lines.push(`> ${s.takeaway.trim()}`)
      lines.push('')
    }
    if (md) {
      lines.push(md)
      lines.push('')
    }
  }

  const works = card.works ?? []
  if (works.length) {
    lines.push('## 相关著作')
    lines.push('')
    for (const w of works) lines.push(workLine(w))
    lines.push('')
  }

  const evidence = card.evidenceSources ?? []
  if (evidence.length) {
    lines.push('## 证据来源')
    lines.push('')
    for (const e of evidence) lines.push(evidenceLine(e))
    lines.push('')
  }

  return `${lines.join('\n').trim()}\n`
}

/** 文件名片段清洗（Windows/POSIX 非法字符 + 控制字符 + 折叠空白） */
export function sanitizeFilenamePart(s: string): string {
  const cleaned = String(s ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || '未命名'
}

/** 导出文件名：`{空间}-{概念}-讲义[-v{n}].{ext}` */
export function lessonExportFilename(input: {
  spaceName: string
  conceptName: string
  version?: number | null
  ext: string
}): string {
  const space = sanitizeFilenamePart(input.spaceName)
  const concept = sanitizeFilenamePart(input.conceptName)
  // 空间名与概念名相同时不重复（如空间「深度学习」下的同名知识点）
  const parts = space === concept ? [space, '讲义'] : [space, concept, '讲义']
  if (input.version != null) parts.push(`v${input.version}`)
  const ext = String(input.ext ?? '').replace(/^\./, '') || 'md'
  return `${parts.join('-')}.${ext}`
}