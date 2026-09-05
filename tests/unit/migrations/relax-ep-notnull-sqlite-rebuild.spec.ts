/**
 * SQLite 表重建迁移单测（episode-production 存量 bug 修复 B1）
 *
 * 用 better-sqlite3 内存库模拟"列仍 NOT NULL"的生产旧 schema，验证：
 *   1. character_bindings.long_writing_character_id / video_episodes.outline_id /
 *      episode_scripts.outline_id 三列重建后 notnull=0，且 NULL 可插入
 *   2. 既有数据、索引保留
 *   3. 幂等（连跑两次不报错、数据不变）
 *   4. 表 / 列不存在时静默跳过
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DataSource } from 'typeorm'
import { relaxBindingLwIdNullable } from '@core/database/migrations/relax-binding-lw-id-nullable'
import { relaxVideoEpisodeOutlineId } from '@core/database/migrations/relax-video-episode-outline-id'
import { relaxEpisodeScriptOutlineId } from '@core/database/migrations/relax-episode-script-outline-id'
import { relaxSqliteNotNull } from '@core/database/migrations/sqlite-relax-notnull'

async function buildLegacyDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [],
    synchronize: false,
  })
  await ds.initialize()

  // 模拟生产旧 schema：三列 NOT NULL + 既有索引
  await ds.query(`CREATE TABLE character_bindings (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    long_writing_character_id varchar NOT NULL,
    source_type TEXT DEFAULT 'standalone',
    voice_config TEXT
  )`)
  await ds.query(
    `CREATE INDEX idx_character_bindings_project_id ON character_bindings (project_id)`,
  )
  await ds.query(`CREATE TABLE video_episodes (
    id TEXT PRIMARY KEY,
    project_id varchar NOT NULL,
    outline_id text NOT NULL,
    episode_number integer NOT NULL,
    title varchar NOT NULL
  )`)
  await ds.query(
    `CREATE INDEX idx_video_episodes_outline_id ON video_episodes (outline_id)`,
  )
  await ds.query(`CREATE TABLE episode_scripts (
    id TEXT PRIMARY KEY,
    project_id varchar NOT NULL,
    episode_id varchar NOT NULL,
    outline_id varchar NOT NULL,
    synopsis text
  )`)

  // 旧数据：含 standalone '' 占位行
  await ds.query(
    `INSERT INTO character_bindings (id, project_id, long_writing_character_id, source_type) VALUES (?, ?, ?, ?)`,
    ['cb1', 'p1', '', 'standalone'],
  )
  await ds.query(
    `INSERT INTO character_bindings (id, project_id, long_writing_character_id, source_type) VALUES (?, ?, ?, ?)`,
    ['cb2', 'p1', 'lw_x', 'linked_lw'],
  )
  await ds.query(
    `INSERT INTO video_episodes (id, project_id, outline_id, episode_number, title) VALUES (?, ?, ?, ?, ?)`,
    ['ve1', 'p1', 'outline_1', 1, '第1集'],
  )
  await ds.query(
    `INSERT INTO episode_scripts (id, project_id, episode_id, outline_id, synopsis) VALUES (?, ?, ?, ?, ?)`,
    ['es1', 'p1', 've1', '', '梗概'],
  )
  return ds
}

async function notnullOf(
  ds: DataSource,
  table: string,
  column: string,
): Promise<number> {
  const rows = await ds.query(
    `SELECT "notnull" FROM pragma_table_info(?) WHERE name = ? LIMIT 1`,
    [table, column],
  )
  return rows[0]?.notnull
}

describe('SQLite NOT NULL 表重建迁移', () => {
  let ds: DataSource

  beforeEach(async () => {
    ds = await buildLegacyDb()
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('三列重建后 notnull=0，数据与索引保留，NULL 可插入', async () => {
    await relaxBindingLwIdNullable(ds)
    await relaxVideoEpisodeOutlineId(ds)
    await relaxEpisodeScriptOutlineId(ds)

    expect(await notnullOf(ds, 'character_bindings', 'long_writing_character_id')).toBe(0)
    expect(await notnullOf(ds, 'video_episodes', 'outline_id')).toBe(0)
    expect(await notnullOf(ds, 'episode_scripts', 'outline_id')).toBe(0)

    // 既有数据保留 + '' 占位回填为 NULL
    const cb = await ds.query(
      `SELECT id, long_writing_character_id FROM character_bindings ORDER BY id`,
    )
    expect(cb).toEqual([
      { id: 'cb1', long_writing_character_id: null },
      { id: 'cb2', long_writing_character_id: 'lw_x' },
    ])
    const ve = await ds.query(`SELECT outline_id, title FROM video_episodes WHERE id = 've1'`)
    expect(ve[0]).toMatchObject({ outline_id: 'outline_1', title: '第1集' })
    const es = await ds.query(`SELECT outline_id FROM episode_scripts WHERE id = 'es1'`)
    expect(es[0].outline_id).toBeNull()

    // 索引保留
    const idx = await ds.query(
      `SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name IN ('character_bindings', 'video_episodes')`,
    )
    const idxNames = idx.map((r: { name: string }) => r.name)
    expect(idxNames).toContain('idx_character_bindings_project_id')
    expect(idxNames).toContain('idx_video_episodes_outline_id')

    // 复现 bug 的写入路径现在能成功（standalone 角色 / uploaded 建集 / uploaded 剧本）
    await ds.query(
      `INSERT INTO character_bindings (id, project_id, long_writing_character_id, source_type) VALUES ('cb3', 'p1', NULL, 'standalone')`,
    )
    await ds.query(
      `INSERT INTO video_episodes (id, project_id, outline_id, episode_number, title) VALUES ('ve2', 'p1', NULL, 2, '第2集')`,
    )
    await ds.query(
      `INSERT INTO episode_scripts (id, project_id, episode_id, outline_id) VALUES ('es2', 'p1', 've2', NULL)`,
    )
  })

  it('幂等：连跑两次不报错且数据不变', async () => {
    await relaxBindingLwIdNullable(ds)
    await relaxVideoEpisodeOutlineId(ds)
    await relaxEpisodeScriptOutlineId(ds)
    await expect(relaxBindingLwIdNullable(ds)).resolves.not.toThrow()
    await expect(relaxVideoEpisodeOutlineId(ds)).resolves.not.toThrow()
    await expect(relaxEpisodeScriptOutlineId(ds)).resolves.not.toThrow()

    expect(await notnullOf(ds, 'character_bindings', 'long_writing_character_id')).toBe(0)
    expect(await notnullOf(ds, 'video_episodes', 'outline_id')).toBe(0)
    expect(await notnullOf(ds, 'episode_scripts', 'outline_id')).toBe(0)
    const cnt = await ds.query(`SELECT COUNT(*) AS c FROM character_bindings`)
    expect(cnt[0].c).toBe(2)
  })

  it('表不存在时静默跳过', async () => {
    const empty = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [],
      synchronize: false,
    })
    await empty.initialize()
    await expect(relaxBindingLwIdNullable(empty)).resolves.not.toThrow()
    await expect(relaxVideoEpisodeOutlineId(empty)).resolves.not.toThrow()
    await expect(relaxEpisodeScriptOutlineId(empty)).resolves.not.toThrow()
    await empty.destroy()
  })

  it('helper：已 nullable 返回 already-nullable，缺表/缺列返回 missing', async () => {
    expect(await relaxSqliteNotNull(ds, 'no_such_table', 'x')).toBe('missing')
    expect(await relaxSqliteNotNull(ds, 'character_bindings', 'no_such_col')).toBe('missing')
    // 先迁移一次把列放开，再调 helper 应报 already-nullable
    await relaxSqliteNotNull(ds, 'character_bindings', 'long_writing_character_id')
    expect(await relaxSqliteNotNull(ds, 'character_bindings', 'long_writing_character_id')).toBe(
      'already-nullable',
    )
  })
})
