/**
 * 数据源连接池缓存（评审 #25）
 * @module core/modules/workflow/datasource/drivers/pool-cache
 * @description 按 (driver + 连接参数指纹) 复用连接池。此前每次查询 createPool→end，
 *              批量执行时每行一次 TCP+TLS 握手，延迟与服务器负载都不可接受。
 *
 *              - acquirePooled：取池（无则 create），并刷新最近使用时间
 *              - evictPooled：查询失败时驱逐坏池（连接可能已死），下次重建
 *              - 惰性清扫：acquire 时把空闲超过 POOL_IDLE_TTL_MS 的池销毁（不依赖定时器）
 *              - closeAllPools：测试/停机用全量关闭
 *
 *              密码不参与指纹（避免泄漏进日志可读的 key）；同 host:port:db:user:ssl
 *              不同密码视为同一池——密码仅在建池时使用，改密码属换凭据场景，
 *              由 evictPooled/配置变更驱逐兜底。
 */
import type { DataSourceConnectionParams } from '@shared/types/datasource.types'

/** 池空闲回收时间：5 分钟无访问即销毁 */
export const POOL_IDLE_TTL_MS = 5 * 60_000
/** 缓存池数上限（防配置轰炸）：超出时关闭最久未用的 */
const MAX_POOLS = 20

function poolKey(driver: string, params: DataSourceConnectionParams): string {
  return [
    driver,
    params.host,
    params.port,
    params.database ?? '',
    params.username ?? '',
    params.ssl ? 1 : 0,
  ].join('|')
}

interface CacheEntry<T> {
  pool: T
  lastUsed: number
  destroy: (p: T) => Promise<void>
}

const cache = new Map<string, CacheEntry<unknown>>()

/**
 * 取（或建）复用池。T 由调用方具体化（pg Pool / mysql2 Pool / mssql ConnectionPool）。
 */
export async function acquirePooled<T>(
  driver: string,
  params: DataSourceConnectionParams,
  create: () => T | Promise<T>,
  destroy: (p: T) => Promise<void>,
): Promise<T> {
  await sweepIdlePools()
  const key = poolKey(driver, params)
  const hit = cache.get(key)
  if (hit) {
    hit.lastUsed = Date.now()
    return hit.pool as T
  }
  // 容量上限：关闭最久未用的池
  if (cache.size >= MAX_POOLS) {
    const lru = [...cache.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0]
    if (lru) {
      cache.delete(lru[0])
      await Promise.resolve()
        .then(() => lru[1].destroy(lru[1].pool))
        .catch(() => undefined)
    }
  }
  const pool = await create()
  cache.set(key, { pool, lastUsed: Date.now(), destroy: destroy as (p: unknown) => Promise<void> })
  return pool
}

/** 驱逐坏池（查询失败后调用）：关闭并移除，下次 acquire 重建 */
export async function evictPooled(driver: string, params: DataSourceConnectionParams): Promise<void> {
  const key = poolKey(driver, params)
  const entry = cache.get(key)
  if (!entry) return
  cache.delete(key)
  await Promise.resolve()
    .then(() => entry.destroy(entry.pool))
    .catch(() => undefined)
}

/** 惰性清扫：关闭空闲超过 TTL 的池 */
async function sweepIdlePools(): Promise<void> {
  const now = Date.now()
  for (const [key, entry] of cache) {
    if (now - entry.lastUsed > POOL_IDLE_TTL_MS) {
      cache.delete(key)
      await Promise.resolve()
        .then(() => entry.destroy(entry.pool))
        .catch(() => undefined)
    }
  }
}

/** 全量关闭（测试与停机路径用） */
export async function closeAllPools(): Promise<void> {
  const entries = [...cache.entries()]
  cache.clear()
  for (const [, entry] of entries) {
    await Promise.resolve()
      .then(() => entry.destroy(entry.pool))
      .catch(() => undefined)
  }
}
