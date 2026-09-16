/**
 * 故事研讨室 Agent 工具定义（46 号：双模式宿主）
 * @module packs/longwriting/story-room/room-agent-tools
 *
 * 与 dl-agent-tools 同构：标准 packId 注册（`pack:lw-room:<name>`，registry 建
 * 裸名别名 + loop wire-name 兜底）；def 不捕获项目——projectId 从 ctx.logContext
 * （宿主 runtimeContext 注入）运行时还原。
 * - 读工具：lw_query_bible（复用 BibleQueryService 统一读模型——与设定集面板同一
 *   数据源：概要/人物富字段/故事线/世界背景/自定义分类/伏笔/事件）+ lw_query_outline
 *   （目录与单节点详情）+ lw_query_chapter（已写正文）+ lw_query_ledger（共识账本）；
 * - 写工具：一律只落「设计包」草稿（room-design），确认后才走正式落库——
 *   「全部设计完整体让用户确认」的纪律由数据流保证，不靠提示词自觉；
 * - 进度工具：lw_task_progress 只发事件不落库（照抄 dl_task_progress 模式）。
 *
 * 技能/工作流（discover_capabilities/invoke_skill/run_workflow/get_workflow_run）
 * 为 builtin 系统工具，宿主 bindings 引用裸名即可（workflow-boot 已注册）。
 */

import { z } from 'zod'
import type { AgentToolContext, AgentToolDef } from '@core/platform/agent-runtime/types'
import type { AgentToolRegistry } from '@core/platform/agent-runtime/tools/registry'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { ConsensusEntry, ConsensusKind, ConsensusStatus, DesignItemKind } from '@shared/types/story-room.types'
import { addDesignItem, ensureDraftPackage } from './room-design'
import { getRoomState, mutateRoomState } from './room-state'
import {
  addLedgerEntry,
  compactLedger,
  ledgerStatusCounts,
  ledgerSnapshotText,
  setLedgerEntriesStatus,
} from './room-ledger'
import type {
  LedgerAddOutcome,
  LedgerLocateFailure,
  LedgerSetStatusOutcome,
} from './room-ledger'
import { emitRoomEvent } from './room-events'
import { LongWritingAIService } from '@core/platform/services/longwriting-ai.service'
import { LongWritingService } from '../services/longwriting.service'
import { ChapterGraphProcessor } from '@core/platform/services/longwriting/graph/chapter-graph.processor'
import { ConsistencyService } from '@core/platform/services/longwriting/graph/consistency.service'
import { BibleQueryService } from '@core/platform/services/longwriting/bible.service'
import type { BibleEntryView, BibleGroupView } from '@core/platform/services/longwriting/bible.service'
import { buildOutlineDocOrder, outlineChapterNumber } from '@core/platform/services/longwriting/outline-order'
import { acknowledgeConflictByKey, conflictKey as conflictKeyOf } from '@core/platform/services/longwriting/conflict-gate'
import { resolveStageModelOpts } from '../services/chapter-writing-executor'
import { locateAll, locateExcerpt } from '@shared/utils/text-locate'

export const LW_ROOM_PACK_ID = 'lw-room'

/** 步数上限（六扇门复盘：12 是贴着「设计反派+关系网」的最低配，复杂级联会被截断；
 *  上限本职是失控兜底而非预算——正常讨论轮 1~3 步自终，抬高对聊天零成本。
 *  LW_ROOM_MAX_STEPS 环境变量可覆盖，夹到 [1,60]） */
export const LW_ROOM_MAX_STEPS = (() => {
  const raw = Number(process.env.LW_ROOM_MAX_STEPS)
  if (!Number.isFinite(raw) || raw <= 0) return 24
  // 对抗 review P2-1：(0,0.5) 区间 round 后为 0 → loop 首轮即 max_steps，整轮瘫痪
  return Math.max(1, Math.min(60, Math.round(raw)))
})()

/** 从工具执行上下文还原研讨室上下文 */
function lwCtxFrom(ctx: AgentToolContext): { projectId: string } {
  const log = (ctx.logContext ?? {}) as Record<string, unknown>
  const projectId = typeof log.projectId === 'string' ? log.projectId : ''
  if (!projectId) {
    throw new Error('缺少研讨室上下文（runtimeContext.projectId 未注入）——lw 工具只能在研讨室宿主内调用')
  }
  return { projectId }
}

/** 加载项目大纲并建文档序（章号唯一权威） */
async function loadOutlineDocOrder(projectId: string) {
  const db = getCoreDatabaseManager()
  const outlines = ((await db.lwOutlines?.getByProjectId(projectId)) || []) as Array<Record<string, any>>
  return { outlines, order: buildOutlineDocOrder(outlines as never) }
}

/** 大纲引用解析（章法工具共用）：精确 id → 文档序章号（「第N章」/「N」）→ 标题唯一包含。
 *  实跑（忘川渡）发现：章法工具只认节点 id，但 agent 没有任何工具能拿到大纲节点 id——
 *  正文编辑器里用户同样看不到 id；解析失败时附大纲索引，agent 可自助重试。 */
async function resolveOutlineRef(
  projectId: string,
  ref: string,
): Promise<{ ok: true; id: string; chapterNo: number | null; title: string } | { ok: false; error: string }> {
  const { outlines, order } = await loadOutlineDocOrder(projectId)
  if (!outlines.length) return { ok: false, error: '项目还没有大纲节点——先在大纲阶段产出并确认大纲卡' }

  const input = String(ref).trim()
  const exact = outlines.find((o) => o.id === input)
  if (exact) {
    return { ok: true, id: exact.id, chapterNo: outlineChapterNumber(order, exact.id), title: String(exact.name ?? '') }
  }

  const numForm = /^第\s*(\d+)\s*[章集]$/.exec(input) ?? /^(\d+)$/.exec(input)
  if (numForm) {
    const no = Number(numForm[1])
    for (const [id, n] of order.leafNumbers) {
      if (n !== no) continue
      const node = outlines.find((o) => o.id === id)
      return { ok: true, id, chapterNo: no, title: String(node?.name ?? '') }
    }
    return { ok: false, error: `大纲里没有第 ${no} 章（共 ${order.leafNumbers.size} 章）` }
  }

  const bare = input.replace(/^第\s*\d+\s*[章集]/, '').trim() || input
  const hits = outlines.filter((o) => String(o.name ?? '').includes(bare))
  if (hits.length === 1) {
    return { ok: true, id: hits[0].id, chapterNo: outlineChapterNumber(order, hits[0].id), title: String(hits[0].name ?? '') }
  }

  const index = order.ordered
    .map((o) => {
      const no = outlineChapterNumber(order, o.id)
      return `- ${no ? `第${no}章` : '【卷】'} ${(o as any).name ?? ''}（id=${o.id}）`
    })
    .join('\n')
  return {
    ok: false,
    error: `无法唯一定位大纲节点「${ref}」${hits.length > 1 ? `（有 ${hits.length} 个标题命中，请带上更多限定）` : ''}。当前大纲：\n${index}`,
  }
}

/** 写工具统一出口：落设计包 + 发 task:progress 事件 */
async function saveDesign(
  ctx: AgentToolContext,
  input: { taskTitle?: string },
  kind: DesignItemKind,
  label: string,
  payload: Record<string, any>,
  note?: string,
): Promise<{ ok: true; data: unknown }> {
  const { projectId } = lwCtxFrom(ctx)
  const db = getCoreDatabaseManager()
  await ensureDraftPackage(db, projectId, { taskTitle: input.taskTitle })
  const item = await addDesignItem(db, projectId, {
    kind,
    label,
    payload,
    note,
    taskTitle: input.taskTitle,
  })
  emitRoomEvent(projectId, {
    type: 'task:progress',
    message: `✓ 已入设计包：${label}`,
    tool: `lw_save_${kind}`,
    status: 'ok',
  })
  return { ok: true, data: { status: 'ok', message: `已入设计包（第 ${item.id} 项），确认后生效`, itemId: item.id } }
}

// ==================== 读工具 ====================
// 覆盖面（此前缺口修复 09-15）：故事线/概要/世界背景/自定义分类此前没有任何读
// 工具，人物详情只有图谱简介而丢富字段——现在统一路由 BibleQueryService（与
// 设定集面板同一读模型），人物/故事线等详情返回全字段+演进时间线。

/** 列表单行摘要截断 */
const LIST_LINE_MAX = 80
/** 详情单字段截断 */
const DETAIL_FIELD_MAX = 400
/** 单条详情总截断 */
const DETAIL_MAX = 1600
/** 世界背景单字段截断（type=world 给全量，all 里给短些） */
const WORLD_FIELD_MAX = 200

/** 详情渲染跳过的键：id/审计类、已单独渲染、需名称解析的关联 id 列表 */
const DETAIL_SKIP_KEYS = new Set([
  'id', 'projectId', 'createdAt', 'updatedAt', 'sourceEpisodeId', 'sourceType',
  'enabledFeatures', 'isLocked', 'isSaved', 'mapId', 'ownerId', 'locationId',
  'parentId', 'orderIndex', 'plotOrder', 'sortOrder', 'templateType',
  'name', 'title', 'aliases', 'origin',
  'involvedCharacters', 'involvedLocations', 'involvedItems', 'characterIds',
  'keyCharacters', 'keyLocations',
])

/** 演进时间线（状态切片/事件/关系）只对五类图谱实体有意义 */
const GRAPH_KINDS = new Set(['character', 'location', 'item', 'faction', 'skill'])

/** 通用字段中文标签（分类 fields_schema 缺失时的兜底，schema 标签优先） */
const FIELD_LABELS: Record<string, string> = {
  summary: '概要', description: '描述', coreConflict: '核心冲突', coreIdea: '核心构想', notes: '备注', note: '概况',
  content: '内容', stance: '立场', ruler: '君主', gender: '性别', age: '年龄', height: '身高', weight: '体重',
  race: '种族', occupation: '身份', position: '职位', rolePosition: '定位', appearance: '外貌', background: '背景',
  personality: '性格', abilities: '能力', majorEvents: '重大事件', type: '类型', level: '等级', system: '体系',
  status: '状态', estimatedWords: '预估字数', storyType: '题材', eraDescription: '时代背景', socialStructure: '社会结构',
  techLevel: '科技水平', specialRules: '特殊规则', factionDistribution: '势力分布', geographicOrientation: '地理格局',
}

