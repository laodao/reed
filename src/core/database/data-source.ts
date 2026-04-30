/**
 * TypeORM DataSource 工厂
 * @module core/database/data-source
 * @description 根据 DbConfig 构造并初始化 DataSource，支持 sqlite / postgres。
 */

import { DataSource, type DataSourceOptions } from 'typeorm'
import type { DbConfig } from './config'
import * as entities from './entities'

export interface CreateDataSourceOptions {
  config: DbConfig
  /** 是否在创建后立即调用 synchronize（测试常用 true，生产由调用方控制） */
  synchronizeOnInit?: boolean
}

/**
 * 创建并初始化 DataSource。
 * - 不做 schema 漂移检查（DatabaseManager 职责）
 * - 不做 synchronize（除非显式 synchronizeOnInit:true）
 */
export async function createDataSource(opts: CreateDataSourceOptions): Promise<DataSource> {
  const ds = new DataSource(buildDataSourceOptions(opts))
  await ds.initialize()
  if (opts.synchronizeOnInit) {
    await ds.synchronize()
  }
  return ds
}

function buildDataSourceOptions(opts: CreateDataSourceOptions): DataSourceOptions {
  const cfg = opts.config
  const allEntities = Object.values(entities).filter(
    v => typeof v === 'function',
  ) as Function[]

  if (cfg.type === 'sqlite') {
    return {
      type: 'better-sqlite3',
      database: cfg.database,
      entities: allEntities as any,
      synchronize: false,
      logging: process.env.DB_LOGGING === 'true',
      prepareDatabase: (db: any) => {
        if (cfg.enableWal !== false && cfg.database !== ':memory:') {
          db.pragma('journal_mode = WAL')
        }
        db.pragma('foreign_keys = ON')
      },
    }
  }

  return {
    type: 'postgres',
    host: cfg.host,
    port: cfg.port,
    username: cfg.username,
    password: cfg.password,
    database: cfg.database,
    entities: allEntities as any,
    synchronize: false,
    logging: process.env.DB_LOGGING === 'true',
    extra: { max: cfg.poolSize ?? 10 },
    ssl: cfg.ssl ? { rejectUnauthorized: false } : false,
  }
}
