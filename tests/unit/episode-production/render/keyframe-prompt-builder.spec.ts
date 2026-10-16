/**
 * buildKeyframePrompt 单测（P5-T5）
 * @module tests/unit/episode-production/render/keyframe-prompt-builder
 *
 * 不打 AI；只验证文字层拼装：
 * - 风格前缀 + 场景描述 + 时刻语言（start/middle/end 区分）
 * - 角色 effective + sceneRole（expression/action/outfit/position）
 * - 物品 effective + context
 * - 地点 effective
 * - 镜头语言（shotType + angle）
 * - 氛围 / 时间 / 天气
 * - 负向 prompt 来自风格配置
 */

import { describe, it, expect } from 'vitest'
import {
  buildKeyframePrompt,
  PRESET_STYLES,
  REFERENCE_MATCH_STYLE_PREFIX,
  type BuildKeyframePromptInput,
} from '@core/platform/episode-production/render/keyframe/keyframe-prompt-builder'

const STYLE = PRESET_STYLES.cinematic

function baseInput(
  overrides: Partial<BuildKeyframePromptInput> = {},
): BuildKeyframePromptInput {
  return {
    shotType: 'medium',
    cameraAngle: 'eye_level',
    frameDescription: '茶馆里张三推门进入',
    composition: null,
    subject: null,
    sceneDescription: '清晨茶馆',
    mood: '安静',
    timeOfDay: 'morning',
    weather: 'sunny',
    characters: [
      {
        bindingId: 'cb1',
        effective: {
          name: '张三',
          description: '茶馆客人',
          appearance: '剑眉星目',
          outfit: '蓝色长衫',
          source: 'standalone',
        },
        sceneRole: {
          expression: '凝重',
          action: '推门',
          outfit: null,
          position: 'center',
        },
      },
    ],
    location: {
      bindingId: 'lb1',
      effective: { name: '茶馆', description: '老式茶馆', source: 'standalone' },
    },
    items: [
      {
        bindingId: 'ib1',
        effective: { name: '茶壶', description: '紫砂壶', source: 'standalone' },
        context: 'on_table',
      },
    ],
    frameRole: 'start',
    timePercent: 0,
    styleConfig: STYLE,
    ...overrides,
  }
}