function truncText(v: unknown, max: number): string {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim()
  return s.length > max ? `${s.slice(0, max)}…` : s
}

/** 关联 id 列表 → 名称串（读全量建映射，避免逐 id 查询；解析不了保底显 id） */
async function resolveIdNames(
  db: any,
  projectId: string,
  ids: unknown,
  repoKey: 'lwCharacters' | 'lwLocations' | 'lwItems',
): Promise<string> {
  const list = Array.isArray(ids) ? ids.map(String) : []
  if (!list.length) return ''
  const rows = (await db?.[repoKey]?.getByProjectId?.(projectId)) || []
  const nameOf = new Map(rows.map((r: any) => [String(r.id), String(r.name ?? '')]))
  return list.map((id) => nameOf.get(id) || id).join('、')
}

const queryBibleSchema = z.object({
  query: z.object({
    type: z
      .enum(['character', 'location', 'item', 'faction', 'skill', 'plot', 'overview', 'world', 'custom', 'foreshadow', 'all'])
      .optional()
      .describe('设定类别（缺省=all；plot=故事线；overview=故事概要；world=世界背景+环境实体；custom=自定义分类如国别）'),
    name: z
      .string()
      .optional()
      .describe('按名称精确查单个设定（支持别名；返回全字段+状态演进/事件/关系时间线），不传=列表'),
    chapter: z.number().int().min(1).optional().describe('时间线锚点章节（只看该章仍生效的关系与已发生事件；缺省=全时段）'),
    includeForeshadows: z.boolean().optional().describe('列表模式附带待回收伏笔清单'),
  }),
})

/** 按名找设定条目：精确名/别名 → 唯一包含；多命中返回歧义清单 */
function findBibleEntry(
  groups: BibleGroupView[],
  kindKeys: string[],
  name: string,
): { group: BibleGroupView; entry: BibleEntryView } | { ambiguous: string[] } | null {
  const pools = groups.filter((g) => kindKeys.includes(g.kindKey))
  for (const g of pools) {
    const exact = g.entries.find((e) => e.name === name || e.aliases?.includes(name))
    if (exact) return { group: g, entry: exact }
  }
  const hits = pools.flatMap((g) => g.entries.filter((e) => e.name.includes(name)).map((e) => ({ group: g, entry: e })))
  if (hits.length === 1) return hits[0]
  if (hits.length > 1) return { ambiguous: hits.map((h) => `${h.group.label}·${h.entry.name}`) }
  return null
}

/** 单条详情文本：全字段（schema 标签优先，非空键兜底——schema 缺失不再丢富字段）
 *  + 关联实体名称 + 演进时间线（状态/事件/关系，仅图谱五类） */
async function renderBibleEntryDetail(
  svc: BibleQueryService,
  db: any,
  projectId: string,
  group: BibleGroupView,
  entry: BibleEntryView,
  chapter?: number,
): Promise<string> {
  const lines: string[] = [`【${entry.name}】${group.label} · id=${entry.id}`]
  if (entry.aliases?.length) lines.push(`别名：${entry.aliases.join('、')}`)

  let detail: Awaited<ReturnType<BibleQueryService['detail']>> = null
  try {
    detail = await svc.detail(projectId, group.kindKey, entry.id)
  } catch { /* 详情读取失败降级为列表 fields */ }
  const fields = (detail?.fields ?? entry.fields) as Record<string, unknown>
  const schema = detail?.kind?.fieldsSchema
  const labelOf = new Map<string, string>(
    (Array.isArray(schema) ? schema : []).map((f: { key: string; label?: string }) => [f.key, String(f.label ?? f.key)]),
  )

  const shown = new Set<string>(['name', 'title', 'aliases'])
  const pushField = (k: string) => {
    if (shown.has(k) || DETAIL_SKIP_KEYS.has(k)) return
    shown.add(k)
    const v = fields[k]
    if (v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) return
    lines.push(`${labelOf.get(k) || FIELD_LABELS[k] || k}：${truncText(v, DETAIL_FIELD_MAX)}`)
  }
  for (const f of Array.isArray(schema) ? schema : []) pushField(f.key)
  for (const k of Object.keys(fields)) pushField(k)

  // 关联实体（id → 名称，故事线/大纲节点的 involved_* 与技能的 characterIds）
  const assoc: string[] = []
  const invChars = await resolveIdNames(db, projectId, fields.involvedCharacters, 'lwCharacters')
  const invLocs = await resolveIdNames(db, projectId, fields.involvedLocations, 'lwLocations')
  const invItems = await resolveIdNames(db, projectId, fields.involvedItems, 'lwItems')
  if (invChars) assoc.push(`涉及人物：${invChars}`)
  if (invLocs) assoc.push(`涉及地点：${invLocs}`)
  if (invItems) assoc.push(`涉及物品：${invItems}`)
  if (Array.isArray(fields.characterIds) && fields.characterIds.length) {
    const names = await resolveIdNames(db, projectId, fields.characterIds, 'lwCharacters')
    if (names) assoc.push(`关联人物：${names}`)
  }
  if (assoc.length) lines.push(assoc.join('\n'))

  if (GRAPH_KINDS.has(group.kindKey)) {
    try {
      const p = await svc.progression(projectId, group.kindKey, entry.id)
      if (p.states.length) {
        lines.push(
          `状态演进：${p.states.map((s) => `第${s.chapter}章 ${s.summary}${s.keyChanges ? `（${s.keyChanges}）` : ''}`).join('；')}`,
        )
      }
      const events = p.events.slice(0, 8)
      if (events.length) {
        lines.push(
          `相关事件：\n${events.map((e) => `- 第${e.chapter}章 ${e.name}${e.description ? `：${truncText(e.description, 60)}` : ''}`).join('\n')}`,
        )
      }
      const rels = p.relations
        .filter((r) => chapter == null || ((r.from == null || r.from <= chapter) && (r.until == null || r.until >= chapter)))
        .slice(0, 12)
      if (rels.length) {
        lines.push(
          `关系：\n${rels
            .map((r) => {
              const span =
                r.from != null || r.until != null
                  ? `（${r.from != null ? `自第${r.from}章` : ''}${r.until != null ? `${r.from != null ? '，' : ''}至第${r.until}章已失效` : ''}）`
                  : ''
              return `- ${r.other}：${r.type}${span}`
            })
            .join('\n')}`,
        )
      }
    } catch { /* 演进读取失败不阻断 */ }
  }

  return lines.join('\n').slice(0, DETAIL_MAX)
}

/** 列表文本（概要/世界背景/各类名册/事件；budget 由最终 slice 兜底） */
async function renderBibleList(
  db: any,
  projectId: string,
  groups: BibleGroupView[],
  q: { type?: string; chapter?: number; includeForeshadows?: boolean },
): Promise<string[]> {
  const lines: string[] = []
  const want = q.type && q.type !== 'all' ? q.type : null
  const include = (kindKey: string) => {
    if (!want) return true
    if (want === 'world') return ['location', 'faction', 'skill', 'item'].includes(kindKey)
    return kindKey === want
  }

  // 概要（单行仓储）
  const overview = groups.find((g) => g.kindKey === 'overview')
  if (overview && (!want || want === 'overview') && overview.entries.length) {
    const f = overview.entries[0].fields as Record<string, unknown>
    lines.push(
      `【概要】${overview.entries[0].name}` +
        (f.summary ? `\n概要：${truncText(f.summary, 200)}` : '') +
        (f.coreConflict ? `\n核心冲突：${truncText(f.coreConflict, 100)}` : ''),
    )
  }

  // 世界背景（lw_backgrounds 不在 bible kinds，直接读）
  if (!want || want === 'world') {
    try {
      const bg = await db?.lwBackgrounds?.getByProjectId?.(projectId)
      const row = Array.isArray(bg) ? bg[0] : bg
      if (row) {
        const parts = ['eraDescription', 'socialStructure', 'techLevel', 'specialRules', 'factionDistribution', 'geographicOrientation']
          .map((k) => (row[k] ? `${FIELD_LABELS[k] || k}：${truncText(row[k], want === 'world' ? WORLD_FIELD_MAX : 100)}` : ''))
          .filter(Boolean)
        if (parts.length) lines.push(`【世界背景】\n${parts.join('\n')}`)
      }
    } catch { /* 背景读取失败不阻断 */ }
  }

  // 分类名册（人物/地点/门派/武功/物品/故事线/自定义分类/伏笔）
  for (const g of groups) {
    if (g.kindKey === 'overview' || !include(g.kindKey)) continue
    if (!g.entries.length) continue
    if (g.kindKey === 'foreshadow') {
      if (!q.includeForeshadows && want !== 'foreshadow') continue
      const open = g.entries.filter((e) => (e.fields as Record<string, unknown>)?.status === 'open')
      if (open.length) lines.push(`【待回收伏笔】\n${open.map((e) => `- ${e.name}（${e.sub}）`).join('\n')}`)
      continue
    }
    const roster = g.entries
      .map((e) => {
        const f = e.fields as Record<string, unknown>
        const brief =
          g.kindKey === 'plot'
            ? truncText(f.summary, LIST_LINE_MAX)
            : g.kindKey === 'character'
              ? truncText(f.occupation || f.rolePosition || f.personality, LIST_LINE_MAX)
              : truncText(f.description || f.summary || f.note || f.stance, LIST_LINE_MAX)
        return `- ${e.name}(${e.id})${brief ? `：${brief}` : ''}`
      })
      .join('\n')
    lines.push(`【${g.label}】\n${roster}`)
  }

  // 全局事件时间线（仅 all；按章过滤=该章及之前）
  if (!want) {
    try {
      const events = ((await db?.lwEvents?.getByProjectId(projectId)) || []).filter(
        (ev: any) =>
          (ev.state ?? 'happened') === 'happened' &&
          (!q.chapter || ev.chapterNumber === Number(q.chapter) || (ev.chapterNumber || 0) < Number(q.chapter)),
      )
      if (events.length) {
        lines.push(
          `【事件】\n${events
            .slice(0, 20)
            .map((ev: any) => `- 第${ev.chapterNumber || '—'}章 ${ev.name}${ev.description ? `：${truncText(ev.description, 50)}` : ''}`)
            .join('\n')}`,
        )
      }
    } catch { /* 事件读取失败不阻断 */ }
  }

  return lines
}

