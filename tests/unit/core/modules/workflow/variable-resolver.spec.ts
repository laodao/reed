/**
 * resolveConfigDeep（节点 config 模板深解析）测试
 * @module tests/core/modules/workflow/variable-resolver
 * @description 验证统一深解析：string 模板解析、数组/对象递归、以及
 *              skipKeys（仅顶层键跳过解析，用于 data-table sql 等注入敏感字段）。
 */
import { describe, it, expect } from 'vitest'
import { resolveConfigDeep } from '@core/modules/workflow/engine/variable-resolver'

const resolve = (t: string): string => t.replace(/\{\{\s*start\.x\s*\}\}/g, 'injected')

describe('resolveConfigDeep', () => {
  it('默认解析全部字符串字段（含对象与数组递归）', () => {
    const cfg = {
      name: '{{start.x}}',
      row: { a: '{{start.x}}', b: 1 },
      list: ['{{start.x}}', 'plain'],
    }
    expect(resolveConfigDeep(cfg, resolve)).toEqual({
      name: 'injected',
      row: { a: 'injected', b: 1 },
      list: ['injected', 'plain'],
    })
  })

  it('skipKeys 只在顶层跳过解析，其余仍解析（data-table sql 防注入场景）', () => {
    const cfg = {
      sql: "SELECT * FROM t WHERE name = '{{start.x}}'",
      dataSourceId: '{{start.x}}',
      params: '["{{start.x}}"]',
      nested: { sql: '{{start.x}}' },
    }
    // 顶层 sql 保留原样；nested.sql 是嵌套键、不受 skipKeys 影响仍被解析
    expect(resolveConfigDeep(cfg, resolve, new Set(['sql']))).toEqual({
      sql: "SELECT * FROM t WHERE name = '{{start.x}}'",
      dataSourceId: 'injected',
      params: '["injected"]',
      nested: { sql: 'injected' },
    })
  })

  it('非字符串值原样保留；传入 undefined skipKeys 行为与旧版一致', () => {
    const cfg = { sql: 'SELECT 1', n: 42, flag: true, nil: null }
    expect(resolveConfigDeep(cfg, resolve)).toEqual(cfg)
    expect(resolveConfigDeep(cfg, resolve, undefined)).toEqual(cfg)
  })
})
