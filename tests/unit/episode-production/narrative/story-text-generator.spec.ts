/**
 * story-text-generator 提示词拼接单测
 * @module tests/unit/episode-production/narrative/story-text-generator
 *
 * 不打 AI 接口（依赖外部 provider），只验证 buildStoryTextUserPrompt 的拼接逻辑
 * 与系统提示词常量的基本形态。
 */

import { describe, it, expect } from 'vitest'
import { __test } from '@core/platform/episode-production/narrative/ai/story-text-generator'

describe('story-text-generator buildStoryTextUserPrompt', () => {
  it('只有 prompt 时：不含【故事背景】段，仅【创作要求】', () => {
    const out = __test.buildStoryTextUserPrompt({ prompt: '写一个复仇故事' })
    expect(out).not.toContain('【故事背景】')
    expect(out).toContain('【创作要求】')
    expect(out).toContain('写一个复仇故事')
  })

  it('含全部背景字段时：输出【故事背景】段并包含三字段', () => {
    const out = __test.buildStoryTextUserPrompt({
      prompt: '茶馆开场',
      storyEra: '民国初年',
      storyRegion: '江南水乡',
      storyBackgroundExtra: '军阀混战',
    })
    expect(out).toContain('【故事背景】')
    expect(out).toContain('年代：民国初年')
    expect(out).toContain('地域：江南水乡')
    expect(out).toContain('其他：军阀混战')
    expect(out).toContain('【创作要求】')
    expect(out).toContain('茶馆开场')
  })

  it('部分背景字段：仅含提供的字段，不出现未提供的字段', () => {
    const out = __test.buildStoryTextUserPrompt({
      prompt: 'p',
      storyEra: '唐代',
    })
    expect(out).toContain('年代：唐代')
    expect(out).not.toContain('地域')
    expect(out).not.toContain('其他')
  })

  it('背景字段为空白字符串：trim 后视为空，不输出【故事背景】段', () => {
    const out = __test.buildStoryTextUserPrompt({
      prompt: 'p',
      storyEra: '   ',
      storyRegion: '',
      storyBackgroundExtra: '   \t  ',
    })
    expect(out).not.toContain('【故事背景】')
    expect(out).toContain('【创作要求】')
  })

  it('prompt 被 trim：首尾空白被去除', () => {
    const out = __test.buildStoryTextUserPrompt({ prompt: '  带空格的提示  ' })
    expect(out).toContain('【创作要求】\n带空格的提示')
    // 不应保留 trim 前的尾部空白
    expect(out).not.toMatch(/带空格的提示\s+\n/)
  })

  it('背景段与创作要求段之间以空行分隔', () => {
    const out = __test.buildStoryTextUserPrompt({
      prompt: 'p',
      storyEra: '民国',
    })
    expect(out).toContain('年代：民国\n\n【创作要求】')
  })
})

describe('story-text-generator STORY_TEXT_SYSTEM_PROMPT', () => {
  it('为非空字符串', () => {
    expect(typeof __test.STORY_TEXT_SYSTEM_PROMPT).toBe('string')
    expect(__test.STORY_TEXT_SYSTEM_PROMPT.length).toBeGreaterThan(0)
  })

  it('定位小说家角色、要求小说体裁、纯文本、字数区间', () => {
    const s = __test.STORY_TEXT_SYSTEM_PROMPT
    expect(s).toContain('小说')
    expect(s).toContain('纯文本')
    // 800–3000 字区间
    expect(s).toContain('800')
    expect(s).toContain('3000')
  })
})
