/**
 * storyboard-cogen 台词时长硬校验单测（2026-10-05 台词乱码修复）
 *
 * 规则 12 落地：镜头承接台词的语音时长（字数 ÷ 4.5 字/秒）超过镜头时长
 * 必然导致音视频模型加速糊念——validateCogenOutput 阻断并触发纠错重试。
 * 不传 dialogueTextById 时校验跳过（老调用方兼容）。
 */

import { describe, expect, it } from 'vitest'
import {
  validateCogenOutput,
  SPEECH_CHARS_PER_SEC,
} from '@core/platform/episode-production/narrative/ai/storyboard-cogen'

function shot(duration: number, dialogueIds: string[]) {
  return {
    shotType: 'medium', cameraAngle: 'eye_level', cameraMovement: 'static',
    duration, frameDescription: '【场景】a【人物】b【动作】c【氛围】d',
    characters: [], itemNames: [], dialogueIds,
  }
}

function outputWith(shots: ReturnType<typeof shot>[]) {
  return {
    assets: {
      characters: [],
      location: { name: '书房', description: '书房', existing: true },
      items: [],
    },
    shots,
  }
}

// seq3 实锤数据：2s 镜头承接 16 字台词（≈3.6s）
const TEXTS = new Map([
  ['dlg_1', '那不正好？嘴皮子一流，破案靠嘴！'], // 16字 ≈3.6s
  ['dlg_2', '师傅，要不我送她下山。'], // 11字 ≈2.4s
  ['dlg_3', '去可以。'], // 4字 ≈0.9s
])

describe('台词时长硬校验（强约束 12 落地）', () => {
  it('台词语音时长超过镜头时长 → 阻断', () => {
    const errs = validateCogenOutput(
      outputWith([shot(2, ['dlg_1']), shot(3, [])]),
      [],
      [],
      TEXTS,
    )
    expect(errs.some((e) => e.includes('台词念不完') && e.includes('16 字'))).toBe(true)
  })

  it('语音时长在镜头时长内 → 放行', () => {
    const errs = validateCogenOutput(
      outputWith([shot(4, ['dlg_1']), shot(3, ['dlg_3'])]),
      [],
      [],
      TEXTS,
    )
    expect(errs.filter((e) => e.includes('台词念不完'))).toEqual([])
  })

  it('恰好等于镜头时长 → 放行（边界含等号）', () => {
    // 9 字 ÷ 4.5 = 2.0s，镜头 2s
    const texts = new Map([['dlg_9', '一'.repeat(9)]])
    const errs = validateCogenOutput(outputWith([shot(2, ['dlg_9']), shot(3, [])]), [], [], texts)
    expect(errs.filter((e) => e.includes('台词念不完'))).toEqual([])
  })

  it('不传 dialogueTextById → 校验跳过（老调用方兼容）', () => {
    const errs = validateCogenOutput(outputWith([shot(1, ['dlg_1']), shot(3, [])]), [], [])
    expect(errs.filter((e) => e.includes('台词念不完'))).toEqual([])
  })

  it('语速常量口径：4.5 字/秒', () => {
    expect(SPEECH_CHARS_PER_SEC).toBe(4.5)
  })
})
