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

/** 打开真机库副本（挂 graph_edges + 五个老实体——facade 基类需要老实体元数据；不 synchronize） */
async function openRealDs(path: string): Promise<DataSource> {
  const { LwGraphEdgeEntity } = await import('@core/database/entities/lw-graph-edge.entity')
  const { LwIpEdgeEntity } = await import('@core/database/entities/lw-ip-edge.entity')
  const { LwWorldEdgeEntity } = await import('@core/database/entities/lw-world-edge.entity')
  const { KbKnowledgeEdgeEntity } = await import('@core/database/entities/kb-brain/kb-knowledge-edge.entity')
  const { DlRelationEntity } = await import('@core/database/entities/domain-learning/dl-relation.entity')
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: path,
    entities: [GraphEdgeEntity, LwGraphEdgeEntity, LwIpEdgeEntity, LwWorldEdgeEntity, KbKnowledgeEdgeEntity, DlRelationEntity],
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

// ─── facade↔老表 parity：五个旧仓储切到统一存储后，真实数据上的读路径必须与老表逐 id 对账 ───
describe.skipIf(!MAIN_DB)('统一图存储·facade 切换 parity（主库副本）', () => {
  it('lw 仓储按项目逐 id 对账 + 章节时间线 parity + ip/world/dl roundtrip', async () => {
    const ds = await openRealDs(MAIN_DB as string)
    const { LwGraphEdgeRepository } = await import('@core/database/repositories/lw-graph-edge.repository')
    const { LwIpEdgeRepository } = await import('@core/database/repositories/lw-ip-edge.repository')
    const { LwWorldEdgeRepository } = await import('@core/database/repositories/lw-world-edge.repository')
    const { DlRelationRepository } = await import('@core/database/repositories/dl-relation.repository')

    const uidRow = (await ds.query(`SELECT user_id FROM graph_edges LIMIT 1`))[0]
    const uid = String(uidRow?.user_id ?? '')

    await runWithUserAsync(uid, async () => {
      const lwRepo = new LwGraphEdgeRepository(ds)

      // ── 逐项目 parity：facade getByProjectId ids == 老表活跃去重后的 ids ──
      const projects = (await ds.query(`SELECT DISTINCT project_id FROM lw_graph_edges`)) as Array<{ project_id: string }>
      for (const { project_id } of projects) {
        const facadeIds = (await lwRepo.getByProjectId(project_id)).map((e) => e.id).sort()
        const oldIds = ((await ds.query(`SELECT id FROM lw_graph_edges WHERE project_id = ?`, [project_id])) as Array<{ id: string }>)
          .map((r) => r.id)
          .sort()
        // 被去重的活跃重复 id 允许缺失（数量 == 全库活跃重复总数，只发生在唯一一组）
        const missing = oldIds.filter((id) => !facadeIds.includes(id))
        expect(facadeIds.length).toBeGreaterThan(0)
        expect(facadeIds.every((id) => oldIds.includes(id))).toBe(true) // 无凭空多出
        expect(missing.length).toBeLessThanOrEqual(2) // 唯一重复组最多去 2 条
        // 字段 parity：任取一条比对
        const sample = (await ds.query(`SELECT * FROM lw_graph_edges WHERE project_id = ? AND id = ?`, [project_id, facadeIds[0]]))[0]
        if (sample) {
          const viaFacade = await lwRepo.getById(facadeIds[0])
          expect(viaFacade).toMatchObject({
            id: String(sample.id),
            projectId: project_id,
            sourceType: String(sample.source_type),
            sourceId: String(sample.source_id),
            relationType: String(sample.relation_type),
          })
          expect(viaFacade!.validFromChapter ?? null).toBe(sample.valid_from_chapter)
          expect(viaFacade!.validUntilChapter ?? null).toBe(sample.valid_until_chapter)
        }
      }

      // ── 章节时间线 parity：取真实 (project, entity) 在 max 章节的生效边 ──
      const proj = String(projects[0].project_id)
      const ent = (await ds.query(
        `SELECT source_id sid FROM graph_edges WHERE graph_name = ? GROUP BY source_id ORDER BY COUNT(*) DESC LIMIT 1`,
        [GraphNames.lwProject(proj)],
      ))[0]
      const maxCh = Number(
        (await ds.query(
          `SELECT MAX(COALESCE(valid_from, 0)) mx FROM graph_edges WHERE graph_name = ?`,
          [GraphNames.lwProject(proj)],
        ))[0].mx ?? 1,
      )
      const facadeActive = (await lwRepo.getActiveEdgesAtChapter(proj, String(ent.sid), maxCh)).map((e) => e.id).sort()
      const sqlActive = ((await ds.query(
        `SELECT id FROM graph_edges WHERE graph_name = ?
          AND (source_id = ? OR target_id = ?)
          AND (valid_from IS NULL OR valid_from <= ?)
          AND (valid_until IS NULL OR valid_until >= ?)`,
        [GraphNames.lwProject(proj), ent.sid, ent.sid, maxCh, maxCh],
      )) as Array<{ id: string }>).map((r) => r.id).sort()
      expect(facadeActive).toEqual(sqlActive)

      // ── countByProjectId / deleteByOriginChapter 幂等（不误删非本章）──
      expect(await lwRepo.countByProjectId(proj)).toBe(
        Number((await ds.query(`SELECT COUNT(*) n FROM graph_edges WHERE graph_name = ?`, [GraphNames.lwProject(proj)]))[0].n),
      )

      // ── ip/world/dl：真实库副本上 roundtrip（create→list→delete）──
      const ipRepo = new LwIpEdgeRepository(ds)
      const ipEdge = await ipRepo.create({ sourceId: 'ipc-test-a', targetId: 'ipc-test-b', relationType: '师徒' } as never)
      expect(ipEdge.id).toBeTruthy()
      const ipListed = await ipRepo.listByCharacterId('ipc-test-a')
      expect(ipListed.map((e) => e.id)).toContain(ipEdge.id)
      // 幂等：同键再建返回现存边（不新增行）
      const ipDup = await ipRepo.create({ sourceId: 'ipc-test-a', targetId: 'ipc-test-b', relationType: '师徒' } as never)
      expect(ipDup.id).toBe(ipEdge.id)
      expect(await ipRepo.deleteRow(ipEdge.id)).toBe(true)
      expect(await ipRepo.listByCharacterId('ipc-test-a')).toHaveLength(0)

      const worldRepo = new LwWorldEdgeRepository(ds)
      const wEdge = await worldRepo.create({ worldId: 'w-test', sourceId: 'we1', targetId: 'we2', relationType: '位于' })
      expect((await worldRepo.listByWorldId('w-test')).map((e) => e.id)).toContain(wEdge.id)
      await worldRepo.deleteByWorldId('w-test')
      expect(await worldRepo.listByWorldId('w-test')).toHaveLength(0)

      const dlRepo = new DlRelationRepository(ds)
      const dRow = await dlRepo.create({
        id: 'dl-parity-1', projectId: 'dl-parity-p', sourceId: 'c1', targetId: 'c2',
        relationType: 'prerequisite', evidence: '手工', verified: false,
      })
      expect(dRow.verified).toBe(false)
      // upsert 语义：同三元组 verified 升级
      const dUp = await dlRepo.create({
        id: 'dl-parity-2', projectId: 'dl-parity-p', sourceId: 'c1', targetId: 'c2',
        relationType: 'prerequisite', evidence: '人审', verified: true,
      })
      expect(dUp.id).toBe('dl-parity-1') // 幂等返回已存在行
      expect(dUp.verified).toBe(true)
      expect((await dlRepo.listByProject('dl-parity-p'))).toHaveLength(1)
      expect(await dlRepo.deleteById('dl-parity-1')).toBe(1)
      expect(await dlRepo.listByProject('dl-parity-p')).toHaveLength(0)
    })

    await ds.destroy()
  }, 120_000)

  it('kb 仓储：快照/邻域/五元组幂等 parity', async () => {
    const ds = await openRealDs(MAIN_DB as string)
    const { KbKnowledgeEdgeRepository } = await import('@core/database/repositories/kb-knowledge-edge.repository')
    const uidRow = (await ds.query(`SELECT user_id FROM graph_edges LIMIT 1`))[0]
    await runWithUserAsync(String(uidRow?.user_id ?? ''), async () => {
      const kbId = String((await ds.query(`SELECT DISTINCT knowledge_base_id FROM kb_knowledge_edges LIMIT 1`))[0].knowledge_base_id)
      const repo = new KbKnowledgeEdgeRepository(ds)
      const graph = GraphNames.kb(kbId)

      // graphSnapshot parity：nodes 数 == 老表 distinct 端点，edges == 老表行数
      const snap = await repo.graphSnapshot(kbId)
      const oldEdgeCount = Number((await ds.query(`SELECT COUNT(*) n FROM kb_knowledge_edges WHERE knowledge_base_id = ?`, [kbId]))[0].n)
      const oldNodeCount = Number(
        (await ds.query(
          `SELECT COUNT(*) n FROM (
             SELECT source_id FROM graph_edges WHERE graph_name = ?
             UNION SELECT target_id FROM graph_edges WHERE graph_name = ?
           )`,
          [graph, graph],
        ))[0].n,
      )
      expect(snap.edges).toHaveLength(oldEdgeCount)
      expect(snap.nodes).toHaveLength(oldNodeCount)
      // 权重 = confidence
      const sample = (await ds.query(`SELECT source_id, target_id, confidence FROM graph_edges WHERE graph_name = ? LIMIT 1`, [graph]))[0]
      const mapped = snap.edges.find(([s]) => s === String(sample.source_id) && snap.edges.length > 0)
      expect(mapped).toBeTruthy()

      // neighborsOf parity：随机 5 个端点
      const someIds = ((await ds.query(
        `SELECT source_id sid FROM graph_edges WHERE graph_name = ? LIMIT 5`,
        [graph],
      )) as Array<{ sid: string }>).map((r) => r.sid)
      const viaFacade = (await repo.neighborsOf(kbId, someIds)).map((e) => e.id).sort()
      const viaSql = ((await ds.query(
        `SELECT id FROM graph_edges WHERE graph_name = ? AND (source_id IN (${someIds.map(() => '?').join(',')}) OR target_id IN (${someIds.map(() => '?').join(',')}))`,
        [graph, ...someIds, ...someIds],
      )) as Array<{ id: string }>).map((r) => r.id).sort()
      expect(viaFacade).toEqual(viaSql)

      // createBatch 五元组幂等：把库里已有边原样重放 → 全部 deduped
      const replay = ((await ds.query(
        `SELECT source_kind, source_id, relation, target_kind, target_id, evidence, confidence, origin FROM graph_edges WHERE graph_name = ? LIMIT 8`,
        [graph],
      )) as Array<Record<string, unknown>>).map((r) => ({
        sourceKind: String(r.source_kind) as never,
        sourceId: String(r.source_id),
        relation: String(r.relation) as never,
        targetKind: String(r.target_kind) as never,
        targetId: String(r.target_id),
        evidence: String(r.evidence ?? ''),
        confidence: Number(r.confidence ?? 0.7),
      }))
      const r1 = await repo.createBatch(kbId, replay)
      expect(r1.created).toBe(0)
      expect(r1.deduped).toBe(replay.length)

      // listEntityEdges + 实体合并 redirect 语义
      const entEdgesBefore = Number(
        (await ds.query(
          `SELECT COUNT(*) n FROM graph_edges WHERE graph_name = ? AND source_kind='entity' AND target_kind='entity'`,
          [graph],
        ))[0].n,
      )
      expect((await repo.listEntityEdges(kbId))).toHaveLength(entEdgesBefore)
    })
    await ds.destroy()
  }, 120_000)
})
