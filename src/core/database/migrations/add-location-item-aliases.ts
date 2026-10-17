/**
 * lw_story_locations / lw_story_items 加 aliases 列（W5.1，2026-10-17）
 *
 * 人物早有 aliases（JSON 数组文本），地点/物品缺失——触发式注入与规则名册匹配
 * （R3 物品易主 / R11 黑户道具）只认本名，别名称呼不可见。补齐同款列。
 * Nullable JSON 文本，与 lw_characters.aliases 同约定。幂等。
 */

import type { DataSource } from 'typeorm'

export async function addLocationItemAliases(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  const tableExists = async (table: string): Promise<boolean> => {
    if (isPg) {
      const rows = await ds.query(
        `SELECT 1 FROM information_schema.tables WHERE table_name = $1 AND table_schema = current_schema() LIMIT 1`,
        [table],
      )
      return rows.length > 0
    }
    const rows = await ds.query(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`, [table])
    return rows.length > 0
  }

  const columnExists = async (table: string, column: string): Promise<boolean> => {
    if (isPg) {
      const rows = await ds.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2 AND table_schema = current_schema() LIMIT 1`,
        [table, column],
      )
      return rows.length > 0
    }
    const rows = await ds.query(`SELECT 1 FROM pragma_table_info(?) WHERE name = ? LIMIT 1`, [table, column])
    return rows.length > 0
  }

  for (const table of ['lw_story_locations', 'lw_story_items']) {
    if (!(await tableExists(table))) {
      console.log(`[add-location-item-aliases] ${table} 不存在，跳过`)
      continue
    }
    if (await columnExists(table, 'aliases')) continue
    await ds.query(`ALTER TABLE ${table} ADD COLUMN aliases TEXT`)
    console.log(`[add-location-item-aliases] ${table}: 加列 aliases`)
  }
}
