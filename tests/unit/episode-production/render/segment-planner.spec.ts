/**
 * segment-planner 纯函数单测（tasks/2026-09-04-ep-video-segment-redesign §3/§5）
 *
 * 拆分规则矩阵：
 * - 预算内全并一段
 * - 累加超预算切分（严格大于才切）
 * - 恰好等于预算不切
 * - 单镜超预算独成段（且不影响后续镜头重新累加）
 * - 场景边界由调用方分组保证（逐场景调用 → 不跨场景）
 * - 非法时长（0/NaN）按默认 3s 计
 * - 预算收敛：默认 15s，clamp 5–30s
 *
 * 提示词拼接：
 * - 多镜按序拼接"镜头N（约Xs）：<frameDescription>"
 * - 含总时长 / 宽高比 / 一致性约束
 * - 单镜无"多镜头一致性"约束句
 */

import { describe, expect, it } from 'vitest'
import {
  splitShotsIntoSegments,
  buildSegmentPrompt,
  clampBudgetSec,
  DEFAULT_SEGMENT_BUDGET_SEC,
} from '@core/platform/episode-production/render/video/segment-planner'

function shots(...durations: number[]): Array<{ id: string; duration: number }> {
  return durations.map((d, i) => ({ id: `sb${i + 1}`, duration: d }))
}

describe('clampBudgetSec', () => {
  it('缺省/非法 → 默认 15s', () => {
    expect(clampBudgetSec(undefined)).toBe(DEFAULT_SEGMENT_BUDGET_SEC)
    expect(clampBudgetSec(null)).toBe(DEFAULT_SEGMENT_BUDGET_SEC)
    expect(clampBudgetSec(0)).toBe(DEFAULT_SEGMENT_BUDGET_SEC)
    expect(clampBudgetSec(NaN)).toBe(DEFAULT_SEGMENT_BUDGET_SEC)
    expect(DEFAULT_SEGMENT_BUDGET_SEC).toBe(15)
  })

  it('收敛到 5–30s', () => {
    expect(clampBudgetSec(1)).toBe(5)
    expect(clampBudgetSec(5)).toBe(5)
    expect(clampBudgetSec(20)).toBe(20)
    expect(clampBudgetSec(99)).toBe(30)
  })
})

describe('splitShotsIntoSegments', () => {
  it('空输入 → 空数组', () => {
    expect(splitShotsIntoSegments([], 15)).toEqual([])
  })

  it('总时长在预算内 → 全并一段', () => {
    const segs = splitShotsIntoSegments(shots(4, 4, 4), 15)
    expect(segs.map(s => s.map(x => x.id))).toEqual([['sb1', 'sb2', 'sb3']])
  })

  it('累加超预算 → 在下一镜前切分', () => {
    // 5+5+5=15 满；第 4 镜 5s 会超 → 切
    const segs = splitShotsIntoSegments(shots(5, 5, 5, 5), 15)
    expect(segs.map(s => s.map(x => x.id))).toEqual([
      ['sb1', 'sb2', 'sb3'],
      ['sb4'],
    ])
  })

  it('恰好等于预算 → 不切', () => {
    const segs = splitShotsIntoSegments(shots(7, 8), 15)
    expect(segs).toHaveLength(1)
  })

  it('单镜超预算 → 独成一段', () => {
    const segs = splitShotsIntoSegments(shots(3, 20, 3), 15)
    expect(segs.map(s => s.map(x => x.id))).toEqual([['sb1'], ['sb2'], ['sb3']])
  })

  it('单镜超预算后后续镜头重新累加（不被迫独占）', () => {
    const segs = splitShotsIntoSegments(shots(20, 4, 4), 15)
    expect(segs.map(s => s.map(x => x.id))).toEqual([['sb1'], ['sb2', 'sb3']])
  })

  it('多轮切分：7 镜 ×5s 预算 15s → 3+3+1', () => {
    const segs = splitShotsIntoSegments(shots(5, 5, 5, 5, 5, 5, 5), 15)
    expect(segs.map(s => s.length)).toEqual([3, 3, 1])
  })

  it('非法时长（0/NaN）按默认 3s 计', () => {
    const segs = splitShotsIntoSegments(shots(0, NaN, 10), 15)
    // 3 + 3 + 10 = 16 > 15 → 第三镜切
    expect(segs.map(s => s.map(x => x.id))).toEqual([['sb1', 'sb2'], ['sb3']])
  })

  it('预算也走 clamp（1 → 5s 预算）', () => {
    const segs = splitShotsIntoSegments(shots(4, 4), 1)
    expect(segs).toHaveLength(2)
  })
})

describe('buildSegmentPrompt', () => {
  it('多镜按序拼接 + 总时长/宽高比/一致性约束', () => {
    const p = buildSegmentPrompt(
      [
        { frameDescription: '苏晚伏案修书', duration: 5 },
        { frameDescription: '古书无风自动', duration: 4 },
      ],
      { width: 1920, height: 1080 },
    )
    expect(p).toContain('镜头1（约5s）：苏晚伏案修书')
    expect(p).toContain('镜头2（约4s）：古书无风自动')
    expect(p.indexOf('镜头1')).toBeLessThan(p.indexOf('镜头2'))
    expect(p).toContain('总时长约9s')
    expect(p).toContain('画面比例 16:9（1920x1080）')
    expect(p).toContain('风格一致')
  })

  it('单镜：无"多镜头一致性"约束句', () => {
    const p = buildSegmentPrompt(
      [{ frameDescription: '窗外灰大衣身影', duration: 6 }],
      { width: 1080, height: 1920 },
    )
    expect(p).toContain('镜头1（约6s）：窗外灰大衣身影')
    expect(p).toContain('画面比例 9:16（1080x1920）')
    expect(p).not.toContain('多个镜头之间')
  })

  it('缺省尺寸 → 无宽高比约束；非法时长按 3s 计入总时长', () => {
    const p = buildSegmentPrompt([{ frameDescription: 'x', duration: 0 }])
    expect(p).not.toContain('画面比例')
    expect(p).toContain('总时长约3s')
  })

  it('@[资产@索引] 标记替换为资产名纯文本（2026-09-18 数据面补全）', () => {
    const p = buildSegmentPrompt([
      { frameDescription: '@[杜十娘] 推门进入，@[杜十娘@2] 回头', duration: 5 },
    ])
    expect(p).toContain('杜十娘 推门进入，杜十娘 回头')
    expect(p).not.toContain('@[')
  })

  it('景别/角度/运镜拼进镜头头（中文标签）', () => {
    const p = buildSegmentPrompt([
      {
        frameDescription: '苏晚伏案修书',
        duration: 5,
        shotType: 'full',
        cameraAngle: 'low',
        cameraMovement: 'dolly_in',
      },
    ])
    expect(p).toContain('镜头1（约5s，全景，仰拍，推镜）：苏晚伏案修书')
  })

  it('未知枚举值静默省略，镜头头退化为只有时长', () => {
    const p = buildSegmentPrompt([
      { frameDescription: 'x', duration: 3, shotType: 'weird', cameraMovement: 'unknown_move' },
    ])
    expect(p).toContain('镜头1（约3s）：x')
  })

  it('项目风格词追加「画面风格」约束；未传则没有', () => {
    const withStyle = buildSegmentPrompt(
      [{ frameDescription: 'x', duration: 3 }],
      { stylePrompt: '冷青色调，电影质感' },
    )
    expect(withStyle).toContain('画面风格：冷青色调，电影质感')
    const without = buildSegmentPrompt([{ frameDescription: 'x', duration: 3 }])
    expect(without).not.toContain('画面风格')
  })
})
