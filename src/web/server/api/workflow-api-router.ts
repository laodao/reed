/**
 * 工作流 REST API 路由（C3，spec v2 §6）
 * @module web/server/api/workflow-api-router
 * @description JWT 鉴权的机器可调用入口（与通用 IPC 桥互补——REST 便于外部
 *              系统集成 / curl / webhook 场景）：
 *              - POST /api/workflow/invoke/:definitionId   启动运行（inputs + override）
 *              - POST /api/workflow/run/:runId/stop        取消运行
 *              - GET  /api/workflow/run/:runId/events      SSE 实时事件流（wf:run-event 载荷）
 *
 *              免登录分享（C3 spec v2 §7；share_token 为 256bit 不可枚举随机串）：
 *              - GET  /api/workflow/share/:token                    定义元信息 + start 输入 schema
 *              - POST /api/workflow/share/:token/invoke             以定义所有者身份启动（禁 override）
 *              - GET  /api/workflow/share/:token/run/:runId/events  SSE（token↔run 配对校验）
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
  WORKFLOW_NODE_TYPES,
  WORKFLOW_RUN_EVENT_CHANNEL,
  WORKFLOW_RUN_EVENT_TYPES,
  WORKFLOW_RUN_STATUSES,
  WORKFLOW_TRIGGER_TYPES,
} from '@shared/types/workflow.types'

/** 免登录分享面返回的定义最小面（getByShareToken 契约） */
interface ShareDefinition {
  id: string
  name: string
  description: string | null
  userId: string | null
  publishedGraph: unknown
}

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
    getRunDetail(runId: string): Promise<{ run: { id: string; userId?: string | null; status: string; triggerInfo?: Record<string, unknown> | null } ; nodeRuns: unknown[] } | null>
  }
  /** C3 免登录分享面（getByShareToken 跨租户；返回含 userId 供所有者身份运行） */
  definitions?: {
    getByShareToken(token: string): Promise<ShareDefinition | null>
    getById?(id: string): Promise<ShareDefinition | null>
  }
  /** 应用模块分享面（片3：应用优先；回退工作流令牌） */
  apps?: {
    getByShareToken(token: string): Promise<{ id: string; name: string; userId: string | null; sourceId: string } | null>
  }
}

/** 事件 tap 订阅面（测试可注入） */
export interface EventTapSource {
  tapEvents(cb: (channel: string, data: unknown, userId: string | null) => void): () => void
}

/**
 * 匿名分享 invoke 限流（review#2）：每 token 滑动窗口。
 * 分享页 URL 天然会被转发/嵌入——持 token 者可无限以所有者身份消耗 LLM/API 配额。
 * 单实例内存实现（与 tapEvents 同部署约束）；命中限流返回 429。
 */
const SHARE_RATE_LIMIT = { windowMs: 60_000, max: 6 }
const shareInvokeLog = new Map<string, number[]>()

