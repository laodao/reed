/**
 * 长文写作图谱服务（阶段 2）
 * @module core/platform/services/longwriting/graph/graph.service
 *
 * 图谱 = 节点（人物/地点/物品/势力/技能/事件，union 现有实体表 + lw_events）
 *       + 边（lw_graph_edges，带 valid_from/valid_until_chapter 时间线）
 *       + 状态切片（lw_entity_state_snapshots，按章节演进）
 *
 * 查询原语（时间线一致性闭环的基础）：
 * - stateAt(entityType, entityId, chapterNumber)：实体在指定章节的权威状态（<=N 最新切片）
 * - edgesAt(entityId, chapterNumber)：该时间点生效的关系边
 * - getTimeline(entityType, entityId)：实体状态随章节演进的完整序列
 * - resolveEntities：名称 → ID（现有前端多处存名称，图谱边必须 ID）
 */

import { getCoreDatabaseManager, type ICoreDatabaseManager } from '@core/database/database-manager.interface'
import type {
  GraphEntityType,
  GraphEdge,
  StoryEvent,
  CreateGraphEdgeRequest,
  UpdateGraphEdgeRequest,
  ResolveEntityInput,
  ResolvedEntity,
  EntityTimelineEntry,
} from '@shared/types/longwriting.types'

export interface GraphNode {
  id: string
  type: GraphEntityType
  name: string
  /** 描述/摘要（实体详情的第一段，供图谱展示） */
  description?: string
  /** 事件节点的发生章节（时间轴按章节过滤节点用） */
  chapterNumber?: number
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface NodeInfo extends GraphNode {
  /** 最新状态切片（若存在） */
  latestState?: { chapterNumber: number; stateSummary: string; keyChanges: string[] }
  /** 关联事件（按章节倒序） */
  events?: StoryEvent[]
}

export class GraphService {
  private static instance: GraphService | null = null

  private readonly db: ICoreDatabaseManager | null

  /** 测试/依赖注入用：传入 fake dbManager；默认取全局 */
  constructor(db?: ICoreDatabaseManager | null) {
    this.db = db ?? null
  }

  static getInstance(): GraphService {
    if (!GraphService.instance) {
      GraphService.instance = new GraphService()
    }
    return GraphService.instance
  }

  static resetInstance(): void {
    GraphService.instance = null
  }

  private manager(): ICoreDatabaseManager | null {
    return this.db ?? getCoreDatabaseManager()
  }

  // ==================== 节点 ====================

  /**
   * 取单个节点（实体详情）。entityType 决定查哪张表。
   */
  async getNode(projectId: string, entityType: GraphEntityType, entityId: string): Promise<NodeInfo | null> {
    const m = this.manager()
    if (!m) return null
    const base = await this.fetchNodeBase(projectId, entityType, entityId)
    if (!base) return null

    const latestState = await m.lwEntityStates?.getLatestEntityState(
      projectId,
      entityType as any,
      entityId,
    )

    const events = (await m.lwEvents?.getByProjectId(projectId)) || []
    const relatedEvents = events
      .filter(e => this.eventInvolves(e, entityType, entityId))
      .sort((a, b) => b.chapterNumber - a.chapterNumber)

    return {
      ...base,
      latestState: latestState
        ? {
            chapterNumber: latestState.chapterNumber,
            stateSummary: latestState.stateSummary,
            keyChanges: latestState.keyChanges || [],
          }
        : undefined,
      events: relatedEvents,
    }
  }

