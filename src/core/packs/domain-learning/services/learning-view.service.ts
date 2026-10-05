/**
 * 领域学习空间视图聚合服务
 * @module packs/domain-learning/services/learning-view.service
 *
 * 把 dl_* 7 仓储聚合为前端消费的视图（DlSpaceView / 节点档案 / Atlas 图），
 * 供 dl: IPC handler 与未来 Atlas 后端共用。聚合逻辑集中此处，handler 保持薄壳。
 */

import type { ICoreDatabaseManager } from '@core/database/database-manager.interface'
import { createLogger } from '@core/utils/logger'
import type {
  DlSpaceView,
  DlTreeNode,
  DlConceptView,
  DlRelationView,
  DlChatTurn,
  DlCardView,
  DlNodeProfile,
  DlAtlasGraph,
  DlAtlasNode,
  DlAtlasViews,
  DlSpaceStats,
  DlLessonDigest,
  DlRelationType,
  DlWorkRef,
  DlEvidenceRef,
} from '@shared/types/domain-learning.types'
import {
  buildAtlasViews as deriveAtlasViews,
  type AtlasViewInputConcept,
  type AtlasViewInputRelation,
} from '../rules/learning-atlas-views'
import { normalizeDlReviewSettings, pickReviewCandidates } from '../rules/learning-review.rules'
import { declaredPrereqsOf } from '../rules/learning-prerequisites.rules'
import { assessMapCoverage } from '../rules/learning-map-coverage.rules'
import { buildConceptTree, conceptStats, latestCardsByConcept } from '../rules/learning-aggregation.rules'
import type { DlCardRow } from '@core/database/repositories/dl-card.repository'

const logger = createLogger('DlView')

export class LearningViewService {
  constructor(private readonly db: ICoreDatabaseManager) {}

  /**
   * 一次取全量卡后在内存解析"每概念当前卡"（cardId 优先，否则按 version 取最大）。
   * 2026-09-09 复盘：替代逐概念 await getById/getCurrentByConcept 的 N+1。
   */
  private resolveCurrentCards(
    concepts: Array<{ id: string; nodeType: string; cardId: string | null }>,
    cards: DlCardRow[],
  ): Map<string, DlCardRow> {
    const byId = new Map(cards.map((r) => [r.id, r] as const))
    const latest = latestCardsByConcept(cards)
    const out = new Map<string, DlCardRow>()
    for (const c of concepts) {
      if (c.nodeType === 'group') continue
      const row = (c.cardId ? byId.get(c.cardId) ?? null : null) ?? latest.get(c.id) ?? null
      if (row) out.set(c.id, row)
    }
    return out
  }

