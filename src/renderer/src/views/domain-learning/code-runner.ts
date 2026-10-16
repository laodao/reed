/**
 * 讲义 JS 代码运行（Web Worker 沙箱；2026-09-12 用户需求「代码在线运行看结果」）
 * @module views/domain-learning/code-runner
 *
 * 用户拍板：先只做 JS/TS（离线、无新依赖）。做法与边界：
 * - **不引入 `eval` 依赖**：把片段代码**内联进 Worker 源码**（Blob URL），Worker 顶层执行即可，
 *   因此不需要给 CSP 开 `'unsafe-eval'`（只需 `worker-src blob:`）；
 * - 沙箱：Worker 里没有 DOM（document/window 不存在），并把网络 API（fetch/XMLHttpRequest/
 *   WebSocket/EventSource/importScripts）连同全局对象别名（self/globalThis/navigator——
 *   否则 `self.fetch` 可绕过遮蔽，navigator.sendBeacon 仍是网络出口）用函数参数
 *   **遮蔽为 undefined**——模型给的片段拿不到网络；
 * - 护栏：3 秒超时（主线程 terminate，死循环也只卡 Worker 不卡界面）、输出限 200 行 / 每行 400 字；
 * - 环境不支持（无 Worker/Blob，如 happy-dom 单测环境）→ 返回可读错误而不是抛错。
 *
 * 纯函数部分（Worker 源码拼装 / 输出裁剪）单独导出便于 TDD。
 */

/** 运行护栏（可调） */
export const RUN_LIMITS = {
  timeoutMs: 3000,
  maxLines: 200,
  maxLineChars: 400,
  /** Worker 消息收集硬上限：3 秒窗口内 `while(true) console.log(...)` 之类片段
   *  若不设上限，主线程会被 postMessage 洪冲刷、瞬时内存尖峰（超限后直接丢弃） */
  maxCollectedMessages: 5000,
} as const

export interface RunResult {
  ok: boolean
  /** console 输出（已按类型加前缀与裁剪） */
  output: string[]
  /** 运行错误（语法/运行时/超时/环境不支持） */
  error?: string
  durationMs: number
  /** 是否被截断（超时或输出超限） */
  truncated?: boolean
}

/** Worker 内部用的值格式化（对象安全、限制长度）——写成字符串常量注入 Worker */
const WORKER_FORMAT_SOURCE = `
function __fmt(v) {
  var t = typeof v
  if (t === 'string') return v
  if (v === null) return 'null'
  if (t === 'undefined') return 'undefined'
  if (t === 'number' || t === 'boolean' || t === 'bigint') return String(v)
  if (t === 'function') return '[function ' + (v.name || 'anonymous') + ']'
  if (v instanceof Error) return v.name + ': ' + v.message
  if (Array.isArray(v) || (typeof v === 'object' && v && typeof v.length === 'number' && t !== 'function')) {
    try {
      var arr = Array.prototype.slice.call(v)
      if (arr.length && arr.every(function (x) { return typeof x === 'number' })) return '[' + arr.join(', ') + ']'
    } catch (e) {}
  }
  try {
    var seen = []
    var json = JSON.stringify(v, function (k, val) {
      if (typeof val === 'object' && val !== null) {
        if (seen.indexOf(val) >= 0) return '[Circular]'
        seen.push(val)
      }
      if (typeof val === 'bigint') return String(val)
      return val
    })
    return json === undefined ? String(v) : json
  } catch (e) {
    try { return String(v) } catch (e2) { return '[unprintable]' }
  }
}
`

/**
 * 拼装 Worker 源码：把片段内联为 Worker 顶层代码（无需 eval），并捕获 console 与异常。
 * 片段外层用 IIFE 隔开，避免它污染 __send/__fmt 等内部实现。
 */
export function buildRunnerWorkerSource(code: string): string {
  const body = String(code ?? '')
  return `'use strict'
var __lines = []
function __post(type, payload) { try { self.postMessage({ __dl: type, payload: payload }) } catch (e) {} }
${WORKER_FORMAT_SOURCE}
var __console = {
  log: function () { __post('log', Array.prototype.map.call(arguments, __fmt).join(' ')) },
  info: function () { __post('log', Array.prototype.map.call(arguments, __fmt).join(' ')) },
  debug: function () { __post('log', Array.prototype.map.call(arguments, __fmt).join(' ')) },
  warn: function () { __post('warn', Array.prototype.map.call(arguments, __fmt).join(' ')) },
  error: function () { __post('error', Array.prototype.map.call(arguments, __fmt).join(' ')) }
}
;(function (console, fetch, XMLHttpRequest, WebSocket, EventSource, importScripts, Worker, document, window, parent, top, self, globalThis, navigator, postMessage) {
  try {
${body}
  } catch (err) {
    __post('throw', (err && err.name ? err.name + ': ' + err.message : String(err)))
  } finally {
    __post('done', null)
  }
})(__console, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined)
`
}

