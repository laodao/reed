/**
 * 新建 storyboard_keyframe 表 + 给 storyboard 加多模式字段（spec §4.2 / §4.7）。
 *
 * 数据搬运：每个 storyboard 的 frame_image_id 写为 frame_index=0 / frame_role='start' 的 keyframe 行。
 *
 * 兼容 SQLite + PG，幂等。
 */

import type { DataSource } from 'typeorm'
import { randomBytes } from 'crypto'

/** 需要追加到 storyboards 表的新列定义 */
const STORYBOARD_NEW_COLUMNS = [
  { name: 'keyframe_count', type: 'INTEGER', defaultExpr: '2' },
  { name: 'video_provider_id', type: 'TEXT' },
  { name: 'video_model_id', type: 'TEXT' },
  { name: 'video_mode', type: 'TEXT' },
  { name: 'use_3d_staging', type: 'INTEGER', defaultExpr: '0' },
  { name: 'staging_layout_id', type: 'TEXT' },
] as const

/**
 * 建 storyboard_keyframe 表 + 给 storyboards 加多模式字段 + 搬运 frame_image_id 数据。
 *
 * @param ds TypeORM DataSource（SQLite 或 PostgreSQL）
 */
export async function createStoryboardKeyframe(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  // 1. 建 storyboard_keyframe 表（幂等）
  await ensureStoryboardKeyframeTable(ds, isPg)

  // 2. 给 storyboards 表追加多模式字段（幂等）
  await ensureStoryboardNewColumns(ds, isPg)

  // 3. 搬运 frame_image_id → keyframe[0]
  await migrateFrameImageToKeyframe(ds, isPg)
}

// ─── 内部工具函数 ──────────────────────────────────────────────────────────────

/**
 * 建立 storyboard_keyframe 表及索引，若已存在则跳过（幂等）。
 */
async function ensureStoryboardKeyframeTable(ds: DataSource, isPg: boolean): Promise<void> {
  const exists = await checkTableExists(ds, 'storyboard_keyframe', isPg)
  if (exists) return

  if (isPg) {
    await ds.query(`
      CREATE TABLE storyboard_keyframe (
        id                        varchar       PRIMARY KEY,
        user_id                   varchar,
        storyboard_id             varchar       NOT NULL,
        frame_index               integer       NOT NULL,
        time_percent              double precision NOT NULL DEFAULT 0,
        frame_role                varchar       NOT NULL,
        image_asset_id            varchar,
        derived_from_keyframe_id  varchar,
        prompt                    text,
        negative_prompt           text,
        created_at                timestamp     NOT NULL DEFAULT NOW(),
        updated_at                timestamp
      )
    `)
  } else {
    await ds.query(`
      CREATE TABLE storyboard_keyframe (
        id                        TEXT      PRIMARY KEY,
        user_id                   TEXT,
        storyboard_id             TEXT      NOT NULL,
        frame_index               INTEGER   NOT NULL,
        time_percent              REAL      NOT NULL DEFAULT 0,
        frame_role                TEXT      NOT NULL,
        image_asset_id            TEXT,
        derived_from_keyframe_id  TEXT,
        prompt                    TEXT,
        negative_prompt           TEXT,
        created_at                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at                TIMESTAMP
      )
    `)
  }

  await ds.query(`CREATE INDEX idx_keyframe_storyboard ON storyboard_keyframe (storyboard_id)`)
  await ds.query(`CREATE INDEX idx_keyframe_user_id ON storyboard_keyframe (user_id)`)

  console.log('[create-storyboard-keyframe] storyboard_keyframe 表及索引已建立')
}

/**
 * 给 storyboards 表追加多模式字段，每列均幂等（列不存在才加）。
 */
async function ensureStoryboardNewColumns(ds: DataSource, isPg: boolean): Promise<void> {
  const storyboardsExists = await checkTableExists(ds, 'storyboards', isPg)
  if (!storyboardsExists) {
    console.log('[create-storyboard-keyframe] storyboards 表不存在，跳过加列')
    return
  }

  for (const col of STORYBOARD_NEW_COLUMNS) {
    const alreadyExists = await checkColumnExists(ds, 'storyboards', col.name, isPg)
    if (alreadyExists) continue

    const colType = isPg ? mapTypeToPg(col.type) : col.type
    const defaultClause = 'defaultExpr' in col && col.defaultExpr ? ` DEFAULT ${col.defaultExpr}` : ''
    await ds.query(`ALTER TABLE storyboards ADD COLUMN ${col.name} ${colType}${defaultClause}`)
    console.log(`[create-storyboard-keyframe] storyboards 加列：${col.name}`)
  }
}

/**
 * 把 storyboard.frame_image_id（非 NULL）搬为 frame_index=0 / frame_role='start' 的 keyframe 行。
 * 幂等：每个 storyboard_id 已有 keyframe 行时跳过。
 */
async function migrateFrameImageToKeyframe(ds: DataSource, isPg: boolean): Promise<void> {
  const storyboardsExists = await checkTableExists(ds, 'storyboards', isPg)
  if (!storyboardsExists) return

  const hasFrameImageId = await checkColumnExists(ds, 'storyboards', 'frame_image_id', isPg)
  if (!hasFrameImageId) {
    console.log('[create-storyboard-keyframe] storyboards.frame_image_id 列不存在，跳过数据搬运')
    return
  }

  const rows = await ds.query(
    `SELECT id, frame_image_id FROM storyboards WHERE frame_image_id IS NOT NULL`,
  )

  let migrated = 0
  for (const sb of rows) {
    const ph = (n: number) => (isPg ? `$${n}` : '?')

    // 幂等：检查该 storyboard_id 是否已有 keyframe 记录
    const existing = await ds.query(
      `SELECT count(*) as c FROM storyboard_keyframe WHERE storyboard_id = ${ph(1)}`,
      [sb.id],
    )
    const count = isPg ? Number(existing[0].c) : existing[0].c
    if (count > 0) continue

    const id = `kf_${randomBytes(8).toString('hex')}`
    await ds.query(
      `INSERT INTO storyboard_keyframe
         (id, storyboard_id, frame_index, time_percent, frame_role, image_asset_id, created_at)
       VALUES
         (${ph(1)}, ${ph(2)}, 0, 0, 'start', ${ph(3)}, ${isPg ? 'NOW()' : 'CURRENT_TIMESTAMP'})`,
      [id, sb.id, sb.frame_image_id],
    )
    migrated++
  }

  if (migrated > 0) {
    console.log(`[create-storyboard-keyframe] 共搬运 ${migrated} 个 storyboard 的 frame_image_id → keyframe[0]`)
  }
}

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

function mapTypeToPg(t: string): string {
  switch (t.toUpperCase()) {
    case 'TEXT': return 'text'
    case 'INTEGER': return 'integer'
    case 'REAL': return 'double precision'
    default: return t.toLowerCase()
  }
}
