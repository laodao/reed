/**
 * migration: add-video-provider-task-id 单测（2026-09-16 ep-hardening H5）
 *
 * 旧库（storyboards / ep_video_segments 无 provider_task_id 列）→ 迁移 → 断言：
 * - 两表各加 provider_task_id 列（TEXT）
 * - 幂等：连跑两次不报错
 * - 表不存在时跳过不抛错
 */

import { describe, expect, it } from 'vitest'
import { DataSource } from 'typeorm'
import { addVideoProviderTaskId } from '@core/database/migrations/add-video-provider-task-id'

async function buildLegacyDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [],
    synchronize: false,
  })
  await ds.initialize()
  await ds.query(`CREATE TABLE storyboards (
    id TEXT PRIMARY KEY, status TEXT, video_path TEXT, user_id TEXT
  )`)
  await ds.query(`CREATE TABLE ep_video_segments (
    id TEXT PRIMARY KEY, episode_id TEXT, status TEXT, video_path TEXT, user_id TEXT
  )`)
  return ds
}

async function columnNames(ds: DataSource, table: string): Promise<string[]> {
  const rows = await ds.query(`PRAGMA table_info(${table})`)
  return rows.map((r: { name: string }) => r.name)
}

describe('add-video-provider-task-id 迁移', () => {
  it('两表各加 provider_task_id 列，幂等', async () => {
    const ds = await buildLegacyDb()
    try {
      await ds.query(`INSERT INTO storyboards (id, status) VALUES ('sb1', 'generating')`)
      await ds.query(`INSERT INTO ep_video_segments (id, episode_id, status) VALUES ('evs1', 'ep1', 'generating')`)

      await addVideoProviderTaskId(ds)
      expect(await columnNames(ds, 'storyboards')).toContain('provider_task_id')
      expect(await columnNames(ds, 'ep_video_segments')).toContain('provider_task_id')

      // 存量行新列为 NULL，数据不动
      const sb = await ds.query(`SELECT provider_task_id FROM storyboards WHERE id = 'sb1'`)
      expect(sb[0].provider_task_id).toBeNull()

      // 幂等：再跑一次不报错
      await addVideoProviderTaskId(ds)
      expect(await columnNames(ds, 'storyboards')).toContain('provider_task_id')
    } finally {
      await ds.destroy()
    }
  })

  it('表不存在 → 跳过不抛错', async () => {
    const ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [],
      synchronize: false,
    })
    await ds.initialize()
    try {
      await expect(addVideoProviderTaskId(ds)).resolves.toBeUndefined()
    } finally {
      await ds.destroy()
    }
  })
})
