/**
 * reference_video_analyses 表（spec 2026-05-09 ep-redesign §3.2 D5 · P-22）
 *
 * 视频解析记录：用户上传参考视频 → AI 拆分镜骨架 → 一键导入到当前剧集。
 * 双库 PG/SQLite + 幂等。
 */

import type { DataSource } from 'typeorm'

export async function addReferenceVideoAnalyses(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  if (await checkTableExists(ds, 'reference_video_analyses', isPg)) {
    console.log('[add-reference-video-analyses] reference_video_analyses 已存在，跳过')
    return
  }

  if (isPg) {
    await ds.query(`
      CREATE TABLE reference_video_analyses (
        id                 VARCHAR PRIMARY KEY,
        user_id            VARCHAR,
        video_path         TEXT NOT NULL,
        video_duration_sec REAL,
        status             VARCHAR NOT NULL,
        shots              TEXT,
        metadata           TEXT,
        created_at         BIGINT NOT NULL,
        updated_at         BIGINT NOT NULL
      )
    `)
  } else {
    await ds.query(`
      CREATE TABLE reference_video_analyses (
        id                 TEXT PRIMARY KEY,
        user_id            TEXT,
        video_path         TEXT NOT NULL,
        video_duration_sec REAL,
        status             TEXT NOT NULL,
        shots              TEXT,
        metadata           TEXT,
        created_at         INTEGER NOT NULL,
        updated_at         INTEGER NOT NULL
      )
    `)
  }

  await ds.query(`CREATE INDEX idx_rva_user ON reference_video_analyses(user_id)`)
  console.log('[add-reference-video-analyses] reference_video_analyses 表 + 索引创建完成')
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
