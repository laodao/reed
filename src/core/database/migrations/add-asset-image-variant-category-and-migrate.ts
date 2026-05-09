/**
 * asset_image · location 域三类变体合并到统一 'variant' category（spec 2026-05-09）
 *
 * 背景：
 *   旧模型把地点变体按维度强制分成三类 category（time_variant / weather_variant / angle_variant），
 *   每类 label 也限定枚举（morning / sunny / wide_shot 等）。spec 2026-05-09 改造后地点
 *   只有"主图"和"变体"两类，label 自由文本，维度信息落到 metadata JSON。
 *
 * 行为（仅作用于 asset_type='location'，character / item 不动）：
 *   1. 把 category IN (time_variant, weather_variant, angle_variant) 的行 UPDATE 为
 *      category='variant'；
 *   2. 原 label（英文 key 如 'morning' / 'sunny' / 'wide_shot'）翻译成中文显示词
 *      （"早晨" / "晴" / "远景"）；
 *   3. 原 category 对应的维度落到 metadata JSON 的对应 key（time_variant 的 label
 *      'morning' → metadata.time='morning'，便于评分系统继续按维度命中）；
 *   4. 主图（category='main' AND isMain=1 AND label IS NULL/空）补默认 label '默认主图'；
 *
 * 幂等：通过 WHERE category IN (旧三类) 条件天然实现 — 重跑无作用。
 *
 * 不可逆：UPDATE 直接覆盖 category 与 label；旧值仅 metadata 仍保留维度信息可反推。
 *
 * SQLite + PG 都支持 UPDATE … FROM 子查询写法，但为了兼容性这里用单条 UPDATE WHERE，
 * label 翻译表通过 CASE 表达式落库。
 */

import type { DataSource } from 'typeorm'

/** label 翻译表：旧英文 key → 中文显示词 */
const LABEL_CN: Record<string, string> = {
  // time_variant
  morning: '早晨',
  noon: '中午',
  afternoon: '午后',
  evening: '傍晚',
  night: '夜间',
  dawn: '拂晓',
  dusk: '黄昏',
  // weather_variant
  sunny: '晴',
  cloudy: '阴',
  rainy: '雨',
  snowy: '雪',
  foggy: '雾',
  stormy: '暴风',
  // angle_variant
  wide_shot: '远景',
  entrance: '入口',
  interior_a: '内景 A',
  interior_b: '内景 B',
}

/** 旧 category → metadata 维度 key */
const CATEGORY_TO_METADATA_KEY: Record<string, 'time' | 'weather' | 'angle'> = {
  time_variant: 'time',
  weather_variant: 'weather',
  angle_variant: 'angle',
}

export async function addAssetImageVariantCategoryAndMigrate(
  ds: DataSource,
): Promise<void> {
  if (!(await checkTableExists(ds, 'asset_image'))) {
    console.log('[migrate-location-variants] asset_image 不存在，跳过')
    return
  }

  const isPg = ds.options.type === 'postgres'
  // 不同 driver 占位符不同：PG = $1/$2/$3，SQLite = ?
  const ph = (n: number): string => (isPg ? `$${n}` : '?')

  // 取所有需迁移的行
  const rows = await ds.query(
    `SELECT id, category, label, metadata
       FROM asset_image
      WHERE asset_type = 'location'
        AND category IN ('time_variant','weather_variant','angle_variant')`,
  )

  if (rows.length > 0) {
    console.log(
      `[migrate-location-variants] 准备迁移 ${rows.length} 行 location 旧变体到 'variant'`,
    )

    for (const r of rows) {
      const oldCategory = r.category as string
      const oldLabel = (r.label as string | null) ?? ''
      const dimKey = CATEGORY_TO_METADATA_KEY[oldCategory]

      // metadata 合并：保留旧 metadata 内容，把维度值写到对应 key
      let metaObj: Record<string, unknown> = {}
      if (r.metadata) {
        try {
          const parsed =
            typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            metaObj = parsed as Record<string, unknown>
          }
        } catch {
          // 旧 metadata 非合法 JSON 就丢弃，从空开始；旧维度仍可从 oldLabel 反推
        }
      }
      // 若该维度 key 已有值（极少见），不覆盖；否则用 oldLabel 填
      if (dimKey && oldLabel && metaObj[dimKey] === undefined) {
        metaObj[dimKey] = oldLabel
      }

      // 新 label：中文翻译；翻译表里没有就保留原 label（自定义场景）
      const newLabel = LABEL_CN[oldLabel] ?? oldLabel ?? null

      await ds.query(
        `UPDATE asset_image
            SET category = 'variant',
                label = ${ph(1)},
                metadata = ${ph(2)}
          WHERE id = ${ph(3)}`,
        [newLabel, JSON.stringify(metaObj), r.id],
      )
    }
    console.log(
      `[migrate-location-variants] 已迁移 ${rows.length} 行 → category='variant'`,
    )
  }

  // 主图补默认 label（仅 location 域，仅 isMain=1 且 label 为空的）
  await ds.query(
    `UPDATE asset_image
        SET label = '默认主图'
      WHERE asset_type = 'location'
        AND category = 'main'
        AND is_main = 1
        AND (label IS NULL OR label = '')`,
  )
}

async function checkTableExists(ds: DataSource, table: string): Promise<boolean> {
  const isPg = ds.options.type === 'postgres'
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
