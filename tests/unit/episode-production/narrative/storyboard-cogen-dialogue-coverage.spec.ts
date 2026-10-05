/**
 * storyboard-cogen 对白承接硬校验单测（2026-09-23 一致性修复 v3 · A3）
 *
 * 规则 13/13a 落地：每条对白必须恰好被一个镜头承接（dialogueIds），
 * 缺失/重复/引用不存在的 id 都会被 validateCogenOutput 拦截（阻断级，触发纠错重试）。
 */

import { describe, expect, it } from 'vitest'
import { validateCogenOutput } from '@core/platform/episode-production/narrative/ai/storyboard-cogen'

function outputWith(d1: string[], d2: string[]) {
  return {
    assets: {
      characters: [],
      location: { name: '山道', description: '山道蜿蜒向下', existing: true },
      items: [],
    },
    shots: [
      {
        shotNumber: 1, shotType: 'long', cameraAngle: 'eye_level', cameraMovement: 'static',
        duration: 3, frameDescription: '【场景】a【人物】b【动作】c【氛围】d',
        characters: [], itemNames: [], dialogueIds: d1,
      },
      {
        shotNumber: 2, shotType: 'long', cameraAngle: 'eye_level', cameraMovement: 'static',
        duration: 3, frameDescription: '【场景】a【人物】b【动作】c【氛围】d',
        characters: [], itemNames: [], dialogueIds: d2,
      },
    ],
  }
}

const ALL = ['dlg_1', 'dlg_2']

describe('对白承接覆盖硬校验（A3）', () => {
  it('缺失对白被拦截', () => {
    const errs = validateCogenOutput(outputWith(['dlg_1'], []), [], ALL)
    expect(errs.some((e) => e.includes('dlg_2') && e.includes('没有任何镜头承接'))).toBe(true)
  })

  it('重复承接被拦截', () => {
    const errs = validateCogenOutput(outputWith(['dlg_1'], ['dlg_1']), [], ALL)
    expect(errs.some((e) => e.includes('重复承接'))).toBe(true)
  })

  it('引用不存在的对白 id 被拦截', () => {
    const errs = validateCogenOutput(outputWith(['dlg_1'], ['dlg_9']), [], ALL)
    expect(errs.some((e) => e.includes('不存在的对白 id'))).toBe(true)
  })

  it('镜头内重复 id 被拦截', () => {
    const errs = validateCogenOutput(outputWith(['dlg_1', 'dlg_1'], []), [], ALL)
    expect(errs.some((e) => e.includes('内部重复'))).toBe(true)
  })

  it('全覆盖不误报', () => {
    const errs = validateCogenOutput(outputWith(['dlg_1'], ['dlg_2']), [], ALL)
    expect(errs.filter((e) => e.includes('覆盖') || e.includes('重复承接') || e.includes('内部重复')).length).toBe(0)
  })
})
