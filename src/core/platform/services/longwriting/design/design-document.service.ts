/**
 * 设计文档服务（2026-09-16 结构化设定方案 M1，设计文档 §5.3 D8-D10）
 *
 * 职责：设计 pass 产出（spine / 卷设计 JSON）的「校验 → 存草稿 → 人审确认 →
 * 分解落库 → id 映射回填」。运行时真相仍是各业务表（bible/伏笔/事件/大纲），
 * 本服务是设计层 JSON 与落库层之间的唯一桥梁（避免第二个权威存储）。
 *
 * 分解落库复用既有写路径：
 * - cast      → lwCharacters/lwLocations/lwItems/lwFactions（同名幂等 upsert）
 * - threads   → lwForeshadows（createRow + 暗线关联列 involves/develop/payoff）
 * - events    → lwEvents.create(state='planned')
 * - grid      → lwOutlines 卷下章节点（章号幂等 upsert + involved 绑定）
 * - 卷节点    → design_status='detailed'
 */

import { createLogger } from '@core/utils/logger'
import {
  validateSpine,
  validateVolumeDesign,
  formatIssues,
  type DesignIssue,
  type SpineDoc,
  type VolumeDesignDoc,
  type VolumeCastEntry,
} from '@shared/contracts/longwriting-design'
import type { EntityImportance } from '@shared/types/longwriting.types'

const logger = createLogger('DesignDocumentService')

type DbLike = Record<string, any> | null | undefined

export interface SaveDesignDocInput {
  kind: 'spine' | 'volume'
  title: string
  doc: unknown
  /** kind=volume 时的卷标识（契约 volume 字段），草稿去重键的一部分 */
  volumeId?: string
}

export interface DesignDocResult {
  ok: boolean
  message: string
  docId?: string
  version?: number
  idMap?: Record<string, string>
  errors?: DesignIssue[]
}

// ---------- 服务入口 ----------

/**
 * 保存设计草稿：L0 校验（结构 + 语义，卷设计带最新 spine 上下文），
 * 零错误才落草稿；同 kind(+volumeId) 已有草稿则替换并 version+1。
 * 校验错误原样返回（响亮失败，回喂设计 agent 修复回路）。
 */
export async function saveDesignDraft(db: DbLike, projectId: string, input: SaveDesignDocInput): Promise<DesignDocResult> {
  const docs = db?.lwDesignDocuments
  if (!docs) return { ok: false, message: '设计文档仓储不可用' }

  let errors: DesignIssue[]
  if (input.kind === 'spine') {
    errors = validateSpine(input.doc).errors
  } else {
    const spineRow = await docs.getLatest(projectId, 'spine')
    const spine = spineRow && spineRow.status === 'confirmed' ? (spineRow.doc as SpineDoc) : undefined
    errors = validateVolumeDesign(input.doc, spine).errors
  }
  if (errors.length > 0) {
    return { ok: false, message: `设计文档校验未通过（${errors.length} 项）：\n${formatIssues(errors)}`, errors }
  }

  const volumeId = input.kind === 'volume' ? input.volumeId ?? (input.doc as VolumeDesignDoc).volume : undefined
  const existing = await docs.getLatest(projectId, input.kind, volumeId)
  if (existing && existing.status === 'draft') {
    const updated = await docs.updateDraftJson(existing.id, input.doc)
    return { ok: true, message: `设计草稿已更新（v${updated?.version ?? '?'}）`, docId: updated!.id, version: updated!.version }
  }
  if (existing && existing.status === 'confirmed') {
    // 已确认的卷再保存 = 新草稿（新一轮设计 pass 的产物，不覆盖已确认版本）
  }
  const created = await docs.create({ projectId, kind: input.kind, volumeId: volumeId ?? null, title: input.title, doc: input.doc })
  return { ok: true, message: '设计草稿已保存，待确认后落库', docId: created.id, version: created.version }
}

