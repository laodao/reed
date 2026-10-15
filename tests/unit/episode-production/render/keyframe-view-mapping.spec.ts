/**
 * keyframe-view-mapping 单测（P-A 多视角定妆选图，2026-09-16）
 * @module tests/unit/episode-production/render/keyframe-view-mapping
 *
 * 分镜 shotType/facing → AssetGallery 派生槽位 label：
 * - close/extreme_close/detail/medium_close → front_half（正面半身）
 * - long/extreme_long/full                  → main（正面全身 = 主图槽位，走兜底主图）
 * - facing=left/right 优先侧身槽位（半身 left_3q/right_3q；全身 full_left/full_right）
 * - medium / 未知景别 / 空 → undefined（不传 view 维度）
 */

import { describe, it, expect } from 'vitest'
import { resolveCharacterViewLabel } from '@core/platform/episode-production/render/keyframe/keyframe-view-mapping'

describe('resolveCharacterViewLabel', () => {
  it('近景镜（无 facing）→ 正面半身', () => {
    for (const st of ['close', 'extreme_close', 'detail', 'medium_close']) {
      expect(resolveCharacterViewLabel(st, null)).toBe('front_half')
      expect(resolveCharacterViewLabel(st, 'front')).toBe('front_half')
    }
  })

  it('远景镜（无 facing）→ main（正面全身主图槽位）', () => {
    for (const st of ['long', 'extreme_long', 'full']) {
      expect(resolveCharacterViewLabel(st, undefined)).toBe('main')
    }
  })

  it('facing=left/right 优先侧身槽位：半身 → left_3q/right_3q', () => {
    expect(resolveCharacterViewLabel('close', 'left')).toBe('left_3q')
    expect(resolveCharacterViewLabel('medium_close', 'right')).toBe('right_3q')
  })

  it('facing=left/right 优先侧身槽位：全身 → full_left/full_right', () => {
    expect(resolveCharacterViewLabel('long', 'left')).toBe('full_left')
    expect(resolveCharacterViewLabel('extreme_long', 'right')).toBe('full_right')
  })

  it('medium / 未知 / 空景别 → undefined', () => {
    expect(resolveCharacterViewLabel('medium', 'left')).toBeUndefined()
    expect(resolveCharacterViewLabel('medium', null)).toBeUndefined()
    expect(resolveCharacterViewLabel('overhead', null)).toBeUndefined()
    expect(resolveCharacterViewLabel(null, 'left')).toBeUndefined()
    expect(resolveCharacterViewLabel(undefined, undefined)).toBeUndefined()
  })

  it('facing=back / three_quarter_* 不触发侧身槽位（仅 left/right）', () => {
    expect(resolveCharacterViewLabel('close', 'back')).toBe('front_half')
    expect(resolveCharacterViewLabel('close', 'three_quarter_left')).toBe('front_half')
  })
})
