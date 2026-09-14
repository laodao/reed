import { describe, expect, it } from 'vitest'
import {
  buildNovelChapterDiscipline,
  buildScriptChapterDiscipline,
  buildScriptGenerationDiscipline,
  buildScriptOutlineSystemPrompt,
  detectScriptSummary,
  enrichScriptEpisodeSummary,
  resolveContentTarget,
} from '@core/platform/services/writing-methodology'

describe('writing-methodology（49 号写作方法论模块）', () => {
  it('分集大纲提示词：含硬配额纪律与集数插值（中点/卡点集）', () => {
    const p = buildScriptOutlineSystemPrompt(10)
    expect(p).toContain('10 集')
    expect(p).toContain('第 5 集') // 中点公开反击
    expect(p).toContain('第 8 集') // 卡点集 = n-2
    expect(p).toContain('切在问题上，不切在答案上')
    expect(p).toContain('hookType')
    expect(p).toContain('相邻两集不得同型')
    expect(p).toContain('打脸四步')
    // 边界：小集数锚点不越界（评审 P3-2）
    const p3 = buildScriptOutlineSystemPrompt(3)
    expect(p3).toContain('第 3 集')
    expect(p3).not.toContain('第 4 集')
  })

  it('分集 summary 富化：结构化后缀齐全，空字段不产生空标记', () => {
    const enriched = enrichScriptEpisodeSummary('本集梗概', {
      hook: '开场即冲突',
      highlight: '当众打脸',
      cliffhanger: '幕后黑手现身',
      hookType: '反转',
    })
    expect(enriched).toBe('本集梗概\n【开场钩子】开场即冲突\n【本集爽点】当众打脸\n【集尾卡点】幕后黑手现身（反转钩）')
    const minimal = enrichScriptEpisodeSummary('只有梗概', {})
    expect(minimal).toBe('只有梗概')
    expect(minimal).not.toContain('【开场钩子】')
    // 评审 P2-2：非字符串字段容错，不炸整次大纲
    const bad = enrichScriptEpisodeSummary('梗概', { hook: 123 as unknown as string, cliffhanger: { a: 1 } as unknown as string })
    expect(bad).toBe('梗概')
  })

  it('detectScriptSummary/resolveContentTarget：显式>项目状态>summary 探测>novel', () => {
    const enriched = enrichScriptEpisodeSummary('梗概', { hook: 'h', cliffhanger: 'c' })
    expect(detectScriptSummary(enriched)).toBe(true)
    expect(detectScriptSummary('普通章节概要')).toBe(false)
    expect(detectScriptSummary(null)).toBe(false)

    expect(resolveContentTarget('script', 'novel', '普通')).toBe('script')
    expect(resolveContentTarget(undefined, 'script', undefined)).toBe('script')
    expect(resolveContentTarget(undefined, null, enriched)).toBe('script')
    expect(resolveContentTarget(undefined, null, '普通概要')).toBe('novel')
    expect(resolveContentTarget('novel', 'script', enriched)).toBe('novel')
  })

  it('script 章节纪律：四拍引擎+大纲落实+下一集去向卡', () => {
    const d = buildScriptChapterDiscipline({ name: '第6集', summary: '赝品阴谋浮出水面' })
    expect(d).toContain('单集四拍引擎')
    expect(d).toContain('切在问题上，不切在答案上')
    expect(d).toContain('【开场钩子】【本集爽点】【集尾卡点】必须如实落地')
    expect(d).toContain('下一集「第6集」')
    expect(d).toContain('赝品阴谋浮出水面')
    // 无下一集时不产生去向卡空壳
    const dNoNext = buildScriptChapterDiscipline(null)
    expect(dNoNext).not.toContain('下一集去向')
  })

  it('novel 章节纪律：钩子纪律；前三章追加黄金三章任务', () => {
    const base = buildNovelChapterDiscipline(5)
    expect(base).toContain('解扣同时系新扣')
    expect(base).not.toContain('黄金三章')
    const golden = buildNovelChapterDiscipline(2)
    expect(golden).toContain('黄金三章')
    expect(golden).toContain('第 2 章')
  })

  it('EP 剧本改编纪律：黄金三秒/台词短句/卡点落地/外貌锚定', () => {
    const d = buildScriptGenerationDiscipline()
    expect(d).toContain('黄金三秒')
    expect(d).toContain('每句≤20字')
    expect(d).toContain('切在问题上，不切在答案上')
    expect(d).toContain('外貌锚定')
  })
})
