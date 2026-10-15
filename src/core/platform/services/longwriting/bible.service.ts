/**
 * 故事圣经统一读模型（P0-2026-09-09，设计文档 bible-p0-p3 §P0.2）
 * @module core/platform/services/longwriting/bible.service
 *
 * 一个聚合接口把「既有 lw_* 强表 + lw_custom_entities 自定义实体」投影为统一的
 * 分类化条目列表——研讨室设定集与写作台资产面板共用（架构统一：一处抽象两处消费）。
 * 分类由 lw_bible_kinds 驱动：storage='entity' 路由到既有仓储，'custom' 查自定义实体。
 */

import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { createLogger } from '@core/utils/logger'
import type { BibleKindDto } from '@core/database/repositories/lw-bible-kind.repository'
import type { CustomEntityDto } from '@core/database/repositories/lw-custom-entity.repository'
import type { GraphEntityType } from '@shared/types/longwriting.types'

const logger = createLogger('BibleQuery')

export interface BibleEntryView {
  id: string
  name: string
  sub: string
  aliases?: string[]
  fields: Record<string, unknown>
  origin?: { type: string; turns?: number[]; cardId?: string } | null
}

export interface BibleGroupView {
  kindKey: string
  label: string
  icon: string | null
  storage: 'entity' | 'custom'
  fieldsSchema: BibleKindDto['fieldsSchema']
  entries: BibleEntryView[]
}

/** entity 类的名称/摘要提取（键名与内置种子一一对应） */
const ENTITY_ADAPTERS: Record<string, { nameField: string; subFields: string[] }> = {
  overview: { nameField: 'title', subFields: ['summary'] },
  character: { nameField: 'name', subFields: ['occupation', 'rolePosition'] },
  plot: { nameField: 'title', subFields: ['summary'] },
  outline: { nameField: 'name', subFields: ['nodeType'] },
  faction: { nameField: 'name', subFields: ['description'] },
  skill: { nameField: 'name', subFields: ['type'] },
  item: { nameField: 'name', subFields: ['type'] },
  location: { nameField: 'name', subFields: ['description'] },
}

/**
 * 内置实体类分类的默认字段 schema（实跑修复 09-15）：
 * overview/plot/outline/faction/skill/item/location 的 fields_schema 在种子里为空，
 * 设定集详情按 schema 渲染字段——空 schema 导致详情一行不出、回退到 24 字截断 sub
 * （用户看到"故事概要只有十几个字"）。详情兜底用：按实体类型给默认字段集。
 */
const DEFAULT_ENTITY_SCHEMAS: Record<string, Array<{ key: string; label: string; type: string }>> = {
  overview: [
    { key: 'title', label: '故事标题', type: 'text' },
    { key: 'summary', label: '故事概要', type: 'textarea' },
    { key: 'coreConflict', label: '核心冲突', type: 'textarea' },
    { key: 'coreIdea', label: '核心构想', type: 'textarea' },
    { key: 'estimatedChapters', label: '预估章节数', type: 'number' },
  ],
  plot: [
    { key: 'title', label: '故事线名称', type: 'text' },
    { key: 'summary', label: '故事线概要', type: 'textarea' },
  ],
  outline: [
    { key: 'name', label: '章节名', type: 'text' },
    { key: 'summary', label: '章节概要', type: 'textarea' },
  ],
  faction: [
    { key: 'name', label: '名称', type: 'text' },
    { key: 'description', label: '描述', type: 'textarea' },
  ],
  skill: [
    { key: 'name', label: '名称', type: 'text' },
    { key: 'type', label: '类型', type: 'text' },
    { key: 'description', label: '描述', type: 'textarea' },
  ],
  item: [
    { key: 'name', label: '名称', type: 'text' },
    { key: 'type', label: '类型', type: 'text' },
    { key: 'description', label: '描述', type: 'textarea' },
  ],
  location: [
    { key: 'name', label: '名称', type: 'text' },
    { key: 'type', label: '类型', type: 'text' },
    { key: 'description', label: '描述', type: 'textarea' },
  ],
}

const outlineSub = (t: unknown) => (t === 'volume' ? '卷' : t === 'chapter' ? '章' : t === 'section' ? '节' : '')

export class BibleQueryService {
  private static instance: BibleQueryService | null = null

