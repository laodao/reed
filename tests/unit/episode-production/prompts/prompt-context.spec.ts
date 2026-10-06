/**
 * PromptContext / 体裁档案 / 时代档案单测（提示词优化方案 §2.1/§2.2/§2.5）
 * @module tests/unit/episode-production/prompts/prompt-context
 */

import { describe, it, expect } from 'vitest'
import {
  buildPromptContext,
  createDefaultPromptContext,
  resolveSpeechCharsPerSec,
  renderStoryBackgroundBlock,
  renderStoryStyleBlock,
  renderTargetDurationGuidance,
  DEFAULT_LANGUAGE,
} from '@core/platform/episode-production/prompts/prompt-context'
import {
  getGenreProfile,
  isGenreKey,
  listGenreKeys,
  renderGenreDiscipline,
  renderPacingDensity,
  DEFAULT_GENRE,
} from '@core/platform/episode-production/prompts/genre-profiles'
import {
  resolveEraProfile,
  matchesEraTrigger,
  renderEraAnchor,
  eraConstraintOf,
  DEFAULT_ERA_PROFILE_KEY,
} from '@core/platform/episode-production/prompts/era-profiles'

describe('buildPromptContext · 缺省行为等价于优化前', () => {
  const ctx = createDefaultPromptContext()

  it('空输入不注入任何业务变量', () => {
    expect(ctx.storyEra).toBeUndefined()
    expect(ctx.storyRegion).toBeUndefined()
    expect(ctx.storyExtra).toBeUndefined()
    expect(ctx.stylePrompt).toBeUndefined()
    expect(ctx.aspectRatio).toBeUndefined()
    expect(ctx.targetEpisodeDurationSec).toBeUndefined()
  })

  it('缺省体裁/语言/时代档案有确定兜底', () => {
    expect(ctx.genre.key).toBe(DEFAULT_GENRE)
    expect(ctx.language).toBe(DEFAULT_LANGUAGE)
    expect(ctx.eraProfile.key).toBe(DEFAULT_ERA_PROFILE_KEY)
    expect(ctx.speechCharsPerSec).toBe(4.5)
  })

  it('空白字符串视同未配置（不注入空段）', () => {
    const c = buildPromptContext({ storyEra: '   ', stylePrompt: '', aspectRatio: '\t' })
    expect(c.storyEra).toBeUndefined()
    expect(c.stylePrompt).toBeUndefined()
    expect(c.aspectRatio).toBeUndefined()
  })
})

describe('buildPromptContext · 字段解析', () => {
  it('语速：显式配置 > 语言表 > 兜底', () => {
    expect(resolveSpeechCharsPerSec(6, 'zh')).toBe(6)
    expect(resolveSpeechCharsPerSec(null, 'zh')).toBe(4.5)
    expect(resolveSpeechCharsPerSec(null, 'en')).toBe(15)
    expect(resolveSpeechCharsPerSec(null, 'xx')).toBe(4.5)
    expect(resolveSpeechCharsPerSec(0, 'zh')).toBe(4.5)
    expect(resolveSpeechCharsPerSec(-1, 'zh')).toBe(4.5)
  })

  it('stylePrompt 缺省时回退 styleAnchors 拼接', () => {
    expect(buildPromptContext({ styleAnchors: ['国风工笔', '水墨'] }).stylePrompt).toBe('国风工笔 / 水墨')
    expect(buildPromptContext({ styleAnchors: [] }).stylePrompt).toBeUndefined()
    // 显式 stylePrompt 优先
    expect(
      buildPromptContext({ stylePrompt: '写实', styleAnchors: ['国风'] }).stylePrompt,
    ).toBe('写实')
  })

  it('目标集长/片段预算只接受正数', () => {
    expect(buildPromptContext({ targetEpisodeDurationSec: 90 }).targetEpisodeDurationSec).toBe(90)
    expect(buildPromptContext({ targetEpisodeDurationSec: 0 }).targetEpisodeDurationSec).toBeUndefined()
    expect(buildPromptContext({ targetEpisodeDurationSec: NaN }).targetEpisodeDurationSec).toBeUndefined()
  })

  it('非法体裁键回落默认体裁', () => {
    expect(buildPromptContext({ genre: 'bogus' }).genre.key).toBe(DEFAULT_GENRE)
    expect(buildPromptContext({ genre: 'film' }).genre.key).toBe('film')
  })
})

