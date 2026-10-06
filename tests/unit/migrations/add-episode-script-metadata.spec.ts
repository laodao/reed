/**
 * add-episode-script-metadata 迁移单测（提示词优化方案 §4.5）
 * @module tests/unit/migrations/add-episode-script-metadata
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import { addEpisodeScriptMetadata } from '@core/database/migrations/add-episode-script-metadata'

describe('addEpisodeScriptMetadata（SQLite）', () => {
  let ds: DataSource

  beforeEach(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [],
      synchronize: false,
    })
    await ds.initialize()
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  async function columns(): Promise<string[]> {
    const rows = await ds.query(`SELECT name FROM pragma_table_info('episode_scripts')`)
    return rows.map((r: { name: string }) => r.name)
  }

  it('表不存在时静默跳过（不抛错）', async () => {
    await expect(addEpisodeScriptMetadata(ds)).resolves.toBeUndefined()
  })

  it('表存在时加 metadata 列', async () => {
    await ds.query(`CREATE TABLE episode_scripts (id TEXT PRIMARY KEY, project_id TEXT)`)
    expect(await columns()).not.toContain('metadata')

    await addEpisodeScriptMetadata(ds)
    expect(await columns()).toContain('metadata')
  })

  it('幂等：重复执行不报错且列仍在', async () => {
    await ds.query(`CREATE TABLE episode_scripts (id TEXT PRIMARY KEY)`)
    await addEpisodeScriptMetadata(ds)
    await expect(addEpisodeScriptMetadata(ds)).resolves.toBeUndefined()
    expect(await columns()).toContain('metadata')
  })

  it('加列后既有数据保留且 metadata 为 NULL', async () => {
    await ds.query(`CREATE TABLE episode_scripts (id TEXT PRIMARY KEY, synopsis TEXT)`)
    await ds.query(`INSERT INTO episode_scripts (id, synopsis) VALUES ('s1', '梗概')`)

    await addEpisodeScriptMetadata(ds)

    const rows = await ds.query(`SELECT id, synopsis, metadata FROM episode_scripts WHERE id = 's1'`)
    expect(rows[0].synopsis).toBe('梗概')
    expect(rows[0].metadata).toBeNull()
  })

  it('可写入 JSON 报告并读回', async () => {
    await ds.query(`CREATE TABLE episode_scripts (id TEXT PRIMARY KEY)`)
    await addEpisodeScriptMetadata(ds)
    await ds.query(`INSERT INTO episode_scripts (id, metadata) VALUES ('s1', ?)`, [
      JSON.stringify({ coverageReport: { ratio: 0.75 } }),
    ])

    const rows = await ds.query(`SELECT metadata FROM episode_scripts WHERE id = 's1'`)
    expect(JSON.parse(rows[0].metadata).coverageReport.ratio).toBe(0.75)
  })
})