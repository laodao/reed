/**
 * create-info-sources 迁移执行测试（信息来源库：类别 / 分组 / 来源三层）
 * @module tests/unit/migrations/create-info-sources
 * @description 真实 sqlite：
 *  - 新装：建三表 → 预置内置类别「新闻来源」（5 分组 × 15 源 = 75）与「权威知识源」（6 分组 × 34 源）
 *    → 幂等重跑不重复
 *  - 存量升级：旧 news_topics / news_sources（含用户自建数据）整体改名搬迁，分组补 category_id
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { DataSource } from 'typeorm'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInfoSources } from '@core/database/migrations/create-info-sources'
import { checkSchemaDrift } from '@core/database/schema-drift'
import { createDataSource } from '@core/database/data-source'
import * as entities from '@core/database/entities'
import { NEWS_TOPICS } from '@shared/types/news-topics'
import { INFO_SOURCE_AUTHORITY_CATEGORY_ID, INFO_SOURCE_NEWS_CATEGORY_ID } from '@shared/types/info-source.types'

/** 权威知识源各分组的预置来源数（百科 6 / 技术文档 6 / 教材 4 / 政府统计 8 / 医学 5 / 标准 5） */
const AUTHORITY_TOPIC_SIZES: Record<string, number> = {
  'auth-encyc': 6,
  'auth-techdocs': 6,
  'auth-course': 4,
  'auth-gov': 8,
  'auth-med': 5,
  'auth-standard': 5,
}

let ds: DataSource

/** 复刻改造前的旧结构（news_topics 无 category_id / is_default；news_sources 同前） */
async function createLegacyNewsTables(target: DataSource): Promise<void> {
  await target.query(`CREATE TABLE news_topics (
    id TEXT PRIMARY KEY, user_id TEXT, name TEXT NOT NULL,
    is_builtin INTEGER DEFAULT 0, created_at datetime, updated_at datetime)`)
  await target.query(`CREATE INDEX idx_news_topics_user ON news_topics (user_id)`)
  await target.query(`CREATE TABLE news_sources (
    id TEXT PRIMARY KEY, user_id TEXT, topic_id TEXT NOT NULL, name TEXT NOT NULL, url TEXT NOT NULL,
    is_builtin INTEGER DEFAULT 0, enabled INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0,
    created_at datetime, updated_at datetime)`)
  await target.query(`CREATE INDEX idx_news_sources_user ON news_sources (user_id)`)
  await target.query(`CREATE INDEX idx_news_sources_topic ON news_sources (topic_id)`)
}

beforeAll(async () => {
  ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: [], synchronize: false })
  await ds.initialize()
  await createInfoSources(ds)
})

afterAll(async () => {
  await ds.destroy()
})

