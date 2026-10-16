/**
 * 分享令牌存量明文清理（评审 #74）
 * @module core/database/migrations/sanitize-share-tokens
 * @description 2026-08-27 起新令牌只存 sha256 hash，但存量行仍可能带明文列：
 *              1) 明文存在而 hash 缺失 → 先按明文回填 hash（老链接不失效）
 *              2) hash 就位后清空明文列（DB 泄露不再等于全部分享链接泄露）
 *              幂等：重跑时明文行已清空，两步均 0 命中。
 *              workflow_definitions 与 apps 两处同构处理。
 */
import type { DataSource } from 'typeorm'
import crypto from 'node:crypto'
import { createLogger } from '@core/utils/logger'

const logger = createLogger('sanitize-share-tokens')

export async function sanitizeShareTokens(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'
  await sanitizeTable(ds, isPg, 'workflow_definitions', 'share_token', 'share_token_hash')
  await sanitizeTable(ds, isPg, 'apps', 'share_token', 'share_token_hash')
}

async function sanitizeTable(
  ds: DataSource,
  isPg: boolean,
  table: string,
  plainCol: string,
  hashCol: string,
): Promise<void> {
  // 目标表可能尚未创建（注册顺序：本迁移早于 create-apps-tables）——无表则跳过，等表建好后重跑自然幂等
  if (!(await tableExists(ds, isPg, table))) {
    logger.info(`[sanitize-share-tokens] 表 ${table} 不存在，跳过（后续启动会重跑）`)
    return
  }
  // 双方言占位符：PG 用 $n，SQLite 用 ?
  const ph = (n: number) => (isPg ? `$${n}` : '?')
  // 1) 明文回填 hash（仅 hash 缺失的行；已 hash 的行不动）
  const plainRows: Array<{ id: string; token: string }> = await ds.query(
    `SELECT id, ${plainCol} AS token FROM ${table} WHERE ${plainCol} IS NOT NULL AND (${hashCol} IS NULL OR ${hashCol} = '')`
  )
  for (const row of plainRows) {
    if (!row.token) continue
    const hash = crypto.createHash('sha256').update(row.token).digest('hex')
    await ds.query(`UPDATE ${table} SET ${hashCol} = ${ph(1)} WHERE id = ${ph(2)}`, [hash, row.id])
  }
  if (plainRows.length > 0) {
    logger.info(`[sanitize-share-tokens] ${table}: 回填 hash ${plainRows.length} 行`)
  }

  // 2) 清空明文列（hash 已就位或本来就无明文）
  await ds.query(`UPDATE ${table} SET ${plainCol} = NULL WHERE ${plainCol} IS NOT NULL AND ${hashCol} IS NOT NULL`)
}

/** 表存在性检查（双方言；与 create-apps-tables 的惯例一致，各迁移文件本地定义） */
async function tableExists(ds: DataSource, isPg: boolean, table: string): Promise<boolean> {
  if (isPg) {
    const rows = await ds.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = $1 AND table_schema = current_schema() LIMIT 1`,
      [table]
    )
    return rows.length > 0
  }
  const rows = await ds.query(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`, [table])
  return rows.length > 0
}
