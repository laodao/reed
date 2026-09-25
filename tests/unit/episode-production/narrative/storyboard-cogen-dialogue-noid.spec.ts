/**
 * storyboard-cogen 无 id 老对白处理单测（2026-09-25 一致性修复第二批 · M3）
 *
 * 历史数据存在无 id 对白，旧代码 String(d.id) 产生 "undefined"：
 * - expectedDialogueIds 混入 "undefined" → 全覆盖校验恒失败 → cogen 必抛错
 * - prompt 对话列表打印成 `- undefined · 角色: ...`
 * 修复后：无 id 对白统一用合成 id dlg_noid_${场景内下标}（prompt 与校验同口径）。
 */

import { describe, expect, it } from 'vitest'
import {
  buildCogenPrompt,
  dialogueDisplayId,
  validateCogenOutput,
} from '@core/platform/episode-production/narrative/ai/storyboard-cogen'

function makeScene(dialogues: any[]) {
  return {
    sceneNumber: 3,
    location: '山道',
    locationType: 'exterior',
    timeOfDay: 'day',
    weather: 'sunny',
    sceneDescription: '山道蜿蜒向下',
    mood: '紧张',
    lighting: '自然光',
    characters: [{ characterName: '阿蘅' }],
    narration: '',
    dialogues,
    actions: [],
  } as any
}

function outputWith(d1: string[], d2: string[]) {
  return {
    assets: {
      characters: [],
      location: { name: '山道', description: '山道蜿蜒向下', existing: false },
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

describe('无 id 老对白处理（M3）', () => {
  it('expectedDialogueIds 不含 "undefined"，含合成 id，全覆盖校验可通过', () => {
    const dialogues = [
      { characterName: '阿蘅', text: '你没有 id', emotion: '平静' },
      { id: 'dlg_1727000000000_1', characterName: '陈舟', text: '我有 id', emotion: '平静' },
    ]
    const expected = dialogues.map((d, i) => dialogueDisplayId(d, i))
    expect(expected).toEqual(['dlg_noid_0', 'dlg_1727000000000_1'])
    expect(expected.some((id) => id.includes('undefined'))).toBe(false)

    const errs = validateCogenOutput(outputWith(['dlg_noid_0'], ['dlg_1727000000000_1']), [], expected)
    expect(errs).toEqual([])
  })

  it('prompt 渲染无 id 对白展示合成 id 而非 undefined', () => {
    const prompt = buildCogenPrompt(makeScene([
      { characterName: '阿蘅', text: '第一句', emotion: '平静' },
      { id: 'dlg_1', characterName: '陈舟', text: '第二句', emotion: '愤怒' },
    ]), [])
    expect(prompt).toContain('- dlg_noid_0 · 阿蘅: "第一句" (平静)')
    expect(prompt).toContain('- dlg_1 · 陈舟: "第二句" (愤怒)')
    expect(prompt).not.toContain('undefined')
  })

  it('有 id 对白行为不变：dialogueDisplayId 原样返回真实 id', () => {
    expect(dialogueDisplayId({ id: 'dlg_1727000000000_0' }, 0)).toBe('dlg_1727000000000_0')
    expect(dialogueDisplayId({ id: 'dlg_1' }, 5)).toBe('dlg_1')
    const prompt = buildCogenPrompt(makeScene([
      { id: 'dlg_1727000000000_0', characterName: '阿蘅', text: '有 id 的对白', emotion: '平静' },
    ]), [])
    expect(prompt).toContain('- dlg_1727000000000_0 · 阿蘅: "有 id 的对白" (平静)')
  })
})
