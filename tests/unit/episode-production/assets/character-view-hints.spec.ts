/**
 * character-view-hints · 角色图集 slot 语义映射
 * @module tests/unit/episode-production/assets/character-view-hints.spec
 *
 * 验证：半身 slot → upperBody（半身）+ 对应角度描述；全身 slot → fullBody；
 * 确保派生图提示词与业务语义一致（"正面半身"不生成全身）。
 */

import { describe, it, expect } from 'vitest'
import {
  CHARACTER_VIEW_HINTS,
  viewHintForLabel,
} from '@core/platform/episode-production/assets/prompts/character-view-hints'

describe('character-view-hints · 角色图集 slot 语义', () => {
  it('main → 正面全身（fullBody）', () => {
    const h = viewHintForLabel('main')
    expect(h?.framing).toBe('fullBody')
    expect(h?.viewHint).toContain('正面全身')
  })

  it('front_half → 正面半身（upperBody，不是 fullBody）', () => {
    const h = viewHintForLabel('front_half')
    expect(h?.framing).toBe('upperBody')
    expect(h?.viewHint).toContain('正面半身')
    expect(h?.viewHint).not.toContain('全身')
  })

  it('left_3q / right_3q → 四分之三半身（upperBody）', () => {
    expect(viewHintForLabel('left_3q')?.framing).toBe('upperBody')
    expect(viewHintForLabel('left_3q')?.viewHint).toContain('左侧四分之三')
    expect(viewHintForLabel('right_3q')?.framing).toBe('upperBody')
    expect(viewHintForLabel('right_3q')?.viewHint).toContain('右侧四分之三')
  })

  it('full_left / full_right → 左右全身（fullBody）', () => {
    expect(viewHintForLabel('full_left')?.framing).toBe('fullBody')
    expect(viewHintForLabel('full_left')?.viewHint).toContain('左侧全身')
    expect(viewHintForLabel('full_right')?.framing).toBe('fullBody')
    expect(viewHintForLabel('full_right')?.viewHint).toContain('右侧全身')
  })

  it('三视图 label（front / 3q_left / 3q_right）也有映射', () => {
    expect(viewHintForLabel('front')?.framing).toBe('fullBody')
    expect(viewHintForLabel('3q_left')?.viewHint).toContain('四分之三')
    expect(viewHintForLabel('3q_right')?.viewHint).toContain('四分之三')
  })

  it('无匹配 label 返回 null（调用方回退 category 默认）', () => {
    expect(viewHintForLabel('expression')).toBeNull()
    expect(viewHintForLabel(null)).toBeNull()
  })

  it('映射表覆盖 AssetGallery 全部角色 slot', () => {
    for (const slot of ['main', 'front_half', 'left_3q', 'right_3q', 'full_left', 'full_right']) {
      expect(CHARACTER_VIEW_HINTS[slot], `slot ${slot} 应有映射`).toBeTruthy()
    }
  })
})
