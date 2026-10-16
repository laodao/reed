/**
 * 资源路径迁移：DB 中绝对路径 → 相对 dataPath 路径
 * @module core/database/migrations/asset-paths-to-relative
 *
 * 思路：旧数据中 Windows/POSIX 绝对路径（如 'C:\Users\daoge\the-bot\images\2026\03\x.png'
 * 或 '/home/user/the-bot/images/2026/03/x.png'）已经不能跨设备/跨平台使用。
 * 迁移策略：找到路径里第一个属于"已知数据子目录"的段（images/voice/portrait/...），
 * 从该段开始截取作为新相对路径。这能让 Windows 旧库里的路径在 Linux dataPath 下正确解析。
 */

import type { ICoreDatabaseManager } from '@core/database/database-manager.interface'

const KNOWN_DATA_SUBDIRS = [
  'images',
  'voice',
  'translations',
  'knowledge-base',
  'video',
  'portrait',
  'diary',
  'longwriting',
  'stv',
  'cache',
]

/**
 * 把单个值（绝对路径或相对路径）规整为"相对路径"。
 * - 已是相对路径：归一化分隔符返回
 * - 在已知子目录下的绝对路径：截取从已知子目录开始的部分
 * - 完全外部的绝对路径：原样返回（不强制移动）
 */
export function normalizeAssetPathToRelative(value: string | null | undefined): string | null {
  if (value == null) return value ?? null
  if (typeof value !== 'string' || value.length === 0) return value as any

  // 已是 URL（local-image:// 等）：保留
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return value

  // 归一化分隔符
  const normalized = value.replace(/\\/g, '/')

  // 寻找已知子目录段（绝对路径、相对路径、Windows 丢冒号路径如 'c/Users/...' 都用同一逻辑）
  const segments = normalized.split('/').filter(s => s.length > 0)
  for (let i = 0; i < segments.length; i++) {
    if (KNOWN_DATA_SUBDIRS.includes(segments[i])) {
      // 已经是 dataPath 内的相对路径（首段就是子目录）：原样返回
      if (i === 0 && !normalized.startsWith('/') && !/^[A-Za-z]:\//.test(normalized)) {
        return normalized
      }
      // 绝对/历史 URL 路径：从 known 子目录开始截取
      return segments.slice(i).join('/')
    }
  }

  // 没找到已知子目录：原样返回（兼容老用户外置文件）
  return normalized
}

interface MigrationStats {
  imageRecords: number
  voiceRecords: number
  portraitVariants: number
  diaryAttachments: number
  diaryEntries: number
  imageAssets: number
  kbDocuments: number
  lwCharacters: number
  lwLocations: number
  lwMaps: number
  locationBindings: number
  itemBindings: number
}

/**
 * 一次性扫描所有含路径字段的表，将绝对路径转换为相对路径。
 * 已经是相对路径的记录会被跳过（不必要更新）。
 *
 * 该迁移幂等：重复运行不会破坏数据。
 */
export async function migrateAssetPathsToRelative(
  db: ICoreDatabaseManager,
): Promise<MigrationStats> {
  const stats: MigrationStats = {
    imageRecords: 0,
    voiceRecords: 0,
    portraitVariants: 0,
    diaryAttachments: 0,
    diaryEntries: 0,
    imageAssets: 0,
    kbDocuments: 0,
    lwCharacters: 0,
    lwLocations: 0,
    lwMaps: 0,
    locationBindings: 0,
    itemBindings: 0,
  }

  const ds = db.dataSource
  if (!ds) return stats

  // images.file_path
  stats.imageRecords = await rewriteColumn(ds, 'images', 'file_path')

  // voice_records.input_audio_path / output_audio_path
  stats.voiceRecords =
    (await rewriteColumn(ds, 'voice_records', 'input_audio_path')) +
    (await rewriteColumn(ds, 'voice_records', 'output_audio_path'))

  // portrait_variants.image_path
  stats.portraitVariants = await rewriteColumn(ds, 'portrait_variants', 'image_path')

  // diary_attachments.file_path
  stats.diaryAttachments = await rewriteColumn(ds, 'diary_attachments', 'file_path')

  // diary_entries.file_path
  stats.diaryEntries = await rewriteColumn(ds, 'diary_entries', 'file_path')

  // image_assets.image_path
  stats.imageAssets = await rewriteColumn(ds, 'image_assets', 'image_path')

  // kb_documents.file_path
  stats.kbDocuments = await rewriteColumn(ds, 'kb_documents', 'file_path')

  // lw_story_characters.generated_image_id
  stats.lwCharacters = await rewriteColumn(ds, 'lw_story_characters', 'generated_image_id')

  // lw_story_locations.generated_image_id
  stats.lwLocations = await rewriteColumn(ds, 'lw_story_locations', 'generated_image_id')

  // lw_story_maps.image_path
  stats.lwMaps = await rewriteColumn(ds, 'lw_story_maps', 'image_path')

  // location_bindings.image_paths (JSON 数组)
  stats.locationBindings = await rewriteJsonArrayColumn(ds, 'location_bindings', 'image_paths')

  // item_bindings.image_paths (JSON 数组)
  stats.itemBindings = await rewriteJsonArrayColumn(ds, 'item_bindings', 'image_paths')

  return stats
}

