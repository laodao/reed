/**
 * 工作流运行仓库
 * @module database/repositories/workflow-run.repository
 *
 * 维护 workflow_runs 表：运行实例的生命周期状态、图快照、触发上下文、统计。
 * 状态迁移由引擎驱动，仓库只做存取（不校验状态机——引擎负责）。
 *
 * 多租户：继承 BaseRepository，user_id 自动注入。
 * ⚠️ scanBootRecoverable 是跨租户裸扫描（boot 阶段无用户上下文），
 *    结果必须按 userId 逐个 runWithUserAsync 后再由引擎处理。
 */

import { In, type DataSource, type FindOptionsWhere } from 'typeorm'
import type {
  WorkflowGraph,
  WorkflowRunStatus,
  WorkflowTriggerType,
} from '@shared/types/workflow.types'
import { WorkflowRunEntity } from '../entities/workflow-run.entity'
import { BaseRepository } from '../base-repository'

/** 运行统计 */
export interface WorkflowRunStats {
  totalNodes: number
  doneNodes: number
  failedNodes: number
  recoveredNodes: number
}

/** 运行 DTO（JSON 列已解析；userId 供跨租户扫描后按用户重建上下文） */
export interface WorkflowRunRecord {
  id: string
  userId: string | null
  definitionId: string
  definitionVersion: number
  graphSnapshot: WorkflowGraph | null
  triggerType: WorkflowTriggerType
  triggerInfo: Record<string, unknown> | null
  startInputs: Record<string, unknown> | null
  status: WorkflowRunStatus
  skipReason: string | null
  error: string | null
  startedAt: Date | null
  finishedAt: Date | null
  durationMs: number | null
  timeoutAt: Date | null
  stats: WorkflowRunStats | null
  cancelRequestedAt: Date | null
  resumedFromRunId: string | null
  createdAt: Date | null
  updatedAt: Date | null
}

/** 创建入参 */
export interface CreateWorkflowRunInput {
  definitionId: string
  definitionVersion: number
  graphSnapshot: WorkflowGraph
  triggerType: WorkflowTriggerType
  triggerInfo?: Record<string, unknown> | null
  startInputs?: Record<string, unknown> | null
  status: WorkflowRunStatus
  timeoutAt?: Date | null
  resumedFromRunId?: string | null
}

/** 更新入参（浅合并） */
export interface UpdateWorkflowRunInput {
  status?: WorkflowRunStatus
  skipReason?: string | null
  error?: string | null
  startedAt?: Date | null
  finishedAt?: Date | null
  durationMs?: number | null
  timeoutAt?: Date | null
  stats?: WorkflowRunStats | null
  cancelRequestedAt?: Date | null
}

/** 占用同工作流互斥的状态集合（新触发命中即跳过） */
export const MUTEX_RUN_STATUSES: readonly WorkflowRunStatus[] = [
  'pending',
  'running',
  'waiting_review',
]

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    console.warn('[WorkflowRunRepository] JSON 列解析失败，降级处理')
    return fallback
  }
}

export class WorkflowRunRepository extends BaseRepository<WorkflowRunEntity, WorkflowRunRecord> {
  constructor(dataSource: DataSource) {
    super(dataSource, WorkflowRunEntity)
  }

  protected toDto(e: WorkflowRunEntity): WorkflowRunRecord {
    return {
      id: e.id,
      userId: e.userId,
      definitionId: e.definitionId,
      definitionVersion: e.definitionVersion,
      graphSnapshot: safeParse<WorkflowGraph | null>(e.graphSnapshot, null),
      triggerType: e.triggerType as WorkflowTriggerType,
      triggerInfo: safeParse<Record<string, unknown> | null>(e.triggerInfo, null),
      startInputs: safeParse<Record<string, unknown> | null>(e.startInputs, null),
      status: e.status as WorkflowRunStatus,
      skipReason: e.skipReason,
      error: e.error,
      startedAt: e.startedAt,
      finishedAt: e.finishedAt,
      durationMs: e.durationMs,
      timeoutAt: e.timeoutAt,
      stats: safeParse<WorkflowRunStats | null>(e.stats, null),
      cancelRequestedAt: e.cancelRequestedAt,
      resumedFromRunId: e.resumedFromRunId,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }
  }

