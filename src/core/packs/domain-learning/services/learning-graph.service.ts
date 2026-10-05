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
import { normalizeConceptPrereqs, wouldCreatePrereqCycle } from '../rules/learning-prerequisites.rules'
import { buildConceptTree, conceptStats } from '../rules/learning-aggregation.rules'
import { createLogger } from '@core/utils/logger'
import type { DlConceptRepository, DlConceptRow } from '@core/database/repositories/dl-concept.repository'
import type { DlRelationRepository, DlRelationRow } from '@core/database/repositories/dl-relation.repository'
import type { DlMasteryLogRepository } from '@core/database/repositories/dl-mastery-log.repository'
import type { DlReviewDueItem, DlCreateConceptInput, DlCreateConceptResult } from '@shared/types/domain-learning.types'

const logger = createLogger('DlGraph')

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

/** 手工建点入参（用户补全知识体系） */
export type CreateConceptInput = Omit<DlCreateConceptInput, 'id'>

/** 手工建点结果 */
export type CreateConceptResult = DlCreateConceptResult

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
    // 懂了 = 全部困惑清零（含区级 confusedSections；2026-09-09 复盘：仅清 count 会让
    // 再次"没懂"时区级计数从旧值续增，自洽性破绽）
    const newAttrs: Record<string, unknown> = { ...(c.attrs ?? {}) }
    delete newAttrs.confusedSections
    newAttrs.confusedCount = 0
    await this.concepts.patch(conceptId, { mastery: 'mastered', attrs: newAttrs })
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
    logger.info(`[graph] ackMastered space=${projectId} concept=${conceptId} ${from}→mastered (${trigger})`)
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
    logger.info(`[graph] ackConfused space=${projectId} concept=${conceptId} count=${next} split=${shouldSuggestSplit(next)}`)
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
    logger.info(`[graph] markReview space=${projectId} concept=${conceptId} ${c.mastery}→review`)
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
    logger.info(`[graph] reviewDone space=${projectId} concept=${conceptId} ${c.mastery}→mastered (review)`)
  }

  // ==================== 排程 ====================

  /**
   * 下一个待学概念 id（依赖门控 + 树序；null = 全部掌握）。
   * rules 层"全不可学时回退第一个未掌握（插队）"在这里显影：回退意味着图上有环或断链，
   * 记 warn 日志——门控被绕过这件事本身不允许无声发生（2026-09-25 A3）。
   */
  async pickNextToLearn(projectId: string): Promise<string | null> {
    const all = await this.concepts.listByProject(projectId)
    const rels = await this.relations.listByProject(projectId)
    const conceptViews = toConceptViews(all)
    const relViews = toRelViews(rels)
    const id = pickNextToLearn(conceptViews, relViews)
    if (id) {
      const hit = conceptViews.find((c) => c.id === id)
      const masteredIds = new Set(conceptViews.filter((c) => c.mastery === 'mastered').map((c) => c.id))
      if (hit && !prereqsReady(id, relViews, masteredIds)) {
        logger.warn(
          `[graph] pickNextToLearn 走了插队回退：没有"前置全掌握"的可学概念（图上存在环或断链），推荐了未就绪概念 ${id}`,
        )
      }
    }
    return id
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

  // ==================== 手工建点（用户补全知识体系；2026-09-12 用户需求） ====================

  /**
   * 用户手工新建知识点（左栏「+ 知识点」）。
   *
   * 与 agent 的 dl_save_concept 的区别：
   * - `source='manual'`（用户自己建的，不是 AI 提炼）、`researchState='unresearched'`
   *   （尚无讲义，后续可被研究/自动推进补齐——这正是"用户建点 + AI 完善"的衔接点）；
   * - 勾选的前置**直接落成已确认的 prerequisite 边**（用户自己确认过，不必再走人审）；
   * - 前置名在空间里找不到时不报错，而是记进 `attrs.prerequisites` 并回给调用方
   *   （UI 提示"可让 AI 补全"，快照里的 ⚠️ 欠账清单也会带上它们）。
   */
  async createConcept(
    projectId: string,
    input: CreateConceptInput,
  ): Promise<CreateConceptResult> {
    const name = String(input.name ?? '').trim()
    if (!name) throw new Error('知识点名称必填')
    const nodeType = String(input.nodeType ?? 'concept').trim() || 'concept'
    if (nodeType === 'group') throw new Error('手工建点只能建知识节点（目录请用建空间时的领域根/分支）')
    const parentId = input.parentId ?? null

    if (parentId) {
      const parent = await this.concepts.getById(parentId)
      if (!parent || parent.projectId !== projectId) throw new Error('所属分支不存在于该空间')
      if (parent.nodeType !== 'group') throw new Error('所属分支必须是目录节点（group）')
    }

    const all = await this.concepts.listByProject(projectId)
    const declared = normalizeConceptPrereqs(input.prerequisites, name)

    // 同父同名：幂等更新（补定义、补前置），不重复建点
    const existing = all.find((c) => c.name === name && c.parentId === parentId)
    if (existing) {
      const attrs: Record<string, unknown> = { ...(existing.attrs ?? {}) }
      if (declared.length) attrs.prerequisites = declared
      await this.concepts.patch(existing.id, {
        definitionShort: input.definitionShort ?? existing.definitionShort,
        attrs: declared.length ? attrs : existing.attrs,
      })
      const link = await this.linkPrerequisites(projectId, existing.id, declared, all)
      logger.info(`[graph] createConcept(手动) 已存在 → 更新 space=${projectId} concept=${existing.id} 前置连边=${link.linkedPrereqs.length}`)
      return { conceptId: existing.id, created: false, ...link }
    }

    const id = randomUUID()
    await this.concepts.create({
      id,
      projectId,
      nodeType,
      name,
      parentId,
      definitionShort: input.definitionShort ?? null,
      en: input.en ?? null,
      researchState: 'unresearched',
      mastery: 'untouched',
      source: 'manual',
      attrs: declared.length ? { prerequisites: declared } : null,
    })
    const link = await this.linkPrerequisites(projectId, id, declared, all)
    logger.info(
      `[graph] createConcept(手动) space=${projectId} concept=${id} name=${name} 前置连边=${link.linkedPrereqs.length} 缺落点=${link.missingPrereqs.length}`,
    )
    return { conceptId: id, created: true, ...link }
  }

  /**
   * 把前置名落成已确认的 prerequisite 边（找不到落点的名字回给调用方）。
   * 环防护（2026-09-25 P0-1）：单条前置会成环时跳过该边并把原因带回 UI（概念照建，
   * 不让一条错边挡住整个建点操作）；本次调用里刚建的边也计入判定，防止同轮连出环。
   */
  private async linkPrerequisites(
    projectId: string,
    targetId: string,
    names: string[],
    all: DlConceptRow[],
  ): Promise<Pick<CreateConceptResult, 'linkedPrereqs' | 'missingPrereqs' | 'cycleSkippedPrereqs'>> {
    const linkedPrereqs: Array<{ name: string; conceptId: string }> = []
    const missingPrereqs: string[] = []
    const cycleSkippedPrereqs: string[] = []
    const existing = (await this.relations.listByProject(projectId)).map((r) => ({
      source: r.sourceId,
      target: r.targetId,
      type: r.relationType,
    }))
    const edges = [...existing]
    for (const n of names) {
      const hit = all.find((c) => c.id !== targetId && c.nodeType !== 'group' && c.name === n)
      if (!hit) {
        missingPrereqs.push(n)
        continue
      }
      if (wouldCreatePrereqCycle(edges, hit.id, targetId)) {
        cycleSkippedPrereqs.push(n)
        continue
      }
      await this.relations.create({
        id: randomUUID(),
        projectId,
        sourceId: hit.id,
        targetId,
        relationType: 'prerequisite',
        evidence: '用户手工建立',
        verified: true,
      })
      edges.push({ source: hit.id, target: targetId, type: 'prerequisite' })
      linkedPrereqs.push({ name: hit.name, conceptId: hit.id })
    }
    if (cycleSkippedPrereqs.length) {
      logger.warn(
        `[graph] linkPrerequisites 跳过会成环的前置 space=${projectId} target=${targetId} prereqs=[${cycleSkippedPrereqs.join('、')}]`,
      )
    }
    return { linkedPrereqs, missingPrereqs, cycleSkippedPrereqs }
  }

  // ==================== 关系 ====================

  /**
   * 人审确认边（地图人审/关系确认：draft → verified；同边 upsert 走仓储幂等）。
   * 环防护（2026-09-25 P0-1）：确认前置边前检查会不会成环——此前只有 agent 建边拦自环，
   * 人审通道建的 A→B、B→A 同样会把学习路径锁死。
   */
  async confirmRelation(
    projectId: string,
    sourceId: string,
    targetId: string,
    relationType: string,
    evidence?: string | null,
  ): Promise<void> {
    if (sourceId === targetId) throw new Error('不能建立自环（概念不能是自己的前置）')
    if (relationType === 'prerequisite') {
      const existing = (await this.relations.listByProject(projectId)).map((r) => ({
        source: r.sourceId,
        target: r.targetId,
        type: r.relationType,
      }))
      if (wouldCreatePrereqCycle(existing, sourceId, targetId)) {
        throw new Error('这条前置关系会构成循环依赖（A→B→…→A）——环上所有概念都无法标记掌握，学习路径会死锁。请删除其中一条边或检查方向。')
      }
    }
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

  /**
   * 删除关系边（2026-09-25 P0-1 配套：错边/成环边的修复入口）。
   * 此前 DlRelationRepository.deleteById 存在但无任何运行时入口——错边只能改库。
   * 删除是人审动作：agent 工具面不提供。
   */
  async removeRelation(projectId: string, relationId: string): Promise<void> {
    const rel = await this.relations.getById(relationId)
    if (!rel || rel.projectId !== projectId) throw new Error('关系不存在于该空间')
    await this.relations.deleteById(relationId)
    logger.info(`[graph] removeRelation space=${projectId} relation=${relationId} ${rel.sourceId}→${rel.targetId} (${rel.relationType})`)
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
