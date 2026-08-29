/**
 * PostgreSQL 数据源驱动适配器
 * @module core/modules/workflow/datasource/drivers/postgresql-driver
 * @description 使用 node-postgres (pg) 连接外部 PostgreSQL 数据库。
 *              - testConnection：SELECT 1 + 版本探测
 *              - query：参数化执行（占位符 $1,$2,...），输出统一 QueryResult
 *              连接池经 pool-cache 按 (driver+参数指纹) 复用（评审 #25）：
 *              此前每次查询 createPool→end，批量执行每行一次 TCP+TLS 握手；
 *              现在池常驻（5 分钟空闲回收），查询失败驱逐坏池下次重建。
 */

import { Pool } from 'pg'
import { acquirePooled, evictPooled } from './pool-cache'
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
    try {
      const pool = await acquirePooled<Pool>('pg', params, () => createPool(params), p => p.end())
      const res = await pool.query('SELECT version() AS v, current_database() AS db')
      const row = res.rows[0] as { v: string } | undefined
      return {
        success: true,
        message: `连接成功${row?.v ? `: ${row.v}` : ''}`,
        serverVersion: row?.v ? serverVersionFrom({ server_version: row.v }) : undefined,
        durationMs: Date.now() - started,
      }
    } catch (e: any) {
      await evictPooled('pg', params)
      return {
        success: false,
        message: e?.message || '连接失败',
        durationMs: Date.now() - started,
      }
    }
  }

  async query(
    params: DataSourceConnectionParams,
    sql: string,
    parameters: ReadonlyArray<unknown> = [],
  ): Promise<DataSourceQueryResult> {
    const started = Date.now()
    try {
      const pool = await acquirePooled<Pool>('pg', params, () => createPool(params), p => p.end())
      const res = await pool.query(sql, parameters as unknown[])
      const columns = res?.fields?.map(f => f.name) ?? []
      const rows = (res?.rows ?? []) as Array<Record<string, unknown>>
      return {
        columns,
        rows,
        rowCount: res?.rowCount ?? rows.length,
        durationMs: Date.now() - started,
      }
    } catch (e) {
      // 池内连接可能已死（网络断/服务重启）：驱逐坏池，下次调用重建
      await evictPooled('pg', params)
      throw e
    }
  }
}
