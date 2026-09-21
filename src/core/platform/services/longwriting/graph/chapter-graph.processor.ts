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
  /** 本章自动入册的新实体清单提示（0b 步骤产出；空串=无新实体） */
  newEntitiesNote?: string
  /** 步骤级结果聚合：非空 = 本轮有失败步骤（hash 不记录，下次保存重跑） */
  failedSteps?: string[]
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

    // 步骤级结果聚合：fail-soft 保留（单步失败不阻断后续），但成功信号必须真实——
    // 内容 hash 只在全部步骤成功时记录，失败步骤下次保存自动重跑。
    // （修复"失败一次永久短路"：旧实现每步都吞错，process() 结构上不可能抛错，
    //  hash 被无条件记录，与"全程成功才记 hash"的注释语义相反）
    const failedSteps: string[] = []

    // ============ 0b. 新实体检测→入册（写作台「提取状态」链路的管道化下沉） ============
    // 用户拍板（2026-09-16）：正文自由发挥的新人物/地点/物品每章自动入册——否则状态切片/
    // 关系边按名册解析 ID 解析不到，R1-R6 对圣经外实体全盲（研讨室右栏人物远少于正文的
    // 机制根因）。放在事件提取之前：新实体当章拿到 ID，事件挂实体/状态切片/关系边一遍全挂上。
    // 与写作台 autoAddEntities 同行为（重要性分级，temporary 进 minor 位，可删+purge 级联）。
    let newEntitiesNote = ''
    try {
      newEntitiesNote = await this.detectAndAddNewEntities(projectId, chapterContent)
    } catch (e: any) {
      console.warn('[ChapterGraphProcessor] 新实体检测入册失败（不阻断主链路）:', e?.message || e)
    }

    // ============ 1. 提取事件 → 落库 lw_events ============
    // 本章旧数据清理移至提取成功之后执行（旧实现在本步之前先删后提取——
    // 一旦提取失败，旧事件/边已删而新数据未建，整章图谱数据丢失）
    // 空转防线（2026-09-19）：解析失败/空数组都算本轮失败——重试一次，仍空则记
    // failedSteps（不记 hash，下次保存重跑）。旧实现"0 条也是合法结果"让
    // 解析假成功/模型空转静默吞掉整章事件（ep11 事件=0 事故根因）。
    const events: StoryEvent[] = []
    try {
      let resp = await this.aiService().extractChapterEvents(
        `extract-events-${Date.now()}`,
        projectId,
        outlineId,
        chapterContent,
        chapterNumber,
        providerConfigId,
        modelId,
      )
      if (!resp.success || !Array.isArray(resp.data) || resp.data.length === 0) {
        resp = await this.aiService().extractChapterEvents(
          `extract-events-retry-${Date.now()}`,
          projectId,
          outlineId,
          chapterContent,
          chapterNumber,
          providerConfigId,
          modelId,
        )
      }
      const extracted: Array<{ name?: string; storyTime?: string; description?: string; involvedEntities?: MemoryEntity[]; stateBefore?: string; stateAfter?: string }> =
        Array.isArray(resp.data) ? resp.data : []
      if (!resp.success || extracted.length === 0) {
        failedSteps.push('事件提取')
        console.error(
          `[ChapterGraphProcessor] 事件提取空产物（重试后仍空，记失败步骤）project=${projectId} chapter=${chapterNumber}: ${resp.error || '0 个事件'}`,
        )
      } else {
      // 幂等清理（重跑 = 重建）：事件/边是纯 insert，旧事件 id 每次新生成，
      // 不去重会导致 lw_events / lw_graph_edges 膨胀、图谱出现重复节点与边。
      // 实体状态是 upsert 幂等，无需清理。提取成功才清理（失败路径旧数据原样保留）。
      if (m.lwEvents && m.lwGraphEdges) {
        try {
          const oldEvents = await m.lwEvents.listByChapter(projectId, chapterNumber)
          const oldIds = oldEvents.map((e) => e.id).filter(Boolean)
          if (oldIds.length > 0) {
            await m.lwGraphEdges.deleteBySourceEventIds(projectId, oldIds)
          }
          await m.lwEvents.deleteByChapter(projectId, chapterNumber)
        } catch (e) {
          failedSteps.push('旧数据清理')
          console.error('[ChapterGraphProcessor] 本章旧数据清理失败（本轮不记 hash，下次重跑）:', e)
        }
      }
      if (m.lwEvents) {
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
        const resolvedEvents: Array<{ name: string; storyTime?: string; description?: string; involvedEntities?: MemoryEntity[]; stateBefore?: string; stateAfter?: string }> = []
        for (const ev of extracted) {
          if (!ev.name?.trim()) continue
          // 52 号：解析失败的实体不再静默跳过——收集进「未登记人物」队列（R9 数据源）
          const { resolved: resolvedIn, unresolved: evUnresolved } = await this.resolveEventEntities(projectId, ev.involvedEntities || [])
          for (const u of evUnresolved) {
            if (u.type === 'character') await this.registerUnresolvedName(projectId, chapterNumber, u.name)
          }
          // 复测补链：模型漏挂实体的事件，按句子共现补挂（正文同句出现的人名）
          let involved = resolvedIn
          if (involved.length === 0) {
            involved = await this.linkEventByCoOccurrence(projectId, chapterNumber, ev, chapterContent)
          }
          resolvedEvents.push({
            name: ev.name.trim(),
            storyTime: ev.storyTime?.trim() || undefined,
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
            storyTime: e.storyTime,
            involvedEntities: e.involvedEntities,
            stateBefore: e.stateBefore,
            stateAfter: e.stateAfter,
          })),
        ))
      }
      }
    } catch (e) {
      failedSteps.push('事件提取')
      console.error('[ChapterGraphProcessor] 事件提取失败（后续步骤继续）:', e)
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
      failedSteps.push('伏笔提取')
      console.warn('[ChapterGraphProcessor] 伏笔提取失败（不阻断主链路）:', e)
    }

