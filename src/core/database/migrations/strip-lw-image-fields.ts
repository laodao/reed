/**
 * 长文模块图字段清理（spec §3.10）：
 * - lw_story_characters.portrait_id → character_bindings.portrait_id（仅当 binding 当前为空时回填）
 * - lw_story_characters.generated_image_id → asset_image (asset_type='character', category='main')
 * - lw_story_locations.generated_image_id  → asset_image (asset_type='location', category='main')
 *
 * 数据搬运后的列删除留给后续手工 / 在 P2 Task 9 收尾时统一 DROP COLUMN（SQLite 历史不支持 DROP COLUMN，
 * 现行只把 entity 字段移除即可，等长文模块 schema 重整时再处理）。
 *
 * 兼容 SQLite + PG，幂等（asset_image 用 (asset_type,asset_id,is_main=1) 判定已搬过）。
 */

import type { DataSource } from 'typeorm'
import { randomBytes } from 'crypto'

export async function stripLwImageFields(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  // 1. portrait_id 回填到 character_binding.portrait_id（仅当 binding 当前为空）
  if (await checkColumnExists(ds, 'lw_story_characters', 'portrait_id', isPg)) {
    if (isPg) {
      await ds.query(`UPDATE character_bindings cb SET portrait_id = lw.portrait_id
        FROM lw_story_characters lw
        WHERE cb.long_writing_character_id = lw.id
          AND cb.portrait_id IS NULL
          AND lw.portrait_id IS NOT NULL`)
    } else {
      await ds.query(`UPDATE character_bindings SET portrait_id = (
        SELECT lw.portrait_id FROM lw_story_characters lw WHERE lw.id = character_bindings.long_writing_character_id
      ) WHERE portrait_id IS NULL AND EXISTS (
        SELECT 1 FROM lw_story_characters lw WHERE lw.id = character_bindings.long_writing_character_id AND lw.portrait_id IS NOT NULL
      )`)
    }
  }

  // 2. generated_image_id → asset_image（角色）
  if (await checkColumnExists(ds, 'lw_story_characters', 'generated_image_id', isPg)) {
    await migrateGeneratedImage(ds, isPg, {
      lwTable: 'lw_story_characters',
      bindingTable: 'character_bindings',
      lwIdColumn: 'long_writing_character_id',
      assetType: 'character',
    })
  }

  // 3. generated_image_id → asset_image（地点）
  if (await checkColumnExists(ds, 'lw_story_locations', 'generated_image_id', isPg)) {
    await migrateGeneratedImage(ds, isPg, {
      lwTable: 'lw_story_locations',
      bindingTable: 'location_bindings',
      lwIdColumn: 'long_writing_location_id',
      assetType: 'location',
    })
  }
}

async function migrateGeneratedImage(
  ds: DataSource,
  isPg: boolean,
  spec: { lwTable: string; bindingTable: string; lwIdColumn: string; assetType: 'character' | 'location' },
): Promise<void> {
  const rows = await ds.query(
    `SELECT lw.id AS lw_id, lw.generated_image_id AS img, b.id AS binding_id
     FROM "${spec.lwTable}" lw
     JOIN "${spec.bindingTable}" b ON b."${spec.lwIdColumn}" = lw.id
     WHERE lw.generated_image_id IS NOT NULL`,
  )

  for (const row of rows) {
    const ph = (n: number) => (isPg ? `$${n}` : '?')
    // 幂等：检查 asset_image 是否已有该 binding 的 main 图
    const existing = await ds.query(
      `SELECT 1 FROM asset_image WHERE asset_type = ${ph(1)} AND asset_id = ${ph(2)} AND is_main = 1 LIMIT 1`,
      [spec.assetType, row.binding_id],
    )
    if (existing.length > 0) continue

    const id = `ai_${randomBytes(8).toString('hex')}`
    await ds.query(
      `INSERT INTO asset_image (id, asset_type, asset_id, category, image_path, is_main, sort_order, created_at)
       VALUES (${ph(1)}, ${ph(2)}, ${ph(3)}, 'main', ${ph(4)}, 1, 0, ${isPg ? 'NOW()' : 'CURRENT_TIMESTAMP'})`,
      [id, spec.assetType, row.binding_id, row.img],
    )
  }
}

async function checkColumnExists(
  ds: DataSource,
  table: string,
  column: string,
  isPg: boolean,
): Promise<boolean> {
  if (isPg) {
    const r = await ds.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name=$2 AND table_schema=current_schema() LIMIT 1`,
      [table, column],
    )
    return r.length > 0
  }
  const r = await ds.query(`SELECT 1 FROM pragma_table_info(?) WHERE name=? LIMIT 1`, [table, column])
  return r.length > 0
}
