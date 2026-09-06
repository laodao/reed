/**
 * 工作流执行日志（每步执行日志）
 * @module core/platform/workflow/workflow-run-logger
 * @description 订阅既有 run-event（wf:run-event，引擎/服务已在此通道发 runStatus /
 *              nodeStatus / review-requested / notify 等事件），按 runId 追加 JSONL，
 *              形成"运行时间线日志"，便于排查每步执行与定位问题。
 *              不做引擎改动：记录器只是事件通道的另一个订阅方（与 video-gen 节点
 *              tapEvents、app-session 桥同机制）。
 *
 *  落盘：dataPath/wf-run-logs/<runId>.log（Electron/Web 主进程均可用路径提供器）
 *  保留：不自动清理（与 workflow-reports 同类运行产物，由用户自行清理）
 */

import * as fs from 'fs'
import * as path from 'path'
import { getPathProvider } from '@core/interfaces/path.interface'
import { WORKFLOW_RUN_EVENT_CHANNEL } from '@shared/types/workflow.types'
import type { WorkflowRunEvent } from '@shared/types/workflow.types'

/** 一条执行日志（JSONL 行） */
export interface WorkflowRunLogEntry {
  ts: string
  runId: string
  type: string
  level: 'info' | 'warn' | 'error'
  nodeId?: string
  iterationIndex?: number
  status?: string
  message: string
  detail?: string
}

// 仅记录有意义的节点/运行变迁；node-progress（流式每 token 一条）噪音太大，不进时间线
const LOG_TYPES = new Set([
  'run-status',
  'node-status',
  'review-requested',
  'notify',
  'node-log',
])

function levelOf(ev: WorkflowRunEvent): WorkflowRunLogEntry['level'] {
  if (ev.type === 'notify') {
    const lv = (ev as { level?: string }).level
    if (lv === 'warning') return 'warn'
    if (lv === 'error') return 'error'
    return 'info'
  }
  if (ev.type === 'node-log') {
    const lv = (ev as { level?: string }).level
    if (lv === 'error') return 'error'
    if (lv === 'warn') return 'warn'
    return 'info'
  }
  if ((ev as { error?: unknown }).error) return 'error'
  if (ev.type === 'review-requested') return 'warn'
  return 'info'
}

/** 人类可读的消息（用于时间线展示） */
export function runEventMessage(ev: WorkflowRunEvent): string {
  const anyEv = ev as Record<string, unknown>
  const nodeId = typeof anyEv.nodeId === 'string' ? anyEv.nodeId : undefined
  const iter = anyEv.iterationIndex as number | undefined
  const status = typeof anyEv.status === 'string' ? anyEv.status : undefined
  const error = typeof anyEv.error === 'string' && anyEv.error ? anyEv.error : undefined
  const suffix = nodeId ? `${nodeId}${iter !== undefined && iter > 0 ? `#${iter}` : ''}` : ''
  switch (ev.type) {
    case 'run-status': {
      const text = error ? `运行 ${status}（失败：${error}）` : `运行 ${status}`
      return text
    }
    case 'node-status':
      return `${suffix || '节点'} → ${status ?? ''}${error ? `（${error}）` : ''}`
    case 'review-requested':
      return `人工审核请求：${suffix || '（未知节点）'}${error ? `（${error}）` : ''}`
    case 'notify': {
      const title = anyEv.title
      const message = anyEv.message
      return `通知：${typeof title === 'string' && title ? title : ''}${typeof message === 'string' && message ? ` ${message}` : ''}`
    }
    case 'node-progress':
      return `${suffix || '节点'} 进度：${status ?? ''}`
    case 'node-log': {
      const msg = anyEv.message
      const lv = anyEv.level
      return `${suffix || '节点'} ${lv ? `[${lv}] ` : ''}${typeof msg === 'string' ? msg : ''}`
    }
    default:
      return error ? `执行异常（${error}）` : '执行事件'
  }
}

export class WorkflowRunLogger {
  private stopFns: Array<() => void> = []

  private logsDir(): string {
    return path.join(getPathProvider().getDataPath(), 'wf-run-logs')
  }

  /** 追加一行（原子 appendFileSync） */
  append(entry: WorkflowRunLogEntry): void {
    try {
      const dir = this.logsDir()
      fs.mkdirSync(dir, { recursive: true })
      fs.appendFileSync(path.join(dir, `${sanitizeRunId(entry.runId)}.log`), JSON.stringify(entry) + '\n', 'utf-8')
    } catch (e) {
      // 日志写入失败不阻断运行（仅静默降级）
      console.warn('[WorkflowRunLogger] 追加日志失败:', (e as Error).message)
    }
  }

  /** 订阅通道：attach((cb) => getEventEmitter().tapEvents(cb))，兼容 Web 无 emitter 降级 */
  attach(connect: (cb: (channel: string, data: unknown, userId: string | null) => void) => unknown): void {
    try {
      const unsub = connect((channel, data) => {
        if (channel !== WORKFLOW_RUN_EVENT_CHANNEL) return
        const ev = data as WorkflowRunEvent | undefined
        if (!ev || !ev.type || !ev.runId) return
        if (!LOG_TYPES.has(ev.type)) return
        const anyEv = ev as Record<string, unknown>
        this.append({
          ts: new Date().toISOString(),
          runId: ev.runId,
          type: ev.type,
          level: levelOf(ev),
          nodeId: typeof anyEv.nodeId === 'string' ? anyEv.nodeId : undefined,
          iterationIndex: typeof anyEv.iterationIndex === 'number' ? anyEv.iterationIndex : undefined,
          status: typeof anyEv.status === 'string' ? anyEv.status : undefined,
          message: runEventMessage(ev),
          detail: JSON.stringify(ev).slice(0, 4000),
        })
      })
      if (typeof unsub === 'function') this.stopFns.push(unsub as () => void)
    } catch (e) {
      console.warn('[WorkflowRunLogger] 订阅执行日志失败（继续启动）:', (e as Error).message)
    }
  }

  /** 读取某运行的时间线日志（按时间升序；文件不存在返回空数组） */
  readRun(runId: string): WorkflowRunLogEntry[] {
    try {
      const file = path.join(this.logsDir(), `${sanitizeRunId(runId)}.log`)
      if (!fs.existsSync(file)) return []
      const raw = fs.readFileSync(file, 'utf-8')
      const out: WorkflowRunLogEntry[] = []
      for (const line of raw.split('\n')) {
        const t = line.trim()
        if (!t) continue
        try {
          out.push(JSON.parse(t) as WorkflowRunLogEntry)
        } catch { /* 忽略坏行 */ }
      }
      return out
    } catch {
      return []
    }
  }

  stop(): void {
    for (const fn of this.stopFns) {
      try { fn() } catch { /* 忽略 */ }
    }
    this.stopFns = []
  }
}

function sanitizeRunId(runId: string): string {
  return runId.replace(/[^\w.-]/g, '_')
}
