/**
 * story-text-generator 提示词拼接单测
 * @module tests/unit/episode-production/narrative/story-text-generator
 *
 * 不打 AI 接口（依赖外部 provider），只验证 buildStoryTextUserPrompt 的拼接逻辑
 * 与系统提示词常量的基本形态。
 */

import { describe, it, expect } from 'vitest'
import { __test } from '@core/platform/episode-production/narrative/ai/story-text-generator'
import {
  buildPromptContext,
  createDefaultPromptContext,
} from '@core/platform/episode-production/prompts/prompt-context'

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

// ==================== §3.3 注入专项（2026-10-06） ====================

describe('§3.3 对白引号契约（下游保真校验的前提显式化）', () => {
  it('声明"人物对白必须使用引号标出"', () => {
    expect(__test.buildStoryTextSystemPrompt()).toContain('人物对白必须使用引号标出')
  })

  it('说明下游用途：改编为剧本、对白可被逐句提取与校验', () => {
    const s = __test.buildStoryTextSystemPrompt()
    expect(s).toContain('改编为剧本')
    expect(s).toContain('逐句提取')
    expect(s).toContain('保真校验')
  })

  it('向后兼容常量已含该契约', () => {
    expect(__test.STORY_TEXT_SYSTEM_PROMPT).toContain('人物对白必须使用引号标出')
  })
})

describe('§3.3 体裁叙事要求注入', () => {
  it('短剧体裁注入短剧叙事要求', () => {
    const s = __test.buildStoryTextSystemPrompt(
      buildPromptContext({ genre: 'short_drama' }),
    )
    expect(s).toContain('体裁要求（竖屏短剧）')
    expect(s).toContain('强冲突')
  })

  it('电影体裁注入自己的要求，不含短剧话术', () => {
    const s = __test.buildStoryTextSystemPrompt(buildPromptContext({ genre: 'film' }))
    expect(s).toContain('体裁要求（电影）')
    expect(s).not.toContain('强冲突')
    expect(s).not.toContain('短剧')
  })

  it('custom 体裁（无叙事要求）不注入体裁行', () => {
    const s = __test.buildStoryTextSystemPrompt(buildPromptContext({ genre: 'custom' }))
    expect(s).not.toContain('体裁要求（')
  })

  it('无上下文时沿用默认（短剧）体裁', () => {
    const s = __test.buildStoryTextSystemPrompt(createDefaultPromptContext())
    expect(s).toContain('体裁要求（竖屏短剧）')
  })
})

describe('§3.3 篇幅按目标集长推算', () => {
  it('未配置目标集长 → 历史区间 800–3000', () => {
    expect(__test.resolveStoryCharsRange(undefined)).toEqual({ min: 800, max: 3000 })
    expect(__test.buildStoryTextSystemPrompt(createDefaultPromptContext())).toContain('800–3000 字')
  })

  it('目标集长越大篇幅越大（单调不减，含极端值）', () => {
    const seq = [60, 200, 400, 600, 3600].map((s) => __test.resolveStoryCharsRange(s))
    for (let i = 1; i < seq.length; i++) {
      expect(seq[i].min).toBeGreaterThanOrEqual(seq[i - 1].min)
      expect(seq[i].max).toBeGreaterThanOrEqual(seq[i - 1].max)
    }
    // 长集不得给出比短集更短的篇幅建议（逐端 clamp 而非整段回退）
    const short = __test.resolveStoryCharsRange(200)
    const long = __test.resolveStoryCharsRange(3600)
    expect(long.min).toBeGreaterThanOrEqual(short.min)
    expect(long.max).toBeGreaterThanOrEqual(short.max)
  })

  it('结果恒收敛在硬上下限内且区间有效', () => {
    for (const sec of [10, 30, 120, 300, 600, 3600]) {
      const r = __test.resolveStoryCharsRange(sec)
      expect(r.min).toBeGreaterThanOrEqual(800)
      expect(r.max).toBeLessThanOrEqual(3000)
      expect(r.min).toBeLessThan(r.max)
    }
  })

  it('配置后提示词不再出现写死的 800–3000', () => {
    const s = __test.buildStoryTextSystemPrompt(
      buildPromptContext({ targetEpisodeDurationSec: 300 }),
    )
    expect(s).not.toContain('800–3000 字')
    expect(s).toMatch(/\d+–\d+ 字/)
  })

  it('非法目标集长回落历史区间', () => {
    for (const bad of [0, -5, NaN]) {
      const r = __test.resolveStoryCharsRange(bad as number)
      expect(r).toEqual({ min: 800, max: 3000 })
    }
  })
})
