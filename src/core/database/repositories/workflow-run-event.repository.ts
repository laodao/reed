/**
 * 工作流运行事件日志仓库（Run Journal，11 号 §4.1/§5.1 E1）
 * @module database/repositories/workflow-run-event.repository
 *
 * 引擎 JournalPort 的生产实现底座：追加写入 + 按 run 升序读取 + 新旧格式判据 +
 * 随 run 级联删除。读/写走 scoped（ALS 自动过滤）；deleteByRunRaw 是跨租户裸操作
 * （run 行属主已由调用方校验），boot 扫描侧按行内 userId 重建 ALS 后再进引擎。
 */

import { MoreThanOrEqual, type DataSource, type FindOptionsWhere } from 'typeorm'
import type { WorkflowJournalEventType } from '@shared/types/workflow.types'
import { getCurrentUserId } from '@core/context/user-context'
import { WorkflowRunEventEntity } from '../entities/workflow-run-event.entity'
import { BaseRepository } from '../base-repository'

/** 事件行 id：run+seq 确定性主键（可读；同 run 重放不产生第二套 id） */
function eventId(runId: string, seq: number): string {
  return `j_${runId}_${seq}`
}

export interface WorkflowRunEventRow {
  id: string
  runId: string
  seq: number
  type: WorkflowJournalEventType | string
  nodeId: string | null
  scopeKey: string | null
  payload: Record<string, unknown> | null
  createdAt: Date | null
}

export class WorkflowRunEventRepository extends BaseRepository<WorkflowRunEventEntity, WorkflowRunEventRow> {
  constructor(dataSource: DataSource) {
    super(dataSource, WorkflowRunEventEntity)
  }

  /** 追加一条事件（seq 由引擎分配；(run_id, seq) 唯一冲突由 DB 兜底抛错） */
  async append(input: {
    runId: string
    seq: number
    type: WorkflowJournalEventType | string
    nodeId?: string | null
    scopeKey?: string | null
    payload?: Record<string, unknown> | null
  }): Promise<void> {
    await this.scoped.insert({
      id: eventId(input.runId, input.seq),
      runId: input.runId,
      seq: input.seq,
      type: input.type,
      nodeId: input.nodeId ?? null,
      scopeKey: input.scopeKey ?? null,
      payloadJson: input.payload ? JSON.stringify(input.payload) : null,
      createdAt: new Date(),
    })
  }

  /**
   * 批量原子追加（单事务；对抗 review：撕裂批使恢复把残缺扇出当完整态）。
   * 逐条 insert 于同一事务，任一失败整体回滚。
   * ⚠️ 裸 em.insert 不经 scoped——userId 必须在此显式注入（总收口 review P0-2：
   * 此前批事件 user_id=NULL，属主上下文重放读不到任何 edge_activated → 恢复缺边
   * 激活投影，run 无声挂死/假完成）。事务内 ALS 不会变，进事务前捕获一次。
   */
  async appendBatchAtomic(
    events: Array<{
      runId: string
      seq: number
      type: WorkflowJournalEventType | string
      nodeId?: string | null
      scopeKey?: string | null
      payload?: Record<string, unknown> | null
    }>
  ): Promise<void> {
    const userId = getCurrentUserId()
    await this.dataSource.transaction(async (em) => {
      for (const e of events) {
        await em.insert(WorkflowRunEventEntity, {
          id: eventId(e.runId, e.seq),
          userId,
          runId: e.runId,
          seq: e.seq,
          type: e.type,
          nodeId: e.nodeId ?? null,
          scopeKey: e.scopeKey ?? null,
          payloadJson: e.payload ? JSON.stringify(e.payload) : null,
          createdAt: new Date(),
        })
      }
    })
  }

  /** 最近一条快照事件（无则 null；rehydrate O(1) 定位——对抗 review IO 全量读） */
  async latestSnapshot(runId: string): Promise<WorkflowRunEventRow | null> {
    const row = await this.scoped
      .qb('e')
      .where('e.run_id = :runId', { runId })
      .andWhere('e.type = :type', { type: 'snapshot' })
      .orderBy('e.seq', 'DESC')
      .limit(1)
      .getOne()
    return row ? this.toDto(row) : null
  }

  /** 按 seq 升序读取（fromSeq 起含——快照后增量重放用） */
  async listByRun(runId: string, fromSeq = 0): Promise<WorkflowRunEventRow[]> {
    const where: FindOptionsWhere<WorkflowRunEventEntity> = { runId }
    if (fromSeq > 0) where.seq = MoreThanOrEqual(fromSeq)
    const rows = await this.scoped.find({ where, order: { seq: 'ASC' } })
    return this.toDtoList(rows)
  }

  /** 是否已有任何事件（新/旧格式 run 判据——11 号 §5.8 降级依据） */
  async hasEvents(runId: string): Promise<boolean> {
    return this.scoped.exists({ runId })
  }

  /**
   * 随 run 历史删除（deleteRun 级联）。跨租户裸操作：run 行属主由调用方（运行服务）
   * 校验；保留策略清扫（终态 run 按阈值）由运行服务按 runId 清单调用本方法——
   * 终态判定需 join workflow_runs，职责在服务层（接线批）。
   */
  async deleteByRunRaw(runId: string): Promise<number> {
    const result = await this.repo.delete({ runId })
    return result.affected ?? 0
  }

  protected toDto(e: WorkflowRunEventEntity): WorkflowRunEventRow {
    return {
      id: e.id,
      runId: e.runId,
      seq: e.seq,
      type: e.type,
      nodeId: e.nodeId,
      scopeKey: e.scopeKey,
      payload: e.payloadJson ? (JSON.parse(e.payloadJson) as Record<string, unknown>) : null,
      createdAt: e.createdAt,
    }
  }
}