  async create(data: CreateWorkflowRunInput): Promise<WorkflowRunRecord> {
    const now = new Date()
    const entity = await this.scoped.save({
      id: this.generateId(),
      definitionId: data.definitionId,
      definitionVersion: data.definitionVersion,
      graphSnapshot: JSON.stringify(data.graphSnapshot),
      triggerType: data.triggerType,
      triggerInfo: data.triggerInfo ? JSON.stringify(data.triggerInfo) : null,
      startInputs: data.startInputs ? JSON.stringify(data.startInputs) : null,
      status: data.status,
      skipReason: null,
      error: null,
      startedAt: data.status === 'running' ? now : null,
      finishedAt: null,
      durationMs: null,
      timeoutAt: data.timeoutAt ?? null,
      stats: null,
      cancelRequestedAt: null,
      resumedFromRunId: data.resumedFromRunId ?? null,
      createdAt: now,
      updatedAt: now,
    } as Partial<WorkflowRunEntity>)
    return this.toDto(entity as WorkflowRunEntity)
  }

  async getById(id: string): Promise<WorkflowRunRecord | null> {
    const e = await this.scoped.findOne({ id } as FindOptionsWhere<WorkflowRunEntity>)
    return e ? this.toDto(e) : null
  }

  async update(id: string, patch: UpdateWorkflowRunInput): Promise<WorkflowRunRecord | null> {
    const partial: Partial<WorkflowRunEntity> = { updatedAt: new Date() }
    if (patch.status !== undefined) partial.status = patch.status
    if (patch.skipReason !== undefined) partial.skipReason = patch.skipReason
    if (patch.error !== undefined) partial.error = patch.error
    if (patch.startedAt !== undefined) partial.startedAt = patch.startedAt
    if (patch.finishedAt !== undefined) partial.finishedAt = patch.finishedAt
    if (patch.durationMs !== undefined) partial.durationMs = patch.durationMs
    if (patch.timeoutAt !== undefined) partial.timeoutAt = patch.timeoutAt
    if (patch.stats !== undefined) {
      partial.stats = patch.stats ? JSON.stringify(patch.stats) : null
    }
    if (patch.cancelRequestedAt !== undefined) partial.cancelRequestedAt = patch.cancelRequestedAt
    await this.scoped.update({ id } as FindOptionsWhere<WorkflowRunEntity>, partial)
    return this.getById(id)
  }

  /** 同工作流当前占用互斥的运行（pending/running/waiting_review） */
  async findMutexHolders(definitionId: string): Promise<WorkflowRunRecord[]> {
    const rows = await this.scoped.find({
      where: {
        definitionId,
        status: In([...MUTEX_RUN_STATUSES]),
      } as FindOptionsWhere<WorkflowRunEntity>,
      order: { createdAt: 'ASC' } as any,
    })
    return this.toDtoList(rows)
  }

  /** 按工作流分页列出运行历史（含 skipped；新→旧） */
  async listByDefinition(
    definitionId: string,
    params: { status?: WorkflowRunStatus; page: number; pageSize: number }
  ): Promise<{ items: WorkflowRunRecord[]; total: number }> {
    const qb = this.scoped
      .qb('r')
      .where('r.definition_id = :definitionId', { definitionId })
      .orderBy('r.created_at', 'DESC')
      .skip((params.page - 1) * params.pageSize)
      .take(params.pageSize)
    if (params.status) {
      qb.andWhere('r.status = :status', { status: params.status })
    }
    const [rows, total] = await qb.getManyAndCount()
    return { items: this.toDtoList(rows), total }
  }

  /** 当前用户全部运行历史分页（全局历史页） */
  async list(
    params: { status?: WorkflowRunStatus; page: number; pageSize: number }
  ): Promise<{ items: WorkflowRunRecord[]; total: number }> {
    const qb = this.scoped
      .qb('r')
      .orderBy('r.created_at', 'DESC')
      .skip((params.page - 1) * params.pageSize)
      .take(params.pageSize)
    if (params.status) {
      qb.andWhere('r.status = :status', { status: params.status })
    }
    const [rows, total] = await qb.getManyAndCount()
    return { items: this.toDtoList(rows), total }
  }

  async deleteById(id: string): Promise<number> {
    return this.scoped.delete({ id } as FindOptionsWhere<WorkflowRunEntity>)
  }

  /**
   * boot 阶段扫描可恢复的运行（跨租户裸扫描）。
   * 命中：pending / running / waiting_review（崩溃或退出时的在途运行）。
   * ⚠️ 结果按 userId 逐个 runWithUserAsync 后再由引擎处理。
   */
  async scanBootRecoverable(): Promise<WorkflowRunRecord[]> {
    const rows = await this.repo
      .createQueryBuilder('r')
      .where('r.status IN (:...statuses)', { statuses: [...MUTEX_RUN_STATUSES] })
      .getMany()
    return this.toDtoList(rows)
  }

  private generateId(): string {
    return `wfrun_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }
}
