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
import { scanNameCandidates } from './consistency.service'
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

const UNREGISTERED_CHARACTER_KIND = '未登记人物'

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
  /** 52 号：解析失败/名册外的人名（已入「未登记人物」待确认队列，R9 数据源） */
  unresolvedNames?: Array<{ name: string; chapterNumber: number }>
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
        // 52 号复测补链：先做全文级人名扫描，名册外高频名自动入「未登记人物」队列
        try {
          const roster = ((await m.lwCharacters?.getByProjectId(projectId)) || []).map((c: any) => c.name)
          const graphSvc = new GraphService(m)
          for (const cand of scanNameCandidates([{ name: `第${chapterNumber}章`, content: chapterContent }], roster, 2)) {
            await this.registerUnresolvedName(projectId, chapterNumber, cand.name)
            void graphSvc
          }
        } catch (e) {
          console.warn('[ChapterGraphProcessor] 全文人名扫描入队失败（不阻断）:', e)
        }
        // 名称 → ID 解析（事件涉及实体必须 ID）
        const resolvedEvents: Array<{ name: string; description?: string; involvedEntities?: MemoryEntity[]; stateBefore?: string; stateAfter?: string }> = []
        for (const ev of extracted) {
          if (!ev.name?.trim()) continue
          // 52 号：解析失败的实体不再静默跳过——收集进「未登记人物」队列（R9 数据源）
          const { resolved: involved, unresolved: evUnresolved } = await this.resolveEventEntities(projectId, ev.involvedEntities || [])
          for (const u of evUnresolved) {
            if (u.type === 'character') await this.registerUnresolvedName(projectId, chapterNumber, u.name)
          }
          // 复测补链：模型漏挂实体的事件，按句子共现补挂（正文同句出现的人名）
          if (involved.length === 0) {
            involved = await this.linkEventByCoOccurrence(projectId, chapterNumber, ev, chapterContent)
          }
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
        // 52 号评审根因三修复：AI 只可靠地回传 entityName，ID 由服务端按名册解析
        // （旧实现要求 AI 回传 entityId，解析不出即被整条过滤 → 状态切片长期为 0 行，R1-R6 全盲）
        const graph = new GraphService(m)
        const validStates: Array<{ entityType: string; entityId: string; entityName: string; stateSummary: string; keyChanges: string[] }> = []
        for (const st of extractedStates) {
          if (!st.entityType || !st.stateSummary?.trim()) continue
          const name = (st.entityName || '').trim()
          if (!name && !st.entityId) continue
          let entityId = st.entityId || ''
          if (name) {
            const [hit] = await graph.resolveEntities(projectId, [{ type: st.entityType, name }] as any)
            if (hit?.resolved && hit.id) entityId = hit.id
            else if (st.entityType === 'character') await this.registerUnresolvedName(projectId, chapterNumber, name)
          }
          if (!entityId) continue
          validStates.push({
            entityType: st.entityType,
            entityId,
            entityName: name || st.entityId,
            stateSummary: st.stateSummary.trim(),
            keyChanges: Array.isArray(st.keyChanges) ? st.keyChanges : [],
          })
        }
        if (validStates.length === 0 && extractedStates.length > 0) {
          console.warn(`[ChapterGraphProcessor] 状态切片全部未能解析（${extractedStates.length} 条）chapter=${chapterNumber}`)
        }
        if (validStates.length > 0) {
          states.push(...await m.lwEntityStates.batchCreate(
            validStates.map(s => ({
              projectId,
              entityType: s.entityType as any,
              entityId: s.entityId,
              entityName: s.entityName,
              chapterNumber,
              stateSummary: s.stateSummary,
              keyChanges: s.keyChanges,
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

  /** 事件涉及实体名称 → ID 解析（52 号：失败不再静默跳过，返回 unresolved 供登记/告警） */
  private async resolveEventEntities(
    projectId: string,
    entities: MemoryEntity[],
  ): Promise<{ resolved: MemoryEntity[]; unresolved: Array<{ type: string; name: string }> }> {
    const m = this.manager()
    if (!m || entities.length === 0) return { resolved: [], unresolved: [] }
    const graph = new GraphService(m)
    const inputs = entities.map(e => ({ type: e.type, name: e.name }))
    const resolved = await graph.resolveEntities(projectId, inputs as any)
    const result: MemoryEntity[] = []
    const unresolved: Array<{ type: string; name: string }> = []
    resolved.forEach((r, i) => {
      if (r.resolved && r.id) {
        result.push({ type: entities[i].type, id: r.id, name: entities[i].name })
      } else {
        unresolved.push({ type: entities[i].type, name: entities[i].name })
      }
    })
    return { resolved: result, unresolved }
  }

  /**
   * 52 号复测补链：事件没有涉及实体时，在正文中定位事件所在句子，
   * 把同句出现的具名人物解析后挂到事件上（模型漏标的最小代价补救）。
   */
  private async linkEventByCoOccurrence(
    projectId: string,
    chapterNumber: number,
    ev: { name?: string; description?: string },
    chapterContent: string,
  ): Promise<MemoryEntity[]> {
    try {
      const key = (ev.name || '').replace(/[「」『』【】\s]/g, '').slice(0, 4)
      if (!key) return []
      const sentences = chapterContent.split(/[。！？\n]/).filter(s => s.includes(key) || (ev.description && s.includes((ev.description || '').slice(0, 6))))
      const scope = sentences.length > 0 ? sentences.join('。') : ''
      if (!scope) return []
      const graph = new GraphService(this.manager()!)
      const seen = new Set<string>()
      const entities: MemoryEntity[] = []
      // 只认「姓氏开头」的 2-3 字词并滤掉常用词，避免把普通词汇灌进待确认队列
      const stop = new Set(['自己', '他们', '我们', '你们', '什么', '怎么', '这时', '当时', '如今', '所有', '没有', '这个', '那个', '不是', '就是'])
      for (const m of scope.matchAll(new RegExp(`[${'王李张刘陈杨赵黄周吴徐孙马朱胡郭何高林郑谢罗宋唐许韩冯邓曹彭曾肖田董袁潘于蒋蔡余杜叶程苏魏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏韦付方白邹孟熊秦邱江尹薛闫段雷侯龙史陶黎贺顾毛郝龚邵万钱严覃武戴莫孔向汤'}][\\u4e00-\\u9fa5]{1,2}`, 'g'))) {
        const w = m[0]
        if (seen.has(w) || stop.has(w)) continue
        seen.add(w)
        const [r] = await graph.resolveEntities(projectId, [{ type: 'character', name: w }] as any)
        if (r?.resolved && r.id) entities.push({ type: 'character', id: r.id, name: w })
        else await this.registerUnresolvedName(projectId, chapterNumber, w)
      }
      return entities.slice(0, 6)
    } catch (e) {
      console.warn('[ChapterGraphProcessor] 事件共现补链失败（不阻断）:', e)
      return []
    }
  }

  /**
   * 52 号：未登记人名入「待确认」队列（lw_custom_entities，kindKey=未登记人物）。
   * 按名字去重；首见记录章节。这是 R9 一致性规则的数据源，也让新角色在设定集可见、可一键转正。
   */
  private async registerUnresolvedName(projectId: string, chapterNumber: number, name: string): Promise<void> {
    try {
      const m = this.manager()
      const trimmed = name.trim()
      if (!m?.lwCustomEntities || !trimmed) return
      const existing = await m.lwCustomEntities.getByProjectAndKind(projectId, UNREGISTERED_CHARACTER_KIND)
      const dup = existing.find(e => e.name === trimmed)
      if (dup) return
      await m.lwCustomEntities.createRow(
        projectId,
        UNREGISTERED_CHARACTER_KIND,
        trimmed,
        { firstChapter: chapterNumber },
        { type: 'extract', chapter: chapterNumber },
      )
    } catch (e) {
      console.warn('[ChapterGraphProcessor] 未登记人名入队失败（不阻断）:', e)
    }
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
