/**
 * createUnifiedGraphTables 迁移测试
 * 覆盖：建表幂等、部分唯一索引、五源回填映射（含去重/时间线/origin 包装/常量 kind）、
 *       缺表容忍、幂等重跑、增量回填、唯一索引约束行为。
 * 方言：sqlite 裸 SQL 造旧表（与 create-lw-graph-tables.spec 同模式）+ PG 独立 database
 *       回填用例（bigint/timestamp 归一）。双方言 CRUD/场景由仓储与 store 服务 spec 覆盖。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { DataSource } from 'typeorm'
import { createUnifiedGraphTables } from '@core/database/migrations/create-unified-graph-tables'
import { GraphEdgeEntity } from '@core/database/entities/graph/graph-edge.entity'
import { GraphNames } from '@shared/constants/graph-store'

async function buildDs(log = false): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [GraphEdgeEntity],
    synchronize: false,
    logging: log,
  })
  await ds.initialize()
  return ds
}

/** 造旧表（形态按 2026-10-10 真机库实测：lw created_at bigint、kb created_at datetime 文本） */
async function seedLegacyTables(ds: DataSource, which: Set<string>): Promise<void> {
  if (which.has('lw_graph_edges')) {
    await ds.query(`CREATE TABLE lw_graph_edges (
      id TEXT PRIMARY KEY, user_id TEXT, project_id TEXT NOT NULL,
      source_type TEXT NOT NULL, source_id TEXT NOT NULL,
      target_type TEXT NOT NULL, target_id TEXT NOT NULL,
      relation_type TEXT NOT NULL, label TEXT, valid_from_chapter INTEGER, valid_until_chapter INTEGER,
      description TEXT, origin TEXT, created_at INTEGER, updated_at INTEGER)`)
  }
  if (which.has('lw_ip_edges')) {
    await ds.query(`CREATE TABLE lw_ip_edges (
      id TEXT PRIMARY KEY, user_id TEXT, source_id TEXT NOT NULL, target_id TEXT NOT NULL,
      relation_type TEXT NOT NULL, label TEXT, description TEXT, created_at INTEGER)`)
  }
  if (which.has('lw_world_edges')) {
    await ds.query(`CREATE TABLE lw_world_edges (
      id TEXT PRIMARY KEY, user_id TEXT, world_id TEXT NOT NULL,
      source_id TEXT NOT NULL, target_id TEXT NOT NULL,
      relation_type TEXT NOT NULL, label TEXT, origin TEXT, created_at INTEGER)`)
  }
  if (which.has('kb_knowledge_edges')) {
    await ds.query(`CREATE TABLE kb_knowledge_edges (
      id TEXT PRIMARY KEY, user_id TEXT, knowledge_base_id TEXT NOT NULL,
      source_kind TEXT NOT NULL, source_id TEXT NOT NULL, relation TEXT NOT NULL,
      target_kind TEXT NOT NULL, target_id TEXT NOT NULL,
      evidence TEXT NOT NULL, confidence REAL DEFAULT 0.7, origin varchar DEFAULT 'ai',
      verified INTEGER DEFAULT 0, created_at DATETIME)`)
  }
  if (which.has('dl_relation')) {
    await ds.query(`CREATE TABLE dl_relation (
      id TEXT PRIMARY KEY, user_id TEXT, project_id TEXT NOT NULL,
      source_id TEXT NOT NULL, target_id TEXT NOT NULL, relation_type TEXT NOT NULL,
      evidence TEXT, verified INTEGER DEFAULT 0, created_at DATETIME)`)
  }
}

const ALL_TABLES = new Set(['lw_graph_edges', 'lw_ip_edges', 'lw_world_edges', 'kb_knowledge_edges', 'dl_relation'])