/**
 * 批量重写一列字符串路径（绝对 → 相对）。返回更新行数。
 */
async function rewriteColumn(
  ds: NonNullable<ICoreDatabaseManager['dataSource']>,
  table: string,
  column: string,
): Promise<number> {
  if (!isSafeIdent(table) || !isSafeIdent(column)) return 0

  // 表/列存在性检查
  if (!(await tableHasColumn(ds, table, column))) return 0

  let updated = 0
  const rows: Array<{ id: string; v: string | null }> = await ds.query(
    `SELECT id AS id, ${column} AS v FROM ${quoteIdent(table)} WHERE ${column} IS NOT NULL AND ${column} != ''`,
  )
  for (const row of rows) {
    if (!row.v) continue
    const next = normalizeAssetPathToRelative(row.v)
    if (next !== row.v && next != null) {
      await ds.query(
        `UPDATE ${quoteIdent(table)} SET ${column} = ? WHERE id = ?`,
        [next, row.id],
      )
      updated++
    }
  }
  return updated
}

/**
 * 批量重写 JSON 数组列（每个元素都是路径）。
 */
async function rewriteJsonArrayColumn(
  ds: NonNullable<ICoreDatabaseManager['dataSource']>,
  table: string,
  column: string,
): Promise<number> {
  if (!isSafeIdent(table) || !isSafeIdent(column)) return 0
  if (!(await tableHasColumn(ds, table, column))) return 0

  let updated = 0
  const rows: Array<{ id: string; v: string | null }> = await ds.query(
    `SELECT id AS id, ${column} AS v FROM ${quoteIdent(table)} WHERE ${column} IS NOT NULL AND ${column} != ''`,
  )
  for (const row of rows) {
    if (!row.v) continue
    let arr: unknown
    try {
      arr = JSON.parse(row.v)
    } catch {
      continue
    }
    if (!Array.isArray(arr)) continue

    let changed = false
    const nextArr = arr.map(item => {
      if (typeof item !== 'string') return item
      const next = normalizeAssetPathToRelative(item)
      if (next !== item) changed = true
      return next
    })
    if (changed) {
      await ds.query(
        `UPDATE ${quoteIdent(table)} SET ${column} = ? WHERE id = ?`,
        [JSON.stringify(nextArr), row.id],
      )
      updated++
    }
  }
  return updated
}

async function tableHasColumn(
  ds: NonNullable<ICoreDatabaseManager['dataSource']>,
  table: string,
  column: string,
): Promise<boolean> {
  if (ds.options.type === 'better-sqlite3' || ds.options.type === 'sqlite') {
    const tableExists = await ds.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
      [table],
    )
    if (!tableExists || tableExists.length === 0) return false
    const cols: Array<{ name: string }> = await ds.query(
      `PRAGMA table_info(${quoteIdent(table)})`,
    )
    return cols.some(c => c.name === column)
  }
  // postgres
  const rows = await ds.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`,
    [table, column],
  )
  return rows.length > 0
}

function isSafeIdent(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name)
}

function quoteIdent(name: string): string {
  return `"${name}"`
}
