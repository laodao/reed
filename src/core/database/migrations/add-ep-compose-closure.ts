/**
 * 剧集制作状态闭环两列（2026-09-16 review P0-CM2 / P0-CM1）
 *
 * - video_episodes.composed_video_path：⑥ 合成完成标记（用户成功导出 MP4 的路径，
 *   user-rel 相对路径优先）。stage-gate ⑥ 合成完成判定此前读不存在的列恒 undefined，
 *   导致进度恒 35%、completed 终态不可达。
 * - scene_scripts.narration_audio_path：场景旁白 TTS 产物路径（V3 编排落库），
 *   导出时与对白音频一并混入成片音轨。对白音频沿用 dialogues JSON 内 audioAsset，不加列。
 *
 * 兼容 SQLite + PG。幂等。
 */

import type { DataSource } from 'typeorm'

interface ColSpec {
  table: string
  column: string
}

const COLS: ColSpec[] = [
  { table: 'video_episodes', column: 'composed_video_path' },
  { table: 'scene_scripts', column: 'narration_audio_path' },
]

export async function addEpComposeClosure(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  for (const { table, column } of COLS) {
    if (!(await checkTableExists(ds, table, isPg))) {
      console.log(`[add-ep-compose-closure] ${table} 不存在，跳过 ${column}`)
      continue
    }
    if (await checkColumnExists(ds, table, column, isPg)) continue
    const type = isPg ? 'text' : 'TEXT'
    await ds.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`)
    console.log(`[add-ep-compose-closure] ${table} 加列 ${column}`)
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
    `SELECT 1 FROM pragma_table_info(?) WHERE name = ? LIMIT 1`,
    [table, column],
  )
  return rows.length > 0
}