describe('上下文渲染段', () => {
  it('故事背景段：字段齐则三行，全空则整段省略', () => {
    const full = buildPromptContext({ storyEra: '唐代', storyRegion: '长安', storyExtra: '架空' })
    const block = renderStoryBackgroundBlock(full)
    expect(block).toContain('年代：唐代')
    expect(block).toContain('地域：长安')
    expect(block).toContain('其他：架空')
    expect(renderStoryBackgroundBlock(createDefaultPromptContext())).toBe('')
  })

  it('故事背景与风格段（cogen）：含风格/画幅/目标时长', () => {
    const ctx = buildPromptContext({
      storyEra: '现代都市',
      stylePrompt: '电影感写实',
      aspectRatio: '9:16',
      targetEpisodeDurationSec: 120,
    })
    const block = renderStoryStyleBlock(ctx)
    expect(block).toContain('故事年代：现代都市')
    expect(block).toContain('画面风格：电影感感写实'.replace('感感', '感'))
    expect(block).toContain('画面比例：9:16')
    expect(block).toContain('约 120 秒')
  })

  it('篇幅目标：未配置目标集长时不注入', () => {
    expect(renderTargetDurationGuidance(createDefaultPromptContext())).toBe('')
    const g = renderTargetDurationGuidance(buildPromptContext({ targetEpisodeDurationSec: 120 }))
    expect(g).toContain('120 秒')
    expect(g).toMatch(/\d+-\d+ 个场景/)
  })
})

describe('体裁档案注册表', () => {
  it('短剧纪律只挂 short_drama，不再无条件注入', () => {
    // 全库只允许一个定义点：非短剧体裁不得出现短剧话术
    for (const key of listGenreKeys()) {
      const profile = getGenreProfile(key)
      if (key === 'short_drama') continue
      expect(profile.adaptationDiscipline).not.toContain('黄金三秒')
      expect(profile.adaptationDiscipline).not.toContain('爽点')
      expect(profile.adaptationDiscipline).not.toContain('卡点')
      expect(profile.pacingRhetoric).not.toContain('短剧')
    }
  })

  it('短剧档案保留原有 6 条纪律语义', () => {
    const d = getGenreProfile('short_drama').adaptationDiscipline
    expect(d).toContain('黄金三秒')
    expect(d).toContain('每句≤20字')
    expect(d).toContain('卡点')
    expect(d).toContain('爽点')
    expect(d.split('\n- ').length).toBeGreaterThanOrEqual(6)
  })

  it('内置 5 个体裁键，custom 无纪律', () => {
    expect(listGenreKeys().sort()).toEqual(['animation', 'custom', 'film', 'series', 'short_drama'])
    expect(getGenreProfile('custom').adaptationDiscipline).toBe('')
    expect(getGenreProfile('custom').pacingPreference).toBeNull()
  })

  it('isGenreKey 只认内置键', () => {
    expect(isGenreKey('short_drama')).toBe(true)
    expect(isGenreKey('bogus')).toBe(false)
    expect(isGenreKey(null)).toBe(false)
  })

  it('custom 可通过 overrides 覆写片段', () => {
    const p = getGenreProfile('custom', { adaptationDiscipline: '- 自定义纪律' })
    expect(p.adaptationDiscipline).toBe('- 自定义纪律')
    expect(p.key).toBe('custom')
  })

  it('体裁纪律段渲染含体裁名标题；空纪律返回空串', () => {
    expect(renderGenreDiscipline(getGenreProfile('short_drama'))).toContain('竖屏短剧')
    expect(renderGenreDiscipline(getGenreProfile('custom'))).toBe('')
  })

  it('节奏密度段按体裁数值与片段预算换算', () => {
    const short = renderPacingDensity(getGenreProfile('short_drama'), 15)
    expect(short).toContain('单镜头 1-1.5s')
    expect(short).toContain('15s 片段 8-12 镜')
    expect(short).toContain('每 2 秒 1 镜是短剧留存底线')

    const film = renderPacingDensity(getGenreProfile('film'), 15)
    expect(film).toContain('单镜头 2-3s')
    expect(film).not.toContain('短剧')
    expect(film).toContain('平均时长不得超过 6s')

    // custom 无节奏偏好 → 不注入
    expect(renderPacingDensity(getGenreProfile('custom'))).toBe('')
  })
})

