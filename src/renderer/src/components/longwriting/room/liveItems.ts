/**
 * 内容面板条目构建（右栏「内容」Tab 的数据形状与卡片/圣经双来源解析）
 * @module renderer/components/longwriting/room/liveItems
 *
 * 数据结构不变（story-room 卡片 + bible 统一读模型），只做展示层组装：
 * - 卡片（提炼/设计包草稿）→ 全字段 profile 预览（与 ArtifactCard 不同：不截断、
 *   对象数组展开成多行，看得到完整设定）；
 * - 采纳/确认后 → 按 kindKey+name 回查 bible:detail，渲染落库后的完整档案（含关系）。
 */

import { KIND_META, CARD_FIELD_LABELS } from './roomKinds'
import type { ArtifactCard } from '@shared/types/story-room.types'
import type { BibleGroupWire } from '@shared/types/story-room.types'

/** 内容面板条目：完整设定档案 / 整章正文 */
export type LiveItem = LiveProfileItem | LiveChapterItem

export interface LiveProfileItem {
  id: string
  type: 'profile'
  icon: string
  title: string
  kindLabel: string
  accentVar: string
  /** 全字段行（值可多行，pre-wrap 渲染） */
  fields: Array<{ k: string; v: string }>
  relations: string[]
  /** 溯源：出自第几轮讨论 */
  prov?: string
  /** draft=卡片草稿预览；saved=已落库档案 */
  status: 'draft' | 'saved'
  /** 来源卡片 id（draft 态可在面板内直接编辑后采纳） */
  cardId?: string
  askText: string
  updatedAt: number
}

export interface LiveChapterItem {
  id: string
  type: 'chapter'
  outlineId: string
  chapterNo: number | null
  title: string
  content: string
  wordCount: number
  /** 最后一次落库是否为局部修正（显示「已修正」角标而非「新写完」） */
  patched: boolean
  /** 本会话内作者已审阅（轻量本地标记，不落库） */
  reviewed?: boolean
  updatedAt: number
}

/** profile 条目 id：按 (kind, 名称) 稳定——卡片预览与落库档案共用一个槽位，后到者覆盖 */
function profileId(kind: string, name: string): string {
  return `profile:${kind}:${name}`
}

/** 卡片里无需进字段行的键（已作标题/溯源展示） */
const TITLE_KEYS = new Set(['name', 'title'])

/** 任意值 → 展示文本（数组展开多行、对象数组逐项「名：述」），空值返回 '' */
export function renderLiveValue(v: unknown): string {
  if (v === undefined || v === null || v === '') return ''
  if (Array.isArray(v)) {
    if (v.length === 0) return ''
    if (v.every((x) => x === null || typeof x !== 'object')) return v.map((x) => String(x)).join('、')
    return v
      .map((x: any) => {
        if (x === null || typeof x !== 'object') return String(x)
        const label = [x.name, x.title].find(Boolean) || ''
        const time = x.timeOfDay ? `（${x.timeOfDay}）` : ''
        const detail = [x.summary, x.description, x.content, x.hook, x.reversal].find(Boolean) || ''
        return [`${label}${time}`, detail].filter(Boolean).join('：')
      })
      .filter(Boolean)
      .join('\n')
  }
  if (typeof v === 'object') {
    return Object.entries(v as Record<string, unknown>)
      .filter(([, vv]) => vv !== undefined && vv !== null && vv !== '')
      .map(([k, vv]) => `${k}：${Array.isArray(vv) ? (vv as unknown[]).join('、') : String(vv)}`)
      .join('\n')
  }
  return String(v)
}

/** 卡片 → 内容条目 id（忽略时按它撤下） */
export function cardProfileId(card: ArtifactCard): string {
  const data = (card.data || {}) as Record<string, unknown>
  return profileId(card.kind, String(data.name || data.title || card.title || ''))
}

/** 卡片 → 全字段 profile 预览（字段标签沿用卡片映射，未映射键直出键名） */
export function cardToProfile(card: ArtifactCard, status: 'draft' | 'saved' = 'draft'): LiveProfileItem {
  const meta = KIND_META[card.kind] || KIND_META.custom
  const labels = CARD_FIELD_LABELS[card.kind] || {}
  const data = (card.data || {}) as Record<string, unknown>
  const title = String(data.name || data.title || card.title || meta.label)
  const fields: Array<{ k: string; v: string }> = []
  for (const [f, label] of Object.entries(labels)) {
    if (TITLE_KEYS.has(f)) continue
    const v = renderLiveValue(data[f])
    if (v) fields.push({ k: label, v })
  }
  for (const [f, v] of Object.entries(data)) {
    if (labels[f] || TITLE_KEYS.has(f)) continue
    const s = renderLiveValue(v)
    if (s) fields.push({ k: f, v: s })
  }
  return {
    id: cardProfileId(card),
    type: 'profile',
    icon: meta.ico,
    title,
    kindLabel: `${meta.label}卡`,
    accentVar: meta.colorVar,
    fields,
    relations: [],
    prov: card.sourceTurns?.length ? `出自第 ${card.sourceTurns.join('、')} 轮讨论` : undefined,
    status,
    cardId: card.id,
    askText: `关于「${title}」（${meta.label}）：`,
    updatedAt: Date.now(),
  }
}

