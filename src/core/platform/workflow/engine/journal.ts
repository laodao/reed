/**
 * Run Journal：引擎对运行事件日志的唯一端口（11 号 §5.1 E1）
 * @module core/platform/workflow/engine/journal
 *
 * 契约纪律：append 是引擎状态变迁关键路径上的**同步强一致**写（先日志后内存，
 * 11 号 §3.2 不变量 2）——实现不得缓冲/后台化；seq 由引擎同步分配，(runId, seq)
 * 唯一冲突实现必须抛错（DB 兜底）。生产实现 = WorkflowRunEventRepository 薄封装；
 * InMemory 实现供引擎单测（零数据库）与降级（无库场景 fail-fast 拒绝装配而非静默丢日志）。
 */

import type { WorkflowJournalEventType } from '@shared/types/workflow.types'

export interface JournalEventInput {
  runId: string
  seq: number
  type: WorkflowJournalEventType
  nodeId?: string | null
  scopeKey?: string | null
  payload?: Record<string, unknown> | null
}

export interface JournalEventRecord extends JournalEventInput {
  id: string
  createdAt: Date
}

/** 引擎对运行事件日志的唯一写入/读取端口 */
export interface WorkflowJournalPort {
  /** 追加事件。((runId, seq) 唯一冲突时抛错——引擎据此判 run 失败 */
  append(event: JournalEventInput): Promise<void>
  /**
   * 批量追加（同语义；seq 由引擎连续分配后整体传入——每批出边激活合并写，
   * 控制写放大，11 号 §5.2 注）。实现必须整体原子（单事务）：撕裂批会使
   * 恢复重放把残缺扇出当完整态（对抗 review P1）。
   */
  appendBatch(events: JournalEventInput[]): Promise<void>
  /** 按 seq 升序读取（fromSeq 起含——快照后增量重放用） */
  listByRun(runId: string, fromSeq?: number): Promise<JournalEventRecord[]>
  /** 最近一条快照（无则 null；rehydrate 用——避免全量拉取只为找快照） */
  latestSnapshot?(runId: string): Promise<JournalEventRecord | null>
  /** 该 run 是否已有任何事件（新/旧格式判据——旧格式走兼容降级） */
  hasEvents(runId: string): Promise<boolean>
  /** 随 run 历史删除（deleteRun 级联；返回删除数） */
  deleteByRun(runId: string): Promise<number>
}

// ==================== 内存实现（引擎单测 / 无库场景） ====================

/**
 * 内存 journal：完全遵循端口契约（seq 单调校验 + 唯一冲突抛错——测试与生产
 * 语义一致，防"测试宽松掩盖生产约束"）。
 */
export class InMemoryJournal implements WorkflowJournalPort {
  private rows: JournalEventRecord[] = []
  private seqSeen = new Set<string>() // `${runId}:${seq}`
  private clock: () => Date

  constructor(opts: { clock?: () => Date } = {}) {
    this.clock = opts.clock ?? (() => new Date())
  }

  async append(event: JournalEventInput): Promise<void> {
    this.assertSeq(event.runId, event.seq)
    this.rows.push(this.toRecord(event))
  }

  async appendBatch(events: JournalEventInput[]): Promise<void> {
    for (const e of events) this.assertSeq(e.runId, e.seq)
    for (const e of events) this.rows.push(this.toRecord(e))
  }

  async listByRun(runId: string, fromSeq = 0): Promise<JournalEventRecord[]> {
    return this.rows
      .filter((r) => r.runId === runId && r.seq >= fromSeq)
      .sort((a, b) => a.seq - b.seq)
      .map((r) => ({ ...r, payload: r.payload ? structuredClone(r.payload) : null }))
  }

  async hasEvents(runId: string): Promise<boolean> {
    return this.rows.some((r) => r.runId === runId)
  }

  async deleteByRun(runId: string): Promise<number> {
    const before = this.rows.length
    this.rows = this.rows.filter((r) => r.runId !== runId)
    return before - this.rows.length
  }

  /** 测试观测位：全量事件（跨 run） */
  all(): JournalEventRecord[] {
    return [...this.rows]
  }

  private assertSeq(runId: string, seq: number): void {
    const key = `${runId}:${seq}`
    if (this.seqSeen.has(key)) {
      throw new Error(`journal seq 冲突：${key}（同 run 内必须严格单调）`)
    }
    this.seqSeen.add(key)
  }

  private toRecord(e: JournalEventInput): JournalEventRecord {
    return {
      id: `j_${e.runId}_${e.seq}`,
      runId: e.runId,
      seq: e.seq,
      type: e.type,
      nodeId: e.nodeId ?? null,
      scopeKey: e.scopeKey ?? null,
      payload: e.payload ? structuredClone(e.payload) : null,
      createdAt: this.clock(),
    }
  }
}

// ==================== DB 适配（生产实现） ====================

import type { WorkflowRunEventRepository } from '@core/database/repositories/workflow-run-event.repository'

/** 生产 journal：Repository 薄封装（零缓冲直写——不变量 2 的实现形态） */
export class DbJournal implements WorkflowJournalPort {
  constructor(private readonly repo: WorkflowRunEventRepository) {}

  async append(event: JournalEventInput): Promise<void> {
    await this.repo.append(event)
  }

  async appendBatch(events: JournalEventInput[]): Promise<void> {
    // 单事务整体落库（对抗 review P1：逐条直写的撕裂批——批内第 N 条失败时
    // 前缀已落库，恢复重放把残缺扇出当完整态、整条分支静默蒸发）
    if (events.length === 0) return
    await this.repo.appendBatchAtomic(events)
  }

  async listByRun(runId: string, fromSeq = 0): Promise<JournalEventRecord[]> {
    const rows = await this.repo.listByRun(runId, fromSeq)
    return rows.map((r) => ({
      id: r.id,
      runId: r.runId,
      seq: r.seq,
      type: r.type as WorkflowJournalEventType,
      nodeId: r.nodeId,
      scopeKey: r.scopeKey,
      payload: r.payload,
      createdAt: r.createdAt ?? new Date(0),
    }))
  }

  async latestSnapshot(runId: string): Promise<JournalEventRecord | null> {
    const row = await this.repo.latestSnapshot(runId)
    return row
      ? {
          id: row.id, runId: row.runId, seq: row.seq, type: row.type as never,
          nodeId: row.nodeId, scopeKey: row.scopeKey, payload: row.payload,
          createdAt: row.createdAt ?? new Date(0),
        }
      : null
  }

  async hasEvents(runId: string): Promise<boolean> {
    return this.repo.hasEvents(runId)
  }

  async deleteByRun(runId: string): Promise<number> {
    return this.repo.deleteByRunRaw(runId)
  }
}
