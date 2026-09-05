/**
 * 视频片段制（tasks/2026-09-04-ep-video-segment-redesign §4/§7）：
 *   1. 建 ep_video_segments 表（片段 = 制作/生成最小单元）
 *   2. storyboards 加 segment_id / segment_seq 两列（回填片段归属）
 *   3. 存量迁移：有 video_path 的 storyboard 各迁成单镜 segment（幂等）；
 *      无 video_path 的不动（等用户点"重新分段"）
 *
 * 兼容 SQLite + PG，幂等。登记点：Electron runMultiTenantMigrations + Web initDatabase。
 */

import type { DataSource } from 'typeorm'
import { randomBytes } from 'crypto'

export async function createEpVideoSegments(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  await ensureEpVideoSegmentsTable(ds, isPg)
  await ensureStoryboardSegmentColumns(ds, isPg)
  await migrateLegacyStoryboardVideos(ds, isPg)
}

// ─── 1. 建表 ──────────────────────────────────────────────────────────────

async function ensureEpVideoSegmentsTable(ds: DataSource, isPg: boolean): Promise<void> {
  const exists = await checkTableExists(ds, 'ep_video_segments', isPg)
  if (exists) return

  if (isPg) {
    await ds.query(`
      CREATE TABLE ep_video_segments (
        id            varchar       PRIMARY KEY,
        episode_id    varchar       NOT NULL,
        scene_id      varchar       NOT NULL,
        seq           integer       NOT NULL,
        status        varchar       NOT NULL DEFAULT 'pending',
        shot_count    integer       NOT NULL,
        est_duration  double precision,
        prompt        text,
        video_path    text,
        video_mode    varchar,
        duration      double precision,
        provider_id   varchar,
        model_id      varchar,
        error         text,
        created_at    timestamp     NOT NULL DEFAULT NOW(),
        updated_at    timestamp     NOT NULL DEFAULT NOW(),
        user_id       varchar,
        deleted_at    timestamp     DEFAULT NULL
      )
    `)
  } else {
    await ds.query(`
      CREATE TABLE ep_video_segments (
        id            TEXT      PRIMARY KEY,
        episode_id    TEXT      NOT NULL,
        scene_id      TEXT      NOT NULL,
        seq           INTEGER   NOT NULL,
        status        TEXT      NOT NULL DEFAULT 'pending',
        shot_count    INTEGER   NOT NULL,
        est_duration  REAL,
        prompt        TEXT,
        video_path    TEXT,
        video_mode    TEXT,
        duration      REAL,
        provider_id   TEXT,
        model_id      TEXT,
        error         TEXT,
        created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        user_id       TEXT,
        deleted_at    TIMESTAMP DEFAULT NULL
      )
    `)
  }

  await ds.query(`CREATE INDEX idx_evs_episode ON ep_video_segments (episode_id, seq)`)
  await ds.query(`CREATE INDEX idx_evs_scene ON ep_video_segments (scene_id)`)
  await ds.query(`CREATE INDEX idx_evs_user_id ON ep_video_segments (user_id)`)
  console.log('[create-ep-video-segments] ep_video_segments 表及索引已建立')
}

// ─── 2. storyboards 加列 ───────────────────────────────────────────────────

async function ensureStoryboardSegmentColumns(ds: DataSource, isPg: boolean): Promise<void> {
  if (!(await checkTableExists(ds, 'storyboards', isPg))) {
    console.log('[create-ep-video-segments] storyboards 表不存在，跳过加列')
    return
  }

  const columns = [
    { name: 'segment_id', sqliteType: 'TEXT', pgType: 'varchar' },
    { name: 'segment_seq', sqliteType: 'INTEGER', pgType: 'integer' },
  ] as const

  for (const col of columns) {
    if (await checkColumnExists(ds, 'storyboards', col.name, isPg)) continue
    await ds.query(
      `ALTER TABLE storyboards ADD COLUMN ${col.name} ${isPg ? col.pgType : col.sqliteType}`,
    )
    console.log(`[create-ep-video-segments] storyboards 加列：${col.name}`)
  }

  // 回填查询索引（幂等）
  if (!(await checkIndexExists(ds, 'idx_storyboards_segment_id', isPg))) {
    await ds.query(`CREATE INDEX idx_storyboards_segment_id ON storyboards (segment_id)`)
  }
}

// ─── 3. 存量迁移：有 video_path 的 storyboard → 单镜 segment ─────────────────

