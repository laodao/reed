/**
 * 风格单一来源单测（提示词优化方案 §4.4，Phase 3）
 * @module tests/unit/episode-production/prompts/style-resolver
 *
 * 优化前项目 stylePrompt 有 5 个注入点且互不对账：
 *   资产身份段风格项 / 主图锚点前缀 / 关键帧第 1 段 / 关键帧第 12 段 /
 *   关键帧调用方尾部追加。§4.4 收敛为唯一入口 resolveStyle。
 */

import { describe, it, expect } from 'vitest'
import {
  resolveStyle,
  composeStyledPrompt,
  REFERENCE_MATCH_STYLE_PREFIX,
} from '@core/platform/episode-production/prompts/style-resolver'
import {
  buildPromptContext,
  createDefaultPromptContext,
} from '@core/platform/episode-production/prompts/prompt-context'
import { resolveEraProfile } from '@core/platform/episode-production/prompts/era-profiles'

const PRESET = {
  stylePrefix: 'cinematic, high quality, 8k, professional photography, movie scene',
  qualitySuffix: 'masterpiece, best quality, highly detailed',
  negativePrompt: 'low quality, blurry, distorted',
}

describe('resolveStyle · 主体前缀职责（§4.4）', () => {
  it('无参考图 → 用风格预设前缀', () => {
    const s = resolveStyle({ styleConfig: PRESET })
    expect(s.prefix).toBe(PRESET.stylePrefix)
    expect(s.matchedReference).toBe(false)
  })

  it('有角色参考图 → 让位给"与参考图一致"前缀（防写实词把 Q 版写实化）', () => {
    const s = resolveStyle({ styleConfig: PRESET, hasCharacterReference: true })
    expect(s.prefix).toBe(REFERENCE_MATCH_STYLE_PREFIX)
    expect(s.matchedReference).toBe(true)
  })

  it('资产风格锚点并入前缀（仅在无参考图时——有参考图时风格由参考图决定）', () => {
    const withAnchors = resolveStyle({ styleConfig: PRESET, assetStyleAnchors: ['国风工笔'] })
    expect(withAnchors.prefix).toContain('国风工笔')

    const withRef = resolveStyle({
      styleConfig: PRESET,
      assetStyleAnchors: ['国风工笔'],
      hasCharacterReference: true,
    })
    expect(withRef.prefix).not.toContain('国风工笔')
  })

  it('资产锚点支持 JSON 字符串（binding.styleAnchors 是 text JSON）', () => {
    const s = resolveStyle({ styleConfig: PRESET, assetStyleAnchors: '["水墨","工笔"]' })
    expect(s.prefix).toContain('水墨')
    expect(s.prefix).toContain('工笔')
  })
})

describe('resolveStyle · 项目风格词唯一一份（§4.4 核心）', () => {
  it('无 ctx 时不追加项目风格词', () => {
    expect(resolveStyle({ styleConfig: PRESET }).projectStyle).toBe('')
  })

  it('有 ctx.stylePrompt 时作为独立字段返回（由调用方在末尾追加一次）', () => {
    const s = resolveStyle({
      styleConfig: PRESET,
      ctx: buildPromptContext({ stylePrompt: '国风工笔' }),
    })
    expect(s.projectStyle).toBe('国风工笔')
    // 前缀里不得混入项目风格词（否则就成两处注入了）
    expect(s.prefix).not.toContain('国风工笔')
  })

  it('composeStyledPrompt 里项目风格词只出现一次', () => {
    const s = resolveStyle({
      styleConfig: PRESET,
      ctx: buildPromptContext({ stylePrompt: '国风工笔' }),
    })
    const prompt = composeStyledPrompt(s, '[关键帧时刻] 场景开始。character: 角色甲')
    const hits = prompt.split('国风工笔').length - 1
    expect(hits).toBe(1)
  })

  it('composeStyledPrompt 段序：前缀 → 正文 → 后缀 → 项目风格词', () => {
    const s = resolveStyle({
      styleConfig: PRESET,
      ctx: buildPromptContext({ stylePrompt: '国风工笔' }),
    })
    const prompt = composeStyledPrompt(s, 'BODY')
    expect(prompt.indexOf('cinematic')).toBeLessThan(prompt.indexOf('BODY'))
    expect(prompt.indexOf('BODY')).toBeLessThan(prompt.indexOf('masterpiece'))
    expect(prompt.indexOf('masterpiece')).toBeLessThan(prompt.indexOf('国风工笔'))
  })

  it('空段自动跳过（不产生连续逗号）', () => {
    const s = resolveStyle({ styleConfig: { ...PRESET, qualitySuffix: '' } })
    const prompt = composeStyledPrompt(s, 'BODY')
    expect(prompt).not.toMatch(/,\s*,/)
    expect(prompt.endsWith(',')).toBe(false)
  })
})

