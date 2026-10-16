/**
 * 领域共学「方案确认」服务（dl_plan 落库与流转；2026-09-13 用户需求）
 * @module packs/domain-learning/services/dl-plan.service
 *
 * 固定步骤的状态机（一空间一套）：
 *   understanding: draft --用户确认--> confirmed
 *   syllabus:      （必须先有 confirmed understanding）
 *                  draft --用户确认--> confirmed   ← 只有到这一步才允许落库知识点
 *   lesson:        （2026-09-14 讲义流水线；**按概念**一套）
 *                  draft --用户确认--> confirmed   ← 确认后按规格与区级计划逐区精写
 * 每次新提案 revision+1，旧 draft/confirmed 置 superseded（历史可追溯、不双生效）。
 *
 * 与门禁的关系：
 * - `dl_save_concept` 在**规划轮**里会先查 `getConfirmedSyllabus`；没有已确认方案就拒绝；
 * - `dl_save_card`（讲义）会先查 `getConfirmedLessonSpec`：有已确认讲义方案时，
 *   落库区集必须与大纲一致（区名/区序/声明的载体），否则拒绝并给出差异。
 */

import { randomUUID } from 'crypto'
import type { ICoreDatabaseManager } from '@core/database/database-manager.interface'
import { buildDlPlanView, type DlPlanRepository } from '@core/database/repositories/dl-plan.repository'
import type {
  DlConceptSplitPayload,
  DlLessonPlanPayload,
  DlPlanSyllabus,
  DlPlanUnderstanding,
  DlPlanView,
  DlSplitConceptResult,
  DlSyllabusConcept,
} from '@shared/types/domain-learning.types'
import {
  countPlanNodes,
  normalizePlanSyllabus,
  normalizePlanUnderstanding,
  planConceptNames,
  summarizePlanSyllabus,
} from '../rules/learning-plan.rules'
import { normalizeConceptPrereqs } from '../rules/learning-prerequisites.rules'
import { normalizeLessonPlanPayload, summarizeLessonSpec } from '@shared/utils/lesson-spec'
import { DL_SAVE_BUDGET_MAX } from './dl-agent.types'

/** 取仓储（缺省 = 库未初始化，明确报错而不是静默降级） */
function plansOf(db: ICoreDatabaseManager): DlPlanRepository {
  const repo = db.dlPlans
  if (!repo) throw new Error('方案仓储未初始化（dlPlans 为空）')
  return repo
}

/**
 * 提交「诉求理解」草案（流程第 1 步）。
 * 用户确认后模型才能进入第 2 步（知识体系方案）。
 */
export async function proposeDlUnderstanding(
  db: ICoreDatabaseManager,
  spaceId: string,
  raw: unknown,
): Promise<{ planId: string; revision: number; value: DlPlanUnderstanding; message: string }> {
  const repo = plansOf(db)
  const normalized = normalizePlanUnderstanding(raw)
  if (!normalized.ok) throw new Error(`dl_propose_understanding：${normalized.reason}`)
  const latest = await repo.getLatest(spaceId, 'understanding')
  const revision = (latest?.revision ?? 0) + 1
  await repo.supersedeDrafts(spaceId, 'understanding')
  const row = await repo.create({
    id: randomUUID(),
    projectId: spaceId,
    step: 'understanding',
    payload: normalized.value,
    revision,
  })
  return {
    planId: row.id,
    revision,
    value: normalized.value,
    message:
      `已提交「诉求理解」草案（第 ${revision} 版），等待用户在弹窗里确认或调整：` +
      `目标=${normalized.value.goalSummary}；要覆盖=${normalized.value.coverage.join('、')}`,
  }
}

/**
 * 提交「知识体系方案」草案（流程第 2 步）。
 * 前置：诉求理解必须已被用户确认（顺序不可跳——这正是"先对齐再规划"的硬约束）。
 */
