/**
 * character_bindings 加身份块 + 声音参数 + 风格锚点字段（FU5-C2 / spec §3.1·§3.4·§3.6）
 *
 * 原型 §4 设定卡需要的完整字段：身份块（别名 / 定位 / 性别 / 年龄）+
 * 声音情感 + 风格锚点（数组）+ 备选服装（数组）。
 * 当前 entity 缺这些；本 migration 幂等加列。
 *
 * 兼容 SQLite + PG。
 */

import type { DataSource } from 'typeorm'

const COLS_TEXT = [
  'alias', // 别名（"三爷 / 浪剑客"）
  'role', // 定位（主角 / 配角 / 反派）
  'gender', // 性别
  'voice_emotion', // 默认情感（neutral/angry/...）
  'style_anchors', // 风格锚点（JSON 数组字符串：["工笔国风","水墨","微写实"]）
  'outfits_extra', // 备选服装（JSON 数组字符串）
]

const COL_AGE = 'age' // INTEGER nullable

export async function addCharacterBindingExtraFields(
  ds: DataSource,
): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  if (!(await checkTableExists(ds, 'character_bindings', isPg))) {
    console.log('[add-character-binding-extra] character_bindings 不存在，跳过')
    return
  }

  for (const col of COLS_TEXT) {
    if (await checkColumnExists(ds, 'character_bindings', col, isPg)) continue
    const type = isPg ? 'text' : 'TEXT'
    await ds.query(`ALTER TABLE character_bindings ADD COLUMN ${col} ${type}`)
    console.log(`[add-character-binding-extra] 加列 ${col}`)
  }

  if (!(await checkColumnExists(ds, 'character_bindings', COL_AGE, isPg))) {
    const type = isPg ? 'integer' : 'INTEGER'
    await ds.query(`ALTER TABLE character_bindings ADD COLUMN ${COL_AGE} ${type}`)
    console.log(`[add-character-binding-extra] 加列 ${COL_AGE}`)
  }
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
    `SELECT 1 FROM pragma_table_info(?) WHERE name = ? LIMIT 1`,
    [table, column],
  )
  return rows.length > 0
}
