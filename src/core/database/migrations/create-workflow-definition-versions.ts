/**
 * 工作流版本历史表：workflow_definition_versions
 *
 * 用途：每次发布（publish）固化为一条不可变版本快照（图/触发器/设置/名称等），
 * 支持恢复到任意历史版本（恢复到草稿后重新发布产生新版本，历史版本不丢失）。
 *
 * 兼容 SQLite + PG，幂等（表/索引已存在则跳过）。
 * 接入点：src/electron/database/index.ts runMultiTenantMigrations() 追加调用；
 *         src/web/server/index.ts initDatabase() 追加调用。
 */

import type { DataSource } from 'typeorm'

export async function createWorkflowDefinitionVersionsTable(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  const exists = await checkTableExists(ds, 'workflow_definition_versions', isPg)
  if (!exists) {
    const ddl = isPg
      ? `
        CREATE TABLE workflow_definition_versions (
          id            varchar PRIMARY KEY,
          definition_id varchar NOT NULL,
          version       integer NOT NULL,
          name          varchar NOT NULL,
          description   text,
          category      varchar,
          graph         text NOT NULL,
          triggers      text,
          settings      text,
          note          text,
          created_by    varchar,
          created_at    timestamp
        )
      `
      : `
        CREATE TABLE workflow_definition_versions (
          id            TEXT PRIMARY KEY,
          definition_id TEXT NOT NULL,
          version       INTEGER NOT NULL,
          name          TEXT NOT NULL,
          description   TEXT,
          category      TEXT,
          graph         TEXT NOT NULL,
          triggers      TEXT,
          settings      TEXT,
          note          TEXT,
          created_by    TEXT,
          created_at    DATETIME
        )
      `
    await ds.query(ddl)
    console.log('[create-workflow-definition-versions] 表 workflow_definition_versions 创建完成')
  }

  if (!(await checkIndexExists(ds, 'idx_wf_defver_def', isPg))) {
    await ds.query(
      `CREATE INDEX idx_wf_defver_def ON workflow_definition_versions (definition_id, version DESC)`,
    )
    console.log('[create-workflow-definition-versions] 加索引 idx_wf_defver_def')
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
  const rows = await ds.query(
    `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`,
    [table],
  )
  return rows.length > 0
}

async function checkIndexExists(ds: DataSource, indexName: string, isPg: boolean): Promise<boolean> {
  if (isPg) {
    const rows = await ds.query(
      `SELECT 1 FROM pg_indexes WHERE indexname = $1 AND schemaname = current_schema() LIMIT 1`,
      [indexName],
    )
    return rows.length > 0
  }
  const rows = await ds.query(
    `SELECT 1 FROM sqlite_master WHERE type='index' AND name = ? LIMIT 1`,
    [indexName],
  )
  return rows.length > 0
}
