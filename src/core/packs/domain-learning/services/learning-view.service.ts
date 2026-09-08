/**
 * 领域学习空间视图聚合服务
 * @module packs/domain-learning/services/learning-view.service
 *
 * 把 dl_* 7 仓储聚合为前端消费的视图（DlSpaceView / 节点档案 / Atlas 图），
 * 供 dl: IPC handler 与未来 Atlas 后端共用。聚合逻辑集中此处，handler 保持薄壳。
 */

import type { ICoreDatabaseManager } from '@core/database/database-manager.interface'
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
  DlRelationType,
} from '@shared/types/domain-learning.types'
import {
  buildAtlasViews as deriveAtlasViews,
  type AtlasViewInputConcept,
  type AtlasViewInputRelation,
} from '../rules/learning-atlas-views'

export class LearningViewService {
  constructor(private readonly db: ICoreDatabaseManager) {}

  /** 空间三栏聚合视图（Home 卡片与 Space 页共用数据源） */
  async buildSpaceView(spaceId: string): Promise<DlSpaceView | null> {
    const project = await this.db.dlProjects?.getById(spaceId)
    if (!project) return null
    const [concepts, relations, questions] = await Promise.all([
      this.db.dlConcepts!.listByProject(spaceId),
      this.db.dlRelations!.listByProject(spaceId),
      this.db.dlQuestions!.listByProject(spaceId),
    ])

    // 每概念当前版卡片
    const cardOf = new Map<string, DlCardView>()
    for (const c of concepts) {
      const row = c.cardId
        ? await this.db.dlCards?.getById(c.cardId)
        : await this.db.dlCards?.getCurrentByConcept(spaceId, c.id)
      if (!row || c.nodeType === 'group') continue
      cardOf.set(c.id, {
        id: row.id,
        conceptId: c.id,
        essenceType: row.essenceType as DlCardView['essenceType'],
        sections: row.sections,
        works: row.works,
        contentMd: row.contentMd,
        evidenceSources: row.evidenceSources,
        version: row.version,
        status: row.status as 'draft' | 'published',
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
    // 追问对话（右栏历史）：user=question / assistant=answer（answered 才有）
    const turns: DlChatTurn[] = questions.flatMap((q) => {
      const userTurn: DlChatTurn = { role: 'user', text: q.question, questionId: q.id }
      if (q.answerMd) {
        return [userTurn, { role: 'assistant', text: q.answerMd, sourceLabel: this.sourceLabel(q.answerSource), questionId: q.id }]
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
      status: project.status as DlSpaceView['status'],
      stats: { ...stats, learning: conceptViews.filter((c) => c.mastery === 'learning').length },
      concepts: conceptViews,
      relations: relationViews,
      tree,
      turns,
      openQuestionCount: openCount,
    }
  }

  /** 概念树聚合（group 内层、概念为叶；顶层 parent=null） */
  buildTree(concepts: Pick<DlConceptView, 'id' | 'parentId' | 'nodeType' | 'name'>[]): DlTreeNode[] {
    const byParent = new Map<string | null, Array<Pick<DlConceptView, 'id' | 'parentId' | 'nodeType' | 'name'>>>()
    for (const c of concepts) {
      const list = byParent.get(c.parentId) ?? []
      list.push(c)
      byParent.set(c.parentId, list)
    }
    const build = (parentId: string | null): DlTreeNode[] =>
      (byParent.get(parentId) ?? []).map((c) =>
        c.nodeType === 'group'
          ? { id: c.id, name: c.name, children: build(c.id) }
          : { id: c.id, name: c.name, conceptId: c.id },
      )
    return build(null)
  }

  /** 统计（叶子=知识节点；group 不计） */
  stats(concepts: Pick<DlConceptView, 'mastery' | 'nodeType'>[]): { mastered: number; total: number } {
    const leaves = concepts.filter((c) => c.nodeType !== 'group')
    return {
      total: leaves.length,
      mastered: leaves.filter((c) => c.mastery === 'mastered').length,
    }
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
    const [concepts, relations] = await Promise.all([
      this.db.dlConcepts!.listByProject(spaceId),
      this.db.dlRelations!.listByProject(spaceId),
    ])

    const inputConcepts: AtlasViewInputConcept[] = []
    for (const c of concepts) {
      let card: AtlasViewInputConcept['card'] = null
      if (c.nodeType !== 'group') {
        const row = c.cardId
          ? await this.db.dlCards?.getById(c.cardId)
          : await this.db.dlCards?.getCurrentByConcept(spaceId, c.id)
        if (row) {
          card = { version: row.version, status: row.status, worksCount: row.works?.length ?? 0 }
        }
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
