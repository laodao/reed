/**
 * MySQL 驱动适配器测试
 * @module tests/workflow/datasource/mysql-driver
 * @description mock mysql2/promise：验证 createPool/getConnection 链、SELECT 1 测试连接、
 *              参数化查询、结果形状。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MySqlDriverAdapter } from '@core/modules/workflow/datasource/drivers/mysql-driver'

const params = { host: 'db.internal', port: 3306, database: 'shop', username: 'app', password: 'pw' } as const

// ---- mock mysql2/promise ----
const mPool = { getConnection: vi.fn(), end: vi.fn() }
const mConn = { query: vi.fn(), release: vi.fn() }
vi.mock('mysql2/promise', () => ({
  createPool: vi.fn(() => mPool),
}))
import { createPool } from 'mysql2/promise'
const createPoolMock = vi.mocked(createPool)

describe('MySqlDriverAdapter', () => {
  const adapter = new MySqlDriverAdapter()

  beforeEach(() => {
    mPool.getConnection.mockReset()
    mPool.end.mockReset()
    mConn.query.mockReset()
    mConn.release.mockReset()
    mPool.getConnection.mockResolvedValue(mConn)
    mPool.end.mockResolvedValue(undefined)
  })

  it('testConnection: 成功 → 解析版本', async () => {
    mConn.query.mockResolvedValue([[{ v: '8.0.36' }], []])
    const res = await adapter.testConnection(params as any)
    expect(res.success).toBe(true)
    expect(res.serverVersion).toBe('8.0.36')
    expect(mConn.release).toHaveBeenCalled()
    expect(mPool.end).toHaveBeenCalled()
  })

  it('testConnection: 连接失败 → 失败不抛', async () => {
    mPool.getConnection.mockRejectedValue(new Error('ER_ACCESS_DENIED_ERROR'))
    const res = await adapter.testConnection(params as any)
    expect(res.success).toBe(false)
    expect(res.message).toContain('ER_ACCESS_DENIED_ERROR')
  })

  it('query: 统一 $1,$2 占位符 → 翻译为 mysql2 的 ?，参数按出现顺序', async () => {
    mConn.query.mockResolvedValue([[{ id: 1, name: 'a' }], [{ name: 'id' }, { name: 'name' }]])
    const res = await adapter.query(params as any, 'SELECT * FROM t WHERE id>$1 AND name=$2', [1, 'a'])
    expect(res.rows).toEqual([{ id: 1, name: 'a' }])
    expect(res.columns).toEqual(['id', 'name'])
    expect(mConn.query).toHaveBeenCalledWith('SELECT * FROM t WHERE id>? AND name=?', [1, 'a'])
  })

  it('query: 乱序 $2,$1 → 参数按占位符出现顺序收集', async () => {
    mConn.query.mockResolvedValue([[], []])
    await adapter.query(params as any, 'WHERE name=$2 AND id=$1', [10, 'a'])
    expect(mConn.query).toHaveBeenCalledWith('WHERE name=? AND id=?', ['a', 10])
  })

  it('query: DML → rowCount 取 affectedRows', async () => {
    mConn.query.mockResolvedValue([{ affectedRows: 3 }, undefined])
    const res = await adapter.query(params as any, 'UPDATE t SET x=1')
    expect(res.rowCount).toBe(3)
  })
})
