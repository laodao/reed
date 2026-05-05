/**
 * keyframe-chain-strategy 单测（P5-T7）
 * @module tests/unit/episode-production/render/keyframe-chain-strategy
 *
 * 覆盖 spec §4.3 全部规则：
 * - planKeyframes：1/2/3/5/9 帧 + 边界 clamp
 * - 生成顺序：start → end → middle 升序
 * - timePercent 等距分布
 * - referenceFrameIndexes 参考链：start=[] / end=[0] / middle=[0, last]
 * - planRegenPropagation：改 start/middle/end 的传播规则
 * - describeFrameMoment：三档时刻文案
 */

import { describe, it, expect } from 'vitest'
import {
  planKeyframes,
  planRegenPropagation,
  describeFrameMoment,
} from '@core/modules/episode-production/render/keyframe/keyframe-chain-strategy'

describe('planKeyframes', () => {
  it('1 帧：仅 start，无参考', () => {
    const p = planKeyframes(1)
    expect(p).toEqual([
      { frameIndex: 0, frameRole: 'start', timePercent: 0, referenceFrameIndexes: [] },
    ])
  })

  it('2 帧（首尾）：start + end，end 参考 start', () => {
    const p = planKeyframes(2)
    expect(p).toHaveLength(2)
    expect(p[0]).toMatchObject({ frameIndex: 0, frameRole: 'start', timePercent: 0 })
    expect(p[0].referenceFrameIndexes).toEqual([])
    expect(p[1]).toMatchObject({ frameIndex: 1, frameRole: 'end', timePercent: 1 })
    expect(p[1].referenceFrameIndexes).toEqual([0])
  })

  it('3 帧：plan 顺序 start → end → middle，middle 参考 [start, end]', () => {
    const p = planKeyframes(3)
    expect(p.map((x) => x.frameRole)).toEqual(['start', 'end', 'middle'])
    expect(p.map((x) => x.frameIndex)).toEqual([0, 2, 1])
    const middle = p[2]
    expect(middle.timePercent).toBeCloseTo(0.5, 5)
    expect(middle.referenceFrameIndexes).toEqual([0, 2])
  })

  it('5 帧：3 个 middle 按 frameIndex 升序，timePercent 等距', () => {
    const p = planKeyframes(5)
    expect(p[0].frameRole).toBe('start')
    expect(p[1].frameRole).toBe('end')
    // 之后是 middle 升序
    const middles = p.slice(2)
    expect(middles.map((m) => m.frameIndex)).toEqual([1, 2, 3])
    expect(middles.map((m) => m.frameRole)).toEqual(['middle', 'middle', 'middle'])
    expect(middles[0].timePercent).toBeCloseTo(0.25, 5)
    expect(middles[1].timePercent).toBeCloseTo(0.5, 5)
    expect(middles[2].timePercent).toBeCloseTo(0.75, 5)
    for (const m of middles) {
      expect(m.referenceFrameIndexes).toEqual([0, 4])
    }
  })

  it('9 帧：上限正常工作', () => {
    const p = planKeyframes(9)
    expect(p).toHaveLength(9)
    expect(p[1].frameIndex).toBe(8) // end
  })

  it('Clamp：0/负数 → 1 帧；>9 → 9 帧；非整数 → floor', () => {
    expect(planKeyframes(0)).toHaveLength(1)
    expect(planKeyframes(-3)).toHaveLength(1)
    expect(planKeyframes(20)).toHaveLength(9)
    expect(planKeyframes(3.7)).toHaveLength(3)
  })
})

describe('planRegenPropagation', () => {
  it('改 start（5 帧）→ required=[0], suggested=[1,2,3,4]', () => {
    const r = planRegenPropagation(0, 5)
    expect(r.required).toEqual([0])
    expect(r.suggested).toEqual([1, 2, 3, 4])
  })

  it('改 end（5 帧）→ required=[4], suggested=[1,2,3]（仅 middle）', () => {
    const r = planRegenPropagation(4, 5)
    expect(r.required).toEqual([4])
    expect(r.suggested).toEqual([1, 2, 3])
  })

  it('改 middle（5 帧的第 2 帧）→ required=[2], suggested=[]', () => {
    const r = planRegenPropagation(2, 5)
    expect(r.required).toEqual([2])
    expect(r.suggested).toEqual([])
  })

  it('1 帧：改 0 → required=[0], suggested=[]', () => {
    const r = planRegenPropagation(0, 1)
    expect(r.required).toEqual([0])
    expect(r.suggested).toEqual([])
  })

  it('2 帧（无 middle）：改 start → required=[0], suggested=[1]（仅 end）', () => {
    const r = planRegenPropagation(0, 2)
    expect(r.required).toEqual([0])
    expect(r.suggested).toEqual([1])
  })

  it('2 帧：改 end → required=[1], suggested=[]', () => {
    const r = planRegenPropagation(1, 2)
    expect(r.required).toEqual([1])
    expect(r.suggested).toEqual([])
  })

  it('越界 frameIndex → required=[], suggested=[]', () => {
    const r = planRegenPropagation(99, 5)
    expect(r.required).toEqual([])
    expect(r.suggested).toEqual([])
  })
})

describe('describeFrameMoment', () => {
  it('start / middle / end 输出不同时刻文案', () => {
    expect(describeFrameMoment('start', 0)).toContain('开始时刻')
    expect(describeFrameMoment('end', 1)).toContain('结束时刻')
    expect(describeFrameMoment('middle', 0.5)).toContain('50%')
    expect(describeFrameMoment('extra', 0)).toContain('附加')
  })
})