  /**
   * 全图：节点（各实体表 union）+ 边。
   */
  async getGraph(projectId: string): Promise<GraphData> {
    const m = this.manager()
    if (!m) return { nodes: [], edges: [] }

    const [characters, locations, items, factions, skills, events, edges] = await Promise.all([
      m.lwCharacters?.getByProjectId(projectId) ?? Promise.resolve([]),
      m.lwLocations?.getByProjectId(projectId) ?? Promise.resolve([]),
      m.lwItems?.getByProjectId(projectId) ?? Promise.resolve([]),
      m.lwFactions?.getByProjectId(projectId) ?? Promise.resolve([]),
      m.lwSkills?.getByProjectId(projectId) ?? Promise.resolve([]),
      m.lwEvents?.getByProjectId(projectId) ?? Promise.resolve([]),
      m.lwGraphEdges?.getByProjectId(projectId) ?? Promise.resolve([]),
    ])

    const nodes: GraphNode[] = [
      ...characters.map(c => ({ id: c.id, type: 'character' as const, name: c.name, description: c.personality })),
      ...locations.map(l => ({ id: l.id, type: 'location' as const, name: l.name, description: l.description })),
      ...items.map(i => ({ id: i.id, type: 'item' as const, name: i.name, description: i.description })),
      ...factions.map(f => ({ id: f.id, type: 'faction' as const, name: f.name, description: f.description })),
      ...skills.map(s => ({ id: s.id, type: 'skill' as const, name: s.name, description: s.description })),
      ...events.map(e => ({ id: e.id, type: 'event' as const, name: e.name, description: e.description, chapterNumber: e.chapterNumber })),
    ]

    // 52 号统一存储：事件→实体连线直接从 involved_entities JSON 推导，
    // 不再读 lw_graph_edges 里的 involves 边副本（那个写入不可靠，导致图上大量节点悬空）
    const derivedEdges: GraphEdge[] = []
    for (const ev of events) {
      try {
        const ents = typeof ev.involvedEntities === 'string' ? JSON.parse(ev.involvedEntities) : ev.involvedEntities
        if (!Array.isArray(ents)) continue
        for (const ent of ents) {
          if (ent?.id && ent?.type) {
            derivedEdges.push({
              id: `evt-${ev.id}-${ent.id}`,
              projectId,
              sourceType: 'event' as const,
              sourceId: ev.id,
              targetType: ent.type,
              targetId: ent.id,
              relationType: 'involves',
              validFromChapter: ev.chapterNumber || 1,
            })
          }
        }
      } catch { /* JSON 解析失败跳过 */ }
    }

    // 语义关系边（人物→人物等）仍从 lw_graph_edges 读
    const semanticEdges = edges.filter(e => e.relationType !== 'involves')

    return { nodes, edges: [...derivedEdges, ...semanticEdges] }
  }

  // ==================== 名称 → ID 解析 ====================

  /**
   * 名称 → 实体 ID 解析（建边前必须调用）。
   * 按 projectId 内实体名精确匹配；匹配失败 resolved=false（unresolved，调用方跳过建边并提示）。
   */
  async resolveEntities(projectId: string, inputs: ResolveEntityInput[]): Promise<ResolvedEntity[]> {
    const m = this.manager()
    if (!m) return inputs.map(i => ({ type: i.type, name: i.name, resolved: false }))
    const results: ResolvedEntity[] = []
    for (const input of inputs) {
      const hit = await this.findByName(projectId, input.type, input.name)
      results.push(hit
        ? { type: input.type, name: hit.name, id: hit.id, resolved: true, matchedBy: hit.matchedBy }
        : { type: input.type, name: input.name, resolved: false })
    }
    return results
  }

  // ==================== 状态切片（时间线原语） ====================

  /** 实体在指定章节的权威状态（<=N 最新切片；封装 getEntityStateAtChapter） */
  async stateAt(
    projectId: string,
    entityType: GraphEntityType,
    entityId: string,
    chapterNumber: number,
  ): Promise<{ chapterNumber: number; stateSummary: string; keyChanges: string[] } | null> {
    const m = this.manager()
    if (!m?.lwEntityStates) return null
    const s = await m.lwEntityStates.getEntityStateAtChapter(
      projectId,
      entityType as any,
      entityId,
      chapterNumber,
    )
    return s
      ? { chapterNumber: s.chapterNumber, stateSummary: s.stateSummary, keyChanges: s.keyChanges || [] }
      : null
  }

  /**
   * 实体状态时间线（完整切片序列，按章节升序）。
   * 需要 projectId（多租户 scoped 查询），由调用方传入。
   */
  async getTimeline(projectId: string, entityType: GraphEntityType, entityId: string): Promise<EntityTimelineEntry[]> {
    const m = this.manager()
    if (!m?.lwEntityStates) return []
    const all = await m.lwEntityStates.getByProjectId(projectId)
    return all
      .filter(s => s.entityType === entityType && s.entityId === entityId)
      .sort((a, b) => a.chapterNumber - b.chapterNumber)
      .map(s => ({
        chapterNumber: s.chapterNumber,
        stateSummary: s.stateSummary,
        keyChanges: s.keyChanges || [],
        createdAt: s.createdAt,
      }))
  }

  // ==================== 边（关系） ====================

