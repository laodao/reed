/**
 * 存量清理：合并同名重复资产 binding（2026-09-21 资产绑定去重归一）
 * @module core/database/migrations/merge-duplicate-bindings
 *
 * 背景：binding 有多条创建路径（剧集自动绑定 / 上传识别 / 手工 IPC / cogen /
 * script-binding-fixer），命名口径不一（全角空格、书名号、"雪麓山庄" 前缀有无），
 * 去重各管各的 → 同名重复 binding 落库（实测 vp_1789922608027_am0itsdzp：
 * 沈云萝×2 / 秦越×2 / 白鹿城×2 / 书房类×3）。
 *
 * 策略（对每个项目独立分组）：
 *   1. 按归一化名字分组 character_bindings / location_bindings / item_bindings
 *      （key = standalone_name ?? override_name ?? location_name/item_name，走
 *      normalizeBindingName；角色不按 alias 合并——昵称相等不足以判定同一角色）；
 *   2. 地点额外做前缀归一并组：组名以另一组名开头（前缀 ≥2 字）且剩余 ≥2 字、
 *      剩余本身也是组名 → 并入剩余组（"雪麓山庄书房" 并入 "书房"）；
 *   3. 组内 >1 条时保留"有 confirmed asset_image 的最早一条"（都没有则最早一条）；
 *   4. 重指向引用到保留者：scene_scripts.location_binding_id、
 *      scene_scripts.characters JSON 的 characterBindingId、scene_characters.
 *      character_binding_id、storyboards.characters JSON 的 characterId、
 *      storyboards.location_binding_ids / item_binding_ids JSON、
 *      storyboard_characters.character_id、scene_props.item_binding_id、
 *      asset_image.asset_id（图行只改归属，不删图）；
 *   5. 删除其余 binding 行。
 *
 * 幂等：合并后每组只剩 1 条、引用均已指向保留者，重复执行不再变更。
 * 兼容 SQLite + PG。表不存在则跳过对应部分。
 */

import type { DataSource } from 'typeorm'

/**
 * 名字归一化（原 binding-name-utils 内联至此——该工具模块已随 the-chat-bot 分支
 * 裁剪移除，迁移保留以维持存量库升级路径）：trim、全角空格转半角、去书名号/引号、
 * 去全部空白、ASCII 小写化。
 */