export async function proposeDlSyllabus(
  db: ICoreDatabaseManager,
  spaceId: string,
  raw: unknown,
): Promise<{ planId: string; revision: number; value: DlPlanSyllabus; message: string }> {
  const repo = plansOf(db)
  const understanding = await repo.getConfirmed(spaceId, 'understanding')
  if (!understanding) {
    throw new Error(
      'dl_propose_syllabus：诉求理解还没有被用户确认——请先 dl_propose_understanding 提交诉求理解，' +
        '等用户在弹窗里确认（或按用户意见调整后重发），再规划知识体系。顺序不能跳。',
    )
  }
  const normalized = normalizePlanSyllabus(raw)
  if (!normalized.ok) throw new Error(`dl_propose_syllabus：${normalized.reason}`)
  // 规模上限（2026-09-25 D5）：此前 planSaveBudget 会把超额部分静默夹到硬顶，落库轮后半程
  // 逐条 LIMIT 拒绝、只产出半个体系——与其静默缩水，提交时就把超限打回去让模型拆批
  const maxNodes = Math.max(1, DL_SAVE_BUDGET_MAX - 6)
  const nodeCount = countPlanNodes(normalized.value)
  if (nodeCount > maxNodes) {
    throw new Error(
      `dl_propose_syllabus：方案共 ${nodeCount} 个节点（分支+知识点），超出单轮落库上限 ${maxNodes}——` +
        `请拆成两批提交（先主干后分支，或先核心后扩展），或精简到 ${maxNodes} 个以内再提交。`,
    )
  }
  const latest = await repo.getLatest(spaceId, 'syllabus')
  const revision = (latest?.revision ?? 0) + 1
  await repo.supersedeDrafts(spaceId, 'syllabus')
  const row = await repo.create({
    id: randomUUID(),
    projectId: spaceId,
    step: 'syllabus',
    payload: normalized.value,
    revision,
  })
  const changes = normalized.changes.length ? `（${normalized.changes.join('；')}）` : ''
  return {
    planId: row.id,
    revision,
    value: normalized.value,
    message: `已提交「知识体系」草案（第 ${revision} 版，${summarizePlanSyllabus(normalized.value)}）${changes}，等待用户确认后可落库`,
  }
}

/**
 * 提交「讲义设计规格与区级计划」草案（讲义流水线 Plan 阶段；2026-09-14）。
 *
 * 前置：概念存在且属于本空间（讲义是按概念写的）。
 * 与 syllabus 的关系：**不强制**——手工建点的老空间可能没有已确认知识体系，
 * 但讲义质量不能因此打折，故这里只校验概念归属，不校验 syllabus。
 */
export async function proposeDlLessonPlan(
  db: ICoreDatabaseManager,
  spaceId: string,
  conceptId: string,
  raw: unknown,
): Promise<{ planId: string; revision: number; value: DlLessonPlanPayload; message: string }> {
  const repo = plansOf(db)
  const concept = await db.dlConcepts?.getById(conceptId)
  if (!concept || concept.projectId !== spaceId) {
    throw new Error(`dl_propose_lesson_plan：概念不存在或不属于本空间（${conceptId}）`)
  }
  const normalized = normalizeLessonPlanPayload(raw)
  if (!normalized.ok) throw new Error(`dl_propose_lesson_plan：${normalized.reason}`)
  const latest = await repo.getLatest(spaceId, 'lesson', conceptId)
  const revision = (latest?.revision ?? 0) + 1
  await repo.supersedeDrafts(spaceId, 'lesson', conceptId)
  const row = await repo.create({
    id: randomUUID(),
    projectId: spaceId,
    conceptId,
    step: 'lesson',
    payload: normalized.value,
    revision,
  })
  const changes = normalized.changes.length ? `（${normalized.changes.join('；')}）` : ''
  return {
    planId: row.id,
    revision,
    value: normalized.value,
    message:
      `已提交「${concept.name}」的讲义方案（第 ${revision} 版，${normalized.value.essenceType}，` +
      `${summarizeLessonSpec(normalized.value.spec)}）${changes}，` +
      '等待用户在弹窗里确认（可改每区版式或给调整意见）；**确认后再逐区写正文**。',
  }
}

