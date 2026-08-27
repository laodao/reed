/**
 * SQLite 串行门（方案 E：数据库层串行执行器）
 * @module core/database/sqlite-serial-gate
 * @description
 * better-sqlite3 是单连接 + 单写者：同一时刻只允许一个写事务（WAL 下读写可并行，
 * 写之间仍串行）。TypeORM 不替调用方排队——多个 async 路径（引擎收尾、事件桥写卡）
 * 并发发起事务时，语句在 await 让出点之间交错，事务边界互相踩踏
 * （"cannot start a transaction within a transaction" / "no transaction is active"）。
 *
 * 本门在 QueryRunner 层做互斥：
 * - 事务（startTransaction→commit/rollback）整体作为**一个临界区**持锁，
 *   事务内语句（含嵌套事务/savepoint）经 inTxn 判定直通，避免自锁
 * - 普通语句（query）单独排队，等待当前事务/语句完成
 * - 只作用于 sqlite/better-sqlite3 方言（按 DataSource type 判定）；postgres 直接跳过
 *
 * 注意：串行不损失吞吐——SQLite 写本来就是单写者，所谓"并发"只是交错。
 */

import { AsyncLocalStorage } from 'async_hooks'
import type { DataSource, QueryRunner } from 'typeorm'

/**
 * 事务重入标记：包装 DataSource.transaction，在事务回调执行期间置位。
 *
 * 背景：仓库层存在"transaction(async () => { this.scoped.save(...) })"反模式——
 * 回调忽略事务 manager，内部走全局 EntityManager → 新建 QueryRunner（本门代理后
 * txnDepth=0）→ 排队等待外层事务持有的锁 → 外层 await 内层 → 确定性死锁挂起。
 * 本标记让"事务内调用全局 manager"在门内被立即识别并抛明确错误，而不是永久挂起。
 */
const txnAls = new AsyncLocalStorage<boolean>()

/** 互斥锁：acquire 排队（FIFO），release 放行下一个 */
class Mutex {
  private tail: Promise<void> = Promise.resolve()

  /** 排队获取锁；返回释放函数（幂等，重复调用只释放一次） */
  acquire(): Promise<() => void> {
    let release!: () => void
    const gate = new Promise<void>(r => (release = r))
    const prev = this.tail
    this.tail = prev.then(() => gate)
    return prev.then(() => {
      let done = false
      return () => {
        if (done) return
        done = true
        release()
      }
    })
  }

  /** 普通语句排他执行：排队等前一个完成（失败不阻塞后续） */
  runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(fn)
    this.tail = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }
}

/** 给一个 QueryRunner 打上串行门代理（仅代理事务/执行方法，其余透传） */
function gateQueryRunner(runner: QueryRunner, mutex: Mutex): QueryRunner {
  /** 事务深度：0=无事务；>0 表示本 runner 持锁中（嵌套事务/savepoint 计数） */
  let txnDepth = 0
  let releaseLock: (() => void) | null = null

  const proxy = new Proxy(runner, {
    get(target, prop, receiver) {
      switch (prop) {
        case 'query':
          return (...args: unknown[]) => {
            // 事务内直通（已持锁，不再排队——避免自锁）
            if (txnDepth > 0) return (target.query as (...a: unknown[]) => Promise<unknown>)(...args)
            // 死锁防护：当前异步链正处在一个事务回调内（外层事务持锁），
            // 此时调用全局 manager 会新建 runner 排队等外层锁 → 永久挂起。
            // 抛明确错误指导改用回调 manager（transaction(manager => ...)）。
            if (txnAls.getStore()) {
              return Promise.reject(
                new Error('SQLite 串行门：事务回调内禁止调用全局 manager/仓库方法（会死锁）。请改用 transaction(async (manager) => { manager.getRepository(...) })')
              )
            }
            return mutex.runExclusive(() => (target.query as (...a: unknown[]) => Promise<unknown>)(...args))
          }
        case 'startTransaction':
          return async (...args: unknown[]) => {
            // 嵌套事务（savepoint）：已持锁，直接透传
            if (txnDepth > 0) {
              txnDepth++
              try {
                await (target.startTransaction as (...a: unknown[]) => Promise<unknown>)(...args)
              } catch (e) {
                txnDepth--
                throw e
              }
              return
            }
            // 同上：事务回调内再开新事务（全局 manager 的写入路径）→ 死锁，直接报错
            if (txnAls.getStore()) {
              throw new Error('SQLite 串行门：事务回调内禁止再次开启事务（请使用回调 manager 的 getRepository 操作）')
            }
            releaseLock = await mutex.acquire()
            txnDepth = 1
            try {
              await (target.startTransaction as (...a: unknown[]) => Promise<unknown>)(...args)
            } catch (e) {
              // 获取锁后 BEGIN 失败——立即释放，避免锁泄漏
              releaseLock()
              releaseLock = null
              txnDepth = 0
              throw e
            }
          }
        case 'commitTransaction':
        case 'rollbackTransaction':
          return async (...args: unknown[]) => {
            try {
              await (target[prop] as (...a: unknown[]) => Promise<unknown>)(...args)
            } finally {
              if (txnDepth > 0) {
                txnDepth--
                if (txnDepth === 0 && releaseLock) {
                  releaseLock()
                  releaseLock = null
                }
              }
            }
          }
        default:
          return Reflect.get(target, prop, receiver)
      }
    },
  })
  return proxy
}

/**
 * 给 sqlite DataSource 安装串行门：
 * 包装 createQueryRunner 返回的 runner，使所有 SQL 执行（事务/普通语句）互斥。
 * 仅当 DataSource 是 sqlite/better-sqlite3 方言时生效；postgres 直接跳过（不受影响）。
 */
export function installSqliteSerialGate(ds: DataSource): void {
  const dialect = (ds.options as { type?: string }).type
  if (dialect !== 'sqlite' && dialect !== 'better-sqlite3') return

  // 包装 transaction：回调执行期间置 ALS 标记（门内据此识别"事务内调用全局 manager"）
  const origTransaction = ds.transaction.bind(ds)
  ds.transaction = ((...args: unknown[]) => {
    const cb = args[args.length - 1] as (manager?: unknown) => Promise<unknown>
    const wrapped = (manager?: unknown) => txnAls.run(true, () => cb(manager))
    const newArgs = args.length > 1 ? [...args.slice(0, -1), wrapped] : [wrapped]
    return origTransaction(...(newArgs as never))
  }) as typeof ds.transaction

  const mutex = new Mutex()
  const original = ds.createQueryRunner.bind(ds)
  ds.createQueryRunner = (...args: unknown[]) => {
    const runner = original(...(args as [never]))
    return gateQueryRunner(runner, mutex)
  }
}
