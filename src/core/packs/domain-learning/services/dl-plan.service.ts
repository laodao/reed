/**
 * 领域共学「方案确认」服务（dl_plan 落库与流转；2026-09-13 用户需求）
 * @module packs/domain-learning/services/dl-plan.service
 *
 * 固定步骤的状态机（一空间一套）：
 *   understanding: draft --用户确认--> confirmed
 *   syllabus:      （必须先有 confirmed understanding）
 *                  draft --用户确认--> confirmed   ← 只有到这一步才允许落库知识点
 * 每次新提案 revision+1，旧 draft/confirmed 置 superseded（历史可追溯、不双生效）。
 *
 * 与门禁的关系：`dl_save_concept` 在**规划轮**里会先查 `getConfirmedSyllabus`；
 * 没有已确认方案就拒绝（见 dl-agent-actions 的 saveConcept 门禁）。
 */

import { randomUUID } from 'crypto'
import type { ICoreDatabaseManager } from '@core/database/database-manager.interface'
import { buildDlPlanView, type DlPlanRepository } from '@core/database/repositories/dl-plan.repository'
import type { DlPlanSyllabus, DlPlanUnderstanding, DlPlanView } from '@shared/types/domain-learning.types'
import {
  normalizePlanSyllabus,
  normalizePlanUnderstanding,
  planConceptNames,
  summarizePlanSyllabus,
} from '../rules/learning-plan.rules'

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

/** 空间方案总览（确认弹窗数据源） */
export async function getDlPlanView(db: ICoreDatabaseManager, spaceId: string): Promise<DlPlanView> {
  const repo = plansOf(db)
  const [understanding, syllabus, confirmed] = await Promise.all([
    repo.getLatest(spaceId, 'understanding'),
    repo.getLatest(spaceId, 'syllabus'),
    repo.getConfirmed(spaceId, 'syllabus'),
  ])
  const parsed = confirmed ? normalizePlanSyllabus(confirmed.payload) : null
  return buildDlPlanView({
    spaceId,
    understanding,
    syllabus,
    confirmedConceptCount: parsed?.ok ? planConceptNames(parsed.value).length : 0,
  })
}

/**
 * 用户确认某一步（可带**编辑后的**载荷：前端勾选增删/调序后的知识体系）。
 * - understanding：确认后才允许提交 syllabus；
 * - syllabus：确认后落库门禁放行（并作为落库额度依据）。
 */
export async function confirmDlPlan(
  db: ICoreDatabaseManager,
  spaceId: string,
  step: 'understanding' | 'syllabus',
  payload?: unknown,
  feedback?: string | null,
): Promise<{ message: string }> {
  const repo = plansOf(db)
  const latest = await repo.getLatest(spaceId, step)
  if (!latest) throw new Error(`还没有待确认的${step === 'understanding' ? '诉求理解' : '知识体系'}草案`)
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
      step === 'understanding' ? normalizePlanUnderstanding(payload) : normalizePlanSyllabus(payload)
    if (!normalized.ok) throw new Error(`确认失败：${normalized.reason}`)
    nextPayload = normalized.value
    note = step === 'syllabus' ? `（按你的勾选/排序，${summarizePlanSyllabus(normalized.value as DlPlanSyllabus)}）` : '（按你的修改）'
  }

  // 新版本生效：旧的 draft/confirmed 全部退位（历史留档，不双生效）
  await repo.supersedeDrafts(spaceId, step)
  await repo.supersedeConfirmed(spaceId, step)
  await repo.patch(latest.id, {
    status: 'confirmed',
    payload: nextPayload,
    feedback: feedback ?? latest.feedback ?? null,
  })

  return {
    message:
      step === 'understanding'
        ? `已确认诉求理解${note}——下一步将据此规划知识体系`
        : `已确认知识体系${note}——现在可以落库知识点与前置关系了`,
  }
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