describe('create-info-sources 迁移执行（新装）', () => {
  it('预置 2 个内置类别：新闻来源 + 权威知识源', async () => {
    const rows = await ds.query(`SELECT id, name, is_builtin, user_id FROM info_source_categories ORDER BY sort_order`)
    expect(rows.length).toBe(2)
    expect(rows[0].id).toBe(INFO_SOURCE_NEWS_CATEGORY_ID)
    expect(rows[0].name).toBe('新闻来源')
    expect(rows[1].id).toBe(INFO_SOURCE_AUTHORITY_CATEGORY_ID)
    expect(rows[1].name).toBe('权威知识源')
    for (const r of rows) {
      expect(r.is_builtin).toBe(1)
      expect(r.user_id).toBeNull()
    }
  })

  it('预置 11 个内置分组：新闻 5 + 权威知识源 6，归属各自类别', async () => {
    const rows = await ds.query(`SELECT id, category_id, is_builtin FROM info_source_topics WHERE is_builtin = 1`)
    expect(rows.length).toBe(11)
    const newsIds = rows.filter((r: any) => r.category_id === INFO_SOURCE_NEWS_CATEGORY_ID).map((r: any) => r.id).sort()
    const authIds = rows.filter((r: any) => r.category_id === INFO_SOURCE_AUTHORITY_CATEGORY_ID).map((r: any) => r.id).sort()
    expect(newsIds).toEqual(['ai', 'energy', 'finance', 'tech', 'world'])
    expect(authIds).toEqual(Object.keys(AUTHORITY_TOPIC_SIZES).sort())
    for (const r of rows) expect(r.is_builtin).toBe(1)
  })

  it('预置 109 个内置来源：新闻 5×15 + 权威知识源 6 分组 × 各自数量', async () => {
    const rows = await ds.query(
      `SELECT t.category_id cat, s.topic_id topic, count(*) c FROM info_sources s
       JOIN info_source_topics t ON t.id = s.topic_id WHERE s.is_builtin = 1 GROUP BY s.topic_id`,
    )
    let total = 0
    let newsTopics = 0
    for (const r of rows) {
      if (r.cat === INFO_SOURCE_NEWS_CATEGORY_ID) {
        expect(r.c).toBe(15)
        newsTopics++
      } else {
        expect(r.c, `${r.topic} 权威源数量`).toBe(AUTHORITY_TOPIC_SIZES[r.topic])
      }
      total += r.c
    }
    expect(newsTopics).toBe(5)
    expect(total).toBe(75 + 34)
  })

  it('新闻分组每分组国外 10 + 国内 5（id 序号 01-10 国外、11-15 国内）', async () => {
    const rows = await ds.query(
      `SELECT s.id, s.topic_id FROM info_sources s JOIN info_source_topics t ON t.id = s.topic_id
       WHERE s.is_builtin = 1 AND t.category_id = '${INFO_SOURCE_NEWS_CATEGORY_ID}'`,
    )
    const byTopic = new Map<string, string[]>()
    for (const r of rows) {
      const list = byTopic.get(r.topic_id) ?? []
      list.push(r.id)
      byTopic.set(r.topic_id, list)
    }
    for (const [topic, ids] of byTopic) {
      expect(ids.length, `${topic} 总数`).toBe(15)
      // id 序号 = sort_order；01-10 为国外、11-15 为国内（id 后缀序号判定）
      const foreign = ids.filter(id => Number(id.slice(-2)) <= 10)
      const domestic = ids.filter(id => Number(id.slice(-2)) >= 11)
      expect(foreign.length, `${topic} 国外`).toBe(10)
      expect(domestic.length, `${topic} 国内`).toBe(5)
    }
  })

  it('权威知识源 id 以 ak_ 前缀 + 两位序号结尾（sort_order 由尾号解析）', async () => {
    const rows = await ds.query(
      `SELECT s.id FROM info_sources s JOIN info_source_topics t ON t.id = s.topic_id
       WHERE s.is_builtin = 1 AND t.category_id = '${INFO_SOURCE_AUTHORITY_CATEGORY_ID}'`,
    )
    expect(rows.length).toBe(34)
    for (const r of rows) {
      expect(r.id).toMatch(/^ak_[a-z]+_\d{2}$/)
      expect(Number.isFinite(Number(r.id.slice(-2)))).toBe(true)
    }
  })

  it('内置来源 user_id NULL + is_builtin=1 + enabled=1', async () => {
    const rows = await ds.query(`SELECT user_id, is_builtin, enabled FROM info_sources WHERE is_builtin = 1 LIMIT 5`)
    for (const r of rows) {
      expect(r.user_id).toBeNull()
      expect(r.is_builtin).toBe(1)
      expect(r.enabled).toBe(1)
    }
  })

  it('所有来源 URL 为 http(s) 且同分组内不重复', async () => {
    const rows = await ds.query(`SELECT topic_id, url FROM info_sources`)
    for (const r of rows) expect(r.url).toMatch(/^https?:\/\//)
    const byTopic = new Map<string, Set<string>>()
    for (const r of rows) {
      const set = byTopic.get(r.topic_id) ?? new Set<string>()
      expect(set.has(r.url), `分组 ${r.topic_id} URL 重复: ${r.url}`).toBe(false)
      set.add(r.url)
      byTopic.set(r.topic_id, set)
    }
  })

  it('幂等：重跑不重复插入', async () => {
    await createInfoSources(ds)
    const sources = (await ds.query(`SELECT count(*) c FROM info_sources WHERE is_builtin = 1`))[0].c
    const topics = (await ds.query(`SELECT count(*) c FROM info_source_topics`))[0].c
    const categories = (await ds.query(`SELECT count(*) c FROM info_source_categories`))[0].c
    expect(sources).toBe(109)
    expect(topics).toBe(11)
    expect(categories).toBe(2)
  })

  it('与 NEWS_TOPICS 常量一致（每分组 15 源）', () => {
    expect(NEWS_TOPICS.length).toBe(5)
    for (const t of NEWS_TOPICS) {
      expect(t.sources.length, `${t.label} 源数`).toBe(15)
    }
  })
})

describe('create-info-sources 迁移执行（存量 news_* 升级）', () => {
  it('旧表数据整体搬迁到 info_* 表，旧表消失', async () => {
    const legacy = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: [], synchronize: false })
    await legacy.initialize()
    try {
      await createLegacyNewsTables(legacy)
      // 用户自建分组 + 来源（升级必须一条不丢）
      await legacy.query(
        `INSERT INTO news_topics (id, user_id, name, is_builtin, created_at, updated_at)
         VALUES ('topic_u1', 'u1', '我的分组', 0, '2026-01-01', '2026-01-01')`,
      )
      await legacy.query(
        `INSERT INTO news_sources (id, user_id, topic_id, name, url, is_builtin, enabled, sort_order, created_at, updated_at)
         VALUES ('ns_u1', 'u1', 'topic_u1', '我的来源', 'https://mine.example.com', 0, 1, 0, '2026-01-01', '2026-01-01')`,
      )

      await createInfoSources(legacy)

      // 旧表已改名（不再存在）
      const legacyTables = (
        await legacy.query(`SELECT name FROM sqlite_master WHERE type='table' AND name IN ('news_topics','news_sources')`)
      ).map((r: any) => r.name)
      expect(legacyTables).toEqual([])
      // 用户数据搬到位，分组补上 category_id（回填内置新闻来源类别）与 is_default
      const topic = (await legacy.query(`SELECT * FROM info_source_topics WHERE id = 'topic_u1'`))[0]
      expect(topic.user_id).toBe('u1')
      expect(topic.name).toBe('我的分组')
      expect(topic.category_id).toBe(INFO_SOURCE_NEWS_CATEGORY_ID)
      expect(topic.is_default).toBe(0)
      const source = (await legacy.query(`SELECT * FROM info_sources WHERE id = 'ns_u1'`))[0]
      expect(source.name).toBe('我的来源')
      expect(source.url).toBe('https://mine.example.com')
      expect(source.topic_id).toBe('topic_u1')
      // 旧索引名清理（重建为 idx_info_sources_* / idx_info_source_topics_*）
      const staleIndexes = (
        await legacy.query(`SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_news%'`)
      ).map((r: any) => r.name)
      expect(staleIndexes).toEqual([])
      // 预置种子同时补齐（新闻 5 + 权威知识源 6）
      expect((await legacy.query(`SELECT count(*) c FROM info_source_topics WHERE is_builtin = 1`))[0].c).toBe(11)
      expect((await legacy.query(`SELECT count(*) c FROM info_sources WHERE is_builtin = 1`))[0].c).toBe(109)
    } finally {
      await legacy.destroy()
    }
  })

  it('存量升级后 schema 与实体一致（漂移检查通过 → 应用可正常启动）', async () => {
    // 文件库：迁移与漂移检查必须看到同一个库（:memory: 每个连接一份，跨连接看不见）
    const dir = mkdtempSync(join(tmpdir(), 'info-source-drift-'))
    const file = join(dir, 'legacy.db')
    try {
      const legacy = new DataSource({ type: 'better-sqlite3', database: file, entities: [], synchronize: false })
      await legacy.initialize()
      await createLegacyNewsTables(legacy)
      await legacy.query(
        `INSERT INTO news_topics (id, user_id, name, is_builtin, created_at, updated_at)
         VALUES ('topic_u1', 'u1', '我的分组', 0, '2026-01-01', '2026-01-01')`,
      )
      await createInfoSources(legacy)
      await legacy.destroy()

      // 真实实体元数据打开同一文件：三张 info_source_* 表的列/类型必须完全对齐
      const allEntities = Object.values(entities).filter(v => typeof v === 'function')
      const probe = new DataSource({
        type: 'better-sqlite3',
        database: file,
        entities: allEntities as never[],
        synchronize: false,
      })
      await probe.initialize()
      const report = await checkSchemaDrift(probe)
      await probe.destroy()
      expect(report.missingColumns).toEqual([])
      expect(report.typeMismatches).toEqual([])
      expect(report.ok).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('Web 端路径：synchronize 先建空表 → 迁移必须把存量 news_* 数据搬运过来', async () => {
    // web/server/index.ts 是「先 createDataSource + synchronize（按实体建表）再跑迁移」；
    // 此时 info_source_* 已存在且为空，而 news_topics / news_sources 是实体外的孤儿表
    // （synchronize 不删未知表，实测确认）——迁移若不搬运，用户自建分组/来源会变成孤儿。
    const dir = mkdtempSync(join(tmpdir(), 'info-source-web-sync-'))
    const file = join(dir, 'legacy.db')
    try {
      // 1) 旧库：旧命名表 + 用户自建分组/来源 + 一条旧来源指向内置分组
      const legacy = new DataSource({ type: 'better-sqlite3', database: file, entities: [], synchronize: false })
      await legacy.initialize()
      await createLegacyNewsTables(legacy)
      await legacy.query(
        `INSERT INTO news_topics (id, user_id, name, is_builtin, created_at, updated_at)
         VALUES ('topic_u1', 'u1', '我的分组', 0, '2026-01-01', '2026-01-01')`,
      )
      await legacy.query(
        `INSERT INTO news_sources (id, user_id, topic_id, name, url, is_builtin, enabled, sort_order, created_at, updated_at)
         VALUES ('ns_u1', 'u1', 'topic_u1', '我的来源', 'https://mine.example.com', 0, 1, 0, '2026-01-01', '2026-01-01')`,
      )
      await legacy.query(
        `INSERT INTO news_sources (id, user_id, topic_id, name, url, is_builtin, enabled, sort_order, created_at, updated_at)
         VALUES ('ns_u2', 'u1', 'ai', '归属内置分组的来源', 'https://mine2.example.com', 0, 0, 0, '2026-01-01', '2026-01-01')`,
      )
      await legacy.destroy()

      // 2) Web 启动路径：synchronize 按实体建出空的 info_source_* 表
      const webDs = await createDataSource({
        config: { type: 'sqlite', database: file },
        synchronizeOnInit: true,
      })
      const emptyBefore = (await webDs.query(`SELECT count(*) c FROM info_sources`))[0].c
      expect(Number(emptyBefore)).toBe(0)
      // synchronize 不动未知表：旧表仍在，数据还在
      expect((await webDs.query(`SELECT count(*) c FROM news_sources`))[0].c).toBe(2)

      // 3) 迁移：把存量搬运到新表（保留旧表，不删）
      await createInfoSources(webDs)
      const carriedTopic = (await webDs.query(`SELECT * FROM info_source_topics WHERE id = 'topic_u1'`))[0]
      expect(carriedTopic.name).toBe('我的分组')
      expect(carriedTopic.category_id).toBe(INFO_SOURCE_NEWS_CATEGORY_ID)
      const carriedSources = await webDs.query(`SELECT id, name, topic_id, enabled FROM info_sources WHERE id IN ('ns_u1','ns_u2') ORDER BY id`)
      expect(carriedSources.map((r: any) => r.id)).toEqual(['ns_u1', 'ns_u2'])
      expect(carriedSources[0].name).toBe('我的来源')
      expect(carriedSources[0].topic_id).toBe('topic_u1')
      expect(Number(carriedSources[1].enabled)).toBe(0) // 启停状态原样保留
      // 旧表保留（数据安全优先：不 drop、不清空）
      expect((await webDs.query(`SELECT count(*) c FROM news_sources`))[0].c).toBe(2)

      // 4) 幂等：再次跑不重复插入
      await createInfoSources(webDs)
      expect((await webDs.query(`SELECT count(*) c FROM info_sources WHERE id IN ('ns_u1','ns_u2')`))[0].c).toBe(2)
      await webDs.destroy()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
