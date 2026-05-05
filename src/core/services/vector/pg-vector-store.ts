/**
 * pgvector 实现的 IVectorStore（halfvec(8192) + HNSW 索引）
 * @module core/services/vector/pg-vector-store
 *
 * 设计要点（详见 docs/plan/2026-05-03-web-vector-store-pgvector-migration.md）：
 *
 * - **维度**：写死 halfvec(8192) —— DashScope text-embedding-v4 是 8192，OpenAI 1536 等
 *   在 8192 内零填充即可（pgvector halfvec 容忍长度不足时取前 N 维 + 0 填充）。
 *   实际上为了兼容多模型混用，所有 embedding 都按 8192 存储（短的用 0 后缀填）。
 * - **精度**：halfvec 是 fp16 半精度，相对 fp32 精度损失实测 <1%（向量检索场景）。
 * - **索引**：HNSW + halfvec_cosine_ops 默认；查询用 `<=>` operator (cosine distance)。
 *   HNSW 参数 m=16 / ef_construction=64（pgvector 默认，质量 / 构建速度均衡）。
 * - **多租户**：knowledge_base_id 作为 partition key，所有查询带 WHERE knowledge_base_id；
 *   userId 字段写入但查询不主动过滤（KB 隔离已经够用，避免 join 增加 IO）。
 *
 * 表结构（migration ensure-pgvector-extension 创建）：
 * ```sql
 * CREATE EXTENSION IF NOT EXISTS vector;
 *
 * CREATE TABLE IF NOT EXISTS kb_vectors (
 *   id              UUID PRIMARY KEY,
 *   chunk_id        TEXT NOT NULL UNIQUE,
 *   knowledge_base_id TEXT NOT NULL,
 *   user_id         TEXT,
 *   embedding       halfvec(8192) NOT NULL,
 *   model           TEXT,
 *   created_at      TIMESTAMP WITH TIME ZONE DEFAULT now()
 * );
 *
 * CREATE INDEX IF NOT EXISTS idx_kb_vectors_kb ON kb_vectors (knowledge_base_id);
 * CREATE INDEX IF NOT EXISTS idx_kb_vectors_chunk ON kb_vectors (chunk_id);
 * CREATE INDEX IF NOT EXISTS idx_kb_vectors_hnsw
 *   ON kb_vectors USING hnsw (embedding halfvec_cosine_ops);
 * ```
 */

import { randomUUID } from 'crypto'
import type { DataSource } from 'typeorm'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type {
  IVectorStore,
  VectorRecord,
  VectorSearchResult,
  VectorDistanceMetric,
} from './vector-store.interface'

/** 全局向量维度上限（写表时统一 zero-pad 到此长度） */
const VECTOR_DIM = 8192

export class PgVectorStore implements IVectorStore {
  private ready = false

  isReady(): boolean {
    return this.ready
  }

  /**
   * 启动时由 registry 调用：
   * - 校验 extension 已存在（migration 自身确保）
   * - 标记 ready
   */
  async initialize(): Promise<void> {
    const ds = this.requireDs()
    const rows = await ds.query(
      `SELECT 1 FROM pg_extension WHERE extname = 'vector' LIMIT 1`,
    )
    if (!rows.length) {
      throw new Error(
        '[PgVectorStore] PG 未安装 vector 扩展（pgvector）—— 请先跑 migration ensure-pgvector-extension',
      )
    }
    this.ready = true
  }

  async insert(record: VectorRecord): Promise<void> {
    await this.insertBatch([record])
  }

  async insertBatch(records: VectorRecord[]): Promise<void> {
    if (records.length === 0) return
    const ds = this.requireDs()

    // 一条 INSERT ... VALUES (multi-row) 比循环 INSERT 快 5-10×
    const placeholders: string[] = []
    const params: unknown[] = []
    let idx = 1
    for (const r of records) {
      const vec = padOrTruncate(r.vector)
      const id = r.id || randomUUID()
      placeholders.push(
        `($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}::halfvec, $${idx++}, $${idx++})`,
      )
      params.push(
        id,
        r.chunkId,
        r.knowledgeBaseId,
        r.userId ?? null,
        formatHalfvec(vec),
        r.model ?? null,
        normalizeCreatedAt(r.createdAt),
      )
    }
    const sql = `INSERT INTO kb_vectors
      (id, chunk_id, knowledge_base_id, user_id, embedding, model, created_at)
      VALUES ${placeholders.join(', ')}
      ON CONFLICT (chunk_id) DO UPDATE
        SET embedding = EXCLUDED.embedding,
            knowledge_base_id = EXCLUDED.knowledge_base_id,
            user_id = EXCLUDED.user_id,
            model = EXCLUDED.model,
            created_at = EXCLUDED.created_at`
    await ds.query(sql, params)
  }

