/**
 * 工作流引擎：workflow_node_runs 加 state_json 列（11 号 §4.2 E2）
 *
 * 节点内中间状态（agent 循环对话历史、迭代计数等），可变行（saveState 覆盖写）。
 * 与 Run Journal 分工：journal 记"调度层发生了什么"（append-only），
 * state_json 记"节点内部进行到哪"（可变）。幂等加列（列存在则跳过）。
 */

import type { DataSource } from 'typeorm'

/** state_json 序列化上限（超限拒存——观测面常量） */
export const MAX_STATE_JSON_CHARS = 512 * 1024

export async function addWorkflowNodeRunStateJson(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'
  if (isPg) {
    const rows = await ds.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2 LIMIT 1`,
      ['workflow_node_runs', 'state_json'],
    )
    if (rows.length === 0) {
      await ds.query(`ALTER TABLE workflow_node_runs ADD COLUMN state_json text`)
      console.log('[add-workflow-node-run-state-json] state_json 列创建完成（PG）')
    }
    return
  }
  const rows = await ds.query(
    `SELECT 1 FROM pragma_table_info('workflow_node_runs') WHERE name = 'state_json' LIMIT 1`,
  )
  if (rows.length === 0) {
    await ds.query(`ALTER TABLE workflow_node_runs ADD COLUMN state_json TEXT`)
    console.log('[add-workflow-node-run-state-json] state_json 列创建完成（SQLite）')
  }
}