// ==================== 知识点拆分提案（2026-10-06：复杂知识点允许 agent 再拆分） ====================

/**
 * 归一化「知识点拆分方案」载荷（纯校验 + 规范化；不做任何落库动作）。
 * agent 只产方案——用户确认后由系统调 graph 服务执行（`confirmDlPlan` 的 concept-split 分支）。
 */
export async function normalizeConceptSplitPayload(
  db: ICoreDatabaseManager,
  spaceId: string,
  raw: unknown,
): Promise<{ ok: true; value: DlConceptSplitPayload; changes: string[] } | { ok: false; reason: string }> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: '拆分方案必须是对象（含 conceptId / branchName / children）。' }
  }
  const input = raw as Record<string, unknown>
  const conceptId = String(input.conceptId ?? '').trim()
  if (!conceptId) return { ok: false, reason: '拆分方案缺 conceptId——要拆分的是哪个知识点。' }
  const concept = await db.dlConcepts?.getById(conceptId)
  if (!concept || concept.projectId !== spaceId) {
    return { ok: false, reason: `拆分方案里的知识点不存在或不属于本空间（${conceptId}）。` }
  }
  if (concept.nodeType === 'group') {
    return { ok: false, reason: `「${concept.name}」已是分支目录，不能再拆分（要细分请在它下面建知识点）。` }
  }

  const childrenRaw = Array.isArray(input.children) ? input.children : []
  const children: Array<{ name: string; definitionShort: string | null; prerequisites: string[] }> = []
  const seen = new Set<string>()
  for (const item of childrenRaw) {
    const rec = (item ?? {}) as Record<string, unknown>
    const name = String(rec.name ?? '').trim()
    if (!name) continue
    if (seen.has(name)) return { ok: false, reason: `子知识点名称重复：「${name}」。` }
    seen.add(name)
    const prerequisites = Array.isArray(rec.prerequisites)
      ? rec.prerequisites.map((p) => String(p ?? '').trim()).filter(Boolean)
      : []
    children.push({
      name,
      definitionShort: String(rec.definitionShort ?? '').trim() || null,
      prerequisites,
    })
  }
  if (children.length < 2) {
    return { ok: false, reason: '拆分至少要拆出 2 个子知识点——只拆 1 个没有意义（直接修订原讲义即可）。' }
  }

  // 兄弟前置：只允许引用本批子知识点；不许自指；不许成环（学习路径不能循环依赖）
  const names = new Set(children.map((c) => c.name))
  for (const c of children) {
    for (const p of c.prerequisites) {
      if (p === c.name) return { ok: false, reason: `子知识点「${c.name}」的前置不能是它自己。` }
      if (!names.has(p)) {
        return {
          ok: false,
          reason:
            `子知识点「${c.name}」的前置「${p}」不在本次拆分的子知识点里——兄弟前置只能引用同批拆出的名字` +
            `（原知识点的外部前置会自动继承给每个子知识点，不用在这里写）。`,
        }
      }
    }
  }
  const indeg = new Map(children.map((c) => [c.name, c.prerequisites.length]))
  const queue = children.filter((c) => c.prerequisites.length === 0).map((c) => c.name)
  let visited = 0
  while (queue.length) {
    const cur = queue.shift() as string
    visited++
    for (const c of children) {
      if (!c.prerequisites.includes(cur)) continue
      const next = (indeg.get(c.name) ?? 0) - 1
      indeg.set(c.name, next)
      if (next === 0) queue.push(c.name)
    }
  }
  if (visited !== children.length) {
    return { ok: false, reason: '子知识点之间的前置关系构成环——学习路径不允许循环依赖，请检查 prerequisites 方向。' }
  }

  return {
    ok: true,
    value: {
      conceptId,
      branchName: String(input.branchName ?? '').trim() || concept.name,
      children,
      reason: String(input.reason ?? '').trim() || null,
    },
    changes: [],
  }
}

