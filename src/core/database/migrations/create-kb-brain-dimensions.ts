/**
 * 知识大脑 v3 M1 迁移：kb_dimensions 提炼维度库
 *
 * 维度=提取/归纳的镜头，从语料归纳生长（schema induction），数据驱动不加产线。
 * 幂等；SQLite + PG 双方言（照 create-kb-brain-events 先例）。
 * 注册点（双入口）：Electron src/electron/database/index.ts / Web src/web/server/index.ts
 */
import type { DataSource } from 'typeorm'

export async function createKbBrainDimensions(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'
  const vc = isPg ? 'varchar' : 'TEXT'
  const dt = isPg ? 'timestamp' : 'datetime'
  const int = isPg ? 'integer' : 'INTEGER'
  await ds.query(`CREATE TABLE IF NOT EXISTS kb_dimensions (
    id ${vc} PRIMARY KEY,
    user_id ${vc},
    knowledge_base_id ${vc} NOT NULL,
    name ${vc} NOT NULL,
    definition ${vc} DEFAULT '',
    hint ${vc} DEFAULT '',
    enabled ${int} DEFAULT 1,
    source ${vc} DEFAULT 'seed',
    created_at ${dt},
    updated_at ${dt}
  )`)
  await ds.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_kb_dimensions_name ON kb_dimensions (knowledge_base_id, name)`,
  )
  await ds.query(
    `CREATE INDEX IF NOT EXISTS idx_kb_dimensions_kb ON kb_dimensions (knowledge_base_id)`,
  )
  console.log('[create-kb-brain-dimensions] kb_dimensions 就绪')
}
