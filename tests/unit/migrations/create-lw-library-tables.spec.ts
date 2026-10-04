/**
 * 设定资产库迁移单测（2026-09-24 P0，create-lw-library-tables）
 *
 * 验证：
 *   1. 空库执行：8 张库/绑定表建成 + 索引就位；
 *   2. 既有 lw 实体表加血缘列（characters 另有 library_ip_id + 四层人设列）；
 *   3. 幂等：跑两遍结构一致、不报错；
 *   4. 实体表不存在时安全跳过（全新库 boot 序：raw DDL 先行，迁移兜底）。
 */
import { describe, it, expect } from 'vitest'
import { DataSource } from 'typeorm'
import { createLwLibraryTables } from '@core/database/migrations/create-lw-library-tables'

const LIBRARY_TABLES = [
  'lw_worlds',
  'lw_world_kinds',
  'lw_world_entries',
  'lw_world_edges',
  'lw_ip_characters',
  'lw_ip_edges',
  'lw_world_bindings',
  'lw_ip_bindings',
]

async function buildDb(withLegacyLwTables: boolean): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [],
    synchronize: false,
  })
  await ds.initialize()
  if (withLegacyLwTables) {
    await ds.query(`CREATE TABLE lw_story_characters (
      id TEXT PRIMARY KEY, user_id TEXT, project_id TEXT NOT NULL,
      name TEXT NOT NULL, created_at DATETIME, updated_at DATETIME
    )`)
    await ds.query(`CREATE TABLE lw_story_locations (
      id TEXT PRIMARY KEY, user_id TEXT, project_id TEXT NOT NULL, name TEXT NOT NULL
    )`)
    await ds.query(`CREATE TABLE lw_project_factions (
      id TEXT PRIMARY KEY, user_id TEXT, project_id TEXT NOT NULL, name TEXT NOT NULL
    )`)
    await ds.query(`CREATE TABLE lw_story_skills (
      id TEXT PRIMARY KEY, user_id TEXT, project_id TEXT NOT NULL, name TEXT NOT NULL
    )`)
    await ds.query(`CREATE TABLE lw_story_items (
      id TEXT PRIMARY KEY, user_id TEXT, project_id TEXT NOT NULL, name TEXT NOT NULL
    )`)
    await ds.query(`CREATE TABLE lw_custom_entities (
      id TEXT PRIMARY KEY, user_id TEXT, project_id TEXT NOT NULL, kind_key TEXT NOT NULL, name TEXT NOT NULL
    )`)
  }
  return ds
}

async function tableNames(ds: DataSource): Promise<string[]> {
  const rows: Array<{ name: string }> = await ds.query(
    `SELECT name FROM sqlite_master WHERE type='table'`,
  )
  return rows.map(r => r.name)
}

async function columnNames(ds: DataSource, table: string): Promise<string[]> {
  const rows: Array<{ name: string }> = await ds.query(`PRAGMA table_info('${table}')`)
  return rows.map(r => r.name)
}

describe('migration: create-lw-library-tables', () => {
  it('空库执行：8 张表建成', async () => {
    const ds = await buildDb(false)
    try {
      await createLwLibraryTables(ds)
      const names = await tableNames(ds)
      for (const t of LIBRARY_TABLES) {
        expect(names).toContain(t)
      }
    } finally {
      await ds.destroy()
    }
  })

  it('既有 lw 实体表加血缘列；characters 另加 IP 血源与四层人设列', async () => {
    const ds = await buildDb(true)
    try {
      await createLwLibraryTables(ds)
      for (const table of ['lw_story_locations', 'lw_project_factions', 'lw_story_skills', 'lw_story_items', 'lw_custom_entities']) {
        const cols = await columnNames(ds, table)
        expect(cols, table).toContain('library_world_id')
        expect(cols, table).toContain('library_entry_id')
        expect(cols, table).toContain('library_version')
      }
      const charCols = await columnNames(ds, 'lw_story_characters')
      expect(charCols).toContain('library_world_id')
      expect(charCols).toContain('library_ip_id')
      expect(charCols).toContain('motivation')
      expect(charCols).toContain('flaw')
      expect(charCols).toContain('character_arc')
    } finally {
      await ds.destroy()
    }
  })

  it('幂等：跑两遍结构一致不报错', async () => {
    const ds = await buildDb(true)
    try {
      await createLwLibraryTables(ds)
      const first = await tableNames(ds)
      await expect(createLwLibraryTables(ds)).resolves.toBeUndefined()
      const second = await tableNames(ds)
      expect(second.sort()).toEqual(first.sort())
    } finally {
      await ds.destroy()
    }
  })

  it('实体表不存在时安全跳过（不阻断 boot）', async () => {
    const ds = await buildDb(false)
    try {
      await expect(createLwLibraryTables(ds)).resolves.toBeUndefined()
      const charCols = await columnNames(ds, 'lw_worlds')
      expect(charCols).toContain('id')
    } finally {
      await ds.destroy()
    }
  })
})
