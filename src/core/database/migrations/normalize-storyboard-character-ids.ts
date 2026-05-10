/**
 * 老数据修复：storyboard.characters[].characterId 规范化
 * @module core/database/migrations/normalize-storyboard-character-ids
 *
 * 背景（spec 2026-05-09 ep-redesign · e2e report-shot-1.2.md Bug C）：
 *   修复后新拆的分镜走 normalizeAiCharacters 拿到真实 binding.id，但**老数据
 *   仍然在 DB 里带着 "李墨" / "su_bai" / "" 这种非 binding.id 值**，导致：
 *   - keyframe-generation 反查不到 binding，prompt 缺少角色描述
 *   - UI chip 显示「?」
 *
 *   本 migration 扫描所有 storyboards.characters 字段，按以下顺序修正：
 *     1. characterId 已是真实 character_binding.id（cb_xxx / preset_xxx）→ 跳过
 *     2. characterId 是 characterName / 长文 ID → 按 scene.characters 反查
 *     3. characterId 为空 → 用 expression 模糊匹配（包含/被包含）scene.characters
 *     4. 其他都修不好 → 保留原值 + log 警告（不阻塞，让 service 层 fallback）
 *
 *   仅写回 changed=true 的 storyboard，幂等（再跑一次什么都不改）。
 */

import type { DataSource } from 'typeorm'

interface SceneCharacterLite {
  characterBindingId?: string | null
  characterId?: string | null
  characterName?: string | null
  expression?: string | null
}

interface StoryboardCharacterRaw {
  characterId?: string
  characterName?: string
  expression?: string
  [k: string]: unknown
}

/** 真实 binding.id 前缀 — 老数据可能用 cb_ / preset_ */
function isLikelyBindingId(s: string): boolean {
  return s.startsWith('cb_') || s.startsWith('preset_')
}

/**
 * expression 模糊匹配：储存的 scene 级 expression 通常较短（"焦虑不安" /
 * "平静深邃"），分镜级扩写后通常以 scene 级为前缀或包含 scene 级关键字。
 * 取最长公共子串（>=2 字）的 scene character，没有匹配到返回 null。
 */
function matchByExpression(
  sbExpr: string,
  sceneChars: SceneCharacterLite[],
): string | null {
  if (!sbExpr) return null
  const candidates: Array<{ id: string; score: number }> = []
  for (const sc of sceneChars) {
    const id = sc.characterBindingId
    if (!id) continue
    const sceneExpr = sc.expression?.trim() || ''
    if (!sceneExpr) continue
    // 包含或被包含 → 强匹配
    if (sbExpr.includes(sceneExpr) || sceneExpr.includes(sbExpr)) {
      candidates.push({ id, score: sceneExpr.length })
      continue
    }
    // 前 2 字相同 → 弱匹配
    if (sceneExpr.length >= 2 && sbExpr.startsWith(sceneExpr.slice(0, 2))) {
      candidates.push({ id, score: 2 })
    }
  }
  if (candidates.length === 0) return null
  candidates.sort((a, b) => b.score - a.score)
  // 仅在最高分明显胜出（无并列）时采用，避免误匹配
  if (candidates.length >= 2 && candidates[0].score === candidates[1].score) {
    return null
  }
  return candidates[0].id
}

interface FixStat {
  storyboardsScanned: number
  storyboardsUpdated: number
  fixedById: number // 命中真实 binding.id（无需改）
  fixedByName: number // 名字反查
  fixedByLwId: number // 长文 ID 反查
  fixedByExpression: number // expression 兜底
  fixedByComplement: number // 互补兜底（scene 中剩余未占用的 binding）
  unfixedEmpty: number // 空字符串无法兜底
  unfixedUnknown: number // 名字反查不到
}

