/**
 * 知识大脑 v3 M3 迁移：kb_consumption_log 消费记账表
 *
 * agent 调用大脑取知识的入账（tool/mode/task/pack_chars）——「第一用户是 AI」的
 * 可观测性底座。幂等；SQLite + PG 双方言。
 * 注册点（双入口）：Electron src/electron/database/index.ts / Web src/web/server/index.ts
 */
import type { DataSource } from 'typeorm'

export async function createKbConsumptionLog(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'
  const vc = isPg ? 'varchar' : 'TEXT'
  const dt = isPg ? 'timestamp' : 'datetime'
  const int = isPg ? 'integer' : 'INTEGER'
  await ds.query(`CREATE TABLE IF NOT EXISTS kb_consumption_log (
    id ${vc} PRIMARY KEY,
    user_id ${vc},
    knowledge_base_id ${vc} NOT NULL,
    tool ${vc} NOT NULL,
    mode ${vc} NOT NULL,
    scene_type ${vc},
    task_excerpt ${vc} DEFAULT '',
    pack_chars ${int} DEFAULT 0,
    created_at ${dt}
  )`)
  await ds.query(`CREATE INDEX IF NOT EXISTS idx_kb_consumption_kb ON kb_consumption_log (knowledge_base_id)`)
  await ds.query(`CREATE INDEX IF NOT EXISTS idx_kb_consumption_time ON kb_consumption_log (created_at)`)
  console.log('[create-kb-consumption-log] kb_consumption_log 就绪')
}
