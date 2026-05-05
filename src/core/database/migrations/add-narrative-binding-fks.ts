/**
 * 叙事域强约束 · 给 scene_script / scene_character / scene_dialogue / scene_action 加 binding FK 列
 * （spec §4.1 + §4.8）
 *
 * 现状：scene_script 有裸 `location` 字符串、scene_character/dialogue/action 有 `character_id`
 *      字符串（lw_character.id），无法严格对齐资产域 binding。
 *
 * 本迁移加：
 *   - scene_scripts.location_binding_id   varchar nullable
 *   - scene_characters.character_binding_id  varchar nullable
 *   - scene_dialogues.character_binding_id   varchar nullable
 *   - scene_dialogues.voice_id               text nullable    （spec §4.1：每个 Dialogue 含 voice_id）
 *   - scene_actions.character_binding_id    varchar nullable
 *
 * 兼容 SQLite + PostgreSQL；幂等（重复执行不报错）；表 / 列不存在时静默跳过。
 *
 * 不删除老 character_id / location 字段——保留兼容 V2 老路径。Validator (P4-T3)
 * 强制要求 binding_id 非空才算"通过"，渐进迁移。
 */

import type { DataSource } from 'typeorm'

interface ColumnSpec {
  table: string
  column: string
  /** PG 列类型 */
  pgType: string
  /** SQLite 列类型 */
  sqliteType: string
}

const COLUMNS: ColumnSpec[] = [
  // scene_scripts.location_binding_id — 场景对地点 binding 的强引用
  { table: 'scene_scripts', column: 'location_binding_id', pgType: 'varchar', sqliteType: 'TEXT' },
  // scene_characters.character_binding_id — 出场名单成员
  { table: 'scene_characters', column: 'character_binding_id', pgType: 'varchar', sqliteType: 'TEXT' },
  // scene_dialogues — voice_id 已在 V2 老 schema，本次只加 character_binding_id
  { table: 'scene_dialogues', column: 'character_binding_id', pgType: 'varchar', sqliteType: 'TEXT' },
  // scene_actions
  { table: 'scene_actions', column: 'character_binding_id', pgType: 'varchar', sqliteType: 'TEXT' },
]

export async function addNarrativeBindingFks(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  for (const spec of COLUMNS) {
    if (!(await checkTableExists(ds, spec.table, isPg))) {
      console.log(`[add-narrative-binding-fks] ${spec.table} 表不存在，跳过`)
      continue
    }
    if (await checkColumnExists(ds, spec.table, spec.column, isPg)) {
      continue
    }
    const colType = isPg ? spec.pgType : spec.sqliteType
    await ds.query(
      `ALTER TABLE "${spec.table}" ADD COLUMN ${spec.column} ${colType}`,
    )
    console.log(
      `[add-narrative-binding-fks] ${spec.table}: 加列 ${spec.column} (${colType})`,
    )
  }

  // 索引：character_binding_id / location_binding_id 高频查询
  const indexes: Array<{ table: string; column: string; name: string }> = [
    {
      table: 'scene_scripts',
      column: 'location_binding_id',
      name: 'idx_scene_scripts_loc_binding',
    },
    {
      table: 'scene_characters',
      column: 'character_binding_id',
      name: 'idx_scene_characters_char_binding',
    },
    {
      table: 'scene_dialogues',
      column: 'character_binding_id',
      name: 'idx_scene_dialogues_char_binding',
    },
    {
      table: 'scene_actions',
      column: 'character_binding_id',
      name: 'idx_scene_actions_char_binding',
    },
  ]
  for (const idx of indexes) {
    if (!(await checkTableExists(ds, idx.table, isPg))) continue
    if (!(await checkColumnExists(ds, idx.table, idx.column, isPg))) continue
    try {
      await ds.query(
        `CREATE INDEX IF NOT EXISTS ${idx.name} ON "${idx.table}" (${idx.column})`,
      )
    } catch (e) {
      console.warn(
        `[add-narrative-binding-fks] 创建索引 ${idx.name} 失败：${(e as Error).message}（可忽略）`,
      )
    }
  }
}

// ─── 工具函数 ────────────────────────────────────────────────────────────────

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
