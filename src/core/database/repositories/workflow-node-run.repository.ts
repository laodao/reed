/**
 * 工作流节点运行仓库（节点级 checkpoint）
 * @module database/repositories/workflow-node-run.repository
 *
 * 维护 workflow_node_runs 表：一次运行中各节点各迭代的执行记录。
 * (run_id, node_id, iteration_index) 唯一——引擎生命周期内同一执行只一行，
 * 从 running 更新到终态；重试不建新行。
 *
 * 多租户：继承 BaseRepository，user_id 自动注入。
 * ⚠️ scanExpiredWaitingReview 为跨租户裸扫描（ticker 无用户上下文），
 *    结果必须按 userId 逐个 runWithUserAsync 后处理。
 */

import { type DataSource, type FindOptionsWhere } from 'typeorm'
import type { WorkflowNodeRunStatus } from '@shared/types/workflow.types'
import { WorkflowNodeRunEntity } from '../entities/workflow-node-run.entity'
import { BaseRepository } from '../base-repository'
import { createLogger } from '@core/utils/logger'

const logger = createLogger('WorkflowNodeRunRepository')

/** 审核操作留痕 */
export interface WorkflowReviewRecord {
  decision: 'approve' | 'approve_with_changes' | 'reject' | 'timeout_approve' | 'timeout_reject'
  comment?: string
  editedValues?: Record<string, unknown>
  decidedAt: string
}

/** 节点运行 DTO（JSON 列已解析；userId 供跨租户扫描后按用户重建上下文） */
export interface WorkflowNodeRunRecord {
  /** 节点内中间状态 JSON（E2；可变行——saveState 覆盖写；旧行 null） */
  stateJson?: string | null
  id: string
  userId: string | null
  runId: string
  nodeId: string
  nodeType: string
  nodeName: string
  iterationIndex: number
  status: WorkflowNodeRunStatus
  input: Record<string, unknown> | null
  output: Record<string, unknown> | null
  error: string | null
  retryCount: number
  routeTaken: string | null
  waitExpiresAt: Date | null
  review: WorkflowReviewRecord | null
  startedAt: Date | null
  finishedAt: Date | null
  durationMs: number | null
  createdAt: Date | null
}

/** 节点开始执行的入参 */
export interface StartNodeRunInput {
  runId: string
  nodeId: string
  nodeType: string
  nodeName: string
  iterationIndex: number
  input: Record<string, unknown> | null
}

/** 节点状态更新入参（浅合并） */
export interface UpdateNodeRunInput {
  status?: WorkflowNodeRunStatus
  input?: Record<string, unknown> | null
  output?: Record<string, unknown> | null
  error?: string | null
  retryCount?: number
  routeTaken?: string | null
  waitExpiresAt?: Date | null
  review?: WorkflowReviewRecord | null
  finishedAt?: Date | null
  durationMs?: number | null
}

/** JSON 列安全解析（context 传实体定位信息，损坏可排查） */
function safeParse<T>(raw: string | null, fallback: T, context = ''): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    logger.warn(`[WorkflowNodeRunRepository] JSON 列解析失败（${context}），降级处理`)
    return fallback
  }
}

export class WorkflowNodeRunRepository extends BaseRepository<
  WorkflowNodeRunEntity,
  WorkflowNodeRunRecord
