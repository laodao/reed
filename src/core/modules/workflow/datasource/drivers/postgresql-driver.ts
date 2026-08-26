/**
 * PostgreSQL 数据源驱动适配器
 * @module core/modules/workflow/datasource/drivers/postgresql-driver
 * @description 使用 node-postgres (pg) 连接外部 PostgreSQL 数据库。
 *              - testConnection：SELECT 1 + 版本探测
 *              - query：参数化执行（占位符 $1,$2,...），输出统一 QueryResult
 *              每次调用建短连接（Pool 连接池），完成后释放。
 */

import { Pool } from 'pg'
import type {
  DataSourceConnectionParams,
  DataSourceDriverAdapter,
  DataSourceQueryResult,
  DataSourceTestResult,
} from '@shared/types/datasource.types'

function createPool(params: DataSourceConnectionParams): Pool {
  return new Pool({
    host: params.host,
    port: params.port,
    database: params.database,
    user: params.username,
    password: params.password,
    ssl: params.ssl ? { rejectUnauthorized: false } : false,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 8_000,
  })
}

function serverVersionFrom(res: { server_version: string }): string {
  return res.server_version ?? ''
}

export class PostgresDriverAdapter implements DataSourceDriverAdapter {
  readonly driver = 'postgres' as const

  async testConnection(params: DataSourceConnectionParams): Promise<DataSourceTestResult> {
    const started = Date.now()
    const pool = createPool(params)
    try {
      const res = await pool.query('SELECT version() AS v, current_database() AS db')
      const row = res.rows[0] as { v: string } | undefined
      return {
        success: true,
        message: `连接成功${row?.v ? `: ${row.v}` : ''}`,
        serverVersion: row?.v ? serverVersionFrom({ server_version: row.v }) : undefined,
        durationMs: Date.now() - started,
      }
    } catch (e: any) {
      return {
        success: false,
        message: e?.message || '连接失败',
        durationMs: Date.now() - started,
      }
    } finally {
      await pool.end().catch(() => undefined)
    }
  }

  async query(
    params: DataSourceConnectionParams,
    sql: string,
    parameters: ReadonlyArray<unknown> = [],
  ): Promise<DataSourceQueryResult> {
    const started = Date.now()
    const pool = createPool(params)
    try {
      const res = await pool.query(sql, parameters as unknown[])
      const columns = res?.fields?.map(f => f.name) ?? []
      const rows = (res?.rows ?? []) as Array<Record<string, unknown>>
      return {
        columns,
        rows,
        rowCount: res?.rowCount ?? rows.length,
        durationMs: Date.now() - started,
      }
    } finally {
      await pool.end().catch(() => undefined)
    }
  }
}