/**
 * 提交「知识点拆分方案」草案（研究/规划中发现知识点粒度过大时的提案入口）。
 * 与 lesson 同构：按概念存 plan；**确认时系统直接执行拆分**（确定性数据操作，不经 agent）。
 */
export async function proposeDlConceptSplit(
  db: ICoreDatabaseManager,
  spaceId: string,
  conceptId: string,
  raw: unknown,
): Promise<{ planId: string; revision: number; value: DlConceptSplitPayload; message: string }> {
  const repo = plansOf(db)
  const concept = await db.dlConcepts?.getById(conceptId)
  if (!concept || concept.projectId !== spaceId) {
    throw new Error(`dl_propose_concept_split：概念不存在或不属于本空间（${conceptId}）`)
  }
  // 载荷里的 conceptId 与目标概念不一致 → 拒绝（拆的是哪个点必须唯一确定）
  const rawConceptId = String((raw as { conceptId?: unknown } | undefined)?.conceptId ?? '').trim()
  if (rawConceptId && rawConceptId !== conceptId) {
    throw new Error(
      `dl_propose_concept_split：载荷里的 conceptId（${rawConceptId}）与目标概念（${conceptId}）不一致——本轮研究的是「${concept.name}」，只能拆它。`,
    )
  }
  const normalized = await normalizeConceptSplitPayload(db, spaceId, { ...(raw as object), conceptId })
  if (!normalized.ok) throw new Error(`dl_propose_concept_split：${normalized.reason}`)

  const latest = await repo.getLatest(spaceId, 'concept-split', conceptId)
  const revision = (latest?.revision ?? 0) + 1
  await repo.supersedeDrafts(spaceId, 'concept-split', conceptId)
  const row = await repo.create({
    id: randomUUID(),
    projectId: spaceId,
    conceptId,
    step: 'concept-split',
    payload: normalized.value,
    revision,
  })
  return {
    planId: row.id,
    revision,
    value: normalized.value,
    message:
      `已提交「${concept.name}」的拆分方案（第 ${revision} 版：拆成 ${normalized.value.children.length} 个子知识点），` +
      '等待用户在弹窗里确认——**确认后系统会就地把该知识点转成分支目录**（原讲义/笔记/问答退役，' +
      '外部前置自动继承给每个子知识点）。本轮不要继续为原知识点写讲义。',
  }
}

/** 空间方案总览（确认弹窗数据源；带 conceptId 时一并返回该概念的讲义方案与拆分方案） */
export async function getDlPlanView(
  db: ICoreDatabaseManager,
  spaceId: string,
  conceptId?: string | null,
): Promise<DlPlanView> {
  const repo = plansOf(db)
  const [understanding, syllabus, confirmed, lesson, conceptSplit] = await Promise.all([
    repo.getLatest(spaceId, 'understanding'),
    repo.getLatest(spaceId, 'syllabus'),
    repo.getConfirmed(spaceId, 'syllabus'),
    conceptId ? repo.getLatest(spaceId, 'lesson', conceptId) : Promise.resolve(null),
    conceptId ? repo.getLatest(spaceId, 'concept-split', conceptId) : Promise.resolve(null),
  ])
  const parsed = confirmed ? normalizePlanSyllabus(confirmed.payload) : null
  return buildDlPlanView({
    spaceId,
    understanding,
    syllabus,
    confirmedConceptCount: parsed?.ok ? planConceptNames(parsed.value).length : 0,
    lesson,
    lessonConceptId: conceptId ?? null,
    conceptSplit,
  })
}

