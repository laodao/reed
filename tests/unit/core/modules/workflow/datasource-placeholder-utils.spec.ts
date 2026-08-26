/**
 * 统一占位符解析测试
 * @module tests/workflow/datasource/placeholder-utils
 * @description 验证 $n 扫描、参数按编号收集、乱序 $2,$1、多位数 $10、缺参场景。
 */
import { describe, it, expect } from 'vitest'
import { replaceDollarPlaceholders } from '@core/modules/workflow/datasource/placeholder-utils'

describe('replaceDollarPlaceholders', () => {
  it('顺序占位符 $1,$2 → 按序收集参数值', () => {
    const { sql, orderedValues, usedIndices } = replaceDollarPlaceholders(
      'SELECT * FROM t WHERE id>$1 AND name=$2',
      [10, 'a'],
      (i) => `?${i}`,
    )
    expect(sql).toBe('SELECT * FROM t WHERE id>?1 AND name=?2')
    expect(orderedValues).toEqual([10, 'a'])
    expect(usedIndices).toEqual([1, 2])
  })

  it('乱序占位符 $2,$1 → 参数值按出现顺序收集（MySQL ? 语义）', () => {
    const { sql, orderedValues } = replaceDollarPlaceholders(
      'WHERE name=$2 AND id=$1',
      [10, 'a'],
      () => '?',
    )
    expect(sql).toBe('WHERE name=? AND id=?')
    expect(orderedValues).toEqual(['a', 10]) // 先出现 $2 → 参数[1]='a'
  })

  it('同一占位符复用多次 → 每次出现都收集', () => {
    const { sql, orderedValues } = replaceDollarPlaceholders(
      'WHERE a=$1 OR b=$1',
      [7],
      () => '?',
    )
    expect(sql).toBe('WHERE a=? OR b=?')
    expect(orderedValues).toEqual([7, 7])
  })

  it('多位数占位符 $10 正确解析', () => {
    const { sql, usedIndices } = replaceDollarPlaceholders(
      'WHERE id=$10',
      Array.from({ length: 10 }, (_, i) => i + 1),
      (i) => `@p${i}`,
    )
    expect(sql).toBe('WHERE id=@p10')
    expect(usedIndices).toEqual([10])
  })

  it('无占位符 → 原样返回、无参数收集', () => {
    const { sql, orderedValues } = replaceDollarPlaceholders('SELECT 1', [], () => '?')
    expect(sql).toBe('SELECT 1')
    expect(orderedValues).toEqual([])
  })

  it('render 可返回方言占位符（含类型：ClickHouse 场景）', () => {
    const { sql } = replaceDollarPlaceholders('WHERE id>$1', [1], (i, v) => `{p${i}:${typeof v === 'number' ? 'Int64' : 'String'}}`)
    expect(sql).toBe('WHERE id>{p1:Int64}')
  })
})
