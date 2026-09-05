/**
 * provider_configs 增加 default_model 列（存量库补列）
 *
 * 背景：provider-config.entity 已有 defaultModel 字段（@Column default_model），
 * 但历史上从未配套迁移——PG 端靠 synchronize 自动补列，SQLite（PC 端）旧库
 * 缺列会被 schema drift 检查判定漂移而阻断启动。本迁移补齐存量库。
 *
 * 幂等。兼容 SQLite + PG。
 */

import type { DataSource } from 'typeorm'

export async function addProviderConfigDefaultModel(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  if (!(await checkTableExists(ds, 'provider_configs', isPg))) {
    console.log('[add-provider-config-default-model] provider_configs 不存在，跳过')
    return
  }
  if (!(await checkColumnExists(ds, 'provider_configs', 'default_model', isPg))) {
    await ds.query(`ALTER TABLE provider_configs ADD COLUMN default_model ${isPg ? 'text' : 'TEXT'}`)
    console.log('[add-provider-config-default-model] 加列 default_model')
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
  const rows = await ds.query(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`, [table])
  return rows.length > 0
}

async function checkColumnExists(ds: DataSource, table: string, column: string, isPg: boolean): Promise<boolean> {
  if (isPg) {
    const rows = await ds.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2 AND table_schema = current_schema() LIMIT 1`,
      [table, column],
    )
    return rows.length > 0
  }
  const rows = await ds.query(`SELECT 1 FROM pragma_table_info(?) WHERE name = ? LIMIT 1`, [table, column])
  return rows.length > 0
}
