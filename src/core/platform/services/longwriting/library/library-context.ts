/**
 * 世界观库上下文注入器（设定资产库 P0-2026-09-24）
 * @module platform/services/longwriting/library/library-context
 *
 * 「活引用直注入」（设计 §3.1 决策二 / §5.2 2b 段）：体系与规则类设定不落项目表、
 * 无故事内状态，写作时按绑定直接从库读 pinned 条目进 prompt；库更新即时生效。
 * 预算：longwritingParams().writing.worldContextMaxTokens（0=关闭），
 * 超限按 pinned > rank > kind 序裁剪并在尾部标注截断。
 * P1 扩展点：2c 触发式注入（扫描大纲/设计卡命中条目 name+aliases）。
 */

import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { longwritingParams } from '@shared/utils/longwriting-params'
import { estimateContextTokens } from '../chapter-context'
import type { WorldBinding, WorldEntry } from '@shared/types/lw-library.types'

const KIND_LABELS: Record<string, string> = {
  power_system: '力量体系',
  realm: '境界',
  aptitude: '资质体系',
  sect: '门派',
  region: '地域',
  country: '国别',
  weapon: '法宝',
  pill: '丹药',
  herb: '仙草',
  spell: '法术',
  art: '功法',
  rule: '规则禁忌',
  economy: '经济',
  history_event: '历史',
  daily_life: '日常',
}

/**
 * 触发式注入（设计 §5.2 2c）的命中器：条目 name 或任一 alias 出现在扫描窗口即命中。
 * 纯函数，单测覆盖；扫描窗口 = 本章大纲 + 设计卡 + 上一章结尾。
 */
export function matchEntriesInText(entries: WorldEntry[], scanText: string, cap = 8): WorldEntry[] {
  if (!scanText) return []
  const hits: WorldEntry[] = []
  for (const entry of entries) {
    const needles = [entry.name, ...entry.aliases].filter(n => n && n.length >= 2)
    if (needles.some(n => scanText.includes(n))) {
      hits.push(entry)
      if (hits.length >= cap) break
    }
  }
  return hits
}

/** 单条目紧凑序列化（进 prompt 的形态：名称｜别名｜摘要｜关键字段） */
export function serializeWorldEntry(entry: WorldEntry): string {
  const parts: string[] = [entry.name]
  if (entry.aliases.length > 0) parts.push(`（${entry.aliases.join('/')}）`)
  const rank = (entry.fields as any)?.rank
  if (rank) parts.push(`[${rank}]`)
  if (entry.summary) parts.push(`：${entry.summary}`)
  const extraFields = Object.entries(entry.fields ?? {})
    .filter(([k]) => k !== 'rank')
    .slice(0, 4)
  for (const [k, v] of extraFields) {
    if (typeof v === 'string' && v.trim()) parts.push(`${k}=${v.trim()}`)
  }
  return `- ${parts.join('')}`
}

export async function buildWorldLibraryContext(projectId: string, scanText?: string): Promise<string> {
  const budgetTokens = longwritingParams().writing.worldContextMaxTokens
  if (budgetTokens <= 0) return ''

  const db = getCoreDatabaseManager()
  const bindings = await db.lwWorldBindings?.listByProjectId(projectId)
  if (!bindings || bindings.length === 0) return ''

  // 悬空绑定（库已删除）跳过——只有库还存在的绑定才有活引用
  const liveBindings: Array<WorldBinding & { worldExists: boolean }> = []
  for (const binding of bindings) {
    const world = await db.lwWorlds?.getById(binding.worldId)
    liveBindings.push({ ...binding, worldExists: !!world })
  }
  const active = liveBindings.filter(b => b.worldExists)
  if (active.length === 0) return ''

  // 主世界优先
  active.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))

  const sections: string[] = []
  for (const binding of active) {
    const world = await db.lwWorlds!.getById(binding.worldId)
    if (!world) continue
    const pinnedEntries = await db.lwWorldEntries!.listPinnedByWorldId(binding.worldId)
    const disabled = new Set(binding.config?.disabledEntryIds ?? [])
    const pinnedKindKeys = new Set(binding.config?.pinnedKindKeys ?? [])
    // 候选 = pinned 条目 + 配置强制常驻的 kind 下的全部条目
    let candidates = pinnedEntries.filter(e => !disabled.has(e.id))
    if (pinnedKindKeys.size > 0) {
      const seen = new Set(candidates.map(e => e.id))
      for (const kindKey of pinnedKindKeys) {
        const byKind = await db.lwWorldEntries!.listByWorldAndKind(binding.worldId, kindKey)
        for (const entry of byKind) {
          if (!disabled.has(entry.id) && !seen.has(entry.id)) {
            candidates = [...candidates, entry]
            seen.add(entry.id)
          }
        }
      }
    }

    const byKind = new Map<string, WorldEntry[]>()
    for (const entry of candidates) {
      const list = byKind.get(entry.kindKey) ?? []
      list.push(entry)
      byKind.set(entry.kindKey, list)
    }

    const lines: string[] = []
    lines.push(`**世界观库：${world.name}**${world.tagline ? `——${world.tagline}` : ''}`)
    if (world.description) {
      lines.push(world.description.length > 300 ? `${world.description.slice(0, 300)}…` : world.description)
    }
    for (const [kindKey, entries] of byKind) {
      const label = KIND_LABELS[kindKey] ?? kindKey
      lines.push(`【${label}】`)
      for (const entry of entries) lines.push(serializeWorldEntry(entry))
    }
    // 故事级覆写附注
    for (const override of binding.config?.overrides ?? []) {
      const entry = candidates.find(e => e.id === override.entryId)
      if (entry && override.note) lines.push(`（本书口径：${entry.name}——${override.note}）`)
    }
    // 2c 触发式注入：本章扫描窗口命中的非 pinned 条目（命中清单即「可观测」——预览面板可见）
    if (scanText) {
      const disabledSet = disabled as Set<string>
      const allEntries = await db.lwWorldEntries!.listByWorldId(binding.worldId)
      const pool = allEntries.filter(e => !e.pinned && !disabledSet.has(e.id) && !candidates.some(c => c.id === e.id))
      const hits = matchEntriesInText(pool, scanText)
      if (hits.length > 0) {
        lines.push(`【本章相关条目】（命中：${hits.map(h => h.name).join('、')}）`)
        for (const hit of hits) lines.push(serializeWorldEntry(hit))
      }
    }
    sections.push(lines.join('\n'))
  }

  if (sections.length === 0) return ''
  let text = `【世界观体系（设定资产库·常驻）】\n${sections.join('\n\n')}\n（以上为本书世界观底层设定，正文描写不得与之冲突）`

  // 预算裁剪：按行保留头部，尾部标注
  const budgetChars = budgetTokens * 2
  if (text.length > budgetChars) {
    text = `${text.slice(0, budgetChars)}\n（……世界观设定过长已截断，完整版见设定资产库）`
  }
  return text
}

/** 供 ContextPanel 展示的轻量包装：文本 + token 估算 */
export async function buildWorldLibraryContextItem(
  projectId: string,
): Promise<{ text: string; tokens: number } | null> {
  const text = await buildWorldLibraryContext(projectId)
  if (!text) return null
  return { text, tokens: estimateContextTokens(text) }
}