/** 读工具：查故事圣经——项目已确立设定的统一入口（与设定集面板同一读模型） */
function buildQueryBibleToolDef(): AgentToolDef {
  return {
    name: 'lw_query_bible',
    description:
      '查询本项目已确立的故事设定：故事概要、人物（全字段：外貌/性格/背景/能力…）、故事线（概要+涉及人物）、世界背景与地点/门派/武功/物品、自定义分类（如国别立场）、关系（可按章节锚点过滤）、已发生事件与待回收伏笔。设计任务前必须先查，避免与既有设定冲突或重复。',
    inputSchema: queryBibleSchema,
    dangerLevel: 'read',
    executeTimeoutMs: 30_000,
    autoApprovableInWorkflow: true,
    execute: async (input, ctx) => {
      const { projectId } = lwCtxFrom(ctx)
      const db = getCoreDatabaseManager()
      const q = ((input ?? {}) as { query?: Record<string, any> }).query ?? {}
      const svc = new BibleQueryService(db)
      // 大纲走 lw_query_outline（专用工具含章号/写作状态），不在此重复
      const groups = (await svc.list(projectId)).filter((g) => g.kindKey !== 'outline')

      // 单条详情：全字段 + 演进时间线
      if (q.name) {
        const kindKeys =
          q.type && q.type !== 'all'
            ? q.type === 'custom'
              ? groups.filter((g) => g.storage === 'custom').map((g) => g.kindKey)
              : [String(q.type)]
            : groups.map((g) => g.kindKey)
        const hit = findBibleEntry(groups, kindKeys, String(q.name))
        if (!hit) {
          return { ok: true, data: { found: false, message: `未找到名为「${q.name}」的设定${q.type && q.type !== 'all' ? `（类别 ${q.type}）` : ''}` } }
        }
        if ('ambiguous' in hit) {
          return { ok: true, data: { found: false, ambiguous: hit.ambiguous, message: `「${q.name}」命中多条，请带 type 精确查询：${hit.ambiguous.join('、')}` } }
        }
        const text = await renderBibleEntryDetail(svc, db, projectId, hit.group, hit.entry, Number(q.chapter) || undefined)
        return { ok: true, data: { found: true, text } }
      }

      // 列表（单字段受注册表 2000 字硬截断约束，预算内自控：超纲让模型按 type 细查）
      const lines = await renderBibleList(db, projectId, groups, q)
      const text = lines.join('\n\n') || '（圣经为空：尚无任何已确立设定）'
      return { ok: true, data: { text: text.slice(0, 1900) } }
    },
  }
}

/** 读工具：查大纲树（章法入口的 outlineId 唯一自助来源）；node 模式给单节点详情 */
function buildQueryOutlineToolDef(): AgentToolDef {
  return {
    name: 'lw_query_outline',
    description:
      '查询本项目大纲（文档序）。缺省返回目录：卷/章的节点 id、章号、标题与概要摘要；传 node 返回单节点详情：概要全文、出场人物/地点/物品（已解析为名称）、写作状态与已写字数。写某章正文/读正文前先用它把「第N章」或章节标题解析成 outlineId。',
    inputSchema: z.object({
      node: z.string().optional().describe('只看某一节点：节点 id、「第N章」或章节标题（缺省=返回目录）'),
    }),
    dangerLevel: 'read',
    executeTimeoutMs: 30_000,
    autoApprovableInWorkflow: true,
    execute: async (input, ctx) => {
      const { projectId } = lwCtxFrom(ctx)
      const db = getCoreDatabaseManager()
      const nodeRef = ((input ?? {}) as { node?: string }).node?.trim()
      const { outlines, order } = await loadOutlineDocOrder(projectId)
      if (!outlines.length) return { ok: true, data: { text: '（大纲为空）' } }

      // 单节点详情：概要全文 + 出场实体名称 + 写作状态
      if (nodeRef) {
        const ref = await resolveOutlineRef(projectId, nodeRef)
        if (!ref.ok) return { ok: false, error: ref.error }
        const row = outlines.find((o) => o.id === ref.id) as Record<string, any> | undefined
        const lines: string[] = []
        const typeLabel = row?.nodeType === 'volume' ? '（卷）' : row?.nodeType === 'section' ? '（节）' : ''
        lines.push(`${ref.chapterNo ? `第${ref.chapterNo}章` : '【卷】'}《${ref.title}》 id=${ref.id}${typeLabel}`)
        lines.push(row?.summary ? `概要：${truncText(row.summary, 1500)}` : '概要：（空）')
        if (row?.estimatedWords) lines.push(`预估字数：${row.estimatedWords}`)
        const [chars, locs, items] = await Promise.all([
          resolveIdNames(db, projectId, row?.involvedCharacters, 'lwCharacters'),
          resolveIdNames(db, projectId, row?.involvedLocations, 'lwLocations'),
          resolveIdNames(db, projectId, row?.involvedItems, 'lwItems'),
        ])
        if (chars) lines.push(`出场人物：${chars}`)
        if (locs) lines.push(`涉及地点：${locs}`)
        if (items) lines.push(`涉及物品：${items}`)
        let writtenNote = '写作状态：未写'
        try {
          const ch = await db?.lwChapters?.getByOutlineId?.(ref.id)
          if (ch?.content?.trim()) writtenNote = `写作状态：已写（${String(ch.content).replace(/\s/g, '').length} 字）`
        } catch { /* 章节读取失败保持未写结论（fail-soft） */ }
        lines.push(writtenNote)
        return { ok: true, data: { text: lines.join('\n'), outlineId: ref.id, chapterNo: ref.chapterNo } }
      }

      // 目录
      const lines = order.ordered.map((o) => {
        const no = outlineChapterNumber(order, o.id)
        const summary = String((o as any).summary ?? '').replace(/\s+/g, ' ').slice(0, 120)
        return `- ${no ? `第${no}章` : '【卷】'} 《${(o as any).name ?? ''}》 id=${o.id}${summary ? `：${summary}` : ''}`
      })
      return { ok: true, data: { text: lines.join('\n') } }
    },
  }
}

/** 读工具：读已写正文（前情回顾/续写衔接；与 lw_write_chapter 的写路径配对）。
 *  注册表管线对结果单字段有 2000 字硬截断，故缺省给「开头+结尾」视图，全文用 offset 翻页 */
function buildQueryChapterToolDef(): AgentToolDef {
  return {
    name: 'lw_query_chapter',
    description:
      '读取某章已保存的正文。缺省返回「开头+结尾」视图（中段省略并标注全文字数）——回顾前情、核对结尾衔接用；要通读全文用 offset 翻页（每次约 1800 字，nextOffset 为 null 时读毕）。未写的章返回未写状态。',
    inputSchema: z.object({
      chapter: z.string().min(1).describe('章节大纲节点 id、「第N章」或章节标题（自动解析；拿不准先 lw_query_outline）'),
      offset: z.number().int().min(0).optional().describe('从该字符位置起读（翻页读全文用；缺省=开头+结尾视图）'),
      maxChars: z.number().int().min(500).max(1900).optional().describe('本次返回上限（字符，缺省 1900）'),
    }),
    dangerLevel: 'read',
    executeTimeoutMs: 30_000,
    autoApprovableInWorkflow: true,
    execute: async (input, ctx) => {
      const { chapter, offset, maxChars } = (input ?? {}) as { chapter?: string; offset?: number; maxChars?: number }
      if (!chapter) return { ok: false, error: '缺少 chapter' }
      const { projectId } = lwCtxFrom(ctx)
      try {
        const ref = await resolveOutlineRef(projectId, chapter)
        if (!ref.ok) return { ok: false, error: ref.error }
        const existing = await getCoreDatabaseManager().lwChapters?.getByOutlineId?.(ref.id)
        const content = String(existing?.content ?? '')
        if (!content.trim()) {
          return { ok: true, data: { written: false, outlineId: ref.id, chapterNo: ref.chapterNo, message: `《${ref.title}》还没有正文` } }
        }
        const wordCount = content.replace(/\s/g, '').length
        const budget = Math.min(Math.max(Number(maxChars) || 1900, 500), 1900)

        let text: string
        let nextOffset: number | null = null
        if (offset === undefined || offset === null) {
          // 开头+结尾视图（中略标注）；短文直接全文
          if (content.length <= budget) {
            text = content
          } else {
            const head = Math.floor(budget * 0.6)
            text = `${content.slice(0, head)}\n……（中略，全文 ${content.length} 字，可用 offset 翻页读全文）……\n${content.slice(-(budget - head))}`
          }
        } else {
          const start = Math.min(offset, content.length)
          text = content.slice(start, start + budget)
          if (start + budget < content.length) nextOffset = start + budget
        }
        return {
          ok: true,
          data: {
            written: true,
            outlineId: ref.id,
            chapterNo: ref.chapterNo,
            title: ref.title,
            totalChars: content.length,
            wordCount,
            offset: offset ?? 0,
            nextOffset,
            text,
          },
        }
      } catch (e: any) {
        return { ok: false, error: e?.message || '正文读取失败' }
      }
    },
  }
}

/** 读工具：查共识账本（confirmed/tentative 结论，讨论的"宪法"）。
 *  审计（09-15）：原先只返回 text（ledgerSnapshotText 无 id），模型改条目前拿不到
 *  定位依据——补 entries[]（id/kind/status/title，最近更新在前；注册表对数组只保留
 *  前 20 项，更早的条目仍可按 text 里的标题子串定位）与 counts。text 原样保留不破坏
 *  既有消费方。 */
function buildQueryLedgerToolDef(): AgentToolDef {
  return {
    name: 'lw_query_ledger',
    description:
      '查询研讨共识账本：与用户已确认/待确认的创作共识（前提、人物要点、基调、禁忌等）。返回 text 快照 + entries[]（id/kind/status/title，最近更新在前）+ counts 计数；要用 lw_update_ledger 改/加条目时先查这里拿 entries[].id。设计须与 confirmed 结论一致，不得复活 rejected 方案。',
    inputSchema: z.object({}).describe('无需参数'),
    dangerLevel: 'read',
    executeTimeoutMs: 15_000,
    autoApprovableInWorkflow: true,
    execute: async (_input, ctx) => {
      const { projectId } = lwCtxFrom(ctx)
      const state = await getRoomState(getCoreDatabaseManager(), projectId)
      const text = ledgerSnapshotText(state.ledger) || '（账本为空）'
      return {
        ok: true,
        data: {
          text,
          phase: state.phase,
          turnNo: state.turnNo,
          counts: ledgerStatusCounts(state.ledger),
          entries: [...state.ledger]
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map((e) => ({ id: e.id, kind: e.kind, status: e.status, title: e.title })),
        },
      }
    },
  }
}

