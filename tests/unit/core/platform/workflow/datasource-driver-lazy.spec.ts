/**
 * 外部数据源驱动「按需加载」单测（启动性能回归）
 *
 * 背景（2026-09-16 实测，boot-trace 分段）：工作流子系统装配时把四个驱动全部 import，
 * 其中 `mssql`（拖 3.9MB 的 tedious）单次模块求值 **378ms**、`mysql2` 133ms、`pg` 32ms，
 * 合计 **544ms** —— 占工作流子系统装配（~700ms）的绝大部分，而这三个驱动只有用户
 * 真的去连外部库时才用得上。改为懒加载后，启动路径不再付这份成本。
 *
 * 本用例在 Node 环境（无 electron）直接 import 驱动模块，断言重量级依赖**没有被加载**。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

/** 记录被求值的重量级模块；桩只提供最小形态（本用例不断言连接行为） */
function trackHeavyModules(): { loaded: Set<string>; restore: () => void } {
  const loaded = new Set<string>()
  const stubs: Record<string, () => unknown> = {
    pg: () => ({ Pool: class {}, default: { Pool: class {} } }),
    'mysql2/promise': () => ({ createPool: () => ({}) }),
    mssql: () => ({ default: { ConnectionPool: class {} }, ConnectionPool: class {} }),
    tedious: () => ({}),
  }
  const names = Object.keys(stubs)
  names.forEach((name) => {
    vi.doMock(name, () => {
      loaded.add(name)
      return stubs[name]()
    })
  })
  return { loaded, restore: () => names.forEach((n) => vi.doUnmock(n)) }
}

describe('数据源驱动按需加载', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('驱动如实声明自己是懒加载（不依赖 import 副作用）', async () => {
    const { PostgresDriverAdapter } = await import('@core/platform/workflow/datasource/drivers/postgresql-driver')
    const { MySqlDriverAdapter } = await import('@core/platform/workflow/datasource/drivers/mysql-driver')
    const { SqlServerDriverAdapter } = await import('@core/platform/workflow/datasource/drivers/sqlserver-driver')
    const { ClickHouseDriverAdapter } = await import('@core/platform/workflow/datasource/drivers/clickhouse-driver')

    expect(new PostgresDriverAdapter().driver).toBe('postgres')
    expect(new MySqlDriverAdapter().driver).toBe('mysql')
    expect(new SqlServerDriverAdapter().driver).toBe('sqlserver')
    expect(new ClickHouseDriverAdapter().driver).toBe('clickhouse')
  })

  it('导入驱动模块不会求值 mssql / mysql2 / pg', async () => {
    const { loaded, restore } = trackHeavyModules()
    try {
      await import('@core/platform/workflow/datasource/drivers/postgresql-driver')
      await import('@core/platform/workflow/datasource/drivers/mysql-driver')
      await import('@core/platform/workflow/datasource/drivers/sqlserver-driver')
      await import('@core/platform/workflow/datasource/drivers/clickhouse-driver')
      expect([...loaded]).toEqual([])
    } finally {
      restore()
    }
  })

  it('实例化驱动（启动时的装配动作）同样不求值重量级依赖', async () => {
    const { loaded, restore } = trackHeavyModules()
    try {
      const { PostgresDriverAdapter } = await import('@core/platform/workflow/datasource/drivers/postgresql-driver')
      const { MySqlDriverAdapter } = await import('@core/platform/workflow/datasource/drivers/mysql-driver')
      const { SqlServerDriverAdapter } = await import('@core/platform/workflow/datasource/drivers/sqlserver-driver')
      new PostgresDriverAdapter()
      new MySqlDriverAdapter()
      new SqlServerDriverAdapter()
      expect([...loaded]).toEqual([])
    } finally {
      restore()
    }
  })

  it('驱动注册表整体装配（workflow-boot 的启动路径）不求值重量级依赖', async () => {
    const { loaded, restore } = trackHeavyModules()
    try {
      const { DataSourceService, registerDataSourceService } = await import('@core/platform/workflow/datasource/datasource.service')
      const { registerDataSourceDriver } = await import('@core/platform/workflow/datasource/datasource-executor.service')
      const { PostgresDriverAdapter } = await import('@core/platform/workflow/datasource/drivers/postgresql-driver')
      const { MySqlDriverAdapter } = await import('@core/platform/workflow/datasource/drivers/mysql-driver')
      const { SqlServerDriverAdapter } = await import('@core/platform/workflow/datasource/drivers/sqlserver-driver')
      const { ClickHouseDriverAdapter } = await import('@core/platform/workflow/datasource/drivers/clickhouse-driver')

      registerDataSourceDriver(new PostgresDriverAdapter())
      registerDataSourceDriver(new MySqlDriverAdapter())
      registerDataSourceDriver(new SqlServerDriverAdapter())
      registerDataSourceDriver(new ClickHouseDriverAdapter())
      registerDataSourceService(new DataSourceService({} as never))

      expect([...loaded]).toEqual([])
    } finally {
      restore()
    }
  })

  it('真正查询时才加载对应驱动：连不通也不影响"已按需加载"这一结论', async () => {
    const { loaded, restore } = trackHeavyModules()
    try {
      const { PostgresDriverAdapter } = await import('@core/platform/workflow/datasource/drivers/postgresql-driver')
      const adapter = new PostgresDriverAdapter()
      const params = {
        driver: 'postgres' as const, host: '127.0.0.1', port: 1,
        database: 'x', username: 'u', password: 'p', ssl: false,
      }
      // 桩会抛错（不真连接），断言点在于：此时才 import('pg')
      await adapter.testConnection(params as never)
      expect(loaded.has('pg')).toBe(true)
    } finally {
      restore()
    }
  })
})