/**
 * 应用仓库排序测试（内置应用置顶 + 稳定排序）
 * @module tests/core/database/app.repository
 * @description 真实 sqlite：内置应用置顶展示（开箱即用能力优先）、内置之间 id 稳定排序
 *              （同批插入 updated_at 相同不随机）、用户应用按最近更新倒序。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import { createAppsTables } from '@core/database/migrations/create-apps-tables'
import { AppEntity } from '@core/database/entities/app.entity'
import { AppRepository } from '@core/database/repositories/app.repository'
import { runWithUserAsync } from '@core/context/user-context'

async function buildDs(): Promise<DataSource> {
  const ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: [AppEntity], synchronize: false })
  await ds.initialize()
  await createAppsTables(ds)
  // is_builtin 列由 create-builtin-apps 迁移补（本测试聚焦排序，手动补齐）
  const cols = (await ds.query(`SELECT name FROM pragma_table_info('apps')`)).map((r: { name: string }) => r.name)
  if (!cols.includes('is_builtin')) {
    await ds.query(`ALTER TABLE apps ADD COLUMN is_builtin INTEGER DEFAULT 0`)
  }
  return ds
}

describe('AppRepository.listApp 排序', () => {
  let ds: DataSource
  let repo: AppRepository

  beforeEach(async () => {
    ds = await buildDs()
    repo = new AppRepository(ds)
  })
  afterEach(async () => {
    await ds.destroy()
  })

  it('内置应用置顶（官方开箱即用优先于用户自建）', async () => {
    await runWithUserAsync('user-1', async () => {
      await repo.create({ name: '用户应用A', sourceKind: 'workflow', sourceId: 'd1' })
      await repo.create({ name: '用户应用B', sourceKind: 'workflow', sourceId: 'd2' })
      // 模拟内置（迁移插入：user_id=NULL, is_builtin=1）
      await ds.query(
        `INSERT INTO apps (id, user_id, name, source_kind, source_id, is_builtin, created_at, updated_at)
         VALUES ('builtin_app_x', NULL, '内置应用X', 'workflow', 'def-x', 1, datetime('now'), datetime('now'))`
      )
      const { items } = await repo.listApp({ page: 1, pageSize: 20 })
      expect(items.map(a => a.name)).toEqual(['内置应用X', '用户应用B', '用户应用A'])
    })
  })

  it('内置之间按 id 稳定排序（同批 updated_at 相同不随机）', async () => {
    await runWithUserAsync('user-1', async () => {
      const now = "datetime('now')"
      const rows: Array<[string, string]> = [['builtin_app_b', 'def-b'], ['builtin_app_a', 'def-a'], ['builtin_app_c', 'def-c']]
      for (const [id, srcId] of rows) {
        await ds.query(
          `INSERT INTO apps (id, user_id, name, source_kind, source_id, is_builtin, created_at, updated_at)
           VALUES ('${id}', NULL, '${id}', 'workflow', '${srcId}', 1, ${now}, ${now})`
        )
      }
      const { items } = await repo.listApp({ page: 1, pageSize: 20 })
      expect(items.map(a => a.id)).toEqual(['builtin_app_a', 'builtin_app_b', 'builtin_app_c'])
    })
  })

  it('用户应用按最近更新倒序（新发布在前）', async () => {
    await runWithUserAsync('user-1', async () => {
      await repo.create({ name: '旧应用', sourceKind: 'workflow', sourceId: 'd1' })
      await repo.create({ name: '新应用', sourceKind: 'workflow', sourceId: 'd2' })
      // 模拟「新应用」最近更新
      await ds.query(`UPDATE apps SET updated_at = datetime('now', '+1 day') WHERE name = '新应用'`)
      const { items } = await repo.listApp({ page: 1, pageSize: 20 })
      expect(items.map(a => a.name)).toEqual(['新应用', '旧应用'])
    })
  })

  it('内置 + 用户混合：内置全在前，且视频文案类内置可在首页容量内找到', async () => {
    await runWithUserAsync('user-1', async () => {
      const now = "datetime('now')"
      const rows: Array<[string, string]> = [
        ['builtin_app_video_transcript', 'def-video'],
        ['builtin_app_daily_news', 'def-daily'],
        ['builtin_app_industry_weekly', 'def-weekly'],
      ]
      for (const [id, srcId] of rows) {
        await ds.query(
          `INSERT INTO apps (id, user_id, name, source_kind, source_id, is_builtin, created_at, updated_at)
           VALUES ('${id}', NULL, '${id}', 'workflow', '${srcId}', 1, ${now}, ${now})`
        )
      }
      for (let i = 0; i < 10; i++) {
        await repo.create({ name: `用户应用${i}`, sourceKind: 'workflow', sourceId: `d${i}` })
      }
      const { items } = await repo.listApp({ page: 1, pageSize: 12 })
      // 3 个内置全部在第 1 页（内置置顶 + 12 容量足够）
      expect(items.filter(a => a.isBuiltin).map(a => a.id).sort()).toEqual([
        'builtin_app_daily_news', 'builtin_app_industry_weekly', 'builtin_app_video_transcript',
      ])
    })
  })
})
