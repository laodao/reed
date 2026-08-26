import { describe, it, expect } from 'vitest'
import {
  characterConstraintSuffix,
  characterConstraintNegative,
  framingForCategory,
} from '@core/modules/episode-production/assets/prompts/character-constraints'

describe('character-constraints · 半身定妆(bust) framing', () => {
  it('bust → 半身 + 白色背景（非全身、非纯色模糊）', () => {
    const suffix = characterConstraintSuffix('bust')
    expect(suffix).toMatch(/bust portrait/)
    expect(suffix).toMatch(/white background/i)
    expect(suffix).toMatch(/白色背景|纯白/)
  })

  it('bust negative 禁止全身/露腿（确保半身）', () => {
    const neg = characterConstraintNegative('bust')
    expect(neg).toMatch(/full body/)
    expect(neg).toMatch(/legs visible/)
  })

  it('main category → bust（主图即半身定妆）', () => {
    expect(framingForCategory('main')).toBe('bust')
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
