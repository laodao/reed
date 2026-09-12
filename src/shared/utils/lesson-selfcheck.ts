/**
 * 讲义「自测答案」折叠（纯函数；2026-09-12 用户需求：自测的答案默认折叠）
 * @module shared/utils/lesson-selfcheck
 *
 * 背景：讲义末区自测（key=selfcheck/review）把题目与答案写在同一段里，
 * 读者一眼就看到答案，失去了"先自己做，再对答案"的检索练习效果（M7 检索练习）。
 *
 * 做法：把自测区的 md 按**独占一行的答案标记**（`答案` / `参考答案` / `答案与解析` …
 * 可带 markdown 标题或加粗）切成两段——题目给读者做，答案交给渲染层默认折叠。
 * 同时识别"整区就是答案"的区（key=answers / 标题以答案开头），强制这类区默认折叠。
 *
 * 设计取向：只认**独占一行的标记**，不做模糊猜测——`- **答案**：xxx` 这种行内答案不算标记
 * （那通常是讲解中的对照，不是自测答案区）。
 */

/** 答案区标记行（独占一行；允许 markdown 标题、加粗、结尾冒号） */
const ANSWER_MARKER_LINE =
  /^\s{0,3}(?:#{1,6}\s*)?(?:\*\*|__)?\s*(?:参考答案与解析|答案与解析|参考答案|标准答案|正确答案|答案|解答)\s*(?:\*\*|__)?\s*[:：]?\s*$/

/** 水平分隔线（`---` / `***` / `___`；仅由符号与空白组成） */
const HORIZONTAL_RULE_LINE = /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/

export interface SelfCheckParts {
  /** 题目部分（学习者正文；可含"先自己做"提示） */
  questions: string
  /** 答案部分（默认折叠；空串 = 未检测到答案区） */
  answers: string
  /** 是否检测到独占一行的答案标记 */
  hasAnswers: boolean
}

/**
 * 按答案标记把自测内容切成题目 / 答案。
 * - 只认**独占一行**的答案标记；标记之后（含）全部归答案；
 * - 题目末尾紧邻的水平分隔线（`---`）并入裁掉（折叠面板自带分隔，不需要多余横线）；
 * - 标记前没有题目内容时不做切分（避免产生空题目区；整区是答案的情况由 `isAnswerSection` 兜底折叠）。
 */
export function splitSelfCheckAnswers(md: string): SelfCheckParts {
  const src = String(md ?? '')
  if (!src.trim()) return { questions: '', answers: '', hasAnswers: false }

  const lines = src.split(/\r?\n/)
  const markerAt = lines.findIndex((line) => ANSWER_MARKER_LINE.test(line))
  if (markerAt < 0) return { questions: src, answers: '', hasAnswers: false }

  const questions = trimTrailingRules(lines.slice(0, markerAt).join('\n'))
  const answers = lines
    .slice(markerAt + 1)
    .join('\n')
    .trim()
  // 标记前没有题目 → 不切分（整区答案由 isAnswerSection 折叠）
  if (!questions.trim() || !answers) return { questions: src, answers: '', hasAnswers: false }

  return { questions, answers, hasAnswers: true }
}

/** 裁掉尾部空行与水平分隔线（可能连续重复） */
function trimTrailingRules(text: string): string {
  const lines = text.split(/\r?\n/)
  while (lines.length) {
    const last = lines[lines.length - 1]
    if (!last.trim() || HORIZONTAL_RULE_LINE.test(last)) {
      lines.pop()
      continue
    }
    break
  }
  return lines.join('\n').trimEnd()
}

/**
 * 整区是否为「答案区」（key=answers / 标题以"答案/解析/解答"开头）。
 * 这类区默认折叠，读者先看题目/正文再展开。
 */
export function isAnswerSection(sec: { key?: string | null; title?: string | null }): boolean {
  const key = String(sec.key ?? '').toLowerCase()
  if (['answers', 'answer', 'selfcheck-answers', 'solutions', 'solution'].includes(key)) return true
  const title = String(sec.title ?? '').trim()
  if (!title) return false
  return /^(?:(?:参考|标准|正确)?答案|解答|解析|答案解析)/.test(title)
}
