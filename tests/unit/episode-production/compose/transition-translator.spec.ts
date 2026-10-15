/**
 * transition-translator 单测（P6-T2）
 *
 * 覆盖 spec §5.3 8 种转场到 ffmpeg xfade 关键字的映射 + xfade filter 表达式构造。
 */

import { describe, it, expect } from 'vitest'
import {
  toFfmpegTransition,
  buildXfadeClause,
} from '@core/platform/episode-production/compose/transition-translator'
import type { TransitionConfig } from '@shared/types/episode-production'

describe('toFfmpegTransition', () => {
  it('cut → 不需要 xfade（needsXfade=false / xfadeName=null）', () => {
    const r = toFfmpegTransition({ type: 'cut', duration: 0 })
    expect(r.needsXfade).toBe(false)
    expect(r.xfadeName).toBeNull()
    expect(r.durationSec).toBe(0)
  })

  it('fade（无 color）→ fade', () => {
    const r = toFfmpegTransition({ type: 'fade', duration: 500 })
    expect(r.xfadeName).toBe('fade')
    expect(r.durationSec).toBe(0.5)
    expect(r.needsXfade).toBe(true)
  })

  it('fade + color black → fadeblack', () => {
    expect(toFfmpegTransition({ type: 'fade', duration: 500, color: 'black' }).xfadeName).toBe(
      'fadeblack',
    )
    expect(
      toFfmpegTransition({ type: 'fade', duration: 500, color: '#000' }).xfadeName,
    ).toBe('fadeblack')
    expect(
      toFfmpegTransition({ type: 'fade', duration: 500, color: '#000000' }).xfadeName,
    ).toBe('fadeblack')
  })

  it('fade + color white → fadewhite', () => {
    expect(
      toFfmpegTransition({ type: 'fade', duration: 500, color: 'white' }).xfadeName,
    ).toBe('fadewhite')
    expect(
      toFfmpegTransition({ type: 'fade', duration: 500, color: '#fff' }).xfadeName,
    ).toBe('fadewhite')
  })

  it('dissolve / zoom / iris / whip 直映射', () => {
    expect(toFfmpegTransition({ type: 'dissolve', duration: 500 }).xfadeName).toBe(
      'dissolve',
    )
    expect(toFfmpegTransition({ type: 'zoom', duration: 500 }).xfadeName).toBe('zoomin')
    expect(toFfmpegTransition({ type: 'iris', duration: 500 }).xfadeName).toBe(
      'circleopen',
    )
    expect(toFfmpegTransition({ type: 'whip', duration: 500 }).xfadeName).toBe('hblur')
  })

  it('wipe + 4 个 direction → wipe{left,right,up,down}', () => {
    for (const dir of ['left', 'right', 'up', 'down'] as const) {
      const cfg: TransitionConfig = { type: 'wipe', duration: 500, direction: dir }
      expect(toFfmpegTransition(cfg).xfadeName).toBe(`wipe${dir}`)
    }
  })

  it('slide + direction', () => {
    for (const dir of ['left', 'right', 'up', 'down'] as const) {
      const cfg: TransitionConfig = { type: 'slide', duration: 500, direction: dir }
      expect(toFfmpegTransition(cfg).xfadeName).toBe(`slide${dir}`)
    }
  })

  it('wipe / slide 无 direction → 默认 left', () => {
    expect(toFfmpegTransition({ type: 'wipe', duration: 500 }).xfadeName).toBe('wipeleft')
    expect(toFfmpegTransition({ type: 'slide', duration: 500 }).xfadeName).toBe('slideleft')
  })

  it('duration 0 → needsXfade=false（哪怕 type 不是 cut）', () => {
    const r = toFfmpegTransition({ type: 'fade', duration: 0 })
    expect(r.needsXfade).toBe(false)
  })
})

describe('buildXfadeClause', () => {
  it('cut → null（caller concat）', () => {
    const plan = toFfmpegTransition({ type: 'cut', duration: 0 })
    expect(buildXfadeClause(plan, 5)).toBeNull()
  })

  it('dissolve 0.5 秒 + prevEnd=3 → xfade=transition=dissolve:duration=0.500:offset=2.500', () => {
    const plan = toFfmpegTransition({ type: 'dissolve', duration: 500 })
    const clause = buildXfadeClause(plan, 3)
    expect(clause).toBe('xfade=transition=dissolve:duration=0.5:offset=2.5')
  })

  it('offset 不会为负（prevEnd < duration 时 clamp 到 0）', () => {
    const plan = toFfmpegTransition({ type: 'fade', duration: 1000 }) // 1s
    const clause = buildXfadeClause(plan, 0.5) // prev 只占 0.5 秒
    expect(clause).toContain('offset=0')
  })

  it('zoomin 转场表达式正确', () => {
    const plan = toFfmpegTransition({ type: 'zoom', duration: 800 })
    const clause = buildXfadeClause(plan, 4)
    expect(clause).toContain('zoomin')
    expect(clause).toContain('duration=0.8')
    expect(clause).toContain('offset=3.2')
  })
})
