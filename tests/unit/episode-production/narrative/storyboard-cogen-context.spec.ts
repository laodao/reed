/**
 * cogen 上下文注入单测（提示词优化方案 §3.8，Phase 2）
 * @module tests/unit/episode-production/narrative/storyboard-cogen-context
 *
 * 覆盖 §3.8 的注入补齐与口径统一：
 *   - 注入故事背景/风格/画幅/目标时长（优化前一个都没有）
 *   - 约束 6 节奏分档改由体裁档案渲染，不再内联重写（两份文本此前已分叉）
 *   - 语速变量化（提示词、校验、前端统一）
 *   - duration 口径统一 1~10s
 *   - 短剧话术只挂 short_drama
 */

import { describe, it, expect } from 'vitest'
import {
  buildCogenPrompt,
  validateCogenOutput,
} from '@core/platform/episode-production/narrative/ai/storyboard-cogen'
import {
  buildPromptContext,
  createDefaultPromptContext,
} from '@core/platform/episode-production/prompts/prompt-context'

function fakeScene(): any {
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
  }
}

const CTX = buildPromptContext({
  storyEra: '古代中国',
  storyRegion: '江南',
  genre: 'short_drama',
  stylePrompt: '国风工笔',
  aspectRatio: '9:16',
  targetEpisodeDurationSec: 120,
  segmentDurationBudgetSec: 15,
})

describe('buildCogenPrompt · 背景与风格注入（§3.8 新增）', () => {
  it('注入故事背景与风格段', () => {
    const p = buildCogenPrompt(fakeScene(), [], CTX)
    expect(p).toContain('## 故事背景与风格')
    expect(p).toContain('故事年代：古代中国')
    expect(p).toContain('故事地域：江南')
    expect(p).toContain('画面风格：国风工笔')
    expect(p).toContain('画面比例：9:16')
    expect(p).toContain('本集目标时长：约 120 秒')
  })

  it('无上下文时不注入该段（行为等价优化前）', () => {
    const p = buildCogenPrompt(fakeScene(), [], createDefaultPromptContext())
    expect(p).not.toContain('## 故事背景与风格')
  })

  it('缺少目标集长时仍注入其余字段', () => {
    const p = buildCogenPrompt(fakeScene(), [], buildPromptContext({ storyEra: '现代都市' }))
    expect(p).toContain('故事年代：现代都市')
    expect(p).not.toContain('本集目标时长')
  })
})

describe('buildCogenPrompt · 节奏分档接注册表（§3.8 消除双份分叉）', () => {
  it('短剧档位含 1-1.5s 与"每 2 秒 1 镜"留存底线', () => {
    const p = buildCogenPrompt(fakeScene(), [], CTX)
    expect(p).toContain('镜头节奏密度分档')
    expect(p).toContain('单镜头 1-1.5s')
    expect(p).toContain('15s 片段 8-12 镜')
    expect(p).toContain('每 2 秒 1 镜是短剧留存底线')
  })

  it('含"duration 之和=目标总时长"硬规则（内联副本此前缺失）', () => {
    const p = buildCogenPrompt(fakeScene(), [], CTX)
    expect(p).toContain('各镜头 duration 之和必须等于本场景/片段目标总时长')
  })

  it('电影体裁不注入短剧话术，档位按体裁数值', () => {
    const p = buildCogenPrompt(fakeScene(), [], buildPromptContext({ genre: 'film' }))
    expect(p).not.toContain('短剧')
    expect(p).not.toContain('打脸')
    expect(p).toContain('单镜头 2-3s')
  })

  it('片段预算变化影响"Xs 片段 N 镜"的换算基准', () => {
    const p12 = buildCogenPrompt(
      fakeScene(),
      [],
      buildPromptContext({ genre: 'short_drama', segmentDurationBudgetSec: 12 }),
    )
    expect(p12).toContain('12s 片段')
  })
})

describe('buildCogenPrompt · duration 口径与语速', () => {
  it('duration 区间为 1~10s（与校验口径一致）', () => {
    const p = buildCogenPrompt(fakeScene(), [], CTX)
    expect(p).toContain('1~10 的数字')
  })

  it('语速从上下文渲染（默认 4.5）', () => {
    const p = buildCogenPrompt(fakeScene(), [], createDefaultPromptContext())
    expect(p).toContain('按 4.5 字/秒硬核算')
  })

  it('语速可被项目配置覆写', () => {
    const p = buildCogenPrompt(fakeScene(), [], buildPromptContext({ speechCharsPerSec: 6 }))
    expect(p).toContain('按 6 字/秒硬核算')
  })
})

describe('validateCogenOutput · 语速参数化（§3.8）', () => {
  const shot = (over: Record<string, unknown> = {}): any => ({
    shotType: 'medium',
    cameraAngle: 'eye_level',
    cameraMovement: 'static',
    duration: 3,
    frameDescription: '【场景】书房【人物】角色甲【动作】站立【氛围】紧张',
    characters: [],
    itemNames: [],
    dialogueIds: [],
    ...over,
  })
  const output = (shots: any[]): any => ({
    assets: {
      characters: [],
      location: { name: '某山庄书房', description: '书房', existing: false },
      items: [],
    },
    shots,
  })
  const textById = new Map([['dlg_1', '这是一句大约二十个字的比较长的台词内容']])

  it('语速越高同一台词需要的时间越短（按项目配置核算）', () => {
    const shots = [shot({ dialogueIds: ['dlg_1'], duration: 3.5 })]
    const slow = validateCogenOutput(output(shots), [], ['dlg_1'], textById, null, 4.5)
    const fast = validateCogenOutput(output(shots), [], ['dlg_1'], textById, null, 8)

    // 台词 19 字：4.5 字/秒 ≈ 4.2s（超 3.5s → 报错）；8 字/秒 ≈ 2.4s（通过）
    expect(slow.some((e) => e.includes('4.5 字/秒') && e.includes('台词念不完'))).toBe(true)
    expect(fast.some((e) => e.includes('台词念不完'))).toBe(false)
  })

  it('不传语速时回落默认 4.5（兼容既有调用）', () => {
    const shots = [shot({ dialogueIds: ['dlg_1'], duration: 1 })]
    const errors = validateCogenOutput(output(shots), [], ['dlg_1'], textById)
    expect(errors.some((e) => e.includes('4.5 字/秒'))).toBe(true)
  })

  it('非法语速值回落默认', () => {
    const shots = [shot({ dialogueIds: ['dlg_1'], duration: 1 })]
    for (const bad of [0, -1, NaN]) {
      const errors = validateCogenOutput(output(shots), [], ['dlg_1'], textById, null, bad as number)
      expect(errors.some((e) => e.includes('4.5 字/秒'))).toBe(true)
    }
  })
})

describe('buildCogenPrompt · 场景剧本 id 注入不受上下文影响', () => {
  it('对白/旁白/动作 id 仍按统一口径渲染', () => {
    const scene = fakeScene()
    scene.narration = '夜色深沉'
    scene.dialogues = [{ id: 'dlg_7', characterName: '角色甲', text: '你来了' }]
    scene.actions = [{ id: 'act_3', description: '推门' }]
    const p = buildCogenPrompt(scene, [], CTX)

    expect(p).toContain('nrt_1')
    expect(p).toContain('dlg_7')
    expect(p).toContain('act_3')
  })
})