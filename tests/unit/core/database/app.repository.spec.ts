/**
 * 应用仓库测试（时间降序排序 + 分类/标签/固定新列）
 * @module tests/core/database/app.repository
 * @description 真实 sqlite：列表按 created_at 降序；category/tags/pinned 列 CRUD、
 *              category 筛选、tags 关键字搜索、pinned 筛选、分类计数聚合。
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
  const cols = (await ds.query(`SELECT name FROM pragma_table_info('apps')`)).map((r: { name: string }) => r.name)
  if (!cols.includes('is_builtin')) {
    await ds.query(`ALTER TABLE apps ADD COLUMN is_builtin INTEGER DEFAULT 0`)
  }
  return ds
}

/** 按 id 插内置应用（模拟迁移：created_at 按发布顺序错开，最新发布的时间最大） */
async function insertBuiltin(ds: DataSource, id: string, minutesOffset: string): Promise<void> {
  await ds.query(
    `INSERT INTO apps (id, user_id, name, source_kind, source_id, is_builtin, created_at, updated_at)
     VALUES ('${id}', NULL, '${id}', 'workflow', 'def-${id}', 1, datetime('now', '${minutesOffset}'), datetime('now', '${minutesOffset}'))`
  )
}

/** 相对当前时刻的 SQLite datetime 偏移（格式与迁移/TypeORM 写入一致，保证字典序=时间序） */
function minutesAgo(min: number): string {
  return `-${min} minutes`
}

describe('AppRepository.listApp 排序（时间降序）', () => {
  let ds: DataSource
  let repo: AppRepository

  beforeEach(async () => {
    ds = await buildDs()
    repo = new AppRepository(ds)
  })
  afterEach(async () => {
    await ds.destroy()
  })

  it('用户应用按创建时间降序（最新创建的在前）', async () => {
    await runWithUserAsync('user-1', async () => {
      await repo.create({ name: '旧应用', sourceKind: 'workflow', sourceId: 'd1' })
      await repo.create({ name: '新应用', sourceKind: 'workflow', sourceId: 'd2' })
      // 模拟「新应用」稍后创建
      await ds.query(`UPDATE apps SET created_at = datetime('now', '+1 minute') WHERE name = '新应用'`)
      const { items } = await repo.listApp({ page: 1, pageSize: 20 })
      expect(items.map(a => a.name)).toEqual(['新应用', '旧应用'])
    })
  })

  it('内置应用按发布顺序时间降序（最新发布的内置在前）', async () => {
    await runWithUserAsync('user-1', async () => {
      // 模拟迁移错开：daily_news 最早发布，video_transcript 最新发布
      await insertBuiltin(ds, 'builtin_app_daily_news', minutesAgo(2))
      await insertBuiltin(ds, 'builtin_app_multi_platform', minutesAgo(1))
      await insertBuiltin(ds, 'builtin_app_video_transcript', minutesAgo(0))
      const { items } = await repo.listApp({ page: 1, pageSize: 20 })
      expect(items.map(a => a.id)).toEqual([
        'builtin_app_video_transcript', 'builtin_app_multi_platform', 'builtin_app_daily_news',
      ])
    })
  })

  it('内置 + 用户混合：整体时间降序（用户应用晚创建在前，内置按发布时间跟随）', async () => {
    await runWithUserAsync('user-1', async () => {
      await insertBuiltin(ds, 'builtin_app_video_transcript', minutesAgo(10))
      await insertBuiltin(ds, 'builtin_app_daily_news', minutesAgo(12))
      await repo.create({ name: '用户应用A', sourceKind: 'workflow', sourceId: 'd1' })
      await repo.create({ name: '用户应用B', sourceKind: 'workflow', sourceId: 'd2' })
      const { items } = await repo.listApp({ page: 1, pageSize: 20 })
      // 用户应用 created_at 晚于内置 → 在前；内置之间 video_transcript 最新发布 → 在前
      expect(items.map(a => a.name)).toEqual(['用户应用B', '用户应用A', 'builtin_app_video_transcript', 'builtin_app_daily_news'])
    })
  })

  it('混合场景：最新发布的内置（视频文案提取）在首页容量内可见', async () => {
    await runWithUserAsync('user-1', async () => {
      // 内置按发布顺序错开（模拟 8 个内置，video_transcript 最新发布）
      const builtinIds = ['builtin_app_daily_news', 'builtin_app_industry_weekly', 'builtin_app_multi_platform',
        'builtin_app_webpage_summary', 'builtin_app_article_polish', 'builtin_app_image_card',
        'builtin_app_webpage_transcribe', 'builtin_app_video_transcript']
      for (let i = 0; i < builtinIds.length; i++) {
        await insertBuiltin(ds, builtinIds[i], minutesAgo(10 - i))
      }
      // 8 个用户应用（晚于内置创建）
      for (let i = 0; i < 8; i++) {
        await repo.create({ name: `用户应用${i}`, sourceKind: 'workflow', sourceId: `d${i}` })
      }
      const { items } = await repo.listApp({ page: 1, pageSize: 12 })
      const videoIdx = items.findIndex(a => a.id === 'builtin_app_video_transcript')
      expect(videoIdx).toBeGreaterThanOrEqual(0)
      expect(videoIdx).toBeLessThan(12) // 首页容量内可见
      // 时间降序校验：整体按 created_at 非递增
      const times = items.map(a => new Date(a.createdAt).getTime())
      for (let i = 1; i < times.length; i++) {
        expect(times[i - 1]).toBeGreaterThanOrEqual(times[i])
      }
    })
  })
})