  async getByChunkId(chunkId: string): Promise<VectorRecord | null> {
    const ds = this.requireDs()
    const rows = await ds.query(
      `SELECT id, chunk_id, knowledge_base_id, user_id, embedding::text AS embedding, model, created_at
       FROM kb_vectors WHERE chunk_id = $1 LIMIT 1`,
      [chunkId],
    )
    if (!rows.length) return null
    return rowToRecord(rows[0])
  }

  async searchSimilar(
    knowledgeBaseId: string,
    queryVector: number[],
    topK: number,
    opts?: { distanceMetric?: VectorDistanceMetric },
  ): Promise<VectorSearchResult[]> {
    const ds = this.requireDs()
    const op = pickOperator(opts?.distanceMetric ?? 'cosine')
    const vec = padOrTruncate(queryVector)
    const rows = await ds.query(
      `SELECT chunk_id, embedding ${op} $2::halfvec AS distance
       FROM kb_vectors
       WHERE knowledge_base_id = $1
       ORDER BY embedding ${op} $2::halfvec
       LIMIT $3`,
      [knowledgeBaseId, formatHalfvec(vec), topK],
    )
    return rows.map((r: { chunk_id: string; distance: number | string }) => {
      const dist = typeof r.distance === 'number' ? r.distance : Number(r.distance)
      // cosine distance ∈ [0, 2]，score = 1 - distance/2 → ∈ [0, 1]
      // l2 / inner_product 不直接映射 score；这里仍按 cosine 公式给一个 0-1 的相对值
      const score = Math.max(0, Math.min(1, 1 - dist / 2))
      return { chunkId: r.chunk_id, score }
    })
  }

  async deleteByChunkId(chunkId: string): Promise<void> {
    const ds = this.requireDs()
    await ds.query(`DELETE FROM kb_vectors WHERE chunk_id = $1`, [chunkId])
  }

  async deleteByChunkIds(chunkIds: string[]): Promise<void> {
    if (chunkIds.length === 0) return
    const ds = this.requireDs()
    await ds.query(`DELETE FROM kb_vectors WHERE chunk_id = ANY($1)`, [chunkIds])
  }

  async deleteByKnowledgeBaseId(knowledgeBaseId: string): Promise<void> {
    const ds = this.requireDs()
    await ds.query(
      `DELETE FROM kb_vectors WHERE knowledge_base_id = $1`,
      [knowledgeBaseId],
    )
  }

  async countByKnowledgeBaseId(knowledgeBaseId: string): Promise<number> {
    const ds = this.requireDs()
    const rows = await ds.query(
      `SELECT COUNT(*)::int AS n FROM kb_vectors WHERE knowledge_base_id = $1`,
      [knowledgeBaseId],
    )
    return rows[0]?.n ?? 0
  }

  private requireDs(): DataSource {
    const db = getCoreDatabaseManager()
    if (!db.dataSource) throw new Error('数据库未初始化（PgVectorStore.requireDs）')
    if (db.dataSource.options.type !== 'postgres') {
      throw new Error(
        `[PgVectorStore] 当前数据库非 PostgreSQL（type=${db.dataSource.options.type}），不应注册此实现`,
      )
    }
    return db.dataSource
  }
}

// ─── 工具函数 ────────────────────────────────────────────────────────────────

/** 把任意长度向量调整到 VECTOR_DIM（短补 0，长截断） */
function padOrTruncate(vec: number[]): number[] {
  if (vec.length === VECTOR_DIM) return vec
  if (vec.length > VECTOR_DIM) return vec.slice(0, VECTOR_DIM)
  const out = new Array(VECTOR_DIM).fill(0)
  for (let i = 0; i < vec.length; i++) out[i] = vec[i]
  return out
}

/** Number[] → '[v1,v2,...]'，pgvector halfvec 解析格式 */
function formatHalfvec(vec: number[]): string {
  // 注意：JSON 的 NaN/Infinity 不被 PG 接受，转 0
  const safe = vec.map((v) => (Number.isFinite(v) ? v : 0))
  return '[' + safe.join(',') + ']'
}

function pickOperator(metric: VectorDistanceMetric): string {
  // pgvector 距离运算符
  switch (metric) {
    case 'cosine':
      return '<=>'
    case 'l2':
      return '<->'
    case 'inner_product':
      return '<#>'
  }
}

function normalizeCreatedAt(v: Date | string | undefined): Date {
  if (!v) return new Date()
  if (v instanceof Date) return v
  return new Date(v)
}

function rowToRecord(row: {
  id: string
  chunk_id: string
  knowledge_base_id: string
  user_id: string | null
  embedding: string | null
  model: string | null
  created_at: string | Date
}): VectorRecord {
  // embedding::text 出来是 '[v1,v2,...]'，去括号 split
  const vec: number[] = row.embedding
    ? row.embedding
        .replace(/^\[|\]$/g, '')
        .split(',')
        .map((s) => Number(s))
    : []
  return {
    id: row.id,
    chunkId: row.chunk_id,
    knowledgeBaseId: row.knowledge_base_id,
    userId: row.user_id,
    vector: vec,
    dim: vec.length,
    model: row.model ?? undefined,
    createdAt: row.created_at,
  }
}