/**
 * 用户确认某一步（可带**编辑后的**载荷：前端勾选增删/调序后的知识体系、改过版式的讲义大纲）。
 * - understanding：确认后才允许提交 syllabus；
 * - syllabus：确认后落库门禁放行（并作为落库额度依据）；
 * - lesson：确认后模型才按规格与区级计划逐区精写（落库时按它校验区集/载体）；
 * - concept-split：**确认即执行拆分**（调 graph 服务就地把原知识点转成分支目录 + 建子知识点；
 *   确定性数据操作不经 agent——与 syllabus 确认即落骨架同一口径）。
 *
 * 讲义方案（lesson）与拆分方案（concept-split）都是**概念级**：退位与确认都按该草案自身的
 * conceptId 隔离，不会影响同空间其它概念的方案。
 */
export async function confirmDlPlan(
  db: ICoreDatabaseManager,
  spaceId: string,
  step: 'understanding' | 'syllabus' | 'lesson' | 'concept-split',
  payload?: unknown,
  feedback?: string | null,
  conceptId?: string | null,
  deps?: { splitConcept?: (projectId: string, conceptId: string, input: unknown) => Promise<DlSplitConceptResult> },
): Promise<{ message: string }> {
  const repo = plansOf(db)
  // lesson / concept-split 步按概念存：确认时用显式 conceptId（或载荷里带的）定位
  const scopedConceptId =
    step === 'lesson'
      ? resolveLessonConceptId(payload, conceptId)
      : step === 'concept-split'
        ? resolveConceptSplitConceptId(payload, conceptId)
        : null
  if (step === 'lesson' && !scopedConceptId) {
    throw new Error('确认讲义方案需要 conceptId（讲义是按概念写的）')
  }
  if (step === 'concept-split' && !scopedConceptId) {
    throw new Error('确认拆分方案需要 conceptId（拆的是哪个知识点必须唯一确定）')
  }
  const latest = await repo.getLatest(spaceId, step, scopedConceptId)
  if (!latest) {
    const label =
      step === 'understanding'
        ? '诉求理解'
        : step === 'syllabus'
          ? '知识体系'
          : step === 'lesson'
            ? '讲义方案'
            : '拆分方案'
    throw new Error(`还没有待确认的${label}草案`)
  }
  if (latest.status === 'confirmed' && payload === undefined) {
    return { message: '该方案已是确认状态，无需重复确认' }
  }
  if (step === 'syllabus') {
    const confirmedUnderstanding = await repo.getConfirmed(spaceId, 'understanding')
    if (!confirmedUnderstanding) {
      throw new Error('请先确认「诉求理解」，再确认知识体系（顺序不能跳）')
    }
  }

  let nextPayload = latest.payload
  let note = ''
  if (payload !== undefined) {
    if (step === 'concept-split') {
      const normalized = await normalizeConceptSplitPayload(db, spaceId, payload)
      if (!normalized.ok) throw new Error(`确认失败：${normalized.reason}`)
      nextPayload = normalized.value
      note = `（按你的调整，拆成 ${normalized.value.children.length} 个子知识点）`
    } else {
      const normalized =
        step === 'understanding'
          ? normalizePlanUnderstanding(payload)
          : step === 'syllabus'
            ? normalizePlanSyllabus(payload)
            : normalizeLessonPlanPayload(unwrapLessonPayload(payload))
      if (!normalized.ok) throw new Error(`确认失败：${normalized.reason}`)
      nextPayload = normalized.value
      note =
        step === 'syllabus'
          ? `（按你的勾选/排序，${summarizePlanSyllabus(normalized.value as DlPlanSyllabus)}）`
          : step === 'lesson'
            ? `（按你改后的区级计划，${summarizeLessonSpec((normalized.value as DlLessonPlanPayload).spec)}）`
            : '（按你的修改）'
    }
  }

  // 新版本生效：旧的 draft/confirmed 全部退位（历史留档，不双生效；概念级步骤按概念隔离）
  await repo.supersedeDrafts(spaceId, step, latest.conceptId)
  await repo.supersedeConfirmed(spaceId, step, latest.conceptId)
  await repo.patch(latest.id, {
    status: 'confirmed',
    payload: nextPayload,
    feedback: feedback ?? latest.feedback ?? null,
  })

  // 知识体系确认后：骨架（分支目录 + 知识点）由系统确定性落库，不再依赖 agent 落库轮的步数预算
  let backfillNote = ''
  if (step === 'syllabus') {
    try {
      const r = await backfillConfirmedSyllabus(db, spaceId, nextPayload as DlPlanSyllabus)
      backfillNote =
        `；骨架已直接落库（分支目录 ${r.groupsCreated} 个、知识点 ${r.conceptsCreated} 个` +
        `${r.skipped ? `，${r.skipped} 个已存在跳过` : ''}）`
    } catch (e) {
      backfillNote = `；骨架自动落库失败（${e instanceof Error ? e.message : String(e)}）——落库轮会按方案补齐`
    }
  }

  // 拆分方案确认后：立即执行拆分（graph 服务；原知识点转分支、外部前置继承、兄弟前置落边）
  if (step === 'concept-split') {
    const splitPayload = nextPayload as DlConceptSplitPayload
    const concept = await db.dlConcepts?.getById(splitPayload.conceptId)
    const split = await (deps?.splitConcept
      ? deps.splitConcept(spaceId, splitPayload.conceptId, {
          branchName: splitPayload.branchName,
          children: splitPayload.children,
          source: 'material',
        })
      : executeConceptSplitFallback(db, spaceId, splitPayload))
    const retired = split.removed
    backfillNote =
      `；已执行拆分：「${concept?.name ?? splitPayload.conceptId}」转成分支「${split.branchName}」，` +
      `新建子知识点 ${split.children.length} 个（${split.children.map((c) => c.name).join('、')}）` +
      `${retired.cards ? `，原讲义 ${retired.cards} 份退役` : ''}` +
      `——请让 agent 依次为子知识点出讲义`
  }

  return {
    message:
      step === 'understanding'
        ? `已确认诉求理解${note}——下一步将据此规划知识体系`
        : step === 'syllabus'
          ? `已确认知识体系${note}${backfillNote}——接下来补前置关系、出首份讲义`
          : step === 'lesson'
            ? `已确认讲义方案${note}——现在请按区级计划逐区精写正文（每 3 区回读一次规格锁），完成后 dl_save_card 落库`
            : `已确认拆分方案${note}${backfillNote}`,
  }
}

