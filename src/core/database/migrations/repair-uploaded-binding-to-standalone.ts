/**
 * 一次性修复脏数据：上传模式 binding（character/location/item）从 linked_lw 转 standalone
 * @module database/migrations/repair-uploaded-binding-to-standalone
 *
 * 历史架构（spec 2026-05-08 之前）：UploadedEntityService 把 AI 识别出的角色 / 地点 / 物品
 * 先 INSERT 到 lw_story_characters / lw_locations / lw_items（source_type='uploaded'）
 * 当作"伪长文实体"，再创建 binding 指向它，导致 binding.sourceType='linked_lw' 但项目其实
 * 没绑定真长文。UI 显示"来自长文"会误导用户。
 *
 * 修复策略：
 *   - 找出所有 binding sourceType='linked_lw' 且对应 lw 实体的 source_type='uploaded'
 *   - 把 lw 的 name / description / appearance 拷贝到 binding 的 standalone_* 字段
 *   - binding.sourceType 改 'standalone'
 *   - binding.longWritingCharacterId/LocationId/ItemId 清空（NULL）
 *   - 不删除伪 lw 行（user mandate "禁止随意删除数据"；保留供历史追溯，不影响业务）
 *
 * 兼容 SQLite + PG。幂等（已转 standalone 的 binding 不会再处理）。
 */

import type { DataSource } from 'typeorm'

interface RepairStat {
  characters: number
  locations: number
  items: number
}

export async function repairUploadedBindingToStandalone(
  ds: DataSource,
): Promise<RepairStat> {
  const stat: RepairStat = { characters: 0, locations: 0, items: 0 }

  if (!(await tableExists(ds, 'character_bindings'))) {
    return stat
  }

  // ─── character ───
  if (await tableExists(ds, 'lw_story_characters')) {
    const rows = await ds.query(`
      SELECT cb.id AS bid, lw.name AS lw_name, lw.appearance AS lw_appearance
      FROM character_bindings cb
      INNER JOIN lw_story_characters lw ON lw.id = cb.long_writing_character_id
      WHERE cb.source_type = 'linked_lw'
        AND lw.source_type = 'uploaded'
    `)
    for (const r of rows) {
      await ds.query(
        `UPDATE character_bindings
         SET source_type = 'standalone',
             long_writing_character_id = NULL,
             standalone_name = COALESCE(NULLIF(standalone_name, ''), $1),
             standalone_description = COALESCE(NULLIF(standalone_description, ''), $2),
             updated_at = $3
         WHERE id = $4`,
        [r.lw_name ?? null, r.lw_appearance ?? null, new Date(), r.bid],
      )
      stat.characters++
    }
  }

  // ─── location ───
  if (
    (await tableExists(ds, 'location_bindings')) &&
    (await tableExists(ds, 'lw_locations'))
  ) {
    const rows = await ds.query(`
      SELECT lb.id AS bid, lw.name AS lw_name, lw.description AS lw_description
      FROM location_bindings lb
      INNER JOIN lw_locations lw ON lw.id = lb.long_writing_location_id
      WHERE lb.source_type = 'linked_lw'
        AND lw.source_type = 'uploaded'
    `)
    for (const r of rows) {
      await ds.query(
        `UPDATE location_bindings
         SET source_type = 'standalone',
             long_writing_location_id = NULL,
             standalone_name = COALESCE(NULLIF(standalone_name, ''), $1),
             standalone_description = COALESCE(NULLIF(standalone_description, ''), $2),
             updated_at = $3
         WHERE id = $4`,
        [r.lw_name ?? null, r.lw_description ?? null, new Date(), r.bid],
      )
      stat.locations++
    }
  }

  // ─── item ───
  if (
    (await tableExists(ds, 'item_bindings')) &&
    (await tableExists(ds, 'lw_items'))
  ) {
    const rows = await ds.query(`
      SELECT ib.id AS bid, lw.name AS lw_name, lw.description AS lw_description
      FROM item_bindings ib
      INNER JOIN lw_items lw ON lw.id = ib.long_writing_item_id
      WHERE ib.source_type = 'linked_lw'
        AND lw.source_type = 'uploaded'
    `)
    for (const r of rows) {
      await ds.query(
        `UPDATE item_bindings
         SET source_type = 'standalone',
             long_writing_item_id = NULL,
             standalone_name = COALESCE(NULLIF(standalone_name, ''), $1),
             standalone_description = COALESCE(NULLIF(standalone_description, ''), $2),
             updated_at = $3
         WHERE id = $4`,
        [r.lw_name ?? null, r.lw_description ?? null, new Date(), r.bid],
      )
      stat.items++
    }
  }

  if (stat.characters + stat.locations + stat.items > 0) {
    console.log(
      `[repair-uploaded-binding-to-standalone] 修复完成 — character ${stat.characters}, location ${stat.locations}, item ${stat.items}`,
    )
  }
  return stat
}

async function tableExists(ds: DataSource, table: string): Promise<boolean> {
  const isPg = ds.options.type === 'postgres'
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
