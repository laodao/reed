/**
 * 章节工作台纯函数单测（38 号 LW-9a）
 * @module tests/unit/core/platform/services/longwriting/chapter-context.spec
 */

import { describe, expect, it } from 'vitest'
import {
  composeChapterPrompt,
  estimateContextTokens,
  type ChapterContextItem,
  type ChapterPromptParts,
} from '@core/platform/services/longwriting/chapter-context'

function mkParts(): ChapterPromptParts {
  const char = (id: string, name: string): ChapterContextItem => ({
    id: `character:${id}`,
    sectionKey: 'character',
    title: `角色：${name}`,
    text: `【${name}】人物完整设定文本`,
    tokens: 100,
    defaultChecked: true,
  })
  return {
    overviewText: '【宏观】标题/类型/冲突/进度',
    backgroundText: '【世界观】蚁路航运网络与萤火事变',
    taskText: '【任务】3.1 码头夜话',
    characterItems: [char('c1', '林锋'), char('c2', '陈雪')],
    locationItems: [
      { id: 'location:l1', sectionKey: 'location', title: '地点：码头仓库', text: '【码头仓库】环境设定', tokens: 80, defaultChecked: true },
    ],
    prevEndingText: '【前文】上一章结尾原文',
    constraintsText: '【约束】记忆/状态摘要',
    prewriteContent: '预写提纲内容',
    graphSection: '图谱关系边与事件',
    recallSection: '回忆场景提示',
    styleText: '以「悬疑」风格写作',
    extraText: '附加要求文本',
  }
}

describe('estimateContextTokens', () => {
  it('UTF-8 字节/4 口径（中文≈1.3 字/token 粗估）', () => {
    expect(estimateContextTokens('')).toBe(0)
    const t = 'abcd'.repeat(100) // 400 字节
    expect(estimateContextTokens(t)).toBe(100)
    expect(estimateContextTokens('中文中文中文中文中文中文中文')).toBeGreaterThan(0)
  })
})

describe('composeChapterPrompt（38 号：勾选重组）', () => {
  it('全启用：分区齐全，角色/地点/图谱全部注入', () => {
    const parts = mkParts()
    const p = composeChapterPrompt(parts, () => true, { targetWords: 3000 })
    expect(p).toContain('【宏观】')
    expect(p).toContain('【林锋】')
    expect(p).toContain('【陈雪】')
    expect(p).toContain('【码头仓库】')
    expect(p).toContain('【前文】')
    expect(p).toContain('图谱关系边与事件')
    expect(p).toContain('预写提纲内容')
    expect(p).toContain('3000字')
  })

  it('禁用单个角色：仅该角色被剔除，其余保留', () => {
    const parts = mkParts()
    const p = composeChapterPrompt(parts, (id) => id !== 'character:c1', { targetWords: 3000 })
    expect(p).not.toContain('【林锋】')
    expect(p).toContain('【陈雪】')
  })

  it('禁用单条目分区（宏观/图谱）：整段回退占位', () => {
    const parts = mkParts()
    const p = composeChapterPrompt(parts, (id) => id !== 'overview' && id !== 'graph', { targetWords: 3000 })
    expect(p).toContain('故事宏观背景已由用户禁用')
    expect(p).not.toContain('【宏观】')
    expect(p).toContain('暂无图谱数据')
    expect(p).not.toContain('图谱关系边与事件')
  })

  it('全部角色禁用：分区回退占位文案（对应原 fallback 语义）', () => {
    const parts = mkParts()
    const p = composeChapterPrompt(parts, (id) => !id.startsWith('character:'), { targetWords: 3000 })
    expect(p).toContain('无特定涉及角色')
  })

  it('禁用预写提纲：七节不出现预写内容', () => {
    const parts = mkParts()
    const p = composeChapterPrompt(parts, (id) => id !== 'prewrite', { targetWords: 3000 })
    expect(p).not.toContain('预写提纲内容')
  })
})

describe('42号 review：background 独立门控（死开关回归）', () => {
  it('启用 background → 世界观原文入 prompt；禁用 → 占位文案且原文不出现', () => {
    const parts = mkParts()
    const on = composeChapterPrompt(parts, () => true, { targetWords: 3000 })
    expect(on).toContain('【世界观】蚁路航运网络与萤火事变')
    expect(on).not.toContain('世界观设定已由用户禁用')
    const off = composeChapterPrompt(parts, (id) => id !== 'background', { targetWords: 3000 })
    expect(off).toContain('世界观设定已由用户禁用')
    expect(off).not.toContain('【世界观】蚁路航运网络与萤火事变')
    // overview 独立禁用不再连带背景（互不内嵌）
    const offOverview = composeChapterPrompt(parts, (id) => id !== 'overview', { targetWords: 3000 })
    expect(offOverview).toContain('【世界观】蚁路航运网络与萤火事变')
  })
})
