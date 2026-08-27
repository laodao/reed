import { describe, it, expect } from 'vitest'
import {
  characterConstraintSuffix,
  characterConstraintNegative,
  framingForCategory,
} from '@core/modules/episode-production/assets/prompts/character-constraints'

describe('character-constraints · framing 语义', () => {
  it('fullBody → 直立全身 + 纯白背景（主图/派生图基准）', () => {
    const suffix = characterConstraintSuffix('fullBody')
    expect(suffix).toMatch(/standing full body/)
    expect(suffix).toMatch(/white background/i)
    expect(suffix).toMatch(/纯白/)
    // 半身 bust 已下线：fullBody 不允许出现 bust 文案
    expect(suffix).not.toMatch(/bust/)
  })

  it('upperBody → 上半身（表情图）', () => {
    const suffix = characterConstraintSuffix('upperBody')
    expect(suffix).toMatch(/upper body shot/)
    expect(suffix).not.toMatch(/full body/)
  })

  it('fullBody negative 禁止半身/特写', () => {
    const neg = characterConstraintNegative('fullBody')
    expect(neg).toMatch(/half body/)
    expect(neg).toMatch(/cropped/)
  })

  it('main category → fullBody（主图为正面全身照）', () => {
    expect(framingForCategory('main')).toBe('fullBody')
  })

  it('view/outfit/pose → fullBody（派生图仍全身）', () => {
    expect(framingForCategory('view')).toBe('fullBody')
    expect(framingForCategory('outfit')).toBe('fullBody')
    expect(framingForCategory('pose')).toBe('fullBody')
  })

  it('expression → upperBody 不变', () => {
    expect(framingForCategory('expression')).toBe('upperBody')
  })
})
