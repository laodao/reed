/**
 * 设定资产库（世界观库 + 角色 IP 库）P0 迁移（2026-09-24，设计文档
 * docs/design/2026-09-24-worldview-ip-library-design.md §4）
 *
 * - 6 张库表：lw_worlds / lw_world_kinds / lw_world_entries / lw_world_edges /
 *   lw_ip_characters / lw_ip_edges（user 作用域，无 project 维度——库存「世界常量」）
 * - 2 张绑定表：lw_world_bindings / lw_ip_bindings（project 作用域；world_id /
 *   ip_character_id 不加 FK——库删除永不级联到项目）
 * - 既有实体表血缘列：library_world_id / library_entry_id / library_version
 *   （导入实例化模式：导入行是普通项目行，id 为项目内新 id，读路径零改动）；
 *   characters 另加 library_ip_id + motivation / flaw / character_arc（四层人设进项目）
 *
 * 兼容 SQLite + PG，幂等（表/列已存在则跳过）。
 * 修真等题材模板不在此播种——kinds 是 per-world 行，由
 * world-library.service.createWorld({fromTemplate}) 在建世界时写入。
 *
 * 接入点：
 * - Electron：src/electron/database/index.ts runMultiTenantMigrations()
 * - Web：src/web/server/index.ts initDatabase()
 */

import type { DataSource } from 'typeorm'
import { checkTableExists } from './migration-utils'

