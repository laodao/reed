/**
 * 章节质量门（49 号）
 * @module core/platform/services/longwriting/chapter-quality-gate
 *
 * 生成后自动校验字数达标度；不足时做一次"扩写 pass"（R3 调研结论：enrich 优于整章重生成——
 * 保留既有情节与文风，只补足场面/对白/心理）。纯函数 + 依赖注入 AI 调用，便于单测。
 */

/** 字数达标判定（下限从严：明显欠字数的章节读者体感"薄"，是"效果不好"的直接来源之一） */
export const WORD_COUNT_FLOOR_RATIO = 0.7

export interface WordCountAssessment {
  actual: number
  target: number
  ratio: number
  verdict: 'ok' | 'too_short'
}

export function assessChapterWordCount(content: string, targetWords: number): WordCountAssessment {
  const actual = (content || '').trim().length
  const target = Math.max(1, targetWords || 0)
  const ratio = actual / target
  return { actual, target, ratio, verdict: ratio < WORD_COUNT_FLOOR_RATIO ? 'too_short' : 'ok' }
}

/** 扩写指令：不改动既有情节，只补肉——保留原文全部内容直接输出扩写后全文 */
export function buildExpandPrompt(content: string, targetWords: number): string {
  return `以下是一章正文的草稿，目标约 ${targetWords} 字，当前只有 ${content.trim().length} 字。请在不新增情节转折、不重复已有内容、不改变叙事顺序与文风的前提下，把它扩写到约 ${targetWords} 字：补足场面调度、人物动作与神态细节、关键对白的展开、必要的心理描写。直接输出扩写后的完整正文（含原有内容），不要任何说明或标题。

【草稿开始】
${content.trim()}
【草稿结束】`
}

export interface QualityGateResult {
  content: string
  gate: {
    initialWords: number
    finalWords: number
    targetWords: number
    expanded: boolean
    verdict: WordCountAssessment['verdict']
  }
}

/**
 * 应用质量门：字数不足 → 用传入的 AI 调用做一次扩写，取更长结果。
 * aiCall 抛错时 fail-soft 保留原稿。
 */
export async function applyChapterQualityGate(
  content: string,
  targetWords: number,
  aiCall: (prompt: string) => Promise<string>,
): Promise<QualityGateResult> {
  const initial = assessChapterWordCount(content, targetWords)
  if (initial.verdict === 'ok') {
    return { content, gate: { initialWords: initial.actual, finalWords: initial.actual, targetWords, expanded: false, verdict: 'ok' } }
  }
  let finalContent = content
  try {
    const expanded = await aiCall(buildExpandPrompt(content, targetWords))
    if (expanded && expanded.trim().length > initial.actual) finalContent = expanded
  } catch {
    // fail-soft：扩写失败保留原稿
  }
  const final = assessChapterWordCount(finalContent, targetWords)
  return {
    content: finalContent,
    gate: { initialWords: initial.actual, finalWords: final.actual, targetWords, expanded: true, verdict: final.verdict },
  }
}
