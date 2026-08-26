/**
 * DataSourceService 测试（CRUD + 加密凭据 + testConnection/execute 路由到驱动）
 * @module tests/workflow/datasource.service
 * @description 用 mock SecureStorage + 假仓库 + mock 驱动注册表，验证：
 *              - create 加密密码、update 不改密码
 *              - testConnection/execute 经 toConnectionParams 解密后路由到驱动
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---- mock 安全存储（encrypt/decrypt 双向 + 初始化已就绪） ----
vi.mock('@core/interfaces/storage.interface', () => ({
  getSecureStorage: () => ({
    isInitialized: () => true,
    initialize: async () => {},
    encrypt: (s: string) => `enc:${s}`,
    decrypt: (s: string) => (s.startsWith('enc:') ? s.slice(4) : s),
  }),
}))

import { DataSourceService } from '@core/modules/workflow/datasource/datasource.service'
import {
  registerDataSourceDriver,
  testDataSourceConnection,
  executeDataSourceSql,
} from '@core/modules/workflow/datasource/datasource-executor.service'
import type { DataSourceConfig } from '@shared/types/datasource.types'

// ---- 假仓库 ----
class MemRepo {
  rows: Map<string, DataSourceConfig> = new Map()
  seq = 0
  async create(i: any) {
    const row: any = { id: i.id, isEnabled: true, createdAt: Date.now(), updatedAt: Date.now(), ...i }
    this.rows.set(row.id, row)
    return { ...row }
  }
  async getById(id: string) { return this.rows.get(id) ?? null }
  async getAll() { return [...this.rows.values()] }
  async getEnabled() { return [...this.rows.values()].filter(r => r.isEnabled) }
  async update(id: string, patch: any) {
    const r = this.rows.get(id)
    if (!r) return false
    Object.assign(r, patch, { updatedAt: Date.now() })
    return true
  }
  async delete(id: string) { return this.rows.delete(id) ? true : false }
  async toggleEnabled(id: string) {
    const r = this.rows.get(id)
    if (!r) return false
    r.isEnabled = !r.isEnabled
    return true
  }
}

// ---- mock 驱动适配器 ----
const mockTestConn = vi.fn()
const mockQuery = vi.fn()
class MockAdapter {
  driver = 'postgres' as const
  testConnection = mockTestConn
  query = mockQuery
}

describe('DataSourceService', () => {
  let repo: MemRepo
  let svc: DataSourceService

  beforeEach(() => {
    repo = new MemRepo()
    svc = new DataSourceService(repo as any)
    mockTestConn.mockReset()
    mockQuery.mockReset()
  })

  it('create: 密码加密落库，get 读回密文', async () => {
    const created = await svc.create({
      name: '金融库', driver: 'postgres', host: 'db.x', port: 5432, database: 'finance', username: 'svc', password: 'secret123', ssl: true,
    })
    expect(created.passwordEnc).toBe('enc:secret123')
    const got = await svc.get(created.id)
    expect(got!.passwordEnc).toBe('enc:secret123')
  })

  it('update: 不传 password 则不改变密文', async () => {
    const created = await svc.create({ name: '库', driver: 'postgres', host: 'h', port: 5432, database: 'd', username: 'u', password: 'p1' })
    await svc.update(created.id, { name: '库2' })
    expect((await svc.get(created.id))!.passwordEnc).toBe('enc:p1')
  })

  it('update: 传 password 则重新加密', async () => {
    const created = await svc.create({ name: '库', driver: 'postgres', host: 'h', port: 5432, database: 'd', username: 'u', password: 'p1' })
    await svc.update(created.id, { password: 'p2' })
    expect((await svc.get(created.id))!.passwordEnc).toBe('enc:p2')
  })

  it('toConnectionParams: 解密密码返回连接参数', async () => {
    const created = await svc.create({ name: '库', driver: 'postgres', host: 'db.x', port: 5433, database: 'finance', username: 'svc', password: 'pw', ssl: true })
    const params = await svc.toConnectionParams((await svc.get(created.id))!)
    expect(params).toMatchObject({ host: 'db.x', port: 5433, database: 'finance', username: 'svc', password: 'pw', ssl: true })
  })

  it('testConnection: 路由到驱动并返回结果', async () => {
    registerDataSourceDriver(new MockAdapter() as any)
    const created = await svc.create({ name: '库', driver: 'postgres', host: 'h', port: 5432, database: 'd', username: 'u', password: 'pw' })
    mockTestConn.mockResolvedValue({ success: true, message: 'ok' })
    const res = await svc.testConnection(created.id)
    expect(res.success).toBe(true)
    expect(mockTestConn).toHaveBeenCalled()
    // 驱动接收的是解密后的连接参数
    expect(mockTestConn.mock.calls[0][0].password).toBe('pw')
  })

  it('execute: 参数化 SQL 路由到驱动，输出统一形状', async () => {
    registerDataSourceDriver(new MockAdapter() as any)
    const created = await svc.create({ name: '库', driver: 'postgres', host: 'h', port: 5432, database: 'd', username: 'u', password: 'pw' })
    mockQuery.mockResolvedValue({ columns: ['id', 'name'], rows: [{ id: 1, name: 'a' }], rowCount: 1, durationMs: 5 })
    const res = await svc.execute(created.id, 'SELECT * FROM t WHERE id=$1', [1])
    expect(res.columns).toEqual(['id', 'name'])
    expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({ password: 'pw' }), 'SELECT * FROM t WHERE id=$1', [1])
  })

  it('execute: 数据源禁用则抛错', async () => {
    const created = await svc.create({ name: '库', driver: 'postgres', host: 'h', port: 5432, database: 'd' })
    await svc.toggleEnabled(created.id)
    await expect(svc.execute(created.id, 'SELECT 1')).rejects.toThrow('数据源已禁用')
  })
})