  /** 某实体在指定章节"生效"的边（封装 getActiveEdgesAtChapter） */
  async edgesAt(projectId: string, entityId: string, chapterNumber: number): Promise<GraphEdge[]> {
    const m = this.manager()
    if (!m?.lwGraphEdges) return []
    return m.lwGraphEdges.getActiveEdgesAtChapter(projectId, entityId, chapterNumber)
  }

  /** 某实体的全部关系（含已失效；可带章节过滤生效） */
  async getRelations(projectId: string, entityType: GraphEntityType, entityId: string, chapterNumber?: number): Promise<GraphEdge[]> {
    const m = this.manager()
    if (!m?.lwGraphEdges) return []
    const all = await m.lwGraphEdges.getByEntity(projectId, entityType, entityId)
    if (chapterNumber === undefined) return all
    return all.filter(e =>
      (e.validFromChapter === undefined || e.validFromChapter <= chapterNumber) &&
      (e.validUntilChapter === undefined || e.validUntilChapter >= chapterNumber),
    )
  }

  async addEdge(input: CreateGraphEdgeRequest): Promise<GraphEdge | null> {
    const m = this.manager()
    if (!m?.lwGraphEdges) return null
    return m.lwGraphEdges.create(input)
  }

  async updateEdge(id: string, patch: UpdateGraphEdgeRequest): Promise<GraphEdge | null> {
    const m = this.manager()
    if (!m?.lwGraphEdges) return null
    return m.lwGraphEdges.update(id, patch)
  }

  async deleteEdge(id: string): Promise<boolean> {
    const m = this.manager()
    if (!m?.lwGraphEdges) return false
    return m.lwGraphEdges.delete(id)
  }

  /** 关停关系（离婚/决裂等：写 valid_until_chapter，旧边不删） */
  async endRelation(id: string, chapterNumber: number): Promise<GraphEdge | null> {
    const m = this.manager()
    if (!m?.lwGraphEdges) return null
    return m.lwGraphEdges.endRelation(id, chapterNumber)
  }

  /**
   * 关系网络落库（图谱关系构建）：AI 关系提案 → 名称解析 → 幂等写入 lw_graph_edges。
   * - 名称解析失败（实体不存在）跳过
   * - 自环跳过
   * - 同 source+target+relation 的**仍生效**边已存在则跳过（幂等；已关停的旧边不阻塞
   *   同名新关系——离婚后再婚/决裂后和解是合法演变）
   * - opts.validFromChapter：关系起始章（缺省 1）；opts.origin：来源溯源（章节提取管线重跑幂等）
   */
  async syncEntityRelations(
    projectId: string,
    relations: Array<{
      sourceType: GraphEntityType
      sourceName: string
      targetType: GraphEntityType
      targetName: string
      relationType: string
      description?: string
    }>,
    opts?: { validFromChapter?: number; origin?: { type: 'extract' | 'discussion' | 'manual'; chapter?: number } },
  ): Promise<{ created: number; skipped: number; edges: GraphEdge[] }> {
    const m = this.manager()
    if (!m?.lwGraphEdges || relations.length === 0) {
      return { created: 0, skipped: relations.length, edges: [] }
    }

    // 名称 → ID（分批解析源/目标）
    const sources = await this.resolveEntities(
      projectId,
      relations.map(r => ({ type: r.sourceType, name: r.sourceName })),
    )
    const targets = await this.resolveEntities(
      projectId,
      relations.map(r => ({ type: r.targetType, name: r.targetName })),
    )

    // 幂等去重键只看**仍生效**的边（validUntil 空）——已关停边不阻塞同名新关系
    const existing = await m.lwGraphEdges.getByProjectId(projectId)
    const keySet = new Set(
      existing
        .filter(e => e.validUntilChapter === undefined || e.validUntilChapter === null)
        .map(e => `${e.sourceType}:${e.sourceId}|${e.targetType}:${e.targetId}|${e.relationType}`),
    )

    let skipped = 0
    const toCreate: Array<{
      projectId: string
      sourceType: GraphEntityType
      sourceId: string
      targetType: GraphEntityType
      targetId: string
      relationType: string
      label?: string
      description?: string
      validFromChapter: number
      origin?: { type: 'extract' | 'discussion' | 'manual'; chapter?: number }
    }> = []

    for (let i = 0; i < relations.length; i++) {
      const r = relations[i]
      const s = sources[i]
      const t = targets[i]
      if (!s?.resolved || !s.id || !t?.resolved || !t.id) {
        skipped++
        continue
      }
      if (s.id === t.id) {
        skipped++
        continue
      }
      const key = `${s.type}:${s.id}|${t.type}:${t.id}|${r.relationType}`
      if (keySet.has(key)) {
        skipped++
        continue
      }
      keySet.add(key)
      toCreate.push({
        projectId,
        sourceType: s.type,
        sourceId: s.id,
        targetType: t.type,
        targetId: t.id,
        relationType: r.relationType,
        label: r.relationType,
        description: r.description,
        validFromChapter: opts?.validFromChapter ?? 1,
        origin: opts?.origin,
      })
    }

    if (toCreate.length === 0) {
      return { created: 0, skipped, edges: [] }
    }
    const edges = await m.lwGraphEdges.batchCreate(toCreate)
    return { created: edges.length, skipped, edges }
  }

