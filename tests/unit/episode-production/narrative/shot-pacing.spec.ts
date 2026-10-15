/**
 * shot-pacing 纯函数单测（2026-09-20 EP 管线 prompt 优化 · 任务①b）
 *
 * validateShotPacing 校验矩阵：
 * - 空输入 → 无警告
 * - 合格密度（15s 内 8 镜，平均 ≤2.5s）→ 无密度警告
 * - 低密度（15s 仅 3 镜）→ 警告"低于短剧密度下限 6 镜"，带场景标签
 * - 镜头时长之和 vs 目标总时长：超容差警告 / 容差内不警告 / 未传目标不校验
 * - 单镜 <1s 或 >8s → 警告
 * - duration 非法（0/NaN）→ 警告且不计入总时长
 * - 尾部残余小窗（<10s 内容）不做密度判定
 * - 窗口边界：累加超 15s 切窗，两个满窗分别判定
 */

import { describe, expect, it } from 'vitest'
import { validateShotPacing } from '@core/platform/episode-production/narrative/ai/shot-pacing'

function shots(...durations: number[]): Array<{ duration: number }> {
  return durations.map((d) => ({ duration: d }))
}

describe('validateShotPacing', () => {
  it('空输入 → 无警告', () => {
    expect(validateShotPacing([])).toEqual([])
  })

  it('合格密度（15s 内 8 镜）→ 无密度警告', () => {
    // 2×6 + 1.5×2 = 15s，8 镜，平均 1.875s
    const warnings = validateShotPacing(shots(2, 2, 2, 2, 2, 2, 1.5, 1.5), {
      sceneLabel: '场景 1',
      targetDurationSec: 15,
    })
    expect(warnings).toEqual([])
  })

  it('低密度：15s 仅 3 镜 → 警告"低于短剧密度下限 6 镜"', () => {
    const warnings = validateShotPacing(shots(5, 5, 5), { sceneLabel: '场景 3' })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('场景 3：')
    expect(warnings[0]).toContain('15s 内容仅 3 镜')
    expect(warnings[0]).toContain('低于短剧密度下限 6 镜')
    expect(warnings[0]).toContain('平均每镜 5s > 2.5s')
  })

  it('镜头时长之和与目标不符 → 警告；容差内（±0.5s）不警告', () => {
    const mismatch = validateShotPacing(shots(2, 2, 2, 2, 2, 2), {
      targetDurationSec: 15,
    })
    expect(mismatch.some((w) => w.includes('镜头时长之和 12s 与目标 15s 不符'))).toBe(true)

    const withinTolerance = validateShotPacing(shots(2.6, 2.6, 2.6, 2.6, 2.6, 2.4), {
      targetDurationSec: 15,
    })
    // 15.4 vs 15，差 0.4 在容差内
    expect(withinTolerance.some((w) => w.includes('与目标'))).toBe(false)

    // 未传 targetDurationSec → 不校验时长之和
    const noTarget = validateShotPacing(shots(2, 2))
    expect(noTarget.some((w) => w.includes('与目标'))).toBe(false)
  })

  it('单镜 <1s / >8s → 分别警告', () => {
    const warnings = validateShotPacing(shots(0.5, 9))
    expect(warnings.some((w) => w.includes('第 1 镜仅 0.5s，低于单镜头下限 1s'))).toBe(true)
    expect(warnings.some((w) => w.includes('第 2 镜 9s，超过呼吸镜头上限 8s'))).toBe(true)
  })

  it('duration 非法（0/NaN）→ 警告且不计入总时长', () => {
    const warnings = validateShotPacing(shots(0, NaN, 2), {
      sceneLabel: '场景 2',
      targetDurationSec: 2,
    })
    expect(warnings.filter((w) => w.includes('duration 非法'))).toHaveLength(2)
    // 合法时长之和 2s 与目标 2s 相符 → 无时长之和警告
    expect(warnings.some((w) => w.includes('与目标'))).toBe(false)
  })

  it('尾部残余小窗（<10s）不做密度判定', () => {
    // 满窗 15s/8 镜合格 + 尾部 6s/2 镜（平均 3s 但窗口不满）→ 无密度警告
    const warnings = validateShotPacing(shots(2, 2, 2, 2, 2, 2, 1.5, 1.5, 3, 3))
    expect(warnings).toEqual([])
  })

  it('窗口边界：两个满窗分别判定，低密度窗独立警告', () => {
    // 窗口1：6+6+3=15s 仅 3 镜（低密度）；窗口2：2×6+1.5×2=15s 8 镜（合格）
    const warnings = validateShotPacing(shots(6, 6, 3, 2, 2, 2, 2, 2, 2, 1.5, 1.5), {
      sceneLabel: '场景 5',
    })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('场景 5：')
    expect(warnings[0]).toContain('仅 3 镜')
  })

  it('未传 sceneLabel → 警告无前缀', () => {
    const warnings = validateShotPacing(shots(5, 5, 5))
    expect(warnings[0]).not.toMatch(/^场景/)
    expect(warnings[0]).toContain('低于短剧密度下限')
  })
})