// ============ 2. 提取实体状态 → upsert 状态切片 ============
    const states: EntityStateSnapshot[] = []
    try {
      const involved = await this.collectInvolvedEntities(projectId, outlineId, events, chapterContent)
      if (involved.length > 0 && m.lwEntityStates) {
        // 空转防线：有戏份实体却提不出任何切片 = 本轮失败（重试一次，仍空记 failedSteps）。
        // 「有戏份」判定 = 涉及实体名单里至少一个名字在正文出现——大纲挂名但正文
        // 完全没写的实体提不出状态是正常的，不算失败。
        const mentionedInvolved = involved.filter(e => chapterContent.includes(e.name))
        const callStates = (runId: string) => this.aiService().extractEntityStates(
          runId,
          projectId,
          outlineId,
          chapterContent,
          chapterNumber,
          involved,
          providerConfigId,
          modelId,
        )
        let resp = await callStates(`extract-states-${Date.now()}`)
        const emptyStates = !resp.success || !Array.isArray(resp.data) || resp.data.length === 0
        if (emptyStates && mentionedInvolved.length > 0) {
          resp = await callStates(`extract-states-retry-${Date.now()}`)
        }
        const extractedStates: Array<{ entityType?: string; entityId?: string; entityName?: string; stateSummary?: string; keyChanges?: string[] }> =
          Array.isArray(resp.data) ? resp.data : []
        if ((!resp.success || extractedStates.length === 0) && mentionedInvolved.length > 0) {
          failedSteps.push('状态切片')
          console.error(
            `[ChapterGraphProcessor] 状态切片空产物（重试后仍空，记失败步骤）project=${projectId} chapter=${chapterNumber}: ${resp.error || '0 条切片'}`,
          )
        }
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
          // 提到了切片但全部解析失败 = 本轮失败（下次保存重跑，不记 hash）
          failedSteps.push('状态切片')
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
      failedSteps.push('状态切片')
      console.error('[ChapterGraphProcessor] 状态提取失败（不影响后续步骤）:', e)
    }

    // ============ 3. 自动建边 ============
    const edges: GraphEdge[] = []
    try {
      if (m.lwGraphEdges) {
        // 52 号统一存储：involves 关系由 getGraph 从 involved_entities JSON 推导，不再写边副本
      }
    } catch (e) {
      failedSteps.push('自动建边')
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
      failedSteps.push('关系演变')
      console.warn('[ChapterGraphProcessor] 关系演变提取失败（不阻断主链路）:', e)
    }

    // ============ 4. 章节状态摘要（沿用现有链路） ============
    // 空转防线（2026-09-19）：摘要失败/空产物也记 failedSteps（旧实现静默跳过，
    // ep8 摘要缺失事故根因——下一章写作与跨章审查都拿不到上一章结束状态）
    try {
      const prev = m.lwChapterStateSummaries
        ? await m.lwChapterStateSummaries.getLatestBeforeChapter(projectId, chapterNumber)
        : null
      const callSummary = (runId: string) => this.aiService().extractChapterStateSummary(
        runId,
        projectId,
        outlineId,
        chapterContent,
        chapterNumber,
        prev ? { storyTime: prev.storyTime, currentLocation: prev.currentLocation, characterStates: prev.characterStates, pendingEvents: prev.pendingEvents } : undefined,
        providerConfigId,
        modelId,
      )
      let resp = await callSummary(`extract-summary-${Date.now()}`)
      const summaryUsable = (d: typeof resp.data): boolean =>
        !!d && !!(d.storyTime || d.characterStates || d.keyChanges)
      if (!resp.success || !summaryUsable(resp.data)) {
        resp = await callSummary(`extract-summary-retry-${Date.now()}`)
      }
      if (resp.success && summaryUsable(resp.data) && m.lwChapterStateSummaries) {
        await m.lwChapterStateSummaries.upsert({
          projectId,
          outlineId,
          chapterNumber,
          storyTime: resp.data!.storyTime || '',
          currentLocation: resp.data!.currentLocation || '',
          characterStates: resp.data!.characterStates || '',
          pendingEvents: resp.data!.pendingEvents || '',
          keyChanges: resp.data!.keyChanges || '',
        })
      } else {
        failedSteps.push('章节状态摘要')
        console.error(
          `[ChapterGraphProcessor] 章节状态摘要空产物（重试后仍不可用，记失败步骤）project=${projectId} chapter=${chapterNumber}: ${resp.error || '摘要字段全空'}`,
        )
      }
    } catch (e) {
      failedSteps.push('章节状态摘要')
      console.error('[ChapterGraphProcessor] 章节状态摘要提取失败:', e)
    }

    // 评审 #61 + 复核修复：全部步骤成功才记 hash——任一步骤失败都记入
    // failedSteps，下次保存自动重跑（旧实现无条件记录，失败一次即永久短路，
    // 该章图谱数据直到进程重启都不再生成）
    if (failedSteps.length === 0) {
      ChapterGraphProcessor.contentHashes.set(contentKey, contentHash)
    } else {
      console.error(
        `[ChapterGraphProcessor] 流水线存在失败步骤（不记 hash，下次保存重跑）project=${projectId} chapter=${chapterNumber}: ${failedSteps.join('、')}`,
      )
    }
    return {
      events,
      states,
      edges,
      stateCount: states.length,
      foreshadowCount,
      relationChangeCount,
      newEntitiesNote,
      failedSteps,
    }
  }

  /**
   * 0b 步骤：检测正文新出现的人物/地点/物品并入册（复用写作台的
   * LwEntityDetectionService——AI 检测 + 重要性分级 + 临时实体模板）。
   * 入册后同名清「未登记人物」队列（R9 不再重复告警）。全程 fail-soft。
   * 已知口径：检测服务走默认提供商（与写作台按钮行为一致），不走 stage 模型。
   */
  private async detectAndAddNewEntities(projectId: string, chapterContent: string): Promise<string> {
    const { LwEntityDetectionService } = await import(
      '@core/platform/episode-production/auto-binding/lw-entity-detection.service'
    )
    const detect = await LwEntityDetectionService.detectNewEntities(projectId, chapterContent)
    const chars = detect.newCharacters || []
    const locs = detect.newLocations || []
    const items = detect.newItems || []
    if (chars.length === 0 && locs.length === 0 && items.length === 0) return ''
    const added = await LwEntityDetectionService.autoAddEntities(projectId, chars, locs, items)

    // 入册成功的人物：同名清「未登记人物」队列，避免 R9 疑点残留
    try {
      const m = this.manager()
      const names = new Set((added.addedCharacters || []).map((c: any) => c.name).filter(Boolean))
      if (names.size > 0 && m?.lwCustomEntities) {
        const rows = await m.lwCustomEntities.getByProjectAndKind(projectId, UNREGISTERED_CHARACTER_KIND)
        for (const r of rows) {
          if (names.has(r.name)) await m.lwCustomEntities.deleteRow(r.id)
        }
      }
    } catch (e) {
      console.warn('[ChapterGraphProcessor] 未登记队列同名清理失败（不阻断）:', e)
    }

    const parts = [
      (added.addedCharacters || []).length > 0 ? `人物 ${added.addedCharacters.map((c: any) => c.name).join('、')}` : '',
      (added.addedLocations || []).length > 0 ? `地点 ${added.addedLocations.map((l: any) => l.name).join('、')}` : '',
      (added.addedItems || []).length > 0 ? `物品 ${added.addedItems.map((i: any) => i.name).join('、')}` : '',
    ].filter(Boolean)
    return parts.length > 0 ? `本章新入册：${parts.join('；')}` : ''
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
      const clean = (ev.name || '').replace(/[「」『』【】\s]/g, '')
      if (!clean) return []
      const all = chapterContent.split(/[。！？\n]/).filter(Boolean)
      // 模型起的事件名不一定是原文原词——关键串从 4 字逐级缩到 2 字找共现句
      let sentences: string[] = []
      for (const len of [Math.min(4, clean.length), 3, 2]) {
        const key = clean.slice(0, len)
        if (key.length < 2) break
        sentences = all.filter(s => s.includes(key))
        if (sentences.length > 0) break
      }
      if (sentences.length === 0 && ev.description) {
        const dk = ev.description.replace(/[「」『』【】\s]/g, '').slice(0, 4)
        if (dk.length >= 2) sentences = all.filter(s => s.includes(dk))
      }
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
        if (r?.resolved && r.id) entities.push({ type: 'character', id: r.id, name: r.name })
        else await this.registerUnresolvedName(projectId, chapterNumber, w.slice(0, 2))
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
      // 家庭指称（万家/林家）不是人名——入队只会制造 R9 误报阻断（E2E 实测）
      const { isFamilyReferenceName } = await import('./consistency.service')
      if (isFamilyReferenceName(trimmed)) return
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

  /**
   * 收集流水线涉及的实体（大纲 involved + 事件 involved + 名册正文命中），供状态提取。
   * 全要素覆盖（2026-09-19）：名册内实体只要名字在本章正文出现就纳入——旧实现只走
   * "大纲挂名 + 事件挂载"两条窄路，事件漏挂的地点/物品拿不到状态切片，R3（物品易主）/R5
   * （回忆冲突）长期空转。新入册实体（0b 步骤）也在名册里，自动覆盖。
   */
  private async collectInvolvedEntities(
    projectId: string,
    outlineId: string,
    events: StoryEvent[],
    chapterContent: string,
  ): Promise<Array<{ type: string; id: string; name: string }>> {
    const m = this.manager()
    if (!m) return []
    const result: Array<{ type: string; id: string; name: string }> = []
    const seen = new Set<string>()
    const push = (type: string, id: string, name: string): void => {
      const key = `${type}:${id}`
      if (!id || seen.has(key)) return
      seen.add(key)
      result.push({ type, id, name })
    }

    const [characters, locations, items] = await Promise.all([
      m.lwCharacters?.getByProjectId(projectId) ?? Promise.resolve([]),
      m.lwLocations?.getByProjectId(projectId) ?? Promise.resolve([]),
      m.lwItems?.getByProjectId(projectId) ?? Promise.resolve([]),
    ])

    const outline = await m.lwOutlines?.getById(outlineId)
    if (outline) {
      for (const id of outline.involvedCharacters || []) {
        const c = characters.find(x => x.id === id)
        if (c) push('character', id, c.name)
      }
      for (const id of outline.involvedLocations || []) {
        const l = locations.find(x => x.id === id)
        if (l) push('location', id, l.name)
      }
      for (const id of outline.involvedItems || []) {
        const i = items.find(x => x.id === id)
        if (i) push('item', id, i.name)
      }
    }

    for (const ev of events) {
      for (const ent of ev.involvedEntities || []) {
        push(ent.type, ent.id, ent.name)
      }
    }

    // 名册正文命中扫描：大纲/事件都没挂到、但正文确实写到的实体补进来
    const scanMentioned = (list: Array<{ id: string; name: string }>, type: string): void => {
      for (const e of list) {
        const name = (e.name || '').trim()
        if (name.length < 2) continue
        if (chapterContent.includes(name)) push(type, e.id, name)
      }
    }
    scanMentioned(characters, 'character')
    scanMentioned(locations, 'location')
    scanMentioned(items, 'item')

    // 输出预算护栏：状态提取逐实体产出 100-200 字，实体过多会截断尾部——
    // 保序截断（大纲/事件涉及优先于纯命中），40 个覆盖绝大多数单章规模
    return result.slice(0, 40)
  }

  /**
   * 52 号统一存储：不再写 involves 边——事件→实体关联由 getGraph 从
   * lw_events.involved_entities JSON 推导（单一事实源，无副本同步问题）。
   * 保留方法签名避免破坏调用方，但始终返回空数组。
   */
  private async buildEdges(
    _projectId: string,
    _chapterNumber: number,
    _events: StoryEvent[],
    _states: EntityStateSnapshot[],
  ): Promise<GraphEdge[]> {
    return []
  }
}
