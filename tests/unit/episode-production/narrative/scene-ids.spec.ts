/**
 * 场景条目 id 口径 + 批量分镜 prompt 带 id 单测
 * @module tests/unit/episode-production/narrative/scene-ids
 *
 * 优化方案 §3.9（Phase 0 P0）与 §4.2：
 *   - 批量分镜 schema 要求回填 dialogueIds/narrationId/actionIds，
 *     但输入不带 id → 模型只能瞎编（下游"按镜数均分"兜底因此存在）
 *   - 旁白此前既无 id 也无承接校验（约束 13 空转）
 */

import { describe, it, expect } from 'vitest'
import {
  dialogueDisplayId,
  actionDisplayId,
  narrationDisplayId,
  DEFAULT_NARRATION_ID,
} from '@core/platform/episode-production/prompts/scene-id'
import {
  buildCogenPrompt,
  validateCogenOutput,
  type CogenExistingAsset,
} from '@core/platform/episode-production/narrative/ai/storyboard-cogen'

function baseScene(over: Record<string, unknown> = {}): any {
  return {
    sceneNumber: 1,
    location: '某山庄书房',
    locationType: 'interior',
    timeOfDay: '夜',
    weather: '',
    sceneDescription: '书房内景',
    mood: '紧张',
    lighting: '',
    characters: [{ characterName: '角色甲', characterBindingId: 'cb_1' }],
    narration: '',
    dialogues: [],
    actions: [],
    ...over,
  }
}

describe('scene-id · 展示 id 口径', () => {
  it('有真实 id 用真实 id', () => {
    expect(dialogueDisplayId({ id: 'dlg_1727000000000_0' }, 0)).toBe('dlg_1727000000000_0')
    expect(dialogueDisplayId({ id: 'dlg_1' }, 5)).toBe('dlg_1')
    expect(actionDisplayId({ id: 'act_9' }, 0)).toBe('act_9')
  })

  it('无 id 老数据合成稳定 id（前缀与真实 id 不冲突）', () => {
    expect(dialogueDisplayId({}, 3)).toBe('dlg_noid_3')
    expect(actionDisplayId({}, 2)).toBe('act_noid_2')
  })

  it('空字符串 id 视同无 id', () => {
    expect(dialogueDisplayId({ id: '' }, 1)).toBe('dlg_noid_1')
  })

  it('旁白 id 固定 nrt_1；无旁白返回 null', () => {
    expect(narrationDisplayId('夜色深沉')).toBe(DEFAULT_NARRATION_ID)
    expect(narrationDisplayId('夜色深沉')).toBe('nrt_1')
    expect(narrationDisplayId('')).toBeNull()
    expect(narrationDisplayId('   ')).toBeNull()
    expect(narrationDisplayId(null)).toBeNull()
    expect(narrationDisplayId(undefined)).toBeNull()
  })
})

describe('buildCogenPrompt · 旁白与动作带 id（§4.2）', () => {
  it('有旁白时注入 nrt_1 与旁白文本', () => {
    const prompt = buildCogenPrompt(baseScene({ narration: '夜色深沉，风起。' }), [])
    expect(prompt).toContain('nrt_1')
    expect(prompt).toContain('夜色深沉，风起。')
  })

  it('无旁白时标注（无）', () => {
    const prompt = buildCogenPrompt(baseScene({ narration: '' }), [])
    expect(prompt).toContain('旁白（若有，narrationId 必须回填其 id 到承接镜头）:\n（无）')
  })

  it('对白带 id 渲染', () => {
    const scene = baseScene({
      dialogues: [{ id: 'dlg_7', characterName: '角色甲', text: '你来了', emotion: '怒' }],
    })
    const prompt = buildCogenPrompt(scene, [])
    expect(prompt).toContain('- dlg_7 · 角色甲: "你来了" (怒)')
  })

  it('动作带 id 渲染', () => {
    const scene = baseScene({ actions: [{ id: 'act_3', description: '推门而入' }] })
    const prompt = buildCogenPrompt(scene, [])
    expect(prompt).toContain('- act_3 · 推门而入')
  })

  it('schema 含 narrationId 字段', () => {
    const prompt = buildCogenPrompt(baseScene(), [])
    expect(prompt).toContain('"narrationId"')
  })

  it('约束 13 明确要求旁白恰好一个镜头承接', () => {
    const prompt = buildCogenPrompt(baseScene(), [])
    expect(prompt).toContain('必须恰好有一个镜头回填 narrationId')
  })
})

describe('validateCogenOutput · 旁白承接校验（§4.2 新增机器校验）', () => {
  function validShot(over: Record<string, unknown> = {}): any {
    return {
      shotType: 'medium',
      cameraAngle: 'eye_level',
      cameraMovement: 'static',
      duration: 3,
      frameDescription: '【场景】书房【人物】角色甲【动作】站立【氛围】紧张',
      characters: [],
      itemNames: [],
      dialogueIds: [],
      ...over,
    }
  }
  function validOutput(shots: any[]): any {
    return {
      assets: {
        characters: [],
        location: { name: '某山庄书房', description: '书房', existing: false },
        items: [],
      },
      shots,
    }
  }
  const noAssets: CogenExistingAsset[] = []

  it('有旁白但无镜头承接 → 报错', () => {
    const errors = validateCogenOutput(
      validOutput([validShot(), validShot()]),
      noAssets,
      [],
      undefined,
      'nrt_1',
    )
    expect(errors.some((e) => e.includes('旁白承接缺失'))).toBe(true)
  })

  it('有旁白且恰好一个镜头承接 → 通过', () => {
    const errors = validateCogenOutput(
      validOutput([validShot(), validShot({ narrationId: 'nrt_1' })]),
      noAssets,
      [],
      undefined,
      'nrt_1',
    )
    expect(errors).toEqual([])
  })

  it('旁白被多个镜头承接 → 报错', () => {
    const errors = validateCogenOutput(
      validOutput([validShot({ narrationId: 'nrt_1' }), validShot({ narrationId: 'nrt_1' })]),
      noAssets,
      [],
      undefined,
      'nrt_1',
    )
    expect(errors.some((e) => e.includes('旁白被多个镜头重复承接'))).toBe(true)
  })

  it('narrationId 值不正确 → 报错', () => {
    const errors = validateCogenOutput(
      validOutput([validShot({ narrationId: 'nrt_99' })]),
      noAssets,
      [],
      undefined,
      'nrt_1',
    )
    expect(errors.some((e) => e.includes('旁白 id 应为'))).toBe(true)
  })

  it('无旁白时不校验（不传 expectedNarrationId）', () => {
    const errors = validateCogenOutput(validOutput([validShot(), validShot()]), noAssets, [])
    expect(errors).toEqual([])
  })

  it('无旁白时传 null 也不校验', () => {
    const errors = validateCogenOutput(
      validOutput([validShot(), validShot()]),
      noAssets,
      [],
      undefined,
      null,
    )
    expect(errors).toEqual([])
  })
})