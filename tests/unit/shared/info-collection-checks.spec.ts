/**
 * 恒等式校验引擎单测（info-collection-checks）
 * @module tests/unit/shared/info-collection-checks.spec
 *
 * 钉死：勾稽求值（同期同维分组）、相对容差、缺科目跳过、解析失败 fail-soft、
 * 多维/多期分组互不串账。这是通用数据自洽机制——用例用通用科目名，不绑领域。
 */
import { describe, it, expect } from 'vitest'
import { evaluateChecks, dimsGroupKey } from '@shared/utils/info-collection-checks'
import type { IcCheckRowInput } from '@shared/utils/info-collection-checks'

/** 2024 期的一组平衡数据：A = B + C */
function balanced2024(over: Partial<Record<'A' | 'B' | 'C', number>> = {}): IcCheckRowInput[] {
  const v = { A: 100, B: 60, C: 40, ...over }
  return [
    { metric: 'A', period: '2024', value: v.A },
    { metric: 'B', period: '2024', value: v.B },
    { metric: 'C', period: '2024', value: v.C },
  ]
}

describe('dimsGroupKey', () => {
  it('period + dims（键排序）构成稳定分组键；空 dims 归同组', () => {
    expect(dimsGroupKey('2024', { region: '东', sector: '甲' })).toBe('2024|region=东&sector=甲')
    expect(dimsGroupKey('2024')).toBe('2024|')
    expect(dimsGroupKey('2024', {})).toBe('2024|')
    expect(dimsGroupKey(null)).toBe('|')
  })
})

describe('evaluateChecks', () => {
  it('账平 → ok=true（diffRatio 0）', () => {
    const findings = evaluateChecks([{ expr: 'A = B + C' }], balanced2024())
    expect(findings).toHaveLength(1)
    expect(findings[0].skipped).toBe(false)
    expect(findings[0].ok).toBe(true)
    expect(findings[0].left).toBe(100)
    expect(findings[0].right).toBe(100)
  })

  it('账不平 → ok=false，diffRatio 正确；容差内 → ok', () => {
    const findings = evaluateChecks([{ expr: 'A = B + C' }], balanced2024({ A: 101 }))
    expect(findings[0].ok).toBe(false)
    expect(findings[0].diffRatio).toBeCloseTo(1 / 101, 6)

    const within = evaluateChecks([{ expr: 'A = B + C', tolerance: 0.02 }], balanced2024({ A: 101 }))
    expect(within[0].ok).toBe(true)
  })

  it('多项加减：A = B + C - D', () => {
    const rows: IcCheckRowInput[] = [
      { metric: 'A', period: '2024', value: 50 },
      { metric: 'B', period: '2024', value: 80 },
      { metric: 'C', period: '2024', value: 40 },
      { metric: 'D', period: '2024', value: 70 },
    ]
    const findings = evaluateChecks([{ expr: 'A = B + C - D' }], rows)
    expect(findings[0].ok).toBe(true)
    expect(findings[0].right).toBe(50)
  })

  it('缺科目 → skipped=true（不误杀部分数据），missingMetrics 指明缺口', () => {
    const findings = evaluateChecks([{ expr: 'A = B + C' }], [{ metric: 'A', period: '2024', value: 100 }])
    expect(findings[0].skipped).toBe(true)
    expect(findings[0].missingMetrics.sort()).toEqual(['B', 'C'])
  })

  it('多期分组互不串账：2023 平、2024 不平', () => {
    const rows = [
      { metric: 'A', period: '2023', value: 100 },
      { metric: 'B', period: '2023', value: 60 },
      { metric: 'C', period: '2023', value: 40 },
      { metric: 'A', period: '2024', value: 999 },
      { metric: 'B', period: '2024', value: 60 },
      { metric: 'C', period: '2024', value: 40 },
    ]
    const findings = evaluateChecks([{ expr: 'A = B + C' }], rows)
    expect(findings).toHaveLength(2)
    const byPeriod = new Map(findings.map(f => [f.groupId, f]))
    expect(byPeriod.get('2023|')!.ok).toBe(true)
    expect(byPeriod.get('2024|')!.ok).toBe(false)
  })

  it('dims 维度分开算账：同期不同维各求各的', () => {
    const rows: IcCheckRowInput[] = [
      { metric: 'A', period: '2024', dims: { region: '东' }, value: 100 },
      { metric: 'B', period: '2024', dims: { region: '东' }, value: 60 },
      { metric: 'C', period: '2024', dims: { region: '东' }, value: 40 },
      { metric: 'A', period: '2024', dims: { region: '西' }, value: 30 },
      { metric: 'B', period: '2024', dims: { region: '西' }, value: 60 },
      { metric: 'C', period: '2024', dims: { region: '西' }, value: 40 },
    ]
    const findings = evaluateChecks([{ expr: 'A = B + C' }], rows)
    expect(findings).toHaveLength(2)
    const byGroup = new Map(findings.map(f => [f.groupId, f]))
    expect(byGroup.get('2024|region=东')!.ok).toBe(true)
    expect(byGroup.get('2024|region=西')!.ok).toBe(false)
  })

  it('同组同科目多行求和后参与校验', () => {
    const rows: IcCheckRowInput[] = [
      { metric: 'A', period: '2024', value: 100 },
      { metric: 'B', period: '2024', value: 30 },
      { metric: 'B', period: '2024', value: 30 },
      { metric: 'C', period: '2024', value: 40 },
    ]
    expect(evaluateChecks([{ expr: 'A = B + C' }], rows)[0].ok).toBe(true)
  })

  it('解析失败 → fail-soft skipped（坏规则不毁整批）', () => {
    const findings = evaluateChecks(
      [{ expr: '没有等号的规则' }, { expr: 'A = ' }, { expr: 'A = B + C' }],
      balanced2024(),
    )
    expect(findings).toHaveLength(3)
    expect(findings[0].skipped).toBe(true)
    expect(findings[0].detail).toContain('缺少 =')
    expect(findings[1].skipped).toBe(true)
    expect(findings[2].ok).toBe(true)
  })

  it('value 为 null/NaN 的行不参与求和', () => {
    const rows: IcCheckRowInput[] = [
      ...balanced2024(),
      { metric: 'A', period: '2024', value: null },
      { metric: 'B', period: '2024', value: Number.NaN },
    ]
    expect(evaluateChecks([{ expr: 'A = B + C' }], rows)[0].ok).toBe(true)
  })
})
