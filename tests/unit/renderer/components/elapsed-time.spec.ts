/**
 * elapsed-time 单测（FU5-A4）
 *
 * 边界：null / 未来时间 / <1m / <1h / <1d / <30d / >30d 回退日期。
 */
import { describe, it, expect } from 'vitest'
import { formatElapsed } from '../../../../src/renderer/src/components/episode-production/shared/elapsed-time'

const NOW = 1730000000000 // 固定时间锚点

describe('formatElapsed', () => {
  it('null / undefined / 0 返回空串', () => {
    expect(formatElapsed(null, NOW)).toBe('')
    expect(formatElapsed(undefined, NOW)).toBe('')
    expect(formatElapsed(0, NOW)).toBe('')
  })

  it('未来时间（now < ts）回退为"刚刚"', () => {
    expect(formatElapsed(NOW + 60_000, NOW)).toBe('刚刚')
  })

  it('< 1 分钟 → 刚刚', () => {
    expect(formatElapsed(NOW - 30_000, NOW)).toBe('刚刚')
  })

  it('1 ~ 60 分钟 → N 分钟前', () => {
    expect(formatElapsed(NOW - 60_000, NOW)).toBe('1 分钟前')
    expect(formatElapsed(NOW - 30 * 60_000, NOW)).toBe('30 分钟前')
    expect(formatElapsed(NOW - 59 * 60_000, NOW)).toBe('59 分钟前')
  })

  it('1 ~ 24 小时 → N 小时前', () => {
    expect(formatElapsed(NOW - 60 * 60_000, NOW)).toBe('1 小时前')
    expect(formatElapsed(NOW - 5 * 3600_000, NOW)).toBe('5 小时前')
    expect(formatElapsed(NOW - 23 * 3600_000, NOW)).toBe('23 小时前')
  })

  it('1 ~ 30 天 → N 天前', () => {
    expect(formatElapsed(NOW - 24 * 3600_000, NOW)).toBe('1 天前')
    expect(formatElapsed(NOW - 4 * 86400_000, NOW)).toBe('4 天前')
    expect(formatElapsed(NOW - 29 * 86400_000, NOW)).toBe('29 天前')
  })

  it('> 30 天回退为本地日期字符串', () => {
    const ts = NOW - 60 * 86400_000
    const out = formatElapsed(ts, NOW)
    expect(out).toMatch(/\d/)
    expect(out).not.toContain('天前')
  })
})
