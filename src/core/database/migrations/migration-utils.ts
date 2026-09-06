/**
 * 迁移公共工具：表/索引存在性检查与幂等创建（SQLite + PG 双方言）
 * @module core/database/migrations/migration-utils
 *
 * 架构统一（2026-09-06 深度 review）：create-workflow-tables / create-platform-event-tables /
 * create-agent-tables 三处同构实现收口为一份——新增迁移只用 DDL + 本工具组，
 * 不再复制粘贴存在性检查样板。
 */

import type { DataSource } from 'typeorm'
import { createLogger } from '@core/utils/logger'

const logger = createLogger('migration-utils')

/** 建表（不存在才建）；已存在时执行 onExists 补齐索引（老库升级路径） */
export async function ensureTable(
  ds: DataSource,
  isPg: boolean,
  table: string,
  ddl: string,
  onExists: () => Promise<void>,
  logTag = 'migration-utils'
): Promise<void> {
  const exists = await checkTableExists(ds, table, isPg)
  if (exists) {
    await onExists() // 表已存在 → 确保索引也存在（补齐旧库）
    return
  }
  await ds.query(ddl)
  await onExists()
  console.log(`[${logTag}] 表 ${table} 创建完成`)
}

export async function checkTableExists(
  ds: DataSource,
  table: string,
  isPg: boolean
): Promise<boolean> {
  if (isPg) {
    const rows = await ds.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = $1 AND table_schema = current_schema() LIMIT 1`,
      [table]
    )
    return rows.length > 0
  }
  const rows = await ds.query(
    `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`,
    [table]
  )
  return rows.length > 0
}

export async function checkIndexExists(
  ds: DataSource,
  indexName: string,
  isPg: boolean
): Promise<boolean> {
  if (isPg) {
    const rows = await ds.query(
      `SELECT 1 FROM pg_indexes WHERE indexname = $1 AND schemaname = current_schema() LIMIT 1`,
      [indexName]
    )
    return rows.length > 0
  }
  const rows = await ds.query(
    `SELECT 1 FROM sqlite_master WHERE type='index' AND name = ? LIMIT 1`,
    [indexName]
  )
  return rows.length > 0
}

export async function ensureIndex(
  ds: DataSource,
  isPg: boolean,
  indexName: string,
  table: string,
  columns: string,
  unique = false
): Promise<void> {
  if (await checkIndexExists(ds, indexName, isPg)) return
  const uniqueKw = unique ? 'UNIQUE ' : ''
  try {
    await ds.query(`CREATE ${uniqueKw}INDEX ${indexName} ON ${table} ${columns}`)
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    // 索引可能已由 entity synchronize 建过（如 sqlite 测试库），忽略冲突
    if (!/already exists|duplicate/i.test(message)) throw e
  }
}

/** 带部分 WHERE 的唯一索引（两方言均支持）；建不出不阻断 boot，仅告警 */
export async function ensurePartialUniqueIndex(
  ds: DataSource,
  isPg: boolean,
  indexName: string,
  table: string,
  columns: string,
  where: string,
  onWarn: string
): Promise<void> {
  if (await checkIndexExists(ds, indexName, isPg)) return
  try {
    await ds.query(`CREATE UNIQUE INDEX ${indexName} ON ${table} ${columns} WHERE ${where}`)
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    if (!/already exists|duplicate/i.test(message)) {
      logger.warn(`[migration-utils] ${onWarn}（唯一性退回应用层检查）`, e)
    }
  }
}
