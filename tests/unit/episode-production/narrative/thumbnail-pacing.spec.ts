/**
 * 缩略图网格节奏与画幅修复单测（提示词优化方案 §3.11，Phase 0 P0）
 * @module tests/unit/episode-production/narrative/thumbnail-pacing
 *
 * 背景（优化前 P0）：节奏指令固定 6 条 9 拍，count 支持 9/16/25——
 * count=16/25 时"第 9 帧：尾声"与"输出 25 帧并排"自相矛盾，第 10-25 格无约束。
 */

import { describe, it, expect } from 'vitest'
import {
  narrativePacingAllocation,
  renderNarrativePacing,
} from '@core/platform/episode-production/narrative/ai/thumbnail-pacing'
import { resolveCellSize } from '@core/platform/episode-production/narrative/ai/storyboard-thumbnail-generator'

describe('renderNarrativePacing · 9 帧保持既有行为', () => {
  const text = renderNarrativePacing(9, 3)

  it('逐字保持优化前的 6 条指令（回归安全）', () => {
    expect(text).toBe(
      [
        '1. 第 1 帧：开场（建立场景 + 主角）',
        '2. 第 2-3 帧：情节展开',
        '3. 第 4-5 帧：冲突 / 转折点',
        '4. 第 6-7 帧：高潮 / 关键动作',
        '5. 第 8 帧：结果',
        '6. 第 9 帧：尾声 / 情绪定格',
      ].join('\n'),
    )
  })

  it('末条仍是"第 9 帧：尾声"', () => {
    expect(text).toContain('第 9 帧：尾声 / 情绪定格')
  })
})

describe('renderNarrativePacing · 帧数动态展开（修复 P0 矛盾）', () => {
  it('16 帧：指令覆盖到第 16 帧，不再停在 9', () => {
    const text = renderNarrativePacing(16, 4)
    // 末条为"第 N-M 帧：尾声…"，N-M 的终点必须是 16
    expect(text).toMatch(/第 \d+-16 帧：尾声 \/ 情绪定格$/)
    expect(text).not.toContain('第 9 帧：尾声')
  })

  it('25 帧：指令覆盖到第 25 帧', () => {
    const text = renderNarrativePacing(25, 5)
    expect(text).toMatch(/第 \d+-25 帧：尾声 \/ 情绪定格$/)
  })

  it('末幕终点恒等于 count（不留无约束空格）', () => {
    for (const count of [9, 16, 25]) {
      const acts = narrativePacingAllocation(count)
      expect(acts[acts.length - 1].to).toBe(count)
    }
  })

  it('三档帧数的分配都无空洞、无重叠、无越界', () => {
    for (const count of [9, 16, 25]) {
      const acts = narrativePacingAllocation(count)
      let expected = 1
      for (const a of acts) {
        expect(a.from).toBe(expected)
        expect(a.to).toBeGreaterThanOrEqual(a.from)
        expected = a.to + 1
      }
      expect(expected - 1).toBe(count)
    }
  })

  it('六幕齐全且顺序不变（开场→尾声）', () => {
    for (const count of [9, 16, 25]) {
      const labels = narrativePacingAllocation(count).map((a) => a.label)
      expect(labels[0]).toContain('开场')
      expect(labels[labels.length - 1]).toContain('尾声')
      expect(labels).toHaveLength(6)
    }
  })

  it('指令条数始终为 6 条（幕结构稳定）', () => {
    for (const count of [9, 16, 25]) {
      expect(renderNarrativePacing(count, Math.sqrt(count)).split('\n')).toHaveLength(6)
    }
  })

  it('各幕帧数分布合理：开场/结果/尾声窄，展开/冲突/高潮宽', () => {
    for (const count of [16, 25]) {
      const acts = narrativePacingAllocation(count)
      const size = (i: number) => acts[i].to - acts[i].from + 1
      // 单纯递增式分配（尾声吞掉后半段）会破坏该断言
      expect(size(5)).toBeLessThanOrEqual(size(1))
      expect(size(5)).toBeLessThanOrEqual(size(3))
      expect(size(0)).toBeLessThan(size(1))
    }
  })

  it('每幕至少 1 帧（无空幕）', () => {
    for (const count of [9, 16, 25]) {
      for (const a of narrativePacingAllocation(count)) {
        expect(a.to).toBeGreaterThanOrEqual(a.from)
      }
    }
  })
})

describe('resolveCellSize · 画幅感知（§3.11）', () => {
  it('16:9 → 512×288 横格', () => {
    expect(resolveCellSize('16:9')).toEqual({ width: 512, height: 288 })
  })

  it('9:16 → 288×512 竖格', () => {
    expect(resolveCellSize('9:16')).toEqual({ width: 288, height: 512 })
  })

  it('1:1 保持历史 512×512', () => {
    expect(resolveCellSize('1:1')).toEqual({ width: 512, height: 512 })
  })

  it('缺省/非法值回落 512×512（不抛错）', () => {
    expect(resolveCellSize(undefined)).toEqual({ width: 512, height: 512 })
    expect(resolveCellSize('abc')).toEqual({ width: 512, height: 512 })
    expect(resolveCellSize('0:9')).toEqual({ width: 512, height: 512 })
  })

  it('边长均为偶数（sharp 切片不产生半像素）', () => {
    for (const r of ['16:9', '9:16', '4:3', '3:4', '21:9']) {
      const c = resolveCellSize(r)
      expect(c.width % 2).toBe(0)
      expect(c.height % 2).toBe(0)
    }
  })
})