/**
 * ClickHouse HTTP 驱动适配器测试
 * @module tests/workflow/datasource/clickhouse-driver
 * @description mock 全局 fetch：验证 POST body 传输（SQL/参数不进 URL）、HTTP 基础认证头、
 *              参数化 $1 → {p1:Type} + param_p1 值、JSONEachRow 解析、错误抛错。
 *              评审 #24：SQL 与参数值严禁出现在 URL query string（会落代理/查询日志）。
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

function parseBody(init: any): URLSearchParams {
  return new URLSearchParams(String(init?.body ?? ''))
}

describe('ClickHouseDriverAdapter', () => {
  beforeEach(() => vi.unstubAllGlobals())
  afterEach(() => vi.unstubAllGlobals())

  it('testConnection: 成功 → 解析版本，SQL 在 body 而非 URL', async () => {
    const fn = mockFetch(true, '{"v":"24.3.1.2671"}')
    const res = await adapter.testConnection(params as any)
    expect(res.success).toBe(true)
    expect(res.serverVersion).toContain('24.3')
    const url = String(fn.mock.calls[0][0])
    // URL 只允许非敏感的 default_format
    expect(url).toContain('default_format=JSONEachRow')
    expect(url).not.toContain('query=')
    const body = parseBody(fn.mock.calls[0][1])
    expect(body.get('query')).toContain('SELECT version()')
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

  it('query: 参数化 $1 → {p1:Type}，SQL 与参数值都在 POST body', async () => {
    const fn = mockFetch(true, '{"id":1,"name":"a"}\n{"id":2,"name":"b"}')
    const res = await adapter.query(params as any, 'SELECT * FROM orders WHERE id>$1', [1])
    expect(res.rows).toEqual([{ id: 1, name: 'a' }, { id: 2, name: 'b' }])
    expect(res.columns).toEqual(['id', 'name'])
    const url = String(fn.mock.calls[0][0])
    // #24：SQL 和参数值不得出现在 URL query string
    expect(url).not.toContain('param_p1')
    expect(url).not.toContain('query=')
    const body = parseBody(fn.mock.calls[0][1])
    expect(body.get('param_p1')).toBe('1')
    expect(body.get('query')).toContain('{p1:Int64}')
    // {p1:Int64} 会被编码；解码后应包含占位符与类型
    expect(decodeURIComponent(body.get('query') ?? '')).toContain('{p1:Int64}')
    expect((fn.mock.calls[0][1].headers as Record<string, string>)['Content-Type']).toContain('application/x-www-form-urlencoded')
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

  it('query: 多参数乱序 → 各 param_pN 均在 body', async () => {
    const fn = mockFetch(true, '{"n":1}')
    await adapter.query(params as any, 'SELECT $2 AS n WHERE id = $1', [7, 'hello'])
    const body = parseBody(fn.mock.calls[0][1])
    expect(body.get('param_p1')).toBe('7')
    expect(body.get('param_p2')).toBe('hello')
  })
})