describe('AppRepository 分类/标签/固定（新列）', () => {
  let ds: DataSource
  let repo: AppRepository

  beforeEach(async () => {
    ds = await buildDs()
    repo = new AppRepository(ds)
  })
  afterEach(async () => {
    await ds.destroy()
  })

  it('create 写入 category/tags，toDto 还原数组', async () => {
    await runWithUserAsync('user-1', async () => {
      const rec = await repo.create({
        name: '早报应用', category: '新闻资讯', tags: ['早报', '新闻'], sourceKind: 'workflow', sourceId: 'd1',
      })
      expect(rec.category).toBe('新闻资讯')
      expect(rec.tags).toEqual(['早报', '新闻'])
      expect(rec.pinned).toBe(0)
      const got = await repo.findById(rec.id)
      expect(got?.category).toBe('新闻资讯')
      expect(got?.tags).toEqual(['早报', '新闻'])
    })
  })

  it('update 修改分类/标签/固定', async () => {
    await runWithUserAsync('user-1', async () => {
      const rec = await repo.create({ name: 'A', sourceKind: 'workflow', sourceId: 'd1' })
      const upd = await repo.update(rec.id, { category: '视频处理', tags: ['视频'], pinned: 1 })
      expect(upd?.category).toBe('视频处理')
      expect(upd?.tags).toEqual(['视频'])
      expect(upd?.pinned).toBe(1)
    })
  })

  it('listApp 支持 category 筛选', async () => {
    await runWithUserAsync('user-1', async () => {
      await repo.create({ name: '新闻A', category: '新闻资讯', sourceKind: 'workflow', sourceId: 'd1' })
      await repo.create({ name: '新闻B', category: '新闻资讯', sourceKind: 'workflow', sourceId: 'd2' })
      await repo.create({ name: '视频C', category: '视频处理', sourceKind: 'workflow', sourceId: 'd3' })
      const r1 = await repo.listApp({ category: '新闻资讯', page: 1, pageSize: 20 })
      expect(r1.total).toBe(2)
      const r2 = await repo.listApp({ page: 1, pageSize: 20 })
      expect(r2.total).toBe(3)
    })
  })

  it('listApp 关键字搜索命中名称/分类/标签', async () => {
    await runWithUserAsync('user-1', async () => {
      await repo.create({ name: '视频文案提取', category: '视频处理', tags: ['视频', '文案'], sourceKind: 'workflow', sourceId: 'd1' })
      await repo.create({ name: '早报', category: '新闻资讯', tags: ['新闻'], sourceKind: 'workflow', sourceId: 'd2' })
      const byName = await repo.listApp({ keyword: '文案', page: 1, pageSize: 20 })
      expect(byName.total).toBe(1)
      expect(byName.items[0].name).toBe('视频文案提取')
      const byTag = await repo.listApp({ keyword: '新闻', page: 1, pageSize: 20 })
      expect(byTag.total).toBe(1)
      const byCat = await repo.listApp({ keyword: '视频处理', page: 1, pageSize: 20 })
      expect(byCat.total).toBe(1)
    })
  })

  it('listApp 支持 pinned 筛选（首页固定应用入口数据源）', async () => {
    await runWithUserAsync('user-1', async () => {
      const a = await repo.create({ name: 'A', sourceKind: 'workflow', sourceId: 'd1' })
      await repo.create({ name: 'B', sourceKind: 'workflow', sourceId: 'd2' })
      await repo.update(a.id, { pinned: 1 })
      const pinned = await repo.listApp({ pinned: true, page: 1, pageSize: 20 })
      expect(pinned.total).toBe(1)
      expect(pinned.items[0].name).toBe('A')
      const all = await repo.listApp({ page: 1, pageSize: 20 })
      expect(all.total).toBe(2)
    })
  })

  it('countByCategory 分类计数聚合（含内置）', async () => {
    await runWithUserAsync('user-1', async () => {
      await repo.create({ name: 'A', category: '新闻资讯', sourceKind: 'workflow', sourceId: 'd1' })
      await repo.create({ name: 'B', category: '新闻资讯', sourceKind: 'workflow', sourceId: 'd2' })
      await repo.create({ name: 'C', category: '视频处理', sourceKind: 'workflow', sourceId: 'd3' })
      const stats = await repo.countByCategory()
      const byCat = Object.fromEntries(stats.map(s => [s.category, s.count]))
      expect(byCat['新闻资讯']).toBe(2)
      expect(byCat['视频处理']).toBe(1)
    })
  })

  it('内置应用允许 pinned 更新（首页入口是用户个人行为），其余字段禁改', async () => {
    await runWithUserAsync('user-1', async () => {
      await insertBuiltin(ds, 'builtin_app_video_transcript', '-1 minutes')
      const upd = await repo.update('builtin_app_video_transcript', { pinned: 1, name: '篡改名' })
      expect(upd?.pinned).toBe(1)
      expect(upd?.name).toBe('builtin_app_video_transcript') // 名称未被篡改
    })
  })
})
