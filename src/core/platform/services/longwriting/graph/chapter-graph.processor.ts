/**
 * 章节确认流水线（阶段 2）
 * @module core/platform/services/longwriting/graph/chapter-graph.processor
 *
 * 章节确认后编排：提取事件 → 落库 lw_events → 提取实体状态 → upsert 状态切片 → 自动建边 → 章节状态摘要。
 * 分步失败可重跑（每步独立提交，不阻断已确认章节）。
 */

import crypto from 'node:crypto'
import { getCoreDatabaseManager, type ICoreDatabaseManager } from '@core/database/database-manager.interface'
import { LongWritingAIService } from '@core/platform/services/longwriting-ai.service'
import { GraphService } from './graph.service'
import type {
  StoryEvent,
  EntityStateSnapshot,
  GraphEdge,
  MemoryEntity,
} from '@shared/types/longwriting.types'

export interface ChapterGraphProcessInput {
  projectId: string
  outlineId: string
  chapterContent: string
  chapterNumber: number
  providerConfigId?: string
  modelId?: string
}

export interface ChapterGraphProcessResult {
  events: StoryEvent[]
  states: EntityStateSnapshot[]
  edges: GraphEdge[]
  /** 本次新增/更新的实体状态数（供前端提示） */
  stateCount: number
  /** 本次登记的伏笔数（42 号 P1 写作教练位） */
  foreshadowCount?: number
  /** 本次关系演变条数（关旧+开新，44 号图谱完善） */
  relationChangeCount?: number
}

export class ChapterGraphProcessor {
  private readonly db: ICoreDatabaseManager | null
  private readonly ai: LongWritingAIService | null

  /**
   * 评审 #61：内容 hash 缓存——同章节同内容不重跑 3 次 AI。
   * key = projectId:chapterNumber，value = 上次成功流水线的内容 sha256。
   * 进程级缓存（重启后首跑会重新执行，数据侧幂等由清理步骤保证）。
   */
  private static readonly contentHashes = new Map<string, string>()

  /** 测试用：清空内容 hash 缓存（spec beforeEach 调用，防跨用例短路） */
  static clearContentHashCache(): void {
    ChapterGraphProcessor.contentHashes.clear()
  }

  constructor(db?: ICoreDatabaseManager | null, ai?: LongWritingAIService | null) {
    this.db = db ?? null
    this.ai = ai ?? null
  }

  private manager(): ICoreDatabaseManager | null {
    return this.db ?? getCoreDatabaseManager()
  }

  private aiService(): LongWritingAIService {
    return this.ai ?? LongWritingAIService.getInstance()
  }

