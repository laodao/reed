/**
 * knowledge_bases 增加 rerank_config 列（D2 rerank 重排序）
 *
 * 用途：可选 rerank 模型配置 JSON：{ providerConfigId, modelId }。
 * 配置后 KB 检索（search）在向量召回后按 rerank 相关度重排。
 * NULL = 未启用。幂等。兼容 SQLite + PG。
 */

import type { DataSource } from 'typeorm'

export async function addKbRerankConfig(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  if (!(await checkTableExists(ds, 'knowledge_bases', isPg))) {
    console.log('[add-kb-rerank-config] knowledge_bases 不存在，跳过')
    return
  }
  if (!(await checkColumnExists(ds, 'knowledge_bases', 'rerank_config', isPg))) {
    await ds.query(`ALTER TABLE knowledge_bases ADD COLUMN rerank_config ${isPg ? 'text' : 'TEXT'}`)
    console.log('[add-kb-rerank-config] 加列 rerank_config')
  }
}

async function checkTableExists(ds: DataSource, table: string, isPg: boolean): Promise<boolean> {
  if (isPg) {
    const rows = await ds.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = $1 AND table_schema = current_schema() LIMIT 1`,
      [table],
    )
    return rows.length > 0
  }
  const rows = await ds.query(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`, [table])
  return rows.length > 0
}

async function checkColumnExists(ds: DataSource, table: string, column: string, isPg: boolean): Promise<boolean> {
  if (isPg) {
    const rows = await ds.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2 AND table_schema = current_schema() LIMIT 1`,
      [table, column],
    )
    return rows.length > 0
  }
  const rows = await ds.query(`SELECT 1 FROM pragma_table_info(?) WHERE name = ? LIMIT 1`, [table, column])
  return rows.length > 0
}