/** 驳回草稿（不改业务表） */
export async function discardDesignDoc(db: DbLike, _projectId: string, docId: string): Promise<DesignDocResult> {
  const row = await db?.lwDesignDocuments?.setStatus(docId, 'discarded')
  return row ? { ok: true, message: '设计草稿已驳回' } : { ok: false, message: `设计文档不存在：${docId}` }
}

/**
 * 确认设计文档 = 分解落库 + id 映射回填（W2 流的 D9→D10 步）。
 * 任何分解步骤失败都整体返回失败，文档保持 draft（与设计包失败条目留存语义一致）。
 */
export async function confirmDesignDoc(db: DbLike, projectId: string, docId: string): Promise<DesignDocResult> {
  const docs = db?.lwDesignDocuments
  const row = await docs?.getById(docId)
  if (!row) return { ok: false, message: `设计文档不存在：${docId}` }
  if (row.status !== 'draft') return { ok: false, message: `该设计文档已处理过（${row.status}）` }

  // 确认前重验（草稿保存后文档可能已演进）
  if (row.kind === 'spine') {
    const bad = validateSpine(row.doc).errors
    if (bad.length > 0) return { ok: false, message: `文档校验未通过：\n${formatIssues(bad)}`, errors: bad }
    const r = await persistSpineDoc(db, projectId, row.doc as SpineDoc)
    if (!r.ok) return r
    await docs!.setStatus(docId, 'confirmed', r.idMap)
    return { ...r, docId }
  }

  const spineRow = await docs.getLatest(projectId, 'spine')
  const spine = spineRow && spineRow.status === 'confirmed' ? (spineRow.doc as SpineDoc) : undefined
  const bad = validateVolumeDesign(row.doc, spine).errors
  if (bad.length > 0) return { ok: false, message: `文档校验未通过：\n${formatIssues(bad)}`, errors: bad }

  const r = await persistVolumeDesignDoc(db, projectId, row.doc as VolumeDesignDoc, { spine })
  if (!r.ok) return r
  await docs!.setStatus(docId, 'confirmed', r.idMap)
  return { ...r, docId }
}

// ---------- spine 分解落库 ----------

export async function persistSpineDoc(db: DbLike, projectId: string, doc: SpineDoc): Promise<DesignDocResult> {
  const idMap: Record<string, string> = {}
  try {
    // 1. 概要 upsert：premise→coreIdea / theme→style / ending→summary（现有字段语义就近映射）
    const overviews = db?.lwStoryOverviews
    if (overviews) {
      const existing = await overviews.getByProjectId(projectId)
      const patch = { coreIdea: doc.core.premise, style: doc.core.theme, summary: doc.core.ending }
      if (existing) await overviews.update(existing.id, patch)
      else {
        const created = await overviews.create(projectId)
        await overviews.update(created.id, patch)
      }
    }

    // 2. 卷目录 upsert：按名称幂等（name=卷标题），登记 volumeId→outlineNodeId
    const outlines = db?.lwOutlines
    if (outlines) {
      const tree: Array<Record<string, any>> = (await outlines.getByProjectId(projectId)) || []
      for (const vol of doc.volumes) {
        let node = tree.find((t: Record<string, any>) => t.nodeType === 'volume' && t.name === vol.title)
        if (!node) {
          node = (await outlines.create({ projectId, name: vol.title, nodeType: 'volume', summary: vol.focus })) as Record<string, any>
        }
        if (!node) continue
        await outlines.update(node.id, { summary: vol.focus })
        await outlines.updateDesignStatus(node.id, 'coarse')
        idMap[vol.id] = node.id
      }
    }
    return { ok: true, message: `spine 已落库（概要 + ${doc.volumes.length} 卷目录）`, idMap }
  } catch (e: any) {
    logger.error(`[design-doc] spine 落库失败 project=${projectId}:`, e)
    return { ok: false, message: e?.message || 'spine 落库异常' }
  }
}