  static getInstance(db?: any): BibleQueryService {
    if (!BibleQueryService.instance) {
      BibleQueryService.instance = new BibleQueryService(db)
    }
    return BibleQueryService.instance
  }

  constructor(private db?: any) {}

  private manager(): any {
    return this.db ?? getCoreDatabaseManager()
  }

  async listKinds(): Promise<BibleKindDto[]> {
    return (await this.manager().lwBibleKinds?.getEnabled()) || []
  }

  /** 分类化条目列表（设定集/资产面板主数据源）；roomCards 供分集卡合成（评审 A9） */
  async list(projectId: string, opts?: { roomCards?: Array<Record<string, any>> }): Promise<BibleGroupView[]> {
    const m = this.manager()
    const kinds = await this.listKinds()
    const groups: BibleGroupView[] = []

    for (const kind of kinds) {
      if (kind.storage === 'custom') {
        const rows = (await m.lwCustomEntities?.getByProjectAndKind(projectId, kind.key)) || []
        // 层级：父前子后 + 缩进副标题（P2）
        const byId = new Map(rows.map((r: CustomEntityDto) => [r.id, r]))
        const ordered: Array<CustomEntityDto & { _depth?: number }> = []
        const pushTree = (list: CustomEntityDto[], depth: number) => {
          for (const r of list) {
            ordered.push({ ...r, _depth: depth })
            pushTree(rows.filter((x: CustomEntityDto) => x.parentId === r.id), depth + 1)
          }
        }
        pushTree(rows.filter((r: CustomEntityDto) => !r.parentId || !byId.has(r.parentId)), 0)
        groups.push({
          kindKey: kind.key,
          label: kind.label,
          icon: kind.icon,
          storage: 'custom',
          fieldsSchema: kind.fieldsSchema,
          entries: ordered.map((r) => ({
            id: r.id,
            name: r.name,
            sub: (r._depth && r._depth > 0 ? `${'　'.repeat(r._depth)}└ ` : '') + this.firstStr(r.fields, kind),
            fields: r.fields || {},
            origin: r.origin ?? undefined,
          })),
        })
        continue
      }

      // entity 路由
      const repo = kind.entityRepo ? m[kind.entityRepo] : null
      if (!repo?.getByProjectId && !repo?.getTreeByProjectId) {
        groups.push({ kindKey: kind.key, label: kind.label, icon: kind.icon, storage: 'entity', fieldsSchema: kind.fieldsSchema, entries: [] })
        continue
      }
      const adapter = ENTITY_ADAPTERS[kind.key] || { nameField: 'name', subFields: [] }
      let rows: Array<Record<string, any>> = []
      try {
        const raw = kind.key === 'outline'
          ? await repo.getTreeByProjectId(projectId)
          : await repo.getByProjectId(projectId)
        // 归一化：概要仓储等返回单行对象而非数组（真机踩坑：rows is not iterable）
        rows = Array.isArray(raw) ? raw : raw ? [raw] : []
      } catch (e) {
        logger.warn(`[bible] ${kind.key} 读取失败（降级为空组）`, e)
      }
      const entries: BibleEntryView[] = []
      for (const row of rows) {
        const name = String(row[adapter.nameField] || '').trim()
        if (!name) continue
        if (kind.key === 'overview' && entries.length > 0) continue // 概要单行：只取第一行
        const subParts = adapter.subFields
          .map((f) => (kind.key === 'outline' ? outlineSub(row[f]) : String(row[f] || '').trim()))
          .filter(Boolean)
        entries.push({
          id: String(row.id),
          name,
          sub: subParts.join(' · ').slice(0, 24),
          aliases: Array.isArray(row.aliases) ? row.aliases : undefined,
          fields: row,
          origin: undefined,
        })
      }
      groups.push({ kindKey: kind.key, label: kind.label, icon: kind.icon, storage: 'entity', fieldsSchema: kind.fieldsSchema, entries })
    }

    // script 目标：已定稿分集卡合成进「大纲」组（评审 A9——采纳了就要可见）
    const adoptedEpisodes = (opts?.roomCards || []).filter(
      (c: any) => c.kind === 'outline' && c.status === 'adopted' && c.data?.index,
    )
    if (adoptedEpisodes.length > 0) {
      const outlineGroup = groups.find((g) => g.kindKey === 'outline')
      if (outlineGroup) {
        for (const c of adoptedEpisodes) {
          const d = c.data as Record<string, any>
          outlineGroup.entries.push({
            id: c.id,
            name: `第${d.index}集 ${d.title || ''}`.trim(),
            sub: `钩子：${String(d.hook || '').slice(0, 16)}`,
            fields: d,
            origin: { type: 'discussion', turns: c.sourceTurns },
          })
        }
      }
    }

    // 伏笔合成组（P1：lw_foreshadows；非自定义实体，走独立端点操作）
    try {
      const fbs = (await m.lwForeshadows?.getByProjectId(projectId)) || []
      groups.push({
        kindKey: 'foreshadow',
        label: '伏笔',
        icon: '🪝',
        storage: 'entity',
        fieldsSchema: null,
        entries: fbs.map((f: any) => ({
          id: f.id,
          name: String(f.content || '').slice(0, 24),
          sub: this.foreshadowSub(f),
          fields: f,
          origin: f.origin ?? undefined,
        })),
      })
    } catch (e) {
      logger.warn('[bible] 伏笔读取失败（降级为空组）', e)
    }
    return groups
  }

