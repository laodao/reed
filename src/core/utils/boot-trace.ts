/**
 * 启动阶段耗时追踪
 * @module core/utils/boot-trace
 *
 * 用途：主进程启动（数据库初始化 / 子系统装配）包含大量串行且**同步**的工作，
 * 用户侧的体感就是"窗口出来了但界面半天不动"。没有分段耗时数据时，只能靠猜。
 * 本模块提供极轻量的分段计时：调用方 `mark(label)`，收尾 `report()` 把各段耗时
 * 写入日志（默认阈值 50ms，避免刷屏）。
 *
 * 用法：
 * ```ts
 * const trace = createBootTrace('DatabaseManager')
 * trace.mark('initTables')            // 记录"距上一次 mark"的耗时
 * trace.mark('initTypeOrmDataSource')
 * ...
 * trace.report(logger)                // 输出总耗时 + 各段（仅超阈值）
 * ```
 */

export interface BootTraceMark {
  label: string
  ms: number
  /** 距追踪开始的累计耗时 */
  atMs: number
}

export interface BootTrace {
  /** 记录自上一次 mark 以来的耗时（首段自追踪开始计算） */
  mark(label: string): void
  /** 手动记录某段明确耗时（如已知的异步调用） */
  record(label: string, ms: number): void
  /** 各段明细（按记录顺序） */
  marks(): BootTraceMark[]
  /** 总耗时（ms） */
  totalMs(): number
  /** 输出报告；logger 缺省时打到 console */
  report(logger?: { info: (msg: string, ctx?: Record<string, unknown>) => void }, thresholdMs?: number): void
}

export function createBootTrace(scope: string): BootTrace {
  const startedAt = Date.now()
  const out: BootTraceMark[] = []
  let lastAt = startedAt

  const push = (label: string, ms: number): void => {
    out.push({ label, ms: Math.round(ms), atMs: Date.now() - startedAt })
    lastAt = Date.now()
  }

  return {
    mark(label: string): void {
      const now = Date.now()
      push(label, now - lastAt)
    },
    record(label: string, ms: number): void {
      push(label, ms)
    },
    marks(): BootTraceMark[] {
      return [...out]
    },
    totalMs(): number {
      return Date.now() - startedAt
    },
    report(logger, thresholdMs = 50): void {
      const total = Date.now() - startedAt
      const slow = out.filter((m) => m.ms >= thresholdMs)
      const ctx = {
        scope,
        totalMs: total,
        slow: slow.map((m) => `${m.label}=${m.ms}ms@${m.atMs}`),
        all: out.map((m) => `${m.label}=${m.ms}ms`),
      }
      const msg = `[boot-trace] ${scope} 总耗时 ${total}ms（${slow.length} 段 >= ${thresholdMs}ms）`
      if (logger) logger.info(msg, ctx)
      else console.log(msg, JSON.stringify(ctx))
    },
  }
}