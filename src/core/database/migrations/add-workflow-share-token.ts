/**
 * workflow_definitions 增加 share_token 列（C3 免登录独立页分享）。
 *
 * 用途：工作流"启用分享"后生成随机令牌——Web 端免登录独立页
 * /workflow-run/:token 通过它解析定义并以其所有者身份启动运行。
 * NULL = 未分享；唯一索引（两方言均允许多行 NULL）。
 *
 * 幂等。兼容 SQLite + PG。
 */

import type { DataSource } from 'typeorm'

export async function addWorkflowShareToken(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  if (!(await checkTableExists(ds, 'workflow_definitions', isPg))) {
    console.log('[add-workflow-share-token] workflow_definitions 不存在，跳过')
    return
  }

  // 与 entity 一致：无 length 的 varchar（PG）/ TEXT（SQLite），避免 schema-drift 误报
  const varcharType = isPg ? 'varchar' : 'TEXT'

  if (!(await checkColumnExists(ds, 'workflow_definitions', 'share_token', isPg))) {
    await ds.query(`ALTER TABLE workflow_definitions ADD COLUMN share_token ${varcharType}`)
    console.log('[add-workflow-share-token] 加列 share_token')
  }

  // 安全整改（2026-08-27）：新分享令牌只存 sha256 hash，不明文落库
  if (!(await checkColumnExists(ds, 'workflow_definitions', 'share_token_hash', isPg))) {
    await ds.query(`ALTER TABLE workflow_definitions ADD COLUMN share_token_hash ${varcharType}`)
    console.log('[add-workflow-share-token] 加列 share_token_hash')
  }

  if (!(await checkIndexExists(ds, 'idx_wf_def_share_token', isPg))) {
    // 唯一索引：NULL 不参与唯一性（未分享的多行互不冲突）
    await ds.query(`CREATE UNIQUE INDEX idx_wf_def_share_token ON workflow_definitions (share_token)`)
    console.log('[add-workflow-share-token] 加唯一索引 idx_wf_def_share_token')
  }

  if (!(await checkIndexExists(ds, 'idx_wf_def_share_token_hash', isPg))) {
    await ds.query(`CREATE UNIQUE INDEX idx_wf_def_share_token_hash ON workflow_definitions (share_token_hash)`)
    console.log('[add-workflow-share-token] 加唯一索引 idx_wf_def_share_token_hash')
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

async function checkColumnExists(
  ds: DataSource,
  table: string,
  column: string,
  isPg: boolean,
): Promise<boolean> {
  if (isPg) {
    const rows = await ds.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2 AND table_schema = current_schema() LIMIT 1`,
      [table, column],
    )
    return rows.length > 0
  }
  const rows = await ds.query(
    `SELECT 1 FROM pragma_table_info(?) WHERE name = ? LIMIT 1`,
    [table, column],
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
