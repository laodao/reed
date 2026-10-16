/**
 * 提示词示例中性化守卫（提示词优化方案 §3.8/§3.9/§3.13，原则 P3）
 * @module tests/unit/episode-production/narrative/prompt-neutrality
 *
 * 约束：**发给模型的提示词正文**不得含真实项目的人名/地名/物品名——
 * 这些示例会让模型把示例里的世界观当成本项目设定（古风偏置、风格漂移）。
 *
 * 注：源码注释中记录的真实项目名（事故复盘出处）不受本约束，
 * 本测试只检查渲染后的 prompt 文本。
 */

import { describe, it, expect } from 'vitest'
import { buildCogenPrompt } from '@core/platform/episode-production/narrative/ai/storyboard-cogen'
import { EpisodeStoryboardGenerator } from '@core/platform/episode-production/narrative/ai/storyboard-generator'
import { vi, afterEach } from 'vitest'

const callAIMock = vi.fn()
vi.mock('@core/platform/episode-production/narrative/ai/_helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@core/platform/episode-production/narrative/ai/_helpers')>()
  return { ...actual, callAI: (...args: unknown[]) => callAIMock(...args) }
})

afterEach(() => {
  callAIMock.mockReset()
})

/** 已知的真实项目专名（出现在提示词里即为回归） */
const REAL_PROJECT_NAMES = [
  '沈云萝',
  '秦越',
  '雪麓山庄',
  '白鹿城',
  '阿蘅',
  '杜十娘',
  '曼陀罗花',
  '忘忧草',
  '素白衣裙',
  '淡青披风',
  '素白医袍',
]

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

describe('提示词示例中性化 · cogen', () => {
  it('联合生成提示词不含任何真实项目专名', () => {
    const prompt = buildCogenPrompt(fakeScene(), [])
    for (const name of REAL_PROJECT_NAMES) {
      expect(prompt).not.toContain(name)
    }
  })

  it('仍保留资产引用标记与地点命名纪律（语义未弱化）', () => {
    const prompt = buildCogenPrompt(fakeScene(), [])
    expect(prompt).toContain('@[登记名]')
    expect(prompt).toContain('大地名+区域名')
    expect(prompt).toContain('某山庄书房')
  })
})

describe('提示词示例中性化 · AI 填空', () => {
  it('填空提示词不含任何真实项目专名', async () => {
    callAIMock.mockResolvedValue('{}')
    const gen = new EpisodeStoryboardGenerator({} as never)
    await gen.fillStoryboardFields({
      shotNumber: 1,
      sceneContext: '场景上下文',
      existingFields: { cameraMovement: null },
    })
    const prompt = String(callAIMock.mock.calls[0][0])

    for (const name of REAL_PROJECT_NAMES) {
      expect(prompt).not.toContain(name)
    }
  })
})

describe('提示词示例中性化 · 旧分镜生成器', () => {
  it('批量/单镜提示词常量不含真实项目专名', async () => {
    // 直接读模块内导出的 prompt 常量（若未导出则跳过——由 cogen 覆盖主路径）
    const mod: any = await import('@core/platform/episode-production/narrative/ai/storyboard-generator')
    const candidates = Object.values(mod).filter((v) => typeof v === 'string') as string[]
    for (const text of candidates) {
      for (const name of REAL_PROJECT_NAMES) {
        expect(text).not.toContain(name)
      }
    }
  })
})