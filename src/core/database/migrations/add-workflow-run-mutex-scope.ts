/**
 * 工作流互斥作用域（2026-09-16 忘川渡实跑 P1）：
 * 旧约束 uq_wf_run_mutex (user_id, definition_id) WHERE active 让同一定义全局只允许
 * 一个活动 run——两个项目共用「章节写作章法」定义时互相 skip（长文多项目并行写作
 * 直接不可用）。本迁移给 workflow_runs 加 mutex_scope 列（'' = 无作用域，兼容旧
 * 行为），并把唯一索引重建为 (user_id, definition_id, mutex_scope)：
 * - 同 scope 只允许一个活动 run（同章绝不双跑——DB 兜底）；
 * - 不同 scope 并行放行；
 * - 旧实例（不认识该列）插入走 DEFAULT ''，语义与旧约束一致，双向兼容。
 * @module core/database/migrations/add-workflow-run-mutex-scope
 */

export async function addWorkflowRunMutexScope(ds: any): Promise<void> {
  const isPg = (ds.options?.type ?? 'sqlite') === 'postgres'
  const hasColumn = async (): Promise<boolean> => {
    if (isPg) {
      const rows = await ds.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name = 'workflow_runs' AND column_name = 'mutex_scope' LIMIT 1`,
      )
      return rows.length > 0
    }
    const rows = (await ds.query(`PRAGMA table_info(workflow_runs)`)) as Array<{ name: string }>
    return rows.some((r) => r.name === 'mutex_scope')
  }

  if (!(await hasColumn())) {
    await ds.query(`ALTER TABLE workflow_runs ADD COLUMN mutex_scope TEXT NOT NULL DEFAULT ''`)
    console.log('[add-workflow-run-mutex-scope] 已加列 workflow_runs.mutex_scope')
  }

  // 唯一索引重建：旧 (user_id, definition_id) → 新 (user_id, definition_id, mutex_scope)
  await ds.query(`DROP INDEX IF EXISTS uq_wf_run_mutex`)
  if (isPg) {
    await ds.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_wf_run_mutex ON workflow_runs (user_id, definition_id, mutex_scope)
       WHERE status IN ('pending','running','waiting_review')`,
    )
  } else {
    await ds.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_wf_run_mutex ON workflow_runs (user_id, definition_id, mutex_scope)
       WHERE status IN ('pending','running','waiting_review')`,
    )
  }
  console.log('[add-workflow-run-mutex-scope] 已重建唯一索引 uq_wf_run_mutex（含 mutex_scope）')
}
