/**
 * MySQL 数据源驱动适配器
 * @module core/platform/workflow/datasource/drivers/mysql-driver
 * @description 使用 mysql2 (promise API) 连接外部 MySQL 数据库。
 *              - testConnection：SELECT 1 + 版本探测
 *              - query：统一 $1,$2 占位符 → 翻译为 mysql2 的 ?（按占位符出现顺序收集参数值）
 *              输出统一 QueryResult。
 */

import { createPool } from 'mysql2/promise'
import { acquirePooled, evictPooled, isConnectionClassError } from './pool-cache'
import { replaceDollarPlaceholders } from '../placeholder-utils'
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
    try {
      const pool = await acquirePooled('mysql', params, () => createMysqlPool(params), p => p.end())
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
      await evictPooled('mysql', params)
      return {
        success: false,
        message: e?.message || '连接失败',
        durationMs: Date.now() - started,
      }
    }
  }

  async query(
    params: DataSourceConnectionParams,
    sqlText: string,
    parameters: ReadonlyArray<unknown> = [],
  ): Promise<DataSourceQueryResult> {
    const started = Date.now()
    try {
      const pool = await acquirePooled('mysql', params, () => createMysqlPool(params), p => p.end())
      const conn = await pool.getConnection()
      try {
        // 统一 $n → mysql2 的 ?；参数值按占位符出现顺序收集（支持乱序 $2,$1）
        const { sql, orderedValues } = replaceDollarPlaceholders(sqlText, parameters, () => '?')
        const [rows, fields] = await conn.query(sql, orderedValues)
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
    } catch (e) {
      // 仅连接/网络/认证类失败才驱逐池；SQL 语法/约束等查询层错误保留池（评审 #25 后续）
      if (isConnectionClassError(e)) {
        await evictPooled('mysql', params)
      }
      throw e
    }
  }
}