describe('buildKeyframePrompt', () => {
  it('start 帧：含开始时刻文案 + 风格前缀 + 资产引用', () => {
    const out = buildKeyframePrompt(baseInput())
    expect(out.prompt).toContain('开始时刻')
    expect(out.prompt).toContain(STYLE.stylePrefix)
    expect(out.prompt).toContain('张三') // 角色 effective.name
    expect(out.prompt).toContain('剑眉星目') // appearance
    expect(out.prompt).toContain('蓝色长衫') // outfit
    expect(out.prompt).toContain('茶馆') // location
    expect(out.prompt).toContain('茶壶') // item
    expect(out.prompt).toContain('on_table') // item context
    expect(out.negativePrompt).toBe(STYLE.negativePrompt)
  })

  it('middle 帧：含中段百分比文案', () => {
    const out = buildKeyframePrompt(baseInput({ frameRole: 'middle', timePercent: 0.5 }))
    expect(out.prompt).toContain('50%')
  })

  it('end 帧：含结束时刻文案', () => {
    const out = buildKeyframePrompt(baseInput({ frameRole: 'end', timePercent: 1 }))
    expect(out.prompt).toContain('结束时刻')
  })

  it('sceneRole.outfit 覆盖 effective.outfit（场景临时换装）', () => {
    const out = buildKeyframePrompt(
      baseInput({
        characters: [
          {
            bindingId: 'cb1',
            effective: {
              name: '张三',
              description: '',
              appearance: null,
              outfit: '蓝色长衫',
              source: 'standalone',
            },
            sceneRole: { outfit: '雨披' },
          },
        ],
      }),
    )
    // sceneRole.outfit 优先
    expect(out.prompt).toContain('wearing 雨披')
    expect(out.prompt).not.toContain('wearing 蓝色长衫')
  })

  it('多角色 / 多物品都能拼入', () => {
    const out = buildKeyframePrompt(
      baseInput({
        characters: [
          {
            bindingId: 'cb1',
            effective: { name: '张三', description: '', source: 'standalone' },
            sceneRole: { action: '坐下' },
          },
          {
            bindingId: 'cb2',
            effective: { name: '李四', description: '', source: 'standalone' },
            sceneRole: { action: '泡茶' },
          },
        ],
        items: [
          {
            bindingId: 'ib1',
            effective: { name: '茶壶', description: '', source: 'standalone' },
          },
          {
            bindingId: 'ib2',
            effective: { name: '茶杯', description: '', source: 'standalone' },
          },
        ],
      }),
    )
    expect(out.prompt).toContain('张三')
    expect(out.prompt).toContain('李四')
    expect(out.prompt).toContain('茶壶')
    expect(out.prompt).toContain('茶杯')
  })

  it('无场景资产（characters/items/location 全空）：仍能拼出基本 prompt', () => {
    const out = buildKeyframePrompt(
      baseInput({
        characters: [],
        items: [],
        location: null,
        sceneDescription: '空场景',
      }),
    )
    expect(out.prompt).toContain('空场景')
    expect(out.prompt).toContain(STYLE.qualitySuffix)
  })

  it('镜头语言：shotType + cameraAngle 都拼入', () => {
    const out = buildKeyframePrompt(
      baseInput({ shotType: 'close', cameraAngle: 'low' }),
    )
    // 检查镜头描述被拼入（具体 shotType prompt 前缀来自映射表）
    expect(out.prompt).toMatch(/close-up|近景/)
  })

  /**
   * P5-T25 spec §4.5.7：用户额外提示词作为单独段拼入 prompt 末尾
   * （位于质量后缀之前，作为最高优先级"用户意图"参考）。
   */
  it('P5-T25 userPrompt：非空时作为 [user direction] 段拼入', () => {
    const out = buildKeyframePrompt(
      baseInput({ userPrompt: '让角色更愤怒，镜头拉近' }),
    )
    expect(out.prompt).toContain('[user direction] 让角色更愤怒，镜头拉近')
    // 应该位于质量后缀之前
    const userIdx = out.prompt.indexOf('[user direction]')
    const qualityIdx = out.prompt.indexOf(STYLE.qualitySuffix)
    expect(userIdx).toBeGreaterThan(0)
    expect(userIdx).toBeLessThan(qualityIdx)
  })

  it('P5-T25 userPrompt：空字符串 / null / undefined 不影响输出', () => {
    const baseOut = buildKeyframePrompt(baseInput({}))
    const emptyOut = buildKeyframePrompt(baseInput({ userPrompt: '' }))
    const nullOut = buildKeyframePrompt(baseInput({ userPrompt: null }))
    const whitespaceOut = buildKeyframePrompt(baseInput({ userPrompt: '   ' }))
    expect(emptyOut.prompt).toBe(baseOut.prompt)
    expect(nullOut.prompt).toBe(baseOut.prompt)
    expect(whitespaceOut.prompt).toBe(baseOut.prompt)
    // 不应出现 [user direction] 标识
    expect(baseOut.prompt).not.toContain('[user direction]')
  })

  it('P5-T25 userPrompt：trim 处理两端空白', () => {
    const out = buildKeyframePrompt(
      baseInput({ userPrompt: '  背景虚化  ' }),
    )
    expect(out.prompt).toContain('[user direction] 背景虚化')
    expect(out.prompt).not.toContain('[user direction]   背景虚化')
  })

  /*
   * F4 / C6（2026-09-20 人物一致性修复）：有角色参考图时风格前缀换成
   * "与参考图保持一致"，避免 cinematic 写实电影词把 Q 版参考图写实化。
   */
  it('F4：hasCharacterReference=true → 风格前缀让位给参考图（不含 cinematic 写实词）', () => {
    const out = buildKeyframePrompt(baseInput({ hasCharacterReference: true }))
    expect(out.prompt).toContain(REFERENCE_MATCH_STYLE_PREFIX)
    expect(out.prompt).not.toContain(STYLE.stylePrefix)
    expect(out.prompt).not.toContain('professional photography')
  })

  it('F4：hasCharacterReference=false / 缺省 → 维持原 cinematic 前缀', () => {
    const explicit = buildKeyframePrompt(baseInput({ hasCharacterReference: false }))
    const omitted = buildKeyframePrompt(baseInput())
    for (const out of [explicit, omitted]) {
      expect(out.prompt).toContain(STYLE.stylePrefix)
      expect(out.prompt).not.toContain(REFERENCE_MATCH_STYLE_PREFIX)
    }
  })
})