function normalizeBindingName(name: string | null | undefined): string {
  if (!name) return ''
  return name
    .replace(/\u3000/g, ' ')
    .replace(/[《》〈〉"'“”‘’「」『』]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase()
}

export interface MergeDuplicateBindingsStat {
  characterGroups: number
  charactersMerged: number
  locationGroups: number
  locationsMerged: number
  itemGroups: number
  itemsMerged: number
  referencesRepointed: number
  imagesMoved: number
}

type BindingKind = 'character' | 'location' | 'item'

interface BindingRow {
  id: string
  projectId: string | null
  groupKey: string
  createdMs: number
  /** 原始加载顺序，created_at 解析不出时稳定兜底 */
  ord: number
}

const BINDING_TABLE: Record<BindingKind, string> = {
  character: 'character_bindings',
  location: 'location_bindings',
  item: 'item_bindings',
}

export async function mergeDuplicateBindings(
  ds: DataSource,
): Promise<MergeDuplicateBindingsStat> {
  const stat: MergeDuplicateBindingsStat = {
    characterGroups: 0,
    charactersMerged: 0,
    locationGroups: 0,
    locationsMerged: 0,
    itemGroups: 0,
    itemsMerged: 0,
    referencesRepointed: 0,
    imagesMoved: 0,
  }
  const isPg = ds.options.type === 'postgres'

  if (await tableExists(ds, 'character_bindings', isPg)) {
    const r = await mergeKind(ds, 'character', isPg, stat)
    stat.characterGroups = r.groups
    stat.charactersMerged = r.merged
  }
  if (await tableExists(ds, 'location_bindings', isPg)) {
    const r = await mergeKind(ds, 'location', isPg, stat)
    stat.locationGroups = r.groups
    stat.locationsMerged = r.merged
  }
  if (await tableExists(ds, 'item_bindings', isPg)) {
    const r = await mergeKind(ds, 'item', isPg, stat)
    stat.itemGroups = r.groups
    stat.itemsMerged = r.merged
  }

  if (stat.charactersMerged + stat.locationsMerged + stat.itemsMerged > 0) {
    console.log(
      `[merge-duplicate-bindings] 合并完成 — ` +
        `character ${stat.charactersMerged}（${stat.characterGroups} 组）/ ` +
        `location ${stat.locationsMerged}（${stat.locationGroups} 组）/ ` +
        `item ${stat.itemsMerged}（${stat.itemGroups} 组），` +
        `重指向引用 ${stat.referencesRepointed} 处，迁移 asset_image ${stat.imagesMoved} 行`,
    )
  } else {
    console.log('[merge-duplicate-bindings] 无重复 binding，跳过')
  }
  return stat
}

// ─── 单类 binding 合并 ─────────────────────────────────────────────

async function mergeKind(
  ds: DataSource,
  kind: BindingKind,
  isPg: boolean,
  stat: MergeDuplicateBindingsStat,
): Promise<{ groups: number; merged: number }> {
  const table = BINDING_TABLE[kind]
  const nameCol = kind === 'location' ? 'location_name' : kind === 'item' ? 'item_name' : null
  const rows: Array<Record<string, unknown>> = await ds.query(
    `SELECT id, project_id, standalone_name, override_name${nameCol ? `, ${nameCol}` : ''}, created_at FROM ${table}`,
  )

  // 1. 按 项目 + 归一化名字 分组（名字定不出的行跳过，不动）
  const groups = new Map<string, BindingRow[]>() // key = `${projectId}::${groupKey}`
  rows.forEach((r, ord) => {
    const groupKey = normalizeBindingName(
      (r.standalone_name as string | null) ??
        (r.override_name as string | null) ??
        (nameCol ? (r[nameCol] as string | null) : null),
    )
    if (!groupKey) return
    const key = `${(r.project_id as string | null) ?? ''}::${groupKey}`
    const row: BindingRow = {
      id: r.id as string,
      projectId: (r.project_id as string | null) ?? null,
      groupKey,
      createdMs: toMillis(r.created_at),
      ord,
    }
    const list = groups.get(key)
    if (list) list.push(row)
    else groups.set(key, [row])
  })

  // 2. 地点前缀归一并组："雪麓山庄书房" 并入 "书房"（需 "雪麓山庄" 也是组名）
  if (kind === 'location') {
    mergeLocationPrefixGroups(groups)
  }

  // 3. 组内 >1 条 → 选保留者、重指向、删多余行
  let mergedGroups = 0
  let mergedRows = 0
  for (const list of groups.values()) {
    if (list.length < 2) continue
    list.sort((a, b) => a.createdMs - b.createdMs || a.ord - b.ord)
    const keeper = await pickKeeper(ds, kind, list)
    const losers = list.filter((r) => r.id !== keeper.id)
    console.log(
      `[merge-duplicate-bindings] ${kind} "${keeper.groupKey}"（项目 ${keeper.projectId}）` +
        `共 ${list.length} 条，保留 ${keeper.id}，合并 ${losers.map((l) => l.id).join(', ')}`,
    )
    for (const loser of losers) {
      await repointReferences(ds, kind, loser.id, keeper.id, isPg, stat)
      await ds.query(`DELETE FROM ${table} WHERE id = ${ph(isPg, 1)}`, [loser.id])
      mergedRows++
    }
    mergedGroups++
  }
  return { groups: mergedGroups, merged: mergedRows }
}

/**
 * 地点前缀并组：组名 K 以另一组名 P 开头（P ≥2 字），剩余 R = K - P ≥2 字且 R
 * 也是组名 → K 组并入 R 组。同项目内生效，最长前缀优先。
 * 防误并："白鹿城门口" 剥 "白鹿城" 剩 "门口"，"门口" 不是组名 → 不并。
 */
function mergeLocationPrefixGroups(groups: Map<string, BindingRow[]>): void {
  // 按项目分组处理（跨项目不允许借前缀）
  const byProject = new Map<string, Map<string, BindingRow[]>>()
  for (const [key, list] of groups) {
    const sep = key.indexOf('::')
    const projectId = key.slice(0, sep)
    const name = key.slice(sep + 2)
    let m = byProject.get(projectId)
    if (!m) {
      m = new Map()
      byProject.set(projectId, m)
    }
    m.set(name, list)
  }

  for (const [projectId, nameGroups] of byProject) {
    // 可能一轮并入后产生新的可并组（链式前缀），迭代到收敛
    let changed = true
    while (changed) {
      changed = false
      const names = [...nameGroups.keys()].sort((a, b) => b.length - a.length)
      for (const name of names) {
        if (!nameGroups.has(name)) continue
        for (const prefix of names) {
          if (prefix === name || !nameGroups.has(prefix)) continue
          if (prefix.length < 2 || prefix.length >= name.length) continue
          if (!name.startsWith(prefix)) continue
          const remainder = name.slice(prefix.length)
          if (remainder.length < 2 || !nameGroups.has(remainder)) continue
          const from = nameGroups.get(name)!
          const into = nameGroups.get(remainder)!
          console.log(
            `[merge-duplicate-bindings] location 前缀归一并组：项目 ${projectId} ` +
              `"${name}" 并入 "${remainder}"（前缀 "${prefix}"）`,
          )
          into.push(...from)
          nameGroups.delete(name)
          groups.delete(`${projectId}::${name}`)
          changed = true
          break
        }
        if (changed) break
      }
    }
  }
}

/** 保留者：有 confirmed asset_image 的最早一条；都没有 confirmed 则最早一条 */
async function pickKeeper(
  ds: DataSource,
  kind: BindingKind,
  list: BindingRow[],
): Promise<BindingRow> {
  if (!(await tableExists(ds, 'asset_image', ds.options.type === 'postgres'))) {
    return list[0]
  }
  const isPg = ds.options.type === 'postgres'
  for (const row of list) {
    const hit = await ds.query(
      `SELECT 1 AS x FROM asset_image WHERE asset_type = ${ph(isPg, 1)} AND asset_id = ${ph(isPg, 2)} AND confirmed = 1 LIMIT 1`,
      [kind, row.id],
    )
    if (hit.length > 0) return row
  }
  return list[0]
}

// ─── 引用重指向 ────────────────────────────────────────────────────

async function repointReferences(
  ds: DataSource,
  kind: BindingKind,
  fromId: string,
  toId: string,
  isPg: boolean,
  stat: MergeDuplicateBindingsStat,
): Promise<void> {
  // asset_image：图行只改归属，不删图
  if (await tableExists(ds, 'asset_image', isPg)) {
    const r = await ds.query(
      `UPDATE asset_image SET asset_id = ${ph(isPg, 1)} WHERE asset_type = ${ph(isPg, 2)} AND asset_id = ${ph(isPg, 3)}`,
      [toId, kind, fromId],
    )
    stat.imagesMoved += affectedRows(r)
  }

  if (kind === 'character') {
    // scene_scripts.characters JSON 里的 characterBindingId
    stat.referencesRepointed += await repointJsonField(
      ds, isPg, 'scene_scripts', 'characters', fromId,
      (entry) => entry.characterBindingId === fromId,
      (entry) => { entry.characterBindingId = toId },
    )
    // scene_characters.character_binding_id 列
    stat.referencesRepointed += await repointColumn(
      ds, isPg, 'scene_characters', 'character_binding_id', fromId, toId,
    )
    // storyboards.characters JSON 里的 characterId
    stat.referencesRepointed += await repointJsonField(
      ds, isPg, 'storyboards', 'characters', fromId,
      (entry) => entry.characterId === fromId,
      (entry) => { entry.characterId = toId },
    )
    // storyboard_characters.character_id 列
    stat.referencesRepointed += await repointColumn(
      ds, isPg, 'storyboard_characters', 'character_id', fromId, toId,
    )
  } else if (kind === 'location') {
    stat.referencesRepointed += await repointColumn(
      ds, isPg, 'scene_scripts', 'location_binding_id', fromId, toId,
    )
    stat.referencesRepointed += await repointJsonArrayColumn(
      ds, isPg, 'storyboards', 'location_binding_ids', fromId, toId,
    )
  } else {
    stat.referencesRepointed += await repointJsonArrayColumn(
      ds, isPg, 'storyboards', 'item_binding_ids', fromId, toId,
    )
    stat.referencesRepointed += await repointColumn(
      ds, isPg, 'scene_props', 'item_binding_id', fromId, toId,
    )
  }
}

/** 直列重指向（表不存在 / 列不存在则跳过）。返回受影响行数。 */
async function repointColumn(
  ds: DataSource,
  isPg: boolean,
  table: string,
  column: string,
  fromId: string,
  toId: string,
): Promise<number> {
  if (!(await tableExists(ds, table, isPg))) return 0
  if (!(await columnExists(ds, table, column, isPg))) return 0
  const r = await ds.query(
    `UPDATE ${table} SET ${column} = ${ph(isPg, 1)} WHERE ${column} = ${ph(isPg, 2)}`,
    [toId, fromId],
  )
  return affectedRows(r)
}

/**
 * JSON 对象数组列重指向：LIKE 预筛 → parse → 逐 entry 改 → 有变化才写回。
 * 用于 scene_scripts.characters（characterBindingId）/ storyboards.characters（characterId）。
 */
async function repointJsonField(
  ds: DataSource,
  isPg: boolean,
  table: string,
  column: string,
  fromId: string,
  match: (entry: Record<string, unknown>) => boolean,
  rewrite: (entry: Record<string, unknown>) => void,
): Promise<number> {
  if (!(await tableExists(ds, table, isPg))) return 0
  const rows: Array<{ id: string; raw: string | null }> = await ds.query(
    `SELECT id, ${column} AS raw FROM ${table} WHERE ${column} LIKE '%' || ${ph(isPg, 1)} || '%'`,
    [fromId],
  )
  let updated = 0
  for (const row of rows) {
    const arr = parseJsonArray(row.raw)
    if (!arr) continue
    let changed = false
    for (const entry of arr) {
      if (entry && typeof entry === 'object' && match(entry as Record<string, unknown>)) {
        rewrite(entry as Record<string, unknown>)
        changed = true
      }
    }
    if (!changed) continue
    await ds.query(
      `UPDATE ${table} SET ${column} = ${ph(isPg, 1)}, updated_at = ${nowExpr(isPg)} WHERE id = ${ph(isPg, 2)}`,
      [JSON.stringify(arr), row.id],
    )
    updated++
  }
  return updated
}

/**
 * JSON 字符串数组列重指向（storyboards.location_binding_ids / item_binding_ids）。
 */
async function repointJsonArrayColumn(
  ds: DataSource,
  isPg: boolean,
  table: string,
  column: string,
  fromId: string,
  toId: string,
): Promise<number> {
  if (!(await tableExists(ds, table, isPg))) return 0
  const rows: Array<{ id: string; raw: string | null }> = await ds.query(
    `SELECT id, ${column} AS raw FROM ${table} WHERE ${column} LIKE '%' || ${ph(isPg, 1)} || '%'`,
    [fromId],
  )
  let updated = 0
  for (const row of rows) {
    const arr = parseJsonArray(row.raw)
    if (!arr) continue
    let changed = false
    const next = arr.map((v) => {
      if (v === fromId) {
        changed = true
        return toId
      }
      return v
    })
    if (!changed) continue
    await ds.query(
      `UPDATE ${table} SET ${column} = ${ph(isPg, 1)}, updated_at = ${nowExpr(isPg)} WHERE id = ${ph(isPg, 2)}`,
      [JSON.stringify(next), row.id],
    )
    updated++
  }
  return updated
}

// ─── helpers ──────────────────────────────────────────────────────

function ph(isPg: boolean, n: number): string {
  return isPg ? `$${n}` : '?'
}

function nowExpr(isPg: boolean): string {
  return isPg ? 'NOW()' : 'CURRENT_TIMESTAMP'
}

/** UPDATE 返回值兼容：PG rowCount / better-sqlite3 changes / 其他按 0 */
function affectedRows(r: unknown): number {
  if (Array.isArray(r)) return 0
  if (r && typeof r === 'object') {
    const o = r as Record<string, unknown>
    if (typeof o.rowCount === 'number') return o.rowCount
    if (typeof o.changes === 'number') return o.changes
  }
  return 0
}

function parseJsonArray(raw: unknown): unknown[] | null {
  if (raw === null || raw === undefined) return null
  if (Array.isArray(raw)) return raw
  if (typeof raw !== 'string') return null
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v : null
  } catch {
    return null
  }
}

/** created_at 可能是 epoch ms（entity quirk）、ISO 字符串或 Date；解析不出归 0（保持原顺序兜底） */
function toMillis(v: unknown): number {
  if (typeof v === 'number') return v
  if (v instanceof Date) return v.getTime()
  if (typeof v === 'string') {
    const t = Date.parse(v)
    if (!Number.isNaN(t)) return t
    const n = Number(v)
    if (!Number.isNaN(n)) return n
  }
  return 0
}

async function tableExists(
  ds: DataSource,
  tableName: string,
  isPg: boolean,
): Promise<boolean> {
  if (isPg) {
    const rows: Array<{ exists: boolean }> = await ds.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = $1
       ) AS exists`,
      [tableName],
    )
    return rows[0]?.exists === true
  }
  const rows: Array<{ name: string }> = await ds.query(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
    [tableName],
  )
  return rows.length > 0
}

async function columnExists(
  ds: DataSource,
  tableName: string,
  columnName: string,
  isPg: boolean,
): Promise<boolean> {
  if (isPg) {
    const rows: Array<{ exists: boolean }> = await ds.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
       ) AS exists`,
      [tableName, columnName],
    )
    return rows[0]?.exists === true
  }
  const rows: Array<{ name: string }> = await ds.query(
    `PRAGMA table_info(${tableName})`,
  )
  return rows.some((r) => r.name === columnName)
}