// ==================== 写工具（共识账本；与上面 lw_query_ledger 配对） ====================
// 用户拍板（2026-09-15）：账本此前只有检索工具，出现错误条目（互相矛盾的钩子
// 方案、被误标「已否决」的正确方案）时 agent 无手段修正。手动翻转的状态能扛住
// 回合末再提炼：静默提取（room-ledger/silentExtractLedger）只 append 新条目，
// 不重置既有条目 status；唯一例外是提取器显式输出 conflict op 时 confirmed 会被
// 降回 tentative（系统处理矛盾的既定语义，不是覆盖手动状态；rejected 任何情况
// 都不会被提取器改动）。

const updateLedgerSchema = z.object({
  op: z.enum(['set-status', 'add']).describe('set-status=翻转既有条目状态；add=新增条目'),
  status: z
    .enum(['confirmed', 'rejected', 'tentative'])
    .optional()
    .describe('op=set-status 必填：目标状态（confirmed=已定 / rejected=已否决 / tentative=讨论中）'),
  refs: z
    .array(z.string().min(1))
    .min(1)
    .max(10)
    .optional()
    .describe('op=set-status 必填：条目定位（lw_query_ledger 返回的 entries[].id，或唯一的标题子串），最多 10 条'),
  entry: z
    .object({
      kind: z
        .enum(['premise', 'character', 'plot', 'world', 'tone', 'taboo'])
        .describe('条目类型：premise=前提 / character=人物 / plot=故事线 / world=世界 / tone=基调 / taboo=禁忌'),
      title: z.string().min(1).describe('一句话结论（30 字内；与既有条目同题会被拒绝）'),
      points: z.array(z.string().min(1)).min(1).max(3).describe('支撑细节，1~3 条、每条 40 字内'),
      status: z.enum(['confirmed', 'rejected', 'tentative']).optional().describe('缺省 confirmed（用户拍板后的补记场景）'),
    })
    .optional()
    .describe('op=add 必填：新条目内容'),
})

/** 定位失败 → 明确报错（多命中给候选列表要求澄清；找不到附全账本索引让模型自助重试） */
function renderLedgerLocateFailures(failures: LedgerLocateFailure[], ledger: ConsensusEntry[]): string {
  const lines = failures.map((f) => {
    if (f.reason === 'ambiguous') {
      return (
        `「${f.ref}」命中多条，不得猜——候选：` +
        f.candidates.map((c) => `${c.title}（id=${c.id}，${c.status}）`).join('；') +
        '。向用户澄清后用 id 重试'
      )
    }
    return `「${f.ref}」在账本中不存在`
  })
  const hasNotFound = failures.some((f) => f.reason === 'not-found')
  const index = hasNotFound
    ? `。当前账本：\n${ledger.map((e) => `- ${e.title}（id=${e.id}，${e.status}）`).join('\n') || '（空）'}`
    : ''
  return `账本条目定位失败：${lines.join('；')}${index}`
}

/** 写工具：改/增共识账本条目（用户拍板或纠正账本错误的唯一写入口） */
function buildUpdateLedgerToolDef(): AgentToolDef {
  return {
    name: 'lw_update_ledger',
    description:
      '写入共识账本（唯一写入口）。账本是与用户共识的最高优先级事实：禁止未经用户同意擅改，禁止凭对话推测代用户拍板——只在用户明确拍板（如「就用方案 A」「这个记下来」）或明确指出账本有错时使用。op=set-status：把一条/多条条目改为 confirmed（已定）/rejected（已否决）/tentative（讨论中），如两个钩子方案用户选了 A → A confirmed、B rejected；正确方案被误标已否决 → 恢复为 confirmed。op=add：用户拍板了账本里还没有的共识时补记新条目（缺省 confirmed）。先用 lw_query_ledger 查 entries[].id 再操作；refs 可传 id 或唯一标题子串，命中多条会返回候选列表（须澄清后重试，不得猜）。回执（受影响条目+全账本计数）由系统生成真实数据，一切以回执为准，不要自行编造成功结果。',
    inputSchema: updateLedgerSchema,
    dangerLevel: 'write',
    executeTimeoutMs: 30_000,
    autoApprovableInWorkflow: false,
    execute: async (input, ctx) => {
      const { projectId } = lwCtxFrom(ctx)
      const db = getCoreDatabaseManager()
      const raw = (input ?? {}) as {
        op?: string
        status?: string
        refs?: string[]
        entry?: { kind?: string; title?: string; points?: string[]; status?: string }
      }
      const now = Date.now()

      if (raw.op === 'set-status') {
        if (raw.status !== 'confirmed' && raw.status !== 'rejected' && raw.status !== 'tentative') {
          return { ok: false, error: 'set-status 需要 status：confirmed / rejected / tentative' }
        }
        const refs = (Array.isArray(raw.refs) ? raw.refs : []).map((r) => String(r).trim()).filter(Boolean)
        if (refs.length === 0) return { ok: false, error: 'set-status 需要 refs（条目 id 或唯一标题子串）——先 lw_query_ledger 查账本' }
        // 定位必须在队列内以最新账本执行（防读-改-写丢更新，同 distiller 纪律）；
        // 原子语义：任一 ref 定位失败整批不写
        let outcome: LedgerSetStatusOutcome | undefined
        const next = await mutateRoomState(db, projectId, (current) => {
          outcome = setLedgerEntriesStatus(current.ledger, refs, raw.status as ConsensusStatus, now)
          // 容量不变量与其他写方一致（超限丢最老 tentative/rejected，confirmed 保留）
          return outcome.failures.length > 0 ? current : { ...current, ledger: compactLedger(outcome.ledger) }
        })
        if (!outcome) return { ok: false, error: '账本写入失败（写队列未执行）' }
        if (outcome.failures.length > 0) return { ok: false, error: renderLedgerLocateFailures(outcome.failures, outcome.ledger) }
        // 与 distiller/其他写方一致：写后发 ledger:update 驱动「讨论成果」面板刷新
        emitRoomEvent(projectId, { type: 'ledger:update', ledger: next.ledger })
        const label = raw.status === 'confirmed' ? '已定' : raw.status === 'rejected' ? '已否决' : '讨论中'
        return {
          ok: true,
          data: {
            op: 'set-status',
            updated: outcome.updated.map(({ id, title, status }) => ({ id, title, status })),
            counts: ledgerStatusCounts(next.ledger),
            total: next.ledger.length,
            message: `已把 ${outcome.updated.length} 条账本条目改为「${label}」。以本回执为准。`,
          },
        }
      }

      if (raw.op === 'add') {
        const e = raw.entry ?? {}
        const title = String(e.title ?? '').trim()
        if (!title) return { ok: false, error: 'add 需要 entry.title（一句话结论）' }
        if (!Array.isArray(e.points) || e.points.length === 0) return { ok: false, error: 'add 需要 entry.points（1~3 条支撑细节）' }
        // 容错：模型偶发把 status 放在顶层而非 entry 内（实测），两处都看
        const reqStatus = e.status ?? raw.status
        const status: ConsensusStatus = reqStatus === 'rejected' || reqStatus === 'tentative' ? reqStatus : 'confirmed'
        let outcome: LedgerAddOutcome | undefined
        const next = await mutateRoomState(db, projectId, (current) => {
          // sourceTurn 对齐轮次口径：工具在本轮内执行，state.turnNo 到轮末才 +1
          outcome = addLedgerEntry(
            current.ledger,
            { kind: String(e.kind ?? '') as ConsensusKind, title, points: e.points as string[], status },
            current.turnNo + 1,
            now,
          )
          return outcome.ok ? { ...current, ledger: compactLedger(outcome.ledger) } : current
        })
        if (!outcome) return { ok: false, error: '账本写入失败（写队列未执行）' }
        if (!outcome.ok) return { ok: false, error: outcome.error }
        emitRoomEvent(projectId, { type: 'ledger:update', ledger: next.ledger })
        return {
          ok: true,
          data: {
            op: 'add',
            entry: { id: outcome.entry.id, title: outcome.entry.title, status: outcome.entry.status },
            counts: ledgerStatusCounts(next.ledger),
            total: next.ledger.length,
            message: `已补记账本条目「${outcome.entry.title}」（${outcome.entry.status}）。以本回执为准。`,
          },
        }
      }

      return { ok: false, error: 'op 必须是 set-status 或 add' }
    },
  }
}

// ==================== 进度工具 ====================

const taskProgressSchema = z.object({
  action: z.enum(['plan', 'start', 'done']).describe('plan=声明任务计划；start=开始某一步；done=完成某一步'),
  step: z.number().int().min(1).optional(),
  total: z.number().int().min(1).optional(),
  label: z.string().optional().describe('步骤名称/任务标题（plan 时=任务名）'),
})

function buildTaskProgressToolDef(): AgentToolDef {
  return {
    name: 'lw_task_progress',
    description:
      '上报设计任务的拆解与执行进度（只展示，不改数据）：开始复杂设计前用 action=plan 声明任务名与步骤数，之后 start/done 逐步上报。简单讨论不要调用。',
    inputSchema: taskProgressSchema,
    dangerLevel: 'read',
    executeTimeoutMs: 15_000,
    autoApprovableInWorkflow: true,
    execute: async (input, ctx) => {
      const { projectId } = lwCtxFrom(ctx)
      const raw = (input ?? {}) as { action: string; step?: number; total?: number; label?: string }
      const label = raw.label?.trim() ? ` ${raw.label.trim()}` : ''
      const msg =
        raw.action === 'plan'
          ? `任务计划：共 ${raw.total ?? '?'} 步${label}`
          : raw.action === 'start'
            ? `▶ 开始第 ${raw.step ?? '?'} 步${label}`
            : `✓ 完成第 ${raw.step ?? '?'} 步${label}`
      emitRoomEvent(projectId, { type: 'task:progress', message: msg, tool: 'lw_task_progress', status: 'ok' })
      return { ok: true, data: { status: 'ok', message: msg } }
    },
  }
}

