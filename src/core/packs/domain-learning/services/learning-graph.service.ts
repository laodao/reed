/**
 * 领域学习概念图服务（dl_concept/dl_relation/mastery_log）
 * @module packs/domain-learning/services/learning-graph.service
 *
 * 树+图（节点/边 CRUD 收口）、掌握度推进（懂了/没懂——只由用户行为驱动，
 * AI 不自封，design-v3 §4.3/§13）、前置依赖门控、下一概念选择、树聚合/统计、
 * 关系人审确认。排程规则为纯函数（rules/learning-sequence.rules）。
 */

import { randomUUID } from 'crypto'
import {
  pickNextToLearn,
  prereqsReady,
  shouldSuggestSplit,
} from '../rules/learning-sequence.rules'
import { pickReviewCandidates } from '../rules/learning-review.rules'
import { buildConceptTree, conceptStats } from '../rules/learning-aggregation.rules'
import type { DlConceptRepository, DlConceptRow } from '@core/database/repositories/dl-concept.repository'
import type { DlRelationRepository, DlRelationRow } from '@core/database/repositories/dl-relation.repository'
import type { DlMasteryLogRepository } from '@core/database/repositories/dl-mastery-log.repository'
import type { DlReviewDueItem } from '@shared/types/domain-learning.types'

export interface AckConfusedInput {
  reason?: string
  /** 区级没懂定位（content-template-design v4 §4：{key,title}） */
  sectionKey?: string
  sectionTitle?: string
}

export interface AckConfusedResult {
  /** 本次累计没懂次数 */
  confusedCount: number
  /** 达到阈值 → 应提示拆分子概念入队（D9） */
  splitSuggested: boolean
}

export class LearningGraphService {
  constructor(
    private readonly concepts: DlConceptRepository,
    private readonly relations: DlRelationRepository,
    private readonly masteryLogs: DlMasteryLogRepository,
  ) {}

  // ==================== 掌握度推进（用户驱动） ====================

  /** [懂了]：前置全部就绪才放行；mastery → mastered + 审计日志 */
  async ackMastered(projectId: string, conceptId: string, trigger = 'lesson_ack'): Promise<void> {
    const c = await this.mustConcept(projectId, conceptId)
    const rels = await this.relations.listByProject(projectId)
    const all = await this.concepts.listByProject(projectId)
    const masteredIds = new Set(all.filter((x) => x.mastery === 'mastered').map((x) => x.id))
    if (!prereqsReady(c.id, toRelViews(rels), masteredIds)) {
      throw new Error('前置依赖未全部掌握：先学带锁的前置概念')
    }
    const from = c.mastery
    await this.concepts.patch(conceptId, { mastery: 'mastered', attrs: { ...(c.attrs ?? {}), confusedCount: 0 } })
    if (from !== 'mastered') {
      await this.masteryLogs.append({
        id: randomUUID(),
        projectId,
        conceptId,
        fromMastery: from,
        toMastery: 'mastered',
        trigger,
      })
    }
  }

  /** [没懂]：计数 +1、mastery → learning；达阈值提示拆解（不自动拆，用户触发） */
  async ackConfused(projectId: string, conceptId: string, _input?: AckConfusedInput): Promise<AckConfusedResult> {
    const c = await this.mustConcept(projectId, conceptId)
    const attrs = { ...(c.attrs ?? {}) }
    const count = typeof attrs.confusedCount === 'number' ? attrs.confusedCount : 0
    const next = count + 1
    attrs.confusedCount = next
    if (_input?.sectionKey) {
      const sections = (attrs.confusedSections as Record<string, number>) ?? {}
      sections[_input.sectionKey] = (sections[_input.sectionKey] ?? 0) + 1
      attrs.confusedSections = sections
    }
    await this.concepts.patch(conceptId, { mastery: 'learning', attrs })
    if (c.mastery !== 'learning') {
      await this.masteryLogs.append({
        id: randomUUID(),
        projectId,
        conceptId,
        fromMastery: c.mastery,
        toMastery: 'learning',
        trigger: 'lesson_ack_failed',
      })
    }
    return { confusedCount: next, splitSuggested: shouldSuggestSplit(next) }
  }

  /** 手动把概念置为需复习（间隔回访 M3；预留入口） */
  async markReview(projectId: string, conceptId: string): Promise<void> {
    const c = await this.mustConcept(projectId, conceptId)
    await this.concepts.patch(conceptId, { mastery: 'review' })
    if (c.mastery !== 'review') {
      await this.masteryLogs.append({
        id: randomUUID(),
        projectId,
        conceptId,
        fromMastery: c.mastery,
        toMastery: 'review',
        trigger: 'manual',
      })
    }
  }

