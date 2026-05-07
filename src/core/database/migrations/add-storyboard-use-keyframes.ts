/**
 * storyboards 增加 use_keyframes 字段
 *
 * 用户可在 ⑤ 画面+音频 镜头描述卡上勾选"是否走关键帧流程"：
 *   - true（默认）：先生成 N 张关键帧再 keyframesToVideo
 *   - false：跳过关键帧，VideoSegmentPanel 用 frameDescription + 资产引用
 *     直接 text2video / image2video（适合简单分镜，节省一轮生成）
 *
 * 兼容 SQLite + PG，整型 0/1 表达布尔，默认 1。
 */

import type { DataSource } from 'typeorm'

export async function addStoryboardUseKeyframes(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  if (!(await checkTableExists(ds, 'storyboards', isPg))) {
    console.log('[add-storyboard-use-keyframes] storyboards 不存在，跳过')
    return
  }

  if (await checkColumnExists(ds, 'storyboards', 'use_keyframes', isPg)) return

  const type = isPg ? 'integer' : 'INTEGER'
  await ds.query(
    `ALTER TABLE storyboards ADD COLUMN use_keyframes ${type} DEFAULT 1`,
  )
  console.log('[add-storyboard-use-keyframes] 加列 use_keyframes')
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
