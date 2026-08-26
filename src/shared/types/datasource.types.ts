/**
 * 数据源（第三方数据库连接）类型定义
 * @module shared/types/datasource.types
 * @description 让工作流引擎能连接第三方/外部系统数据库，读取/写入真实数据。
 *              每个数据源 = 连接参数 + 加密凭据；由「数据库」工作流节点选中执行。
 *              第一版：postgres 驱动（pg 已内置）；mysql / sqlserver / clickhouse /
 *              druid / flink 等通过同一套快接注册表后续按需补充适配器。
 */

/** 数据源驱动类型（决定连接方式与 SQL 方言） */
export type DataSourceDriver = 'postgres' | 'mysql' | 'sqlserver' | 'clickhouse'

/** 数据源驱动枚举常量（键=值） */
export const DATA_SOURCE_DRIVERS = {
  postgres: 'postgres',
  mysql: 'mysql',
  sqlserver: 'sqlserver',
  clickhouse: 'clickhouse',
} as const
export const DATA_SOURCE_DRIVER_LIST = [
  { value: 'postgres', label: 'PostgreSQL' },
  { value: 'mysql', label: 'MySQL' },
  { value: 'sqlserver', label: 'SQL Server' },
  { value: 'clickhouse', label: 'ClickHouse' },
] as const

/** 数据源类型列表（前端下拉用；含安全说明） */
export interface DataSourceDriverMeta {
  driver: DataSourceDriver
  label: string
  /** 本驱动是否需要 host/port/用户名/密码（clickhouse 等 HTTP 型可能不需要密码） */
  needsCredentials: boolean
  /** 默认端口（用于表单占位与测试连接兜底） */
  defaultPort: number
}

export const DATA_SOURCE_DRIVER_META: Record<DataSourceDriver, DataSourceDriverMeta> = {
  postgres: { driver: 'postgres', label: 'PostgreSQL', needsCredentials: true, defaultPort: 5432 },
  mysql: { driver: 'mysql', label: 'MySQL', needsCredentials: true, defaultPort: 3306 },
  sqlserver: { driver: 'sqlserver', label: 'SQL Server', needsCredentials: true, defaultPort: 1433 },
  clickhouse: { driver: 'clickhouse', label: 'ClickHouse', needsCredentials: true, defaultPort: 8123 },
}

/** 数据源连接请求（发起一次可复用的数据库连接上下文） */
export interface DataSourceConnectionParams {
  host: string
  port: number
  database: string
  username?: string
  /** 明文密码，仅存在于运行期请求/测试连接；落库时一律加密 */
  password?: string
  /** 是否启用 SSL/TLS */
  ssl?: boolean
}

/**
 * 数据源配置（存储层 DTO，后端存储；password 密文在仓库层返回）
 * 注：调用方拿到的是 `passwordEnc`（密文），前端永不展示明文。
 */
export interface DataSourceConfig {
  id: string
  name: string
  driver: DataSourceDriver
  host: string
  port: number
  database: string
  username: string | null
  /** SecureStorage 加密后的密码密文（绝不明文落库） */
  passwordEnc: string | null
  ssl: boolean
  isEnabled: boolean
  createdAt: number
  updatedAt: number
}

/** 前端可见的数据源配置（密码以占位符遮盖，不暴露密文） */
export interface DataSourceConfigView extends Omit<DataSourceConfig, 'passwordEnc'> {
  /** 占位符，表明已设置密码 */
  hasPassword: boolean
}

/** 创建数据源请求（密码明文进入 service 层加密；服务端不存储明文） */
export interface CreateDataSourceRequest {
  name: string
  driver: DataSourceDriver
  host: string
  port: number
  database: string
  username?: string
  password?: string
  ssl?: boolean
}

/** 更新数据源请求（password 为空表示不改密码） */
export interface UpdateDataSourceRequest {
  name?: string
  driver?: DataSourceDriver
  host?: string
  port?: number
  database?: string
  username?: string
  password?: string
  ssl?: boolean
  isEnabled?: boolean
}

/** SQL 查询结果（统一形状：任何驱动都输出此形状） */
export interface DataSourceQueryResult {
  /** 列名数组 */
  columns: string[]
  /** 行数组（每行是列名→值对象） */
  rows: Array<Record<string, unknown>>
  /** 受影响行数（insert/update/delete/DDL 时） */
  rowCount: number
  /** 执行耗时 ms */
  durationMs: number
}

/** 「数据库」节点查询权限模式 */
export type DataSourceOpMode = 'query' | 'execute'

/** 测试连接结果 */
export interface DataSourceTestResult {
  success: boolean
  message: string
  /** 测试出的服务端版本（可供 UI 展示） */
  serverVersion?: string
  /** 测试耗时 ms */
  durationMs?: number
}

/** 数据源驱动适配器接口：所有驱动必须实现 */
export interface DataSourceDriverAdapter {
  readonly driver: DataSourceDriver
  /** 测试连接（SELECT 1 / ping） */
  testConnection(params: DataSourceConnectionParams): Promise<DataSourceTestResult>
  /** 执行 SQL。params 是参数化占位符（$1,$2,... 或者 :name 由驱动归一化） */
  query(
    params: DataSourceConnectionParams,
    sql: string,
    parameters?: ReadonlyArray<unknown>,
  ): Promise<DataSourceQueryResult>
}
