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
import type { DlCardRepository } from '@core/database/repositories/dl-card.repository'
import type { DlNoteRepository } from '@core/database/repositories/dl-note.repository'
import type { DlQuestionRepository } from '@core/database/repositories/dl-question.repository'
import type { DlConceptLogRepository } from '@core/database/repositories/dl-concept-log.repository'
import type { DlReviewDueItem, DlCreateConceptInput, DlCreateConceptResult, DlDeleteConceptResult, DlSplitConceptInput, DlSplitConceptResult } from '@shared/types/domain-learning.types'

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

/** 拆分入参（空间 id 与目标知识点由方法参数给） */
export type SplitConceptInput = Pick<DlSplitConceptInput, 'branchName' | 'children' | 'source'>

export class LearningGraphService {
  constructor(
    private readonly concepts: DlConceptRepository,
    private readonly relations: DlRelationRepository,
    private readonly masteryLogs: DlMasteryLogRepository,
    private readonly cards: DlCardRepository,
    private readonly notes: DlNoteRepository,
    private readonly questions: DlQuestionRepository,
    private readonly conceptLogs: DlConceptLogRepository,
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

  /**
   * 删除知识点（2026-10-05 用户需求）：删概念行并**级联清掉它的从属数据**——
   * 关系边（出+入）、讲义（含全部历史版本）、笔记、问答（追问+回答，view.turns 由本表派生）、
   * 掌握度日志、概念变更日志。目录节点（group）不在此删。各表删除量回给 UI 反馈。
   */
  async deleteConcept(projectId: string, conceptId: string): Promise<DlDeleteConceptResult> {
    const c = await this.mustConcept(projectId, conceptId)
    if (c.nodeType === 'group') {
      throw new Error('目录节点不支持在此删除（目录承载知识分类层级）')
    }

    // 先删从属数据、最后删概念行（中途失败留下的是"没有讲义/笔记的空概念"，仍可见可再删）
    const relations = await this.relations.deleteByConcept(projectId, conceptId)
    const cards = await this.cards.deleteByConcept(projectId, conceptId)
    const notes = await this.notes.deleteByConcept(projectId, conceptId)
    const questions = await this.questions.deleteByConcept(projectId, conceptId)
    await this.masteryLogs.deleteByConcept(projectId, conceptId)
    await this.conceptLogs.deleteByConcept(projectId, conceptId)
    await this.concepts.deleteById(conceptId)

    logger.info(
      `[graph] deleteConcept space=${projectId} concept=${conceptId} name=${c.name} ` +
        `边=${relations} 讲义=${cards} 笔记=${notes} 问答=${questions}`,
    )
    return { conceptId, relations, cards, notes, questions }
  }

  // ==================== 拆分（知识点 → 一层分支 + 子知识点；2026-10-05 用户需求） ====================

  /**
   * 把一个知识点拆细一层：原知识点**就地转成分支目录**（树位置不变，group 不再承载
   * 讲义/掌握度），录入的子知识点落在该分支下、各自独立研究讲义。
   *
   * 数据处理口径（确认框已向用户写明）：
   * - 前置边（X → 原知识点）：**自动继承**——为每个子知识点建一条已确认前置边，原边删除；
   *   原声明的 attrs.prerequisites 名单同步复制给每个子知识点；
   * - 其他关系边（related、原知识点作为前置的出边等）：语义随拆分失效，删除并计数回传
   *   （UI 提示可回知识全景复核补建）；
   * - 总览讲义（含版本）/笔记/问答/掌握度与变更日志：退役删除并计数（拆分正是要替换
   *   那份大而全的讲义；确认框提示，删除量进结果回传）。
   */
  async splitConceptIntoBranch(projectId: string, conceptId: string, input: SplitConceptInput): Promise<DlSplitConceptResult> {
    const c = await this.mustConcept(projectId, conceptId)
    if (c.nodeType === 'group') throw new Error('目录节点不能再拆分（它已经是分类层级）')

    const branchName = String(input.branchName ?? '').trim() || c.name
    const children = (Array.isArray(input.children) ? input.children : [])
      .map((x) => ({
        name: String((x as { name?: unknown })?.name ?? '').trim(),
        definitionShort: String((x as { definitionShort?: unknown })?.definitionShort ?? '').trim() || null,
        prerequisites: Array.isArray((x as { prerequisites?: unknown })?.prerequisites)
          ? ((x as { prerequisites?: unknown[] }).prerequisites ?? []).map((p) => String(p ?? '').trim()).filter(Boolean)
          : [],
      }))
      .filter((x) => x.name)
    if (!children.length) throw new Error('至少要拆出一个子知识点')
    const seen = new Set<string>()
    for (const x of children) {
      if (seen.has(x.name)) throw new Error(`子知识点名称重复：${x.name}`)
      seen.add(x.name)
    }
    // 子知识点间前置（2026-10-06 agent 拆分提案）：只允许引用兄弟名——外部概念语义上
    // 属"原知识点的前置"，已由外部前置继承机制处理；引用自身或未知名字直接拒绝（方案写错了）
    const siblingNames = new Set(children.map((x) => x.name))
    for (const x of children) {
      for (const p of x.prerequisites) {
        if (p === x.name) throw new Error(`子知识点「${x.name}」的前置不能是它自己`)
        if (!siblingNames.has(p)) {
          throw new Error(`子知识点「${x.name}」的前置「${p}」不在本次拆分的子知识点里——兄弟前置只能引用同批拆出的名字（外部前置会自动继承，不用在这里写）`)
        }
      }
    }
    // 兄弟前置若成环，学习路径会死锁（与既有环防护同口径，建边前先验）
    {
      const indeg = new Map<string, number>()
      children.forEach((x) => indeg.set(x.name, x.prerequisites.length))
      const queue = children.filter((x) => x.prerequisites.length === 0).map((x) => x.name)
      let visited = 0
      while (queue.length) {
        const cur = queue.shift() as string
        visited++
        for (const x of children) {
          if (x.prerequisites.includes(cur)) {
            const next = (indeg.get(x.name) ?? 0) - 1
            indeg.set(x.name, next)
            if (next === 0) queue.push(x.name)
          }
        }
      }
      if (visited !== children.length) {
        throw new Error('子知识点之间的前置关系构成环——学习路径不允许循环依赖，请检查拆分方案里的 prerequisites 方向')
      }
    }
    const childSource = input.source === 'material' ? 'material' : 'manual'

    const all = await this.concepts.listByProject(projectId)
    const edges = await this.relations.listByProject(projectId)
    // 原知识点的前置（入向 prerequisite 边）与其余触边
    const incomingPrereq = edges.filter((e) => e.targetId === conceptId && e.relationType === 'prerequisite')
    const otherEdges = edges.filter(
      (e) =>
        (e.sourceId === conceptId || e.targetId === conceptId) &&
        !(e.targetId === conceptId && e.relationType === 'prerequisite'),
    )
    const inheritedNames = [
      ...new Set(
        incomingPrereq
          .map((e) => all.find((x) => x.id === e.sourceId))
          .filter((x): x is DlConceptRow => !!x && x.nodeType !== 'group')
          .map((x) => x.name),
      ),
    ]

    // 1) 先建子知识点（此时父还是知识点行，落库不受影响；分支转换放最后，失败可恢复）
    const created: Array<{ conceptId: string; name: string }> = []
    const childIds: string[] = []
    const idByName = new Map<string, string>()
    for (const child of children) {
      const id = randomUUID()
      idByName.set(child.name, id)
      // attrs 前置声明 = 外部继承前置 + 兄弟前置（图上的边在下面统一落）
      const declared = [...inheritedNames, ...child.prerequisites.filter((p) => p !== child.name)]
      await this.concepts.create({
        id,
        projectId,
        nodeType: 'concept',
        name: child.name,
        parentId: conceptId,
        definitionShort: child.definitionShort,
        researchState: 'unresearched',
        mastery: 'untouched',
        source: childSource,
        attrs: declared.length ? { prerequisites: [...new Set(declared)] } : null,
      })
      created.push({ conceptId: id, name: child.name })
      childIds.push(id)
    }

    // 2) 前置边继承：原前置 → 每个子知识点（用户此前已确认过这些前置，直接落已确认边）
    for (const e of incomingPrereq) {
      for (const cid of childIds) {
        await this.relations.create({
          id: randomUUID(),
          projectId,
          sourceId: e.sourceId,
          targetId: cid,
          relationType: 'prerequisite',
          evidence: `拆分「${c.name}」时自动继承`,
          verified: true,
        })
      }
    }
    // 2b) 兄弟前置边（2026-10-06 agent 拆分提案）：子知识点之间的学习顺序，
    // 随方案经用户确认后落库，直接落已确认边
    let siblingEdgesCreated = 0
    for (const child of children) {
      for (const p of child.prerequisites) {
        const sourceId = idByName.get(p)
        const targetId = idByName.get(child.name)
        if (!sourceId || !targetId || sourceId === targetId) continue
        await this.relations.create({
          id: randomUUID(),
          projectId,
          sourceId,
          targetId,
          relationType: 'prerequisite',
          evidence: `拆分「${c.name}」时按方案声明的子知识点顺序`,
          verified: true,
        })
        siblingEdgesCreated++
      }
    }

    // 3) 清掉原知识点的全部触边（前置原边已被继承替代；其余边语义失效）
    await this.relations.deleteByConcept(projectId, conceptId)

    // 4) 从属数据退役（总览讲义/笔记/问答/日志——group 不再承载，留着即不可达死数据）
    const removedCards = await this.cards.deleteByConcept(projectId, conceptId)
    const removedNotes = await this.notes.deleteByConcept(projectId, conceptId)
    const removedQuestions = await this.questions.deleteByConcept(projectId, conceptId)
    await this.masteryLogs.deleteByConcept(projectId, conceptId)
    await this.conceptLogs.deleteByConcept(projectId, conceptId)

    // 5) 原知识点就地转成分支目录（树位置/名称保留；掌握度与讲义指针一并清掉）
    const attrs: Record<string, unknown> = { ...(c.attrs ?? {}) }
    delete attrs.prerequisites
    delete attrs.confusedCount
    delete attrs.confusedSections
    await this.concepts.patch(conceptId, {
      nodeType: 'group',
      name: branchName,
      attrs,
      researchState: 'unresearched',
      mastery: 'untouched',
      cardId: null,
    })

    logger.info(
      `[graph] splitConcept space=${projectId} concept=${conceptId} name=${c.name} → 分支「${branchName}」 ` +
        `子知识点=${created.length} 继承前置=${inheritedNames.length} 兄弟前置=${siblingEdgesCreated} 清边=${otherEdges.length} ` +
        `讲义=${removedCards} 笔记=${removedNotes} 问答=${removedQuestions}`,
    )
    return {
      branchId: conceptId,
      branchName,
      children: created,
      removed: { cards: removedCards, notes: removedNotes, questions: removedQuestions },
      inheritedPrereqs: incomingPrereq
        .map((e) => all.find((x) => x.id === e.sourceId))
        .filter((x): x is DlConceptRow => !!x && x.nodeType !== 'group')
        .map((x) => ({ name: x.name, conceptId: x.id })),
      droppedRelations: otherEdges.length,
    }
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
