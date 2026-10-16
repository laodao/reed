/**
 * 知识大脑·名册（v4 整书结构化漏斗：实体整书归并 + 重要性分级）
 * @module platform/services/kb-brain/roster.service
 *
 * 在「章卡齐备」与「书级归并」之间回答两个问题：谁是谁（别名归并）、谁重要（分级）。
 * 产线：程序聚合（零 LLM）→ 按预算分片 → LLM 分片裁决（合并/分级/归类）→
 * 程序确定性合并（跨片同名先并，疑似簇一次 LLM 终审）→ 定级校准（程序规则兜底）。
 *
 * - 权威数据 = 调用方落盘的名册快照（artifacts）；实体池只做真归并（软合并，可逆）
 *   与 attrs.roster 分级缓存（仅单书库回写，避免多书互覆）
 * - 纪律：拿不准不并（错并比漏并危害大）、级别宁低勿高（错级损失=档案粗而非知识错）
 * - 本服务只负责「算」；台账幂等与名册卡（收件箱人审）由 book-passes 编排
 */
import { KbEntityRepository } from '@core/database/repositories/kb-entity.repository'
import { extractJsonFromResponse } from '@core/platform/services/ai-call'
import {
  ROSTER_MERGE_SYSTEM,
  ROSTER_PART_SYSTEM,
  buildRosterMergeUser,
  buildRosterPartUser,
} from './prompts'
import {
  parseRosterMergeOutput,
  parseRosterPartOutput,
  type ReadingCard,
  type RosterTier,
} from './schemas'
import type { BrainLlmFn } from './llm'

/** 名册分片证据预算（字符；deepwrite 证据包口径的本地化——provider 侧无窗口元数据） */
export const ROSTER_PART_BUDGET_CHARS = Number(process.env.KB_ROSTER_PART_CHARS ?? '') || 12000
/** 单条目证据行估算字符（名称+别名+章数+事实） */
const PER_ITEM_CHARS = 160
/** 每对象保留的示例事实条数 */
const SAMPLE_FACTS = 3
/** 路人判定基准：出场章数下限（随全书长度自适应——短书不误伤） */
const MINOR_FLOOR_CHAPTERS = 3
/** 出场章数下限 = min(3, max(1, 全书章数×2%))：千章书 3 章、百章书 2 章、短书 1 章 */
function minorFloor(totalChapters: number): number {
  return Math.max(1, Math.min(MINOR_FLOOR_CHAPTERS, Math.ceil(totalChapters * 0.02)))
}
/** 主角判定：章覆盖率下限 */
const PROTAGONIST_COVERAGE = 0.3
/** 单书名册对象上限（deepwrite 同款护栏；超出截断并在快照注明） */
export const ROSTER_ITEM_CAP = 5000

export type RosterDomain = 'character' | 'term'

export interface RosterItem {
  /** 全书内稳定的编号（聚合序，程序可重算复现） */
  ref: number
  domain: RosterDomain
  name: string
  aliases: string[]
  chapters: number[]
  facts: string[]
  categoryHint?: string
}

export interface RosterEntry {
  entityId: string | null
  domain: RosterDomain
  name: string
  aliases: string[]
  tier: RosterTier
  category?: string
  tierReason: string
  mentionChapters: number
  firstChapter: number
  lastChapter: number
  sampleFacts: string[]
}

export interface RosterSnapshot {
  v: 1
  /** auto=自动定级；confirmed=名册卡被人审接受（重算保留 tier）；dismissed=人审忽略整册 */
  status: 'auto' | 'confirmed' | 'dismissed'
  totalItems: number
  truncated: boolean
  characters: RosterEntry[]
  terms: RosterEntry[]
}

/* ==================== 纯函数（测试友好） ==================== */

function normName(s: string): string {
  return s.replace(/\s+/g, '').replace(/[（(【[].*?[）)】\]]/g, '').trim()
}

/** 聚合输入：卡 + 所属章号（卡内事实的 ch 由程序校验过=章号，但顶层章号由调用方持有） */
export interface CardWithChapter {
  card: ReadingCard
  chapterNo: number
}

/**
 * 从章卡聚合名册条目（零 LLM）：人物自 characters[].name/aliases/facts；
 * 术语自 world[].name（novel/history）与 concepts[].term（knowledge）。
 * 同名/别名互指的对象程序直接归并（name 出现次数多者为规范名，平序取字典序）。
 */
