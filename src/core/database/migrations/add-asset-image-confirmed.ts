/**
 * asset_image 增加 confirmed 字段（定妆图确认闸门 · S-05，2026-09-17）
 *
 * 语义：confirmed=1 的图才会被关键帧参考图选择器（reference-image-selector）选用。
 *
 * 回填：列首次创建时，把存量 is_main=1 的行全部置 confirmed=1
 * （兼容第一集现有定妆图，迁移后老数据选图行为不变）。
 * 只在"列刚加上"的那一次执行回填——用户后续「撤销确认」的行不会被重启重置。
 *
 * SQLite + PG 兼容，幂等。
 */

import type { DataSource } from 'typeorm'
import { checkTableExists, checkColumnExists, ensureColumn } from './migration-utils'

export async function addAssetImageConfirmed(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  if (!(await checkTableExists(ds, 'asset_image', isPg))) {
    console.log('[add-asset-image-confirmed] asset_image 不存在，跳过')
    return
  }

  const existed = await checkColumnExists(ds, 'asset_image', 'confirmed', isPg)
  await ensureColumn(
    ds,
    isPg,
    'asset_image',
    'confirmed',
    `confirmed ${isPg ? 'integer' : 'INTEGER'} DEFAULT 0`,
    'add-asset-image-confirmed',
  )

  // 回填仅跑一次：列此前已存在说明已迁移过，跳过（保留用户撤销确认的状态）
  if (existed) return

  await ds.query(
    `UPDATE asset_image SET confirmed = 1 WHERE is_main = 1 AND (confirmed IS NULL OR confirmed = 0)`,
  )
  console.log('[add-asset-image-confirmed] 存量 is_main=1 行已回填 confirmed=1')
}