> {
  constructor(dataSource: DataSource) {
    super(dataSource, WorkflowNodeRunEntity)
  }

  protected toDto(e: WorkflowNodeRunEntity): WorkflowNodeRunRecord {
    return {
      id: e.id,
      userId: e.userId,
      runId: e.runId,
      nodeId: e.nodeId,
      nodeType: e.nodeType,
      nodeName: e.nodeName,
      iterationIndex: e.iterationIndex,
      stateJson: e.stateJson ?? null,
      status: e.status as WorkflowNodeRunStatus,
      input: safeParse<Record<string, unknown> | null>(e.inputJson, null),
      output: safeParse<Record<string, unknown> | null>(e.outputJson, null, `id=${e.id}.output`),
      error: e.error,
      retryCount: e.retryCount,
      routeTaken: e.routeTaken,
      waitExpiresAt: e.waitExpiresAt,
      review: safeParse<WorkflowReviewRecord | null>(e.review, null),
      startedAt: e.startedAt,
      finishedAt: e.finishedAt,
      durationMs: e.durationMs,
      createdAt: e.createdAt,
    }
  }

  /** 节点开始执行：建行（同键已存在则抛唯一约束错——引擎层 bug 的防御线） */
  async start(data: StartNodeRunInput): Promise<WorkflowNodeRunRecord> {
    const now = new Date()
    const entity = await this.scoped.save({
      id: this.generateId(),
      runId: data.runId,
      nodeId: data.nodeId,
      nodeType: data.nodeType,
      nodeName: data.nodeName,
      iterationIndex: data.iterationIndex,
      status: 'running',
      inputJson: data.input ? JSON.stringify(data.input) : null,
      outputJson: null,
      error: null,
      retryCount: 0,
      routeTaken: null,
      waitExpiresAt: null,
      review: null,
      startedAt: now,
      finishedAt: null,
      durationMs: null,
      createdAt: now,
      updatedAt: now,
    } as Partial<WorkflowNodeRunEntity>)
    return this.toDto(entity as WorkflowNodeRunEntity)
  }

  /** 按运行+节点+迭代更新（引擎生命周期推进） */
  async update(
    runId: string,
    nodeId: string,
    iterationIndex: number,
    patch: UpdateNodeRunInput
  ): Promise<WorkflowNodeRunRecord | null> {
    const partial: Partial<WorkflowNodeRunEntity> = { updatedAt: new Date() }
    if (patch.status !== undefined) partial.status = patch.status
    if (patch.input !== undefined) {
      partial.inputJson = patch.input ? JSON.stringify(patch.input) : null
    }
    if (patch.output !== undefined) {
      partial.outputJson = patch.output ? JSON.stringify(patch.output) : null
    }
    if (patch.error !== undefined) partial.error = patch.error
    if (patch.retryCount !== undefined) partial.retryCount = patch.retryCount
    if (patch.routeTaken !== undefined) partial.routeTaken = patch.routeTaken
    if (patch.waitExpiresAt !== undefined) partial.waitExpiresAt = patch.waitExpiresAt
    if (patch.review !== undefined) {
      partial.review = patch.review ? JSON.stringify(patch.review) : null
    }
    if (patch.finishedAt !== undefined) partial.finishedAt = patch.finishedAt
    if (patch.durationMs !== undefined) partial.durationMs = patch.durationMs

    await this.scoped.update(
      {
        runId,
        nodeId,
        iterationIndex,
      } as FindOptionsWhere<WorkflowNodeRunEntity>,
      partial
    )
    return this.getByNode(runId, nodeId, iterationIndex)
  }

  async getByNode(
    runId: string,
    nodeId: string,
    iterationIndex: number
  ): Promise<WorkflowNodeRunRecord | null> {
    const e = await this.scoped.findOne({
      runId,
      nodeId,
      iterationIndex,
    } as FindOptionsWhere<WorkflowNodeRunEntity>)
    return e ? this.toDto(e) : null
  }

  /** 某运行的全部节点执行记录（历史回放/装配） */
  async getByRun(runId: string): Promise<WorkflowNodeRunRecord[]> {
    const rows = await this.scoped.find({
      where: { runId } as FindOptionsWhere<WorkflowNodeRunEntity>,
      order: { createdAt: 'ASC' } as any,
    })
    return this.toDtoList(rows)
  }

  /**
   * 续跑装配数据：已成功且有输出的节点记录（checkpoint 本体）。
   * 引擎按 (nodeId, iterationIndex) 重建变量上下文。
   */
  async findSucceededWithOutput(runId: string): Promise<WorkflowNodeRunRecord[]> {
    const rows = await this.scoped.find({
      where: {
        runId,
        status: 'succeeded',
      } as FindOptionsWhere<WorkflowNodeRunEntity>,
      order: { iterationIndex: 'ASC' } as any,
    })
    return this.toDtoList(rows).filter(r => r.output !== null)
  }

  /** 当前用户待审核列表（顶栏徽标） */
  async findWaitingReview(): Promise<WorkflowNodeRunRecord[]> {
    const rows = await this.scoped.find({
      where: { status: 'waiting_review' } as FindOptionsWhere<WorkflowNodeRunEntity>,
      order: { createdAt: 'ASC' } as any,
    })
    return this.toDtoList(rows)
  }

  /**
   * ticker 扫描：审核等待已超时的行（跨租户裸扫描）。
   * ⚠️ 结果按 userId 逐个 runWithUserAsync 后由引擎按超时策略处理。
   */
  async scanExpiredWaitingReview(now: Date): Promise<WorkflowNodeRunRecord[]> {
    const rows = await this.repo
      .createQueryBuilder('n')
      .where('n.status = :status', { status: 'waiting_review' })
      .andWhere('n.wait_expires_at IS NOT NULL')
      .andWhere('n.wait_expires_at <= :now', { now })
      .getMany()
    return this.toDtoList(rows)
  }

  /** 删除某运行的全部节点记录（随运行历史删除） */
  async deleteByRun(runId: string): Promise<number> {
    return this.scoped.delete({ runId } as FindOptionsWhere<WorkflowNodeRunEntity>)
  }

  private generateId(): string {
    return `wfnode_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }
}
