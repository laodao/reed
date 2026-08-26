/**
 * MySQL 数据源驱动适配器
 * @module core/modules/workflow/datasource/drivers/mysql-driver
 * @description 使用 mysql2 (promise API) 连接外部 MySQL 数据库。
 *              - testConnection：SELECT 1 + 版本探测
 *              - query：参数化执行（占位符 ?），输出统一 QueryResult
 *              占位符归一：SQL 中 $1,$2 → 转换或直接要求 ?（由调用方按驱动方言写 SQL；
 *              MySQL 用 ? 占位符，参数顺序对应）。
 */

import { createPool } from 'mysql2/promise'
import type {
  DataSourceConnectionParams,
  DataSourceDriverAdapter,
  DataSourceQueryResult,
  DataSourceTestResult,
} from '@shared/types/datasource.types'

function createMysqlPool(params: DataSourceConnectionParams) {
  return createPool({
    host: params.host,
    port: params.port,
    database: params.database,
    user: params.username,
    password: params.password,
    ssl: params.ssl ? {} : undefined,
    connectionLimit: 5,
    connectTimeout: 8_000,
    dateStrings: false,
  })
}

export class MySqlDriverAdapter implements DataSourceDriverAdapter {
  readonly driver = 'mysql' as const

  async testConnection(params: DataSourceConnectionParams): Promise<DataSourceTestResult> {
    const started = Date.now()
    const pool = createMysqlPool(params)
    try {
      const conn = await pool.getConnection()
      try {
        const [rows] = await conn.query('SELECT VERSION() AS v, DATABASE() AS db')
        const row = Array.isArray(rows) ? rows[0] : rows
        const v = (row as { v?: string })?.v
        return {
          success: true,
          message: `连接成功${v ? `: ${v}` : ''}`,
          serverVersion: v,
          durationMs: Date.now() - started,
        }
      } finally {
        conn.release()
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
    const pool = createMysqlPool(params)
    try {
      const conn = await pool.getConnection()
      try {
        const [rows, fields] = await conn.query(sql, parameters as unknown[])
        const columns = Array.isArray(fields)
          ? fields.map((f: any) => f.name)
          : (fields as any)?.map?.((f: any) => f.name) ?? []
        const rowArray = Array.isArray(rows) ? rows : [rows]
        return {
          columns,
          rows: rowArray as Array<Record<string, unknown>>,
          rowCount: Array.isArray(rows) ? rows.length : (rows as any)?.affectedRows ?? 0,
          durationMs: Date.now() - started,
        }
      } finally {
        conn.release()
      }
    } finally {
      await pool.end().catch(() => undefined)
    }
  }
}
