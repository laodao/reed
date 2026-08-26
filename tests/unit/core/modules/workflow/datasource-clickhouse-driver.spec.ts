/**
 * ClickHouse HTTP 驱动适配器测试
 * @module tests/workflow/datasource/clickhouse-driver
 * @description mock 全局 fetch：验证 URL 构造（query/default_format）、HTTP 基础认证头、
 *              参数化 $1 → {p1:Type} + param_p1 值、JSONEachRow 解析、错误抛错。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ClickHouseDriverAdapter } from '@core/modules/workflow/datasource/drivers/clickhouse-driver'

const adapter = new ClickHouseDriverAdapter()
const params = { host: 'ch.internal', port: 8123, database: 'analytics', username: 'default', password: 'pw' } as const

function mockFetch(ok: boolean, text: string, status = 200) {
  const fn = vi.fn(async () => new Response(text, { status, ok }))
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('ClickHouseDriverAdapter', () => {
  beforeEach(() => vi.unstubAllGlobals())
  afterEach(() => vi.unstubAllGlobals())

  it('testConnection: 成功 → 解析版本', async () => {
    const fn = mockFetch(true, '{"v":"24.3.1.2671"}')
    const res = await adapter.testConnection(params as any)
    expect(res.success).toBe(true)
    expect(res.serverVersion).toContain('24.3')
    // URL 含 query 与 default_format
    const url = String(fn.mock.calls[0][0])
    expect(url).toContain('default_format=JSONEachRow')
  })

  it('testConnection: HTTP 非 2xx → 失败 + 状态码', async () => {
    mockFetch(false, 'Code: 516. DB::Exception', 500)
    const res = await adapter.testConnection(params as any)
    expect(res.success).toBe(false)
    expect(res.message).toContain('HTTP 500')
  })

  it('testConnection: 网络错误 → 失败不抛', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
    const res = await adapter.testConnection(params as any)
    expect(res.success).toBe(false)
    expect(res.message).toContain('ECONNREFUSED')
  })

  it('query: 参数化 $1 → {p1:Type} 且 URL 带 param_p1', async () => {
    const fn = mockFetch(true, '{"id":1,"name":"a"}\n{"id":2,"name":"b"}')
    const res = await adapter.query(params as any, 'SELECT * FROM orders WHERE id>$1', [1])
    expect(res.rows).toEqual([{ id: 1, name: 'a' }, { id: 2, name: 'b' }])
    expect(res.columns).toEqual(['id', 'name'])
    const url = String(fn.mock.calls[0][0])
    expect(url).toContain('param_p1=1')
    // {p1:Int64} 会被 URL 编码；解码后应包含占位符与类型
    expect(decodeURIComponent(url)).toContain('{p1:Int64}')
  })

  it('query: 基础认证头带 user:pass', async () => {
    const fn = mockFetch(true, '{"v":"1"}')
    await adapter.query(params as any, 'SELECT 1')
    const headers = fn.mock.calls[0][1].headers as Record<string, string>
    expect(headers['Authorization']).toContain('Basic')
  })

  it('query: HTTP 错误 → 抛错（含状态码）', async () => {
    mockFetch(false, 'DB::Exception: Syntax error', 400)
    await expect(adapter.query(params as any, 'SELECT bad')).rejects.toThrow('HTTP 400')
  })

  it('query: 空结果 → 空 rows/columns', async () => {
    mockFetch(true, '')
    const res = await adapter.query(params as any, 'SELECT * FROM empty')
    expect(res.rows).toEqual([])
    expect(res.columns).toEqual([])
  })
})