  /**
   * 执行章节确认流水线。
   */
  async process(input: ChapterGraphProcessInput): Promise<ChapterGraphProcessResult> {
    const m = this.manager()
    if (!m) return { events: [], states: [], edges: [], stateCount: 0 }
    const { projectId, outlineId, chapterContent, chapterNumber, providerConfigId, modelId } = input

    // ============ 0a. 内容未变短路（评审 #61） ============
    // 每次保存章节（含自动保存）都触发流水线，但内容没改就不必重跑 3 次 AI：
    // 内容 hash 与上次成功运行一致 → 直接返回空结果（调用方按"无事发生"处理）。
    const contentKey = `${projectId}:${chapterNumber}`
    const contentHash = crypto.createHash('sha256').update(chapterContent).digest('hex')
    if (ChapterGraphProcessor.contentHashes.get(contentKey) === contentHash) {
      return { events: [], states: [], edges: [], stateCount: 0 }
    }

    // ============ 0. 幂等清理（重跑 = 重建） ============
    // 每次保存章节（含自动保存）都触发流水线；事件/边是纯 insert，旧事件 id 每次新生成，
    // 不去重会导致 lw_events / lw_graph_edges 数据膨胀、图谱视图出现重复事件节点与边。
    // 先删本章旧事件及其关联边（实体状态是 upsert 幂等，无需清理）。
    if (m.lwEvents && m.lwGraphEdges) {
      try {
        const oldEvents = await m.lwEvents.listByChapter(projectId, chapterNumber)
        const oldIds = oldEvents.map((e) => e.id).filter(Boolean)
        if (oldIds.length > 0) {
          await m.lwGraphEdges.deleteBySourceEventIds(projectId, oldIds)
        }
        await m.lwEvents.deleteByChapter(projectId, chapterNumber)
      } catch (e) {
        console.warn('[ChapterGraphProcessor] 本章旧数据清理失败（继续执行）:', e)
      }
    }

    // ============ 1. 提取事件 → 落库 lw_events ============
    const events: StoryEvent[] = []
    try {
      const resp = await this.aiService().extractChapterEvents(
        `extract-events-${Date.now()}`,
        projectId,
        outlineId,
        chapterContent,
        chapterNumber,
        providerConfigId,
        modelId,
      )
      const extracted: Array<{ name?: string; description?: string; involvedEntities?: MemoryEntity[]; stateBefore?: string; stateAfter?: string }> =
        Array.isArray(resp.data) ? resp.data : []
      if (extracted.length > 0 && m.lwEvents) {
        // 名称 → ID 解析（事件涉及实体必须 ID）
        const resolvedEvents: Array<{ name: string; description?: string; involvedEntities?: MemoryEntity[]; stateBefore?: string; stateAfter?: string }> = []
        for (const ev of extracted) {
          if (!ev.name?.trim()) continue
          const involved = await this.resolveEventEntities(projectId, ev.involvedEntities || [])
          resolvedEvents.push({
            name: ev.name.trim(),
            description: ev.description,
            involvedEntities: involved,
            stateBefore: ev.stateBefore,
            stateAfter: ev.stateAfter,
          })
        }
        events.push(...await m.lwEvents.batchCreate(
          resolvedEvents.map(e => ({
            projectId,
            name: e.name,
            description: e.description,
            chapterNumber,
            involvedEntities: e.involvedEntities,
            stateBefore: e.stateBefore,
            stateAfter: e.stateAfter,
          })),
        ))
      }
    } catch (e) {
      console.error('[ChapterGraphProcessor] 事件提取失败（不影响后续步骤）:', e)
    }

        // ============ 1.5 伏笔提取（42 号 P1 写作教练位；fail-soft，不影响主链路） ============
    let foreshadowCount = 0
    try {
      if (m.lwForeshadows) {
        await m.lwForeshadows.deleteExtractByChapter(projectId, chapterNumber)  // 重跑幂等
        const fr = await this.aiService().extractChapterForeshadows(
          `extract-foreshadows-${Date.now()}`,
          projectId,
          chapterContent,
          chapterNumber,
          providerConfigId,
          modelId,
        )
        const items: Array<{ content?: string; plantedChapter?: number | null }> = Array.isArray(fr.data) ? fr.data : []
        for (const item of items) {
          const content = String(item?.content || '').trim()
          if (!content) continue
          await m.lwForeshadows.createRow(
            projectId,
            content,
            Number.isFinite(item.plantedChapter) ? Number(item.plantedChapter) : chapterNumber,
            { type: 'extract', chapter: chapterNumber },
          )
          foreshadowCount++
        }
      }
    } catch (e) {
      console.warn('[ChapterGraphProcessor] 伏笔提取失败（不阻断主链路）:', e)
    }

// ============ 2. 提取实体状态 → upsert 状态切片 ============
    const states: EntityStateSnapshot[] = []
    try {
      const involved = await this.collectInvolvedEntities(projectId, outlineId, events)
      if (involved.length > 0 && m.lwEntityStates) {
        const resp = await this.aiService().extractEntityStates(
          `extract-states-${Date.now()}`,
          projectId,
          outlineId,
          chapterContent,
          chapterNumber,
          involved,
          providerConfigId,
          modelId,
        )
        const extractedStates: Array<{ entityType?: string; entityId?: string; entityName?: string; stateSummary?: string; keyChanges?: string[] }> =
          Array.isArray(resp.data) ? resp.data : []
        const validStates = extractedStates.filter(s => s.entityType && s.entityId && s.stateSummary)
        if (validStates.length > 0) {
          states.push(...await m.lwEntityStates.batchCreate(
            validStates.map(s => ({
              projectId,
              entityType: s.entityType! as any,
              entityId: s.entityId!,
              entityName: s.entityName || s.entityId!,
              chapterNumber,
              stateSummary: s.stateSummary!,
              keyChanges: s.keyChanges || [],
            })),
          ))
        }
      }
    } catch (e) {
      console.error('[ChapterGraphProcessor] 状态提取失败（不影响后续步骤）:', e)
    }

    // ============ 3. 自动建边 ============
    const edges: GraphEdge[] = []
    try {
      if (m.lwGraphEdges) {
        edges.push(...await this.buildEdges(projectId, chapterNumber, events, states))
      }
    } catch (e) {
      console.error('[ChapterGraphProcessor] 建边失败（不影响后续步骤）:', e)
    }

    // ============ 3.5 人物关系演变提取（44 号：结婚/决裂/反目等"关旧开新"；重跑幂等按 origin 清本章提取边） ============
    let relationChangeCount = 0
    try {
      if (m.lwGraphEdges) {
        await m.lwGraphEdges.deleteByOriginChapter(projectId, chapterNumber)
        const rc = await this.aiService().extractChapterRelationChanges(
          `extract-relchanges-${Date.now()}`,
          projectId,
          chapterContent,
          providerConfigId,
          modelId,
        )
        const items: Array<{
          changeType?: string
          sourceName?: string
          targetName?: string
          relationType?: string
          newRelationType?: string
          description?: string
        }> = Array.isArray(rc.data) ? rc.data : []
        const valid = items
          .filter(c => c?.sourceName?.trim() && c?.targetName?.trim())
          .filter(c => c.changeType === 'ended' || c.relationType?.trim() || c.newRelationType?.trim())
          .map(c => ({
            changeType: (c.changeType === 'ended' || c.changeType === 'changed' ? c.changeType : 'new') as 'new' | 'ended' | 'changed',
            sourceName: c.sourceName!.trim(),
            targetName: c.targetName!.trim(),
            relationType: (c.relationType || c.newRelationType || 'related').trim(),
            newRelationType: c.newRelationType?.trim(),
            description: c.description,
          }))
        if (valid.length > 0) {
          const r = await new GraphService(m).applyRelationChanges(projectId, valid, chapterNumber)
          relationChangeCount = r.created + r.ended
        }
      }
    } catch (e) {
      console.warn('[ChapterGraphProcessor] 关系演变提取失败（不阻断主链路）:', e)
    }

    // ============ 4. 章节状态摘要（沿用现有链路） ============
    try {
      const prev = m.lwChapterStateSummaries
        ? await m.lwChapterStateSummaries.getLatestBeforeChapter(projectId, chapterNumber)
        : null
      const resp = await this.aiService().extractChapterStateSummary(
        `extract-summary-${Date.now()}`,
        projectId,
        outlineId,
        chapterContent,
        chapterNumber,
        prev ? { storyTime: prev.storyTime, currentLocation: prev.currentLocation, characterStates: prev.characterStates, pendingEvents: prev.pendingEvents } : undefined,
        providerConfigId,
        modelId,
      )
      if (resp.success && resp.data && m.lwChapterStateSummaries) {
        await m.lwChapterStateSummaries.upsert({
          projectId,
          outlineId,
          chapterNumber,
          storyTime: resp.data.storyTime || '',
          currentLocation: resp.data.currentLocation || '',
          characterStates: resp.data.characterStates || '',
          pendingEvents: resp.data.pendingEvents || '',
          keyChanges: resp.data.keyChanges || '',
        })
      }
    } catch (e) {
      console.error('[ChapterGraphProcessor] 章节状态摘要提取失败:', e)
    }

    // 评审 #61：流水线全程成功才记 hash——中途失败的内容下次保存仍会重跑
    ChapterGraphProcessor.contentHashes.set(contentKey, contentHash)
    return {
      events,
      states,
      edges,
      stateCount: states.length,
      foreshadowCount,
      relationChangeCount,
    }
  }

