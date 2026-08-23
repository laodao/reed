/**
 * 长文写作图谱服务（阶段 2）
 * @module core/services/longwriting/graph/graph.service
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
      ...events.map(e => ({ id: e.id, type: 'event' as const, name: e.name, description: e.description })),
    ]
    return { nodes, edges }
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
        ? { type: input.type, name: input.name, id: hit.id, resolved: true }
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

  private async findByName(
    projectId: string,
    entityType: GraphEntityType,
    name: string,
  ): Promise<{ id: string; name: string } | null> {
    const m = this.manager()
    if (!m) return null
    const target = name.trim()
    if (!target) return null
    const list = await this.listByType(projectId, entityType)
    return list.find(e => e.name === target) ?? null
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