/**
 * 拆分执行兜底：调用方没注入 graph 服务时，用 db 的仓储临时构造一个
 * LearningGraphService（无状态服务，构造廉价——plan 确认路径不需要 handler 的单例）。
 */
async function executeConceptSplitFallback(
  db: ICoreDatabaseManager,
  spaceId: string,
  payload: DlConceptSplitPayload,
): Promise<DlSplitConceptResult> {
  if (!db.dataSource) throw new Error('数据库未就绪（dataSource 为空）——无法执行拆分')
  const { DlConceptRepository } = await import('@core/database/repositories/dl-concept.repository')
  const { DlRelationRepository } = await import('@core/database/repositories/dl-relation.repository')
  const { DlMasteryLogRepository } = await import('@core/database/repositories/dl-mastery-log.repository')
  const { DlCardRepository } = await import('@core/database/repositories/dl-card.repository')
  const { DlNoteRepository } = await import('@core/database/repositories/dl-note.repository')
  const { DlQuestionRepository } = await import('@core/database/repositories/dl-question.repository')
  const { DlConceptLogRepository } = await import('@core/database/repositories/dl-concept-log.repository')
  const { LearningGraphService } = await import('./learning-graph.service')
  const graph = new LearningGraphService(
    new DlConceptRepository(db.dataSource),
    new DlRelationRepository(db.dataSource),
    new DlMasteryLogRepository(db.dataSource),
    new DlCardRepository(db.dataSource),
    new DlNoteRepository(db.dataSource),
    new DlQuestionRepository(db.dataSource),
    new DlConceptLogRepository(db.dataSource),
  )
  return graph.splitConceptIntoBranch(spaceId, payload.conceptId, {
    branchName: payload.branchName,
    children: payload.children,
    source: 'material',
  })
}