// ==================== 写工具（只落设计包草稿） ====================

const saveCardSchema = z.object({
  taskTitle: z.string().optional().describe('任务标题（本轮首个写工具调用时建包用）'),
  card: z.object({
    kind: z.enum(['overview', 'character', 'plot', 'world', 'outline', 'chapter', 'conflict', 'custom', 'foreshadow']).describe('卡片类型'),
    title: z.string().min(1).describe('卡片标题（如「人物卡 · 林晓」）'),
    data: z.record(z.string(), z.unknown()).describe('卡片数据（与对应落库结构同构：character=人物字段，world=地点/物品/势力/技能清单…）'),
    volumeIndex: z.number().int().optional(),
    note: z.string().optional().describe('给用户的确认提示（如"新增角色，与既有 X 为师徒"）'),
  }),
})

function buildSaveCardToolDef(): AgentToolDef {
  return {
    name: 'lw_save_card',
    description:
      '把一张结构化设计卡（概要/人物/故事线/世界设定/大纲/章节/伏笔/自定义分类）加入设计包。只入草稿包，用户整体确认后才落库——不会立即生效。同类信息用一张卡汇总，不要碎片化。',
    inputSchema: saveCardSchema,
    dangerLevel: 'write',
    executeTimeoutMs: 30_000,
    autoApprovableInWorkflow: false,
    execute: async (input, ctx) => {
      const raw = (input ?? {}) as { taskTitle?: string; card?: any }
      const card = raw.card ?? {}
      const label = `卡片 · ${card.title ?? card.kind}`
      return saveDesign(ctx, { taskTitle: raw.taskTitle }, 'card', label, raw as Record<string, any>, card.note)
    },
  }
}

const saveEventSchema = z.object({
  taskTitle: z.string().optional(),
  event: z.object({
    name: z.string().min(1).describe('事件名（≤15 字）'),
    description: z.string().optional().describe('事件经过（谁/在哪/发生了什么/结果）'),
    involvedEntities: z
      .array(z.object({ type: z.string(), id: z.string().optional(), name: z.string() }))
      .optional()
      .describe('涉及实体（id 尽量用 lw_query_bible 查到的）'),
    stateBefore: z.string().optional(),
    stateAfter: z.string().optional(),
    chapterNumber: z.number().int().min(0).optional().describe('发生章节；0 或缺省=规划中尚未锚定章节'),
  }),
})

function buildSaveEventToolDef(): AgentToolDef {
  return {
    name: 'lw_save_event',
    description:
      '把一个故事事件加入设计包（如"林晓在比武大会夺魁"）。chapterNumber 缺省=规划中事件；已锚定章节的事件确认后进事件时间线，写作时会自动注入防冲突上下文。',
    inputSchema: saveEventSchema,
    dangerLevel: 'write',
    executeTimeoutMs: 30_000,
    autoApprovableInWorkflow: false,
    execute: async (input, ctx) => {
      const raw = (input ?? {}) as { taskTitle?: string; event?: any }
      const ev = raw.event ?? {}
      const label = `事件 · ${ev.name ?? ''}`
      return saveDesign(ctx, { taskTitle: raw.taskTitle }, 'event', label, ev as Record<string, any>)
    }
  }
}

const saveRelationSchema = z.object({
  taskTitle: z.string().optional(),
  relation: z.object({
    sourceName: z.string().min(1).describe('起点实体名'),
    targetType: z.enum(['character', 'location', 'item', 'faction', 'skill']).optional(),
    targetName: z.string().min(1).describe('终点实体名'),
    changeType: z.enum(['new', 'ended']).optional().describe('new=建立关系（默认）；ended=终结既有关系'),
    relationType: z.string().min(1).describe('关系短词（夫妻/师徒/结义/敌对/主仆/所属…）'),
    description: z.string().optional().describe('关系说明/依据'),
    validFromChapter: z.number().int().optional().describe('自第几章起生效（研讨期缺省=第 1 章；ended 缺省=故事开始前已终结）'),
  }),
})

function buildSaveRelationToolDef(): AgentToolDef {
  return {
    name: 'lw_save_relation',
    description:
      '把一条实体关系加入设计包（人物-人物/人物-地点/人物-物品/人物-势力…）。changeType=ended 表示终结既有关系（决裂/离婚等）。确认后进图谱时间线。',
    inputSchema: saveRelationSchema,
    dangerLevel: 'write',
    executeTimeoutMs: 30_000,
    autoApprovableInWorkflow: false,
    execute: async (input, ctx) => {
      const raw = (input ?? {}) as { taskTitle?: string; relation?: any }
      const rel = raw.relation ?? {}
      const label = `关系 · ${rel.sourceName ?? '?'} ${rel.changeType === 'ended' ? '✕' : '→'} ${rel.targetName ?? '?'}：${rel.relationType ?? ''}`
      return saveDesign(ctx, { taskTitle: raw.taskTitle }, 'relation', label, rel as Record<string, any>)
    },
  }
}

const runVolumeDesignSchema = z.object({
  volumeId: z.string().min(1).describe('卷标识（契约 volume 字段，如 v1；须与已确认 spine 的卷声明一致，或显式给章界）'),
  title: z.string().optional().describe('卷标题（缺省取 spine 卷声明）'),
  focus: z.string().optional().describe('卷焦点一句话'),
  chapterFrom: z.number().int().min(1).optional().describe('起始章（缺省取 spine 章界）'),
  chapterTo: z.number().int().min(1).optional().describe('结束章（缺省取 spine 章界）'),
})

function buildRunVolumeDesignToolDef(): AgentToolDef {
  return {
    name: 'lw_run_volume_design',
    description:
      '启动卷设计工作流（无人值守批量模式）：引擎确定性执行 骨架→人物层→网格分批→整合 多 pass 生成，每 pass 过 JSON 契约校验+修复回路。异步启动即返回 runId（生成耗时分钟级，不要轮询等待）；产物会自动出现在设计包，用户在设计包确认后落库。同卷有在途 run 时会被互斥跳过（skipped）。',
    inputSchema: runVolumeDesignSchema,
    dangerLevel: 'write',
    executeTimeoutMs: 30_000,
    autoApprovableInWorkflow: false,
    execute: async (input, ctx) => {
      const raw = (input ?? {}) as { volumeId?: string; title?: string; focus?: string; chapterFrom?: number; chapterTo?: number }
      if (!raw.volumeId) return { ok: false, error: '缺少 volumeId' }
      try {
        const started = await ensureVolumeDesignWorkflowRun(lwCtxFrom(ctx).projectId, raw.volumeId, {
          title: raw.title,
          focus: raw.focus,
          chapterFrom: raw.chapterFrom,
          chapterTo: raw.chapterTo,
        })
        if (started.status === 'skipped') {
          return { ok: false, error: `同卷已有在途/待审的卷设计运行（runId: ${started.runId}），已跳过——不要重复启动，等待其产物入设计包即可` }
        }
        return {
          ok: true,
          data: {
            status: 'started',
            runId: started.runId,
            message: `卷设计工作流已启动（runId: ${started.runId}）。请告知用户生成需数分钟，完成后设计包会出现「卷设计」条目，确认后才落库生效。不要轮询本 run 状态。`,
          },
        }
      } catch (e: any) {
        return { ok: false, error: e?.message || '卷设计工作流启动失败' }
      }
    },
  }
}

const saveDesignDocSchema = z.object({  taskTitle: z.string().optional(),
  kind: z.enum(['spine', 'volume']).describe('文档层级：spine=全书总纲；volume=卷设计'),
  title: z.string().min(1).describe('文档标题（如「第三卷 · 渡江风云」）'),
  doc: z.record(z.string(), z.unknown()).describe('契约 JSON 全文——结构必须符合长文设计契约（spine/卷设计 schema），校验失败会返回带路径的错误清单'),
})

function buildSaveDesignDocToolDef(): AgentToolDef {
  return {
    name: 'lw_save_design_doc',
    description:
      '保存结构化设计文档（JSON 契约：spine=核心故事/主线/核心人物/卷目录；volume=cast/threads 暗线/grid 章节网格/events 计划事件）。服务端做结构+语义校验（ID 引用完整性、暗线 plant<develop<payoff、章界），失败返回 {path,code,message} 错误清单——逐条修复后重新提交，全部通过才进入设计包待用户确认。同卷重复保存=更新草稿（version+1）。',
    inputSchema: saveDesignDocSchema,
    dangerLevel: 'write',
    executeTimeoutMs: 30_000,
    autoApprovableInWorkflow: false,
    execute: async (input, ctx) => {
      const raw = (input ?? {}) as { taskTitle?: string; kind?: string; title?: string; doc?: any; volumeId?: string }
      const kind = raw.kind === 'spine' ? 'spine' : 'volume'
      const doc = raw.doc ?? {}
      const { saveDesignDraft } = await import(
        '@core/platform/services/longwriting/design/design-document.service'
      )
      const r = await saveDesignDraft(getCoreDatabaseManager(), lwCtxFrom(ctx).projectId, {
        kind,
        title: String(raw.title || '设计文档'),
        doc,
        volumeId: raw.volumeId,
      })
      if (!r.ok || !r.docId) {
        return { ok: false, error: r.message }
      }
      // 文档本体在 lw_design_documents；设计包条目只带摘要引用（确认面板勾选 → confirmDesignDoc 落库）
      const summary =
        kind === 'volume'
          ? `cast ${(doc as any).cast?.length ?? 0} · 暗线 ${(doc as any).threads?.length ?? 0} · 章节网格 ${(doc as any).grid?.length ?? 0}`
          : `核心故事 + 主线 ${(doc as any).main_lines?.length ?? 0} + 卷目录 ${(doc as any).volumes?.length ?? 0}`
      const saved = await saveDesign(ctx, { taskTitle: raw.taskTitle }, 'design_doc', `${kind === 'spine' ? '总纲' : '卷设计'} · ${raw.title ?? ''}`, {
        docId: r.docId,
        kind,
        volumeId: kind === 'volume' ? (doc as any).volume ?? raw.volumeId ?? null : null,
        summary,
      } as Record<string, any>)
      return { ok: true, data: { status: 'ok', docId: r.docId, version: r.version, message: `${r.message}；${(saved.data as any)?.message ?? ''}` } }
    },
  }
}