/** 卡片种类 → 设定集分组 kindKey（可落库的种类才回查） */
const KIND_TO_BIBLE_KEY: Record<string, string> = {
  character: 'character',
  plot: 'plot',
  overview: 'overview',
  outline: 'outline',
  world: 'location',
}

export interface ResolvedBibleProfile {
  item: LiveProfileItem
}

/**
 * 回查落库后的完整档案：bible:list 定位分组与条目 → bible:detail 拿全字段+关系。
 * 找不到（未落库/查失败）返回 null，调用方回退卡片预览。
 */
export async function resolveBibleProfile(
  projectId: string,
  kindKey: string,
  ref: { id?: string; name?: string },
): Promise<LiveProfileItem | null> {
  const api = () => window.electronAPI.longwriting
  try {
    const listRes = await api().bibleList(projectId)
    if (!listRes.success || !Array.isArray(listRes.data)) return null
    const group = (listRes.data as BibleGroupWire[]).find((g) => g.kindKey === kindKey)
    if (!group) return null
    const entry = ref.id
      ? group.entries.find((e) => e.id === ref.id)
      : group.entries.find((e) => e.name === ref.name)
    if (!entry) return null
    const detailRes = await api().bibleDetail(projectId, kindKey, entry.id)
    if (!detailRes.success || !detailRes.data) return null
    const schema = group.fieldsSchema || []
    const raw = (detailRes.data.fields || {}) as Record<string, unknown>
    const fields: Array<{ k: string; v: string }> = []
    const seen = new Set<string>()
    for (const f of schema) {
      if (f.key === 'name') continue
      seen.add(f.key)
      const v = renderLiveValue(raw[f.key])
      if (v) fields.push({ k: f.label, v })
    }
    for (const [k, v] of Object.entries(raw)) {
      if (seen.has(k) || TITLE_KEYS.has(k)) continue
      const s = renderLiveValue(v)
      if (s) fields.push({ k, v: s })
    }
    if (fields.length === 0 && entry.sub) fields.push({ k: '简介', v: entry.sub })
    const relations: string[] = (detailRes.data.relations || []).map((r: Record<string, any>) => {
      const who = r.targetName || r.target || ''
      const rel = r.relationType || r.label || '关联'
      const from = r.validFromChapter ? `（第${r.validFromChapter}章起）` : ''
      return `${who}：${rel}${from}`
    })
    const icon = group.icon || KIND_META[kindKey]?.ico || '🧩'
    const name = entry.name
    return {
      id: profileId(kindKey === 'location' ? 'world' : kindKey, name),
      type: 'profile',
      icon,
      title: name,
      kindLabel: group.label,
      accentVar: KIND_META[kindKey]?.colorVar || 'var(--ka-overview)',
      fields,
      relations,
      prov: entry.origin?.turns?.length ? `出自第 ${entry.origin.turns.join('、')} 轮讨论` : undefined,
      status: 'saved',
      askText: `关于「${name}」（${group.label}）：`,
      updatedAt: Date.now(),
    }
  } catch {
    return null
  }
}

/** 采纳卡片后回查落库档案（世界卡展开成地点/门派/技能/物品，按主实体名逐组尝试） */
export async function resolveCardPersistedProfile(projectId: string, card: ArtifactCard): Promise<LiveProfileItem | null> {
  const data = (card.data || {}) as Record<string, any>
  const title = String(data.name || data.title || card.title || '')
  if (!title) return null
  const direct = KIND_TO_BIBLE_KEY[card.kind]
  if (direct) {
    const hit = await resolveBibleProfile(projectId, direct, { name: title })
    if (hit) return hit
  }
  if (card.kind === 'world') {
    for (const gk of ['location', 'faction', 'skill', 'item']) {
      const hit = await resolveBibleProfile(projectId, gk, { name: title })
      if (hit) return hit
    }
  }
  return null
}
