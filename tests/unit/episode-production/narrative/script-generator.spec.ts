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
import {
  __test,
  buildContinuationPrompt,
  buildSceneSplitFromTextPrompt,
} from '@core/platform/episode-production/narrative/ai/script-generator'
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

  it('lookupBindingByName: 归一化口径与 binding-name-utils 统一（书名号/全角空格/大小写命中）', () => {
    const entries = [
      { bindingId: 'lb_manor', name: '雪麓山庄' },
      { bindingId: 'cb_shen', name: '沈　云萝' },
      { bindingId: 'cb_sword', name: 'QingYan' },
    ]
    expect(__test.lookupBindingByName(entries, '《雪麓山庄》')).toBe('lb_manor')
    expect(__test.lookupBindingByName(entries, '雪麓　山庄')).toBe('lb_manor')
    expect(__test.lookupBindingByName(entries, '沈云萝')).toBe('cb_shen')
    expect(__test.lookupBindingByName(entries, '沈 云萝')).toBe('cb_shen')
    expect(__test.lookupBindingByName(entries, 'qingyan')).toBe('cb_sword')
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

  it('buildPrompt: 重构共享片段后各要求段落一段不少（防提示词丢段）', () => {
    const prompt = __test.buildPrompt(ROSTER, '一段章节内容')
    for (const anchor of [
      '## ⚠️⚠️⚠️ 最重要：你必须输出结构化 JSON 场景数据！',
      '## 第一部分：结构化场景数据（JSON格式） - ⭐必须输出',
      '## 第二部分：章节梗概',
      '## 第三部分：完整剧本正文',
      '## ⭐ 强约束：所有引用必须使用 binding ID',
      '## 场景拆分原则',
      '## JSON 场景数据格式示例',
      '## ⭐ 字段输出质量要求（必须严格遵守）',
      '### sceneDescription（场景视觉描述）',
      '### locationKeyObjects（地点关键物件列表）',
      '### lighting（光线描述）',
      '### outfit（角色服装）',
      '## 可用角色列表',
      '## 可用地点列表',
      '## 可用物品列表',
      '## 章节内容',
    ]) {
      expect(prompt).toContain(anchor)
    }
  })
})

describe('script-generator 续写 / 正文拆分提示词', () => {
  const continuationInput = {
    existingScriptContent: '【第3场 茶馆 夜】\n张三推门而入。',
    existingScenesSummary: '- 第 3 场 | 茶馆 | 内景 | 夜晚 | 张三推门而入',
    instruction: '往下写李四登场，两人发生冲突',
    startSceneNumber: 4,
    roster: ROSTER,
  }

  it('buildContinuationPrompt: 起始场次号 + 已有正文 + 已有场次 + 续写要求都进提示词', () => {
    const prompt = buildContinuationPrompt(continuationInput)
    expect(prompt).toContain('第 4 场')
    expect(prompt).toContain('张三推门而入。')
    expect(prompt).toContain('- 第 3 场 | 茶馆')
    expect(prompt).toContain('往下写李四登场，两人发生冲突')
  })

  it('buildContinuationPrompt: 复用同一套输出契约（marker + binding 强约束 + 字段质量要求）', () => {
    const prompt = buildContinuationPrompt(continuationInput)
    expect(prompt).toContain('【场景数据开始】')
    expect(prompt).toContain('【剧本正文开始】')
    expect(prompt).toContain('## ⭐ 强约束：所有引用必须使用 binding ID')
    expect(prompt).toContain('## ⭐ 字段输出质量要求（必须严格遵守）')
    expect(prompt).toContain('## JSON 场景数据格式示例')
  })

  it('buildContinuationPrompt: 明确要求只输出新增内容、禁止重复已有场次', () => {
    const prompt = buildContinuationPrompt(continuationInput)
    expect(prompt).toContain('只输出本次新增的场景，严禁重复已经存在的场次')
    expect(prompt).toContain('严禁从 1 重新编号')
    expect(prompt).toContain('只写本次新增部分，严禁重复或改写已有正文')
  })

  it('buildContinuationPrompt: 三类资产花名册进提示词（binding 强引用）', () => {
    const prompt = buildContinuationPrompt(continuationInput)
    expect(prompt).toContain('cb_zhangsan')
    expect(prompt).toContain('lb_teahouse')
    expect(prompt).toContain('ib_teapot')
  })

  it('buildContinuationPrompt: 无正文 / 无场次时用占位文本，不留裸占位符', () => {
    const prompt = buildContinuationPrompt({
      ...continuationInput,
      existingScriptContent: '   ',
      existingScenesSummary: '',
    })
    expect(prompt).toContain('(暂无正文)')
    expect(prompt).toContain('(暂无场次)')
    expect(prompt).not.toContain('{existingScriptContent}')
    expect(prompt).not.toContain('{existingScenesSummary}')
    expect(prompt).not.toContain('{instruction}')
    expect(prompt).not.toContain('{startSceneNumber}')
  })

  it('buildContinuationPrompt: 正文里的 $& / $1 原样保留（不能被 replace 吃掉）', () => {
    const prompt = buildContinuationPrompt({
      ...continuationInput,
      existingScriptContent: '第1场 $& $1 $\' 特殊符号',
    })
    expect(prompt).toContain('第1场 $& $1 $\' 特殊符号')
  })

  it('buildSceneSplitFromTextPrompt: 待拆正文 + 起始场次号 + 契约段落都进提示词', () => {
    const prompt = buildSceneSplitFromTextPrompt({
      scriptText: '第四场 内景 客栈 日\n李四拍案而起。',
      existingScenesSummary: '- 第 3 场 | 茶馆 | 内景 | 夜晚 | 张三推门而入',
      startSceneNumber: 4,
      roster: ROSTER,
    })
    expect(prompt).toContain('李四拍案而起。')
    expect(prompt).toContain('第 4 场')
    expect(prompt).toContain('【场景数据开始】')
    expect(prompt).toContain('## ⭐ 强约束：所有引用必须使用 binding ID')
    expect(prompt).toContain('- 第 3 场 | 茶馆')
    expect(prompt).toContain('ib_teapot')
  })
})
