/**
 * video_episodes.outline_id 改 nullable（episode-production 存量 bug 修复）
 *
 * 现状：entity（video-episode.entity.ts）已是 nullable: true，但早期 DDL 把
 *      outline_id 建为 NOT NULL；episode.sourceType='uploaded'（用户直接粘长文建集）
 *      没有关联 lw_outline，SQLite 生产库上必然 NOT NULL constraint failed。
 *
 * 本迁移：
 *   - PostgreSQL：ALTER COLUMN ... DROP NOT NULL（幂等，已 nullable 时只回填）
 *   - SQLite：真正的表重建（sqlite-relax-notnull：建新表 → 拷数据 → DROP 旧表
 *     → 改名 → 重建索引，幂等），再把空字符串占位回填为 NULL
 *
 * 幂等：检查列存在 + 当前是否已 nullable，已 nullable 时跳过 DDL。
 */

import type { DataSource } from 'typeorm'

export async function relaxVideoEpisodeOutlineId(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  if (isPg) {
    const colExists = await ds.query(
      `SELECT is_nullable FROM information_schema.columns
       WHERE table_name = 'video_episodes' AND column_name = 'outline_id'
         AND table_schema = current_schema() LIMIT 1`,
    )
    if (colExists.length === 0) {
      console.log('[relax-video-episode-outline-id] video_episodes 表/列不存在，跳过')
      return
    }
    if (colExists[0].is_nullable !== 'YES') {
      await ds.query(`ALTER TABLE "video_episodes" ALTER COLUMN outline_id DROP NOT NULL`)
    }
    await ds.query(`UPDATE "video_episodes" SET outline_id = NULL WHERE outline_id = ''`)
    console.log('[relax-video-episode-outline-id] outline_id 改为 nullable + 回填空字符串为 NULL')
    return
  }

  // SQLite：production 库 synchronize 不改写既有 NOT NULL 约束，需真正重建表
  try {
    const tables = await ds.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='video_episodes' LIMIT 1`,
    )
    if (tables.length === 0) {
      console.log('[relax-video-episode-outline-id] sqlite video_episodes 表不存在，跳过')
      return
    }
    const { relaxSqliteNotNull } = await import('./sqlite-relax-notnull')
    const result = await relaxSqliteNotNull(ds, 'video_episodes', 'outline_id')
    if (result === 'rebuilt') {
      console.log('[relax-video-episode-outline-id] sqlite video_episodes 表重建完成，outline_id 已放开 NOT NULL')
    }
    await ds.query(`UPDATE video_episodes SET outline_id = NULL WHERE outline_id = ''`)
  } catch (e) {
    console.warn('[relax-video-episode-outline-id] sqlite 处理失败：', (e as Error).message)
  }
}
