/**
 * 6.1 字数统计统一口径：countChapterWords 单测
 */
import { describe, expect, it } from 'vitest'
import { countChapterWords } from '@shared/utils/word-count'

describe('countChapterWords（6.1 统一口径）', () => {
  it('去全部空白字符（含换行/制表/全角空格）', () => {
    // 雨落长街。夜色深了。 = 10 个非空白字符
    expect(countChapterWords('雨落\n 长街。\t　夜色深了。')).toBe(10)
  })

  it('中英混排：英文按词计', () => {
    // 与落库 countWords 同族逻辑时不适用——本口径是字符数：AI 与 agent 各算 2 字符
    expect(countChapterWords('AI agent 巡逻')).toBe('AIagent巡逻'.length)
  })

  it('空/空白文本 → 0', () => {
    expect(countChapterWords('')).toBe(0)
    expect(countChapterWords('  \n\t　')).toBe(0)
  })

  it('Markdown 符号计入（正文原样统计，与质量门一致）', () => {
    expect(countChapterWords('**加粗**')).toBe(6) // **加粗** 去空白后 6 字符
  })
})
