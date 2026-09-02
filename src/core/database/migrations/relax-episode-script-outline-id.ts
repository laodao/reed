/**
 * episode_scripts.outline_id 改 nullable（P7-bug-1）
 *
 * 现状：DDL 把 outline_id 建为 NOT NULL，但 episode.sourceType='uploaded' 模式
 *      下用户没关联 lw_outline，应允许 outline_id 为 NULL。
 *
 * 本迁移：
 *   - PostgreSQL：ALTER COLUMN ... DROP NOT NULL（含 IF EXISTS 容错）
 *   - SQLite：不支持 ALTER COLUMN，走真正的表重建（sqlite-relax-notnull，
 *     建新表 → 拷数据 → DROP 旧表 → 改名 → 重建索引，幂等），再把空字符串占位回填为 NULL。
 *
 * 幂等：检查列存在 + 当前是否已 nullable，已 nullable 时跳过。
 */

import type { DataSource } from 'typeorm'

export async function relaxEpisodeScriptOutlineId(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  if (isPg) {
    // 检查表 + 列存在
    const colExists = await ds.query(
      `SELECT is_nullable FROM information_schema.columns
       WHERE table_name = 'episode_scripts' AND column_name = 'outline_id'
         AND table_schema = current_schema() LIMIT 1`,
    )
    if (colExists.length === 0) {
      console.log('[relax-episode-script-outline-id] episode_scripts 表/列不存在，跳过')
      return
    }
    if (colExists[0].is_nullable === 'YES') {
      // 已 nullable，仅跑一次回填
      await ds.query(
        `UPDATE "episode_scripts" SET outline_id = NULL WHERE outline_id = ''`,
      )
      return
    }
    await ds.query(`ALTER TABLE "episode_scripts" ALTER COLUMN outline_id DROP NOT NULL`)
    await ds.query(`UPDATE "episode_scripts" SET outline_id = NULL WHERE outline_id = ''`)
    console.log('[relax-episode-script-outline-id] outline_id 改为 nullable + 回填空字符串为 NULL')
    return
  }

  // SQLite：production 库 synchronize 不改写既有 NOT NULL 约束，需真正重建表
  // （sqlite-relax-notnull：建新表 → 拷数据 → DROP 旧表 → 改名 → 重建索引，幂等），
  // 之后再把空字符串占位回填为 NULL
  try {
    const tables = await ds.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='episode_scripts' LIMIT 1`,
    )
    if (tables.length === 0) {
      console.log('[relax-episode-script-outline-id] sqlite episode_scripts 表不存在，跳过')
      return
    }
    const { relaxSqliteNotNull } = await import('./sqlite-relax-notnull')
    const result = await relaxSqliteNotNull(ds, 'episode_scripts', 'outline_id')
    if (result === 'rebuilt') {
      console.log('[relax-episode-script-outline-id] sqlite episode_scripts 表重建完成，outline_id 已放开 NOT NULL')
    }
    await ds.query(`UPDATE episode_scripts SET outline_id = NULL WHERE outline_id = ''`)
  } catch (e) {
    console.warn('[relax-episode-script-outline-id] sqlite 处理失败：', (e as Error).message)
  }
}
