/**
 * 数据库配置类型与加载
 * @module core/database/config
 * @description 平台无关的数据库配置抽象，支持 sqlite / postgres 双方言
 */

export type DbDialect = 'sqlite' | 'postgres'

export interface SqliteDbConfig {
  type: 'sqlite'
  /** 完整文件路径；调用方注入（electron 端传 userData/the_bot.db；测试可传 :memory:） */
  database: string
  /** 启用 WAL 模式（默认 true） */
  enableWal?: boolean
}

export interface PostgresDbConfig {
  type: 'postgres'
  host: string
  port: number
  username: string
  password: string
  database: string
  /** 连接池上限，默认 10 */
  poolSize?: number
  ssl?: boolean
}

export type DbConfig = SqliteDbConfig | PostgresDbConfig

/**
 * 从环境变量加载数据库配置。
 * - 设 DB_TYPE=postgres → 读 PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE
 * - 设 DB_TYPE=sqlite + SQLITE_PATH → sqlite 配置
 * - 未设 → 返回 null（调用方自己兜底）
 */
export function loadDbConfigFromEnv(): DbConfig | null {
  const dbType = process.env.DB_TYPE
  if (dbType === 'postgres') {
    return {
      type: 'postgres',
      host: process.env.PGHOST ?? 'localhost',
      port: Number(process.env.PGPORT ?? 5432),
      username: process.env.PGUSER ?? 'postgres',
      password: process.env.PGPASSWORD ?? '',
      database: process.env.PGDATABASE ?? 'the_bot',
      poolSize: Number(process.env.PG_POOL_SIZE ?? 10),
      ssl: process.env.PGSSL === 'true',
    }
  }
  if (dbType === 'sqlite') {
    const file = process.env.SQLITE_PATH
    if (!file) return null
    return { type: 'sqlite', database: file, enableWal: true }
  }
  return null
}
