import { describe, expect, it } from 'vitest'
import {
  applyChapterQualityGate,
  assessChapterWordCount,
  buildExpandPrompt,
} from '@core/platform/services/longwriting/chapter-quality-gate'

describe('chapter-quality-gate（49 号章节字数质量门）', () => {
  it('达标判定：≥70% 为 ok，<70% 为 too_short', () => {
    expect(assessChapterWordCount('x'.repeat(1800), 1800).verdict).toBe('ok')
    expect(assessChapterWordCount('x'.repeat(1300), 1800).verdict).toBe('ok') // 72%
    const short = assessChapterWordCount('x'.repeat(900), 1800)
    expect(short.verdict).toBe('too_short')
    expect(short.ratio).toBeCloseTo(0.5)
    expect(assessChapterWordCount('', 1800).verdict).toBe('too_short')
    // 评审 P3-3：0.7 精确边界与 targetWords=0 守卫
    expect(assessChapterWordCount('x'.repeat(1260), 1800).verdict).toBe('ok') // 恰好 0.7
    expect(assessChapterWordCount('x'.repeat(1259), 1800).verdict).toBe('too_short')
    expect(assessChapterWordCount('abc', 0).verdict).toBe('ok') // target 兜底为 1
    expect(assessChapterWordCount('', 0).verdict).toBe('too_short')
  })

  it('扩写指令：携带目标与当前字数、包裹原稿、要求全文输出', () => {
    const p = buildExpandPrompt('草稿正文', 1800)
    expect(p).toContain('1800 字')
    expect(p).toContain('4 字')
    expect(p).toContain('【草稿开始】\n草稿正文\n【草稿结束】')
    expect(p).toContain('不新增情节转折')
  })

  it('达标时直接返回，不触发 AI 调用', async () => {
    let calls = 0
    const content = 'x'.repeat(2000)
    const r = await applyChapterQualityGate(content, 1800, async () => {
      calls++
      return ''
    })
    expect(calls).toBe(0)
    expect(r.content).toBe(content)
    expect(r.gate.expanded).toBe(false)
    expect(r.gate.verdict).toBe('ok')
  })

  it('欠字数时扩写一次并取更长结果；仍不足则 verdict 保持 too_short', async () => {
    const calls: string[] = []
    const r = await applyChapterQualityGate('x'.repeat(900), 1800, async (prompt) => {
      calls.push(prompt)
      return 'y'.repeat(1750)
    })
    expect(calls).toHaveLength(1)
    expect(r.gate.expanded).toBe(true)
    expect(r.gate.finalWords).toBe(1750)
    expect(r.content).toBe('y'.repeat(1750))
    expect(r.gate.verdict).toBe('ok')

    // 扩写仍不足：保留更长的扩写稿，verdict 如实标记
    const r2 = await applyChapterQualityGate('x'.repeat(900), 3000, async () => 'y'.repeat(1200))
    expect(r2.gate.verdict).toBe('too_short')
    expect(r2.gate.finalWords).toBe(1200)
  })

  it('扩写结果更短时不采纳；AI 抛错 fail-soft 保留原稿', async () => {
    const original = 'x'.repeat(900)
    const shorter = await applyChapterQualityGate(original, 1800, async () => 'y'.repeat(100))
    expect(shorter.content).toBe(original)

    const failed = await applyChapterQualityGate(original, 1800, async () => {
      throw new Error('网络中断')
    })
    expect(failed.content).toBe(original)
    expect(failed.gate.expanded).toBe(true)
    expect(failed.gate.verdict).toBe('too_short')
  })
})
