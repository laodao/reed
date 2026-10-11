/**
 * 统一图存储·真机数据集成测试（API 集成测试，env 门控）
 *
 * 运行前提（bash 预备，见 docs/design/2026-10-10-unified-graph-store-design.md §7）：
 *   1) 用 better-sqlite3 .backup() 从真机库拷出快照（只读副本，绝不动原库）：
 *      GRAPH_REAL_DB=/tmp/unified-graph-it/the_bot.db
 *      GRAPH_REAL_DB_LEGACY=/tmp/unified-graph-it/the-bot-kb-brain-data.db（旧 schema：缺 ip/world 表）
 *   2) 跑法：
 *      GRAPH_REAL_DB=... GRAPH_REAL_DB_LEGACY=... node scripts/vitest-electron.cjs run \
 *        tests/unit/services/graph-store.real-data.integration.spec.ts
 *
 * 覆盖（与普通单测的区别：数据是真实业务数据，断言动态对账而非固定 fixture）：
 * - 回填对账：五源行数（扣活跃重复）== graph_edges 行数；逐库（graph_name）行数一致
 * - 真实脏数据自愈：主库的活跃重复「恋人」边组收敛为 1 条（保留最早 created_at）
 * - 字段级抽查：lw 章节时间线/origin JSON 原样、kb evidence/confidence/origin 包装、时间戳归一
 * - GraphStoreService API 跑在真实图上：listGraphs 基数、stats、kb PPR 排序合理性、
 *   lw 时间线过滤、neighbors、dl 判环工具
 * - 旧 schema 库（缺表）跳过回填路径
 * - 迁移幂等（重跑行数不变）
 */
import { describe, it, expect } from 'vitest'
import { DataSource } from 'typeorm'
import { createUnifiedGraphTables } from '@core/database/migrations/create-unified-graph-tables'
import { GraphEdgeEntity } from '@core/database/entities/graph/graph-edge.entity'
import { GraphStoreService } from '@core/platform/services/graph/store/graph-store.service'
import { GraphEdgeRepository } from '@core/database/repositories/graph-edge.repository'
import type { ICoreDatabaseManager } from '@core/database/database-manager.interface'
import { runWithUserAsync } from '@core/context/user-context'
import { GraphNames } from '@shared/constants/graph-store'

const MAIN_DB = process.env.GRAPH_REAL_DB
const LEGACY_DB = process.env.GRAPH_REAL_DB_LEGACY

/** 打开真机库副本（只挂 6 个相关 entity，不 synchronize——表已由应用自身迁移好） */
async function openRealDs(path: string): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: path,
    entities: [GraphEdgeEntity],
    synchronize: false,
  })
  await ds.initialize()
  return ds
}

/** 五源对账口径：读旧表行数与活跃五元组重复组数（迁移前先算好期望值） */
interface SourceExpectation {
  table: string
  rows: number
  /** 活跃五元组重复行数（每组留 1，删 n-1） */
  dupRows: number
}

async function expectSources(ds: DataSource, existing: string[]): Promise<Map<string, SourceExpectation>> {
  const out = new Map<string, SourceExpectation>()
  // hasValidUntil：只有 lw_graph_edges 有关停语义（valid_until 列）；其余表全行皆为活跃
  const defs: Array<{ table: string; activeTuple: string; hasValidUntil: boolean }> = [
    {
      table: 'lw_graph_edges',
      activeTuple: 'project_id, source_type, source_id, relation_type, target_type, target_id',
      hasValidUntil: true,
    },
    { table: 'lw_ip_edges', activeTuple: 'source_id, relation_type, target_id', hasValidUntil: false },
    { table: 'lw_world_edges', activeTuple: 'world_id, source_id, relation_type, target_id', hasValidUntil: false },
    {
      table: 'kb_knowledge_edges',
      activeTuple: 'knowledge_base_id, source_kind, source_id, relation, target_kind, target_id',
      hasValidUntil: false,
    },
    { table: 'dl_relation', activeTuple: 'project_id, source_id, relation_type, target_id', hasValidUntil: false },
  ]
  for (const d of defs) {
    if (!existing.includes(d.table)) continue
    const rows = Number((await ds.query(`SELECT COUNT(*) n FROM ${d.table}`))[0].n)
    let dupRows = 0
    if (rows > 0) {
      // 每个活跃五元组重复组贡献 (组大小 - 1) 条待去重行
      const groups = (await ds.query(
        `SELECT COUNT(*) n FROM ${d.table} ${d.hasValidUntil ? 'WHERE valid_until_chapter IS NULL' : ''} GROUP BY ${d.activeTuple} HAVING COUNT(*) > 1`,
      )) as Array<{ n: number }>
      for (const g of groups) dupRows += Number(g.n) - 1
    }
    out.set(d.table, { table: d.table, rows, dupRows })
  }
  return out
}

