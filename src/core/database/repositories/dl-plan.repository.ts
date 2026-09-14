/**
 * 领域学习「方案确认」仓库（dl_plan，2026-09-13 用户需求）
 * @module database/repositories/dl-plan.repository
 *
 * 一步骤多版本：draft（待用户确认）/ confirmed（已生效）/ superseded（被取代）。
 * 读取口径：
 * - `getLatest`：最新版（弹窗展示当前草稿）；
 * - `getConfirmed`：已确认并生效的那一版（落库门禁与额度都读它）。
 */

import { type DataSource, type FindOptionsWhere } from 'typeorm'
import { DlPlanEntity } from '../entities/domain-learning/dl-plan.entity'
import type { DlPlanStep, DlPlanStatus, DlPlanView, DlPlanUnderstanding, DlPlanSyllabus } from '@shared/types/domain-learning.types'
import { BaseRepository } from '../base-repository'

/** dl_plan 行 DTO（payload 已解析为对象） */
export interface DlPlanRow {
  id: string
  userId: string | null
  projectId: string
  step: DlPlanStep
  status: DlPlanStatus
  revision: number
  payload: unknown
  feedback: string | null
  createdAt: Date | null
  updatedAt: Date | null
}

export type DlPlanPatch = Partial<{
  status: DlPlanStatus
  payload: unknown
  feedback: string | null
}>

type PlanWhere = FindOptionsWhere<DlPlanEntity>

function safeParse(json: string | null): unknown {
  if (!json) return null
  try {
    return JSON.parse(json) as unknown
  } catch {
    return null
  }
}

export class DlPlanRepository extends BaseRepository<DlPlanEntity, DlPlanRow> {
  constructor(dataSource: DataSource) {
    super(dataSource, DlPlanEntity)
  }

  async create(input: {
    id: string
    projectId: string
    step: DlPlanStep
    payload: unknown
    revision: number
    feedback?: string | null
    status?: DlPlanStatus
  }): Promise<DlPlanRow> {
    const now = new Date()
    const e = new DlPlanEntity()
    e.id = input.id
    e.userId = null // scoped.insert 注入
    e.projectId = input.projectId
    e.step = input.step
    e.status = input.status ?? 'draft'
    e.revision = input.revision
    e.payload = JSON.stringify(input.payload)
    e.feedback = input.feedback ?? null
    e.createdAt = now
    e.updatedAt = now
    await this.scoped.insert(e)
    return (await this.getById(input.id))!
  }

  async getById(id: string): Promise<DlPlanRow | null> {
    const e = await this.scoped.findOne({ id })
    return e ? this.toDto(e) : null
  }

  /** 某空间某步骤的全部版本（revision 升序） */
  async listVersions(projectId: string, step: DlPlanStep): Promise<DlPlanRow[]> {
    const rows = await this.scoped.find({
      where: { projectId, step } as PlanWhere,
      order: { revision: 'ASC' },
    })
    return this.toDtoList(rows)
  }

  /** 某空间某步骤的最新版（无则 null） */
  async getLatest(projectId: string, step: DlPlanStep): Promise<DlPlanRow | null> {
    const rows = await this.scoped.find({
      where: { projectId, step } as PlanWhere,
      order: { revision: 'DESC' },
      take: 1,
    })
    return rows.length > 0 ? this.toDto(rows[0]) : null
  }

  /** 某空间某步骤已确认并生效的版本 */
  async getConfirmed(projectId: string, step: DlPlanStep): Promise<DlPlanRow | null> {
    const rows = await this.scoped.find({
      where: { projectId, step, status: 'confirmed' } as PlanWhere,
      order: { revision: 'DESC' },
      take: 1,
    })
    return rows.length > 0 ? this.toDto(rows[0]) : null
  }

  /** 把某步的全部 draft 置为 superseded（确认新版本或提交新提案时用） */
  async supersedeDrafts(projectId: string, step: DlPlanStep): Promise<number> {
    const drafts = await this.scoped.find({
      where: { projectId, step, status: 'draft' } as PlanWhere,
    })
    for (const e of drafts) {
      await this.scoped.update({ id: e.id }, { status: 'superseded', updatedAt: new Date() })
    }
    return drafts.length
  }

  /** 把某步已 confirmed 的版本置为 superseded（确认新版本时保留历史但不双生效） */
  async supersedeConfirmed(projectId: string, step: DlPlanStep): Promise<number> {
    const rows = await this.scoped.find({
      where: { projectId, step, status: 'confirmed' } as PlanWhere,
    })
    for (const e of rows) {
      await this.scoped.update({ id: e.id }, { status: 'superseded', updatedAt: new Date() })
    }
    return rows.length
  }

  async patch(id: string, patch: DlPlanPatch): Promise<void> {
    const partial: Partial<DlPlanEntity> = { updatedAt: new Date() }
    if (patch.status !== undefined) partial.status = patch.status
    if (patch.payload !== undefined) partial.payload = JSON.stringify(patch.payload)
    if (patch.feedback !== undefined) partial.feedback = patch.feedback
    await this.scoped.update({ id }, partial)
  }

  protected toDto(e: DlPlanEntity): DlPlanRow {
    return {
      id: e.id,
      userId: e.userId,
      projectId: e.projectId,
      step: e.step as DlPlanStep,
      status: e.status as DlPlanStatus,
      revision: e.revision,
      payload: safeParse(e.payload),
      feedback: e.feedback,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }
  }
}

/** 方案行 → 前端视图（剔 userId/Date，保留 payload 原样） */
export function toDlPlanRevisionView<P>(r: DlPlanRow): {
  id: string
  step: DlPlanStep
  status: DlPlanStatus
  revision: number
  payload: P
  feedback: string | null
  updatedAt: string | null
} {
  return {
    id: r.id,
    step: r.step,
    status: r.status,
    revision: r.revision,
    payload: r.payload as P,
    feedback: r.feedback ?? null,
    updatedAt: r.updatedAt?.toISOString() ?? null,
  }
}

/** 组装空间方案总览（确认弹窗数据源；纯函数，便于直测） */
export function buildDlPlanView(input: {
  spaceId: string
  understanding: DlPlanRow | null
  syllabus: DlPlanRow | null
  confirmedConceptCount: number
}): DlPlanView {
  return {
    spaceId: input.spaceId,
    understanding: input.understanding
      ? toDlPlanRevisionView<DlPlanUnderstanding>(input.understanding)
      : null,
    syllabus: input.syllabus ? toDlPlanRevisionView<DlPlanSyllabus>(input.syllabus) : null,
    understandingConfirmed: input.understanding?.status === 'confirmed',
    syllabusConfirmed: input.syllabus?.status === 'confirmed',
    confirmedConceptCount: input.confirmedConceptCount,
  }
}
