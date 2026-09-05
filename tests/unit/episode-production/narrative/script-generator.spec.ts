/**
 * EpisodeScriptGenerator binding 解析单测（P4-T4）
 * @module tests/unit/episode-production/narrative/script-generator
 *
 * 不打 AI 接口（依赖外部 provider），只验证 binding 解析逻辑：
 * - 提示词正确包含三类 roster
 * - 解析器优先采用 AI 给的 bindingId（命中 roster）
 * - AI 给错 bindingId 时按 name 回退
 * - AI 没给 bindingId 时按 name 回退
 * - 找不到时落 null
 * - props 兼容老格式（字符串）和新格式（{itemBindingId,name}）
 */

import { describe, it, expect } from 'vitest'
import { __test } from '@core/platform/episode-production/narrative/ai/script-generator'
import type { AssetRosterForScript } from '@shared/types/episode-production'

const ROSTER: AssetRosterForScript = {
  characters: [
    { bindingId: 'cb_zhangsan', name: '张三', description: '茶馆客人' },
    { bindingId: 'cb_lisi', name: '李四' },
  ],
  locations: [{ bindingId: 'lb_teahouse', name: '茶馆', description: '老式木结构茶馆' }],
  items: [
    { bindingId: 'ib_teapot', name: '茶壶' },
    { bindingId: 'ib_cup', name: '茶杯' },
  ],
}

describe('script-generator __test helpers', () => {
  it('formatRosterList: 三类都格式化为 "- bindingId: xxx, 名称: yyy" 行', () => {
    const out = __test.formatRosterList(ROSTER.characters)
    expect(out).toContain('cb_zhangsan')
    expect(out).toContain('张三')
    expect(out).toContain('茶馆客人')
    expect(out).toContain('cb_lisi')
  })

  it('formatRosterList: 空列表输出 (无)', () => {
    expect(__test.formatRosterList([])).toBe('(无)')
  })

  it('lookupBindingByName: name 不区分大小写、命中返回 bindingId', () => {
    expect(__test.lookupBindingByName(ROSTER.items, '茶壶')).toBe('ib_teapot')
    expect(__test.lookupBindingByName(ROSTER.items, '不存在')).toBeNull()
    expect(__test.lookupBindingByName(ROSTER.items, '')).toBeNull()
    expect(__test.lookupBindingByName(ROSTER.items, undefined)).toBeNull()
  })

  it('resolveBindingId: AI 给的 ID 命中 roster → 用 AI 的', () => {
    expect(
      __test.resolveBindingId(ROSTER.characters, 'cb_zhangsan', '张三'),
    ).toBe('cb_zhangsan')
  })

  it('resolveBindingId: AI 给的 ID 不在 roster → 按 name 回退', () => {
    expect(__test.resolveBindingId(ROSTER.characters, 'cb_ghost', '张三')).toBe(
      'cb_zhangsan',
    )
  })

  it('resolveBindingId: AI 没给 ID → 按 name 回退', () => {
    expect(__test.resolveBindingId(ROSTER.characters, undefined, '李四')).toBe(
      'cb_lisi',
    )
  })

  it('resolveBindingId: 都查不到 → null', () => {
    expect(
      __test.resolveBindingId(ROSTER.characters, 'cb_x', '王二'),
    ).toBeNull()
  })

  it('buildPrompt: 包含三类 roster 的清单 + 章节内容', () => {
    const prompt = __test.buildPrompt(ROSTER, '一段测试章节文本')
    expect(prompt).toContain('张三')
    expect(prompt).toContain('茶馆')
    expect(prompt).toContain('茶壶')
    expect(prompt).toContain('一段测试章节文本')
    // 强约束说明
    expect(prompt).toContain('binding ID')
  })

  it('convertScenes: AI 给完整 binding ID → 直接采用', () => {
    const scenes = __test.convertScenes(
      [
        {
          sceneNumber: 1,
          location: '茶馆',
          locationBindingId: 'lb_teahouse',
          locationType: 'interior',
          timeOfDay: 'morning',
          sceneDescription: '清晨茶馆',
          mood: '安静',
          characters: [
            {
              characterBindingId: 'cb_zhangsan',
              characterName: '张三',
              props: [{ itemBindingId: 'ib_teapot', name: '茶壶' }],
            },
          ],
          dialogues: [
            {
              id: 'd1',
              characterBindingId: 'cb_zhangsan',
              characterName: '张三',
              text: '请来一壶茶',
            },
          ],
          actions: [
            {
              id: 'a1',
              characterBindingId: 'cb_zhangsan',
              description: '坐下',
              timing: 'before',
            },
          ],
        },
      ],
      ROSTER,
    )
    expect(scenes[0].locationBindingId).toBe('lb_teahouse')
    expect(scenes[0].characters[0].characterBindingId).toBe('cb_zhangsan')
    expect(scenes[0].characters[0].props![0].itemBindingId).toBe('ib_teapot')
    expect(scenes[0].dialogues[0].characterBindingId).toBe('cb_zhangsan')
    expect(scenes[0].actions[0].characterBindingId).toBe('cb_zhangsan')
  })

  it('convertScenes: AI 用名字而不是 ID → name 回退', () => {
    const scenes = __test.convertScenes(
      [
        {
          sceneNumber: 1,
          location: '茶馆',
          locationType: 'interior',
          timeOfDay: 'morning',
          sceneDescription: '茶馆',
          mood: '',
          characters: [{ characterName: '张三' }],
          dialogues: [],
          actions: [],
        },
      ],
      ROSTER,
    )
    expect(scenes[0].locationBindingId).toBe('lb_teahouse') // 按 location 字段回退
    expect(scenes[0].characters[0].characterBindingId).toBe('cb_zhangsan')
  })

  it('convertScenes: prop 老格式（字符串）也能解析', () => {
    const scenes = __test.convertScenes(
      [
        {
          sceneNumber: 1,
          location: '茶馆',
          locationType: 'interior',
          timeOfDay: 'morning',
          sceneDescription: '',
          mood: '',
          characters: [
            { characterName: '张三', props: ['茶壶', '不存在的道具'] },
          ],
          dialogues: [],
          actions: [],
        },
      ],
      ROSTER,
    )
    const props = scenes[0].characters[0].props!
    expect(props).toHaveLength(2)
    expect(props[0]).toEqual({ itemBindingId: 'ib_teapot', name: '茶壶' })
    expect(props[1]).toEqual({ itemBindingId: null, name: '不存在的道具' })
  })

  it('convertScenes: 无法解析的引用 → bindingId 为 null（validator 会标违例）', () => {
    const scenes = __test.convertScenes(
      [
        {
          sceneNumber: 1,
          location: '不存在的地方',
          locationType: 'interior',
          timeOfDay: 'morning',
          sceneDescription: '',
          mood: '',
          characters: [{ characterName: '路人甲' }],
          dialogues: [],
          actions: [],
        },
      ],
      ROSTER,
    )
    expect(scenes[0].locationBindingId).toBeNull()
    expect(scenes[0].characters[0].characterBindingId).toBeNull()
  })

  it('convertScenes: 群像动作 characterBindingId 允许 null', () => {
    const scenes = __test.convertScenes(
      [
        {
          sceneNumber: 1,
          location: '茶馆',
          locationType: 'interior',
          timeOfDay: 'morning',
          sceneDescription: '',
          mood: '',
          characters: [],
          dialogues: [],
          actions: [{ id: 'a1', description: '众人鼓掌', timing: 'during' }],
        },
      ],
      ROSTER,
    )
    expect(scenes[0].actions[0].characterBindingId).toBeNull()
  })
})