// ---------- 卷设计分解落库 ----------

function toEntityImportance(importance?: string): EntityImportance {
  if (importance === 'core') return 'main'
  if (importance === 'minor') return 'temporary'
  return 'secondary'
}

function chapterNoOfName(name: string): number {
  const m = /第\s*(\d+)\s*章/.exec(String(name || ''))
  if (m) return Number(m[1])
  const n = /^(\d+)\s/.exec(String(name || ''))
  return n ? Number(n[1]) : NaN
}

export interface PersistVolumeOptions {
  spine?: SpineDoc
}

export async function persistVolumeDesignDoc(
  db: DbLike,
  projectId: string,
  doc: VolumeDesignDoc,
  opts: PersistVolumeOptions = {},
): Promise<DesignDocResult> {
  const idMap: Record<string, string> = {}
  try {
    // 1. 卷大纲节点：spine 里有声明 → 按卷标题找/建；否则按卷 id 命名兜底
    const outlines = db?.lwOutlines
    if (!outlines) return { ok: false, message: '大纲仓储不可用' }
    const tree: Array<Record<string, any>> = (await outlines.getByProjectId(projectId)) || []
    const spineVol = opts.spine?.volumes.find(v => v.id === doc.volume)
    let volNode: Record<string, any> | undefined = tree.find(
      (t: Record<string, any>) => t.nodeType === 'volume' && t.name === (spineVol?.title ?? `卷 ${doc.volume}`),
    )
    if (!volNode) {
      volNode = (await outlines.create({
        projectId,
        name: spineVol?.title ?? `卷 ${doc.volume}`,
        nodeType: 'volume',
        summary: spineVol?.focus ?? '',
      })) as Record<string, any>
    }
    if (!volNode) return { ok: false, message: `卷大纲节点创建失败（${doc.volume}）` }
    idMap[doc.volume] = volNode.id

    // 2. cast upsert（同名幂等：存在即复用 db id，不覆盖既有卡——设定修正走研讨室卡片流）
    for (const entry of doc.cast) {
      const dbId = await upsertCastEntry(db, projectId, entry)
      if (!dbId) return { ok: false, message: `cast 落库失败「${entry.name}」（${entry.kind}）` }
      idMap[entry.id] = dbId
    }
    const nameOf = (designId: string): { type: string; id: string; name: string } | null => {
      const entry = doc.cast.find(c => c.id === designId)
      if (!entry) return null
      return { type: entry.kind, id: idMap[entry.id], name: entry.name }
    }

    // 3. threads → 伏笔账（含暗线关联列）
    const foreshadows = db?.lwForeshadows
    for (const t of doc.threads) {
      const content = t.constraint ? `${t.name}（约束：${t.constraint}）` : t.name
      const row = await foreshadows?.createRow(projectId, content, t.plant, { type: 'discussion' })
      if (!row) return { ok: false, message: `暗线落库失败「${t.name}」` }
      const involves = t.involves.map(nameOf).filter(Boolean) as Array<{ type: string; id: string }>
      await foreshadows?.updateDesignFields(row.id, {
        payoffChapter: t.payoff ?? null,
        involves,
        developChapters: t.develop ?? null,
      })
      idMap[t.id] = row.id
    }

    // 4. events → 计划事件（state=planned；写作抽取对账后转 happened，W1/M3）
    const events = db?.lwEvents
    for (const ev of doc.events) {
      const involved = ev.participants.map(nameOf).filter(Boolean)
      const row = await events?.create({
        projectId,
        name: ev.id,
        description: ev.desc,
        chapterNumber: ev.chapter,
        storyTime: ev.story_time,
        involvedEntities: involved as never,
        state: 'planned',
      } as never)
      if (!row) return { ok: false, message: `计划事件落库失败「${ev.id}」` }
      idMap[ev.id] = row.id
    }

    // 5. grid → 卷下章节点（章号幂等 upsert + involved 绑定 db id）
    const children = tree.filter(t => t.parentId === volNode!.id)
    for (const g of doc.grid) {
      const summary = (g.beats ?? []).join('；')
      const existing = children.find(c => Number.isFinite(chapterNoOfName(c.name)) && chapterNoOfName(c.name) === g.ch)
      if (existing) {
        await outlines.update(existing.id, { summary })
        idMap[`ch_${g.ch}`] = existing.id
        continue
      }
      const firstBeat = (g.beats?.[0] ?? '').slice(0, 20)
      const created = await outlines.create({
        projectId,
        parentId: volNode.id,
        name: firstBeat ? `第${g.ch}章 ${firstBeat}` : `第${g.ch}章`,
        nodeType: 'chapter',
        summary,
        involvedCharacters: (g.present ?? []).map(nameOf).filter(Boolean).map(x => x!.id),
        involvedLocations: g.location && nameOf(g.location) ? [nameOf(g.location)!.id] : [],
        involvedItems: [],
      })
      idMap[`ch_${g.ch}`] = created.id
    }

    // 6. 卷设计锁级别 → detailed
    await outlines.updateDesignStatus(volNode.id, 'detailed')

    return {
      ok: true,
      message: `卷 ${doc.volume} 设计已落库（cast ${doc.cast.length} · 暗线 ${doc.threads.length} · 计划事件 ${doc.events.length} · 章节点 ${doc.grid.length}）`,
      idMap,
    }
  } catch (e: any) {
    logger.error(`[design-doc] 卷设计落库失败 project=${projectId} volume=${doc.volume}:`, e)
    return { ok: false, message: e?.message || '卷设计落库异常', idMap }
  }
}