  /** 空间三栏聚合视图（Home 卡片与 Space 页共用数据源） */
  async buildSpaceView(spaceId: string): Promise<DlSpaceView | null> {
    const project = await this.db.dlProjects?.getById(spaceId)
    if (!project) return null
    const [concepts, relations, questions, cards] = await Promise.all([
      this.db.dlConcepts!.listByProject(spaceId),
      this.db.dlRelations!.listByProject(spaceId),
      this.db.dlQuestions!.listByProject(spaceId),
      this.db.dlCards!.listByProject(spaceId),
    ])

    // 每概念当前版卡片（一次取全量卡内存解析：cardId 优先，否则最高 version——消除逐概念 N+1）
    const resolvedCards = this.resolveCurrentCards(concepts, cards)
    const cardOf = new Map<string, DlCardView>()
    for (const [conceptId, row] of resolvedCards) {
      const c = concepts.find((x) => x.id === conceptId)
      if (!c) continue
      cardOf.set(c.id, {
        id: row.id,
        conceptId: c.id,
        essenceType: row.essenceType as DlCardView['essenceType'],
        sections: row.sections,
        works: row.works,
        contentMd: row.contentMd,
        evidenceSources: row.evidenceSources,
        // 讲义设计规格（2026-09-14）：渲染层据此出规格条与区导航、区级重写据此重发规格锁
        spec: row.spec,
        version: row.version,
        status: row.status as 'draft' | 'published',
        verification: row.verification
          ? {
              status: row.verification.status,
              issues: row.verification.issues.length,
              checkedAt: row.verification.checkedAt ?? null,
              note: row.verification.note ?? null,
            }
          : null,
      })
    }

    const conceptViews: DlConceptView[] = concepts.map((c) => {
      const card = cardOf.get(c.id)
      return {
        id: c.id,
        parentId: c.parentId,
        nodeType: (c.nodeType === 'group' ? 'group' : c.nodeType) as DlConceptView['nodeType'],
        name: c.name,
        en: c.en,
        desc: c.definitionShort,
        researchState: c.researchState as DlConceptView['researchState'],
        mastery: c.mastery as DlConceptView['mastery'],
        source: c.source as DlConceptView['source'],
        attrs: c.attrs,
        // 声明的前置（2026-09-12）：可能与关系边不完全一致（声明了但还没建边），UI 分开标注
        declaredPrereqs: declaredPrereqsOf({ id: c.id, name: c.name, nodeType: c.nodeType, attrs: c.attrs }),
        hasCard: !!card,
        ...(card ? { card } : {}),
      }
    })

    const relationViews: DlRelationView[] = relations.map((r) => ({
      source: r.sourceId,
      target: r.targetId,
      type: r.relationType as DlRelationView['type'],
      verified: r.verified,
      evidence: r.evidence,
    }))

    const tree = this.buildTree(conceptViews)
    const stats = this.stats(conceptViews)
    const openCount = questions.filter((q) => q.status === 'open').length
    // 追问对话（右栏历史）：user=question / assistant=answer（answered 才有）。
    // 仓储 listByProject 为 createdAt DESC（新在前），这里反转成 旧→新 正序，
    // 使前端按序渲染时「最近的消息在最底部」（用户修复诉求）。
    const turns: DlChatTurn[] = [...questions].reverse().flatMap((q) => {
      const qConceptId = q.conceptId ?? null
      const userTurn: DlChatTurn = { role: 'user', text: q.question, questionId: q.id, conceptId: qConceptId }
      if (q.answerMd) {
        return [userTurn, { role: 'assistant', text: q.answerMd, sourceLabel: this.sourceLabel(q.answerSource), questionId: q.id, conceptId: qConceptId }]
      }
      return [userTurn]
    })

    const profile = project.profile
      ? {
          id: project.profileId ?? 'custom',
          kindLabel: String(project.profile.kindLabel ?? ''),
          nature: String(project.profile.nature ?? ''),
          emphasis: Array.isArray(project.profile.emphasis) ? project.profile.emphasis.map(String) : [],
          ...(project.profileId ? {} : { custom: true }),
        }
      : null

    return {
      id: spaceId,
      name: project.name,
      goal: project.goal as DlSpaceView['goal'],
      tagline: project.description ?? '',
      profile,
      // 主题学习前置要求（2026-09-12 用户需求：整个领域的学习门槛，进空间即见）
      // 读侧信任仓储已解析结果（写入时已规范化并物化 inSpace）
      prerequisites: project.prerequisites ?? [],
      // 书籍建议（2026-10-04 用户需求：知识体系规划后的书籍内容提示；用户上传绑定知识库后可被研究引用）
      bookSuggestions: project.bookSuggestions ?? [],
      // 地图完整度诊断（2026-09-12 用户反馈"知识体系不够完善"）：结构性缺口可见 + 供 AI 补全起步
      coverage: assessMapCoverage({
        spaceName: project.name,
        concepts: concepts.map((c) => ({
          id: c.id,
          name: c.name,
          nodeType: c.nodeType,
          parentId: c.parentId,
          researchState: c.researchState,
          cardId: c.cardId,
          attrs: c.attrs,
        })),
        relations: relations.map((r) => ({
          source: r.sourceId,
          target: r.targetId,
          type: r.relationType,
          verified: r.verified,
        })),
        spacePrereqs: project.prerequisites ?? [],
      }),
      status: project.status as DlSpaceView['status'],
      stats: { ...stats, learning: conceptViews.filter((c) => c.mastery === 'learning').length },
      concepts: conceptViews,
      relations: relationViews,
      tree,
      turns,
      openQuestionCount: openCount,
    }
  }