/** concept-split 步定位用的概念 id：显式传入优先，其次载荷里带的 */
function resolveConceptSplitConceptId(payload: unknown, explicit?: string | null): string | null {
  const given = typeof explicit === 'string' ? explicit.trim() : ''
  if (given) return given
  const fromPayload = (payload as { conceptId?: unknown } | undefined)?.conceptId
  return typeof fromPayload === 'string' && fromPayload.trim() ? fromPayload.trim() : null
}

/**
 * 把**已确认**的知识体系骨架（分支目录 + 知识点 + 前置声明）确定性写进 dl_concept。
 *
 * 2026-10-05 复盘（科幻空间事故）：此前骨架完全靠确认后的 agent 落库轮逐条
 * dl_save_concept，该轮以 research 档步数（12）运行、前几步又被网络调研占掉，
 * 13 分支只落了前 6 个的 37/80 个知识点就被 max_steps 掐断，后半分支永久空置。
 * 骨架是纯数据搬运（方案里已有名字/定义/层级/前置），不该依赖模型步数预算——
 * 确认时由系统一次写完；agent 落库轮只负责富化（前置边、讲义、书籍建议）。
 *
 * 幂等（可重跑，用于修复被掐断的存量空间）：同父同名已存在 → 只补缺失的
 * definitionShort / attrs.prerequisites，不重复建；分支目录挂领域根 group
 *（缺失则按建空间命名约定补建），rootConcepts 落根层（parentId=null）。
 * 空间内其他位置的同名概念不劫持也不重建（与 dl_save_concept 的 skipped 语义一致）。
 */
export async function backfillConfirmedSyllabus(
  db: ICoreDatabaseManager,
  spaceId: string,
  syllabus: DlPlanSyllabus,
): Promise<{ groupsCreated: number; conceptsCreated: number; skipped: number }> {
  if (!db.dlConcepts) throw new Error('概念仓储未初始化（dlConcepts 为空）')
  const concepts = db.dlConcepts

  let rows = await concepts.listByProject(spaceId)
  // 领域根 group（建空间时创建；测试/异常空间缺失则按同样约定补建）
  let root = rows.find((r) => r.nodeType === 'group' && !r.parentId)
  if (!root) {
    const space = await db.dlProjects?.getById(spaceId)
    root = await concepts.create({
      id: randomUUID(),
      projectId: spaceId,
      nodeType: 'group',
      name: `${space?.name ?? spaceId}·领域根`,
      parentId: null,
      definitionShort: space?.goal ?? null,
      source: 'ai_verified',
    })
    rows = [...rows, root]
  }

  let groupsCreated = 0
  let conceptsCreated = 0
  let skipped = 0

  /** 落一个知识点：同父同名幂等（只补缺），异父同名跳过不重建 */
  const upsertConcept = async (
    c: DlSyllabusConcept,
    parentId: string | null,
  ): Promise<void> => {
    const name = c.name.trim()
    if (!name) return
    const existing = rows.find((r) => r.name === name && r.parentId === parentId)
    if (existing) {
      const declared = normalizeConceptPrereqs(c.prerequisites, name)
      const patch: {
        definitionShort?: string
        attrs?: Record<string, unknown>
      } = {}
      if (!existing.definitionShort && c.definitionShort) patch.definitionShort = c.definitionShort
      const attrs = { ...(existing.attrs ?? {}) }
      if (declared.length && !Array.isArray(attrs.prerequisites)) {
        attrs.prerequisites = declared
        patch.attrs = attrs
      }
      if (Object.keys(patch).length) await concepts.patch(existing.id, patch)
      skipped++
      return
    }
    const sameNameElsewhere = rows.find((r) => r.name === name)
    if (sameNameElsewhere) {
      skipped++
      return
    }
    const declared = normalizeConceptPrereqs(c.prerequisites, name)
    const attrs: Record<string, unknown> = {}
    if (c.layer != null) attrs.layer = c.layer
    if (declared.length) attrs.prerequisites = declared
    const created = await concepts.create({
      id: randomUUID(),
      projectId: spaceId,
      nodeType: c.nodeType === 'group' ? 'group' : (c.nodeType ?? 'concept'),
      name,
      parentId,
      definitionShort: c.definitionShort ?? null,
      researchState: 'extracted',
      source: 'ai_verified',
      attrs: Object.keys(attrs).length ? attrs : null,
    })
    rows = [...rows, created]
    conceptsCreated++
  }

  for (const branch of syllabus.branches ?? []) {
    const branchName = branch.name?.trim()
    if (!branchName) continue
    let group = rows.find((r) => r.name === branchName && r.parentId === root!.id)
    if (!group) {
      const sameName = rows.find((r) => r.name === branchName)
      if (sameName) {
        skipped++
      } else {
        group = await concepts.create({
          id: randomUUID(),
          projectId: spaceId,
          nodeType: 'group',
          name: branchName,
          parentId: root!.id,
          definitionShort: branch.definitionShort ?? null,
          source: 'ai_verified',
        })
        rows = [...rows, group]
        groupsCreated++
      }
    }
    if (!group) continue
    if (!group.definitionShort && branch.definitionShort) {
      await concepts.patch(group.id, { definitionShort: branch.definitionShort })
    }
    for (const c of branch.concepts ?? []) await upsertConcept(c, group.id)
  }
  for (const c of syllabus.rootConcepts ?? []) await upsertConcept(c, null)

  return { groupsCreated, conceptsCreated, skipped }
}


