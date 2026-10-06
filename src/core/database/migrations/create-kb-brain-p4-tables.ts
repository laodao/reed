/**
 * 知识大脑 P4 迁移：质检日志（kb_qa_log）+ 自动化动作日志（kb_automation_log）
 *
 * - qa_log：冶炼产物的 judge 抽检评分（0-2）——滚动均构成质量门（低分→冶炼降级
 *   待审而非直发），也是漂移监控的数据源；
 * - automation_log：后台自动化的写操作台账（含产物 noteIds）——撤销依据
 *   （undo = 归档该批卡），面板「自动化日志」时间线数据源。
 * 幂等；SQLite + PG 双方言。注册点：Electron/Web 双入口（照 add-kb-entity-scope）。
 */
import type { DataSource } from 'typeorm'

async function checkTableExists(ds: DataSource, table: string, isPg: boolean): Promise<boolean> {
  const sql = isPg
    ? `SELECT COUNT(*) as count FROM information_schema.tables WHERE table_name = '${table}' AND table_schema = current_schema()`
    : `SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='${table}'`
  const rows = (await ds.query(sql)) as Array<{ count: number }>
  return Number(rows[0]?.count ?? 0) > 0
}

export async function createKbBrainP4Tables(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'
  const vc = isPg ? 'varchar' : 'TEXT'
  const rl = isPg ? 'real' : 'REAL'
  const dt = isPg ? 'timestamp' : 'datetime'

  if (!(await checkTableExists(ds, 'kb_qa_log', isPg))) {
    await ds.query(`
      CREATE TABLE kb_qa_log (
        id         ${vc} PRIMARY KEY,
        user_id    ${vc},
        kb_id      ${vc} NOT NULL,
        note_id    ${vc} NOT NULL,
        score      ${rl} NOT NULL,
        reason     ${vc},
        created_at ${dt}
      )
    `)
    console.log('[create-kb-brain-p4] 表 kb_qa_log 创建完成')
  }
  await ds.query('CREATE INDEX IF NOT EXISTS idx_kb_qa_log_kb ON kb_qa_log (kb_id, created_at)')

  if (!(await checkTableExists(ds, 'kb_automation_log', isPg))) {
    await ds.query(`
      CREATE TABLE kb_automation_log (
        id          ${vc} PRIMARY KEY,
        user_id     ${vc},
        kb_id       ${vc} NOT NULL,
        action      ${vc} NOT NULL,
        detail_json ${vc},
        undone      INTEGER NOT NULL DEFAULT 0,
        created_at  ${dt}
      )
    `)
    console.log('[create-kb-brain-p4] 表 kb_automation_log 创建完成')
  }
  await ds.query('CREATE INDEX IF NOT EXISTS idx_kb_automation_log_kb ON kb_automation_log (kb_id, created_at)')
}
