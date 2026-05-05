/**
 * pgvector 扩展 + kb_vectors 表 + HNSW 索引（plan 2026-05-03 web-vector-store-pgvector-migration）
 *
 * 仅在 Postgres 上跑（type='postgres'）。SQLite 直接跳过。
 *
 * 兼容性：
 * - extension 必须由 PG 镜像提供（推荐 pgvector/pgvector:pg16）；
 *   若 PG 镜像不含 vector extension，CREATE EXTENSION 会抛 "extension is not available"。
 *   此时迁移**直接跳过**（warning），不阻塞启动 —— 仍然可以用 LanceDB 兜底。
 *   user 应该把 PG 容器换成 pgvector 镜像才能真正启用 VECTOR_STORE=pgvector。
 *
 * 幂等：
 * - CREATE EXTENSION IF NOT EXISTS / CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS
 */

import type { DataSource } from 'typeorm'

const VECTOR_DIM = 8192

export async function ensurePgvectorKbVectors(ds: DataSource): Promise<void> {
  if (ds.options.type !== 'postgres') {
    return
  }

  // 1. 装 vector 扩展（pgvector）。镜像未自带时此处会抛错 → 静默跳过，等用户切镜像后再跑。
  try {
    await ds.query(`CREATE EXTENSION IF NOT EXISTS vector`)
  } catch (e) {
    console.warn(
      `[ensure-pgvector-kb-vectors] CREATE EXTENSION vector 失败（PG 镜像未自带 pgvector？）：${(e as Error).message}`,
    )
    console.warn(
      '[ensure-pgvector-kb-vectors] 跳过本迁移；切到 pgvector/pgvector:pg16 镜像后会自动重试',
    )
    return
  }

  // 2. 建表 kb_vectors（halfvec 类型支持到 16000 维，VECTOR_DIM=8192 在范围内）
  await ds.query(`
    CREATE TABLE IF NOT EXISTS kb_vectors (
      id                UUID PRIMARY KEY,
      chunk_id          TEXT NOT NULL,
      knowledge_base_id TEXT NOT NULL,
      user_id           TEXT,
      embedding         halfvec(${VECTOR_DIM}) NOT NULL,
      model             TEXT,
      created_at        TIMESTAMP WITH TIME ZONE DEFAULT now()
    )
  `)

  // chunk_id 唯一约束（用 INSERT ... ON CONFLICT 上下文）
  await ds.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_kb_vectors_chunk_id_unique
    ON kb_vectors (chunk_id)
  `)

  // KB 查询索引（按 KB 隔离 + KNN）
  await ds.query(`
    CREATE INDEX IF NOT EXISTS idx_kb_vectors_kb
    ON kb_vectors (knowledge_base_id)
  `)

  // HNSW 索引（cosine ops）—— pgvector HNSW 在 halfvec 上限 4000 维。
  // 维度超限时降级：不建 HNSW（KB 数据量小可接受全表扫描；万级数据再考虑维度降维 / IVFFlat）。
  // VECTOR_DIM=8192 会触发降级；< 4000 维度的可建 HNSW。
  if (VECTOR_DIM <= 4000) {
    await ds.query(`
      CREATE INDEX IF NOT EXISTS idx_kb_vectors_hnsw
      ON kb_vectors USING hnsw (embedding halfvec_cosine_ops)
    `)
    console.log(
      `[ensure-pgvector-kb-vectors] kb_vectors 表 + HNSW 索引就绪（halfvec(${VECTOR_DIM})）`,
    )
  } else {
    console.warn(
      `[ensure-pgvector-kb-vectors] halfvec(${VECTOR_DIM}) 超过 HNSW 4000 维上限，` +
        `已建 kb_vectors 表但**不建 HNSW 索引**（KB 量大时考虑用 1536 / 1024 维 embedding 模型）`,
    )
  }
}
