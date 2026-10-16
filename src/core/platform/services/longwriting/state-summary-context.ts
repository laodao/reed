/**
 * 章节状态摘要链上下文（W2.2）
 * @module core/platform/services/longwriting/state-summary-context
 *
 * 背景：此前章节生成只注入「上一章」的结束状态摘要（getLatestBeforeChapter 单条），
 * 更早章节的剧情状态对模型不可见——长篇写到几十章后「前情」只剩一章。
 * 本构建器把最近 N 章摘要组织成紧凑链：更早章节一行一条压缩回顾 + 上一章保留
 * 原全量格式（单条时输出与旧行为逐字节一致，保证回归安全）。
 */
import type { ChapterStateSummary } from '@shared/types/longwriting.types'

/** 单条压缩回顾行的字段截断宽度（字符）——链是「回顾」不是「重述」，控制预算 */
const COMPACT_FIELD_MAX = 80

function clip(s: string | null | undefined, max = COMPACT_FIELD_MAX): string {
  const t = String(s || '').trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}

/**
 * 构建状态摘要链上下文。
 * @param summaries 按 chapterNumber 升序的项目状态摘要（调用方负责排序，本函数不信任顺序会再排一次）
 * @param currentChapterNumber 当前要写的章号（只取 chapterNumber < 当前值）
 * @param chainLimit 链长（最近 N 章；>=1）
 */
export function buildStateSummaryChainContext(
  summaries: ChapterStateSummary[],
  currentChapterNumber: number,
  chainLimit: number,
): string {
  const limit = Math.max(1, Math.floor(chainLimit || 1))
  const prior = summaries
    .filter((s) => s.chapterNumber < currentChapterNumber)
    .sort((a, b) => a.chapterNumber - b.chapterNumber)
  if (prior.length === 0) return ''
  const chain = prior.slice(-limit)
  const latest = chain[chain.length - 1]

  // 旧行为兼容：链里只有上一章一条时，输出与原 getChapterStateSummaryContext 逐字节一致
  let context = '\n\n【重要：前文状态】请确保与上一章结束状态保持一致：\n'

  if (chain.length > 1) {
    context += '\n【更早章节状态回顾】\n'
    for (const s of chain.slice(0, -1)) {
      const parts = [
        s.storyTime ? `时间${clip(s.storyTime, 40)}` : '',
        s.currentLocation ? `地点${clip(s.currentLocation, 40)}` : '',
        s.keyChanges ? `变化：${clip(s.keyChanges)}` : '',
      ].filter(Boolean)
      context += `- 第 ${s.chapterNumber} 章${parts.length ? '：' + parts.join(' · ') : ''}\n`
    }
    context += '\n'
  }

  context += `\n【故事时间】${latest.storyTime}\n`
  context += `\n【当前地点】${latest.currentLocation || '未指定'}\n`

  if (latest.characterStates) {
    context += `\n【角色状态】\n${latest.characterStates}\n`
  }

  if (latest.pendingEvents) {
    context += `\n【待处理事件/伏笔】\n${latest.pendingEvents}\n`
  }

  if (latest.keyChanges) {
    context += `\n【上一章关键变化】\n${latest.keyChanges}\n`
  }

  context += '\n【注意事项】\n'
  context += '1. 时间线要连续，本章开始时间应从上一章结束时间之后开始\n'
  context += '2. 角色状态要与上一章结束状态一致\n'
  context += '3. 待处理事件可在本章继续发展或解决\n'

  return context
}