  /** 概念树聚合（group 内层、概念为叶；顶层 parent=null；保持仓储序） */
  buildTree(concepts: Pick<DlConceptView, 'id' | 'parentId' | 'nodeType' | 'name'>[]): DlTreeNode[] {
    return buildConceptTree(concepts)
  }

  /** 统计（叶子=知识节点；group 不计） */
  stats(concepts: Pick<DlConceptView, 'mastery' | 'nodeType'>[]): { mastered: number; total: number } {
    return conceptStats(concepts)
  }

  /** Atlas 图谱投影（dl_concept+dl_relation → 图） */
  async buildAtlasGraph(spaceId: string): Promise<DlAtlasGraph | null> {
    const project = await this.db.dlProjects?.getById(spaceId)
    if (!project) return null
    const [concepts, relations] = await Promise.all([
      this.db.dlConcepts!.listByProject(spaceId),
      this.db.dlRelations!.listByProject(spaceId),
    ])
    const nodes: DlAtlasNode[] = concepts
      .filter((c) => c.nodeType !== 'group')
      .map((c) => ({
        id: c.id,
        name: c.name,
        nodeType: c.nodeType as DlAtlasNode['nodeType'],
        group: c.parentId ?? undefined,
        mastery: c.mastery as DlAtlasNode['mastery'],
        desc: c.definitionShort,
        attrs: c.attrs,
      }))
    const edges = relations
      .filter((r) => nodes.some((n) => n.id === r.sourceId) && nodes.some((n) => n.id === r.targetId))
      .map((r) => ({ source: r.sourceId, target: r.targetId, type: r.relationType as DlRelationType }))
    return { spaceId, nodes, edges }
  }

  /** Atlas 增强视图聚合（M2-E：按画像侧重启用；派生规则见 rules/learning-atlas-views） */
  async buildAtlasViews(spaceId: string): Promise<DlAtlasViews | null> {
    const project = await this.db.dlProjects?.getById(spaceId)
    if (!project) return null
    const [concepts, relations, cards] = await Promise.all([
      this.db.dlConcepts!.listByProject(spaceId),
      this.db.dlRelations!.listByProject(spaceId),
      this.db.dlCards!.listByProject(spaceId),
    ])

    // 每概念当前卡（一次全量解析，消除逐概念 N+1）
    const resolvedCards = this.resolveCurrentCards(concepts, cards)
    const inputConcepts: AtlasViewInputConcept[] = []
    for (const c of concepts) {
      let card: AtlasViewInputConcept['card'] = null
      const row = resolvedCards.get(c.id)
      if (row) {
        card = { version: row.version, status: row.status, worksCount: row.works?.length ?? 0 }
      }
      inputConcepts.push({
        id: c.id,
        name: c.name,
        nodeType: c.nodeType,
        parentId: c.parentId,
        mastery: c.mastery,
        desc: c.definitionShort,
        attrs: c.attrs,
        card,
      })
    }
    const inputRelations: AtlasViewInputRelation[] = relations.map((r) => ({
      source: r.sourceId,
      target: r.targetId,
      relationType: r.relationType,
      verified: r.verified,
    }))

    const views = deriveAtlasViews({ concepts: inputConcepts, relations: inputRelations, profile: project.profile })
    views.spaceId = spaceId
    return views
  }