export function aggregateRosterItems(entries: CardWithChapter[]): RosterItem[] {
  interface Draft {
    domain: RosterDomain
    names: Map<string, number>
    aliases: Set<string>
    chapters: Set<number>
    facts: string[]
    categoryHint?: string
  }
  const drafts = new Map<string, Draft>()
  const keyOf = (domain: RosterDomain, n: string): string => `${domain}:${normName(n)}`
  const touch = (domain: RosterDomain, name: string, aliases: string[], ch: number, facts: string[], hint?: string): void => {
    const key = keyOf(domain, name)
    let d = drafts.get(key)
    if (!d) {
      d = { domain, names: new Map(), aliases: new Set(), chapters: new Set(), facts: [], categoryHint: hint }
      drafts.set(key, d)
    }
    d.names.set(name, (d.names.get(name) ?? 0) + 1)
    for (const a of aliases) if (normName(a) && normName(a) !== normName(name)) d.aliases.add(a.trim())
    d.chapters.add(ch)
    for (const f of facts) if (d.facts.length < SAMPLE_FACTS * 4) d.facts.push(f)
    if (!d.categoryHint && hint) d.categoryHint = hint
  }

  for (const { card, chapterNo } of entries) {
    if (card.profile === 'novel' || card.profile === 'history') {
      for (const c of card.characters) {
        touch('character', c.name, [...(c.aliases ?? [])], chapterNo, c.facts.map((f) => f.t))
      }
      for (const w of card.world) {
        touch('term', w.name, [], chapterNo, w.facts.map((f) => f.t), w.domain)
      }
    }
    if (card.profile === 'knowledge') {
      for (const c of card.concepts) {
        touch('term', c.term, [], chapterNo, [c.definition], '概念')
      }
    }
  }

  // 归并 pass（并查）：别名/名互指（「韩师兄」别名带「韩立」）→ 并入章数多的对象
  const parent = new Map<string, string>()
  const find = (k: string): string => {
    const p = parent.get(k) ?? k
    if (p === k) return k
    const r = find(p)
    parent.set(k, r)
    return r
  }
  const union = (a: string, b: string): void => {
    const ra = find(a)
    const rb = find(b)
    if (ra === rb) return
    const da = drafts.get(ra)!
    const db = drafts.get(rb)!
    // 章数多的为根；平序取键名字典序（可复现）
    const keep = da.chapters.size > db.chapters.size || (da.chapters.size === db.chapters.size && ra <= rb) ? ra : rb
    parent.set(ra === keep ? rb : ra, keep)
  }
  for (const [key, d] of drafts) {
    for (const a of d.aliases) {
      const other = keyOf(d.domain, a)
      if (other !== key && drafts.has(other)) union(key, other)
    }
  }
  const roots = new Map<string, Draft>()
  for (const [key, d] of drafts) {
    const r = find(key)
    const acc = roots.get(r)
    if (!acc) {
      roots.set(r, d)
      continue
    }
    for (const [n, c] of d.names) acc.names.set(n, (acc.names.get(n) ?? 0) + c)
    for (const a of d.aliases) acc.aliases.add(a)
    for (const ch of d.chapters) acc.chapters.add(ch)
    acc.facts.push(...d.facts)
    if (!acc.categoryHint && d.categoryHint) acc.categoryHint = d.categoryHint
  }

  const items: RosterItem[] = []
  for (const d of roots.values()) {
    // 规范名 = 出现次数最多者（平序取字典序，保证可复现）
    const name = [...d.names.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0]
    const chapters = [...d.chapters].sort((a, b) => a - b)
    items.push({
      ref: 0,
      domain: d.domain,
      name,
      aliases: [...d.aliases].filter((a) => normName(a) !== normName(name)).slice(0, 10),
      chapters,
      facts: d.facts.slice(0, SAMPLE_FACTS),
      categoryHint: d.categoryHint,
    })
  }
  items.sort((a, b) => a.domain.localeCompare(b.domain) || b.chapters.length - a.chapters.length || a.name.localeCompare(b.name))
  return items.slice(0, ROSTER_ITEM_CAP).map((it, i) => ({ ...it, ref: i }))
}

