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
  type BuildKeyframePromptInput,
} from '@core/modules/episode-production/render/keyframe/keyframe-prompt-builder'

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
})
