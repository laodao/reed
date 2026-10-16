/**
 * 资产 binding 增加 reference_set_image_ids 字段（spec 2026-05-09 ep-redesign §3.2 D1 · P-9）
 *
 * 角色形象组（Character Reference Set）：用户标记 character_binding 已有的多张图作为
 * 生图固定参考集；推理时全部喂给 provider 的 multi-reference 入参。
 *
 * 取代了原"LoRA 训练"路径（4 家国内云 API 都不开放训练 API；唯一可行路径是
 * multi-reference image，调研详见 docs/review/2026-05-09-ep-redesign-spec.md §3.2 D1）。
 *
 * 三张表同时加列：character_bindings / location_bindings / item_bindings。
 * Nullable，默认 NULL（service.getEffectiveReferenceImages 解析时 fallback 到
 * "main + 所有 view"作为默认形象组）。
 *
 * 字段值：JSON 数组字符串 `["ai_xxx", "ai_yyy", ...]`（asset_image.id 列表）
 */

import type { DataSource } from 'typeorm'

export async function addCharacterBindingReferenceSet(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  for (const table of ['character_bindings', 'location_bindings', 'item_bindings']) {
    if (!(await checkTableExists(ds, table, isPg))) {
      console.log(`[add-character-binding-reference-set] ${table} 不存在，跳过`)
      continue
    }
    if (await checkColumnExists(ds, table, 'reference_set_image_ids', isPg)) continue
    await ds.query(`ALTER TABLE ${table} ADD COLUMN reference_set_image_ids TEXT`)
    console.log(`[add-character-binding-reference-set] ${table}: 加列 reference_set_image_ids`)
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
    `SELECT 1 FROM pragma_table_info(?) WHERE name = ?`,
    [table, column],
  )
  return rows.length > 0
}
