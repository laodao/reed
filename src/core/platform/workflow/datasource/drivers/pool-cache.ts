/**
 * 数据源连接池缓存（评审 #25）
 * @module core/platform/workflow/datasource/drivers/pool-cache
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

/**
 * 判断错误是否为"连接/网络/认证类"失败（而非 SQL 查询/逻辑错误）。
 *
 * 评审 #25 后续修正：此前驱动的 query 在 catch 里无条件 evictPooled，导致 SQL 语法/约束/
 * 参数这类与连接状态无关的错误也会销毁共享池，可能打断同池其它并发在途查询。
 * 只有连接类失败才应驱逐池（连接可能已死），查询层错误应保留池。
 *
 * 采用"限定短语 + 错误码"保守匹配：优先命中明确的连接/认证短语（避免普通列名/表名误伤），
 * 匹配不到则按"非连接类"处理（最坏情况是坏池滞留到 TTL 清扫或下次被检测到的连接错误驱逐）。
 */
export function isConnectionClassError(e: any): boolean {
  if (!e) return false
  const msg = String(e?.message ?? '').toLowerCase()
  const code = String(e?.code ?? '').toLowerCase()
  const hay = `${code}\n${msg}`
  const connPatterns = [
    // 网络/系统层
    /econnrefused|econnreset|econnaborted|etimedout|epipe|eai_again|enotfound|ehostunreach|eaddrnotavail/,
    // 常见连接短语
    /socket hang up|connection (refused|reset|lost|closed|terminated|timed out|pool is closed|failed)|server closed the connection|client connection (closed|terminated)|connect (econn|refused|timed out|reset)/,
    // 认证/权限（限定短语，避免误伤普通列名）
    /access denied for user|authentication (failed|error|method)|login failed|password authentication failed|invalid (password|username|secret)|is not allowed to connect|too many connections|no pg_hba\.conf entry|role\s+\S+\s+does not exist|database\s+\S+\s+does not exist/,
    // DNS
    /getaddrinfo|dns lookup|no such host/,
    // 驱动错误码
    /protocol_connection_lost|handshake_error|er_access_denied_error|er_con_count_error|er_bad_db_error|er_host_not_privileged|prelogin|esocket|elogin/,
    // PG/SQLServer 典型状态码
    /57p0[1235]|53300|28p01|0800[01346]|08006/,
  ]
  return connPatterns.some(re => re.test(hay))
}
