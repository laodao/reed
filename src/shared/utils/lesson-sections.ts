/**
 * 讲义「区（section）」结构规划（纯函数；2026-09-12 排版复盘落地）
 * @module shared/utils/lesson-sections
 *
 * 背景（用户反馈「章节结构不清、编写注记右侧动作重叠」）：
 * 讲义卡片把「正文章节」与「编写注记」混在同一个 sections 数组里按同一种样式渲染，
 * 于是：
 * 1. 编写注记区被当成一个正文章节，标题行右上同时挂着「展开全文」与悬浮的「这块没懂」→ 重叠；
 * 2. 章节没有编号/层级，读者分不清某段属于哪一节；
 * 3. 注记散落在各区正文与被剥离出来的碎片里，读者看到两套「编写注记」。
 *
 * 本模块把「区集 → 可渲染计划」这层纯逻辑集中起来（便于 TDD 与复用）：
 * - `content`：正文章节（按原序编号，剔除编写注记区），带解析后的标题/样式与
 *   已剥离注记的正文；
 * - `authoringNotes`：**唯一**的编写注记汇总（正文章节里剥离出的 + 编写注记区全文），
 *   渲染层置底折叠展示，学习者可跳过。
 */

import { stripAuthoringNotes } from './lesson-authoring-notes'
import { isAnswerSection, splitSelfCheckAnswers } from './lesson-selfcheck'

/** 区最小形状（不强绑 shared 类型，便于复用与测试） */
export interface LessonSectionLike {
  key: string
  title?: string | null
  md: string
  folded?: boolean
  style?: string
}

/** 区样式（渲染语义：引言 / 正文 / 注意 / 检验） */
export type LessonSectionStyle = 'intro' | 'body' | 'note' | 'review'

/** key → 默认标题（模板语义区；AI 未给 title 时的兜底） */
export const DEFAULT_SECTION_TITLES: Record<string, string> = {
  meta: '学习前必读',
  essence: '本质',
  why: '为什么学它',
  statement: '陈述/条文',
  justification: '依据/证明',
  application: '应用/适用',
  definition: '定义',
  mechanism: '机制',
  structure: '组成/结构',
  procedure: '步骤',
  formula: '公式',
  rules: '规则',
  code: '落到代码',
  example: '示例',
  examples: '示例',
  edge: '示例与注意',
  counterexample: '反例/边界',
  distinguish: '辨析',
  property: '性质',
  evidence: '证据',
  pitfalls: '常见坑',
  review: '检验',
  selfcheck: '自测',
  controversy: '争议',
  detail: '详解',
}

/** 区默认样式（AI 未给 style 时的兜底） */
export function defaultSectionStyle(key: string): LessonSectionStyle {
  if (key === 'essence' || key === 'meta') return 'intro'
  if (key === 'edge' || key === 'pitfalls') return 'note'
  if (key === 'review' || key === 'selfcheck') return 'review'
  return 'body'
}

/** 作者注记区的识别（key=notes 或标题含「编写注记/注记」） */
export function isAuthoringNotesSection(sec: Pick<LessonSectionLike, 'key' | 'title'>): boolean {
  if (sec.key === 'notes' || sec.key === 'authoring-notes') return true
  return /编写注记|作者注记|注记/.test(sec.title ?? '')
}

/**
 * 把注记 md 拆成逐条（列表项优先；无列表则整段作一条）。
 * 用于折叠面板渲染 `<li>`，避免把多行 md 塞进一个列表项。
 */
export function splitNoteItems(md: string): string[] {
  const lines = String(md ?? '').split(/\r?\n/)
  const items: string[] = []
  let buf: string[] = []
  const flush = (): void => {
    const text = buf.join(' ').replace(/\s+/g, ' ').trim()
    if (text) items.push(text)
    buf = []
  }
  for (const line of lines) {
    if (/^\s*(?:[-*+]|\d+[.)])\s+/.test(line)) {
      flush()
      buf.push(line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, ''))
      continue
    }
    if (!line.trim()) {
      flush()
      continue
    }
    buf.push(line.trim())
  }
  flush()
  return items
}

/** 可渲染的正文章节 */
export interface LessonContentSection {
  /** 在原 sections 数组中的下标（供折叠/展开状态稳定引用） */
  index: number
  /** 正文区序号（从 1 开始；仅正文章节计数） */
  no: number
  key: string
  title: string
  /** 已剥离编写注记的学习者正文（自测区=题目部分） */
  body: string
  /** 自测答案（已从正文切出；渲染层默认折叠；空串=本区无答案区） */
  answers: string
  /** 从本区正文剥离出的编写注记（带区名前缀，便于读者理解上下文） */
  notes: string[]
  style: LessonSectionStyle
  folded: boolean
}

export interface LessonSectionPlan {
  content: LessonContentSection[]
  /** 汇总的编写注记（置底折叠；学习者可跳过） */
  authoringNotes: string[]
}

/**
 * 区集 → 渲染计划。
 * - 编写注记区不进 `content`，其全文按条并入 `authoringNotes`；
 * - 正文区的「⚠️ 待核验 / 先验待查」等注记从正文剥离，带区名并入 `authoringNotes`；
 * - 自测区的答案按独占一行的「答案」标记切出到 `answers`（渲染层默认折叠，
 *   让读者先自己做再对答案）；key/title 是答案区的默认整区折叠；
 * - 标题/样式按 AI 给定值优先，缺省用模板语义兜底。
 */
export function planLessonSections(sections: LessonSectionLike[]): LessonSectionPlan {
  const content: LessonContentSection[] = []
  const authoringNotes: string[] = []

  for (let index = 0; index < sections.length; index++) {
    const sec = sections[index]
    if (isAuthoringNotesSection(sec)) {
      for (const item of splitNoteItems(sec.md)) authoringNotes.push(item)
      continue
    }
    const { body, notes } = stripAuthoringNotes(sec.md)
    const split = splitSelfCheckAnswers(body)
    const title = (sec.title ?? '').trim() || DEFAULT_SECTION_TITLES[sec.key] || ''
    const style = (sec.style as LessonSectionStyle | undefined) ?? defaultSectionStyle(sec.key)
    for (const note of notes) {
      authoringNotes.push(title ? `【${title}】${note}` : note)
    }
    content.push({
      index,
      no: content.length + 1,
      key: sec.key,
      title,
      body: split.questions,
      answers: split.answers,
      notes,
      style,
      // 答案区默认折叠（整区就是答案时别把答案摊在正文里）
      folded: !!sec.folded || isAnswerSection(sec),
    })
  }

  return { content, authoringNotes }
}
