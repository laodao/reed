/**
 * character_bindings 加 is_preset 列（spec 2026-05-09 ep-redesign §3.2 D3 · P-8）
 *
 * 数字人池：少量精选预设角色（10-20 个）作为 character 资产的特殊子集。
 * 与用户自定义角色共存。
 *
 * - is_preset INTEGER DEFAULT 0：1=内置预设；0=用户创建（默认）
 * - source_type 复用现有列；预设角色用 'preset_digital' 值（varchar 不强约束 enum）
 * - user_id IS NULL + project_id IS NULL → 全局共享语义；service.list 用裸 typeorm repo 绕开 BaseRepository scope
 *
 * Nullable 默认 0；现有 binding 都视为 is_preset=0（用户创建）。
 */

import type { DataSource } from 'typeorm'

export async function addCharacterBindingPreset(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  if (!(await checkTableExists(ds, 'character_bindings', isPg))) {
    console.log('[add-character-binding-preset] character_bindings 不存在，跳过')
    return
  }
  if (await checkColumnExists(ds, 'character_bindings', 'is_preset', isPg)) {
    console.log('[add-character-binding-preset] is_preset 已存在，跳过')
    return
  }
  await ds.query(`ALTER TABLE character_bindings ADD COLUMN is_preset INTEGER DEFAULT 0`)
  console.log('[add-character-binding-preset] character_bindings: 加列 is_preset')
}

async function checkTableExists(
  ds: DataSource,
  table: string,
  isPg: boolean,
): Promise<boolean> {
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

async function checkColumnExists(
  ds: DataSource,
  table: string,
  column: string,
  isPg: boolean,
): Promise<boolean> {
  if (isPg) {
    const rows = await ds.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2 AND table_schema = current_schema() LIMIT 1`,
      [table, column],
    )
    return rows.length > 0
  }
  const rows = await ds.query(
    `SELECT 1 FROM pragma_table_info(?) WHERE name = ?`,
    [table, column],
  )
  return rows.length > 0
}
