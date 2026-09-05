/**
 * 数据源连接池缓存测试（评审 #25）
 * @description 同配置复用同一池（不重复建连）；不同配置各建各的；错误时驱逐坏池；
 *              空闲 TTL 到期回收；显式失效/全量关闭。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('datasource pool-cache', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(async () => {
    const { closeAllPools } = await import('@core/modules/workflow/datasource/drivers/pool-cache')
    await closeAllPools()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  const params = { host: 'db.internal', port: 5432, database: 'db', username: 'u', ssl: false } as any

  it('同配置两次获取 → 只 create 一次（复用池）', async () => {
    const { acquirePooled } = await import('@core/modules/workflow/datasource/drivers/pool-cache')
    const create = vi.fn(() => ({ tag: 'pool1' }))
    const destroy = vi.fn(async () => {})
    const p1 = await acquirePooled('pg', params, create, destroy)
    const p2 = await acquirePooled('pg', params, create, destroy)
    expect(create).toHaveBeenCalledTimes(1)
    expect(p2).toBe(p1)
    expect(destroy).not.toHaveBeenCalled()
  })

  it('配置不同（host/port/库/用户/ssl）→ 各建各的池', async () => {
    const { acquirePooled } = await import('@core/modules/workflow/datasource/drivers/pool-cache')
    const create = vi.fn(() => ({}))
    await acquirePooled('pg', params, create, vi.fn())
    await acquirePooled('pg', { ...params, host: 'other' }, create, vi.fn())
    await acquirePooled('mysql', params, create, vi.fn())
    expect(create).toHaveBeenCalledTimes(3)
  })

  it('查询失败驱逐坏池 → 下次获取重建', async () => {
    const { acquirePooled, evictPooled } = await import('@core/modules/workflow/datasource/drivers/pool-cache')
    const create = vi.fn(() => ({ n: create.mock.calls.length }))
    const destroy = vi.fn(async () => {})
    const p1 = await acquirePooled('pg', params, create, destroy)
    evictPooled('pg', params)
    const p2 = await acquirePooled('pg', params, create, destroy)
    expect(create).toHaveBeenCalledTimes(2)
    expect(p2).not.toBe(p1)
    expect(destroy).toHaveBeenCalledWith(p1)
  })

  it('空闲超过 TTL → 池被回收销毁；再获取时重建', async () => {
    const { acquirePooled, POOL_IDLE_TTL_MS } = await import('@core/modules/workflow/datasource/drivers/pool-cache')
    const create = vi.fn(() => ({}))
    const destroy = vi.fn(async () => {})
    await acquirePooled('pg', params, create, destroy)
    vi.advanceTimersByTime(POOL_IDLE_TTL_MS + 1000)
    // 惰性清扫在下一次获取时触发
    await acquirePooled('pg', params, create, destroy)
    expect(create).toHaveBeenCalledTimes(2)
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  it('closeAllPools 关闭全部（测试/停机用）', async () => {
    const { acquirePooled, closeAllPools } = await import('@core/modules/workflow/datasource/drivers/pool-cache')
    const create = vi.fn(() => ({}))
    const destroy = vi.fn(async () => {})
    await acquirePooled('pg', params, create, destroy)
    await acquirePooled('mysql', params, create, destroy)
    await closeAllPools()
    expect(destroy).toHaveBeenCalledTimes(2)
  })

  describe('isConnectionClassError（评审 #25 后续：仅连接类失败才驱逐池）', () => {
    it('连接/网络/认证类错误 → true（应驱逐池）', async () => {
      const { isConnectionClassError } = await import('@core/modules/workflow/datasource/drivers/pool-cache')
      const connErrors = [
        { code: 'ECONNREFUSED', message: 'connect ECONNREFUSED 127.0.0.1:5432' },
        { code: 'ETIMEDOUT', message: 'Connection timed out' },
        { code: 'PROTOCOL_CONNECTION_LOST', message: 'Connection lost: The server closed the connection.' },
        { message: 'socket hang up' },
        { code: 'ER_ACCESS_DENIED_ERROR', message: "Access denied for user 'u'@'localhost'" },
        { code: '28P01', message: 'password authentication failed for user "u"' },
        { code: 'ELOGIN', message: 'Login failed for user.' },
      ]
      for (const e of connErrors) {
        expect(isConnectionClassError(e)).toBe(true)
      }
    })

    it('SQL 语法/约束/参数类错误 → false（应保留池）', async () => {
      const { isConnectionClassError } = await import('@core/modules/workflow/datasource/drivers/pool-cache')
      const queryErrors = [
        { code: 'ER_PARSE_ERROR', message: "You have an error in your SQL syntax; check the manual..." },
        { code: 'ER_DUP_ENTRY', message: "Duplicate entry 'x' for key 'PRIMARY'" },
        { code: '42703', message: 'column "name" does not exist' },
        { code: '23505', message: 'duplicate key value violates unique constraint "uq_run"' },
        { code: '1064', message: 'syntax error near ...' },
      ]
      for (const e of queryErrors) {
        expect(isConnectionClassError(e)).toBe(false)
      }
    })

    it('空/无信息错误 → false（保守：非连接类）', async () => {
      const { isConnectionClassError } = await import('@core/modules/workflow/datasource/drivers/pool-cache')
      expect(isConnectionClassError(null)).toBe(false)
      expect(isConnectionClassError({})).toBe(false)
      expect(isConnectionClassError(undefined)).toBe(false)
    })
  })
})
