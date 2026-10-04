/**
 * `mssql` 类型声明（最小可用子集）
 *
 * 背景：`mssql` 包本身不带类型，仓库也未安装 `@types/mssql`。
 * 原先驱动文件用值导入（`import sql from 'mssql'`），在无声明文件时被推断为
 * `any` 而侥幸通过；自 2026-09-16 驱动改为**按需加载**后，文件里只剩类型位
 * 置引用（`import type sql from 'mssql'`），类型导入必须能解析到真实声明，
 * 否则报 TS7016。此处按「实际用到的成员」补齐声明，避免退回 `any`。
 *
 * 只声明本仓库用到的成员：`config` 与 `ConnectionPool`。
 * 若后续用到更多 mssql API，应在此补充，而不是改成 any。
 */
declare module 'mssql' {
  /** 连接配置（透传给 tedious；本仓库只填写固定字段，故保留开放键） */
  interface config {
    server: string
    port?: number
    database?: string
    user?: string
    password?: string
    options?: {
      encrypt?: boolean
      trustServerCertificate?: boolean
      enableArithAbort?: boolean
      [key: string]: unknown
    }
    connectionTimeout?: number
    requestTimeout?: number
    pool?: {
      max?: number
      min?: number
      idleTimeoutMillis?: number
    }
    [key: string]: unknown
  }

  /** 查询结果记录集（按列名索引） */
  interface IRecordSet<T = Record<string, unknown>> extends Array<T> {
    columns?: Record<string, unknown>
  }

  /** 单次请求结果 */
  interface IResult<T = Record<string, unknown>> {
    recordset?: IRecordSet<T>
    recordsets?: Array<IRecordSet<T>>
    rowsAffected?: number[]
    output?: Record<string, unknown>
  }

  /** 参数化查询请求 */
  interface Request {
    input(name: string, value: unknown): Request
    query<T = Record<string, unknown>>(command: string): Promise<IResult<T>>
  }

  /** 连接池 */
  interface ConnectionPool {
    connect(): Promise<ConnectionPool>
    request(): Request
    close(): Promise<void>
    connected: boolean
  }

  /** 连接池构造器 */
  const ConnectionPool: {
    new (config: config): ConnectionPool
  }

  export { ConnectionPool }
  export type { config, ConnectionPool, IResult, IRecordSet, Request }
}