/** 按证据预算切分片（返回 item 下标组） */
export function splitRosterParts(items: RosterItem[], budgetChars = ROSTER_PART_BUDGET_CHARS): number[][] {
  const parts: number[][] = []
  let cur: number[] = []
  let size = 0
  items.forEach((it, i) => {
    const cost = PER_ITEM_CHARS + it.facts.join('').length
    if (cur.length > 0 && size + cost > budgetChars) {
      parts.push(cur)
      cur = []
      size = 0
    }
    cur.push(i)
    size += cost
  })
  if (cur.length > 0) parts.push(cur)
  return parts
}

/** 名册条目行（裁决输入/合并簇共用的渲染形态） */
export function rosterItemLine(items: RosterItem[], ref: number): string {
  const it = items[ref]
  if (!it) return `${ref}：（缺条目）`
  const span = it.chapters.length ? `${it.chapters[0]}–${it.chapters[it.chapters.length - 1]}章/${it.chapters.length}章` : '无出处'
  const facts = it.facts.length ? `；如：${it.facts.join('；')}` : ''
  const aliases = it.aliases.length ? `（别称：${it.aliases.join('、')}）` : ''
  return `${it.ref} [${it.domain === 'character' ? '人物' : '术语'}] ${it.name}${aliases}｜${span}${facts}${it.categoryHint ? `｜类别线索:${it.categoryHint}` : ''}`
}

/** 跨片程序合并：规范名/别名/去括注名精确撞名 → 归并（组 = 下标组） */
export function programMergeGroups(items: RosterItem[], partGroups: number[][]): { groups: number[][]; candidates: number[][] } {
  const parent = items.map((_, i) => i)
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])))
  const union = (a: number, b: number): void => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb)
  }
  const byKey = new Map<string, number>()
  const claim = (key: string, idx: number): void => {
    const k = `${items[idx].domain}:${key}`
    const prior = byKey.get(k)
    if (prior !== undefined) union(prior, idx)
    else byKey.set(k, idx)
  }
  items.forEach((it, i) => {
    claim(normName(it.name), i)
    for (const a of it.aliases) claim(normName(a), i)
  })
  for (const g of partGroups) if (g.length >= 2) g.reduce((a, b) => (union(a, b), b))

  const groupsMap = new Map<number, number[]>()
  items.forEach((_, i) => {
    const r = find(i)
    const list = groupsMap.get(r) ?? []
    list.push(i)
    groupsMap.set(r, list)
  })
  const all = [...groupsMap.values()]
  const groups = all.filter((g) => g.length >= 2)
  // 疑似簇：跨最终组（含孤群）两两比较——名互为包含或同前缀（供 LLM 终审，拿不准不并）
  const leadName = (g: number[]): string => normName(items[g[0]!]!.name)
  const related = (a: string, b: string): boolean =>
    a !== b && (a.includes(b) || b.includes(a) || (a.length >= 2 && b.length >= 2 && a.slice(0, 4) === b.slice(0, 4)))
  const candidates: number[][] = []
  const usedCluster = new Set<number>()
  for (let i = 0; i < all.length; i++) {
    if (usedCluster.has(i)) continue
    const cluster = [...all[i]!]
    for (let j = i + 1; j < all.length; j++) {
      if (usedCluster.has(j)) continue
      if (related(leadName(all[i]!), leadName(all[j]!))) {
        cluster.push(...all[j]!)
        usedCluster.add(j)
      }
    }
    if (cluster.length > all[i]!.length) candidates.push(cluster.sort((a, b) => a - b))
  }
  return { groups, candidates: candidates.slice(0, 40) }
}

/** 定级校准（程序规则兜底）：少章至多 minor；主角需要覆盖率；term 三档与人物四档分域归位 */
export function calibrateTiers(
  items: RosterItem[],
  decisions: { tierByRef: Map<number, RosterTier>; reasonByRef: Map<number, string> },
  totalChapters: number
): Map<number, { tier: RosterTier; reason: string }> {
  const out = new Map<number, { tier: RosterTier; reason: string }>()
  items.forEach((it, i) => {
    const coverage = totalChapters > 0 ? it.chapters.length / totalChapters : 0
    const said = decisions.tierByRef.get(i)
    const reason = decisions.reasonByRef.get(i) ?? '（未定级，按规则兜底）'
    let tier: RosterTier
    const floor = minorFloor(totalChapters)
    if (it.domain === 'character') {
      tier = said && ['protagonist', 'major', 'minor', 'passerby'].includes(said) ? said : it.chapters.length >= floor ? 'minor' : 'passerby'
      if (tier === 'protagonist' && coverage < PROTAGONIST_COVERAGE) {
        tier = 'major'
      }
      if (it.chapters.length < floor && (tier === 'major' || tier === 'protagonist')) tier = 'minor'
    } else {
      tier = said && ['core', 'supporting', 'reference'].includes(said) ? said : it.chapters.length >= floor ? 'supporting' : 'reference'
    }
    out.set(i, { tier, reason: tier === said ? reason : `${reason}（校准：${tier}）` })
  })
  return out
}

