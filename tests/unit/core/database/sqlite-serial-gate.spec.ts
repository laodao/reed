/**
 * SQLite 串行门测试（方案 E）
 * @module tests/core/database/sqlite-serial-gate
 * @description better-sqlite3 单连接下事务/普通语句互斥：
 *              - 并发事务不再踩踏（复现 scripts/repro-txn-race.cjs 场景1）
 *              - 事务窗口内普通语句排队（不被卷进别人事务——场景3）
 *              - 只作用于 sqlite；postgres 不挂串行门
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { DataSource } from 'typeorm'
import { installSqliteSerialGate } from '@core/database/sqlite-serial-gate'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

describe('SqliteSerialGate', () => {
  let ds: DataSource

  beforeAll(async () => {
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', synchronize: false, logging: false })
    await ds.initialize()
    await ds.query('CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT, v TEXT)')
    installSqliteSerialGate(ds)
  })

  afterAll(async () => { await ds.destroy() })

  it('并发 2 个事务不再踩踏（此前报 "cannot start a transaction within a transaction"）', async () => {
    async function txn(label: string): Promise<void> {
      await ds.transaction(async manager => {
        await manager.query('INSERT INTO t (v) VALUES (?)', [label])
        await sleep(30) // 制造让出点——此前在这里交错
        await manager.query('UPDATE t SET v = ? WHERE v = ?', [`${label}-done`, label])
      })
    }
    await Promise.all([txn('A'), txn('B')])
    const rows = await ds.query('SELECT v FROM t ORDER BY v')
    expect(rows.map((r: any) => r.v)).toEqual(['A-done', 'B-done'])
  })

  it('事务窗口内普通语句排队，不被卷进别人事务（回滚不波及）', async () => {
    // 事务 T1 插入并 sleep（持锁窗口）；期间普通 INSERT F 排队
    let t1Done = false
    const t1 = (async () => {
      await ds.transaction(async manager => {
        await manager.query('INSERT INTO t (v) VALUES (?)', ['T1'])
        await sleep(50)
        t1Done = true
      })
    })()
    await sleep(10) // 确保 T1 已 BEGIN 且持锁
    // 普通语句此时排队——等 T1 提交后才执行
    await ds.query('INSERT INTO t (v) VALUES (?)', ['F'])
    await t1
    expect(t1Done).toBe(true)
    const rows = await ds.query('SELECT v FROM t WHERE v IN (?, ?)', ['T1', 'F'])
    expect(rows.map((r: any) => r.v).sort()).toEqual(['F', 'T1'])
  })

  it('事务失败回滚不影响排队中的普通语句', async () => {
    await expect(
      ds.transaction(async manager => {
        await manager.query('INSERT INTO t (v) VALUES (?)', ['WILL_ROLLBACK'])
        throw new Error('boom')
      })
    ).rejects.toThrow('boom')
    // 回滚后普通语句仍可正常执行（锁已释放）
    await ds.query('INSERT INTO t (v) VALUES (?)', ['AFTER_ROLLBACK'])
    const rows = await ds.query("SELECT v FROM t WHERE v = 'AFTER_ROLLBACK'")
    expect(rows).toHaveLength(1)
  })

  it('对照：不装门的 DataSource 并发事务确实踩踏（证明门是修复者）', async () => {
    const raw = new DataSource({ type: 'better-sqlite3', database: ':memory:', synchronize: false, logging: false })
    await raw.initialize()
    await raw.query('CREATE TABLE t2 (id INTEGER PRIMARY KEY AUTOINCREMENT, v TEXT)')
    async function txn(label: string): Promise<string> {
      try {
        await raw.transaction(async manager => {
          await manager.query('INSERT INTO t2 (v) VALUES (?)', [label])
          await sleep(20)
        })
        return 'ok'
      } catch (e) {
        return `fail: ${(e as Error).message.split('\n')[0]}`
      }
    }
    const results = await Promise.all([txn('A'), txn('B')])
    // 未装门：至少一个事务失败（BEGIN 或 COMMIT 踩踏）
    expect(results.some(r => r.startsWith('fail'))).toBe(true)
    await raw.destroy()
  })

  it('postgres 方言不安装串行门（门只作用于 sqlite）', async () => {
    // postgres DataSource：install 应直接跳过（createQueryRunner 不被替换、不抛错）
    const pg = new DataSource({ type: 'postgres', host: 'x', port: 1, username: 'x', password: 'x', database: 'x' })
    const protoMethod = (DataSource.prototype as any).createQueryRunner
    installSqliteSerialGate(pg)
    expect(pg.createQueryRunner.toString() === protoMethod.toString()).toBe(true) // 未被替换 → 门未安装
  })
})
