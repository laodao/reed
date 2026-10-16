/**
 * 章节设计卡纯函数单测（54 号章法：先设计→自检→确认→后写正文）
 * 覆盖：markdown 构建与钩型解析往返、结构校验（缺钩子/爽点/卡点/出场角色打回）。
 */
import { describe, it, expect } from 'vitest'
import {
  buildChapterCardMarkdown,
  parseCardHookType,
  validateChapterCard,
  type ChapterCardData,
} from '@core/platform/services/longwriting/chapter-card'

const validCard: ChapterCardData = {
  plotSummary: '苏九龄借抬尸验伤之机重勘火场，从西北角烟渍的放射状分布反推凶手为左利手；秦铁锁带家丁上门威胁，她当众指出其袖口火药灰与鞋底黑胶泥，逼得对方连退半步；乔镜知权衡后被迫让步，允许她以顾问身份参与勘验，并留下一句意味深长的警告。',
  openingHook: '焦尸的指甲缝里，藏着一粒不属于仓库的朱砂。',
  highlight: '当众用三句物证把秦铁锁逼得连退半步，围观脚夫第一次对"女犯"露出敬畏。',
  endingCliffhanger: '她回到家，门缝下塞着一枚熟悉的勘验令铜牌——可她的那枚，明明贴身收着。',
  hookType: '悬念',
  involvedCharacters: [{ name: '苏九龄', roleThisChapter: '重勘现场，建立"现场被改过"的结论' }],
  involvedLocations: ['水门仓库'],
  involvedItems: ['勘验令铜牌'],
  foreshadowAction: '埋"第二枚铜牌"伏笔',
}

describe('buildChapterCardMarkdown / parseCardHookType', () => {
  it('构建含固定标记行的卡片，钩型可往返解析', () => {
    const md = buildChapterCardMarkdown(validCard, '第2章 被改过的现场')
    expect(md).toContain('## 本章设计卡（第2章 被改过的现场）')
    expect(md).toContain('【本章概要】')
    expect(md).toContain('【开场钩子】')
    expect(md).toContain('【本章爽点】')
    expect(md).toContain('【章尾卡点】')
    expect(md).toContain('（钩型：悬念）')
    expect(md).toContain('- 苏九龄：重勘现场')
    expect(md).toContain('【出场地点】水门仓库')
    expect(md).toContain('【伏笔动作】埋"第二枚铜牌"伏笔')
    expect(parseCardHookType(md)).toBe('悬念')
  })

  it('无标题/空集合时 markdown 仍完整；解析空内容返回 null', () => {
    const md = buildChapterCardMarkdown({ ...validCard, involvedLocations: [], involvedItems: [], foreshadowAction: '' })
    expect(md).toContain('【出场地点】（无）')
    expect(md).toContain('【出场物品】（无）')
    expect(md).toContain('【伏笔动作】无')
    expect(parseCardHookType('')).toBeNull()
    expect(parseCardHookType(null)).toBeNull()
    // 邻章钩型轮换检查的数据源：两张卡钩型不同 → 解析结果不同
    const md2 = buildChapterCardMarkdown({ ...validCard, hookType: '反转' })
    expect(parseCardHookType(md2)).toBe('反转')
  })
})

describe('validateChapterCard（结构硬伤打回）', () => {
  it('合格卡片无问题', () => {
    expect(validateChapterCard(validCard)).toHaveLength(0)
  })

  it('缺钩子/爽点/卡点/出场角色、钩型非法、概要过短 → 逐条报出', () => {
    const issues = validateChapterCard({
      plotSummary: '太短',
      openingHook: '',
      highlight: '',
      endingCliffhanger: '',
      hookType: '震惊' as any,
      involvedCharacters: [],
      involvedLocations: [],
      involvedItems: [],
      foreshadowAction: '无',
    })
    expect(issues.join('；')).toContain('本章概要过短')
    expect(issues.join('；')).toContain('开场钩子')
    expect(issues.join('；')).toContain('爽点')
    expect(issues.join('；')).toContain('章尾卡点')
    expect(issues.join('；')).toContain('钩型')
    expect(issues.join('；')).toContain('出场角色')
  })

  it('空卡片/undefined → 直接判空', () => {
    expect(validateChapterCard(null).length).toBeGreaterThan(0)
  })
})
