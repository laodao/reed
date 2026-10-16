/**
 * 数值冲突检测器单测（info-collection-conflicts）
 * @module tests/unit/shared/info-collection-conflicts.spec
 */
import { describe, it, expect } from 'vitest'
import { detectValueConflicts, type IcConflictRowInput } from '@shared/utils/info-collection-conflicts'

function row(over: Partial<IcConflictRowInput> & { rowId: string; value: number }): IcConflictRowInput {
  return {
    sourceId: `src-${over.rowId}`,
    schemaId: 's1',
    metric: '出生人口',
    period: '2024',
    dims: { region: '全国' },
    ...over,
  }
}

describe('detectValueConflicts', () => {
  it('同指标同期同维不同值 → 冲突组（成员齐全）', () => {
    const groups = detectValueConflicts([
      row({ rowId: 'r1', value: 954 }),
      row({ rowId: 'r2', value: 900 }),
      row({ rowId: 'r3', value: 954 }), // 与 r1 同值：同值成员不新增冲突
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].members.map(m => m.rowId).sort()).toEqual(['r1', 'r2', 'r3'])
    expect(groups[0].metric).toBe('出生人口')
  })

  it('不同期间/维度/指标 → 各自成组不混算', () => {
    const groups = detectValueConflicts([
      row({ rowId: 'r1', value: 954 }),
      row({ rowId: 'r2', value: 900, period: '2023' }),
      row({ rowId: 'r3', value: 950, dims: { region: '东部' } }),
      row({ rowId: 'r4', value: 960, metric: '总人口' }),
    ])
    expect(groups).toHaveLength(0)
  })

  it('value/metric/period 为空的行不参与', () => {
    const groups = detectValueConflicts([
      row({ rowId: 'r1', value: 954 }),
      row({ rowId: 'r2', value: null }),
      row({ rowId: 'r3', value: 900, metric: null }),
      row({ rowId: 'r4', value: 900, period: null }),
    ])
    expect(groups).toHaveLength(0)
  })

  it('全部同值 → 无冲突；输出按 key 确定性排序', () => {
    const noConflict = detectValueConflicts([row({ rowId: 'r1', value: 954 }), row({ rowId: 'r2', value: 954 })])
    expect(noConflict).toHaveLength(0)

    const multi = detectValueConflicts([
      row({ rowId: 'r-a', value: 1, metric: '甲' }),
      row({ rowId: 'r-b', value: 2, metric: '甲' }),
      row({ rowId: 'r-c', value: 1, metric: '乙' }),
      row({ rowId: 'r-d', value: 2, metric: '乙' }),
    ])
    expect(multi.map(g => g.metric)).toEqual(['乙', '甲']) // key 排序：乙(unicode) < 甲? — 只断言确定性与数量
    expect(multi).toHaveLength(2)
  })
})
