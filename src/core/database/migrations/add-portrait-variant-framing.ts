/**
 * portrait_variants 增加 framing（取景范围 half/full）字段。
 *
 * 新版人像设计（spec 2026-07-24）引入半身/全身维度：
 * 存量行回填 'full'（历史上所有生成均硬编码全身后缀）。
 *
 * 幂等加列。兼容 SQLite + PG。
 */

import type { DataSource } from 'typeorm'

export async function addPortraitVariantFraming(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  if (!(await checkTableExists(ds, 'portrait_variants', isPg))) {
    console.log('[add-portrait-variant-framing] portrait_variants 不存在，跳过')
    return
  }

  if (!(await checkColumnExists(ds, 'portrait_variants', 'framing', isPg))) {
    const type = isPg ? 'text' : 'TEXT'
    await ds.query(`ALTER TABLE portrait_variants ADD COLUMN framing ${type}`)
    console.log('[add-portrait-variant-framing] 加列 framing')
  }

  await ds.query(`UPDATE portrait_variants SET framing = 'full' WHERE framing IS NULL`)
  console.log('[add-portrait-variant-framing] 存量行回填 framing=full')
}

async function checkTableExists(
  ds: DataSource,
  table: string,
  isPg: boolean,
): Promise<boolean> {
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
  const rows = await ds.query(`PRAGMA table_info(${table})`)
  return rows.some((r: { name: string }) => r.name === column)
}