describe('时代档案注册表（§2.5 替代朝代正则）', () => {
  it('"汉"不再误伤"武汉"（历史正则的真实缺陷）', () => {
    expect(matchesEraTrigger('武汉', '汉')).toBe(false)
    expect(matchesEraTrigger('唐代长安', '唐')).toBe(true)
    expect(matchesEraTrigger('汉代', '汉')).toBe(true)
    expect(matchesEraTrigger('唐', '唐')).toBe(true)
    expect(matchesEraTrigger('唐突', '唐')).toBe(false)
  })

  it('storyEra 文本推断时代档案', () => {
    expect(resolveEraProfile(null, '古代中国').key).toBe('ancient_chinese')
    expect(resolveEraProfile(null, '武侠世界').key).toBe('ancient_chinese')
    expect(resolveEraProfile(null, '现代都市').key).toBe('modern')
    expect(resolveEraProfile(null, '近未来科幻').key).toBe('near_future')
    expect(resolveEraProfile(null, '民国时期').key).toBe('period_drama')
    expect(resolveEraProfile(null, '某个模糊年代').key).toBe('period_drama')
  })

  it('显式 eraProfileKey 优先于文本推断', () => {
    expect(resolveEraProfile('modern', '古代中国').key).toBe('modern')
  })

  it('无法推断时回落 generic（不加约束）', () => {
    const p = resolveEraProfile(null, '不存在的时代')
    expect(p.key).toBe(DEFAULT_ERA_PROFILE_KEY)
    expect(eraConstraintOf(p).suffix).toBe('')
  })

  it('多字触发词优先（近未来 不被 未来 抢先，三国 不被 国 抢先）', () => {
    expect(resolveEraProfile(null, '近未来').key).toBe('near_future')
    expect(resolveEraProfile(null, '三国演义').key).toBe('ancient_chinese')
  })

  it('古风档案合并了历史两套词表（并集）', () => {
    // 关键帧侧独有
    for (const t of ['修真', '架空', '元', '秦', '隋', '晋']) {
      expect(resolveEraProfile(null, `某某${t}某某`).key).toBe('ancient_chinese')
    }
    // 资产侧独有
    for (const t of ['玄幻', '古装']) {
      expect(resolveEraProfile(null, t).key).toBe('ancient_chinese')
    }
  })

  it('古风约束后缀与 negative 全库单一来源（中英双写 + 负向并集）', () => {
    const c = eraConstraintOf(resolveEraProfile('ancient_chinese'))
    expect(c.suffix).toContain('严格古代中国风')
    expect(c.suffix).toContain('strictly ancient Chinese style')
    expect(c.suffix).toContain('电线杆')
    expect(c.negativeExtra).toContain('power lines')
    expect(c.negativeExtra).toContain('electricity')
    expect(c.negativeExtra).toContain('glass curtain wall')
  })

  it('时代锚：所有时代都注入年代/地域文本（不再只有古风）', () => {
    const anchor = renderEraAnchor({
      storyEra: '1980 年代',
      storyRegion: '南方小城',
      eraProfile: resolveEraProfile('period_drama'),
    })
    expect(anchor).toContain('1980 年代')
    expect(anchor).toContain('南方小城')
    // 无年代地域时返回空串
    expect(renderEraAnchor({ eraProfile: resolveEraProfile('modern') })).toBe('')
  })
})