  /** 到期复习候选（M3-B）：mastered/review 且逾期；规则见 rules/learning-review.rules */
  async listReviewDue(
    projectId: string,
    opts: { intervalMin: number; limit?: number; now?: Date },
  ): Promise<DlReviewDueItem[]> {
    const [all, logs] = await Promise.all([
      this.concepts.listByProject(projectId),
      this.masteryLogs.listByProject(projectId),
    ])
    const intervalMs = Math.max(1, opts.intervalMin) * 60_000
    const candidates = pickReviewCandidates(
      all,
      logs.map((l) => ({ conceptId: l.conceptId, trigger: l.trigger, toMastery: l.toMastery, at: l.at })),
      { intervalMs, limit: Math.max(1, opts.limit ?? 10), now: opts.now ?? new Date() },
    )
    const byId = new Map(all.map((c) => [c.id, c]))
    return candidates.map((r) => {
      const c = byId.get(r.id)!
      return {
        conceptId: r.id,
        name: r.name,
        mastery: c.mastery,
        lastReviewedAt: r.lastReviewedAt.toISOString(),
        overdueMs: r.overdueMs,
      }
    })
  }

  /** 复习完成（M3-B）：mastered/review → mastered；审计 trigger=review（作为下次间隔基准） */
  async reviewDone(projectId: string, conceptId: string): Promise<void> {
    const c = await this.mustConcept(projectId, conceptId)
    if (c.mastery !== 'mastered' && c.mastery !== 'review') {
      throw new Error('仅「已掌握/需复习」的概念可完成复习——先学习后再标记')
    }
    await this.concepts.patch(conceptId, { mastery: 'mastered' })
    await this.masteryLogs.append({
      id: randomUUID(),
      projectId,
      conceptId,
      fromMastery: c.mastery,
      toMastery: 'mastered',
      trigger: 'review',
    })
  }

  // ==================== 排程 ====================

  /** 下一个待学概念 id（依赖门控 + 树序；null = 全部掌握） */
  async pickNextToLearn(projectId: string): Promise<string | null> {
    const all = await this.concepts.listByProject(projectId)
    const rels = await this.relations.listByProject(projectId)
    return pickNextToLearn(toConceptViews(all), toRelViews(rels))
  }

  // ==================== 树/统计 ====================

  /** 聚合大纲树（group 为内层、概念为叶；顶层 parent=null；children 按 createdAt 排序） */
  async buildTree(projectId: string): Promise<TreeNode[]> {
    const all = await this.concepts.listByProject(projectId)
    return buildConceptTree(all, { sortChildren: true })
  }

  /** 掌握度统计（叶子=知识节点，group 不计） */
  async stats(projectId: string): Promise<{ total: number; mastered: number; learning: number }> {
    const all = await this.concepts.listByProject(projectId)
    return conceptStats(all)
  }

  /** 概念在树中的祖先路径（面包屑/展开路径用） */
  async pathTo(projectId: string, conceptId: string): Promise<string[]> {
    const all = await this.concepts.listByProject(projectId)
    const byId = new Map(all.map((c) => [c.id, c]))
    const path: string[] = []
    let cur = byId.get(conceptId)
    while (cur?.parentId) {
      path.unshift(cur.parentId)
      cur = byId.get(cur.parentId)
    }
    return path
  }

  // ==================== 关系 ====================

  /** 人审确认边（地图人审/关系确认：draft → verified；同边 upsert 走仓储幂等） */
  async confirmRelation(
    projectId: string,
    sourceId: string,
    targetId: string,
    relationType: string,
    evidence?: string | null,
  ): Promise<void> {
    await this.relations.create({
      id: randomUUID(),
      projectId,
      sourceId,
      targetId,
      relationType,
      evidence: evidence ?? null,
      verified: true,
    })
  }

  /** 直接邻居（related 区/Atlas 档案用）：出边+入边，含方向标注 */
  async neighbors(projectId: string, conceptId: string): Promise<DlRelationRow[]> {
    const out = await this.relations.listBySource(projectId, conceptId)
    const inn = await this.relations.listByTarget(projectId, conceptId)
    return [...out, ...inn]
  }

  // ==================== 内部 ====================

  private async mustConcept(projectId: string, conceptId: string): Promise<DlConceptRow> {
    const c = await this.concepts.getById(conceptId)
    if (!c || c.projectId !== projectId) throw new Error('概念不存在于该空间')
    return c
  }
}

/** 树节点输出 */
export interface TreeNode {
  id: string
  name: string
  children?: TreeNode[]
  conceptId?: string
}

function toConceptViews(
  rows: DlConceptRow[],
): { id: string; mastery: string; nodeType: string }[] {
  return rows.map((r) => ({ id: r.id, mastery: r.mastery, nodeType: r.nodeType }))
}

function toRelViews(rows: DlRelationRow[]): { source: string; target: string; type: string }[] {
  return rows.map((r) => ({ source: r.sourceId, target: r.targetId, type: r.relationType }))
}
