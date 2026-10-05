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
  DlLessonPlanPayload,
  DlPlanSyllabus,
  DlPlanUnderstanding,
  DlPlanView,
} from '@shared/types/domain-learning.types'
import {
  countPlanNodes,
  normalizePlanSyllabus,
  normalizePlanUnderstanding,
  planConceptNames,
  summarizePlanSyllabus,
} from '../rules/learning-plan.rules'
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

/** 空间方案总览（确认弹窗数据源；带 conceptId 时一并返回该概念的讲义方案） */
export async function getDlPlanView(
  db: ICoreDatabaseManager,
  spaceId: string,
  conceptId?: string | null,
): Promise<DlPlanView> {
  const repo = plansOf(db)
  const [understanding, syllabus, confirmed, lesson] = await Promise.all([
    repo.getLatest(spaceId, 'understanding'),
    repo.getLatest(spaceId, 'syllabus'),
    repo.getConfirmed(spaceId, 'syllabus'),
    conceptId ? repo.getLatest(spaceId, 'lesson', conceptId) : Promise.resolve(null),
  ])
  const parsed = confirmed ? normalizePlanSyllabus(confirmed.payload) : null
  return buildDlPlanView({
    spaceId,
    understanding,
    syllabus,
    confirmedConceptCount: parsed?.ok ? planConceptNames(parsed.value).length : 0,
    lesson,
    lessonConceptId: conceptId ?? null,
  })
}

/**
 * 用户确认某一步（可带**编辑后的**载荷：前端勾选增删/调序后的知识体系、改过版式的讲义大纲）。
 * - understanding：确认后才允许提交 syllabus；
 * - syllabus：确认后落库门禁放行（并作为落库额度依据）；
 * - lesson：确认后模型才按规格与区级计划逐区精写（落库时按它校验区集/载体）。
 *
 * 讲义方案（lesson）是**概念级**：退位与确认都按该草案自身的 conceptId 隔离，
 * 不会影响同空间其它概念的讲义方案。
 */
export async function confirmDlPlan(
  db: ICoreDatabaseManager,
  spaceId: string,
  step: 'understanding' | 'syllabus' | 'lesson',
  payload?: unknown,
  feedback?: string | null,
  conceptId?: string | null,
): Promise<{ message: string }> {
  const repo = plansOf(db)
  // lesson 步按概念存：确认时用显式 conceptId（或载荷里带的）定位
  const lessonConceptId = step === 'lesson' ? resolveLessonConceptId(payload, conceptId) : null
  if (step === 'lesson' && !lessonConceptId) {
    throw new Error('确认讲义方案需要 conceptId（讲义是按概念写的）')
  }
  const latest = await repo.getLatest(spaceId, step, lessonConceptId)
  if (!latest) {
    const label = step === 'understanding' ? '诉求理解' : step === 'syllabus' ? '知识体系' : '讲义方案'
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

  // 新版本生效：旧的 draft/confirmed 全部退位（历史留档，不双生效；lesson 按概念隔离）
  await repo.supersedeDrafts(spaceId, step, latest.conceptId)
  await repo.supersedeConfirmed(spaceId, step, latest.conceptId)
  await repo.patch(latest.id, {
    status: 'confirmed',
    payload: nextPayload,
    feedback: feedback ?? latest.feedback ?? null,
  })

  return {
    message:
      step === 'understanding'
        ? `已确认诉求理解${note}——下一步将据此规划知识体系`
        : step === 'syllabus'
          ? `已确认知识体系${note}——现在可以落库知识点与前置关系了`
          : `已确认讲义方案${note}——现在请按区级计划逐区精写正文（每 3 区回读一次规格锁），完成后 dl_save_card 落库`,
  }
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