// ==================== 注册与白名单 ====================

// ==================== 章法工具链（54 号：写正文章法=skill 定义 + 工具编排） ====================
// 章法文本（步骤/提示词/agent 指令）单一事实源在 skills/chapter-writing.ts；
// 本组工具让研讨室 agent 能自主执行"设计→自检→人确认→写正文"，
// 人确认发生在对话中（设计卡与自检问题呈给用户，认可后才 confirm）。

function buildDesignChapterCardToolDef(): AgentToolDef {
  return {
    name: 'lw_design_chapter_card',
    description:
      '为指定章节生成「章节设计卡」（情节概要/开场钩子/本章爽点/章尾卡点+钩型/出场实体/伏笔动作），工具内部已对齐全书概要、前情状态并做自检。写正文的章法第一步：生成后把卡片要点与自检问题讲给用户，经用户认可再确认。',
    inputSchema: z.object({
      outlineId: z.string().min(1).describe('章节大纲节点 id，或「第N章」/章节标题（自动解析；拿不准先 lw_query_outline）'),
    }),
    dangerLevel: 'write',
    executeTimeoutMs: 120_000,
    autoApprovableInWorkflow: false,
    execute: async (input, ctx) => {
      const { outlineId } = (input ?? {}) as { outlineId?: string }
      if (!outlineId) return { ok: false, error: '缺少 outlineId' }
      const { projectId } = lwCtxFrom(ctx)
      try {
        const ref = await resolveOutlineRef(projectId, outlineId)
        if (!ref.ok) return { ok: false, error: ref.error }
        // 注入研讨共识账本：对话中拍板的修正对设计卡可见，否则会反复回退到已否决的旧设定
        let consensusText: string | undefined
        try {
          const roomState = await getRoomState(getCoreDatabaseManager(), projectId)
          consensusText = ledgerSnapshotText(roomState.ledger) || undefined
        } catch { /* 账本读取失败不阻断（fail-soft） */ }
        const result = await LongWritingAIService.getInstance().generateChapterCard(
          `lw-room-card-${Date.now()}`,
          projectId,
          ref.id,
          undefined,
          undefined,
          consensusText,
        )
        if (!result.success) return { ok: false, error: result.error }
        const { card, markdown, review } = result.data as any
        const applied = await LongWritingService.getInstance().applyChapterCard(projectId, ref.id, card, markdown)
        return {
          ok: true,
          data: {
            markdown,
            review,
            unresolvedNames: applied.unresolvedNames,
            message: '设计卡已生成（未确认）。请把卡片要点与自检问题讲给用户，认可后调 lw_confirm_chapter_card。',
          },
        }
      } catch (e: any) {
        return { ok: false, error: e?.message || '设计卡生成失败' }
      }
    },
  }
}

function buildConfirmChapterCardToolDef(): AgentToolDef {
  return {
    name: 'lw_confirm_chapter_card',
    description:
      '确认某章的章节设计卡（须先经用户在对话中认可）。确认后该章才允许生成正文——这是章法的人确认环节，禁止跳过或代替用户决定。',
    inputSchema: z.object({
      outlineId: z.string().min(1).describe('章节大纲节点 id，或「第N章」/章节标题（自动解析）'),
    }),
    dangerLevel: 'write',
    executeTimeoutMs: 30_000,
    autoApprovableInWorkflow: false,
    execute: async (input, _ctx) => {
      const { outlineId } = (input ?? {}) as { outlineId?: string }
      if (!outlineId) return { ok: false, error: '缺少 outlineId' }
      try {
        const ref = await resolveOutlineRef(lwCtxFrom(_ctx).projectId, outlineId)
        if (!ref.ok) return { ok: false, error: ref.error }
        const prewrite = await LongWritingService.getInstance().confirmPrewrite(ref.id)
        if (!prewrite) return { ok: false, error: '该章还没有设计卡，请先 lw_design_chapter_card' }
        return { ok: true, data: { message: '设计卡已确认，可以 lw_write_chapter 写正文。' } }
      } catch (e: any) {
        return { ok: false, error: e?.message || '确认失败' }
      }
    },
  }
}

function buildWriteChapterToolDef(): AgentToolDef {
  return {
    name: 'lw_write_chapter',
    description:
      '【仅限分步模式】按已确认的章节设计卡生成并保存某章正文——这是「设计卡→用户确认→写正文」分步流程的最后一步，不是一键章法；一般场景一律用 lw_write_chapter_full（唯一推荐入口，内部走工作流）。内部强制：无已确认设计卡会被门禁拒绝；一致性疑点未处理也会拒绝。默认拒绝覆盖已有正文——确要重写须先征得用户同意再传 overwrite=true。',
    inputSchema: z.object({
      outlineId: z.string().min(1).describe('章节大纲节点 id，或「第N章」/章节标题（自动解析）'),
      overwrite: z.boolean().optional().describe('该章已有正文时是否覆盖（须先征得用户同意）'),
    }),
    dangerLevel: 'write',
    executeTimeoutMs: 600_000,
    autoApprovableInWorkflow: false,
    execute: async (input, ctx) => {
      const { outlineId, overwrite } = (input ?? {}) as { outlineId?: string; overwrite?: boolean }
      if (!outlineId) return { ok: false, error: '缺少 outlineId' }
      const { projectId } = lwCtxFrom(ctx)
      try {
        const ref = await resolveOutlineRef(projectId, outlineId)
        if (!ref.ok) return { ok: false, error: ref.error }
        const nodeId = ref.id
        const svc = LongWritingService.getInstance()
        const existing = await svc.getChapter(nodeId)
        if (existing?.content?.trim() && !overwrite) {
          return { ok: false, error: '该章已有正文。询问用户是否重写，用户同意后带 overwrite=true 重新调用。' }
        }
        // 与章法 executor 同口径（0916 review 软收口修复）：分步路径同样注入共识账本
        // 并透传 overwrite——否则研讨室拍板的修正对分步正文不可见（「乘客活下来了」
        // 回退 bug 在此路径复现），且 overwrite 重写会被仅引用本章的 R10 旧稿疑点死锁。
        let consensusText = ''
        try {
          const roomState = await getRoomState(getCoreDatabaseManager(), projectId)
          consensusText = ledgerSnapshotText(roomState.ledger) || ''
        } catch { /* 账本读取失败不阻断（项目可能不经研讨室） */ }
        const stageModel = await resolveStageModelOpts(projectId)
        const result = await LongWritingAIService.getInstance().generateChapter(
          `lw-room-write-${Date.now()}`,
          projectId,
          nodeId,
          undefined,
          stageModel.providerConfigId,
          stageModel.modelId,
          undefined,
          consensusText
            ? `【作者已拍板的共识与修正（最高优先级，与大纲/上文冲突时以此为准，禁止出现被否决的写法）】\n${consensusText}`
            : undefined,
          // 门禁（设计卡+一致性）照常生效；overwrite 放行仅引用本章的旧稿疑点
          { overwrite: overwrite === true },
        )
        if (!result.success) return { ok: false, error: result.error }
        const content = (result.data as any)?.content || ''
        if (!content.trim()) return { ok: false, error: '正文生成为空' }
        const saved = await svc.saveChapter(nodeId, content)
        // 保存后跑提取流水线（事件/状态切片/伏笔/摘要），失败不阻断
        let pipelineNote = ''
        try {
          const outlines = (await getCoreDatabaseManager().lwOutlines?.getByProjectId(projectId)) || []
          const no = outlineChapterNumber(buildOutlineDocOrder(outlines as never), nodeId) ?? 0
          await new ChapterGraphProcessor().process({ projectId, outlineId: nodeId, chapterContent: content, chapterNumber: no })
          pipelineNote = '图谱已更新'
        } catch (e: any) {
          pipelineNote = `图谱更新失败（下次保存重跑）：${e?.message || ''}`
        }
        return {
          ok: true,
          data: {
            chapterId: saved?.id,
            wordCount: content.replace(/\s/g, '').length,
            qualityGate: (result.data as any)?.qualityGate,
            message: `正文已保存。${pipelineNote}`,
          },
        }
      } catch (e: any) {
        return { ok: false, error: e?.message || '正文生成失败' }
      }
    },
  }
}

function buildWriteChapterFullToolDef(): AgentToolDef {
  return {
    name: 'lw_write_chapter_full',
    description:
      '按章法一键写完一章（写正文唯一推荐入口）：内部启动「章节写作章法」工作流并在本工具内等待完成（工作流引擎确定性执行「生成章节设计卡（情节概要/开场钩子/爽点/章尾卡点）→ 自检 → 依据设计卡确定出场角色/地点/物品并确认 → 一致性检查 → 通过后生成并保存正文 → 写后一致性检查」，run 记录可审计）。自检或一致性检查不通过时返回具体问题清单——此时把问题讲给用户，修正方向确认后重新调用；禁止跳过章法直接写正文。该章已有正文时须用户同意后传 overwrite=true。',
    inputSchema: z.object({
      outlineId: z.string().min(1).describe('章节大纲节点 id，或「第N章」/章节标题（自动解析；拿不准先 lw_query_outline）'),
      overwrite: z.boolean().optional().describe('该章已有正文时是否覆盖（须先征得用户同意）'),
    }),
    dangerLevel: 'write',
    executeTimeoutMs: 600_000,
    autoApprovableInWorkflow: false,
    execute: async (input, ctx) => {
      const { outlineId, overwrite } = (input ?? {}) as { outlineId?: string; overwrite?: boolean }
      if (!outlineId) return { ok: false, error: '缺少 outlineId' }
      const { projectId } = lwCtxFrom(ctx)
      try {
        const ref = await resolveOutlineRef(projectId, outlineId)
        if (!ref.ok) return { ok: false, error: ref.error }
        // 工作流唯一入口收口（用户意见 2026-09-15）：不再直调 executor——
        // 一律经工作流引擎 run 执行（可审计），等待在工具内完成，agent 零轮询步数
        const outcome = await runChapterWorkflowSync(projectId, ref.id, !!overwrite, (p) =>
          emitRoomEvent(projectId, { type: 'task:progress', message: `${p.step}：${p.message}`, tool: 'lw_write_chapter_full', status: 'ok' }),
        )
        if (!outcome.ok) {
          return { ok: false, error: outcome.error }
        }
        const out = outcome.data ?? {}
        return {
          ok: true,
          data: {
            chapterId: out.chapterId,
            wordCount: out.wordCount,
            review: out.review,
            postCheck: out.postCheck,
            message: `章法完成：设计卡→自检→出场实体→一致性→正文已保存（${out.wordCount} 字）。${out.postCheck?.passed ? '写后一致性检查通过。' : '写后一致性检查发现新疑点：' + (out.postCheck?.report || '')}`,
          },
        }
      } catch (e: any) {
        return { ok: false, error: e?.message || '章法写作失败' }
      }
    },
  }
}

