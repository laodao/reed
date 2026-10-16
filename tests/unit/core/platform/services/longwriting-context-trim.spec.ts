/**
 * W2.1 上下文预算硬裁剪：trimChapterPartsToBudget 纯函数单测
 */
import { describe, expect, it } from 'vitest'
import {
  composeChapterPrompt,
  estimateContextTokens,
  trimChapterPartsToBudget,
  type ChapterPromptParts,
} from '@core/platform/services/longwriting/chapter-context'

function mkParts(over: boolean): ChapterPromptParts {
  const big = '设定'.repeat(over ? 4000 : 10)
  return {
    overviewText: '全书概要：少年逆袭。',
    backgroundText: over ? big : '古代王朝。',
    worldLibraryText: over ? big : '修炼体系：炼气。',
    taskText: '第三章：夜探府邸。',
    characterItems: [
      { id: 'char:1', sectionKey: 'character', title: '林川', text: over ? big : '主角卡', tokens: 1, defaultChecked: true },
    ],
    locationItems: [
      { id: 'loc:1', sectionKey: 'location', title: '府邸', text: over ? big : '地点卡', tokens: 1, defaultChecked: true },
    ],
    prevEndingText: '上一章结尾原文。',
    constraintsText: '关键记忆若干。',
    prewriteContent: '设计卡：开场钩子…',
    graphSection: '关系边与事件。',
    recallSection: '',
    styleText: '热血风。',
    extraText: '',
  }
}

function buildPrompt(p: ChapterPromptParts): string {
  return composeChapterPrompt(p, () => true, { targetWords: 3000 })
}

describe('trimChapterPartsToBudget（W2.1）', () => {
  it('低于预算：原样返回，steps 为空，prompt 逐字节不变', () => {
    const parts = mkParts(false)
    const baseline = buildPrompt(parts)
    const r = trimChapterPartsToBudget(parts, 'system', 100_000, buildPrompt)
    expect(r.steps).toEqual([])
    expect(r.parts).toBe(parts)
    expect(buildPrompt(r.parts)).toBe(baseline)
    expect(r.estimateTokens).toBe(estimateContextTokens(baseline) + estimateContextTokens('system'))
  })

  it('超预算：按价值阶梯裁剪，低价值分区先被清空，可收敛到预算内', () => {
    const r = trimChapterPartsToBudget(mkParts(true), 'system', 8_000, buildPrompt)
    expect(r.steps.length).toBeGreaterThan(0)
    // 世界观库触发条目是最先被裁的阶梯
    expect(r.steps[0]).toBe('世界观库触发条目')
    expect(r.parts.worldLibraryText).toBe('')
    expect(r.estimateTokens).toBeLessThanOrEqual(8_000)
  })

  it('永不裁分区：任务/设计卡/风格/附加要求保持原样', () => {
    const parts = mkParts(true)
    const r = trimChapterPartsToBudget(parts, 'system', 6_000, buildPrompt)
    expect(r.parts.taskText).toBe(parts.taskText)
    expect(r.parts.prewriteContent).toBe(parts.prewriteContent)
    expect(r.parts.styleText).toBe(parts.styleText)
    expect(r.parts.overviewText).toBe(parts.overviewText)
  })

  it('预算极小：阶梯全触发仍可能超限——如实返回超限估值（上游告警）', () => {
    const r = trimChapterPartsToBudget(mkParts(true), 'system', 500, buildPrompt)
    expect(r.steps.length).toBe(7)
    expect(r.estimateTokens).toBeGreaterThan(0)
  })
})