/** 库表清单（幂等建表） */
const TABLE_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS lw_worlds (
      id varchar PRIMARY KEY,
      user_id varchar NULL,
      name varchar NOT NULL,
      genre varchar DEFAULT 'custom',
      tagline varchar NULL,
      description text NULL,
      cover_path varchar NULL,
      status varchar DEFAULT 'active',
      version integer DEFAULT 1,
      tags text NULL,
      created_at bigint NULL,
      updated_at bigint NULL
    )`,
  `CREATE TABLE IF NOT EXISTS lw_world_kinds (
      id varchar PRIMARY KEY,
      user_id varchar NULL,
      world_id varchar NOT NULL,
      key varchar NOT NULL,
      label varchar NOT NULL,
      icon varchar NULL,
      sort_order integer DEFAULT 100,
      fields_schema text NULL,
      prompt_hint text NULL,
      enabled integer DEFAULT 1,
      created_at bigint NULL,
      updated_at bigint NULL
    )`,
  `CREATE TABLE IF NOT EXISTS lw_world_entries (
      id varchar PRIMARY KEY,
      user_id varchar NULL,
      world_id varchar NOT NULL,
      kind_key varchar NOT NULL,
      name varchar NOT NULL,
      aliases text NULL,
      summary text NULL,
      fields text NULL,
      parent_id varchar NULL,
      sort_order integer DEFAULT 0,
      rank_value integer NULL,
      pinned integer DEFAULT 0,
      origin text NULL,
      created_at bigint NULL,
      updated_at bigint NULL
    )`,
  `CREATE TABLE IF NOT EXISTS lw_world_edges (
      id varchar PRIMARY KEY,
      user_id varchar NULL,
      world_id varchar NOT NULL,
      source_id varchar NOT NULL,
      target_id varchar NOT NULL,
      relation_type varchar NOT NULL,
      label varchar NULL,
      origin text NULL,
      created_at bigint NULL
    )`,
  `CREATE TABLE IF NOT EXISTS lw_ip_characters (
      id varchar PRIMARY KEY,
      user_id varchar NULL,
      name varchar NOT NULL,
      aliases text NULL,
      world_id varchar NULL,
      gender varchar NULL,
      age varchar NULL,
      race varchar NULL,
      occupation varchar NULL,
      appearance text NULL,
      portrait_id varchar NULL,
      personality text NULL,
      motivation text NULL,
      flaw text NULL,
      background text NULL,
      values_notes text NULL,
      talents text NULL,
      abilities text NULL,
      signature_items text NULL,
      character_arc text NULL,
      catchphrases text NULL,
      fields text NULL,
      tags text NULL,
      status varchar DEFAULT 'active',
      origin text NULL,
      created_at bigint NULL,
      updated_at bigint NULL
    )`,
  `CREATE TABLE IF NOT EXISTS lw_ip_edges (
      id varchar PRIMARY KEY,
      user_id varchar NULL,
      source_id varchar NOT NULL,
      target_id varchar NOT NULL,
      relation_type varchar NOT NULL,
      label varchar NULL,
      description text NULL,
      created_at bigint NULL
    )`,
  `CREATE TABLE IF NOT EXISTS lw_world_bindings (
      id varchar PRIMARY KEY,
      user_id varchar NULL,
      project_id varchar NOT NULL,
      world_id varchar NOT NULL,
      world_name varchar DEFAULT '',
      is_primary integer DEFAULT 1,
      config text NULL,
      created_at bigint NULL
    )`,
  `CREATE TABLE IF NOT EXISTS lw_ip_bindings (
      id varchar PRIMARY KEY,
      user_id varchar NULL,
      project_id varchar NOT NULL,
      ip_character_id varchar NOT NULL,
      ip_name varchar DEFAULT '',
      project_character_id varchar NULL,
      role_position varchar NULL,
      created_at bigint NULL
    )`,
]

const INDEX_DDL: Array<{ sql: string; table: string }> = [
  { table: 'lw_world_kinds', sql: `CREATE INDEX IF NOT EXISTS idx_lw_world_kinds_world ON lw_world_kinds (world_id)` },
  { table: 'lw_world_entries', sql: `CREATE INDEX IF NOT EXISTS idx_lw_world_entries_world_kind ON lw_world_entries (world_id, kind_key)` },
  { table: 'lw_world_entries', sql: `CREATE INDEX IF NOT EXISTS idx_lw_world_entries_world_pinned ON lw_world_entries (world_id, pinned)` },
  { table: 'lw_world_edges', sql: `CREATE INDEX IF NOT EXISTS idx_lw_world_edges_world ON lw_world_edges (world_id)` },
  { table: 'lw_ip_characters', sql: `CREATE INDEX IF NOT EXISTS idx_lw_ip_characters_world ON lw_ip_characters (world_id)` },
  { table: 'lw_ip_edges', sql: `CREATE INDEX IF NOT EXISTS idx_lw_ip_edges_source ON lw_ip_edges (source_id)` },
  { table: 'lw_ip_edges', sql: `CREATE INDEX IF NOT EXISTS idx_lw_ip_edges_target ON lw_ip_edges (target_id)` },
  { table: 'lw_world_bindings', sql: `CREATE INDEX IF NOT EXISTS idx_lw_world_bindings_project ON lw_world_bindings (project_id)` },
  { table: 'lw_world_bindings', sql: `CREATE INDEX IF NOT EXISTS idx_lw_world_bindings_world ON lw_world_bindings (world_id)` },
  { table: 'lw_ip_bindings', sql: `CREATE INDEX IF NOT EXISTS idx_lw_ip_bindings_project ON lw_ip_bindings (project_id)` },
  { table: 'lw_ip_bindings', sql: `CREATE INDEX IF NOT EXISTS idx_lw_ip_bindings_ip ON lw_ip_bindings (ip_character_id)` },
]

/** 既有实体表的血缘列（导入实例化的行记库来源） */
const LINEAGE_TABLES = [
  'lw_story_characters',
  'lw_story_locations',
  'lw_project_factions',
  'lw_story_skills',
  'lw_story_items',
  'lw_custom_entities',
]

/** characters 专属：IP 血源 + 四层人设（动机/软肋/弧光），原生角色也可填 */
const CHARACTER_EXTRA_COLUMNS = ['library_ip_id', 'motivation', 'flaw', 'character_arc']

async function addColumnIdempotent(ds: DataSource, table: string, column: string, ddl: string): Promise<void> {
  try {
    await ds.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`)
  } catch (e: any) {
    // 幂等：duplicate column（实测 PRAGMA/information_schema 返回形态不稳定，直接 ALTER 容忍重复）
    if (!/duplicate|already exists/i.test(String(e?.message || ''))) throw e
  }
}

export async function createLwLibraryTables(ds: DataSource): Promise<void> {
  for (const ddl of TABLE_DDL) {
    await ds.query(ddl)
  }
  for (const idx of INDEX_DDL) {
    await ds.query(idx.sql)
  }

  // 血缘列：统一三列 + characters 四列附加（幂等加列）
  const isPg = ds.options.type === 'postgres'
  for (const table of LINEAGE_TABLES) {
    if (!(await checkTableExists(ds, table, isPg))) continue
    await addColumnIdempotent(ds, table, 'library_world_id', 'varchar NULL')
    await addColumnIdempotent(ds, table, 'library_entry_id', 'varchar NULL')
    await addColumnIdempotent(ds, table, 'library_version', 'integer NULL')
  }
  if (await checkTableExists(ds, 'lw_story_characters', isPg)) {
    for (const column of CHARACTER_EXTRA_COLUMNS) {
      const ddl = column === 'library_ip_id' ? 'varchar NULL' : 'text NULL'
      await addColumnIdempotent(ds, 'lw_story_characters', column, ddl)
    }
  }
}
