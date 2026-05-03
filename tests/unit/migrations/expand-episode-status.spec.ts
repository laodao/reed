import { describe, it, expect } from 'vitest'
import { DataSource } from 'typeorm'
import { expandEpisodeStatus } from '@core/database/migrations/expand-episode-status'

/**
 * 构造遗留数据库（内存 SQLite，手动建表模拟旧结构）
 */
async function buildLegacyDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [],
    synchronize: false,
  })
  await ds.initialize()
  await ds.query(`CREATE TABLE video_episodes (
    id TEXT PRIMARY KEY,
    status TEXT,
    uploaded_characters TEXT,
    uploaded_locations TEXT,
    uploaded_items TEXT
  )`)
  return ds
}

describe('expandEpisodeStatus', () => {
  it('reviewing → composing', async () => {
    const ds = await buildLegacyDb()
    await ds.query(`INSERT INTO video_episodes (id, status) VALUES ('e1', 'reviewing'), ('e2', 'completed')`)
    await expandEpisodeStatus(ds)
    const rows = await ds.query(`SELECT id, status FROM video_episodes ORDER BY id`)
    expect(rows).toEqual([
      { id: 'e1', status: 'composing' },
      { id: 'e2', status: 'completed' },
    ])
    await ds.destroy()
  })

  it('pending 按是否有要素分流：有要素 → asset_prep；无 → pending', async () => {
    const ds = await buildLegacyDb()
    await ds.query(`INSERT INTO video_episodes (id, status, uploaded_characters) VALUES
      ('e1', 'pending', '[{"name":"a"}]'),
      ('e2', 'pending', NULL),
      ('e3', 'pending', '[]')`)
    await expandEpisodeStatus(ds)
    const rows = await ds.query(`SELECT id, status FROM video_episodes ORDER BY id`)
    expect(rows).toEqual([
      { id: 'e1', status: 'asset_prep' },
      { id: 'e2', status: 'pending' },
      { id: 'e3', status: 'pending' },
    ])
    await ds.destroy()
  })

  it('幂等', async () => {
    const ds = await buildLegacyDb()
    await ds.query(`INSERT INTO video_episodes (id, status) VALUES ('e1', 'reviewing')`)
    await expandEpisodeStatus(ds)
    await expandEpisodeStatus(ds)
    const r = await ds.query(`SELECT status FROM video_episodes WHERE id='e1'`)
    expect(r[0].status).toBe('composing')
    await ds.destroy()
  })
})