export async function normalizeStoryboardCharacterIds(
  ds: DataSource,
): Promise<FixStat> {
  const stat: FixStat = {
    storyboardsScanned: 0,
    storyboardsUpdated: 0,
    fixedById: 0,
    fixedByName: 0,
    fixedByLwId: 0,
    fixedByExpression: 0,
    fixedByComplement: 0,
    unfixedEmpty: 0,
    unfixedUnknown: 0,
  }

  const isPg = ds.options.type === 'postgres'
  if (!(await tableExists(ds, 'storyboards', isPg))) {
    console.log('[normalize-sb-char-ids] storyboards 表不存在，跳过')
    return stat
  }
  if (!(await tableExists(ds, 'scene_scripts', isPg))) {
    console.log('[normalize-sb-char-ids] scene_scripts 表不存在，跳过')
    return stat
  }

  // 取所有 storyboards（含 scene 级 characters 一并 join）
  const rows: Array<{
    sb_id: string
    sb_chars: string | null
    scene_chars: string | null
  }> = await ds.query(`
    SELECT s.id AS sb_id, s.characters AS sb_chars, ss.characters AS scene_chars
    FROM storyboards s
    LEFT JOIN scene_scripts ss ON ss.id = s.scene_script_id
    WHERE s.characters IS NOT NULL
  `)

  for (const row of rows) {
    stat.storyboardsScanned++
    const sbCharsRaw = parseJsonArray(row.sb_chars)
    if (!sbCharsRaw || sbCharsRaw.length === 0) continue

    const sceneChars = (parseJsonArray(row.scene_chars) ?? []) as SceneCharacterLite[]

    // 建索引
    const validBindingIds = new Set<string>()
    const nameToBindingId = new Map<string, string>()
    const lwcToBindingId = new Map<string, string>()
    for (const sc of sceneChars) {
      const bid = sc.characterBindingId ?? null
      if (bid) {
        validBindingIds.add(bid)
        if (sc.characterName) nameToBindingId.set(sc.characterName, bid)
        if (sc.characterId) lwcToBindingId.set(sc.characterId, bid)
      }
    }

    /*
     * 两遍策略：
     *   1. 第一遍 identity-based + expression：给每条 entry 计算 resolved，记录已占用 binding
     *   2. 第二遍互补兜底：对仍 unresolved 的 entry，若 scene.characters 中还**剩唯一一个**未被
     *      占用的 binding（且本分镜 entry 数 = scene 角色数），用之。多个剩余 → 不动（避免错配）。
     */
    type Slot = {
      original: string
      raw: StoryboardCharacterRaw
      resolved: string | null
      stat: 'id' | 'name' | 'lwc' | 'expr' | null
    }
    const slots: Slot[] = []
    const occupied = new Set<string>()

    for (const c of sbCharsRaw as StoryboardCharacterRaw[]) {
      if (!c || typeof c !== 'object') {
        slots.push({ original: '', raw: c as any, resolved: null, stat: null })
        continue
      }
      const original = typeof c.characterId === 'string' ? c.characterId : ''

      let resolved: string | null = null
      let kind: Slot['stat'] = null
      if (original) {
        if (validBindingIds.has(original)) {
          resolved = original
          kind = 'id'
        } else if (nameToBindingId.has(original)) {
          resolved = nameToBindingId.get(original)!
          kind = 'name'
        } else if (lwcToBindingId.has(original)) {
          resolved = lwcToBindingId.get(original)!
          kind = 'lwc'
        } else {
          const exprMatch = matchByExpression(c.expression || '', sceneChars)
          if (exprMatch) {
            resolved = exprMatch
            kind = 'expr'
          }
        }
      } else {
        const exprMatch = matchByExpression(c.expression || '', sceneChars)
        if (exprMatch) {
          resolved = exprMatch
          kind = 'expr'
        }
      }

      if (resolved) occupied.add(resolved)
      slots.push({ original, raw: c, resolved, stat: kind })
    }

    // 第二遍互补兜底
    for (const s of slots) {
      if (s.resolved !== null) continue
      if (!s.raw || typeof s.raw !== 'object') continue
      const remaining = [...validBindingIds].filter((b) => !occupied.has(b))
      if (remaining.length === 1) {
        s.resolved = remaining[0]
        s.stat = null // 单独计数到 fixedByComplement
        stat.fixedByComplement++
        occupied.add(remaining[0])
      }
    }

    // 累计 stat（按 kind）
    for (const s of slots) {
      if (s.stat === 'id') stat.fixedById++
      else if (s.stat === 'name') stat.fixedByName++
      else if (s.stat === 'lwc') stat.fixedByLwId++
      else if (s.stat === 'expr') stat.fixedByExpression++
    }

    // 写回 + warn
    let changed = false
    const fixed: StoryboardCharacterRaw[] = []
    for (const s of slots) {
      if (!s.raw || typeof s.raw !== 'object') {
        fixed.push(s.raw as any)
        continue
      }
      if (s.resolved !== null && s.resolved !== s.original) {
        fixed.push({ ...s.raw, characterId: s.resolved })
        changed = true
      } else if (s.resolved === null && s.original === '') {
        stat.unfixedEmpty++
        fixed.push(s.raw)
      } else if (s.resolved === null) {
        console.warn(
          `[normalize-sb-char-ids] sb=${row.sb_id} characterId="${s.original}" 无法反查，保留原值`,
        )
        stat.unfixedUnknown++
        fixed.push(s.raw)
      } else {
        fixed.push(s.raw)
      }
    }

    if (changed) {
      const json = JSON.stringify(fixed)
      if (isPg) {
        await ds.query(
          `UPDATE storyboards SET characters = $1, updated_at = NOW() WHERE id = $2`,
          [json, row.sb_id],
        )
      } else {
        await ds.query(
          `UPDATE storyboards SET characters = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [json, row.sb_id],
        )
      }
      stat.storyboardsUpdated++
    }
  }

  console.log(
    `[normalize-sb-char-ids] 扫描 ${stat.storyboardsScanned} 行 storyboards，` +
      `修复 ${stat.storyboardsUpdated} 行（id=${stat.fixedById} / name=${stat.fixedByName} / ` +
      `lwc=${stat.fixedByLwId} / expr=${stat.fixedByExpression} / complement=${stat.fixedByComplement} / ` +
      `unfixed_empty=${stat.unfixedEmpty} / unfixed_unknown=${stat.unfixedUnknown}）`,
  )
  return stat
}

// ─── helpers ──────────────────────────────────────────────────────

function parseJsonArray(raw: string | null | undefined): unknown[] | null {
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
