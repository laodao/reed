import { describe, it, expect } from 'vitest'
import { locateAll, locateNth, locateExcerpt, normalizeRescue, paragraphAt } from '@shared/utils/text-locate'

// 段落结构仿真实章节：空行分段的非空块
const CONTENT = [
  '第一渡之后，雾没有把那只案匣送回来。',
  '',
  '陈舟起初还会在收篙时往雾里看一眼。后来不看，案匣像一粒石沉进忘川。',
  '',
  '  案上，引渡名册又添了新页。案匣二字墨迹沉沉。',
  '',
  '那副枷没有扣，木边被衣带和水汽磨得发亮。',
].join('\n')

describe('paragraphAt', () => {
  it('返回 offset 所在的 1-based 非空段落号', () => {
    expect(paragraphAt(CONTENT, 0)).toBe(1)
    // 第 3 段起点（前两段 + 空行之后）
    const p3 = CONTENT.indexOf('陈舟起初')
    expect(paragraphAt(CONTENT, p3)).toBe(2)
    const p5 = CONTENT.indexOf('案上，引渡名册')
    expect(paragraphAt(CONTENT, p5)).toBe(3)
  })

  it('段前空白不影响段落号（第 3 段以空格缩进）', () => {
    const p5 = CONTENT.indexOf('案上')
    expect(paragraphAt(CONTENT, p5)).toBe(3)
  })

  it('offset 越界收敛到末段；空串返回 1', () => {
    expect(paragraphAt(CONTENT, CONTENT.length + 100)).toBe(4)
    expect(paragraphAt('', 0)).toBe(1)
  })
})

describe('locateAll', () => {
  it('返回全部命中并附段落号（「案匣」出现在 1/2/3 段）', () => {
    const locs = locateAll(CONTENT, '案匣')
    expect(locs).toHaveLength(3)
    expect(locs.map((l) => l.paragraph)).toEqual([1, 2, 3])
    // 偏移闭环：按 start 切原文应恰为 query
    for (const l of locs) expect(CONTENT.slice(l.start, l.end)).toBe('案匣')
  })

  it('cap 截断命中数', () => {
    expect(locateAll(CONTENT, '案匣', { cap: 2 })).toHaveLength(2)
    expect(locateAll(CONTENT, '案匣', { cap: 0 })).toHaveLength(1)
  })

  it('无命中/空参返回空数组', () => {
    expect(locateAll(CONTENT, '不存在的词')).toEqual([])
    expect(locateAll('', '案匣')).toEqual([])
    expect(locateAll(CONTENT, '')).toEqual([])
  })
})

describe('locateNth', () => {
  it('取第 nth 处命中', () => {
    const second = locateNth(CONTENT, '案匣', 2)
    expect(second?.paragraph).toBe(2)
    expect(CONTENT.slice(second!.start, second!.end)).toBe('案匣')
  })

  it('超出命中数返回 null；非法 nth 返回 null', () => {
    expect(locateNth(CONTENT, '案匣', 4)).toBeNull()
    expect(locateNth(CONTENT, '案匣', 0)).toBeNull()
  })
})

describe('normalizeRescue', () => {
  const SRC = '阿蘅在周贵老宅里说的那句「方子动过」，至此被崔九当堂坐实。'

  it('引号样式漂移可救援（「」 vs “”）', () => {
    const loc = normalizeRescue(SRC, '那句“方子动过”，')
    expect(loc).not.toBeNull()
    // 返回原串偏移：切出来的是原文（含原引号）
    expect(SRC.slice(loc!.start, loc!.end)).toBe('那句「方子动过」，')
  })

  it('空白漂移可救援（摘录多了换行/空格）', () => {
    const loc = normalizeRescue(SRC, '至 此 被 崔九\n当堂坐实')
    expect(loc).not.toBeNull()
    expect(SRC.slice(loc!.start, loc!.end)).toBe('至此被崔九当堂坐实')
  })

  it('真不匹配返回 null；空 query 返回 null', () => {
    expect(normalizeRescue(SRC, '完全别的内容')).toBeNull()
    expect(normalizeRescue(SRC, '「」')).toBeNull()
    expect(normalizeRescue(SRC, '')).toBeNull()
  })

  it('支持 nth：同名锚点取第几处', () => {
    const DUP = '案匣仍封。前页写着案匣二字。'
    expect(normalizeRescue(DUP, '案匣', 1)?.start).toBe(0)
    expect(normalizeRescue(DUP, '案匣', 2)?.start).toBe(DUP.indexOf('案匣', 1))
    expect(normalizeRescue(DUP, '案匣', 3)).toBeNull()
  })
})

describe('locateExcerpt', () => {
  it('优先精确匹配', () => {
    const loc = locateExcerpt(CONTENT, '木边被衣带和水汽磨得发亮')
    expect(loc?.paragraph).toBe(4)
  })

  it('精确失败自动走归一化救援', () => {
    const loc = locateExcerpt(CONTENT, '木边被衣带和水汽 磨得发亮。')
    expect(loc).not.toBeNull()
    expect(CONTENT.slice(loc!.start, loc!.end)).toBe('木边被衣带和水汽磨得发亮。')
  })

  it('两路皆空返回 null', () => {
    expect(locateExcerpt(CONTENT, '不存在')).toBeNull()
  })
})