/*
 * 时代硬约束（2026-09-21 雪麓山庄 v2 复盘 F 项 → 2026-10-06 §2.5 收敛到时代档案）：
 * storyEra 命中古/武侠/朝代词 → prompt 末尾追加"严禁现代元素"，
 * negative 追加现代物词；其他时代按各自档案加约束（generic 不加）。
 */
describe('古风硬约束（storyEra）', () => {
  it('storyEra=古代武侠 → 追加禁令 + negative 现代物词', async () => {
    const { ANCIENT_ERA_PROMPT_SUFFIX, ANCIENT_ERA_NEGATIVE_SUFFIX } = await import(
      '@core/platform/episode-production/render/keyframe/keyframe-prompt-builder'
    )
    const out = buildKeyframePrompt(baseInput({ storyEra: '古代武侠' }))
    expect(out.prompt).toContain(ANCIENT_ERA_PROMPT_SUFFIX)
    // §2.5 收敛后文案为并集版："严禁出现任何现代建筑…"
    expect(out.prompt).toContain('严禁出现任何现代建筑')
    expect(out.negativePrompt).toContain(ANCIENT_ERA_NEGATIVE_SUFFIX)
    expect(out.negativePrompt).toContain('modern buildings')
  })

  it('朝代词命中：北宋 / 大明 / 仙侠', async () => {
    const { isAncientEra } = await import(
      '@core/platform/episode-production/render/keyframe/keyframe-prompt-builder'
    )
    expect(isAncientEra('北宋')).toBe(true)
    expect(isAncientEra('大明')).toBe(true)
    expect(isAncientEra('仙侠')).toBe(true)
    expect(isAncientEra('架空古装')).toBe(true)
  })

  it('非古风时代不再被误判（历史正则 "汉" 命中"武汉"的缺陷）', async () => {
    const { isAncientEra } = await import(
      '@core/platform/episode-production/render/keyframe/keyframe-prompt-builder'
    )
    expect(isAncientEra('武汉')).toBe(false)
    expect(isAncientEra('现代都市')).toBe(false)
    expect(isAncientEra('元素周期')).toBe(false)
    expect(isAncientEra('明天')).toBe(false)
  })

  it('古风约束文案与资产侧同源（§2.5 消除双实现漂移）', async () => {
    const kf = await import(
      '@core/platform/episode-production/render/keyframe/keyframe-prompt-builder'
    )
    const asset = await import(
      '@core/platform/episode-production/assets/prompts/asset-identity-prompt'
    )
    expect(kf.ANCIENT_ERA_PROMPT_SUFFIX).toBe(asset.ANCIENT_ERA_CONSTRAINT_SUFFIX)
    expect(kf.ANCIENT_ERA_NEGATIVE_SUFFIX).toBe(asset.ANCIENT_ERA_NEGATIVE)
  })

  it('generic 时代（无年代信息）→ 不加任何时代约束', () => {
    const omitted = buildKeyframePrompt(baseInput())
    expect(omitted.prompt).not.toContain('严禁出现任何现代建筑')
    expect(omitted.negativePrompt).not.toContain('power lines')
  })

  it('显式 eraProfileKey 优先于 storyEra 文本推断（§2.5）', async () => {
    const { resolveEraProfile } = await import(
      '@core/platform/episode-production/prompts/era-profiles'
    )
    expect(resolveEraProfile('modern', '古代武侠').key).toBe('modern')

    // 现代项目：拿到现代约束，而非古风禁令
    const modern = buildKeyframePrompt(
      baseInput({ storyEra: '古代武侠', eraProfileKey: 'modern' } as never),
    )
    expect(modern.prompt).not.toContain('严禁出现任何现代建筑')
    expect(modern.prompt).toContain('现代都市写实风格')
  })

  it('时代锚无条件注入（§3.12：不再只有古风才有时代约束）', () => {
    const out = buildKeyframePrompt(
      baseInput({ storyEra: '1980 年代', storyRegion: '南方小城' }),
    )
    expect(out.prompt).toContain('[时代背景]')
    expect(out.prompt).toContain('1980 年代')
    expect(out.prompt).toContain('南方小城')
  })
})
