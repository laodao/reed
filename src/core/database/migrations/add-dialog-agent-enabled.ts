/**
 * dialogs 加 agent_enabled 列（28 号 M5 批2）
 *
 * 对话框级 Agent 模式开关：开启后该对话的 sendMessage 分流到系统 agent
 * （LoopRunner + 系统工具集），普通对话走原 chatStream 链路零改动。
 * 布尔列以 INTEGER/BOOLEAN 落库（SQLite 无原生布尔，TypeORM boolean ↔ 0/1）。
 */

import type { DataSource } from 'typeorm'

export async function addDialogAgentEnabled(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'
  if (await tableHasColumn(ds, isPg, 'agent_enabled')) return
  const sqlType = isPg ? 'BOOLEAN' : 'INTEGER'
  await ds.query(`ALTER TABLE dialogs ADD COLUMN agent_enabled ${sqlType} NULL`)
}

async function tableHasColumn(ds: DataSource, isPg: boolean, column: string): Promise<boolean> {
  if (isPg) {
    const res: Array<{ count: string }> = (await ds.query(
      `SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_name = 'dialogs' AND column_name = '${column}' AND table_schema = current_schema()`,
    )) as Array<{ count: string }>
    return Number(res[0]?.count ?? 0) > 0
  }
  const rows = (await ds.query(`PRAGMA table_info('dialogs')`)) as Array<{ name: string }>
  return rows.some((r) => r.name === column)
}
