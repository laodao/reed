/**
 * 导出版本留档（tasks/2026-09-16-ep-studio-polish S-07）：
 * 建 ep_export_history 表——每次整剧 MP4 导出成功写一行，
 * 合成页「导出记录」读最近 5 条（时间/路径/时长 + 打开文件夹）。
 *
 * 兼容 SQLite + PG，幂等。登记点：Electron runMultiTenantMigrations + Web initDatabase。
 */

import type { DataSource } from 'typeorm'
import { ensureTable, ensureIndex } from './migration-utils'

export async function createEpExportHistory(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  const ddl = isPg
    ? `
      CREATE TABLE ep_export_history (
        id           varchar   PRIMARY KEY,
        episode_id   varchar   NOT NULL,
        output_path  text      NOT NULL,
        duration_sec double precision,
        created_at   timestamp NOT NULL DEFAULT NOW(),
        user_id      varchar
      )
    `
    : `
      CREATE TABLE ep_export_history (
        id           TEXT      PRIMARY KEY,
        episode_id   TEXT      NOT NULL,
        output_path  TEXT      NOT NULL,
        duration_sec REAL,
        created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        user_id      TEXT
      )
    `

  await ensureTable(ds, isPg, 'ep_export_history', ddl, async () => {
    await ensureIndex(ds, isPg, 'idx_eeh_episode', 'ep_export_history', '(episode_id, created_at)')
    await ensureIndex(ds, isPg, 'idx_eeh_user_id', 'ep_export_history', '(user_id)')
  }, 'create-ep-export-history')
}
