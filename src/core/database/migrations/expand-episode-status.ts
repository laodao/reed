/**
 * EpisodeStatus 扩展（spec §2.4）：
 * - 'reviewing' → 'composing'
 * - 'pending' 按 uploaded_characters/uploaded_locations/uploaded_items 是否非空分流：
 *   有任一非空 JSON 数组 → 'asset_prep'，否则保持 'pending'
 *
 * 兼容 SQLite + PG，幂等（多次跑只对仍是旧值的行操作）。
 *
 * @module core/database/migrations/expand-episode-status
 */

import type { DataSource } from 'typeorm'

/**
 * 执行 EpisodeStatus 扩展迁移。
 * 1. 旧 reviewing → composing
 * 2. 旧 pending 按 uploaded_characters/locations/items 是否非空分流到 asset_prep / pending
 */
export async function expandEpisodeStatus(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  // 表不存在则跳过（保证幂等安全）
  if (!(await checkTableExists(ds, 'video_episodes', isPg))) return

  // 步骤 1：reviewing → composing（幂等：只对仍是 reviewing 的行操作）
  await ds.query(`UPDATE video_episodes SET status = 'composing' WHERE status = 'reviewing'`)

  // 步骤 2：pending → asset_prep（如果已识别要素）
  // 跨端 JSON 解析差异较大，改为应用层逐行处理，保证 SQLite + PG 一致性
  const pendings: Array<{
    id: string
    uploaded_characters: string | null
    uploaded_locations: string | null
    uploaded_items: string | null
  }> = await ds.query(
    `SELECT id, uploaded_characters, uploaded_locations, uploaded_items FROM video_episodes WHERE status = 'pending'`,
  )

  for (const ep of pendings) {
    if (
      hasEntities(ep.uploaded_characters) ||
      hasEntities(ep.uploaded_locations) ||
      hasEntities(ep.uploaded_items)
    ) {
      // 使用占位符：PG 用 $1，SQLite 用 ?
      const ph = isPg ? '$1' : '?'
      await ds.query(`UPDATE video_episodes SET status = 'asset_prep' WHERE id = ${ph}`, [ep.id])
    }
  }
}

/**
 * 判断 JSON 字段是否为非空数组（即已识别出要素）。
 * - null / undefined：未识别，返回 false
 * - '[]' 或空数组：无要素，返回 false
 * - '[{...}]' 等非空数组：有要素，返回 true
 */
function hasEntities(json: unknown): boolean {
  if (!json) return false
  try {
    const arr = typeof json === 'string' ? JSON.parse(json) : json
    return Array.isArray(arr) && arr.length > 0
  } catch {
    return false
  }
}

/**
 * 检查目标表是否存在（SQLite / PG 分支）。
 */
async function checkTableExists(ds: DataSource, table: string, isPg: boolean): Promise<boolean> {
  if (isPg) {
    const r = await ds.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name=$1 AND table_schema=current_schema() LIMIT 1`,
      [table],
    )
    return r.length > 0
  }
  const r = await ds.query(
    `SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1`,
    [table],
  )
  return r.length > 0
}
