/**
 * agent_memory_entries 加 scope 列（KE-1，34 号 v2 §7）
 *
 * 分层知识模型：biz_module / project_id 两列表达 L1 用户级（双 NULL）/ L2 业务级 /
 * L3 项目级；content_hash + embed_model 支撑 M-Ke2 向量化检索的增量嵌入与
 * 模型漂移检测（评审 P2-8）。双列皆 NULL 时语义与存量数据完全一致（用户级），零迁移。
 *
 * 兼容 SQLite + PG，幂等。接入点：electron runMultiTenantMigrations / web initDatabase
 * （紧随 create-agent-memory-entries 之后）。
 */

import type { DataSource } from 'typeorm'
import { ensureIndex } from './migration-utils'

export async function addAgentMemoryScopeColumns(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  const columns: Array<{ name: string; pgType: string }> = [
    { name: 'biz_module', pgType: 'varchar' },
    { name: 'project_id', pgType: 'varchar' },
    { name: 'content_hash', pgType: 'varchar' },
    { name: 'embed_model', pgType: 'varchar' },
  ]
  for (const col of columns) {
    if (await tableHasColumn(ds, isPg, col.name)) continue
    const sqlType = isPg ? col.pgType : 'TEXT'
    await ds.query(`ALTER TABLE agent_memory_entries ADD COLUMN ${col.name} ${sqlType} NULL`)
  }

  await ensureIndex(ds, isPg, 'idx_agent_memory_scope', 'agent_memory_entries', '(user_id, status, biz_module, project_id)')
}

async function tableHasColumn(ds: DataSource, isPg: boolean, column: string): Promise<boolean> {
  if (isPg) {
    const res: Array<{ count: string }> = (await ds.query(
      `SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_name = 'agent_memory_entries' AND column_name = '${column}' AND table_schema = current_schema()`,
    )) as Array<{ count: string }>
    return Number(res[0]?.count ?? 0) > 0
  }
  const rows = (await ds.query(`PRAGMA table_info('agent_memory_entries')`)) as Array<{ name: string }>
  return rows.some((r) => r.name === column)
}