/** lesson 步定位用的概念 id：显式传入优先，其次载荷里带的 conceptId */
function resolveLessonConceptId(payload: unknown, explicit?: string | null): string | null {
  const given = typeof explicit === 'string' ? explicit.trim() : ''
  if (given) return given
  const fromPayload = (payload as { conceptId?: unknown } | undefined)?.conceptId
  return typeof fromPayload === 'string' && fromPayload.trim() ? fromPayload.trim() : null
}

/**
 * 确认载荷解包：前端可能把 conceptId 与规格放在同一层（`{conceptId, essenceType, spec}`），
 * 也可能直接给 `{essenceType, spec}`——两种都认，不让 UI 细节泄漏进契约层。
 */
function unwrapLessonPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload
  const rec = payload as Record<string, unknown>
  return 'essenceType' in rec ? rec : (rec.lesson ?? rec)
}

/** 已确认的知识体系方案（落库门禁与额度依据；无/不合法 → null） */
export async function getConfirmedSyllabus(
  db: ICoreDatabaseManager,
  spaceId: string,
): Promise<DlPlanSyllabus | null> {
  const repo = plansOf(db)
  const row = await repo.getConfirmed(spaceId, 'syllabus')
  if (!row) return null
  const normalized = normalizePlanSyllabus(row.payload)
  return normalized.ok ? normalized.value : null
}

/**
 * 已确认的**讲义方案**（某概念；落库门禁与写作锁依据；无/不合法 → null）。
 * 这是「Plan 与 Do 同一份口径」的抓手：dl_save_card 按它校验区集/区序/声明载体，
 * 写作轮把它压成规格锁注入提示词。
 */
export async function getConfirmedLessonSpec(
  db: ICoreDatabaseManager,
  spaceId: string,
  conceptId: string,
): Promise<DlLessonPlanPayload | null> {
  const repo = plansOf(db)
  const row = await repo.getConfirmed(spaceId, 'lesson', conceptId)
  if (!row) return null
  const normalized = normalizeLessonPlanPayload(row.payload)
  return normalized.ok ? normalized.value : null
}
