/**
 * 数据源 SQL 执行服务 + 驱动注册表
 * @module core/platform/workflow/datasource/datasource-executor.service
 * @description 统一第三方数据库 SQL 执行入口：
 *              - 驱动注册表（drivers: Record<Driver, Adapter>），按数据源 driver 路由
 *              - 数据源常驻连接上下文（host/port/db/user/password/ssl）由 service 解密后传入
 *              - 所有驱动输出统一 DataSourceQueryResult 形状
 *              节点与 Agent 均通过本服务执行，绝不直接连库。
 */

import type {
  DataSourceConnectionParams,
  DataSourceDriver,
  DataSourceDriverAdapter,
  DataSourceQueryResult,
  DataSourceTestResult,
} from '@shared/types/datasource.types'

/** 驱动注册表（注入式；workflow-boot 装配时注册具体驱动实现） */
type DriverRegistry = Partial<Record<DataSourceDriver, DataSourceDriverAdapter>>

let _drivers: DriverRegistry = {}

/** 注册一个驱动适配器（可重复注册覆盖） */
export function registerDataSourceDriver(adapter: DataSourceDriverAdapter): void {
  _drivers = { ..._drivers, [adapter.driver]: adapter }
}

/** 获取单个驱动（未注册时抛错，避免静默连接失败） */
export function getDataSourceDriver(driver: DataSourceDriver): DataSourceDriverAdapter {
  const adapter = _drivers[driver]
  if (!adapter) {
    throw new Error(`数据源驱动未注册: ${driver}`)
  }
  return adapter
}

/** 测试数据源连接（按 driver 路由到对应适配器） */
export async function testDataSourceConnection(
  driver: DataSourceDriver,
  params: DataSourceConnectionParams,
): Promise<DataSourceTestResult> {
  const adapter = getDataSourceDriver(driver)
  return adapter.testConnection(params)
}

/**
 * 对数据源执行 SQL。
 * - sql: 带占位符（形如 $1 / $2，或 :name，由驱动归一化）的 SQL 模板
 * - parameters: 参数化值数组；调用方须以参数化形式传值，禁止字符串拼接（防注入）
 */
export async function executeDataSourceSql(
  driver: DataSourceDriver,
  params: DataSourceConnectionParams,
  sql: string,
  parameters: ReadonlyArray<unknown> = [],
): Promise<DataSourceQueryResult> {
  const adapter = getDataSourceDriver(driver)
  return adapter.query(params, sql, parameters)
}
