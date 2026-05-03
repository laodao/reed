/**
 * 给 character_binding / location_binding / item_binding 三张表加
 * source_type + override_* + standalone_* 字段（spec §3.7）。
 * 同时给 location_binding 加 3D 接入点字段 panorama_3d_id / scene_layout_id（spec §4.5）。
 *
 * source_type 回填规则：long_writing_xxx_id 非空 → 'linked_lw'，否则 'standalone'。
 *
 * 兼容 SQLite + PostgreSQL，幂等。
 */

import type { DataSource } from 'typeorm'

interface ColumnSpec {
  name: string
  type: string
  /** SQL DEFAULT 表达式（不含 DEFAULT 关键字），不传则列可为 null 且无默认值 */
  defaultExpr?: string
}

interface BindingTableSpec {
  /** 实际表名 */
  table: string
  /** 用来推断 source_type 的关联列名 */
  lwIdColumn: string
  /**
   * 该表要加的额外列（除 5 个公共列外）
   */
  extraColumns: ColumnSpec[]
}

/** 所有 binding 表共享的 5 个公共列 */
const COMMON_COLUMNS: ColumnSpec[] = [
  { name: 'source_type', type: 'TEXT', defaultExpr: "'standalone'" },
  { name: 'override_name', type: 'TEXT' },
  { name: 'override_description', type: 'TEXT' },
  { name: 'standalone_name', type: 'TEXT' },
  { name: 'standalone_description', type: 'TEXT' },
]

/** 各表配置 */
const BINDING_TABLES: BindingTableSpec[] = [
  {
    table: 'character_bindings',
    lwIdColumn: 'long_writing_character_id',
    extraColumns: [
      { name: 'override_appearance', type: 'TEXT' },
      { name: 'override_outfit', type: 'TEXT' },
    ],
  },
  {
    table: 'location_bindings',
    lwIdColumn: 'long_writing_location_id',
    extraColumns: [
      // 3D 接入点（spec §4.5）
      { name: 'panorama_3d_id', type: 'TEXT' },
      { name: 'scene_layout_id', type: 'TEXT' },
    ],
  },
  {
    table: 'item_bindings',
    lwIdColumn: 'long_writing_item_id',
    extraColumns: [],
  },
]

/**
 * 给 character/location/item binding 三表加 source_type + override_* + standalone_* 列，
 * 并按 long_writing_xxx_id 是否非空回填 source_type。
 *
 * 幂等：列已存在则跳过 ALTER；UPDATE 只改 source_type 为默认值的行。
 */
export async function ensureAssetBindingSourceType(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  for (const spec of BINDING_TABLES) {
    const tableExists = await checkTableExists(ds, spec.table, isPg)
    if (!tableExists) {
      console.log(`[ensure-asset-binding-source-type] 表 ${spec.table} 不存在，跳过`)
      continue
    }

    // 公共列 + 该表额外列
    const allCols: ColumnSpec[] = [...COMMON_COLUMNS, ...spec.extraColumns]

    for (const col of allCols) {
      const has = await checkColumnExists(ds, spec.table, col.name, isPg)
      if (has) continue

      const colType = isPg ? mapTypeToPg(col.type) : col.type
      const defaultClause = col.defaultExpr ? ` DEFAULT ${col.defaultExpr}` : ''
      await ds.query(
        `ALTER TABLE "${spec.table}" ADD COLUMN ${col.name} ${colType}${defaultClause}`,
      )
      console.log(`[ensure-asset-binding-source-type] ${spec.table}: 加列 ${col.name}`)
    }

    // 回填 source_type
    // linked_lw：long_writing_xxx_id 非空 且 source_type 仍为默认值（首次执行或多次执行安全）
    await ds.query(
      `UPDATE "${spec.table}" SET source_type = 'linked_lw'
       WHERE ${spec.lwIdColumn} IS NOT NULL
         AND (source_type IS NULL OR source_type = 'standalone')`,
    )
    // standalone：long_writing_xxx_id 为空 且 source_type 仍为 NULL（DDL DEFAULT 不填充已存在行）
    await ds.query(
      `UPDATE "${spec.table}" SET source_type = 'standalone'
       WHERE ${spec.lwIdColumn} IS NULL
         AND source_type IS NULL`,
    )
  }
}

// ─── 工具函数 ──────────────────────────────────────────────────────────────────

async function checkTableExists(ds: DataSource, table: string, isPg: boolean): Promise<boolean> {
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

/** SQLite 类型映射到 PostgreSQL 类型 */
function mapTypeToPg(sqliteType: string): string {
  switch (sqliteType.toUpperCase()) {
    case 'TEXT':
      return 'text'
    case 'INTEGER':
      return 'integer'
    case 'REAL':
      return 'double precision'
    default:
      return sqliteType.toLowerCase()
  }
}