  /**
   * 应用章节关系演变（结婚/决裂/反目/结盟等）：关旧开新。
   * - 'ended'：同对实体同 relationType 的仍生效边写 valid_until=chapter
   * - 'new'：直接建新边（valid_from=chapter，origin 溯源）
   * - 'changed'：先关停旧 relationType 的生效边，再建 newRelationType 新边
   * - 名称解析失败的对跳过（计入 unresolved）
   * 幂等由调用方保证：重跑前先 deleteByOriginChapter 清掉本章提取边。
   */
  async applyRelationChanges(
    projectId: string,
    changes: Array<{
      changeType: 'new' | 'ended' | 'changed'
      sourceType?: GraphEntityType
      sourceName: string
      targetType?: GraphEntityType
      targetName: string
      relationType: string
      newRelationType?: string
      description?: string
    }>,
    chapter: number,
  ): Promise<{ ended: number; created: number; unresolved: number }> {
    const m = this.manager()
    if (!m?.lwGraphEdges || changes.length === 0) {
      return { ended: 0, created: 0, unresolved: changes.length }
    }

    const sources = await this.resolveEntities(
      projectId,
      changes.map(c => ({ type: c.sourceType ?? 'character', name: c.sourceName })),
    )
    const targets = await this.resolveEntities(
      projectId,
      changes.map(c => ({ type: c.targetType ?? 'character', name: c.targetName })),
    )

    let ended = 0
    let created = 0
    let unresolved = 0

    for (let i = 0; i < changes.length; i++) {
      const c = changes[i]
      const s = sources[i]
      const t = targets[i]
      if (!s?.resolved || !s.id || !t?.resolved || !t.id || s.id === t.id) {
        unresolved++
        continue
      }
      // 找该对实体间 c.relationType 的仍生效边（双向匹配：关系提名可能任意方向）
      const active = (await m.lwGraphEdges.getByProjectId(projectId)).filter(
        e =>
          e.validUntilChapter === undefined &&
          ((e.sourceType === s.type && e.sourceId === s.id && e.targetType === t.type && e.targetId === t.id) ||
            (e.sourceType === t.type && e.sourceId === t.id && e.targetType === s.type && e.targetId === s.id)) &&
          (c.changeType === 'new' || e.relationType === c.relationType),
      )

      if (c.changeType === 'ended' || c.changeType === 'changed') {
        for (const e of active) {
          await m.lwGraphEdges.endRelation(e.id, chapter)
          ended++
        }
      }
      const newType = c.changeType === 'changed' ? c.newRelationType ?? c.relationType : c.relationType
      if (c.changeType === 'new' || c.changeType === 'changed') {
        const edge = await m.lwGraphEdges.create({
          projectId,
          sourceType: s.type,
          sourceId: s.id,
          targetType: t.type,
          targetId: t.id,
          relationType: newType,
          label: newType,
          description: c.description,
          validFromChapter: chapter,
          origin: { type: 'extract', chapter },
        })
        if (edge) created++
      }
    }
    return { ended, created, unresolved }
  }

  // ==================== 内部工具 ====================

