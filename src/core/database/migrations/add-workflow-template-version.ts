/**
 * workflow_definitions 增加 template_version 列（内置模板接管标记）
 *
 * 用途：内置工作流允许用户修改——用户保存草稿/发布内置工作流时 template_version 置 0
 * （表示"已接管"），create-builtin-apps 迁移对 template_version=0 的行跳过模板同步，
 * 避免每次启动把用户修改重置回内置模板。
 *
 * 幂等：列已存在则跳过；**仅首次加列时**把存量 is_builtin=1 行置 1（模板原始版本），
 * 之后不会再把已接管（0）的行改回 1。兼容 SQLite + PG。
 */

import type { DataSource } from 'typeorm'

export async function addWorkflowTemplateVersion(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  if (!(await checkTableExists(ds, 'workflow_definitions', isPg))) {
    console.log('[add-workflow-template-version] workflow_definitions 不存在，跳过')
    return
  }

  const exists = await checkColumnExists(ds, 'workflow_definitions', 'template_version', isPg)
  if (exists) return // 幂等：已加过列不再处理（避免把已接管的 0 改回 1）

  const intType = isPg ? 'integer' : 'INTEGER'
  await ds.query(`ALTER TABLE workflow_definitions ADD COLUMN template_version ${intType} DEFAULT 0`)
  console.log('[add-workflow-template-version] 加列 template_version')

  // 存量内置行筛选依赖 is_builtin 列——该列由 create-builtin-apps 迁移补充，
  // 本迁移可能先于其执行（启动顺序），幂等补齐避免 SQL 引用不存在的列。
  if (!(await checkColumnExists(ds, 'workflow_definitions', 'is_builtin', isPg))) {
    await ds.query(`ALTER TABLE workflow_definitions ADD COLUMN is_builtin ${intType} DEFAULT 0`)
    console.log('[add-workflow-template-version] 补列 is_builtin')
  }

  // 存量内置行（用户此前无法修改，均为模板原样）→ 置为模板版本 1
  await ds.query(
    `UPDATE workflow_definitions SET template_version = 1 WHERE is_builtin = 1`,
  )
  console.log(`[add-workflow-template-version] 存量内置定义模板版本初始化完成`)
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
