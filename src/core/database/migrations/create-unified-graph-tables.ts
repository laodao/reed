/**
 * 统一图存储迁移（docs/design/2026-10-10-unified-graph-store-design.md §7）
 * @module core/database/migrations/create-unified-graph-tables
 *
 * 1. 建表 graph_edges（幂等，双语种）+ 4 个普通索引
 * 2. TS 读-写回填五套存量图边（lw_graph_edges / lw_ip_edges / lw_world_edges /
 *    kb_knowledge_edges / dl_relation → graph_name 命名空间），保留原 id 与 user_id
 *    —— 用 TS 而非 INSERT…SELECT：kb/dl created_at 是 datetime（要转 epoch ms）、
 *    kb origin 要包 JSON、dl/ip/world 要补常量 kind，SQL 跨方言写又脆又难测
 * 3. 去重先行：活跃边（valid_until IS NULL）五元组重复保留 created_at 最早一条
 *    （实测主库存在 1 组重复「恋人」边；lw 关停边不占键，可关停后重建）
 * 4. 建部分唯一索引 uq_graph_edges_active（TypeORM @Index 不支持 WHERE，只能 SQL 建）
 * 5. 对账日志（WARN 不 fail，不阻塞启动）
 *
 * 幂等：回填先取 graph_edges 已有 id 集合跳过已迁移行，且 insert 带 orIgnore 兜底；
 * 老库缺某张源表（如未开设定资产库的库没有 lw_ip_edges/lw_world_edges）跳过并记日志。
 * 必须挂在全部 5 个源表迁移之后（两端 index 文件的 addLwProjectCoverPath 之后）。
 */

import type { DataSource } from 'typeorm'
import { GraphEdgeEntity } from '../entities/graph/graph-edge.entity'
import { GraphNames } from '@shared/constants/graph-store'

/** 原始行（SELECT * 结果：snake_case 列名，PG bigint 为 string、datetime 为 Date/字符串） */
type RawRow = Record<string, unknown>

/** graph_edges 插入行（实体属性名，camelCase；userId 由迁移按源行原样保留） */
interface EdgeInsertRow {
  id: string
  userId: string | null
  graphName: string
  sourceKind: string
  sourceId: string
  targetKind: string
  targetId: string
  relation: string
  label: string | null
  description: string | null
  evidence: string | null
  confidence: number | null
  verified: number
  origin: string | null
  validFrom: number | null
  validUntil: number | null
  props: string | null
  createdAt: number
  updatedAt: number
}

interface MigrateTarget {
  table: string
  /** 原始行 → graph_edges 插入行 */
  map: (r: RawRow) => EdgeInsertRow
}

function isPg(ds: DataSource): boolean {
  return ds.options.type === 'postgres'
}

async function checkTableExists(ds: DataSource, table: string, pg: boolean): Promise<boolean> {
  if (pg) {
    const rows = await ds.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = $1 AND table_schema = current_schema() LIMIT 1`,
      [table],
    )
    return rows.length > 0
  }
  const rows = await ds.query(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`, [table])
  return rows.length > 0
}

async function checkIndexExists(ds: DataSource, indexName: string, pg: boolean): Promise<boolean> {
  if (pg) {
    const rows = await ds.query(
      `SELECT 1 FROM pg_indexes WHERE indexname = $1 AND schemaname = current_schema() LIMIT 1`,
      [indexName],
    )
    return rows.length > 0
  }
  const rows = await ds.query(`SELECT 1 FROM sqlite_master WHERE type='index' AND name = ? LIMIT 1`, [indexName])
  return rows.length > 0
}

async function ensureTable(ds: DataSource, table: string, pg: boolean, ddl: string): Promise<void> {
  if (await checkTableExists(ds, table, pg)) return
  await ds.query(ddl)
}

async function ensureIndex(ds: DataSource, pg: boolean, name: string, table: string, columns: string): Promise<void> {
  if (await checkIndexExists(ds, name, pg)) return
  try {
    await ds.query(`CREATE INDEX ${name} ON ${table} ${columns}`)
  } catch (e: any) {
    // 索引可能已由 entity synchronize 建过（如 sqlite 测试库），忽略冲突
    if (!/already exists|duplicate/i.test(e.message)) throw e
  }
}