  /** 学习统计快照（M3-C：进度/研究/讲义/关系/问答/复习到期） */
  async buildSpaceStats(spaceId: string): Promise<DlSpaceStats | null> {
    const project = await this.db.dlProjects?.getById(spaceId)
    if (!project) return null
    const [concepts, relations, questions, cards, logs] = await Promise.all([
      this.db.dlConcepts!.listByProject(spaceId),
      this.db.dlRelations!.listByProject(spaceId),
      this.db.dlQuestions!.listByProject(spaceId),
      this.db.dlCards!.listByProject(spaceId),
      this.db.dlMasteryLogs!.listByProject(spaceId),
    ])
    const leaves = concepts.filter((c) => c.nodeType !== 'group')
    const groups = concepts.length - leaves.length

    const research: Record<string, number> = {}
    for (const c of leaves) research[c.researchState] = (research[c.researchState] ?? 0) + 1

    // 每概念最新版卡片状态计数（M4-A：latestCardsByConcept 单源）
    const latest = latestCardsByConcept(cards)
    let published = 0
    let draft = 0
    for (const card of latest.values()) {
      if (card.status === 'published') published++
      else draft++
    }

    // 复习到期（review 启用才计）
    let reviewDueCount = 0
    const review = normalizeDlReviewSettings(project.review)
    if (review.enabled) {
      reviewDueCount = pickReviewCandidates(
        concepts,
        logs.map((l) => ({ conceptId: l.conceptId, trigger: l.trigger, toMastery: l.toMastery, at: l.at })),
        { intervalMs: Math.max(1, review.intervalMin) * 60_000, limit: Number.MAX_SAFE_INTEGER, now: new Date() },
      ).length
    }

    logger.info(`[view] buildSpaceStats space=${spaceId} total=${leaves.length} mastered=${leaves.filter((c) => c.mastery === 'mastered').length} cards=${latest.size} reviewDue=${reviewDueCount}`)
    return {
      spaceId,
      name: project.name,
      updatedAt: project.updatedAt?.toISOString() ?? null,
      concepts: {
        total: leaves.length,
        groups,
        mastered: leaves.filter((c) => c.mastery === 'mastered').length,
        learning: leaves.filter((c) => c.mastery === 'learning').length,
        review: leaves.filter((c) => c.mastery === 'review').length,
        untouched: leaves.filter((c) => c.mastery === 'untouched').length,
      },
      research,
      cards: { published, draft },
      relations: {
        total: relations.length,
        prerequisite: relations.filter((r) => r.relationType === 'prerequisite').length,
        verified: relations.filter((r) => r.verified).length,
      },
      questions: {
        total: questions.length,
        open: questions.filter((q) => q.status === 'open').length,
        answered: questions.filter((q) => q.status === 'answered').length,
      },
      reviewDueCount,
    }
  }

  /** 讲义合集导出（M3-C：按目录树顺序收录有讲义的概念，拼接 md） */
  async buildLessonDigest(spaceId: string): Promise<DlLessonDigest | null> {
    const project = await this.db.dlProjects?.getById(spaceId)
    if (!project) return null
    const [concepts, cards] = await Promise.all([
      this.db.dlConcepts!.listByProject(spaceId),
      this.db.dlCards!.listByProject(spaceId),
    ])
    const latest = latestCardsByConcept(cards)
    const cardOfConcept = (id: string) => latest.get(id) ?? null
    const byId = new Map(concepts.map((c) => [c.id, c]))

    const lines: string[] = []
    const pushConcept = (conceptId: string, depth: number): void => {
      const c = byId.get(conceptId)
      const card = c ? cardOfConcept(c.id) : null
      if (!c || !card || c.nodeType === 'group') return
      lines.push(`${'#'.repeat(Math.min(depth, 6))} ${c.name}`)
      lines.push('')
      lines.push(`> 类型：${c.nodeType} · 掌握度：${c.mastery} · 讲义状态：${card.status}（v${card.version}）`)
      if (c.definitionShort) lines.push(`> 一句话定义：${c.definitionShort}`)
      lines.push('')
      for (const s of card.sections) {
        lines.push(`${'#'.repeat(Math.min(depth + 1, 6))} ${s.title ?? s.key}`)
        lines.push('')
        lines.push(s.md)
        lines.push('')
      }
      if (card.works?.length) {
        lines.push(`**相关著作**：${card.works.map((w: DlWorkRef) => `${w.title}${w.year ? `（${w.year}）` : ''}${w.kind ? ` [${w.kind}]` : ''}`).join('；')}`)
        lines.push('')
      }
      if (card.evidenceSources?.length) {
        lines.push(`**证据来源**：${card.evidenceSources.map((e: DlEvidenceRef) => `${e.title}${e.url ? `（${e.url}）` : ''}`).join('；')}`)
        lines.push('')
      }
      lines.push('---')
      lines.push('')
    }

    // 目录树序遍历：顶层 group → 子概念/子 group；无 group 概念归「根层」
    const childrenOf = (parentId: string | null) =>
      concepts.filter((c) => c.parentId === parentId).sort((a, b) => a.createdAt!.getTime() - b.createdAt!.getTime())
    let count = 0
    const walkGroups = (parentId: string | null, depth: number): void => {
      for (const node of childrenOf(parentId)) {
        if (node.nodeType === 'group') {
          lines.push(`${'#'.repeat(Math.min(depth, 6))} ${node.name}`)
          lines.push('')
          walkGroups(node.id, depth + 1)
        } else if (cardOfConcept(node.id)) {
          pushConcept(node.id, depth + 1)
          count++
        }
      }
    }
    // 顶层：目录 group 与根层概念分组输出
    for (const node of childrenOf(null)) {
      if (node.nodeType === 'group') {
        lines.push(`## ${node.name}`)
        lines.push('')
        walkGroups(node.id, 3)
      } else if (cardOfConcept(node.id)) {
        if (count === 0) {
          lines.push('## 根层概念')
          lines.push('')
        }
        pushConcept(node.id, 3)
        count++
      }
    }

    const digest = lines.join('\n').trim()
    const title = `# ${project.name} · 讲义合集\n\n> 学习目标：${project.goal} · 收录 ${count} 个概念 · 导出于 ${new Date().toISOString()}\n\n${digest}`.trim()
    logger.info(`[view] buildLessonDigest space=${spaceId} count=${count} len=${title.length}`)
    return {
      markdown: `${title}\n`,
      filename: `讲义合集-${project.name.replace(/[\\/:*?"<>|]/g, '_')}.md`,
      count,
    }
  }

