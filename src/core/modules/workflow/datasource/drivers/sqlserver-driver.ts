/**
 * SQL Server 数据源驱动适配器
 * @module core/modules/workflow/datasource/drivers/sqlserver-driver
 * @description 使用 mssql (tedious) 连接外部 SQL Server 数据库。
 *              - testConnection：SELECT 1 + 版本探测
 *              - query：参数化执行（占位符 @p1,@p2,... 按位置绑定），输出统一 QueryResult
 */

import sql from 'mssql'
import type {
  DataSourceConnectionParams,
  DataSourceDriverAdapter,
  DataSourceQueryResult,
  DataSourceTestResult,
} from '@shared/types/datasource.types'

function buildConfig(params: DataSourceConnectionParams): sql.config {
  return {
    server: params.host,
    port: params.port,
    database: params.database,
    user: params.username,
    password: params.password,
    options: {
      encrypt: params.ssl,
      trustServerCertificate: !!params.ssl,
      enableArithAbort: true,
    },
    connectionTimeout: 8_000,
    requestTimeout: 30_000,
    pool: { max: 5, min: 0, idleTimeoutMillis: 30_000 },
  }
}

/** SQL Server 占位符归一：把 SQL 里的 $1,$2 或 :name 转成 @p1,@p2（调用方已按 pg 风格写 SQL 时） */
function normalizePlaceholders(sqlText: string): string {
  return sqlText.replace(/\$(\d+)/g, (_m, n) => `@p${n}`)
}

export class SqlServerDriverAdapter implements DataSourceDriverAdapter {
  readonly driver = 'sqlserver' as const

  async testConnection(params: DataSourceConnectionParams): Promise<DataSourceTestResult> {
    const started = Date.now()
    let pool: sql.ConnectionPool | null = null
    try {
      pool = await new sql.ConnectionPool(buildConfig(params)).connect()
      const res = await pool.request().query('SELECT @@VERSION AS v')
      const v = res.recordset?.[0]?.v as string | undefined
      return {
        success: true,
        message: `连接成功${v ? `: ${v}` : ''}`,
        serverVersion: v,
        durationMs: Date.now() - started,
      }
    } catch (e: any) {
      return {
        success: false,
        message: e?.message || '连接失败',
        durationMs: Date.now() - started,
      }
    } finally {
      if (pool) await pool.close().catch(() => undefined)
    }
  }

  async query(
    params: DataSourceConnectionParams,
    sqlText: string,
    parameters: ReadonlyArray<unknown> = [],
  ): Promise<DataSourceQueryResult> {
    const started = Date.now()
    let pool: sql.ConnectionPool | null = null
    try {
      pool = await new sql.ConnectionPool(buildConfig(params)).connect()
      const request = pool.request()
      const normalized = normalizePlaceholders(sqlText)
      parameters.forEach((value, i) => {
        request.input(`p${i + 1}`, value as any)
      })
      const res = await request.query(normalized)
      const rows = (res.recordset ?? []) as Array<Record<string, unknown>>
      const columns = res.recordset?.length
        ? Object.keys(res.recordset[0])
        : (res.rowsAffected?.length ? [] : [])
      return {
        columns,
        rows,
        rowCount: res.rowsAffected?.[0] ?? rows.length,
        durationMs: Date.now() - started,
      }
    } finally {
      if (pool) await pool.close().catch(() => undefined)
    }
  }
}
