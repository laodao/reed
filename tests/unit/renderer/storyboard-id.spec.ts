/**
 * formatGlobalShotId · spec（Phase 2 C8，spec 2026-05-09 ep-redesign §3.2 B5b）
 * @module tests/unit/renderer/storyboard-id
 *
 * 验证全局镜头编号格式：EP{ep:02}_S{scene:02}_SH{shot:02}
 */

import { describe, it, expect } from 'vitest'
import { formatGlobalShotId } from '@/utils/storyboard-id'

describe('formatGlobalShotId', () => {
  it('标准格式 EP01_S03_SH04', () => {
    expect(formatGlobalShotId({ episodeNumber: 1, sceneIndex: 2, shotNumber: 4 })).toBe('EP01_S03_SH04')
  })

  it('episode 缺省 → 默认 EP01', () => {
    expect(formatGlobalShotId({ episodeNumber: null, sceneIndex: 0, shotNumber: 1 })).toBe('EP01_S01_SH01')
    expect(formatGlobalShotId({ sceneIndex: 0, shotNumber: 1 })).toBe('EP01_S01_SH01')
  })

  it('两位数 ep / scene / shot 正确补 0', () => {
    expect(formatGlobalShotId({ episodeNumber: 1, sceneIndex: 0, shotNumber: 1 })).toBe('EP01_S01_SH01')
    expect(formatGlobalShotId({ episodeNumber: 9, sceneIndex: 8, shotNumber: 9 })).toBe('EP09_S09_SH09')
    expect(formatGlobalShotId({ episodeNumber: 10, sceneIndex: 9, shotNumber: 10 })).toBe('EP10_S10_SH10')
  })

  it('sceneIndex 是 0-based，shotNumber 是 1-based', () => {
    // sceneIndex 0 → S01；sceneIndex 1 → S02
    expect(formatGlobalShotId({ episodeNumber: 1, sceneIndex: 0, shotNumber: 1 })).toBe('EP01_S01_SH01')
    expect(formatGlobalShotId({ episodeNumber: 1, sceneIndex: 1, shotNumber: 1 })).toBe('EP01_S02_SH01')
  })

  it('大数字不截断（虽然实际剧集很难超 99）', () => {
    expect(formatGlobalShotId({ episodeNumber: 100, sceneIndex: 99, shotNumber: 100 })).toBe('EP100_S100_SH100')
  })
})
