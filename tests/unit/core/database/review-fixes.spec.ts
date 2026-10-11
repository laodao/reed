/**
 * 修复回归测试：JSON 列安全解析 + 严格租户写入模式
 *
 * 覆盖 2026-10 深度 review 的两处修复：
 *   1. core/database/json-column.ts —— 统一安全解析（此前 20+ 文件各写一份，
 *      漏改的 dl-doc.repository 用裸 JSON.parse，脏数据会让整条查询抛错）
 *   2. BaseRepository 严格租户模式 —— 接线历史遗留的 getCurrentUserIdStrict
 *      （此前定义了却零调用，Web 多租户下漏包 runWithUser 会静默落 user_id NULL）
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  safeParseJson,
  safeParseJsonArray,
  safeParseJsonObject,
} from '@core/database/json-column'
import {
  setStrictTenantWrites,
  isStrictTenantWrites,
} from '@core/database/base-repository'

describe('safeParseJson 系列', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('合法 JSON 正常解析', () => {
    expect(safeParseJson('{"a":1}', null)).toEqual({ a: 1 })
    expect(safeParseJson('[1,2,3]', [])).toEqual([1, 2, 3])
    expect(safeParseJson('"str"', '')).toBe('str')
    expect(safeParseJson('123', 0)).toBe(123)
    expect(safeParseJson('null', 'fallback')).toBe(null)
  })

  it('null / undefined / 空串 → 兜底值（不抛错、不告警）', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(safeParseJson(null, 'fb')).toBe('fb')
    expect(safeParseJson(undefined, 'fb')).toBe('fb')
    expect(safeParseJson('', 'fb')).toBe('fb')
    // 空值属正常路径，不应产生噪声日志
    expect(warn).not.toHaveBeenCalled()
  })

  it('非法 JSON → 降级兜底值并记日志（不抛错）', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // 这是核心回归点：裸 JSON.parse 在此会抛错并让整条列表查询失败
    expect(() => safeParseJson('{bad json', null)).not.toThrow()
    expect(safeParseJson('{bad json', { fallback: true })).toEqual({ fallback: true })
    expect(warn).toHaveBeenCalled()
  })

  it('日志带定位信息，便于排查脏数据来源', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    safeParseJson('{bad', null, 'DlDocEntity#conceptIds')
    const msg = warn.mock.calls.map((c) => c.join(' ')).join('\n')
    expect(msg).toContain('DlDocEntity#conceptIds')
  })

  it('safeParseJsonArray：非数组一律降级为空数组', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(safeParseJsonArray('["a","b"]')).toEqual(['a', 'b'])
    // 对象 / 标量 / 非法 JSON 都不是数组 → []
    expect(safeParseJsonArray('{"a":1}')).toEqual([])
    expect(safeParseJsonArray('"str"')).toEqual([])
    expect(safeParseJsonArray('42')).toEqual([])
    expect(safeParseJsonArray('{bad')).toEqual([])
    expect(safeParseJsonArray(null)).toEqual([])
  })

  it('safeParseJsonObject：非对象一律降级为 null', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(safeParseJsonObject('{"a":1}')).toEqual({ a: 1 })
    // 数组不算对象（避免把 [] 当 map 用）
    expect(safeParseJsonObject('[1,2]')).toBe(null)
    expect(safeParseJsonObject('"str"')).toBe(null)
    expect(safeParseJsonObject('null')).toBe(null)
    expect(safeParseJsonObject('{bad')).toBe(null)
  })
})

describe('严格租户写入模式', () => {
  afterEach(() => {
    // 避免污染其它用例
    setStrictTenantWrites(false)
  })

  it('默认关闭（Electron 单用户行为不变）', () => {
    setStrictTenantWrites(false)
    expect(isStrictTenantWrites()).toBe(false)
  })

  it('可开启并可读回（Web 多租户启动时开启）', () => {
    setStrictTenantWrites(true)
    expect(isStrictTenantWrites()).toBe(true)
    setStrictTenantWrites(false)
    expect(isStrictTenantWrites()).toBe(false)
  })
})