function shareRateLimited(token: string): boolean {
  const now = Date.now()
  const hits = (shareInvokeLog.get(token) ?? []).filter(t => now - t < SHARE_RATE_LIMIT.windowMs)
  if (hits.length >= SHARE_RATE_LIMIT.max) {
    shareInvokeLog.set(token, hits)
    return true
  }
  hits.push(now)
  shareInvokeLog.set(token, hits)
  return false
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

/**
 * SSE 运行事件流（authed 与 share 端点共用实现）。
 *
 * 竞态防护（review#3）：快照判定非终态 → 订阅 tap 之间存在窗口，终态事件可能恰好
 * 在窗口内发出而被错过——订阅后**复查一次** run 状态，已终态则补 done 关流。
 *
 * @param sanitize 快照脱敏函数（免登录面用：剔除 userId 等租户字段）；缺省原样
 */
async function streamRunEvents(opts: {
  res: Response
  req: Request
  runId: string
  ownerUserId: string
  runService: WorkflowApiDeps['runService']
  tapSource: EventTapSource
  fetchDetail: () => Promise<NonNullable<Awaited<ReturnType<WorkflowApiDeps['runService']['getRunDetail']>>>> | null
  sanitize?: <T>(snapshot: T) => T
}): Promise<void> {
  const { res, req, runId, ownerUserId, runService, tapSource } = opts
  const detail = await opts.fetchDetail()
  if (!detail) {
    res.status(404).json({ ok: false, error: '运行不存在' })
    return
  }

  res.writeHead(200, SSE_HEADERS)
  const send = (event: string, data: unknown): void => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  // 1) 快照先行（晚订阅不丢状态）
  send('snapshot', opts.sanitize ? opts.sanitize(detail) : detail)
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
  const finishIfTerminal = (status: string): boolean => {
    if (!TERMINAL_STATUSES.has(status)) return false
    send('done', { status })
    close()
    return true
  }
  const unsubscribe = tapSource.tapEvents((channel, data, emitUserId) => {
    if (closed || channel !== WORKFLOW_RUN_EVENT_CHANNEL) return
    if (emitUserId !== ownerUserId) return // 跨租户事件不推
    const payload = data as RunEventPayload
    if (payload?.runId !== runId) return
    send(payload.type, payload)
    if (payload.type === WORKFLOW_RUN_EVENT_TYPES.runStatus && typeof payload.status === 'string') {
      finishIfTerminal(payload.status)
    }
  })
  // 3) 心跳注释（防中间层空闲断连）
  const heartbeat = setInterval(() => {
    if (!closed) res.write(': heartbeat\n\n')
  }, 25_000)
  heartbeat.unref?.()
  req.on('close', close)

  // 4) 订阅后复查（窗口内到达终态的事件已错过——查库兜底）
  const recheck = await runService.getRunDetail(runId)
  if (recheck && TERMINAL_STATUSES.has(recheck.run.status)) {
    finishIfTerminal(recheck.run.status)
  }
}

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
    void streamRunEvents({
      res, req, runId, ownerUserId: userId,
      runService: deps.getDeps().runService,
      tapSource,
      fetchDetail: async () => {
        // 租户校验：非本人运行返回 404（不泄露存在性）
        const d = await runWithUserAsync(userId, () => deps.getDeps().runService.getRunDetail(runId))
        return d && d.run.userId === userId ? d : null
      },
    }).catch(e => {
      if (!res.headersSent) fail(res, e)
      else res.end()
    })
  })

  // ==================== C3 免登录分享（spec v2 §7） ====================

  /** 解析分享令牌 → (定义, 所有者)；无效返回 null（404 不泄露存在性） */
  const resolveShare = async (token: string): Promise<ShareDefinition | null> => {
    const { definitions, apps } = deps.getDeps()
    // 应用分享优先：应用令牌命中 → 用其 sourceId 的定义（发布图）
    const app = apps ? await apps.getByShareToken(token) : null
    if (app?.sourceId && definitions?.getById) {
      const ownerDef = await definitions.getById(app.sourceId)
      if (ownerDef) {
        return { id: ownerDef.id, name: app.name || ownerDef.name, description: ownerDef.description, userId: app.userId, publishedGraph: ownerDef.publishedGraph }
      }
      return null
    }
    if (!definitions) return null
    return definitions.getByShareToken(token)
  }

  /** 从已发布图提取 start 输入 schema（免登录表单渲染用） */
  const shareInputSchema = (graph: unknown): Array<Record<string, unknown>> => {
    const nodes = (graph as { nodes?: Array<{ type?: string; config?: { inputs?: Array<Record<string, unknown>> } }> } | null)?.nodes ?? []
    const start = nodes.find(n => n.type === WORKFLOW_NODE_TYPES.start)
    return Array.isArray(start?.config?.inputs) ? start.config.inputs : []
  }

  // ---- 分享定义元信息（免登录） ----
  router.get('/share/:token', async (req: Request, res: Response) => {
    try {
      const found = await resolveShare(String(req.params.token))
      if (!found) {
        res.status(404).json({ ok: false, error: '分享链接无效或已停止分享' })
        return
      }
      res.json({
        ok: true,
        data: {
          definitionId: found.id,
          name: found.name,
          description: found.description,
          inputs: shareInputSchema(found.publishedGraph),
        },
      })
    } catch (e) {
      fail(res, e)
    }
  })

  // ---- 免登录启动（以定义所有者身份；禁 override——实验参数不对访客开放） ----
  router.post('/share/:token/invoke', async (req: Request, res: Response) => {
    try {
      const { runService } = deps.getDeps()
      const found = await resolveShare(String(req.params.token))
      if (!found) {
        res.status(404).json({ ok: false, error: '分享链接无效或已停止分享' })
        return
      }
      if (!found.userId) {
        res.status(400).json({ ok: false, error: '该工作流不支持分享运行' })
        return
      }
      if (shareRateLimited(String(req.params.token))) {
        res.status(429).json({ ok: false, error: '请求过于频繁，请稍后再试' })
        return
      }
      const body = (req.body ?? {}) as { inputs?: Record<string, unknown> }
      // 以定义所有者身份运行（跨租户例外由 token 授权——所有者主动分享了该定义）
      const run = await runWithUserAsync(found.userId, () =>
        runService.startRun({
          definitionId: found.id,
          triggerType: WORKFLOW_TRIGGER_TYPES.manual,
          triggerInfo: { source: 'share', shareToken: String(req.params.token) },
          inputs: body.inputs,
          // 访客只跑发布图：不受所有者草稿改动影响（表单 schema 也来自 publishedGraph）
          usePublishedGraph: true,
        })
      )
      res.json({ ok: true, data: { runId: run.id, status: run.status } })
    } catch (e) {
      fail(res, e)
    }
  })

  // ---- 免登录 SSE（token↔run 配对校验：run.triggerInfo.shareToken 必须等于 token） ----
  router.get('/share/:token/run/:runId/events', (req: Request, res: Response) => {
    const token = String(req.params.token)
    const runId = String(req.params.runId)

    void (async () => {
      const { runService } = deps.getDeps()
      const found = await resolveShare(token)
      if (!found || !found.userId) {
        res.status(404).json({ ok: false, error: '分享链接无效或已停止分享' })
        return
      }
      const owner = found.userId
      // 快照脱敏：免登录面不回传 userId 等租户信息（nodeRuns 只保留展示字段）
      const sanitize = <T extends { run?: Record<string, unknown>; nodeRuns?: unknown[] }>(snap: T): T => {
        if (snap.run) {
          const { userId: _omit, triggerInfo: _omit2, ...runSafe } = snap.run
          snap.run = runSafe as T['run']
        }
        snap.nodeRuns = (snap.nodeRuns ?? []).map((n) => {
          const row = n as Record<string, unknown>
          return {
            nodeId: row.nodeId,
            nodeName: row.nodeName,
            iterationIndex: row.iterationIndex,
            nodeType: row.nodeType,
            status: row.status,
            error: row.error,
            durationMs: row.durationMs,
            // input 是模板解析后的完整配置——可能含所有者内部 URL/参数，免登录面不回传
            output: typeof row.output === 'string' ? row.output : undefined,
          }
        })
        return snap
      }
      await streamRunEvents({
        res, req, runId, ownerUserId: owner,
        runService,
        tapSource,
        sanitize,
        fetchDetail: async () => {
          const detail = await runWithUserAsync(owner, () => runService.getRunDetail(runId))
          const triggerInfo = detail?.run.triggerInfo as { shareToken?: string } | null | undefined
          if (!detail || detail.run.userId !== owner || triggerInfo?.shareToken !== token) return null
          return detail
        },
      })
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
      return { runService: sub.runService, definitions: sub.definitionService }
    },
  })
}
