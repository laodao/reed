/**
 * shell 会话管理器（44 号；移植 OpenAI codex unified_exec 核心语义）
 * @module core/platform/workflow/local/shell-sessions
 *
 * upstream: https://github.com/openai/codex codex-rs/core/src/unified_exec（Apache-2.0）
 * commit 008bbd5884。yield 语义 / 会话表 / head+tail 缓冲 / 时序常量对标；
 * 文案是模型行为契约，逐字保留（"Unknown process id N"、"... N bytes omitted ..."）。
 *
 * 有意偏差（登记 44 号文档）：
 * - pipe 代替 PTY（无 node-pty 依赖）：stdin 保持打开，shell_write 可写数据——比 codex
 *   非 TTY 会话（StdinClosed 拒绝）能力更强；`\u0003` 中断语义以 SIGINT 实现（pipe 下
 *   \x03 只是普通字节，无 tty 行纪律）
 * - 桌面应用长驻（codex 是 CLI 进程级生命周期）：加空闲 TTL 惰性清扫（缺省 30min，
 *   0=关），防无人续读的后台进程泄漏
 * - 无持久化、无窗口差（Windows floor）：桌面端 linux/mac 优先
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { createLogger } from '@core/utils/logger'

const logger = createLogger('ShellSessions')

// ==================== 常量（codex unified_exec/mod.rs:73-82 同款） ====================

export const SHELL_YIELD_MIN_MS = 250
export const SHELL_YIELD_MAX_MS = 30_000
/** 空 write（纯轮询）的 yield 下限（MIN_EMPTY_YIELD_TIME_MS） */
export const SHELL_EMPTY_POLL_MIN_MS = 5_000
/** 空 write 轮询上限（DEFAULT_MAX_BACKGROUND_TERMINAL_TIMEOUT_MS） */
export const SHELL_POLL_MAX_MS = 300_000
/** 输出缓冲总量（UNIFIED_EXEC_OUTPUT_MAX_BYTES）：head/tail 各半 */
export const SHELL_OUTPUT_MAX_BYTES = 1024 * 1024
/** 会话上限（codex 64；桌面应用收紧） */
export const SHELL_MAX_SESSIONS = 16
/** exec 首次 yield 缺省（codex 同款 10s） */
export const SHELL_DEFAULT_YIELD_MS = 10_000
/** 写 stdin 后收集前的小睡（codex process_manager.rs:928-933 同款 100ms） */
export const SHELL_WRITE_SETTLE_MS = 100
/** 进程退出后的收尾宽限（POST_EXIT_CLOSE_WAIT_CAP 50ms） */
export const SHELL_POST_EXIT_GRACE_MS = 50
/** 被超时杀死进程的退出码（codex process.rs:199-210 同款） */
export const SHELL_EXIT_CODE_TIMEOUT = 124
/** 空闲 TTL 缺省（有意偏差：桌面长驻进程防泄漏；0=关闭） */
export const SHELL_IDLE_TTL_MS_DEFAULT = 30 * 60_000
/** 中断哨兵（codex \u{3} 语义；pipe 下映射为 SIGINT） */
export const SHELL_INTERRUPT_CHAR = '\u0003'
/** 收集循环在有数据时的轮询节拍 ms（防微任务死旋——44 号实测教训） */
export const SHELL_POLL_TICK_MS = 10

// ==================== head+tail 缓冲（head_tail_buffer.rs 移植） ====================

export class HeadTailBuffer {
  private head: Buffer[] = []
  private headBytes = 0
  private tail: Buffer[] = []
  private tailBytes = 0
  private omittedBytes = 0

  constructor(private readonly maxBytes = SHELL_OUTPUT_MAX_BYTES) {}

  push(chunk: Buffer): void {
    const headBudget = Math.floor(this.maxBytes / 2)
    const tailBudget = this.maxBytes - headBudget
    let rest = chunk
    if (this.headBytes < headBudget) {
      const take = rest.subarray(0, Math.min(rest.length, headBudget - this.headBytes))
      this.head.push(take)
      this.headBytes += take.length
      rest = rest.subarray(take.length)
    }
    if (rest.length === 0) return
    this.tail.push(rest)
    this.tailBytes += rest.length
    while (this.tailBytes > tailBudget && this.tail.length > 0) {
      const first = this.tail[0]
      const overflow = this.tailBytes - tailBudget
      if (first.length > overflow) {
        // 分界块部分截除（保尾语义——codex head_tail_buffer 同款）
        this.tail[0] = first.subarray(overflow)
        this.tailBytes -= overflow
        this.omittedBytes += overflow
        break
      }
      this.tail.shift()
      this.tailBytes -= first.length
      this.omittedBytes += first.length
    }
  }

