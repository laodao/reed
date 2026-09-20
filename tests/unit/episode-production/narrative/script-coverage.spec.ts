/**
 * script-coverage 单测（2026-09-21）
 * @module tests/unit/episode-production/narrative/script-coverage
 *
 * 原文对白覆盖度校验（仿 shot-pacing）：
 * - 原文带引号对白全部出现在生成对白里 → 无缺失
 * - 丢整段对白（雪麓山庄"约法三章"实测事故）→ missing 列出原句
 * - 标点/空白差异不影响匹配；长句允许首尾命中（AI 插动作描写的容错）
 */

import { describe, it, expect } from 'vitest'
import {
  extractOriginalDialogues,
  validateScriptCoverage,
  coverageWarnings,
} from '@core/platform/episode-production/narrative/ai/script-coverage'

const ORIGINAL = `掌门放下茶盏："你爹，也是捕快。"
"所以我更得当！"她理直气壮，"我爹当年多威风——铁面追风，四个字传出去，江湖上谁不知道？"
"我知道！"沈云萝抢答，"遇事别逞强，打不过就跑！"`

describe('script-coverage', () => {
  it('extractOriginalDialogues: 提取带引号对白，过滤超短碎片（<4 字）', () => {
    const lines = extractOriginalDialogues(ORIGINAL)
    expect(lines).toContain('你爹，也是捕快。')
    expect(lines).toContain('遇事别逞强，打不过就跑！')
    // "我知道！" 归一化后仅 3 字，低于下限被过滤（防噪声的取舍）
    expect(lines).not.toContain('我知道！')
    expect(lines).toHaveLength(4)
  })

  it('全覆盖 → missing 为空、无 warnings', () => {
    const r = validateScriptCoverage(ORIGINAL, [
      '你爹，也是捕快。',
      '所以我更得当！',
      '我爹当年多威风——铁面追风，四个字传出去，江湖上谁不知道？',
      '遇事别逞强，打不过就跑！',
    ])
    expect(r.total).toBe(4)
    expect(r.covered).toBe(4)
    expect(r.missing).toEqual([])
    expect(coverageWarnings(r)).toEqual([])
  })

  it('丢整段对白（约法三章事故回归）→ missing 列出原句', () => {
    const r = validateScriptCoverage(ORIGINAL, ['你爹，也是捕快。', '所以我更得当！'])
    expect(r.missing).toContain('遇事别逞强，打不过就跑！')
    const w = coverageWarnings(r)
    expect(w.length).toBeGreaterThan(0)
    expect(w[0]).toContain('覆盖度 2/4')
  })

  it('标点与空白差异不影响匹配', () => {
    const r = validateScriptCoverage('他说："打不过就跑！"', ['打不过，就跑'])
    expect(r.missing).toEqual([])
  })

  it('长句允许首尾命中（AI 在中间插动作描写的容错）', () => {
    const r = validateScriptCoverage(
      '她喊道："我爹当年多威风——铁面追风，四个字传出去，江湖上谁不知道？"',
      ['我爹当年多威风铁面追风（她挺起胸膛）四个字传出去，江湖上谁不知道'],
    )
    expect(r.missing).toEqual([])
  })

  it('原文无对白 → total=0、无 warnings', () => {
    const r = validateScriptCoverage('纯叙述，没有对白。', ['anything'])
    expect(r.total).toBe(0)
    expect(coverageWarnings(r)).toEqual([])
  })
})