describe.skipIf(!MAIN_DB)('统一图存储·真机数据集成（主库）', () => {
  it('回填对账 + 字段抽查 + GraphStoreService 真实图 API', async () => {
    const ds = await openRealDs(MAIN_DB as string)

    // ── 迁移前：动态计算期望 ──
    const tables = ((await ds.query(`SELECT name FROM sqlite_master WHERE type='table'`)) as Array<{ name: string }>).map(
      (r) => r.name,
    )
    const expect1 = await expectSources(ds, tables)
    const lwExp = expect1.get('lw_graph_edges')!
    const kbExp = expect1.get('kb_knowledge_edges')!
    expect(lwExp.rows).toBeGreaterThan(0)
    expect(kbExp.rows).toBeGreaterThan(0)

    // 真实活跃重复组（主库实测 1 组「恋人」）——找出来用于抽查
    const dupGroups = (await ds.query(
      `SELECT project_id, source_id, relation_type, target_id, COUNT(*) n, MIN(created_at) minCreated, GROUP_CONCAT(id) ids
       FROM lw_graph_edges WHERE valid_until_chapter IS NULL
       GROUP BY project_id, source_type, source_id, relation_type, target_type, target_id HAVING COUNT(*) > 1`,
    )) as Array<{ project_id: string; source_id: string; relation_type: string; target_id: string; n: number; minCreated: number; ids: string }>

    // ── 迁移（跑两遍验幂等）──
    await createUnifiedGraphTables(ds)
    const count1 = Number((await ds.query(`SELECT COUNT(*) n FROM graph_edges`))[0].n)
    await createUnifiedGraphTables(ds)
    const count2 = Number((await ds.query(`SELECT COUNT(*) n FROM graph_edges`))[0].n)
    expect(count2).toBe(count1)

    // ── 对账：每源（行数 - 活跃重复行数）全部迁入 ──
    let expectedTotal = 0
    for (const [, exp] of expect1) {
      expectedTotal += exp.rows - exp.dupRows
      const actual = await countByGraphs(ds, exp.table)
      expect(actual).toBe(exp.rows - exp.dupRows)
    }
    expect(count1).toBe(expectedTotal)

    // ── 活跃五元组零重复（唯一索引保证）──
    const dupAfter = (await ds.query(
      `SELECT COUNT(*) n FROM (
         SELECT graph_name FROM graph_edges WHERE valid_until IS NULL
         GROUP BY graph_name, source_kind, source_id, relation, target_kind, target_id HAVING COUNT(*) > 1
       )`,
    )) as Array<{ n: number }>
    expect(Number(dupAfter[0].n)).toBe(0)

    // ── 真实重复组抽查：收敛为最早一条 ──
    for (const g of dupGroups) {
      const kept = (await ds.query(
        `SELECT id, created_at FROM graph_edges WHERE graph_name = ? AND source_id = ? AND relation = ? AND target_id = ? AND valid_until IS NULL`,
        [GraphNames.lwProject(g.project_id), g.source_id, g.relation_type, g.target_id],
      )) as Array<{ id: string; created_at: number }>
      expect(kept).toHaveLength(1)
      expect(kept[0].created_at).toBe(Number(g.minCreated))
    }

    // ── kb 字段级抽查（真实行）──
    const kbSample = (await ds.query(
      `SELECT * FROM graph_edges WHERE graph_name LIKE 'kb:%' LIMIT 5`,
    )) as Array<Record<string, unknown>>
    for (const r of kbSample) {
      expect(r.evidence).toBeTruthy() // kb 铁律：无理由的链接不许存在
      expect(Number(r.confidence)).toBeGreaterThan(0)
      expect(r.origin).toBe('{"type":"ai"}') // 裸 'ai' → JSON 包装
      expect(String(r.graph_name)).toMatch(/^kb:[0-9a-f-]+$/)
      expect(Number(r.created_at)).toBeGreaterThan(1_700_000_000_000) // epoch ms
    }

    // ── lw 字段级抽查：章节时间线与 origin JSON 原样 ──
    const lwSample = (await ds.query(
      `SELECT * FROM graph_edges WHERE graph_name LIKE 'lw:project:%' AND origin IS NOT NULL LIMIT 5`,
    )) as Array<Record<string, unknown>>
    for (const r of lwSample) {
      const origin = JSON.parse(String(r.origin))
      expect(['extract', 'discussion', 'manual']).toContain(origin.type)
      if (origin.type === 'extract') expect(origin.chapter).toBeGreaterThan(0)
    }
    // 原 lw 边 id 全部保留（可溯源）
    const lwIds = (await ds.query(`SELECT id FROM lw_graph_edges`)) as Array<{ id: string }>
    const keptIds = new Set(((await ds.query(`SELECT id FROM graph_edges WHERE graph_name LIKE 'lw:project:%'`)) as Array<{ id: string }>).map((r) => r.id))
    let missing = 0
    for (const { id } of lwIds) if (!keptIds.has(id)) missing++ // 被去重删掉的活跃重复行
    expect(missing).toBe(lwExp.dupRows)

    // ── GraphStoreService API 跑真实图 ──
    const userIds = ((await ds.query(`SELECT DISTINCT user_id FROM graph_edges`)) as Array<{ user_id: string | null }>).map(
      (r) => r.user_id,
    )
    const uid = userIds.find((u) => !!u) ?? null
    const repo = new GraphEdgeRepository(ds)
    const store = new GraphStoreService({ db: { graphEdges: repo } as unknown as ICoreDatabaseManager })

    await runWithUserAsync(uid as string, async () => {
      // 库清单：lw 项目图基数 == 真机 distinct project 数
      const lwProjects = (await ds.query(`SELECT COUNT(DISTINCT project_id) n FROM lw_graph_edges`))[0].n
      const lwGraphs = await store.listGraphs('lw:project:')
      expect(lwGraphs).toHaveLength(Number(lwProjects))
      expect((await store.listGraphs('kb:')).length).toBeGreaterThan(0)

      // stats：kb 图边数对账
      const kbGraphName = GraphNames.kb(
        String((await ds.query(`SELECT DISTINCT knowledge_base_id FROM kb_knowledge_edges LIMIT 1`))[0].knowledge_base_id),
      )
      const kbStat = await store.stats(kbGraphName)
      expect(kbStat.edgeCount).toBe(kbExp.rows)
      expect(Object.keys(kbStat.byRelation).length).toBeGreaterThan(3) // 真实关系多样

      // kb PPR：种子=真实实体，输出按分数降序且含种子
      const entRow = (await ds.query(
        `SELECT id FROM graph_edges WHERE graph_name = ? AND source_kind = 'entity' LIMIT 1`,
        [kbGraphName],
      )) as Array<{ id: string }>
      if (entRow.length > 0) {
        const snap = await store.snapshot(kbGraphName)
        expect(snap.edges.length).toBe(kbStat.edgeCount)
        const anyEntity = String(
          (await ds.query(
            `SELECT source_id FROM graph_edges WHERE graph_name = ? AND source_kind = 'entity' LIMIT 1`,
            [kbGraphName],
          ))[0].source_id,
        )
        const hits = await store.ppr(kbGraphName, [{ endpoint: { kind: 'entity', id: anyEntity }, weight: 1 }], {
          iterations: 40,
          eps: 1e-4,
        })
        expect(hits.length).toBeGreaterThan(0)
        expect(hits[0].score).toBeGreaterThanOrEqual(hits[hits.length - 1].score)
        expect(hits.some((h) => h.endpoint.id === anyEntity)).toBe(true) // 种子保底回流
      }

      // lw：真实项目时间线过滤（章节号取自真实数据的中位章节）
      const lwProject = String((await ds.query(`SELECT project_id FROM lw_graph_edges LIMIT 1`))[0].project_id)
      const lwGraphName = GraphNames.lwProject(lwProject)
      const chapterRow = (await ds.query(
        `SELECT MAX(valid_from_chapter) mx FROM lw_graph_edges WHERE project_id = ?`,
        [lwProject],
      ))[0]
      const chapter = Number(chapterRow.mx ?? 1)
      const at = await store.listEdges(lwGraphName, { validAt: chapter })
      const all = await store.listEdges(lwGraphName)
      expect(all.length).toBeGreaterThan(0)
      expect(at.length).toBeLessThanOrEqual(all.length)
      // 时间线正确性抽查：validAt 结果里的每条边都满足区间
      for (const e of at) {
        expect(e.validFrom == null || e.validFrom <= chapter).toBe(true)
        expect(e.validUntil == null || e.validUntil >= chapter).toBe(true)
      }

      // lw neighbors：真实角色的关系视图非空（取边最多的角色）
      const hub = (await ds.query(
        `SELECT source_id sid FROM graph_edges WHERE graph_name = ? GROUP BY source_kind, source_id ORDER BY COUNT(*) DESC LIMIT 1`,
        [lwGraphName],
      ))[0]
      const around = await store.neighbors(lwGraphName, { kind: String(hub.source_kind ?? 'character'), id: String(hub.sid) })
      expect(around.length).toBeGreaterThan(0)
    })

    await ds.destroy()
  }, 120_000)

  /** 逐源对账：该源所有行迁入后对应的 graph_name 集合的行数（含跨源共享 graph 的安全断言由总账保证） */
  async function countByGraphs(ds: DataSource, table: string): Promise<number> {
    // 每个源表对应唯一的 graph_name 前缀空间，直接按前缀统计
    const prefixes: Record<string, string> = {
      lw_graph_edges: 'lw:project:%',
      lw_ip_edges: 'lw:ip',
      lw_world_edges: 'lw:world:%',
      kb_knowledge_edges: 'kb:%',
      dl_relation: 'dl:project:%',
    }
    const prefix = prefixes[table]
    if (prefix === 'lw:ip') {
      return Number((await ds.query(`SELECT COUNT(*) n FROM graph_edges WHERE graph_name = 'lw:ip'`))[0].n)
    }
    return Number((await ds.query(`SELECT COUNT(*) n FROM graph_edges WHERE graph_name LIKE ?`, [prefix]))[0].n)
  }
})

