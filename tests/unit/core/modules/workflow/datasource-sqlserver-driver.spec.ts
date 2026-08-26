/**
 * SQL Server 驱动适配器测试
 * @module tests/workflow/datasource/sqlserver-driver
 * @description mock mssql：验证 ConnectionPool 构造/连接/请求、SELECT @@VERSION、
 *              参数化（$1 → @p1）+ input 绑定、$ 占位符归一、结果形状。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SqlServerDriverAdapter } from '@core/modules/workflow/datasource/drivers/sqlserver-driver'

const params = { host: 'sql.internal', port: 1433, database: 'erp', username: 'sa', password: 'pw', ssl: true } as const

// ---- mock mssql（vi.hoisted 避免工厂提升时引用未初始化变量） ----
const mocks = vi.hoisted(() => {
  const mPool = { connect: vi.fn(), request: vi.fn(), close: vi.fn() }
  const mRequest = { query: vi.fn(), input: vi.fn() }
  class MockConnectionPool {
    connect = mPool.connect
    request = mPool.request
    close = mPool.close
  }
  return { mPool, mRequest, MockConnectionPool }
})
vi.mock('mssql', () => ({
  default: { ConnectionPool: mocks.MockConnectionPool },
  ConnectionPool: mocks.MockConnectionPool,
}))

describe('SqlServerDriverAdapter', () => {
  const adapter = new SqlServerDriverAdapter()
  const { mPool, mRequest } = mocks

  beforeEach(() => {
    mPool.connect.mockReset()
    mPool.request.mockReset()
    mPool.close.mockReset()
    mRequest.query.mockReset()
    mRequest.input.mockReset()
    mPool.connect.mockResolvedValue(mPool)
    mPool.close.mockResolvedValue(undefined)
    mPool.request.mockReturnValue(mRequest)
  })

  it('testConnection: 成功 → 解析版本', async () => {
    mRequest.query.mockResolvedValue({ recordset: [{ v: 'Microsoft SQL Server 2022' }] })
    const res = await adapter.testConnection(params as any)
    expect(res.success).toBe(true)
    expect(res.serverVersion).toContain('SQL Server')
    expect(mPool.close).toHaveBeenCalled()
  })

  it('testConnection: 连接失败 → 失败不抛', async () => {
    mPool.connect.mockRejectedValue(new Error('Login failed for user'))
    const res = await adapter.testConnection(params as any)
    expect(res.success).toBe(false)
    expect(res.message).toContain('Login failed')
  })

  it('query: $1 占位符归一为 @p1 并按位置 input 绑定', async () => {
    mRequest.query.mockResolvedValue({ recordset: [{ id: 1, name: 'a' }], rowsAffected: [1] })
    const res = await adapter.query(params as any, 'SELECT * FROM t WHERE id>$1', [1])
    expect(res.rows).toEqual([{ id: 1, name: 'a' }])
    expect(mRequest.query).toHaveBeenCalledWith('SELECT * FROM t WHERE id>@p1')
    expect(mRequest.input).toHaveBeenCalledWith('p1', 1)
    expect(res.columns).toEqual(['id', 'name'])
  })

  it('query: 无参数 SQL 不做 input 绑定', async () => {
    mRequest.query.mockResolvedValue({ recordset: [], rowsAffected: [0] })
    await adapter.query(params as any, 'SELECT TOP 1 * FROM t')
    expect(mRequest.input).not.toHaveBeenCalled()
  })
})
