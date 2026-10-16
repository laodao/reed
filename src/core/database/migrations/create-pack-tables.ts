/**
 * 业务包内核表迁移（第一期）：business_packs + business_pack_bindings
 * @module core/database/migrations/create-pack-tables
 * @description 设计来源：tasks/2026-08-28-agent-loop-harness/18-business-pack.md §4.1/§4.2，
 *              本期裁剪：不要 business_pack_metrics、不做 uninstall、source 恒 'builtin'；
 *              列名以 src/shared/types/pack.types.ts 的 PackRecord/PackBindingRecord 为准
 *              （pack_id 主键，而非设计稿的 id 主键 + status 列）。
 *
 *              - business_packs：内置包快照（pack_id PK，manifest_hash 幂等键）
 *              - business_pack_bindings：per-user 启用/配置覆写
 *                （user_id NULL = 全局默认行；确定性代理主键 id，
 *                全局行唯一性靠表达式唯一索引 (pack_id, COALESCE(user_id,'')) 保证——
 *                两方言的 UNIQUE 约束都把 NULL 视为互不相等，挡不住重复全局行）
 *
 *              幂等。兼容 SQLite + PG。双端登记：Electron runMultiTenantMigrations +
 *              Web initDatabase（两处必须同步）。
 */

import type { DataSource } from 'typeorm'

export async function createPackTables(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  // 方言分叉惯例：PG varchar/text/integer/timestamp；SQLite TEXT/INTEGER/DATETIME
  const varchar = isPg ? 'varchar' : 'TEXT'
  const text = isPg ? 'text' : 'TEXT'
  const int = isPg ? 'integer' : 'INTEGER'
  const datetime = isPg ? 'timestamp' : 'DATETIME'

  if (!(await checkTableExists(ds, 'business_packs', isPg))) {
    await ds.query(`
      CREATE TABLE business_packs (
        pack_id       ${varchar} PRIMARY KEY,
        name          ${varchar} NOT NULL,
        version       ${varchar} NOT NULL,
        manifest_json ${text} NOT NULL,
        manifest_hash ${varchar} NOT NULL,
        source        ${varchar} NOT NULL DEFAULT 'builtin',
        enabled       ${int} NOT NULL DEFAULT 1,
        created_at    ${datetime},
        updated_at    ${datetime}
      )
    `)
    console.log('[create-pack-tables] 建表 business_packs')
  }

  if (!(await checkTableExists(ds, 'business_pack_bindings', isPg))) {
    await ds.query(`
      CREATE TABLE business_pack_bindings (
        id          ${varchar} PRIMARY KEY,
        pack_id     ${varchar} NOT NULL,
        user_id     ${varchar},
        enabled     ${int} NOT NULL DEFAULT 1,
        config_json ${text},
        created_at  ${datetime},
        updated_at  ${datetime}
      )
    `)
    console.log('[create-pack-tables] 建表 business_pack_bindings')
  }

  if (!(await checkIndexExists(ds, 'idx_bpb_pack', isPg))) {
    await ds.query(`CREATE INDEX idx_bpb_pack ON business_pack_bindings (pack_id)`)
    console.log('[create-pack-tables] 加索引 idx_bpb_pack')
  }

  // (pack_id, COALESCE(user_id,'')) 表达式唯一索引：同时约束 per-user 行与全局行唯一
  if (!(await checkIndexExists(ds, 'idx_bpb_pack_user', isPg))) {
    await ds.query(
      `CREATE UNIQUE INDEX idx_bpb_pack_user ON business_pack_bindings (pack_id, COALESCE(user_id, ''))`,
    )
    console.log('[create-pack-tables] 加唯一索引 idx_bpb_pack_user')
  }
}

async function checkTableExists(ds: DataSource, table: string, isPg: boolean): Promise<boolean> {
  if (isPg) {
    const rows = await ds.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = $1 AND table_schema = current_schema() LIMIT 1`,
      [table],
    )
    return rows.length > 0
  }
  const rows = await ds.query(
    `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`,
    [table],
  )
  return rows.length > 0
}

async function checkIndexExists(ds: DataSource, indexName: string, isPg: boolean): Promise<boolean> {
  if (isPg) {
    const rows = await ds.query(
      `SELECT 1 FROM pg_indexes WHERE indexname = $1 AND schemaname = current_schema() LIMIT 1`,
      [indexName],
    )
    return rows.length > 0
  }
  const rows = await ds.query(
    `SELECT 1 FROM sqlite_master WHERE type='index' AND name = ? LIMIT 1`,
    [indexName],
  )
  return rows.length > 0
}