describe('resolveStyle · 负面词合并（§4.4）', () => {
  it('无时代档案时只有预设负面词', () => {
    const s = resolveStyle({ styleConfig: PRESET })
    expect(s.negative).toBe(PRESET.negativePrompt)
  })

  it('显式 eraNegativeExtra 优先（调用方可能只有 storyEra 而无完整 ctx）', () => {
    const s = resolveStyle({
      styleConfig: PRESET,
      eraNegativeExtra: resolveEraProfile('ancient_chinese').negativeExtra,
    })
    expect(s.negative).toContain(PRESET.negativePrompt)
    expect(s.negative).toContain('power lines')
    expect(s.negative).toContain('electricity')
  })

  it('无显式值时从 ctx.eraProfile 取', () => {
    const s = resolveStyle({
      styleConfig: PRESET,
      ctx: buildPromptContext({ storyEra: '古代中国' }),
    })
    expect(s.negative).toContain('power lines')
  })

  it('重复调用不产生重复负面词（幂等）', () => {
    const extra = resolveEraProfile('ancient_chinese').negativeExtra
    const a = resolveStyle({ styleConfig: PRESET, eraNegativeExtra: extra })
    const b = resolveStyle({ styleConfig: PRESET, eraNegativeExtra: extra })
    expect(a.negative).toBe(b.negative)
  })

  it('generic 时代不追加负向词', () => {
    const s = resolveStyle({ styleConfig: PRESET, ctx: createDefaultPromptContext() })
    expect(s.negative).toBe(PRESET.negativePrompt)
  })
})

describe('resolveStyle · 与关键帧 builder 的集成（§4.4 消除尾部重复注入）', () => {
  it('关键帧 prompt 里项目风格词恰好出现一次', async () => {
    const { buildKeyframePrompt } = await import(
      '@core/platform/episode-production/render/keyframe/keyframe-prompt-builder'
    )
    const ctx = buildPromptContext({ stylePrompt: '国风工笔' })
    const out = buildKeyframePrompt({
      shotType: 'full',
      cameraAngle: 'eye_level',
      frameDescription: '【场景】船舱。【人物】角色甲着素白衣裙。【动作】转身。【氛围】冷。',
      sceneDescription: '船舱',
      characters: [],
      location: null,
      items: [],
      frameRole: 'start',
      timePercent: 0,
      styleConfig: PRESET,
      promptContext: ctx,
    } as never)

    expect(out.prompt.split('国风工笔').length - 1).toBe(1)
  })

  it('无 promptContext 时不注入项目风格词（行为等价优化前）', async () => {
    const { buildKeyframePrompt } = await import(
      '@core/platform/episode-production/render/keyframe/keyframe-prompt-builder'
    )
    const out = buildKeyframePrompt({
      shotType: 'full',
      cameraAngle: 'eye_level',
      frameDescription: '【场景】船舱。【人物】角色甲。【动作】转身。【氛围】冷。',
      sceneDescription: '船舱',
      characters: [],
      location: null,
      items: [],
      frameRole: 'start',
      timePercent: 0,
      styleConfig: PRESET,
    } as never)
    expect(out.prompt).toContain(PRESET.stylePrefix)
    expect(out.prompt).toContain(PRESET.qualitySuffix)
  })
})