// ─── 数值/时间换算（SQLite datetime 字符串 / PG bigint 字符串 / Date 对象 三态归一） ───

function toInt(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function toDateMs(v: unknown): number {
  if (v == null) return 0
  if (v instanceof Date) return v.getTime()
  if (typeof v === 'number') return v
  const s = String(v).trim()
  const asNum = Number(s)
  if (s !== '' && Number.isFinite(asNum)) return asNum
  const t = Date.parse(s.includes('T') ? s : s.replace(' ', 'T'))
  return Number.isFinite(t) ? t : 0
}

function nullableText(v: unknown): string | null {
  return v == null || v === '' ? null : String(v)
}

/** origin 归一为 JSON 文本：已是 JSON 文本（lw/world）原样保留；裸标量（kb 'ai'）包一层 */
function jsonOrNull(v: unknown): string | null {
  if (v == null || v === '') return null
  if (typeof v === 'string') {
    const s = v.trim()
    if (s.startsWith('{') || s.startsWith('[')) return v
    // 裸标量（kb origin 'ai'|'human'）包成对象形态，与 lw/world 的 {type:...} 统一
    return JSON.stringify({ type: v })
  }
  return JSON.stringify(v)
}

function boolInt(v: unknown): number {
  const n = toInt(v)
  return n != null && n > 0 ? 1 : 0
}

// ─── DDL ───────────────────────────────────────────────────────────────────

function createEdgesDDL(pg: boolean): string {
  const idT = pg ? 'varchar' : 'TEXT'
  const txt = pg ? 'text' : 'TEXT'
  return `
    CREATE TABLE graph_edges (
      id           ${idT} PRIMARY KEY,
      user_id      ${idT},
      graph_name   ${idT} NOT NULL,
      source_kind  ${idT} NOT NULL,
      source_id    ${idT} NOT NULL,
      target_kind  ${idT} NOT NULL,
      target_id    ${idT} NOT NULL,
      relation     ${idT} NOT NULL,
      label        ${txt},
      description  ${txt},
      evidence     ${txt},
      confidence   ${pg ? 'real' : 'REAL'},
      verified     INTEGER DEFAULT 0,
      origin       ${txt},
      valid_from   INTEGER,
      valid_until  INTEGER,
      props        ${txt},
      created_at   ${pg ? 'bigint' : 'INTEGER'},
      updated_at   ${pg ? 'bigint' : 'INTEGER'}
    )
  `
}

// ─── 回填映射（五个源；GraphNames 模板与 @shared/constants/graph-store 同源） ───

function targets(): MigrateTarget[] {
  return [
    {
      table: 'lw_graph_edges',
      map: (r) => ({
        id: String(r.id),
        userId: (r.user_id as string | null) ?? null,
        graphName: GraphNames.lwProject(String(r.project_id)),
        sourceKind: String(r.source_type),
        sourceId: String(r.source_id),
        targetKind: String(r.target_type),
        targetId: String(r.target_id),
        relation: String(r.relation_type),
        label: nullableText(r.label),
        description: nullableText(r.description),
        evidence: null,
        confidence: null,
        verified: 0,
        origin: jsonOrNull(r.origin),
        validFrom: toInt(r.valid_from_chapter),
        validUntil: toInt(r.valid_until_chapter),
        props: null,
        createdAt: toDateMs(r.created_at),
        updatedAt: toDateMs(r.updated_at),
      }),
    },
    {
      table: 'lw_ip_edges',
      map: (r) => ({
        id: String(r.id),
        userId: (r.user_id as string | null) ?? null,
        graphName: GraphNames.lwIp(),
        sourceKind: 'ip_character',
        sourceId: String(r.source_id),
        targetKind: 'ip_character',
        targetId: String(r.target_id),
        relation: String(r.relation_type),
        label: nullableText(r.label),
        description: nullableText(r.description),
        evidence: null,
        confidence: null,
        verified: 0,
        origin: null,
        validFrom: null,
        validUntil: null,
        props: null,
        createdAt: toDateMs(r.created_at),
        updatedAt: toDateMs(r.created_at),
      }),
    },
    {
      table: 'lw_world_edges',
      map: (r) => ({
        id: String(r.id),
        userId: (r.user_id as string | null) ?? null,
        graphName: GraphNames.lwWorld(String(r.world_id)),
        sourceKind: 'world_entry',
        sourceId: String(r.source_id),
        targetKind: 'world_entry',
        targetId: String(r.target_id),
        relation: String(r.relation_type),
        label: nullableText(r.label),
        description: null,
        evidence: null,
        confidence: null,
        verified: 0,
        origin: jsonOrNull(r.origin),
        validFrom: null,
        validUntil: null,
        props: null,
        createdAt: toDateMs(r.created_at),
        updatedAt: toDateMs(r.created_at),
      }),
    },
    {
      table: 'kb_knowledge_edges',
      map: (r) => ({
        id: String(r.id),
        userId: (r.user_id as string | null) ?? null,
        graphName: GraphNames.kb(String(r.knowledge_base_id)),
        sourceKind: String(r.source_kind),
        sourceId: String(r.source_id),
        targetKind: String(r.target_kind),
        targetId: String(r.target_id),
        relation: String(r.relation),
        label: null,
        description: null,
        evidence: nullableText(r.evidence),
        confidence: toInt(r.confidence),
        verified: boolInt(r.verified),
        origin: jsonOrNull(r.origin),
        validFrom: null,
        validUntil: null,
        props: null,
        createdAt: toDateMs(r.created_at),
        updatedAt: toDateMs(r.created_at),
      }),
    },
    {
      table: 'dl_relation',
      map: (r) => ({
        id: String(r.id),
        userId: (r.user_id as string | null) ?? null,
        graphName: GraphNames.dlProject(String(r.project_id)),
        sourceKind: 'concept',
        sourceId: String(r.source_id),
        targetKind: 'concept',
        targetId: String(r.target_id),
        relation: String(r.relation_type),
        label: null,
        description: null,
        evidence: nullableText(r.evidence),
        confidence: null,
        verified: boolInt(r.verified),
        origin: null,
        validFrom: null,
        validUntil: null,
        props: null,
        createdAt: toDateMs(r.created_at),
        updatedAt: toDateMs(r.created_at),
      }),
    },
  ]
}

/** 活跃边五元组去重：保留 created_at 最早一条；返回保留行 + 落选 id（补删历史已迁入的重复行） */
/** 活跃边五元组去重（在映射后的行上做——字段名统一，tuple 全源共享）：
 * 保留 created_at 最早一条；返回保留行 + 落选 id（补删历史已迁入的重复行） */
function dedupeActiveRows(rows: EdgeInsertRow[]): { kept: EdgeInsertRow[]; removedIds: string[] } {
  const kept: EdgeInsertRow[] = []
  const removedIds: string[] = []
  const best = new Map<string, EdgeInsertRow>()
  for (const r of rows) {
    if (r.validUntil != null) {
      kept.push(r) // 关停边不占活跃键（lw 关停后重建语义）
      continue
    }
    const key = `${r.graphName}|${r.sourceKind}:${r.sourceId}|${r.relation}|${r.targetKind}:${r.targetId}`
    const prev = best.get(key)
    if (!prev) {
      best.set(key, r)
      continue
    }
    const winner = r.createdAt < prev.createdAt ? r : prev
    const loser = winner === r ? prev : r
    best.set(key, winner)
    removedIds.push(loser.id)
  }
  kept.push(...best.values())
  return { kept, removedIds }
}

async function backfillSource(
  ds: DataSource,
  t: MigrateTarget,
  pg: boolean,
  existingIds: Set<string>,
): Promise<{ read: number; deduped: number; inserted: number }> {
  if (!(await checkTableExists(ds, t.table, pg))) {
    console.log(`[create-unified-graph-tables] 源表 ${t.table} 不存在（旧版本库），跳过回填`)
    return { read: 0, deduped: 0, inserted: 0 }
  }
  const rawRows = (await ds.query(`SELECT * FROM ${t.table}`)) as RawRow[]
  if (rawRows.length === 0) return { read: 0, deduped: 0, inserted: 0 }

  // 先映射（统一字段名），再做活跃五元组去重
  const mapped = rawRows.map(t.map)
  const { kept, removedIds } = dedupeActiveRows(mapped)

  // 自愈：历史轮次已迁入的重复活跃五元组补删（幂等重跑收敛）
  if (removedIds.length > 0) {
    await ds
      .createQueryBuilder()
      .delete()
      .from(GraphEdgeEntity)
      .where('id IN (:...ids)', { ids: removedIds })
      .execute()
  }

  const todo = kept.filter((r) => !existingIds.has(r.id)) // kept 已是映射行，禁止二次 map
  const chunkSize = 200
  for (let i = 0; i < todo.length; i += chunkSize) {
    await ds
      .createQueryBuilder()
      .insert()
      .into(GraphEdgeEntity)
      .values(todo.slice(i, i + chunkSize) as never)
      .orIgnore(true)
      .execute()
  }
  for (const r of todo) existingIds.add(r.id)
  return { read: rawRows.length, deduped: removedIds.length, inserted: todo.length }
}

// ─── 主入口 ────────────────────────────────────────────────────────────────

export async function createUnifiedGraphTables(ds: DataSource): Promise<void> {
  const pg = isPg(ds)

  await ensureTable(ds, 'graph_edges', pg, createEdgesDDL(pg))
  await ensureIndex(ds, pg, 'idx_graph_edges_name', 'graph_edges', '(graph_name)')
  await ensureIndex(ds, pg, 'idx_graph_edges_src', 'graph_edges', '(graph_name, source_kind, source_id)')
  await ensureIndex(ds, pg, 'idx_graph_edges_tgt', 'graph_edges', '(graph_name, target_kind, target_id)')
  await ensureIndex(ds, pg, 'idx_graph_edges_rel', 'graph_edges', '(graph_name, relation)')
  // 回填（幂等：已有 id 跳过 + orIgnore 兜底）
  const existingIdRows = (await ds.query(`SELECT id FROM graph_edges`)) as Array<{ id: string }>
  const existingIds = new Set(existingIdRows.map((r) => String(r.id)))
  let totalInserted = 0
  let totalDeduped = 0
  for (const t of targets()) {
    const stat = await backfillSource(ds, t, pg, existingIds)
    totalInserted += stat.inserted
    totalDeduped += stat.deduped
    if (stat.read > 0 || stat.inserted > 0) {
      console.log(
        `[create-unified-graph-tables] ${t.table}: 读 ${stat.read}，去重 ${stat.deduped}，迁入 ${stat.inserted}`,
      )
    }
  }

  // 部分唯一索引（五元组，仅约束仍生效边——lw 关停边不占键；kb/dl/ip/world valid_until 恒 NULL 即全量唯一）
  if (!(await checkIndexExists(ds, 'uq_graph_edges_active', pg))) {
    await ds.query(
      `CREATE UNIQUE INDEX uq_graph_edges_active ON graph_edges (graph_name, source_kind, source_id, relation, target_kind, target_id) WHERE valid_until IS NULL`,
    )
  }

  // 对账（WARN 不 fail）
  const totalRows = (await ds.query(`SELECT COUNT(*) AS n FROM graph_edges`)) as Array<{ n: string | number }>
  const total = Number(totalRows[0]?.n ?? 0)
  console.log(
    `[create-unified-graph-tables] graph_edges 就绪：总边数 ${total}（本轮迁入 ${totalInserted}，去重 ${totalDeduped}）`,
  )
  if (total < totalInserted) {
    console.warn(`[create-unified-graph-tables] 对账异常：总行数 ${total} < 本轮迁入 ${totalInserted}，请人工核查`)
  }
}
