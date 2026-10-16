/**
 * SQL Server 数据源驱动适配器
 * @module core/platform/workflow/datasource/drivers/sqlserver-driver
 * @description 使用 mssql (tedious) 连接外部 SQL Server 数据库。
 *              - testConnection：SELECT 1 + 版本探测
 *              - query：统一 $1,$2 占位符 → 翻译为 @p1,@p2 并按编号 input 绑定，输出统一 QueryResult
 *
 * ⚠️ 驱动按需加载（2026-09-16 启动性能实测）：`mssql` 会拖入 3.9MB 的 `tedious`，
 * 模块求值单次 **378ms**（mysql2 133ms / pg 32ms）。原来在 boot 装配时静态 import，
 * 四个驱动合计 ~544ms 全压在启动关键路径上，而只有用户真的连外部库才用得到。
 * 现在改为首次使用（testConnection/query）时才动态 import。
 */

import type sql from 'mssql'
import { replaceDollarPlaceholders } from '../placeholder-utils'
import { acquirePooled, evictPooled, isConnectionClassError } from './pool-cache'
import { lazyModule } from './lazy-module'
import type {
  DataSourceConnectionParams,
  DataSourceDriverAdapter,
  DataSourceQueryResult,
  DataSourceTestResult,
} from '@shared/types/datasource.types'

/** mssql 单例加载器（首次连接才真正求值；CJS/ESM 双形态归一） */
const loadMssql = lazyModule(() => import('mssql'), (m) => m.default ?? m)

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

export class SqlServerDriverAdapter implements DataSourceDriverAdapter {
  readonly driver = 'sqlserver' as const

  async testConnection(params: DataSourceConnectionParams): Promise<DataSourceTestResult> {
    const started = Date.now()
    try {
      const sqlMod = await loadMssql()
      const pool = await acquirePooled<sql.ConnectionPool>(
        'sqlserver', params,
        () => new sqlMod.ConnectionPool(buildConfig(params)).connect(),
        p => p.close()
      )
      const res = await pool.request().query('SELECT @@VERSION AS v')
      const v = res.recordset?.[0]?.v as string | undefined
      return {
        success: true,
        message: `连接成功${v ? `: ${v}` : ''}`,
        serverVersion: v,
        durationMs: Date.now() - started,
      }
    } catch (e: any) {
      await evictPooled('sqlserver', params)
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
      const sqlMod = await loadMssql()
      const pool = await acquirePooled<sql.ConnectionPool>(
        'sqlserver', params,
        () => new sqlMod.ConnectionPool(buildConfig(params)).connect(),
        p => p.close()
      )
      const request = pool.request()
      // 统一 $n → @pn；按编号 input 绑定（乱序 $2,$1 也正确）
      const { sql: sqlRendered } = replaceDollarPlaceholders(sqlText, parameters, (index) => `@p${index}`)
      parameters.forEach((value, i) => {
        request.input(`p${i + 1}`, value as any)
      })
      const res = await request.query(sqlRendered)
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
    } catch (e) {
      // 仅连接/网络/认证类失败才驱逐池；SQL 语法/约束等查询层错误保留池（评审 #25 后续）
      if (isConnectionClassError(e)) {
        await evictPooled('sqlserver', params)
      }
      throw e
    }
  }
}