  private async fetchNodeBase(
    projectId: string,
    entityType: GraphEntityType,
    entityId: string,
  ): Promise<GraphNode | null> {
    const m = this.manager()
    if (!m) return null
    switch (entityType) {
      case 'character': {
        const c = await m.lwCharacters?.getById(entityId)
        return c ? { id: c.id, type: entityType, name: c.name, description: c.personality } : null
      }
      case 'location': {
        const l = await m.lwLocations?.getById(entityId)
        return l ? { id: l.id, type: entityType, name: l.name, description: l.description } : null
      }
      case 'item': {
        const i = await m.lwItems?.getById(entityId)
        return i ? { id: i.id, type: entityType, name: i.name, description: i.description } : null
      }
      case 'faction': {
        const f = await m.lwFactions?.getById(entityId)
        return f ? { id: f.id, type: entityType, name: f.name, description: f.description } : null
      }
      case 'skill': {
        const s = await m.lwSkills?.getById(entityId)
        return s ? { id: s.id, type: entityType, name: s.name, description: s.description } : null
      }
      case 'event': {
        const e = await m.lwEvents?.getById(entityId)
        return e ? { id: e.id, type: entityType, name: e.name, description: e.description } : null
      }
      default:
        return null
    }
  }

  /**
   * 实体名解析（52 号评审根因二修复）：精确 → 别名 → 归一化 → 唯一包含。
   * - 别名：角色 aliases 字段；
   * - 归一化：去空白/间隔号/书名号后相等；
   * - 唯一包含：双向包含且候选唯一（多候选=歧义放弃，杜绝「赵德→刘都头」式硬攀）。
   */
  private async findByName(
    projectId: string,
    entityType: GraphEntityType,
    name: string,
  ): Promise<{ id: string; name: string; matchedBy: 'exact' | 'alias' | 'normalized' | 'fuzzy' } | null> {
    const m = this.manager()
    if (!m) return null
    const target = name.trim()
    if (!target) return null
    const list = await this.listByTypeWithAliases(projectId, entityType)
    const exact = list.find(e => e.name === target)
    if (exact) return { id: exact.id, name: exact.name, matchedBy: 'exact' }
    const byAlias = list.find(e => (e.aliases ?? []).some(a => a === target))
    if (byAlias) return { id: byAlias.id, name: byAlias.name, matchedBy: 'alias' }
    const norm = (v: string) => v.replace(/[\s·・《》「」『』]/g, '')
    const nt = norm(target)
    if (!nt) return null
    const normalized = list.find(e => norm(e.name) === nt)
    if (normalized) return { id: normalized.id, name: normalized.name, matchedBy: 'normalized' }
    const contained = list.filter(e => {
      const en = norm(e.name)
      if (en.length < 2 || nt.length < 2) return false
      return en.includes(nt) || nt.includes(en)
    })
    if (contained.length === 1) return { id: contained[0].id, name: contained[0].name, matchedBy: 'fuzzy' }
    return null
  }

  private async listByTypeWithAliases(projectId: string, entityType: GraphEntityType): Promise<Array<{ id: string; name: string; aliases?: string[] }>> {
    const list = await this.listByType(projectId, entityType)
    if (entityType !== 'character') return list
    const m = this.manager()
    if (!m) return list
    const rows = ((await m.lwCharacters?.getByProjectId(projectId)) || []) as any[]
    return list.map(e => {
      const row = rows.find(r => r.id === e.id)
      return { ...e, aliases: Array.isArray(row?.aliases) ? row.aliases : undefined }
    })
  }

  private async listByType(projectId: string, entityType: GraphEntityType): Promise<Array<{ id: string; name: string }>> {
    const m = this.manager()
    if (!m) return []
    switch (entityType) {
      case 'character': return ((await m.lwCharacters?.getByProjectId(projectId)) || []).map(c => ({ id: c.id, name: c.name }))
      case 'location': return ((await m.lwLocations?.getByProjectId(projectId)) || []).map(l => ({ id: l.id, name: l.name }))
      case 'item': return ((await m.lwItems?.getByProjectId(projectId)) || []).map(i => ({ id: i.id, name: i.name }))
      case 'faction': return ((await m.lwFactions?.getByProjectId(projectId)) || []).map(f => ({ id: f.id, name: f.name }))
      case 'skill': return ((await m.lwSkills?.getByProjectId(projectId)) || []).map(s => ({ id: s.id, name: s.name }))
      case 'event': return ((await m.lwEvents?.getByProjectId(projectId)) || []).map(e => ({ id: e.id, name: e.name }))
      default: return []
    }
  }

  private eventInvolves(e: StoryEvent, entityType: GraphEntityType, entityId: string): boolean {
    return (e.involvedEntities || []).some(ent => ent.type === entityType && ent.id === entityId)
  }
}
