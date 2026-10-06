/**
 * 语速单一事实源单测（提示词优化方案 §3.8 双写常量清理）
 * @module tests/unit/episode-production/prompts/speech-rate-single-source
 *
 * 优化前 4.5 字/秒写在三处：core `storyboard-cogen.SPEECH_CHARS_PER_SEC`、
 * 提示词正文、renderer `ShotPromptEditor.vue`。§3.8 收敛到 `shared/types` 一处。
 */

import { describe, it, expect } from 'vitest'
import {
  DEFAULT_SPEECH_CHARS_PER_SEC as SHARED_RATES,
  resolveSpeechCharsPerSec as sharedResolve,
  DEFAULT_PROMPT_LANGUAGE,
} from '@shared/types/episode-production/workflow.types'
import {
  DEFAULT_SPEECH_CHARS_PER_SEC as CORE_RATES,
  resolveSpeechCharsPerSec as coreResolve,
} from '@core/platform/episode-production/prompts/prompt-context'
import { SPEECH_CHARS_PER_SEC } from '@core/platform/episode-production/narrative/ai/storyboard-cogen'

describe('§3.8 语速表单一事实源', () => {
  it('core 导入的语速表与 shared 是同一对象', () => {
    expect(CORE_RATES).toBe(SHARED_RATES)
  })

  it('中文默认 4.5 字/秒（历史行为不变）', () => {
    expect(SHARED_RATES.zh).toBe(4.5)
    expect(DEFAULT_PROMPT_LANGUAGE).toBe('zh')
  })

  it('cogen 的历史常量与 shared 值一致（存量引用兼容）', () => {
    expect(SPEECH_CHARS_PER_SEC).toBe(SHARED_RATES.zh)
  })

  it('core 与 shared 的解析函数行为一致', () => {
    const cases: Array<[number | null | undefined, string]> = [
      [6, 'zh'],
      [null, 'zh'],
      [null, 'en'],
      [undefined, 'ja'],
      [0, 'zh'],
      [-1, 'zh'],
      [NaN, 'zh'],
      [null, 'unknown_lang'],
    ]
    for (const [explicit, lang] of cases) {
      expect(coreResolve(explicit, lang)).toBe(sharedResolve(explicit, lang))
    }
  })

  it('多语言默认值齐备（英文项目不会回落到中文语速）', () => {
    expect(sharedResolve(null, 'en')).toBe(15)
    expect(sharedResolve(null, 'ja')).toBe(7)
    expect(sharedResolve(null, 'ko')).toBe(6)
    expect(sharedResolve(null, 'en')).not.toBe(sharedResolve(null, 'zh'))
  })

  it('未知语言回落中文默认', () => {
    expect(sharedResolve(null, 'xyz')).toBe(SHARED_RATES.zh)
    expect(sharedResolve(null, null)).toBe(SHARED_RATES.zh)
    expect(sharedResolve(null, '')).toBe(SHARED_RATES.zh)
  })

  it('显式配置恒优先（含跨语言场景）', () => {
    expect(sharedResolve(9, 'en')).toBe(9)
    expect(sharedResolve(2.5, 'zh')).toBe(2.5)
  })
})