  /** 取当前可见文本并清空缓冲（collect-until-deadline 的 drain 语义） */
  drain(): { text: string; omittedBytes: number } {
    const omitted = this.omittedBytes
    const headText = Buffer.concat(this.head).toString('utf8')
    const tailText = Buffer.concat(this.tail).toString('utf8')
    this.head = []
    this.tail = []
    this.headBytes = 0
    this.tailBytes = 0
    const text =
      omitted > 0
        ? `${headText}\n... ${omitted} bytes omitted ...\n${tailText}`
        : headText + tailText
    this.omittedBytes = 0
    return { text, omittedBytes: omitted }
  }

  get byteCount(): number {
    return this.headBytes + this.tailBytes + this.omittedBytes
  }

  /** 当前缓冲中的可见字节数（drain 前的数据存在性判断） */
  get pendingBytes(): number {
    return this.headBytes + this.tailBytes
  }
}

// ==================== 会话 ====================

export interface ShellExecResult {
  /** 仍在运行时存在——继续 shell_write 的凭据；退出时不存在 */
  session_id?: number
  /** 已退出时存在（被超时/空闲清扫杀死 = 124） */
  exit_code?: number
  output: string
  wall_time_seconds: string
  /** 本次 drain 的省略字节数（单次口径） */
  omitted_bytes: number
  /** 信号死亡时记录（SIGTERM/SIGKILL…） */
  signal?: string
}

export interface ShellSessionInfo {
  id: number
  startedAt: number
  lastUsedAt: number
  exited: boolean
}

interface Session {
  id: number
  child: ChildProcess
  buffer: HeadTailBuffer
  startedAt: number
  lastUsedAt: number
  exited: boolean
  exitCode: number | null
  /** 信号死亡时记录（SIGINT/SIGKILL…——模型据此归因，对抗 review P2-6） */
  exitSignal: string | null
  closeWaiters: Array<() => void>
}

export interface ShellSessionManagerDeps {
  /** 工作区围栏（tools 层已校验 workdir；这里只消费） */
  maxSessions?: number
  idleTtlMs?: number
  /** 进程 env 注入面（缺省 codex 同款假终端 env） */
  env?: Record<string, string>
}

export class ShellSessionManager {
  private readonly sessions = new Map<number, Session>()
  private readonly maxSessions: number
  private readonly idleTtlMs: number
  private recentUsed: number[] = []

  constructor(private readonly deps: ShellSessionManagerDeps = {}) {
    this.maxSessions = deps.maxSessions ?? SHELL_MAX_SESSIONS
    this.idleTtlMs = deps.idleTtlMs ?? SHELL_IDLE_TTL_MS_DEFAULT
  }

  /** 会话表观测位（运维/测试） */
  list(): ShellSessionInfo[] {
    return [...this.sessions.values()].map((s) => ({
      id: s.id,
      startedAt: s.startedAt,
      lastUsedAt: s.lastUsedAt,
      exited: s.exited,
    }))
  }