  /** 节点档案（Atlas 右栏 / 概念详情）：关联内容 + 直接关系 */
  async buildNodeProfile(spaceId: string, nodeId: string): Promise<DlNodeProfile | null> {    const [conceptRows, relationRows, project] = await Promise.all([
      this.db.dlConcepts!.listByProject(spaceId),
      this.db.dlRelations!.listByProject(spaceId),
      this.db.dlProjects?.getById(spaceId),
    ])
    if (!project) return null
    const row = conceptRows.find((c) => c.id === nodeId)
    if (!row) return null
    const card = row.cardId
      ? await this.db.dlCards?.getById(row.cardId)
      : await this.db.dlCards?.getCurrentByConcept(spaceId, nodeId)

    const neighbors = relationRows.filter((r) => r.sourceId === nodeId || r.targetId === nodeId)
    const relations = neighbors.map((r) => {
      const otherId = r.sourceId === nodeId ? r.targetId : r.sourceId
      const other = conceptRows.find((c) => c.id === otherId)
      return {
        conceptId: otherId,
        name: other?.name ?? otherId,
        rel: r.relationType as DlRelationType,
        direction: (r.sourceId === nodeId ? 'out' : 'in') as 'out' | 'in',
        // 2026-09-12：带上确认态与端点，档案里可直接「确认」（地图人审接线）
        verified: r.verified,
        sourceId: r.sourceId,
        targetId: r.targetId,
        evidence: r.evidence,
        // 2026-09-25：带边 id，档案里可直接「删除」（错边/成环边的修复入口）
        relationId: r.id,
      }
    })

    const hasChildren = conceptRows.some((c) => c.parentId === nodeId)
    return {
      node: {
        id: row.id,
        name: row.name,
        nodeType: row.nodeType as DlAtlasNode['nodeType'],
        mastery: row.mastery as DlAtlasNode['mastery'],
        desc: row.definitionShort,
        attrs: row.attrs,
      },
      attrs: row.attrs,
      relations,
      relatedContent: card?.works ?? [],
      hasChildren,
    }
  }

  private sourceLabel(source: string | null): string | undefined {
    if (!source) return undefined
    const map: Record<string, string> = {
      lesson: '讲义',
      graph: '概念图',
      kb: '知识库',
      ai_verified: '先验确认',
      new_research: '新研究',
    }
    return map[source] ?? source
  }
}