const CHAPTER_WF_DEF_NAME = '章节写作章法'

function buildPatchChapterToolDef(): AgentToolDef {
  return {
    name: 'lw_patch_chapter',
    description:
      '章节正文局部修正（措辞级修错首选，避免整章重写引入新漂移）：按「原文摘录」在该章已写正文中精确定位并替换。内部自动完成：保存（版本快照）→ 重跑图谱提取 → 重扫一致性疑点 → 回执修正前后文与剩余疑点。约束：① 修正方案必须先经用户认可，禁止擅自改动正文；② excerpt 必须逐字复制自该章正文（拿不准先 lw_query_chapter），定位失败整单拒绝、绝不模糊替换；③ replacement 只放替换后的正文文字（删除类修正传空串），不要夹解释或批注；④ 该章章法工作流运行中时会被拒绝。',
    inputSchema: z.object({
      chapter: z.string().min(1).describe('章节大纲节点 id，或「第N章」/章节标题（自动解析）'),
      problem: z.string().min(1).describe('问题一句话（进版本备注与修正回执，如「第5章纪日与第7章公决差一天」）'),
      excerpt: z.string().min(2).describe('待替换的原文摘录（逐字复制自正文；同一短语多处出现时配合 nth）'),
      nth: z.number().int().min(1).max(50).optional().describe('摘录第几处命中（默认第 1 处）'),
      replacement: z.string().max(2000).describe('替换后的正文文字（删除类修正传空串）'),
      conflictKey: z.string().optional().describe('关联疑点 key——从疑点清单、修正消息或工具回执的 remainingList 里原样携带（勿自行构造，校验不过不登记）；修正成功后自动登记 resolved，不再拦截生成'),
    }),
    dangerLevel: 'write',
    // 工具内嵌图谱整章重提（3~5 次 LLM 提取）——300s 实测不够（忘川渡冒烟：patch 落库
    // 后重建跑到超时，注册表判失败，agent 被迫自行验证收尾）。与写章工具对齐 600s。
    executeTimeoutMs: 600_000,
    autoApprovableInWorkflow: false,
    execute: async (input, ctx) => {
      const { chapter, problem, excerpt, nth, replacement, conflictKey } = (input ?? {}) as {
        chapter?: string
        problem?: string
        excerpt?: string
        nth?: number
        replacement?: string
        conflictKey?: string
      }
      if (!chapter || !problem || !excerpt) return { ok: false, error: '缺少 chapter/problem/excerpt' }
      const { projectId } = lwCtxFrom(ctx)
      try {
        const ref = await resolveOutlineRef(projectId, chapter)
        if (!ref.ok) return { ok: false, error: ref.error }
        if (ref.chapterNo == null) {
          return { ok: false, error: `「${ref.title}」不是章节节点（可能是卷）——局部修正只针对章节` }
        }
        // 与章法工作流互斥：同章并发写是 last-write-win，会互相覆盖
        const holders = (await getCoreDatabaseManager().workflowRuns?.findByMutexScope(`chapter-writing:${projectId}:${ref.id}`)) || []
        if (holders.length > 0) {
          return { ok: false, error: '该章「章节写作章法」工作流正在运行——等它结束再局部修正，否则两边互相覆盖' }
        }
        const svc = LongWritingService.getInstance()
        const existing = await svc.getChapter(ref.id)
        const content = existing?.content || ''
        if (!content.trim()) {
          return { ok: false, error: '该章还没有正文——局部修正只改已写章节，写正文用 lw_write_chapter_full' }
        }
        const loc = locateExcerpt(content, excerpt, nth ?? 1)
        if (!loc) {
          // 幂等短路（0916 review）：超时/中断重试时补丁可能已落库（saveChapter 在图谱
          // 重提之前，慢段全在保存之后）——摘录已不存在且替换文本已在正文 = 此前已应用，
          // 直接回成功，避免重试命中 excerpt 下一处错位二次替换。
          // 长度门槛（复核 P2-5）：replacement 明显短于摘录时不短路（常见短语误判面），
          // 宁可报错让模型核对，不可静默吞掉一次修正。
          const repEarly = String(replacement ?? '')
          if (repEarly && repEarly.length * 2 >= excerpt.length && content.includes(repEarly)) {
            return {
              ok: true,
              data: {
                chapter: `第${ref.chapterNo}章 ${ref.title}`,
                idempotent: true,
                message: '该补丁此前已应用（正文中已存在替换文本、原摘录已不存在），本次未重复修改。',
              },
            }
          }
          // 救援线索：拿摘录前半段找近似片段，帮 agent 核对原文后重试
          const half = excerpt.slice(0, Math.max(4, Math.ceil(excerpt.length / 2)))
          const near = locateAll(content, half, { cap: 3 }).map((l) => `…${content.slice(Math.max(0, l.start - 8), l.end + 8)}…`)
          return {
            ok: false,
            error: `摘录在该章正文找不到（含引号/空白归一化匹配）——请 lw_query_chapter 核对原文后逐字重试${near.length ? `。近似片段：${near.join('；')}` : ''}`,
          }
        }
        const rep = String(replacement ?? '')
        const before = content.slice(loc.start, loc.end)
        const patched = content.slice(0, loc.start) + rep + content.slice(loc.end)
        await svc.saveChapter(ref.id, patched)
        // 图谱重提（整章重建，幂等有 hash 短路；失败不阻断修正本身，下次保存重跑）
        let pipelineNote = '图谱已更新'
        try {
          const stage = await resolveStageModelOpts(projectId)
          await new ChapterGraphProcessor().process({
            projectId,
            outlineId: ref.id,
            chapterContent: patched,
            chapterNumber: ref.chapterNo,
            providerConfigId: stage.providerConfigId,
            modelId: stage.modelId,
          })
        } catch (e: any) {
          pipelineNote = `图谱更新失败（下次保存重跑）：${e?.message || ''}`
        }
        let resolvedNote = ''
        if (conflictKey) {
          try {
            // key 契约校验（0916 review）：key 含消息哈希、模型不可能自行算出合法值——
            // 此前幻觉 key 会被无条件入账成垃圾登记且回执谎称已 resolved。先与现存
            // 疑点集合比对，不匹配则忽略并明说。
            const pending = await ConsistencyService.getInstance().scanContradictions(projectId)
            const validKeys = new Set(pending.map((c: any) => conflictKeyOf(c)))
            if (!validKeys.has(conflictKey)) {
              // 两种情形（复核 P2-4）：①本次修正已消除该疑点（重扫不再复现）——正常；
              // ②key 是编造/过期的——未登记。文案都要说清，别让模型以为拿错了 key。
              resolvedNote = pending.length === 0
                ? '；当前已无任何未处理疑点（关联疑点应已被消除，无需登记）'
                : '；关联疑点 key 未匹配现存疑点、未登记——若该疑点已被本次修正消除属正常，否则请从疑点清单/修正消息原样携带 conflictKey，不要自行构造'
            } else {
              const added = await acknowledgeConflictByKey(getCoreDatabaseManager(), projectId, conflictKey, 'resolved', `lw_patch_chapter：${problem.slice(0, 60)}`)
              resolvedNote = added ? '；关联疑点已登记 resolved' : '；关联疑点此前已登记'
            }
          } catch {
            resolvedNote = '；关联疑点登记失败（可手动知情保留）'
          }
        }
        let remaining: Array<{ rule?: string; message?: string }> = []
        try {
          remaining = await ConsistencyService.getInstance().scanBlockingConflicts(projectId, ref.chapterNo)
        } catch { /* 重扫失败不影响修正回执 */ }
        return {
          ok: true,
          data: {
            chapter: `第${ref.chapterNo}章 ${ref.title}`,
            paragraph: loc.paragraph,
            start: loc.start,
            end: loc.start + rep.length,
            before,
            after: rep,
            wordCount: patched.replace(/\s/g, '').length,
            remainingConflicts: remaining.length,
            // 带上 conflictKey（后端 conflictKey() 计算）——模型后续修正时作为
            // conflictKey 参数原样传回即可自动登记 resolved（key 契约的合法来源）
            remainingList: remaining.slice(0, 5).map((c) => `[${c.rule || '?'}] ${String(c.message || '').slice(0, 60)}（conflictKey: ${conflictKeyOf(c as any)}）`),
            message: `已修正第${ref.chapterNo}章第${loc.paragraph}段（${before.length}字→${rep.length}字）：「${before.slice(0, 24)}」→「${rep.slice(0, 24)}」。${pipelineNote}${resolvedNote}${remaining.length ? `。注意：第 1~${ref.chapterNo} 章仍有 ${remaining.length} 处未处理疑点（见 remainingList）` : '。一致性扫描无阻断疑点'}`,
          },
        }
      } catch (e: any) {
        return { ok: false, error: e?.message || '局部修正失败' }
      }
    },
  }
}

/**
 * 启动章法工作流并在工具内等待终态（工作流唯一入口的收口实现，用户意见 2026-09-15：
 * 章法执行必须走工作流引擎——run 记录可审计、失败停在具体步骤）。
 * 等待放在工具内部而非让 agent 轮询：agent 每次状态查询消耗一步，实跑第 1 章曾因
 * 轮询烧光 24 步触发 max_steps。进度经 onProgress 转 task:progress 事件上屏。
 */
