/**
 * 轨迹落库缓冲写入器（25 号 M2 批1 / 12 号 §5.2 emitTrajectory 契约的持久化半边）
 * @module core/platform/agent-runtime/trajectory/sink
 *
 * 宿主无关：AgentHost 实现方（workflow 适配层 / 独立会话宿主）各自实例化，
 * emitTrajectory → append（同步入缓冲，永不 throw）→ 宿主在存续关键点 flush。
 *
 * 纪律：
 * - fire-and-forget 语义保留——轨迹是观测面不是正确性依赖，flush 失败只结构化
 *   warn，不外泄到循环（循环不该因观测挂掉）
 * - 幂等：seq 从库内 max(seq) 续接（懒初始化，首次 flush 时解析），id 确定性
 *   tr_<scopeKey>_<seq> + insert-or-ignore——崩溃恢复重放不重不漏
 * - flush 串行化（chained promise）：多个 flush 点并发触发时按序排空，不撕裂批
 */

import { createLogger } from '@core/utils/logger'
import type { TrajectoryEntry } from '../types'

const logger = createLogger('AgentTrajectorySink')

/** 仓储端口（database 层 AgentTrajectoryRepository 满足；此处不依赖 database 模块） */
export interface TrajectoryAppendPort {
  appendBatch(
    entries: Array<{
      scope: 'workflow' | 'session'
      scopeKey: string
      seq: number
      iteration: number
      kind: string
      name?: string | null
      payload?: Record<string, unknown> | null
      promptTokens?: number | null
      completionTokens?: number | null
      durationMs?: number | null
    }>,
  ): Promise<void>
  maxSeq(scopeKey: string): Promise<number>
  /** 会话轨迹级联删除（scoped 按租户过滤——review A1；可选，缺省不清理） */
  deleteByScope?(scopeKey: string): Promise<number>
}

export interface TrajectorySinkOptions {
  scope: 'workflow' | 'session'
  scopeKey: string
  /**
   * 逐条外推回调（29 号 M5.5：工作台实时时间线）——append 时同步触发，
   * 异常只 warn 不影响缓冲/落库（fire-and-forget）。宿主注入（如广播到前端）。
   */
  onEntry?: (scopeKey: string, entry: TrajectoryEntry) => void
}

export class TrajectorySink {
  private readonly buffer: TrajectoryEntry[] = []
  private nextSeq: number | null = null // 懒初始化：首次 flush 从库内 max(seq) 续接
  private flushChain: Promise<void> = Promise.resolve()
  /** 单测断言面：已成功落库条数 */
  flushedCount = 0

  constructor(
    private readonly port: TrajectoryAppendPort | null,
    private readonly opts: TrajectorySinkOptions,
  ) {}

  /** 同步入缓冲（emitTrajectory 直通；永不 throw） */
  append(entry: TrajectoryEntry): void {
    this.buffer.push(entry)
    if (this.opts.onEntry) {
      try {
        this.opts.onEntry(this.opts.scopeKey, entry)
      } catch (e) {
        logger.warn('[TrajectorySink] onEntry 回调异常（不影响落库）', e)
      }
    }
  }

  /**
   * 排空缓冲落库（串行链；错误只 warn 不外泄）。
   * 同步快照缓冲：flush() 调用那一刻已在缓冲的条目保证属于本批（屏障语义——
   * 挂起前 flush 返回 = 挂起前轨迹全部落库），之后 append 的进下一批。
   */
  flush(): Promise<void> {
    const batch = this.buffer.splice(0, this.buffer.length)
    if (batch.length === 0) return this.flushChain
    this.flushChain = this.flushChain.then(() => this.drain(batch))
    return this.flushChain
  }

  private async drain(batch: TrajectoryEntry[]): Promise<void> {
    if (!this.port || batch.length === 0) return
    try {
      if (this.nextSeq === null) {
        this.nextSeq = (await this.port.maxSeq(this.opts.scopeKey)) + 1
      }
      const rows = batch.map((e) => {
        const seq = this.nextSeq!
        this.nextSeq! += 1
        return {
          scope: this.opts.scope,
          scopeKey: this.opts.scopeKey,
          seq,
          iteration: e.iteration,
          kind: e.kind,
          name: e.name ?? null,
          payload: e.payload ?? null,
          promptTokens: e.promptTokens ?? null,
          completionTokens: e.completionTokens ?? null,
          durationMs: e.durationMs ?? null,
        }
      })
      await this.port.appendBatch(rows)
      this.flushedCount += rows.length
    } catch (e) {
      // 观测面失败不外泄：丢批只 warn（轨迹允许有洞，循环不允许被观测拖死）
      logger.warn(
        `[trajectory] 落库失败（丢弃 ${batch.length} 条，scope=${this.opts.scope} key=${this.opts.scopeKey}）：${e instanceof Error ? e.message : String(e)}`,
      )
    }
  }
}
