/**
 * Web 端数据库注册表
 * @module web/server/platform/web-database-registry
 * @description 多租户隔离方案：
 *              - 全局 DataSource：仅承载 users 表（用于鉴权 / 注册 / 登录）
 *              - 每用户 DataSource：承载该用户全部业务数据
 *
 *              用户登录后，每次 IPC 请求由 ipc-router 包装在 runWithUserAsync(userId, fn)
 *              的 ALS 上下文里。core 层通过 getCoreDatabaseManager() 拿到的 DM 由本注册表
 *              的 accessor 解析：当前 userId 命中时返回该用户专属 DM，否则返回 globalDM。
 *
 *              SQLite 文件按用户落地到 <rootDataPath>/users/<userId>/the_bot.db。
 *              首次访问时懒创建文件 + ds.synchronize() 建表。
 */

import * as fs from 'fs'
import * as path from 'path'
import type { DataSource } from 'typeorm'
import { createDataSource } from '@core/database/data-source'
import type { DbConfig } from '@core/database/config'
import { ensureUsersTable } from '@core/database/migrations/ensure-users-table'
import { getCurrentUserId } from '@core/context/user-context'
import type { ICoreDatabaseManager } from '@core/database/database-manager.interface'
import { WebDatabaseManager } from './web-database-manager'

interface RegistryOptions {
  rootDataPath: string
  /** 全局 DataSource：仅 users 表使用 */
  globalDataSource: DataSource
}

interface CachedUserDb {
  ds: DataSource
  dm: WebDatabaseManager
  /** 上次访问时间（毫秒） */
  lastUsed: number
}

/**
 * Web 端数据库注册表（单例）
 */
export class WebDatabaseRegistry {
  private static instance: WebDatabaseRegistry | null = null

  private readonly rootDataPath: string
  private readonly globalDm: WebDatabaseManager
  private readonly userCache = new Map<string, CachedUserDb>()
  private readonly pendingInit = new Map<string, Promise<CachedUserDb>>()

  /** LRU 上限：超过则关闭最久未用的 */
  private readonly maxCachedUsers = 32

  private constructor(opts: RegistryOptions) {
    this.rootDataPath = opts.rootDataPath
    this.globalDm = new WebDatabaseManager(opts.globalDataSource)
  }

  static getInstance(opts?: RegistryOptions): WebDatabaseRegistry {
    if (!WebDatabaseRegistry.instance) {
      if (!opts) {
        throw new Error('[WebDatabaseRegistry] 首次调用必须传入 RegistryOptions')
      }
      WebDatabaseRegistry.instance = new WebDatabaseRegistry(opts)
    }
    return WebDatabaseRegistry.instance
  }

  /**
   * 全局 DM（auth / 注册 / 登录用）
   */
  getGlobalDm(): ICoreDatabaseManager {
    return this.globalDm
  }

  /**
   * 当前用户 DM（基于 ALS 中的 userId 解析）
   * - 已登录：返回该用户专属 DM；如尚未创建，抛错（必须先 await ensureUserDb）
   * - 未登录：返回 globalDM（向后兼容；auth 路由用）
   */
  getCurrentUserDm(): ICoreDatabaseManager {
    const userId = getCurrentUserId()
    if (!userId) {
      return this.globalDm
    }
    const cached = this.userCache.get(userId)
    if (!cached) {
      throw new Error(
        `[WebDatabaseRegistry] 用户 ${userId} 的数据库尚未初始化：请在请求前调用 ensureUserDb`,
      )
    }
    cached.lastUsed = Date.now()
    return cached.dm
  }

  /**
   * 确保指定用户的数据库已创建并初始化（幂等，可重复调用）。
   * 多个并发请求只会触发一次初始化。
   */
  async ensureUserDb(userId: string): Promise<void> {
    if (this.userCache.has(userId)) {
      this.userCache.get(userId)!.lastUsed = Date.now()
      return
    }
    const pending = this.pendingInit.get(userId)
    if (pending) {
      await pending
      return
    }

    const initPromise = this.initUserDb(userId)
      .then((cached) => {
        this.userCache.set(userId, cached)
        this.evictIfNeeded()
        return cached
      })
      .finally(() => {
        this.pendingInit.delete(userId)
      })

    this.pendingInit.set(userId, initPromise)
    await initPromise
  }

  private async initUserDb(userId: string): Promise<CachedUserDb> {
    const userDir = path.join(this.rootDataPath, 'users', userId)
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true })
    }
    const dbFile = path.join(userDir, 'the_bot.db')
    const cfg: DbConfig = {
      type: 'sqlite',
      database: dbFile,
      enableWal: true,
    }

    const ds = await createDataSource({ config: cfg })
    // 首次启动按 entity metadata 建全表（幂等）
    await ds.synchronize()
    await ensureUsersTable(ds)

    const dm = new WebDatabaseManager(ds)
    return { ds, dm, lastUsed: Date.now() }
  }

  /**
   * LRU 淘汰：超过 maxCachedUsers 时关闭最久未用的 DataSource
   */
  private evictIfNeeded(): void {
    if (this.userCache.size <= this.maxCachedUsers) return
    const entries = Array.from(this.userCache.entries()).sort(
      (a, b) => a[1].lastUsed - b[1].lastUsed,
    )
    const toEvict = this.userCache.size - this.maxCachedUsers
    for (let i = 0; i < toEvict; i++) {
      const [userId, cached] = entries[i]
      cached.ds.destroy().catch((err) =>
        console.warn(`[WebDatabaseRegistry] 关闭 ${userId} DataSource 失败:`, err),
      )
      this.userCache.delete(userId)
    }
  }

  /**
   * 关闭并清理所有缓存（仅用于优雅停机）
   */
  async shutdown(): Promise<void> {
    const closes: Array<Promise<void>> = []
    for (const cached of this.userCache.values()) {
      closes.push(cached.ds.destroy())
    }
    this.userCache.clear()
    await Promise.allSettled(closes)
  }
}