  private foreshadowSub(f: { status: string; plantedChapter: number | null; payoffChapter: number | null }): string {
    const st = f.status === 'paid' ? `第${f.payoffChapter ?? '?'}章已收` : f.status === 'dropped' ? '已弃' : '未收'
    return `第${f.plantedChapter ?? '?'}章埋 · ${st}`
  }

  /** 伏笔操作（P1） */
  async createForeshadow(projectId: string, content: string, plantedChapter: number | null, origin?: { type: string; turns?: number[]; cardId?: string }) {
    return this.manager().lwForeshadows.createRow(projectId, content, plantedChapter, origin)
  }

  async setForeshadowStatus(id: string, status: 'open' | 'paid' | 'dropped', payoffChapter?: number | null) {
    return this.manager().lwForeshadows.setStatus(id, status, payoffChapter)
  }

  /**
   * 演进时间线（P1：progression）——实体按章节排序的状态/事件/关系变化。
   * 数据源：lw_entity_state_snapshots + lw_events（involved_entities 命中）+ lw_graph_edges（起讫章）。
   */
  async progression(projectId: string, kindKey: string, id: string): Promise<{
    states: Array<{ chapter: number; summary: string; keyChanges: string | null }>
    events: Array<{ chapter: number; name: string; description: string | null; storyTime: string | null }>
    relations: Array<{ other: string; type: string; from: number | null; until: number | null }>
  }> {
    const m = this.manager()
    // bible kindKey → 图谱 entityType（plot/outline/overview/custom 无演进语义）
    const GRAPH_TYPE: Record<string, string> = { character: 'character', location: 'location', item: 'item', faction: 'faction', skill: 'skill' }
    const entityType = GRAPH_TYPE[kindKey]
    const out = { states: [] as { chapter: number; summary: string; keyChanges: string | null }[], events: [] as { chapter: number; name: string; description: string | null; storyTime: string | null }[], relations: [] as { other: string; type: string; from: number | null; until: number | null }[] }
    if (!entityType) return out

    try {
      const snapshots = (await m.lwEntityStates?.getByProjectId(projectId)) || []
      out.states = snapshots
        .filter((s: any) => s.entityType === entityType && String(s.entityId) === String(id))
        .map((s: any) => ({ chapter: s.chapterNumber, summary: String(s.stateSummary || ''), keyChanges: s.keyChanges ?? null }))
        .sort((a: any, b: any) => a.chapter - b.chapter)
    } catch (e) {
      logger.warn('[bible] 演进状态读取失败', e)
    }
    try {
      const events = (await m.lwEvents?.getByProjectId(projectId)) || []
      out.events = events
        .filter((ev: any) => {
          const involved = typeof ev.involvedEntities === 'string' ? JSON.parse(ev.involvedEntities || '[]') : ev.involvedEntities || []
          return Array.isArray(involved) && involved.some((x: any) => String(x?.id) === id)
        })
        .map((ev: any) => ({ chapter: ev.chapterNumber, name: String(ev.name || ''), description: ev.description ?? null, storyTime: ev.storyTime ?? null }))
        .sort((a: any, b: any) => a.chapter - b.chapter)
    } catch (e) {
      logger.warn('[bible] 演进事件读取失败', e)
    }
    try {
      const edges = (await m.lwGraphEdges?.getByEntity(projectId, entityType as never, id)) || []
      out.relations = edges.map((e: any) => ({
        other: String(e.targetName || e.target || ''),
        type: String(e.relationType || e.label || '关联'),
        from: e.validFromChapter ?? null,
        until: e.validUntilChapter ?? null,
      }))
    } catch (e) {
      logger.warn('[bible] 演进关系读取失败', e)
    }
    return out
  }