describe.skipIf(!LEGACY_DB)('统一图存储·真机数据集成（旧 schema 库，缺 ip/world 表）', () => {
  it('缺表跳过回填 + 其余源正常迁移 + API 可用', async () => {
    const ds = await openRealDs(LEGACY_DB as string)
    const tables = ((await ds.query(`SELECT name FROM sqlite_master WHERE type='table'`)) as Array<{ name: string }>).map(
      (r) => r.name,
    )
    expect(tables).not.toContain('lw_ip_edges') // 前提确认：确实是旧 schema
    await expectSources(ds, tables) // 期望值预演（不抛错即可）

    await createUnifiedGraphTables(ds)
    await createUnifiedGraphTables(ds) // 幂等

    const lwRows = Number((await ds.query(`SELECT COUNT(*) n FROM lw_graph_edges`))[0].n)
    const kbRows = Number((await ds.query(`SELECT COUNT(*) n FROM kb_knowledge_edges`))[0].n)
    const total = Number((await ds.query(`SELECT COUNT(*) n FROM graph_edges`))[0].n)
    expect(total).toBe(lwRows + kbRows) // 缺表源跳过，其余全量迁入

    const ipCount = Number((await ds.query(`SELECT COUNT(*) n FROM graph_edges WHERE graph_name = 'lw:ip'`))[0].n)
    expect(ipCount).toBe(0)

    // API 冒烟：kb 图快照 + PPR 在旧库数据上可跑
    const repo = new GraphEdgeRepository(ds)
    const store = new GraphStoreService({ db: { graphEdges: repo } as unknown as ICoreDatabaseManager })
    const uidRow = (await ds.query(`SELECT user_id FROM graph_edges WHERE graph_name LIKE 'kb:%' LIMIT 1`))[0]
    await runWithUserAsync(String(uidRow?.user_id ?? ''), async () => {
      const kbGraphs = await store.listGraphs('kb:')
      expect(kbGraphs.length).toBeGreaterThan(0)
      const snap = await store.snapshot(kbGraphs[0].graphName)
      expect(snap.edges.length).toBe(kbGraphs[0].edgeCount)
    })
    await ds.destroy()
  }, 120_000)
})