  /** 执行命令并等待首个 yield 窗口（exec_command 语义） */
  async exec(input: { command: string; workdir?: string; yieldMs?: number }): Promise<ShellExecResult> {
    this.sweepIdle()
    this.ensureCapacity()
    const yieldMs = clampYield(input.yieldMs ?? SHELL_DEFAULT_YIELD_MS)
    const id = allocateSessionId(this.sessions)
    // codex spawn env（process_manager.rs:90-101 同款假终端）
    const child = spawn('/bin/bash', ['-c', input.command], {
      cwd: input.workdir,
      env: {
        ...process.env,
        NO_COLOR: '1',
        TERM: 'dumb',
        COLORTERM: '',
        PAGER: 'cat',
        GIT_PAGER: 'cat',
        GH_PAGER: 'cat',
        ...(this.deps.env ?? {}),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const session: Session = {
      id,
      child,
      buffer: new HeadTailBuffer(),
      startedAt: Date.now(),
      lastUsedAt: Date.now(),
      exited: false,
      exitCode: null,
      exitSignal: null,
      closeWaiters: [],
    }
    // stdout/stderr 合流（不分流，codex combine_output_receivers 同语义）
    child.stdout?.on('data', (c: Buffer) => this.onData(session, c))
    child.stderr?.on('data', (c: Buffer) => this.onData(session, c))
    // stdin EPIPE 兜底（对抗 review P0-1）：向已退出会话写 stdin 会异步抛 EPIPE——
    // 无人接 = uncaughtException 崩主进程（Electron 桌面端致命）
    child.stdin?.on('error', () => undefined)
    child.on('close', (code, signal) => {
      session.exited = true
      session.exitCode = code
      session.exitSignal = signal ?? null
      for (const w of session.closeWaiters.splice(0)) w()
    })
    child.on('error', (e) => {
      session.buffer.push(Buffer.from(`\n[spawn error] ${e.message}\n`))
      session.exited = true
      session.exitCode = session.exitCode ?? 127
      for (const w of session.closeWaiters.splice(0)) w()
    })
    this.sessions.set(id, session)
    this.markUsed(session)

    await this.collectUntilDeadline(session, yieldMs)
    return this.formatResult(session)
  }

  /** 向会话写 stdin / 纯轮询（write_stdin 语义） */
  async write(input: {
    sessionId: number
    /** 缺省/空串 = 纯轮询（yield 下限 5s）；'\u0003' = SIGINT 中断 */
    data?: string
    closeStdin?: boolean
    yieldMs?: number
  }): Promise<ShellExecResult> {
    this.sweepIdle()
    const session = this.sessions.get(input.sessionId)
    if (!session) {
      // 未知/已终结会话同一文案（codex：退出会话读表即删——"Unknown process id N"）
      throw new Error(`Unknown process id ${input.sessionId}`)
    }
    this.markUsed(session)
    if (input.closeStdin && session.child.stdin && !session.child.stdin.destroyed) {
      session.child.stdin.end()
    }
    if (input.data !== undefined && input.data.length > 0) {
      if (input.data === SHELL_INTERRUPT_CHAR) {
        session.child.kill('SIGINT')
      } else if (session.child.stdin && !session.child.stdin.destroyed) {
        const ok = session.child.stdin.write(input.data)
        if (!ok && !session.exited) {
          throw new Error('failed to write to stdin')
        }
        // !ok && exited：写失败但进程已退出 → 继续走 poll 上报退出码（codex 同语义）
      }
      // stdin 已销毁（进程已退）：静默落空，由下方 poll 上报退出码
      // 写入后小睡再收集，提高把响应收进本次 yield 的概率（codex 100ms 同款）
      await sleepMs(SHELL_WRITE_SETTLE_MS)
    }
    // yield 时间规则（process_manager.rs:950-959）
    const isEmptyPoll = input.data === undefined || input.data.length === 0
    const yieldMs = isEmptyPoll
      ? Math.min(Math.max(input.yieldMs ?? SHELL_EMPTY_POLL_MIN_MS, SHELL_EMPTY_POLL_MIN_MS), SHELL_POLL_MAX_MS)
      : Math.min(Math.max(input.yieldMs ?? SHELL_YIELD_MIN_MS, SHELL_YIELD_MIN_MS), SHELL_YIELD_MAX_MS)

    await this.collectUntilDeadline(session, yieldMs)
    return this.formatResult(session)
  }

  /** 杀掉全部在途会话（宿主关停/会话重置用） */
  killAll(): void {
    for (const s of this.sessions.values()) this.kill(s)
    this.sessions.clear()
  }

  // —— 内部 ——

  private onData(session: Session, chunk: Buffer): void {
    session.buffer.push(chunk)
    for (const w of session.closeWaiters.splice(0)) w()
  }

  /** 轮询收集直到 deadline 或进程退出；退出后留 50ms 收尾（POST_EXIT_CLOSE_WAIT_CAP） */
  private async collectUntilDeadline(session: Session, deadlineMs: number): Promise<void> {
    const start = Date.now()
    for (;;) {
      if (session.exited) {
        await sleepMs(SHELL_POST_EXIT_GRACE_MS)
        break
      }
      if (Date.now() - start >= deadlineMs) break
      // 数据/退出到达即唤醒（不提前返回——继续等到点，codex 同语义）。
      // 注意：等待必须落在真实定时器上——缓冲已有数据时同步 resolve 会把循环
      // 变成纯微任务死旋，事件循环进不了 poll 相位，子进程 exit/close 被饿死
      // （44 号实测教训：快命令挂满 deadline、exit_code 永远拿不到）
      await waitForDataOrClose(session, Math.min(50, deadlineMs - (Date.now() - start)))
      if (session.buffer.pendingBytes > 0) await sleepMs(SHELL_POLL_TICK_MS)
    }
    // deadline 到但进程已实质退出（exitCode 已置、close 未触发）：再给一次收尾机会
    if (!session.exited && (session.child.exitCode !== null || session.child.signalCode !== null)) {
      await sleepMs(SHELL_POST_EXIT_GRACE_MS)
    }
  }

  /** 已退出 → 出表并给 exit_code；仍在途 → session_id（codex :1011-1029） */
  private formatResult(session: Session): ShellExecResult {
    const { text, omittedBytes } = session.buffer.drain()
    const wall = ((Date.now() - session.startedAt) / 1000).toFixed(4)
    if (session.exited) {
      this.sessions.delete(session.id)
      this.recentUsed = this.recentUsed.filter((x) => x !== session.id)
      const bySignal = session.exitCode === null && session.exitSignal !== null
      return {
        exit_code: bySignal ? 128 + signalNumber(session.exitSignal!) : (session.exitCode ?? -1),
        ...(bySignal ? { signal: session.exitSignal! } : {}),
        output: text,
        wall_time_seconds: wall,
        omitted_bytes: omittedBytes,
      }
    }
    return { session_id: session.id, output: text, wall_time_seconds: wall, omitted_bytes: omittedBytes }
  }

  private markUsed(session: Session): void {
    session.lastUsedAt = Date.now()
    this.recentUsed = [session.id, ...this.recentUsed.filter((x) => x !== session.id)].slice(0, 8)
  }

  /** 容量 prune（codex :1607-1678）：先清已退出（LRU、保护最近 8 个），再清最久未用活会话 */
  private ensureCapacity(): void {
    while (this.sessions.size >= this.maxSessions) {
      const entries = [...this.sessions.values()].sort((a, b) => a.lastUsedAt - b.lastUsedAt)
      const finished = entries.find((s) => s.exited && !this.recentUsed.includes(s.id))
      if (finished) {
        this.sessions.delete(finished.id)
        continue
      }
      const victim = entries.find((s) => !this.recentUsed.includes(s.id)) ?? entries[0]
      logger.warn(`[shell-sessions] 会话达上限（${this.maxSessions}），终止最久未用会话 id=${victim.id}`)
      this.kill(victim)
      this.sessions.delete(victim.id)
      this.recentUsed = this.recentUsed.filter((x) => x !== victim.id)
    }
  }

  /** 空闲 TTL 惰性清扫（有意偏差，防桌面长驻泄漏；0=关闭） */
  private sweepIdle(): void {
    if (this.idleTtlMs <= 0) return
    const now = Date.now()
    for (const s of [...this.sessions.values()]) {
      if (!s.exited && now - s.lastUsedAt > this.idleTtlMs) {
        logger.warn(`[shell-sessions] 会话空闲超 ${Math.round(this.idleTtlMs / 1000)}s，终止 id=${s.id}`)
        this.kill(s, SHELL_EXIT_CODE_TIMEOUT)
        this.sessions.delete(s.id)
        this.recentUsed = this.recentUsed.filter((x) => x !== s.id)
      }
    }
  }

  private kill(session: Session, code = SHELL_EXIT_CODE_TIMEOUT): void {
    if (session.exited) return
    session.exitCode = code
    try {
      session.child.kill('SIGKILL')
    } catch {
      // 进程可能刚好自行退出——close 事件兜底
    }
    session.exited = true
    for (const w of session.closeWaiters.splice(0)) w()
  }
}

// ==================== 内部工具 ====================

function signalNumber(sig: string): number {
  const known: Record<string, number> = { SIGHUP: 1, SIGINT: 2, SIGQUIT: 3, SIGKILL: 9, SIGUSR1: 10, SIGUSR2: 12, SIGPIPE: 13, SIGTERM: 15 }
  return known[sig] ?? 15
}

function clampYield(ms: number): number {
  return Math.min(Math.max(ms, SHELL_YIELD_MIN_MS), SHELL_YIELD_MAX_MS)
}

function allocateSessionId(taken: Map<number, unknown>): number {
  // codex：1000..100000 随机 i32，占用即重取
  for (;;) {
    const id = 1_000 + Math.floor(Math.random() * 99_000)
    if (!taken.has(id)) return id
  }
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** 等 session 出数据或退出（有界；返回是否提前唤醒） */
function waitForDataOrClose(session: Session, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (session.exited || session.buffer.pendingBytes > 0) {
      resolve(true)
      return
    }
    const t = setTimeout(() => {
      session.closeWaiters = session.closeWaiters.filter((w) => w !== wake)
      resolve(false)
    }, ms)
    const wake = (): void => {
      clearTimeout(t)
      resolve(true)
    }
    session.closeWaiters.push(wake)
  })
}
