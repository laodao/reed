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
import {
  DEFAULT_SECTION_TITLES as TEMPLATE_SECTION_TITLES,
  canonicalSectionKey,
  normalizeLessonHeadingLevels,
  sectionStyleOf,
} from './lesson-template'

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

/**
 * key → 兜底标题（模板语义区；AI 未给 title 时的兜底）。
 * 2026-09-13 起改为读讲义区集契约 `lesson-template`（唯一事实来源）——同一类型同一区的
 * 标题完全一致，历史卡的自由命名（checks/worked…）也能拿到规范标题。
 */
export const DEFAULT_SECTION_TITLES: Record<string, string> = TEMPLATE_SECTION_TITLES

/** 区默认样式（AI 未给 style 时的兜底；同样读契约，别名一并认） */
export function defaultSectionStyle(key: string): LessonSectionStyle {
  return sectionStyleOf(key)
}

/** 作者注记区的识别（key=notes/authoring-notes 或标题含「编写注记/注记」） */
export function isAuthoringNotesSection(sec: Pick<LessonSectionLike, 'key' | 'title'>): boolean {
  const key = canonicalSectionKey(sec.key)
  if (key === 'notes') return true
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
  /** 正文章节序号（从 1 开始；**跟随区为 0**——它不占章节编号） */
  no: number
  /**
   * 跟随区（2026-09-15 v8）：归属上一个正文章节、不占章节编号的收尾块（当前只有自测的
   * 「参考答案」——它整区默认折叠，读者先做再对，不该在目录里再算一章）。
   */
  follower: boolean
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
 * - **跟随区**（v8）：整区就是答案的区（key=answers / 标题以「答案/解析」开头）**不占章节编号**
 *   （`follower=true`、`no=0`）——它是上一个正文章节的收尾折叠块，不是独立一章（用户口径：
 *   「章节太细碎」，核心骨架只有定义/详解/案例/自测这几节）；
 * - 标题/样式按 AI 给定值优先，缺省用**区集契约**（lesson-template）兜底；
 * - 2026-09-13（用户反馈「同一主题不同知识点结构与标题层级不一致」）：
 *   ① 区 key 先按同义写法归一（checks/quiz/selftest → selfcheck），历史卡也能拿到
 *      自测样式（review）与答案折叠；② 区正文小标题层级统一到 `###`，与区标题（二级语义）
 *      拉开层级——历史卡里用 `##` 写的正文不再与区标题抢视觉。
 *   历史数据不改写，只在渲染期归一。
 */
export function planLessonSections(sections: LessonSectionLike[]): LessonSectionPlan {
  const content: LessonContentSection[] = []
  const authoringNotes: string[] = []
  let chapterNo = 0

  for (let index = 0; index < sections.length; index++) {
    const sec = sections[index]
    if (isAuthoringNotesSection(sec)) {
      for (const item of splitNoteItems(sec.md)) authoringNotes.push(item)
      continue
    }
    const key = canonicalSectionKey(sec.key)
    const { body, notes } = stripAuthoringNotes(normalizeLessonHeadingLevels(sec.md))
    const split = splitSelfCheckAnswers(body)
    const title = (sec.title ?? '').trim() || DEFAULT_SECTION_TITLES[key] || ''
    const style = (sec.style as LessonSectionStyle | undefined) ?? defaultSectionStyle(key)
    // 答案区：整区默认折叠 + 不占章节编号（归属上一个正文章节，见模块头说明）
    const follower = isAnswerSection({ key, title: sec.title })
    if (!follower) chapterNo += 1
    for (const note of notes) {
      authoringNotes.push(title ? `【${title}】${note}` : note)
    }
    content.push({
      index,
      no: follower ? 0 : chapterNo,
      follower,
      key: sec.key,
      title,
      body: split.questions,
      answers: normalizeLessonHeadingLevels(split.answers),
      notes,
      style,
      folded: !!sec.folded || follower,
    })
  }

  return { content, authoringNotes }
}
