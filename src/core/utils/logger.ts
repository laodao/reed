/**
 * 全局 Logger 组件（spec 2026-05-10 e2e 阶段补充）
 *
 * 项目原本通过散落的 console.log/warn/error 输出日志，没有：
 *   - 结构化字段（timestamp / level / module / context）
 *   - 文件持久化（事后审计）
 *   - level 过滤
 *
 * 本组件提供：
 *   - createLogger(module: string) → { debug/info/warn/error, child(ctx) }
 *   - 双 transport：console（保留 console.log 行为，兼容现有调试体验）+ file (JSONL)
 *   - file 路径在 initLogger() 时配置（web server / electron 启动时调用一次）
 *   - 子 logger（child）继承 module + 附加固定 context（如 sceneId / storyboardId）
 *
 * **不强制现有 99 个 console.log 立即迁移**。新代码（含 AI 调用 / 关键业务）开始用 logger，
 * 后续逐步替换；现有 console.log 保留兼容现有行为不破坏。
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  timestamp: string
  level: LogLevel
  module: string
  msg?: string
  ctx?: Record<string, unknown>
}

interface LoggerConfig {
  /** 文件输出根目录；不设置则只 console */
  logDir: string | null
  /** 全局最低 level（低于不输出）；默认 info */
  level: LogLevel
  /** 当前文件名（按日切；setPath 时计算） */
  currentFile: string | null
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

const config: LoggerConfig = {
  logDir: null,
  level: 'info',
  currentFile: null,
}

let writeQueue: Promise<void> = Promise.resolve()

/** 初始化 logger — web server / electron 启动时调用一次 */
export function initLogger(opts: { logDir: string; level?: LogLevel }): void {
  config.logDir = opts.logDir
  config.level = opts.level ?? 'info'
  rotateFileIfNeeded()
}

function rotateFileIfNeeded(): void {
  if (!config.logDir) return
  // 按日切：app-2026-05-10.jsonl
  const day = new Date().toISOString().slice(0, 10)
  const newPath = path.join(config.logDir, `app-${day}.jsonl`)
  if (config.currentFile !== newPath) {
    config.currentFile = newPath
    // 后台预创建（不报错）
    void fs.mkdir(config.logDir, { recursive: true })
      .then(() => fs.appendFile(newPath, ''))
      .catch(() => {})
  }
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[config.level]
}

function writeEntry(entry: LogEntry): void {
  rotateFileIfNeeded()
  // console transport（保留原有调试体验）
  const ctxStr = entry.ctx ? ' ' + safeStringify(entry.ctx) : ''
  const line = `[${entry.module}] ${entry.msg ?? ''}${ctxStr}`
  if (entry.level === 'error') console.error(line)
  else if (entry.level === 'warn') console.warn(line)
  else console.log(line)
  // file transport
  if (config.currentFile) {
    const json = JSON.stringify(entry) + '\n'
    writeQueue = writeQueue
      .then(() => fs.appendFile(config.currentFile!, json))
      .catch((e) => {
        console.error('[logger] 写文件失败:', e?.message ?? e)
      })
  }
}

function safeStringify(obj: unknown, max = 2000): string {
  try {
    const s = JSON.stringify(obj)
    return s.length > max ? s.slice(0, max) + '...' : s
  } catch {
    return '[unserializable]'
  }
}

export interface Logger {
  debug(msg: string, ...rest: unknown[]): void
  info(msg: string, ...rest: unknown[]): void
  warn(msg: string, ...rest: unknown[]): void
  error(msg: string, ...rest: unknown[]): void
  /** 创建子 logger，附加固定 context */
  child(extraCtx: Record<string, unknown>): Logger
}

/** 把 rest 参数归一化为 ctx：单 plain object → 直接用；其他 → 包成 { args: [...] } */
function normalizeRest(rest: unknown[]): Record<string, unknown> | undefined {
  if (rest.length === 0) return undefined
  if (rest.length === 1 && typeof rest[0] === 'object' && rest[0] !== null && !Array.isArray(rest[0])) {
    return rest[0] as Record<string, unknown>
  }
  return { args: rest }
}

function makeLogger(module: string, baseCtx?: Record<string, unknown>): Logger {
  const log = (level: LogLevel) => (msg: string, ...rest: unknown[]) => {
    if (!shouldLog(level)) return
    const restCtx = normalizeRest(rest)
    const merged = baseCtx || restCtx ? { ...(baseCtx ?? {}), ...(restCtx ?? {}) } : undefined
    writeEntry({
      timestamp: new Date().toISOString(),
      level,
      module,
      msg,
      ctx: merged,
    })
  }
  return {
    debug: log('debug'),
    info: log('info'),
    warn: log('warn'),
    error: log('error'),
    child(extraCtx) {
      return makeLogger(module, { ...(baseCtx ?? {}), ...extraCtx })
    },
  }
}

/** 工厂：每个模块拿自己的 logger */
export function createLogger(module: string): Logger {
  return makeLogger(module)
}

/**
 * 读取最近 N 条日志（按 module / level / context 过滤）— 给报告 / debug 工具用。
 * 不读今日之前的旧文件（按需扩展）。
 */
export async function tailLogs(filter?: {
  module?: string
  level?: LogLevel
  contextMatch?: (ctx: Record<string, unknown> | undefined) => boolean
  limit?: number
}): Promise<LogEntry[]> {
  if (!config.currentFile) return []
  let raw = ''
  try {
    raw = await fs.readFile(config.currentFile, 'utf-8')
  } catch {
    return []
  }
  const lines = raw.trim().split('\n').filter(Boolean)
  const all: LogEntry[] = []
  for (const line of lines) {
    try {
      const e = JSON.parse(line) as LogEntry
      if (filter?.module && e.module !== filter.module) continue
      if (filter?.level && e.level !== filter.level) continue
      if (filter?.contextMatch && !filter.contextMatch(e.ctx)) continue
      all.push(e)
    } catch {
      // skip bad line
    }
  }
  return all.slice(-(filter?.limit ?? 200))
}
