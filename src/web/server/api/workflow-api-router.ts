/**
 * 工作流 REST API 路由（C3，spec v2 §6）
 * @module web/server/api/workflow-api-router
 * @description JWT 鉴权的机器可调用入口（与通用 IPC 桥互补——REST 便于外部
 *              系统集成 / curl / webhook 场景）：
 *              - POST /api/workflow/invoke/:definitionId   启动运行（inputs + override）
 *              - POST /api/workflow/run/:runId/stop        取消运行
 *              - GET  /api/workflow/run/:runId/events      SSE 实时事件流（wf:run-event 载荷）
 *
 *              override：{ [nodeId]: { [configKey]: value } } 一次性配置覆盖，
 *              引擎在模板解析前浅合并，不修改定义图（对齐 Bisheng override）。
 *
 *              SSE 实现：web-event-emitter 的服务端 tapEvents（不依赖 WS 客户端
 *              在线），按 tap 携带的 ALS userId + 载荷 runId 双重过滤；连接时先推
 *              run/nodeRuns 快照（晚订阅不丢终态），终态事件推完即关流。
 */

import { Router, type Request, type Response } from 'express'
import { runWithUserAsync } from '@core/context/user-context'
import { requireAuth } from '../auth/middleware'
import { WebSocketEventEmitter } from '../platform/web-event-emitter'
import { getWorkflowSubsystem } from '@core/modules/workflow/workflow-boot'
import {
  WORKFLOW_RUN_EVENT_CHANNEL,
  WORKFLOW_RUN_EVENT_TYPES,
  WORKFLOW_RUN_STATUSES,
  WORKFLOW_TRIGGER_TYPES,
} from '@shared/types/workflow.types'

/** 路由依赖的最小服务面（boot 子系统子集；测试可注入假实现） */
export interface WorkflowApiDeps {
  runService: {
    startRun(input: {
      definitionId: string
      triggerType: string
      triggerInfo?: Record<string, unknown>
      inputs?: Record<string, unknown>
      configOverrides?: Record<string, Record<string, unknown>>
    }): Promise<{ id: string; status: string; skipReason?: string | null }>
    cancelRun(runId: string, userId: string): Promise<boolean>
    getRunDetail(runId: string): Promise<{ run: { id: string; userId?: string | null; status: string } ; nodeRuns: unknown[] } | null>
  }
}

/** 事件 tap 订阅面（测试可注入） */
export interface EventTapSource {
  tapEvents(cb: (channel: string, data: unknown, userId: string | null) => void): () => void
}

/** run 终态集合（SSE 关流依据） */
const TERMINAL_STATUSES = new Set<string>([
  WORKFLOW_RUN_STATUSES.succeeded,
  WORKFLOW_RUN_STATUSES.failed,
  WORKFLOW_RUN_STATUSES.cancelled,
  WORKFLOW_RUN_STATUSES.skipped,
  WORKFLOW_RUN_STATUSES.timed_out,
  WORKFLOW_RUN_STATUSES.interrupted,
])

/** wf:run-event 载荷最小面（runStatus/nodeStatus 等判别联合的公共字段） */
interface RunEventPayload {
  type: string
  runId?: string
  status?: string
}

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no', // nginx 等反代不缓冲
} as const