/** cast 条目 upsert：同项目内同名复用（返回既有 id），缺失则按 kind 建卡（必填字段给中性缺省） */
async function upsertCastEntry(db: DbLike, projectId: string, entry: VolumeCastEntry): Promise<string | null> {
  const importance = toEntityImportance(entry.importance)
  switch (entry.kind) {
    case 'character': {
      const existing = await db?.lwCharacters?.findOneByWhere({ projectId, name: entry.name } as never)
      if (existing) return existing.id
      const row = await db?.lwCharacters?.create({
        projectId,
        name: entry.name,
        gender: 'other',
        age: 0,
        aliases: entry.aliases ?? [],
        importance,
      } as never)
      return row?.id ?? null
    }
    case 'location': {
      const existing = await db?.lwLocations?.findOneByWhere({ projectId, name: entry.name } as never)
      if (existing) return existing.id
      const row = await db?.lwLocations?.create({
        projectId,
        name: entry.name,
        type: 'city',
        importance: entry.importance === 'core' ? 'main' : entry.importance === 'minor' ? 'auxiliary' : 'important',
        entityImportance: importance,
        description: '',
      } as never)
      return row?.id ?? null
    }
    case 'item': {
      const existing = await db?.lwItems?.findOneByWhere({ projectId, name: entry.name } as never)
      if (existing) return existing.id
      const row = await db?.lwItems?.create({
        projectId,
        name: entry.name,
        type: 'other',
        level: 'common',
        importance,
        description: '',
      } as never)
      return row?.id ?? null
    }
    case 'faction': {
      const existing = await db?.lwFactions?.findOneByWhere({ projectId, name: entry.name } as never)
      if (existing) return existing.id
      const row = await db?.lwFactions?.create({
        projectId,
        name: entry.name,
        factionType: 'camp',
        description: '',
      } as never)
      return row?.id ?? null
    }
    default:
      return null
  }
}

// 服务单例形态（与平台服务惯例一致；函数均为纯 db 注入，单例只做命名空间）
export const DesignDocumentService = { saveDesignDraft, confirmDesignDoc, discardDesignDoc, persistSpineDoc, persistVolumeDesignDoc }