/** 名册快照 markdown（名册卡正文；人审载体） */
export function renderRosterMarkdown(snapshot: RosterSnapshot): string {
  const head = `> 名册快照：共 ${snapshot.totalItems} 个对象${snapshot.truncated ? `（超上限已截断）` : ''}。接受=采纳当前分级；结构修正（合并/改名/分级调整）请到实体管理界面操作后重跑名册。\n`
  const section = (title: string, rows: RosterEntry[]): string => {
    if (rows.length === 0) return ''
    const lines = rows.map(
      (r) =>
        `| ${r.name}${r.aliases.length ? `（${r.aliases.join('、')}）` : ''} | ${r.tier}${r.category ? `/${r.category}` : ''} | ${r.mentionChapters} | ${r.firstChapter}–${r.lastChapter} | ${r.tierReason} |`
    )
    return `\n## ${title}\n\n| 对象 | 级别/类别 | 出现章数 | 章节范围 | 定级理由 |\n|---|---|---|---|---|\n${lines.join('\n')}\n`
  }
  return head + section('人物', snapshot.characters) + section('设定与术语', snapshot.terms)
}

/* ==================== 服务编排 ==================== */

export interface RosterLlm {
  llmFor(): BrainLlmFn
}

export interface RosterBuildResult {
  snapshot: RosterSnapshot
  /** 实体软合并指令 [(fromId, toId)]——由调用方执行（可记录/可撤销） */
  entityMerges: Array<{ fromId: string; toId: string }>
}

export interface KbRosterDeps {
  llm?: BrainLlmFn
  entities?: KbEntityRepository
}

export class KbRosterService {
  private readonly llm: BrainLlmFn
  private readonly entities: KbEntityRepository | undefined

  constructor(deps: KbRosterDeps = {}) {
    this.llm = deps.llm!
    this.entities = deps.entities
  }

  /** 名册类型 → 实体类型映射（沿用 atomize mention 的实体类型词表） */
  private entityTypeOf(domain: RosterDomain, category?: string): string {
    if (domain === 'character') return 'character'
    if (category === '势力') return 'organization'
    if (category === '地理') return 'location'
    if (category === '物品') return 'item'
    if (category === '体系' || category === '规则') return 'setting-system'
    return 'concept'
  }