/**
 * 幂等：segment_id 已回填的 storyboard 跳过；重跑不会产生重复 segment。
 * 单镜生成（ep:generate-video-segment）仍写 storyboard.video_path，
 * 下次启动时这些行也会被本迁移自动包成单镜 segment（过渡期行为，符合 §7）。
 */
async function migrateLegacyStoryboardVideos(ds: DataSource, isPg: boolean): Promise<void> {
  for (const t of ['storyboards', 'scene_scripts', 'episode_scripts']) {
    if (!(await checkTableExists(ds, t, isPg))) return
  }

  const rows: Array<{
    id: string
    scene_script_id: string
    video_path: string
    video_mode: string | null
    duration: number | null
    video_provider_id: string | null
    video_model_id: string | null
    user_id: string | null
    episode_id: string
  }> = await ds.query(`
    SELECT sb.id, sb.scene_script_id, sb.video_path, sb.video_mode, sb.duration,
           sb.video_provider_id, sb.video_model_id, sb.user_id,
           es.episode_id
    FROM storyboards sb
    JOIN scene_scripts ss ON ss.id = sb.scene_script_id
    JOIN episode_scripts es ON es.id = ss.episode_script_id
    WHERE sb.video_path IS NOT NULL AND sb.video_path != '' AND sb.segment_id IS NULL
    ORDER BY es.episode_id, ss.scene_number, sb.shot_number
  `)
  if (rows.length === 0) return

  // 每个 episode 的 seq 计数器：从该 episode 现有 max(seq) 续排（幂等关键）
  const seqCounters = new Map<string, number>()
  const maxSeqRows: Array<{ episode_id: string; max_seq: number | string | null }> =
    await ds.query(`SELECT episode_id, MAX(seq) AS max_seq FROM ep_video_segments GROUP BY episode_id`)
  for (const r of maxSeqRows) {
    seqCounters.set(r.episode_id, Number(r.max_seq ?? 0))
  }

  const ph = (n: number) => (isPg ? `$${n}` : '?')
  const nowExpr = isPg ? 'NOW()' : 'CURRENT_TIMESTAMP'
  let migrated = 0

  for (const row of rows) {
    const segId = `evs_mig_${randomBytes(8).toString('hex')}`
    const seq = (seqCounters.get(row.episode_id) ?? 0) + 1
    seqCounters.set(row.episode_id, seq)

    await ds.query(
      `INSERT INTO ep_video_segments
         (id, episode_id, scene_id, seq, status, shot_count, est_duration, prompt,
          video_path, video_mode, duration, provider_id, model_id, error,
          created_at, updated_at, user_id, deleted_at)
       VALUES
         (${ph(1)}, ${ph(2)}, ${ph(3)}, ${ph(4)}, 'completed', 1, ${ph(5)}, NULL,
          ${ph(6)}, ${ph(7)}, ${ph(8)}, ${ph(9)}, ${ph(10)}, NULL,
          ${nowExpr}, ${nowExpr}, ${ph(11)}, NULL)`,
      [
        segId,
        row.episode_id,
        row.scene_script_id,
        seq,
        row.duration,
        row.video_path,
        row.video_mode,
        row.duration,
        row.video_provider_id,
        row.video_model_id,
        row.user_id,
      ],
    )
    await ds.query(
      `UPDATE storyboards SET segment_id = ${ph(1)}, segment_seq = 1 WHERE id = ${ph(2)}`,
      [segId, row.id],
    )
    migrated++
  }

  console.log(`[create-ep-video-segments] 存量迁移：${migrated} 个有视频的 storyboard → 单镜 segment`)
}

// ─── 工具 ─────────────────────────────────────────────────────────────────

async function checkTableExists(ds: DataSource, table: string, isPg: boolean): Promise<boolean> {
  if (isPg) {
    const rows = await ds.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_name = $1 AND table_schema = current_schema() LIMIT 1`,
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
      `SELECT 1 FROM information_schema.columns
       WHERE table_name = $1 AND column_name = $2 AND table_schema = current_schema() LIMIT 1`,
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

async function checkIndexExists(ds: DataSource, index: string, isPg: boolean): Promise<boolean> {
  if (isPg) {
    const rows = await ds.query(
      `SELECT 1 FROM pg_indexes WHERE indexname = $1 AND schemaname = current_schema() LIMIT 1`,
      [index],
    )
    return rows.length > 0
  }
  const rows = await ds.query(
    `SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = ? LIMIT 1`,
    [index],
  )
  return rows.length > 0
}
