/**
 * 给所有声明了 userId 字段的 entity 表保障 user_id 列存在 + 旧数据回填
 * @module core/database/migrations/ensure-user-id-columns
 *
 * 背景：
 * - 多租户隔离方案是「单库 + 每张业务表 user_id 列 + BaseRepository 按 ALS userId 过滤」。
 * - Web 端用 PG，typeorm synchronize 会自动 ALTER TABLE 加列；PC 端用 raw DDL（initTables）
 *   建表，加了 entity 字段不会自动反映到 SQLite —— 必须显式迁移。
 *
 * 行为：
 * - 扫描 dataSource.entityMetadatas，找到所有声明了 userId 属性的 entity
 * - 对应表如果还没 user_id 列：ALTER TABLE ADD COLUMN
 * - 若传入 defaultUserId（PC 端单用户场景）：把所有 user_id IS NULL 的旧数据回填为该值
 *
 * 兼容 SQLite + PostgreSQL。
 */

import type { DataSource } from 'typeorm'

export async function ensureUserIdColumns(
  ds: DataSource,
  defaultUserId: string | null = null,
): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  for (const meta of ds.entityMetadatas) {
    // entity 必须显式声明 userId 属性（@Column({ name: 'user_id' })）才处理
    if (!meta.findColumnWithPropertyName('userId')) continue
    const tableName = meta.tableName

    // 检查表本身是否存在（synchronize 已建过表的就跳过）
    const tableExists = await checkTableExists(ds, tableName, isPg)
    if (!tableExists) continue

    // 检查 user_id 列是否存在
    const hasUserId = await checkColumnExists(ds, tableName, 'user_id', isPg)
    if (!hasUserId) {
      const colType = isPg ? 'varchar' : 'TEXT'
      await ds.query(`ALTER TABLE "${tableName}" ADD COLUMN user_id ${colType}`)
      console.log(`[ensure-user-id-columns] ${tableName}: 加 user_id 列`)
    }

    // 回填旧数据
    if (defaultUserId) {
      const placeholder = isPg ? '$1' : '?'
      const result = await ds.query(
        `UPDATE "${tableName}" SET user_id = ${placeholder} WHERE user_id IS NULL`,
        [defaultUserId],
      )
      const affected = isPg ? (Array.isArray(result) ? result[1] : 0) : (result?.changes ?? 0)
      if (affected > 0) {
        console.log(`[ensure-user-id-columns] ${tableName}: 回填 ${affected} 行旧数据 user_id=${defaultUserId}`)
      }
    }
  }
}

async function checkTableExists(
  ds: DataSource,
  tableName: string,
  isPg: boolean,
): Promise<boolean> {
  if (isPg) {
    const rows = await ds.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = $1 AND table_schema = current_schema() LIMIT 1`,
      [tableName],
    )
    return rows.length > 0
  }
  const rows = await ds.query(
    `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`,
    [tableName],
  )
  return rows.length > 0
}

async function checkColumnExists(
  ds: DataSource,
  tableName: string,
  columnName: string,
  isPg: boolean,
): Promise<boolean> {
  if (isPg) {
    const rows = await ds.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2 AND table_schema = current_schema() LIMIT 1`,
      [tableName, columnName],
    )
    return rows.length > 0
  }
  const rows = await ds.query(`PRAGMA table_info("${tableName}")`)
  return rows.some((r: { name: string }) => r.name === columnName)
}
