/**
 * 新建 kb_qa_pairs 表（D1 QA 知识库：问答对存储）
 *
 * 用途：QA 型知识库的问答对（question / answer / 相似问题 JSON）。
 * 检索向量仍走 IVectorStore（chunkId 命名空间 `qa:<pairId>:<variant>`），
 * 本表只存结构化问答数据。
 *
 * 幂等。兼容 SQLite + PG。
 */

import type { DataSource } from 'typeorm'

export async function createKbQaPairs(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  if (await checkTableExists(ds, 'kb_qa_pairs', isPg)) {
    console.log('[create-kb-qa-pairs] 表已存在，跳过')
    return
  }

  if (isPg) {
    await ds.query(`
      CREATE TABLE kb_qa_pairs (
        id                  varchar PRIMARY KEY,
        user_id             varchar,
        knowledge_base_id   varchar NOT NULL,
        question            text NOT NULL,
        answer              text NOT NULL,
        similar_questions   text,
        created_at          datetime,
        updated_at          datetime
      )
    `)
  } else {
    await ds.query(`
      CREATE TABLE kb_qa_pairs (
        id                  TEXT PRIMARY KEY,
        user_id             TEXT,
        knowledge_base_id   TEXT NOT NULL,
        question            TEXT NOT NULL,
        answer              TEXT NOT NULL,
        similar_questions   TEXT,
        created_at          datetime,
        updated_at          datetime
      )
    `)
  }
  await ds.query(`CREATE INDEX idx_kb_qa_pairs_kb ON kb_qa_pairs (knowledge_base_id)`)
  await ds.query(`CREATE INDEX idx_kb_qa_pairs_user ON kb_qa_pairs (user_id)`)
  console.log('[create-kb-qa-pairs] 表 kb_qa_pairs 创建完成')
}

async function checkTableExists(ds: DataSource, table: string, isPg: boolean): Promise<boolean> {
  if (isPg) {
    const rows = await ds.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = $1 AND table_schema = current_schema() LIMIT 1`,
      [table],
    )
    return rows.length > 0
  }
  const rows = await ds.query(
    `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`,
    [table],
  )
  return rows.length > 0
}