  // ==================== 内部 ====================

  /** 事件涉及实体名称 → ID 解析（匹配失败跳过） */
  private async resolveEventEntities(projectId: string, entities: MemoryEntity[]): Promise<MemoryEntity[]> {
    const m = this.manager()
    if (!m || entities.length === 0) return []
    const graph = new GraphService(m)
    const inputs = entities.map(e => ({ type: e.type, name: e.name }))
    const resolved = await graph.resolveEntities(projectId, inputs as any)
    const result: MemoryEntity[] = []
    resolved.forEach((r, i) => {
      if (r.resolved && r.id) {
        result.push({ type: entities[i].type, id: r.id, name: entities[i].name })
      }
    })
    return result
  }

  /** 收集流水线涉及的实体（大纲 involved + 事件 involved），供状态提取 */
  private async collectInvolvedEntities(
    projectId: string,
    outlineId: string,
    events: StoryEvent[],
  ): Promise<Array<{ type: string; id: string; name: string }>> {
    const m = this.manager()
    if (!m) return []
    const result: Array<{ type: string; id: string; name: string }> = []
    const seen = new Set<string>()

    const outline = await m.lwOutlines?.getById(outlineId)
    if (outline) {
      const [characters, locations, items] = await Promise.all([
        m.lwCharacters?.getByProjectId(projectId) ?? Promise.resolve([]),
        m.lwLocations?.getByProjectId(projectId) ?? Promise.resolve([]),
        m.lwItems?.getByProjectId(projectId) ?? Promise.resolve([]),
      ])
      for (const id of outline.involvedCharacters || []) {
        const c = characters.find(x => x.id === id)
        if (c && !seen.has(`character:${id}`)) { seen.add(`character:${id}`); result.push({ type: 'character', id, name: c.name }) }
      }
      for (const id of outline.involvedLocations || []) {
        const l = locations.find(x => x.id === id)
        if (l && !seen.has(`location:${id}`)) { seen.add(`location:${id}`); result.push({ type: 'location', id, name: l.name }) }
      }
      for (const id of outline.involvedItems || []) {
        const i = items.find(x => x.id === id)
        if (i && !seen.has(`item:${id}`)) { seen.add(`item:${id}`); result.push({ type: 'item', id, name: i.name }) }
      }
    }

    for (const ev of events) {
      for (const ent of ev.involvedEntities || []) {
        const key = `${ent.type}:${ent.id}`
        if (!seen.has(key)) {
          seen.add(key)
          result.push({ type: ent.type, id: ent.id, name: ent.name })
        }
      }
    }
    return result
  }

  /** 自动建边：事件→实体 involves（valid_from=本章节） */
  private async buildEdges(
    projectId: string,
    chapterNumber: number,
    events: StoryEvent[],
    _states: EntityStateSnapshot[],
  ): Promise<GraphEdge[]> {
    const m = this.manager()
    if (!m?.lwGraphEdges) return []
    const edgesToCreate: Array<{ projectId: string; sourceType: any; sourceId: string; targetType: any; targetId: string; relationType: string; validFromChapter: number }> = []

    for (const ev of events) {
      for (const ent of ev.involvedEntities || []) {
        if (ent.type === 'event') continue
        edgesToCreate.push({
          projectId,
          sourceType: 'event',
          sourceId: ev.id,
          targetType: ent.type as any,
          targetId: ent.id,
          relationType: 'involves',
          validFromChapter: chapterNumber,
        })
      }
    }

    if (edgesToCreate.length === 0) return []
    return m.lwGraphEdges.batchCreate(edgesToCreate)
  }
}
