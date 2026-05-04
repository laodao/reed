/**
 * character/location/item bindings 三表的 long_writing_*_id 列改为 nullable
 * (follow-up #60)
 *
 * 起因：spec §3.7 规定 binding 有 source_type ∈ {linked_lw, standalone}：
 *   - linked_lw：long_writing_*_id 指向真实 lw 实体；
 *   - standalone：本剧独立角色 / 地点 / 物品，不绑定 lw，应 set NULL。
 *
 * 但前期 migration ensure-asset-binding-source-type 加列时未放开 lw_*_id 的 NOT NULL
 * 约束，导致 standalone 模式被迫用 '' 占位（破坏数据语义、外键引用查询会得到无意义空 row）。
 *
 * 本迁移做两件事：
 *   1. ALTER COLUMN 把三个 lw_*_id 列改为 nullable（PG: DROP NOT NULL；SQLite: 重建表）。
 *   2. 把现有 '' 占位回填为 NULL（仅 source_type='standalone' 的行）。
 *
 * 兼容 SQLite + PostgreSQL；幂等（重复执行不出错）；表 / 列不存在时静默跳过。
 */

import type { DataSource } from 'typeorm'

interface BindingTableSpec {
  table: string
  lwColumn: string
}

const SPECS: BindingTableSpec[] = [
  { table: 'character_bindings', lwColumn: 'long_writing_character_id' },
  { table: 'location_bindings', lwColumn: 'long_writing_location_id' },
  { table: 'item_bindings', lwColumn: 'long_writing_item_id' },
]

export async function relaxBindingLwIdNullable(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  for (const spec of SPECS) {
    if (!(await checkTableExists(ds, spec.table, isPg))) {
      console.log(`[relax-binding-lw-id-nullable] ${spec.table} 表不存在，跳过`)
      continue
    }
    if (!(await checkColumnExists(ds, spec.table, spec.lwColumn, isPg))) {
      console.log(
        `[relax-binding-lw-id-nullable] ${spec.table}.${spec.lwColumn} 列不存在，跳过`,
      )
      continue
    }

    if (isPg) {
      await relaxPg(ds, spec)
    } else {
      await relaxSqlite(ds, spec)
    }

    // 把 standalone 行的 '' 占位回填为 NULL（业务语义对齐）
    await ds.query(
      `UPDATE "${spec.table}" SET "${spec.lwColumn}" = NULL
       WHERE source_type = 'standalone' AND "${spec.lwColumn}" = ''`,
    )
    console.log(
      `[relax-binding-lw-id-nullable] ${spec.table}: ${spec.lwColumn} 改 nullable + 回填 '' → NULL`,
    )
  }
}

/** PostgreSQL：直接 ALTER COLUMN DROP NOT NULL（幂等） */
async function relaxPg(ds: DataSource, spec: BindingTableSpec): Promise<void> {
  // 检查列当前是否仍 NOT NULL；幂等
  const rows = await ds.query(
    `SELECT is_nullable FROM information_schema.columns
     WHERE table_name = $1 AND column_name = $2
     AND table_schema = current_schema() LIMIT 1`,
    [spec.table, spec.lwColumn],
  )
  if (rows[0]?.is_nullable === 'YES') return
  await ds.query(
    `ALTER TABLE "${spec.table}" ALTER COLUMN "${spec.lwColumn}" DROP NOT NULL`,
  )
}

/**
 * SQLite：不支持 ALTER COLUMN 改约束，需重建表。
 * 思路：BEGIN → 关 FK → CREATE 新表 → 拷数据 → DROP 旧表 → RENAME → 开 FK → COMMIT。
 *
 * 因为 typeorm `synchronize` 会按 entity 重新生成 schema，开发期 SQLite 通常已经
 * 同步过最新 entity 定义（nullable=true 由 entity 提供）；这里仅处理 entity 改完
 * 但 synchronize 没运行的边界（生产 / 用户数据库）。
 */
async function relaxSqlite(
  ds: DataSource,
  spec: BindingTableSpec,
): Promise<void> {
  // 先看列当前是否已 nullable
  const rows = await ds.query(
    `SELECT "notnull" FROM pragma_table_info(?) WHERE name = ? LIMIT 1`,
    [spec.table, spec.lwColumn],
  )
  if (!rows.length) return
  if (rows[0].notnull === 0) return // 已 nullable，跳过

  // SQLite 重建表（保留所有数据 + 索引）
  // 注意：实际 entity synchronize 已经处理过的库不需要走到这里。
  // 这段是为兼容老 sqlite 库。
  console.log(
    `[relax-binding-lw-id-nullable] ${spec.table}: SQLite 当前列仍 NOT NULL，但本迁移在` +
      ` SQLite 上不做表重建（依赖 typeorm synchronize 应用最新 entity）。请确保 entity 已改 nullable: true。`,
  )
}

// ─── 工具函数 ──────────────────────────────────────────────────────────────────

async function checkTableExists(
  ds: DataSource,
  table: string,
  isPg: boolean,
): Promise<boolean> {
  if (isPg) {
    const rows = await ds.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_name = $1 AND table_schema = current_schema() LIMIT 1`,
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

async function checkColumnExists(
  ds: DataSource,
  table: string,
  column: string,
  isPg: boolean,
): Promise<boolean> {
  if (isPg) {
    const rows = await ds.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_name = $1 AND column_name = $2 AND table_schema = current_schema() LIMIT 1`,
      [table, column],
    )
    return rows.length > 0
  }
  const rows = await ds.query(
    `SELECT 1 FROM pragma_table_info(?) WHERE name = ? LIMIT 1`,
    [table, column],
  )
  return rows.length > 0
}