describe('createUnifiedGraphTables 迁移', () => {
  it('新库建表 + 索引 + 部分唯一索引，重跑幂等', async () => {
    const ds = await buildDs()
    await createUnifiedGraphTables(ds)
    await createUnifiedGraphTables(ds) // 幂等重跑

    const tables = (await ds.query(`SELECT name FROM sqlite_master WHERE type='table'`)).map((r: any) => r.name)
    expect(tables).toContain('graph_edges')
    const indexes = (await ds.query(`SELECT name FROM sqlite_master WHERE type='index' AND name LIKE '%graph%'`)).map(
      (r: any) => r.name,
    )
    expect(indexes).toEqual(
      expect.arrayContaining([
        'idx_graph_edges_name',
        'idx_graph_edges_src',
        'idx_graph_edges_tgt',
        'idx_graph_edges_rel',
        'uq_graph_edges_active',
      ]),
    )
    expect(Number((await ds.query(`SELECT COUNT(*) n FROM graph_edges`))[0].n)).toBe(0)
    await ds.destroy()
  })

  it('部分唯一索引：活跃边五元组撞索引被拒；关停边（valid_until 非空）不占键，关停后可重建', async () => {
    const ds = await buildDs()
    await createUnifiedGraphTables(ds)
    let seq = 0
    const ins = (validUntil: number | null) =>
      ds
        .createQueryBuilder()
        .insert()
        .into(GraphEdgeEntity)
        .values({
          id: `e${seq++}`, // id 各不相同——撞的只能是部分唯一索引，不是主键
          userId: null,
          graphName: 'g1',
          sourceKind: 'character',
          sourceId: 'c1',
          targetKind: 'character',
          targetId: 'c2',
          relation: '师徒',
          label: null,
          description: null,
          evidence: null,
          confidence: null,
          verified: 0,
          origin: null,
          validFrom: 1,
          validUntil,
          props: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
        .orIgnore(true)
        .execute()

    await ins(null)
    // 同五元组第二条活跃边：orIgnore 静默忽略（部分唯一索引生效，非主键冲突）
    await ins(null)
    expect(Number((await ds.query(`SELECT COUNT(*) n FROM graph_edges`))[0].n)).toBe(1)
    // 关停边同五元组可以存在（lw 关停后重建语义）
    await ins(5)
    expect(Number((await ds.query(`SELECT COUNT(*) n FROM graph_edges`))[0].n)).toBe(2)
    // 首条边仍活跃 → 同键活跃边仍被拒
    await ins(null)
    expect(Number((await ds.query(`SELECT COUNT(*) n FROM graph_edges`))[0].n)).toBe(2)
    // 首条边关停后活跃键空出 → 重建可入（完整复刻 lw 时间线语义）
    await ds.query(`UPDATE graph_edges SET valid_until = 9 WHERE id = 'e0'`)
    await ins(null)
    expect(Number((await ds.query(`SELECT COUNT(*) n FROM graph_edges`))[0].n)).toBe(3)
    await ds.destroy()
  })

  it('五源回填：映射/去重/时间线/origin 包装/常量 kind 全对，重跑不重复', async () => {
    const ds = await buildDs()
    await seedLegacyTables(ds, ALL_TABLES)

    // lw：3 条边，其中 2 条是活跃重复五元组（恋人，保留最早），1 条已关停 + 1 条同键重建
    await ds.query(`INSERT INTO lw_graph_edges VALUES
      ('lw1', NULL, 'p1', 'character', 'c1', 'character', 'c2', '恋人', NULL, 1, NULL, NULL, '{"type":"extract","chapter":1}', 1000, 1000),
      ('lw2', 'u9', 'p1', 'character', 'c1', 'character', 'c2', '恋人', NULL, 6, NULL, NULL, '{"type":"extract","chapter":6}', 2000, 2000),
      ('lw3', NULL, 'p1', 'character', 'c1', 'character', 'c2', '敌对', '反目', 8, NULL, NULL, NULL, 3000, 3000),
      ('lw4', NULL, 'p1', 'character', 'c1', 'character', 'c2', '恋人', NULL, 10, NULL, NULL, '{"type":"manual"}', 4000, 4000),
      ('lw5', NULL, 'p2', 'faction', 'f1', 'location', 'l1', 'involves', NULL, NULL, NULL, NULL, NULL, 5000, 5000)`)
    // ip 库
    await ds.query(`INSERT INTO lw_ip_edges VALUES ('ip1', NULL, 'ipc1', 'ipc2', '师徒', NULL, NULL, 100)`)
    // 世界观库
    await ds.query(`INSERT INTO lw_world_edges VALUES ('w1', NULL, 'world1', 'e1', 'e2', '位于', NULL, '{"type":"manual"}', 100)`)
    // kb：datetime 文本 created_at、origin 裸标量
    await ds.query(`INSERT INTO kb_knowledge_edges VALUES
      ('k1', 'u9', 'kb1', 'entity', 'ent1', 'enemy-of', 'entity', 'ent2', '因为决斗', 0.9, 'ai', 0, '2026-10-07 07:17:14.826')`)
    // dl：Date 形态
    await ds.query(`INSERT INTO dl_relation VALUES
      ('d1', NULL, 'dp1', 'con1', 'con2', 'prerequisite', '用户手工建立', 1, '2026-10-08 10:00:00.000')`)

    await createUnifiedGraphTables(ds)
    await createUnifiedGraphTables(ds) // 幂等重跑

    const all = await ds.query(`SELECT * FROM graph_edges ORDER BY id`)
    // lw 活跃重复组收敛：lw1(最早) 保留，lw2 去掉；lw4 是同键重建（lw1 仍活跃？不——lw1 valid_until NULL，lw4 也活跃同键 → 也去重）
    // 口径：活跃五元组只保留最早一条 → lw1 活跃占键，lw4 被去重；lw3/lw5 独立
    expect(all.map((r: any) => r.id).filter((id: string) => id.startsWith('lw'))).toEqual(['lw1', 'lw3', 'lw5'])
    expect(all).toHaveLength(3 + 1 + 1 + 1 + 1) // lw3 + ip1 + w1 + k1 + d1 + (lw1/lw5)

    // lw 映射细节：graph 名、kind、时间线、origin 原样、user_id 保留
    const lw1 = all.find((r: any) => r.id === 'lw1')
    expect(lw1).toMatchObject({
      graph_name: GraphNames.lwProject('p1'),
      source_kind: 'character',
      target_kind: 'character',
      relation: '恋人',
      valid_from: 1,
      valid_until: null,
      origin: '{"type":"extract","chapter":1}',
      user_id: null,
      created_at: 1000,
    })
    // lw 关停边（lw3 无关停，但重建条 lw4 被去重——关停+重建组合在下一用例）
    // ip / world 常量 kind
    expect(all.find((r: any) => r.id === 'ip1')).toMatchObject({
      graph_name: 'lw:ip',
      source_kind: 'ip_character',
      target_kind: 'ip_character',
      relation: '师徒',
    })
    expect(all.find((r: any) => r.id === 'w1')).toMatchObject({
      graph_name: GraphNames.lwWorld('world1'),
      source_kind: 'world_entry',
      origin: '{"type":"manual"}',
    })
    // kb：origin 包装、evidence/confidence/verified、datetime → epoch ms
    const k1 = all.find((r: any) => r.id === 'k1')
    expect(k1).toMatchObject({
      graph_name: GraphNames.kb('kb1'),
      source_kind: 'entity',
      relation: 'enemy-of',
      evidence: '因为决斗',
      confidence: 0.9,
      verified: 0,
      origin: '{"type":"ai"}',
      user_id: 'u9',
    })
    expect(k1.created_at).toBe(Date.parse('2026-10-07T07:17:14.826'))
    // dl：kind=concept、verified=1
    expect(all.find((r: any) => r.id === 'd1')).toMatchObject({
      graph_name: GraphNames.dlProject('dp1'),
      source_kind: 'concept',
      relation: 'prerequisite',
      verified: 1,
    })

    // 增量回填：旧表新增一行，重跑只迁新行
    await ds.query(`INSERT INTO lw_graph_edges VALUES
      ('lw6', NULL, 'p2', 'item', 'i1', 'item', 'i2', '克制', NULL, NULL, NULL, NULL, NULL, 6000, 6000)`)
    await createUnifiedGraphTables(ds)
    const again = await ds.query(`SELECT COUNT(*) n FROM graph_edges`)
    expect(Number(again[0].n)).toBe(all.length + 1)
    await ds.destroy()
  })

  it('lw 关停后重建：关停边不占活跃键，重建边可迁入', async () => {
    const ds = await buildDs()
    await seedLegacyTables(ds, new Set(['lw_graph_edges']))
    await ds.query(`INSERT INTO lw_graph_edges VALUES
      ('old1', NULL, 'p1', 'character', 'ca', 'character', 'cb', '师徒', NULL, 1, 5, NULL, NULL, 100, 100),
      ('new1', NULL, 'p1', 'character', 'ca', 'character', 'cb', '师徒', NULL, 10, NULL, NULL, NULL, 200, 200)`)
    await createUnifiedGraphTables(ds)
    const rows = await ds.query(`SELECT id FROM graph_edges ORDER BY id`)
    expect(rows.map((r: any) => r.id)).toEqual(['new1', 'old1']) // 两条都保留：old1 已关停不占活跃键
    await ds.destroy()
  })

  it('缺表容忍：旧库没有 ip/world/dl 表时跳过不报错（真机 the-bot-kb-brain-data 形态）', async () => {
    const ds = await buildDs()
    await seedLegacyTables(ds, new Set(['lw_graph_edges', 'kb_knowledge_edges']))
    await ds.query(`INSERT INTO lw_graph_edges VALUES
      ('lw1', NULL, 'p1', 'character', 'c1', 'character', 'c2', '盟友', NULL, NULL, NULL, NULL, NULL, 100, 100)`)
    await ds.query(`INSERT INTO kb_knowledge_edges VALUES
      ('k1', NULL, 'kb1', 'atom', 'a1', 'leads-to', 'atom', 'a2', '前后相续', 0.7, 'ai', 0, '2026-10-01 00:00:00.000')`)

    await createUnifiedGraphTables(ds)
    const rows = await ds.query(`SELECT graph_name FROM graph_edges`)
    expect(rows).toHaveLength(2)
    expect(rows.map((r: any) => r.graph_name).sort()).toEqual([GraphNames.kb('kb1'), GraphNames.lwProject('p1')].sort())
    await ds.destroy()
  })

  it('干净库直接跑（新装路径）', async () => {
    const ds = await buildDs()
    await createUnifiedGraphTables(ds)
    expect(Number((await ds.query(`SELECT COUNT(*) n FROM graph_edges`))[0].n)).toBe(0)
    await ds.destroy()
  })
})

// ─── PG 方言回填（bigint→string / timestamp→Date 的归一路径；sqlite 用例不覆盖）───
// 用独立 database + 默认 schema 复刻真实部署形态：createTestDataSource 的 per-test schema
// 绑定对裸 SQL（迁移内部的 SELECT/CREATE）不生效，混用会错位到 public。
describe.runIf(!process.env.SKIP_PG_TESTS)('createUnifiedGraphTables 迁移·PG 方言回填', () => {
  const DB = 'the_bot_unigraph_test'
  let admin: DataSource
  let ds: DataSource

  beforeAll(async () => {
    admin = new DataSource({
      type: 'postgres',
      host: process.env.PGHOST ?? 'localhost',
      port: Number(process.env.PGPORT ?? 5437),
      username: process.env.PGUSER ?? 'postgres',
      password: process.env.PGPASSWORD ?? 'postgres',
      database: 'postgres',
    })
    await admin.initialize()
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`)
    await admin.query(`CREATE DATABASE ${DB}`)
    await admin.destroy()

    ds = new DataSource({
      type: 'postgres',
      host: process.env.PGHOST ?? 'localhost',
      port: Number(process.env.PGPORT ?? 5437),
      username: process.env.PGUSER ?? 'postgres',
      password: process.env.PGPASSWORD ?? 'postgres',
      database: DB,
      entities: [GraphEdgeEntity],
      synchronize: false,
    })
    await ds.initialize()
    // PG 形态造旧表（bigint / timestamp；与真机库同构）
    await ds.query(`CREATE TABLE lw_graph_edges (
      id varchar PRIMARY KEY, user_id varchar, project_id varchar NOT NULL,
      source_type varchar NOT NULL, source_id varchar NOT NULL,
      target_type varchar NOT NULL, target_id varchar NOT NULL,
      relation_type varchar NOT NULL, label text, valid_from_chapter integer, valid_until_chapter integer,
      description text, origin text, created_at bigint, updated_at bigint)`)
    await ds.query(`CREATE TABLE kb_knowledge_edges (
      id varchar PRIMARY KEY, user_id varchar, knowledge_base_id varchar NOT NULL,
      source_kind varchar NOT NULL, source_id varchar NOT NULL, relation varchar NOT NULL,
      target_kind varchar NOT NULL, target_id varchar NOT NULL,
      evidence text NOT NULL, confidence real DEFAULT 0.7, origin varchar DEFAULT 'ai',
      verified integer DEFAULT 0, created_at timestamp)`)
  })

  afterAll(async () => {
    await ds.destroy()
    admin = new DataSource({
      type: 'postgres',
      host: process.env.PGHOST ?? 'localhost',
      port: Number(process.env.PGPORT ?? 5437),
      username: process.env.PGUSER ?? 'postgres',
      password: process.env.PGPASSWORD ?? 'postgres',
      database: 'postgres',
    })
    await admin.initialize()
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`)
    await admin.destroy()
  })

  it('lw（bigint created_at）+ kb（timestamp created_at）回填映射正确，重跑幂等', async () => {
    await ds.query(
      `INSERT INTO lw_graph_edges VALUES
       ('lwp1', 'pg-user', 'pp1', 'character', 'c1', 'character', 'c2', '敌对', NULL, 1, 5, NULL, '{"type":"extract","chapter":1}', 1000, 1000),
       ('lwp2', 'pg-user', 'pp1', 'character', 'c1', 'character', 'c2', '敌对', NULL, 8, NULL, NULL, NULL, 2000, 2000)`,
    )
    await ds.query(
      `INSERT INTO kb_knowledge_edges VALUES
       ('kbp1', 'pg-user', 'kbpg1', 'entity', 'e1', 'allied-with', 'entity', 'e2', '结盟', 0.8, 'ai', 1, '2026-10-07 07:17:14.826')`,
    )

    await createUnifiedGraphTables(ds)
    await createUnifiedGraphTables(ds) // 幂等

    const rows = (await ds.query(`SELECT * FROM graph_edges ORDER BY id`)) as Array<Record<string, unknown>>
    expect(rows).toHaveLength(3) // lwp1 关停保留 + lwp2 重建 + kbp1
    const lw = rows.find((r) => r.id === 'lwp2') as Record<string, unknown>
    expect(lw.graph_name).toBe(GraphNames.lwProject('pp1'))
    expect(lw.valid_from).toBe(8)
    expect(lw.valid_until).toBeNull()
    expect(Number(lw.created_at)).toBe(2000) // PG bigint → string → Number
    const kb = rows.find((r) => r.id === 'kbp1') as Record<string, unknown>
    expect(kb).toMatchObject({
      graph_name: GraphNames.kb('kbpg1'),
      relation: 'allied-with',
      evidence: '结盟',
      verified: 1,
      origin: '{"type":"ai"}',
    })
    expect(Number(kb.created_at)).toBe(Date.parse('2026-10-07T07:17:14.826')) // timestamp → Date → epoch ms
  }, 60_000)
})