async function runChapterWorkflowSync(
  projectId: string,
  outlineId: string,
  overwrite: boolean,
  onProgress?: (p: { step: string; message: string }) => void,
): Promise<{ ok: boolean; error?: string; data?: Record<string, any> }> {
  const started = await ensureChapterWritingWorkflowRun(projectId, outlineId, overwrite)
  onProgress?.({ step: 'workflow', message: `章法工作流已启动（运行 ${started.runId}），工具内等待完成` })
  const { getWorkflowSubsystem } = await import('@core/platform/workflow/workflow-boot')
  const sub = getWorkflowSubsystem()
  const deadline = Date.now() + 570_000 // executeTimeoutMs 600s 内留余量
  const TERMINAL = new Set(['succeeded', 'failed', 'cancelled', 'skipped'])
  let lastNodeStatus = ''
  while (Date.now() < deadline) {
    const detail = await sub.runService.getRunDetail(started.runId)
    if (!detail) return { ok: false, error: `工作流运行不存在：${started.runId}` }
    const { run, nodeRuns } = detail
    const node = nodeRuns.find((n) => n.nodeType === 'chapter-writing') ?? nodeRuns[nodeRuns.length - 1]
    if (node && node.status && node.status !== lastNodeStatus) {
      lastNodeStatus = node.status
      onProgress?.({ step: 'workflow', message: `章法运行状态：${run.status}${node.status ? `（${node.nodeName || node.nodeType} ${node.status}）` : ''}` })
    }
    if (run.status === 'succeeded') {
      const out = (node?.output ?? {}) as Record<string, any>
      return { ok: true, data: out }
    }
    if (TERMINAL.has(run.status)) {
      const nodeErr = nodeRuns.find((n) => n.error)?.error
      return { ok: false, error: nodeErr || run.error || `工作流 ${run.status}` }
    }
    await new Promise((r) => setTimeout(r, 3000))
  }
  return { ok: false, error: `等待章法工作流超时（运行 ${started.runId} 仍在执行，可稍后用 get_workflow_run 查询结果）` }
}

/**
 * 章法工作流触发（用户意见 2026-09-15）：agent 不能保证指令遵循——写正文不再依赖
 * 主编逐工具调用，改为启动工作流 run 由引擎确定性调度（chapter-writing 节点内部
 * 按序执行五步，每步状态进 run 记录可审计、失败停在具体步骤）。
 * 定义按名称幂等创建并发布（启动工作流要求已发布图）。
 */
async function ensureChapterWritingWorkflowRun(
  projectId: string,
  outlineId: string,
  overwrite: boolean,
): Promise<{ runId: string; definitionId: string; status: string }> {
  const { getWorkflowSubsystem } = await import('@core/platform/workflow/workflow-boot')
  const sub = getWorkflowSubsystem()

  // 幂等：按名称找已发布定义
  let definitionId: string | null = null
  const listed = await sub.definitionService.list({ keyword: CHAPTER_WF_DEF_NAME, page: 1, pageSize: 20 })
  for (const d of listed.items ?? []) {
    if (d.name === CHAPTER_WF_DEF_NAME) { definitionId = d.id; break }
  }
  if (!definitionId) {
    const graph = {
      version: 1 as const,
      nodes: [
        {
          id: 'start', type: 'start', name: '开始', position: { x: 80, y: 200 },
          config: {
            inputs: [
              { key: 'projectId', label: '长文项目 ID', type: 'string', required: true },
              { key: 'outlineId', label: '章节大纲节点 ID', type: 'string', required: true },
              { key: 'overwrite', label: '覆盖已有正文', type: 'boolean' },
            ],
          },
        },
        {
          id: 'write', type: 'chapter-writing', name: '章节写作章法', position: { x: 320, y: 200 },
          config: {
            projectId: '{{start.projectId}}',
            outlineId: '{{start.outlineId}}',
            overwrite: '{{start.overwrite}}',
            targetWords: 2500,
          },
        },
        { id: 'end', type: 'end', name: '结束', position: { x: 620, y: 200 }, config: {} },
      ],
      edges: [
        { id: 'e_start_write', sourceNodeId: 'start', targetNodeId: 'write', kind: 'normal' },
        { id: 'e_write_end', sourceNodeId: 'write', targetNodeId: 'end', kind: 'normal' },
      ],
    }
    const created = await sub.definitionService.create({
      name: CHAPTER_WF_DEF_NAME,
      description: '长文写作：按章法确定性写完一章（设计卡→自检→出场实体→一致性检查→写正文→写后检查）',
      category: 'longwriting',
      draftGraph: graph as never,
    })
    definitionId = created.id
    await sub.definitionService.publish(definitionId)
  }

  const run = await sub.runService.startRun({
    definitionId,
    triggerType: 'manual',
    inputs: { projectId, outlineId, overwrite },
    usePublishedGraph: true,
    // 互斥按「项目+章节」作用域：不同项目（甚至同项目不同章）的章法 run 可并行，
    // 同一章绝不双跑。全局定义级互斥会让多项目共用章法定义时互相 skip（忘川渡实跑）。
    mutexScope: `chapter-writing:${projectId}:${outlineId}`,
  })
  return { runId: run.id, definitionId, status: run.status }
}

const VOLUME_DESIGN_WF_DEF_NAME = '卷设计章法'

/**
 * 卷设计工作流触发（2026-09-16 结构化设定 M1-W2）：多 pass 卷设计生成
 * （骨架→人物层→网格分批→整合，每 pass 过 L0 校验+修复回路）由引擎确定性
 * 调度（volume-design 节点），产物自动入设计包待用户确认。定义按名称幂等
 * 创建并发布；互斥按「项目+卷」作用域。异步启动返回 runId（多 pass 生成
 * 耗时分钟级，不等待终态——结果以设计包条目为准）。
 */
export async function ensureVolumeDesignWorkflowRun(
  projectId: string,
  volumeId: string,
  opts: { title?: string; focus?: string; chapterFrom?: number; chapterTo?: number } = {},
): Promise<{ runId: string; definitionId: string; status: string }> {
  const { getWorkflowSubsystem } = await import('@core/platform/workflow/workflow-boot')
  const sub = getWorkflowSubsystem()

  let definitionId: string | null = null
  const listed = await sub.definitionService.list({ keyword: VOLUME_DESIGN_WF_DEF_NAME, page: 1, pageSize: 20 })
  for (const d of listed.items ?? []) {
    if (d.name === VOLUME_DESIGN_WF_DEF_NAME) { definitionId = d.id; break }
  }
  if (!definitionId) {
    const graph = {
      version: 1 as const,
      nodes: [
        {
          id: 'start', type: 'start', name: '开始', position: { x: 80, y: 200 },
          config: {
            inputs: [
              { key: 'projectId', label: '长文项目 ID', type: 'string', required: true },
              { key: 'volumeId', label: '卷标识（如 v1）', type: 'string', required: true },
              { key: 'title', label: '卷标题', type: 'string' },
              { key: 'focus', label: '卷焦点', type: 'string' },
              { key: 'chapterFrom', label: '起始章', type: 'number' },
              { key: 'chapterTo', label: '结束章', type: 'number' },
            ],
          },
        },
        {
          id: 'design', type: 'volume-design', name: '卷设计章法', position: { x: 320, y: 200 },
          config: {
            projectId: '{{start.projectId}}',
            volumeId: '{{start.volumeId}}',
            title: '{{start.title}}',
            focus: '{{start.focus}}',
            chapterFrom: '{{start.chapterFrom}}',
            chapterTo: '{{start.chapterTo}}',
            gridBatchSize: 10,
            maxTokens: 8192,
          },
        },
        { id: 'end', type: 'end', name: '结束', position: { x: 620, y: 200 }, config: {} },
      ],
      edges: [
        { id: 'e_start_design', sourceNodeId: 'start', targetNodeId: 'design', kind: 'normal' },
        { id: 'e_design_end', sourceNodeId: 'design', targetNodeId: 'end', kind: 'normal' },
      ],
    }
    const created = await sub.definitionService.create({
      name: VOLUME_DESIGN_WF_DEF_NAME,
      description: '长文写作：确定性生成一卷的结构化设计文档（骨架→人物层→网格分批→整合，每 pass 过契约校验+修复回路），产物入设计包待确认',
      category: 'longwriting',
      draftGraph: graph as never,
    })
    definitionId = created.id
    await sub.definitionService.publish(definitionId)
  }

  const run = await sub.runService.startRun({
    definitionId,
    triggerType: 'manual',
    inputs: {
      projectId,
      volumeId,
      title: opts.title ?? '',
      focus: opts.focus ?? '',
      chapterFrom: opts.chapterFrom,
      chapterTo: opts.chapterTo,
    },
    usePublishedGraph: true,
    // 互斥按「项目+卷」：同卷设计绝不双跑，不同卷可并行
    mutexScope: `volume-design:${projectId}:${volumeId}`,
  })
  return { runId: run.id, definitionId, status: run.status }
}

function buildLwRoomToolDefs(): AgentToolDef[] {
  return [
    buildQueryBibleToolDef(),
    buildQueryOutlineToolDef(),
    buildQueryChapterToolDef(),
    buildQueryLedgerToolDef(),
    buildUpdateLedgerToolDef(),
    buildSaveCardToolDef(),
    buildSaveEventToolDef(),
    buildSaveRelationToolDef(),
    buildSaveDesignDocToolDef(),
    buildRunVolumeDesignToolDef(),
    buildDesignChapterCardToolDef(),
    buildConfirmChapterCardToolDef(),
    buildWriteChapterToolDef(),
    buildWriteChapterFullToolDef(),
    buildPatchChapterToolDef(),
  ]
}

/** 懒注册（幂等）：宿主首次 sendMessage 时调用 */
export function registerLwRoomTools(registry: AgentToolRegistry): void {
  const existing = new Set(registry.listSpecs({ packId: LW_ROOM_PACK_ID }).map((s) => s.name))
  for (const def of buildLwRoomToolDefs()) {
    const namespaced = `pack:${LW_ROOM_PACK_ID}:${def.name}`
    if (existing.has(namespaced)) continue
    registry.register(def, { packId: LW_ROOM_PACK_ID })
  }
  if (!existing.has(`pack:${LW_ROOM_PACK_ID}:lw_task_progress`)) {
    registry.register(buildTaskProgressToolDef(), { packId: LW_ROOM_PACK_ID })
  }
}

/** 宿主 bindings 裸名清单（写+读+进度） */
export function lwRoomToolNames(): string[] {
  return [...buildLwRoomToolDefs().map((d) => d.name), 'lw_task_progress']
}
