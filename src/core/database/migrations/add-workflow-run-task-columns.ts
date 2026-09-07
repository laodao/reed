/**
 * workflow_runs 加 task_id / parent_run_id 列（26 号 M3 批1 / 01 号 §5.1）
 *
 * 运行森林镜像任务树：sub_workflow 执行器的任务 run 带 task_id（任务↔运行关联）；
 * 任务树递归派生的子运行带 parent_run_id。两列均可空——普通运行不受影响。
 * 加列样例遵循 add-workflow-node-run-state-json（PG 查 information_schema /
 * SQLite 查 pragma_table_info，缺列才 ALTER）。
 */

import type { DataSource } from 'typeorm'

export async function addWorkflowRunTaskColumns(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'
  await ensureColumn(ds, isPg, 'task_id', 'varchar')
  await ensureColumn(ds, isPg, 'parent_run_id', 'varchar')
}

async function tableHasColumn(ds: DataSource, isPg: boolean, column: string): Promise<boolean> {
  if (isPg) {
    const res: Array<{ count: string }> = (await ds.query(
      `SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_name = 'workflow_runs' AND column_name = '${column}' AND table_schema = current_schema()`,
    )) as Array<{ count: string }>
    return Number(res[0]?.count ?? 0) > 0
  }
  const rows = (await ds.query(`PRAGMA table_info('workflow_runs')`)) as Array<{ name: string }>
  return rows.some((r) => r.name === column)
}

async function ensureColumn(ds: DataSource, isPg: boolean, column: string, type: string): Promise<void> {
  if (await tableHasColumn(ds, isPg, column)) return
  const sqlType = isPg ? type : 'TEXT'
  await ds.query(`ALTER TABLE workflow_runs ADD COLUMN ${column} ${sqlType} NULL`)
}