  /** 全流程：聚合 → 分片裁决 → 程序合并 → 终审 → 定级 → 实体对齐 */
  async buildRoster(kbId: string, entries: CardWithChapter[], totalChapters: number): Promise<RosterBuildResult> {
    const items = aggregateRosterItems(entries)
    const entityMerges: Array<{ fromId: string; toId: string }> = []
    if (items.length === 0) {
      return { snapshot: { v: 1, status: 'auto', totalItems: 0, truncated: false, characters: [], terms: [] }, entityMerges }
    }

    // 1. 实体对齐（名→实体 id；未登记的名字建实体）
    const entityIdByRef = new Map<number, string>()
    if (this.entities) {
      for (const it of items) {
        const ent = await this.entities.upsertMention(kbId, {
          name: it.name,
          type: this.entityTypeOf(it.domain, it.categoryHint),
        })
        entityIdByRef.set(it.ref, ent.id)
      }
    }

    // 2. 分片裁决
    const parts = splitRosterParts(items)
    const tierByRef = new Map<number, RosterTier>()
    const reasonByRef = new Map<number, string>()
    const categoryByRef = new Map<number, string>()
    const partGroups: number[][] = []
    for (const part of parts) {
      const out = await this.callWithRetry(
        ROSTER_PART_SYSTEM,
        buildRosterPartUser(part.map((i) => rosterItemLine(items, i))),
        (data) => parseRosterPartOutput(data, { count: items.length })
      )
      partGroups.push(...out.groups)
      for (const t of out.tiers) {
        tierByRef.set(t.ref, t.tier)
        if (t.reason) reasonByRef.set(t.ref, t.reason)
      }
      for (const c of out.categories) categoryByRef.set(c.ref, c.category)
    }

    // 3. 程序确定性合并 + 跨片疑似簇一次终审
    const { groups, candidates } = programMergeGroups(items, partGroups)
    if (candidates.length > 0) {
      try {
        const out = await this.callWithRetry(
          ROSTER_MERGE_SYSTEM,
          buildRosterMergeUser(
            candidates.map((g, i) => `簇${i + 1}：\n${g.map((r) => rosterItemLine(items, r)).join('\n')}`)
          ),
          (data) => parseRosterMergeOutput(data, { count: items.length })
        )
        groups.push(...out.groups)
      } catch {
        // 终审失败：保持程序合并结果（宁缺勿造）
      }
    }

    // 4. 并组定规范名（组内章数多者为规范名）+ 实体软合并指令
    const groupOf = new Map<number, number[]>()
    const merged = new Set<number>()
    for (const g of groups) {
      for (const r of g) {
        groupOf.set(r, g)
        merged.add(r)
      }
    }
    const leadByRef = new Map<number, number>() // ref → 组内代表 ref
    for (const g of groups) {
      const lead = [...g].sort((a, b) => items[b]!.chapters.length - items[a]!.chapters.length || items[a]!.name.localeCompare(items[b]!.name))[0]!
      for (const r of g) if (r !== lead) leadByRef.set(r, lead)
      const leadEntity = entityIdByRef.get(lead)
      if (leadEntity && this.entities) {
        for (const r of g) {
          const eid = entityIdByRef.get(r)
          if (eid && eid !== leadEntity) entityMerges.push({ fromId: eid, toId: leadEntity })
        }
      }
    }

    // 5. 定级校准 → 快照
    const calibrated = calibrateTiers(items, { tierByRef, reasonByRef }, totalChapters)
    const entryOf = (it: RosterItem): RosterEntry => {
      const lead = leadByRef.get(it.ref)
      const rep = lead !== undefined ? items[lead]! : it
      const g = groupOf.get(it.ref)
      const level = calibrated.get(rep.ref) ?? { tier: it.domain === 'character' ? ('passerby' as const) : ('reference' as const), reason: '（兜底）' }
      const aliases = new Set<string>()
      for (const r of g ?? [it.ref]) {
        for (const a of items[r]!.aliases) if (normName(a) !== normName(rep.name)) aliases.add(a)
      }
      return {
        entityId: entityIdByRef.get(rep.ref) ?? entityIdByRef.get(it.ref) ?? null,
        domain: it.domain,
        name: rep.name,
        aliases: [...aliases].slice(0, 10),
        tier: level.tier,
        category: categoryByRef.get(it.ref) ?? it.categoryHint,
        tierReason: level.reason,
        mentionChapters: it.chapters.length,
        firstChapter: it.chapters[0] ?? 0,
        lastChapter: it.chapters[it.chapters.length - 1] ?? 0,
        sampleFacts: it.facts,
      }
    }
    const all = items.map(entryOf)
    const characters = all.filter((e) => e.domain === 'character')
    const terms = all.filter((e) => e.domain === 'term')
    return {
      snapshot: {
        v: 1,
        status: 'auto',
        totalItems: items.length,
        truncated: items.length >= ROSTER_ITEM_CAP,
        characters,
        terms,
      },
      entityMerges,
    }
  }

  /** 调用 + 解析 + 校验失败回喂重试 1 次（atomize/cogen 范式） */
  private async callWithRetry<T>(
    system: string,
    user: string,
    parse: (data: unknown) => T
  ): Promise<T> {
    let lastError = ''
    for (let attempt = 0; attempt < 2; attempt++) {
      const prompt =
        attempt === 0
          ? user
          : `${user}\n\n【上次输出不合法，请修正】\n${lastError}\n请重新输出完整合法的 JSON。`
      const raw = await this.llm({ system, user: prompt, maxTokens: 4000 })
      try {
        return parse(extractJsonFromResponse(raw))
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e)
      }
    }
    throw new Error(`roster 两次尝试均失败：${lastError}`)
  }
}
