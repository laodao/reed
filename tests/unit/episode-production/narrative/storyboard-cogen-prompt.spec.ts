/**
 * storyboard-cogen prompt 命名纪律断言（2026-09-21 v3 实测修复）
 * @module tests/unit/episode-production/narrative/storyboard-cogen-prompt
 *
 * v3 实测：LLM 直接给粗名"雪麓山庄"或裸名"山道"，parent_id 前缀推断失效。
 * prompt 强约束必须包含「大地名+区域名」命名纪律（如"雪麓山庄书房"）。
 */

import { describe, it, expect } from 'vitest'
import { buildCogenPrompt } from '@core/platform/episode-production/narrative/ai/storyboard-cogen'

function fakeScene(): any {
  return {
    sceneNumber: 1,
    location: '雪麓山庄',
    locationType: 'exterior',
    timeOfDay: 'morning',
    weather: '',
    sceneDescription: '山门前景象',
    mood: '',
    lighting: '',
    characters: [],
    narration: '',
    dialogues: [],
    actions: [],
  }
}

describe('buildCogenPrompt · 地点命名纪律', () => {
  it('强约束含「大地名+区域名」命名纪律与示例', () => {
    const prompt = buildCogenPrompt(fakeScene(), [])
    expect(prompt).toContain('大地名+区域名')
    expect(prompt).toContain('雪麓山庄书房')
    expect(prompt).toContain('雪麓山庄山门')
    expect(prompt).toContain('地点命名纪律')
  })

  it('已有资产名单注入与命名纪律共存（回归冒烟）', () => {
    const prompt = buildCogenPrompt(fakeScene(), [
      { kind: 'location', id: 'lb_1', name: '白鹿城', description: '边城' },
    ])
    expect(prompt).toContain('白鹿城')
    expect(prompt).toContain('大地名+区域名')
  })
})
