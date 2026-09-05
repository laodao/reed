/**
 * ClickHouse 数据源驱动适配器（HTTP）
 * @module core/platform/workflow/datasource/drivers/clickhouse-driver
 * @description 通过 ClickHouse HTTP 接口（默认 8123 端口）执行 SQL，零新依赖（fetch）。
 *              - testConnection：SELECT version()
 *              - query：HTTP POST，默认 JSONEachRow 输出；参数化用 ClickHouse 的
 *                {name:Type} 语法 + param_* 参数
 *              安全（评审 #24）：SQL 与参数值只走 POST body（form-urlencoded），
 *              不进 URL query string——URL 会落代理访问日志/查询日志，等于泄露整条查询。
 *              注意：ClickHouse 的 HTTP 接口对复杂 DML 支持有限（主要面向 OLAP 查询），
 *              适合读取/聚合场景；写操作（INSERT）走 HTTP 也有支持。
 */

import { replaceDollarPlaceholders } from '../placeholder-utils'
import type {
  DataSourceConnectionParams,
  DataSourceDriverAdapter,
  DataSourceQueryResult,
  DataSourceTestResult,
} from '@shared/types/datasource.types'

function buildUrl(params: DataSourceConnectionParams): URL {
  const scheme = params.ssl ? 'https' : 'http'
  const host = params.host.includes(':') && !params.host.startsWith('[') ? `[${params.host}]` : params.host
  const url = new URL(`${scheme}://${host}:${params.port}/`)
  // URL 只放非敏感的输出格式声明；query 与 param_* 一律走 POST body
  url.searchParams.set('default_format', 'JSONEachRow')
  return url
}

function buildHeaders(params: DataSourceConnectionParams): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' }
  if (params.username) {
    const token = Buffer.from(`${params.username}:${params.password ?? ''}`).toString('base64')
    headers['Authorization'] = `Basic ${token}`
  }
  return headers
}

/**
 * 把 SQL 里的 $1,$2 转成 ClickHouse 的 {p1:Type} 参数并收集参数值（bodyParams）。
 * 用共享 replaceDollarPlaceholders：统一 $n 语义 + 支持乱序。
 */
function normalizeParams(
  sqlText: string,
  parameters: ReadonlyArray<unknown>,
): { sql: string; bodyParams: URLSearchParams } {
  const bodyParams = new URLSearchParams()
  const { sql } = replaceDollarPlaceholders(sqlText, parameters, (index, raw) => {
    const type = inferType(raw)
    bodyParams.set(`param_p${index}`, raw == null ? '' : String(raw))
    return `{p${index}:${type}}`
  })
  return { sql, bodyParams }
}

/** 组装 POST body：query 字段 + param_* 参数字段（ClickHouse 表单编码协议） */
function buildBody(query: string, bodyParams: URLSearchParams): URLSearchParams {
  const body = new URLSearchParams(bodyParams)
  body.set('query', query)
  return body
}

function inferType(v: unknown): string {
  if (typeof v === 'number') return Number.isInteger(v) ? 'Int64' : 'Float64'
  if (typeof v === 'boolean') return 'UInt8'
  return 'String'
}

export class ClickHouseDriverAdapter implements DataSourceDriverAdapter {
  readonly driver = 'clickhouse' as const

  async testConnection(params: DataSourceConnectionParams): Promise<DataSourceTestResult> {
    const started = Date.now()
    try {
      const url = buildUrl(params)
      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: buildHeaders(params),
        body: buildBody('SELECT version() AS v', new URLSearchParams()).toString(),
        signal: AbortSignal.timeout(8_000),
      })
      const text = await res.text()
      if (!res.ok) return { success: false, message: `HTTP ${res.status}: ${text.slice(0, 200)}`, durationMs: Date.now() - started }
      const rows = parseJsonEachRow(text)
      const v = rows[0]?.v as string | undefined
      return {
        success: true,
        message: `连接成功${v ? `: ClickHouse ${v}` : ''}`,
        serverVersion: v,
        durationMs: Date.now() - started,
      }
    } catch (e: any) {
      return { success: false, message: e?.message || '连接失败', durationMs: Date.now() - started }
    }
  }

  async query(
    params: DataSourceConnectionParams,
    sqlText: string,
    parameters: ReadonlyArray<unknown> = [],
  ): Promise<DataSourceQueryResult> {
    const started = Date.now()
    // 参数归一：$1 → {p1:Type}，param_p1 值进 POST body
    const { sql, bodyParams } = normalizeParams(sqlText, parameters)
    const url = buildUrl(params)
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: buildHeaders(params),
      body: buildBody(sql, bodyParams).toString(),
      signal: AbortSignal.timeout(30_000),
    })
    const text = await res.text()
    if (!res.ok) {
      throw new Error(`ClickHouse HTTP ${res.status}: ${text.slice(0, 300)}`)
    }
    const rows = parseJsonEachRow(text)
    const columns = rows.length ? Object.keys(rows[0]) : []
    return {
      columns,
      rows,
      rowCount: rows.length,
      durationMs: Date.now() - started,
    }
  }
}

/** JSONEachRow 解析：多行 JSON 对象；空输出返回 [] */
function parseJsonEachRow(text: string): Array<Record<string, unknown>> {
  if (!text.trim()) return []
  const lines = text.trim().split('\n')
  const rows: Array<Record<string, unknown>> = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      rows.push(JSON.parse(trimmed))
    } catch {
      // 容忍非 JSON 输出（如错误信息），跳过
    }
  }
  return rows
}