  private firstStr(fields: Record<string, unknown> | null, kind: BibleKindDto): string {
    if (!fields) return ''
    const schema = kind.fieldsSchema || []
    for (const f of schema) {
      if (f.key === 'name') continue
      const v = fields[f.key]
      if (typeof v === 'string' && v.trim()) return v.slice(0, 24)
    }
    return ''
  }

  /** 单实体详情：全字段 + 关系（P1 加 progression） */
  async detail(projectId: string, kindKey: string, id: string): Promise<{
    kind: BibleKindDto
    fields: Record<string, unknown>
    relations: Array<{ targetName?: string; target?: string; relationType?: string; description?: string; validFromChapter?: number | null }>
  } | null> {
    const m = this.manager()
    const kinds = await this.listKinds()
    const kind = kinds.find((k) => k.key === kindKey)
    if (!kind) return null

    let fields: Record<string, unknown> | null = null
    if (kind.storage === 'custom') {
      const rows = (await m.lwCustomEntities?.getByProjectAndKind(projectId, kindKey)) || []
      fields = rows.find((r: CustomEntityDto) => r.id === id)?.fields || {}
    } else {
      const repo = kind.entityRepo ? m[kind.entityRepo] : null
      if (kindKey === 'overview') {
        // 实跑修复：getByProjectId 返回数组——概要详情此前把整个数组当 fields，
        // summary 等键全部取空，前端回退到 24 字列表摘要（用户看到"概要只有十几个字"）
        const rows = (await repo?.getByProjectId(projectId)) || []
        const first = Array.isArray(rows) ? rows[0] : (rows as unknown)
        fields = (first as Record<string, unknown>) || {}
      } else if (repo?.getById) {
        fields = (await repo.getById(id)) || {}
      }
    }
    // 空 schema 兜底（实跑修复）：内置实体类分类（overview/plot/outline/faction/skill/item/location）
    // 的 fields_schema 为空，前端按 schema 渲染详情会一行不出、回退到截断 sub
    let effKind = kind
    if (!kind.fieldsSchema || (Array.isArray(kind.fieldsSchema) && kind.fieldsSchema.length === 0)) {
      const fallback = DEFAULT_ENTITY_SCHEMAS[kindKey]
      if (fallback) effKind = { ...kind, fieldsSchema: fallback }
    }

    // 关系边（数据在 lw_graph_edges——P0 只做读取小节）
    let relations: Array<Record<string, unknown>> = []
    try {
      const graph = m.lwGraphEdges
      // 详情入口的 kindKey 超集于图谱类型（还有 plot/outline/custom 等），收窄后再查
      const GRAPH_TYPES: GraphEntityType[] = ['character', 'location', 'item', 'faction', 'skill']
      const entityType = GRAPH_TYPES.includes(kindKey as GraphEntityType) ? (kindKey as GraphEntityType) : null
      if (entityType && graph?.getByEntity) {
        relations = (await graph.getByEntity(projectId, entityType, id)) || []
      } else if (entityType && graph?.findByEntity) {
        relations = (await graph.findByEntity(projectId, entityType, id)) || []
      }
    } catch (e) {
      logger.warn('[bible] 关系读取失败（降级为空）', e)
    }

    return { kind: effKind, fields: fields || {}, relations: relations as never }
  }

  customCreate(projectId: string, kindKey: string, name: string, fields: Record<string, unknown> | null, origin?: CustomEntityDto['origin'], parentId?: string | null) {
    return this.manager().lwCustomEntities.createRow(projectId, kindKey, name, fields, origin, parentId)
  }

  customUpdate(projectId: string, id: string, patch: { name?: string; fields?: Record<string, unknown> | null }) {
    void projectId
    return this.manager().lwCustomEntities.updateRow(id, patch)
  }

  customDelete(id: string) {
    return this.manager().lwCustomEntities.deleteRow(id)
  }
}