export function createWorkflowApiRouter(deps: {
  getDeps: () => WorkflowApiDeps
  tapSource?: EventTapSource
}): Router {
  const router = Router()
  const tapSource: EventTapSource = deps.tapSource ?? WebSocketEventEmitter.getInstance()

  /** 统一错误响应 */
  const fail = (res: Response, e: unknown): void => {
    const message = e instanceof Error ? e.message : String(e)
    const status = /不存在|缺少必填/.test(message) ? 400 : 500
    res.status(status).json({ ok: false, error: message })
  }

  // ---- 启动运行 ----
  router.post('/invoke/:definitionId', requireAuth, async (req: Request, res: Response) => {
    try {
      const { runService } = deps.getDeps()
      const body = (req.body ?? {}) as {
        inputs?: Record<string, unknown>
        override?: Record<string, Record<string, unknown>>
      }
      const run = await runWithUserAsync(req.user!.userId, () =>
        runService.startRun({
          definitionId: String(req.params.definitionId),
          triggerType: WORKFLOW_TRIGGER_TYPES.manual,
          triggerInfo: { source: 'api' },
          inputs: body.inputs,
          configOverrides: body.override,
        })
      )
      res.json({ ok: true, data: { runId: run.id, status: run.status, skipReason: run.skipReason ?? null } })
    } catch (e) {
      fail(res, e)
    }
  })

  // ---- 取消运行 ----
  router.post('/run/:runId/stop', requireAuth, async (req: Request, res: Response) => {
    try {
      const { runService } = deps.getDeps()
      // 租户校验：非本人运行返回 404（不泄露存在性）
      const detail = await runWithUserAsync(req.user!.userId, () => runService.getRunDetail(String(req.params.runId)))
      if (!detail || detail.run.userId !== req.user!.userId) {
        res.status(404).json({ ok: false, error: '运行不存在' })
        return
      }
      const cancelled = await runWithUserAsync(req.user!.userId, () =>
        runService.cancelRun(String(req.params.runId), req.user!.userId)
      )
      res.json({ ok: true, data: { cancelled } })
    } catch (e) {
      fail(res, e)
    }
  })

  // ---- SSE 事件流 ----
  router.get('/run/:runId/events', requireAuth, (req: Request, res: Response) => {
    const runId = String(req.params.runId)
    const userId = req.user!.userId

    void (async () => {
      // 租户校验（异步——getRunDetail 走 ALS）
      const { runService } = deps.getDeps()
      const detail = await runWithUserAsync(userId, () => runService.getRunDetail(runId))
      if (!detail || detail.run.userId !== userId) {
        res.status(404).json({ ok: false, error: '运行不存在' })
        return
      }

      res.writeHead(200, SSE_HEADERS)
      const send = (event: string, data: unknown): void => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
      }

      // 1) 先推快照（晚订阅不丢状态；若已终态直接推完关流）
      send('snapshot', { run: detail.run, nodeRuns: detail.nodeRuns })
      if (TERMINAL_STATUSES.has(detail.run.status)) {
        send('done', { status: detail.run.status })
        res.end()
        return
      }

      // 2) 订阅后续事件（ALS userId + runId 双重过滤）
      let closed = false
      const close = (): void => {
        if (closed) return
        closed = true
        unsubscribe()
        clearInterval(heartbeat)
        res.end()
      }
      const unsubscribe = tapSource.tapEvents((channel, data, emitUserId) => {
        if (closed || channel !== WORKFLOW_RUN_EVENT_CHANNEL) return
        if (emitUserId !== userId) return // 跨租户事件不推
        const payload = data as RunEventPayload
        if (payload?.runId !== runId) return
        send(payload.type, payload)
        // runStatus 终态 → 推 done 并关流
        if (payload.type === WORKFLOW_RUN_EVENT_TYPES.runStatus && typeof (payload as { status?: string }).status === 'string'
          && TERMINAL_STATUSES.has((payload as { status: string }).status)) {
          send('done', { status: (payload as { status: string }).status })
          close()
        }
      })
      // 3) 心跳注释（防中间层空闲断连）
      const heartbeat = setInterval(() => {
        if (!closed) res.write(': heartbeat\n\n')
      }, 25_000)
      heartbeat.unref?.()

      req.on('close', close)
    })().catch(e => {
      if (!res.headersSent) fail(res, e)
      else res.end()
    })
  })

  return router
}

/**
 * 生产路由：从 boot 单例取服务。
 * 挂载：app.use('/api/workflow', workflowApiRouter)
 */
export default function workflowApiRouter(): Router {
  return createWorkflowApiRouter({
    getDeps: () => {
      // 静态导入的模块在 initWorkflowSubsystem 调用前无副作用（单例惰性）
      const sub = getWorkflowSubsystem()
      return { runService: sub.runService }
    },
  })
}