/** 输出裁剪：限行数、限每行长度，并追加截断提示 */
export function trimOutput(
  lines: string[],
  limits: { maxLines: number; maxLineChars: number } = RUN_LIMITS,
): { lines: string[]; truncated: boolean } {
  let truncated = false
  const out: string[] = []
  for (const raw of lines.slice(0, limits.maxLines)) {
    if (raw.length > limits.maxLineChars) {
      out.push(`${raw.slice(0, limits.maxLineChars)}…（本行已截断）`)
      truncated = true
    } else {
      out.push(raw)
    }
  }
  if (lines.length > limits.maxLines) {
    out.push(`…（还有 ${lines.length - limits.maxLines} 行输出未显示）`)
    truncated = true
  }
  return { lines: out, truncated }
}

/** 运行环境是否支持 Worker 沙箱（单测/SSR 环境不支持 → 走可读错误分支） */
export function canRunInWorker(): boolean {
  return typeof Worker !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
}

/**
 * 在 Worker 沙箱里运行一段 JS，收集 console 输出。
 * @param code 片段代码（来自讲义代码块，属于模型/用户产出）
 */
export async function runJsSnippet(
  code: string,
  opts: { timeoutMs?: number; maxLines?: number; maxLineChars?: number } = {},
): Promise<RunResult> {
  const timeoutMs = opts.timeoutMs ?? RUN_LIMITS.timeoutMs
  const maxLines = opts.maxLines ?? RUN_LIMITS.maxLines
  const maxLineChars = opts.maxLineChars ?? RUN_LIMITS.maxLineChars
  const started = Date.now()
  if (!canRunInWorker()) {
    return { ok: false, output: [], error: '当前环境不支持运行代码（需要在应用界面里运行）', durationMs: 0 }
  }
  const lines: string[] = []
  const maxMessages = opts.maxLines ? Math.max(opts.maxLines * 5, RUN_LIMITS.maxCollectedMessages) : RUN_LIMITS.maxCollectedMessages
  let droppedMessages = 0
  let worker: Worker | null = null
  let url = ''
  try {
    const blob = new Blob([buildRunnerWorkerSource(code)], { type: 'application/javascript' })
    url = URL.createObjectURL(blob)
    worker = new Worker(url)
  } catch (e) {
    if (url) URL.revokeObjectURL(url)
    return { ok: false, output: [], error: `无法创建运行沙箱：${(e as Error).message}`, durationMs: Date.now() - started }
  }

  const w = worker
  return await new Promise<RunResult>((resolve) => {
    let settled = false
    let timedOut = false
    let throwError: string | undefined

    const finish = (): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      w.terminate()
      URL.revokeObjectURL(url)
      const trimmed = trimOutput(lines, { maxLines, maxLineChars })
      if (droppedMessages > 0) trimmed.lines.push(`…（输出量过大，另有 ${droppedMessages} 条消息被丢弃）`)
      resolve({
        ok: !throwError,
        output: trimmed.lines,
        ...(throwError ? { error: throwError } : {}),
        durationMs: Date.now() - started,
        ...(trimmed.truncated || timedOut ? { truncated: true } : {}),
      })
    }

    const timer = setTimeout(() => {
      timedOut = true
      finish()
    }, timeoutMs)

    w.onmessage = (ev: MessageEvent) => {
      const data = ev.data as { __dl?: string; payload?: unknown }
      if (!data || typeof data.__dl !== 'string') return
      const isOutput = data.__dl === 'log' || data.__dl === 'warn' || data.__dl === 'error' || data.__dl === 'throw'
      if (isOutput && lines.length >= maxMessages) {
        droppedMessages++
        if (data.__dl === 'throw') throwError = String(data.payload ?? '运行出错')
        return
      }
      // 收包侧先截断：条数上限挡不住单条大对象（__fmt 的 JSON 可达数 MB），内存尖峰要两条一起防
      const text = String(data.payload ?? '').slice(0, 4000)
      if (data.__dl === 'log') lines.push(text)
      else if (data.__dl === 'warn') lines.push(`⚠️ ${text}`)
      else if (data.__dl === 'error') lines.push(`⛔ ${text}`)
      else if (data.__dl === 'throw') {
        throwError = String(data.payload ?? '运行出错')
        lines.push(`✗ ${throwError}`)
      } else if (data.__dl === 'done') finish()
    }
    w.onerror = (ev: ErrorEvent) => {
      throwError = ev.message || '运行沙箱出错'
      lines.push(`✗ ${throwError}`)
      finish()
    }
    // 若片段是异步的（Promise/setTimeout），done 可能先到；超时兜底由 timer 负责
  })
}
