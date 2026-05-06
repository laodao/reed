/**
 * character_bindings 增加 race（人种）字段
 *
 * 原型 §4 设定卡 ① 身份块新增"人种"枚举（east_asian / south_asian / southeast_asian /
 * central_asian / european / african / south_american），用于 AI 主图 / 派生图 prompt
 * 拼接，避免角色长相在跨变体派生时漂移到非预期人种。
 *
 * 幂等加列。兼容 SQLite + PG。
 */

import type { DataSource } from 'typeorm'

export async function addCharacterBindingRace(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  if (!(await checkTableExists(ds, 'character_bindings', isPg))) {
    console.log('[add-character-binding-race] character_bindings 不存在，跳过')
    return
  }

  if (await checkColumnExists(ds, 'character_bindings', 'race', isPg)) return

  const type = isPg ? 'text' : 'TEXT'
  await ds.query(`ALTER TABLE character_bindings ADD COLUMN race ${type}`)
  console.log('[add-character-binding-race] 加列 race')
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
