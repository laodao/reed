/**
 * create-news-sources 迁移执行测试（新闻来源库：预置 5 主题 × 10 全球 top10 源）
 * @module tests/migrations/create-news-sources
 * @description 真实 sqlite：建表 → 预置 50 个内置源（5 主题 × 10）→ 幂等重跑不重复。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { DataSource } from 'typeorm'
import { createNewsSources } from '@core/database/migrations/create-news-sources'
import { NewsSourceEntity } from '@core/database/entities/news-source.entity'

let ds: DataSource

beforeAll(async () => {
  ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: [NewsSourceEntity], synchronize: false })
  await ds.initialize()
  await createNewsSources(ds)
})

afterAll(async () => {
  await ds.destroy()
})

describe('create-news-sources 迁移执行', () => {
  it('预置 50 个内置源（5 主题 × 10）', async () => {
    const rows = await ds.query(`SELECT topic_id, count(*) c FROM news_sources WHERE is_builtin = 1 GROUP BY topic_id`)
    expect(rows.length).toBe(5)
    let total = 0
    for (const r of rows) {
      expect(r.c).toBe(10)
      total += r.c
    }
    expect(total).toBe(50)
  })

  it('内置源 user_id NULL + is_builtin=1 + enabled=1', async () => {
    const rows = await ds.query(`SELECT user_id, is_builtin, enabled FROM news_sources WHERE is_builtin = 1 LIMIT 5`)
    for (const r of rows) {
      expect(r.user_id).toBeNull()
      expect(r.is_builtin).toBe(1)
      expect(r.enabled).toBe(1)
    }
  })

  it('所有源 URL 为 http(s) 且同主题内不重复', async () => {
    const rows = await ds.query(`SELECT topic_id, url FROM news_sources`)
    for (const r of rows) expect(r.url).toMatch(/^https?:\/\//)
    // 同主题内 URL 唯一
    const byTopic = new Map<string, Set<string>>()
    for (const r of rows) {
      const set = byTopic.get(r.topic_id) ?? new Set<string>()
      expect(set.has(r.url), `主题 ${r.topic_id} URL 重复: ${r.url}`).toBe(false)
      set.add(r.url)
      byTopic.set(r.topic_id, set)
    }
  })

  it('幂等：重跑不重复插入', async () => {
    await createNewsSources(ds)
    const count = (await ds.query(`SELECT count(*) c FROM news_sources WHERE is_builtin = 1`))[0].c
    expect(count).toBe(50)
  })

  it('主题 id 覆盖 5 个预置主题', async () => {
    const topics = (await ds.query(`SELECT DISTINCT topic_id FROM news_sources`)).map((r: any) => r.topic_id)
    expect(topics.sort()).toEqual(['ai', 'energy', 'finance', 'tech', 'world'])
  })
})
