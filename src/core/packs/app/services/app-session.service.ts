/**
 * 应用会话服务（片2）：应用下会话的创建/启动（多轮）/审核恢复 + 事件桥（引擎事件→会话卡片消息）
 * @module core/packs/app/services/app-session.service
 * @description
 *  - 会话消息复用 messages 表（dialog_id = session.id），卡片类型存 metadata.sessionCard（WORKFLOW_SESSION_CARDS）
 *  - 引擎事件经事件桥写入会话（不依赖任何前端在线）：run-status / review-requested(form) /
 *    node-status（进度曲线，追加式）/ runStatus 终态（聚合报告输出为结果卡片）
 *  - runId↔session 内存映射：startRun 登记，终态清除（防泄漏）；会话页刷新按 last_run_id 兜底重拉
 *  - 多轮：startRun 未提供 inputs 时沿用 lastStartInputs（defaultValue 合并由 runService 完成）
 *  - ALS 纪律：引擎调用（startRun/resumeReview/getRun）由 WorkflowRunService 内部 runWithUserAsync 包裹，
 *    本服务无需重复包裹（同构于 workflow-run 编排层）。
 */

import type { AppSessionRecord } from '@shared/types/app.types'
import { APP_SESSION_STATUSES, WORKFLOW_SESSION_CARDS, type SessionCardMeta } from '@shared/types/app.types'
import { WORKFLOW_RUN_EVENT_CHANNEL, WORKFLOW_RUN_EVENT_TYPES, WORKFLOW_RUN_STATUSES, WORKFLOW_RUN_TERMINAL_STATUSES, WORKFLOW_TRIGGER_TYPES, type WorkflowRunEvent } from '@shared/types/workflow.types'
import type { EventBus, PlatformEvent, Subscription } from '@shared/types/event.types'
import { DEFAULT_RUN_EVENT_CHANNEL_TYPES, translateRunPlatformEvent } from '@core/platform/services/event-system/workflow-run-event-map'
import { createLogger } from '@core/utils/logger'

const logger = createLogger('AppSessionService')

/**
 * 事件桥的命名持久消费者名（10-event-system §9 末行，M2 迁移）。
 * 系统级消费者（user_scope='*'，boot 无 ALS；§8 登记点即此）：Web 服务端需为全部
 * 租户的会话写卡片，runToSession 映射本就跨用户。
 */
export const APP_SESSION_EVENT_CONSUMER = 'app-session-bridge'

/** 幂等去重集上限（event.id 维；FIFO 淘汰。量级：人机交互千条/日，1 万足够覆盖重投窗口） */
const PROCESSED_EVENT_IDS_CAP = 10_000

type RunServiceLike = {
  startRun(input: {
    definitionId: string
    triggerType: string
    inputs?: Record<string, unknown>
    triggerInfo?: Record<string, unknown>
  }): Promise<{ id: string; status: string; skipReason?: string | null }>
  /** 运行详情（含节点执行记录）——finishSucceeded 聚合 report/message 输出用 */
  getRunDetail?(runId: string): Promise<{ run: { status: string; error?: string | null }; nodeRuns: Array<{ nodeType?: string; output?: Record<string, unknown> | null }> } | null>
  /** 审核决策（review M3：走 runService 以经过 S7 指派校验，而非直通引擎） */
  reviewDecide(runId: string, nodeId: string, decision: { decision: 'approve' | 'approve_with_changes' | 'reject'; editedValues?: Record<string, unknown>; choice?: string }, userId: string): Promise<{ success: boolean; error?: string }>
}

type EngineLike = {
  resumeReview(runId: string, nodeId: string, decision: {
    decision: 'approve' | 'approve_with_changes' | 'reject'
    editedValues?: Record<string, unknown>
    choice?: string
  }): Promise<boolean>
}

export interface AppSessionDeps {
  appSessions: {
    findById(id: string): Promise<AppSessionRecord | null>
    create(i: { id?: string; appId: string; title: string; status?: string; lastStartInputs?: Record<string, unknown> | null }): Promise<AppSessionRecord>
    update(id: string, patch: { title?: string; status?: string; lastRunId?: string | null; lastStartInputs?: Record<string, unknown> | null }): Promise<AppSessionRecord | null>
    listByApp(appId: string): Promise<AppSessionRecord[]>
    listByStatus(status: string): Promise<AppSessionRecord[]>
    deleteByApp(appId: string): Promise<number>
    delete(id: string): Promise<number>
  }
  messages: {
    create(m: { dialogId: string; role: string; content: string; metadata?: Record<string, unknown> }): Promise<unknown>
    getByDialogId(dialogId: string): Promise<unknown[]>
  }
  /**
   * 应用会话独立消息仓库（隔离 AI 对话表）。createSession 不再往 dialogs 表建占位行，
   * 所有会话消息写/读都走此仓库。
   */
  appSessionMessages: {
    create(m: { sessionId: string; role: string; content: string; metadata?: Record<string, unknown> | null }): Promise<unknown>
    getBySessionId(sessionId: string): Promise<unknown[]>
    deleteBySessionId(sessionId: string): Promise<number>
  }
  runService: RunServiceLike
  engine: EngineLike
}

type AppsLike = {
  findById(id: string): Promise<{ id: string; name: string; sourceId: string; channelSession: number; enabled: number } | null>
}
type DefsLike = {
  getById(id: string): Promise<{ publishedGraph: { nodes: Array<{ type?: string; config?: { inputs?: unknown[] } }> } } | null>
}
type TapSource = { tapEvents(cb: (channel: string, data: unknown, userId: string | null) => void): () => void }

export class AppSessionService {
  /** runId → sessionId（事件桥定位；终态清除防泄漏） */
  private readonly runToSession = new Map<string, string>()
  /**
   * 事件桥写卡串行队列（better-sqlite3 单连接：多个事务并发启动会交错，
   * 后发 COMMIT 报 "no transaction is active"——事件必须按序落库）
   */
  private cardQueue: Promise<void> = Promise.resolve()

  constructor(
    private readonly deps: AppSessionDeps,
    private readonly apps: AppsLike,
    private readonly defs: DefsLike,
    private readonly tapSource?: TapSource
  ) {}

  /** 串行化写卡（FIFO 保序；失败隔离不阻断后续卡片） */
  private enqueueCard(sessionId: string, fn: () => Promise<unknown>): void {
    const next = this.cardQueue.then(() => fn()).catch(e => {
      logger.error(`[AppSessionService] 写卡失败（session=${sessionId}）`, e)
    })
    this.cardQueue = next.then(
      () => undefined,
      () => undefined
    )
  }

  /** boot 装配：注入事件桥（web/electron 均经 getEventEmitter().tapEvents） */
  attach(tap: (cb: (channel: string, data: unknown, userId: string | null) => void) => () => void): void {
    tap((channel, data, _userId) => {
      logger.debug('[AppSessionService] tap 事件', { channel, type: (data as any)?.type, runId: (data as any)?.runId })
      if (channel !== WORKFLOW_RUN_EVENT_CHANNEL) return
      try {
        this.handleRunEvent(data as WorkflowRunEvent)
      } catch (e) {
        // 事件桥异常不阻断事件广播（对齐 tap 纪律：单个消费者失败不影响其它）
        logger.error('[AppSessionService] 事件桥处理异常', e)
      }
    })
  }

  // ==================== 平台事件消费者（M2，10-event-system §9 末行） ====================

  /** 平台事件订阅句柄（attachEventConsumer 幂等判定） */
  private eventSubscription: Subscription | null = null
  /** 已处理事件 id 去重集（§5.5 消费者幂等约定；Map 插入序即 FIFO 淘汰序） */
  private readonly processedEventIds = new Map<string, true>()

  /**
   * 挂接平台事件总线（命名持久消费者 'app-session-bridge'，替代 tapEvents 桥）：
   * - at-least-once：崩溃窗口的事件由游标在重启后补投，不再依赖前端在线/至多一次推送；
   * - startFrom='latest'：新建游标从当前最大 seq 起订——只关心订阅之后的事件，
   *   不补投历史（否则会"启动时狂补历史卡片"，§5.2 startFrom 语义）；
   * - 幂等：按 event.id 去重（补投/重投不重复写会话卡片）。
   */
  attachEventConsumer(bus: EventBus): void {
    if (this.eventSubscription) return
    this.eventSubscription = bus.subscribe(
      { types: [...DEFAULT_RUN_EVENT_CHANNEL_TYPES] },
      event => this.handlePlatformEvent(event),
      { consumerName: APP_SESSION_EVENT_CONSUMER, startFrom: 'latest' }
    )
    logger.info(`[AppSessionService] 平台事件消费者已挂接（consumer=${APP_SESSION_EVENT_CONSUMER}）`)
  }

  /** 平台事件 → 五型载荷 → 会话卡片（幂等键：event.id，§5.5） */
  private handlePlatformEvent(event: PlatformEvent): void {
    try {
      if (this.processedEventIds.has(event.id)) return // at-least-once 补投去重
      if (this.processedEventIds.size >= PROCESSED_EVENT_IDS_CAP) {
        // FIFO 淘汰最旧条目（Map 迭代序 = 插入序）
        const oldest = this.processedEventIds.keys().next()
        if (!oldest.done) this.processedEventIds.delete(oldest.value)
      }
      this.processedEventIds.set(event.id, true)
      const wfEvent = translateRunPlatformEvent(event)
      if (!wfEvent) return // 未登记映射的扩展类型不写卡
      this.handleRunEvent(wfEvent)
    } catch (e) {
      // 桥异常不扩散为毒消息（写卡失败已在 enqueueCard 内隔离，此处防意外同步抛错）
      logger.error('[AppSessionService] 平台事件桥处理异常', e)
    }
  }

  // ==================== 会话 CRUD ====================

  /** 创建会话 + 写首条 start-form 卡片（form=发布图 start.inputs）；startInputs 落库供首轮沿用 */
  async createSession(appId: string, startInputs?: Record<string, unknown>): Promise<AppSessionRecord> {
    const app = await this.apps.findById(appId)
    if (!app || app.enabled !== 1) throw new Error('应用不可用或已停用')
    if (app.channelSession !== 1) throw new Error('应用未开启会话渠道')
    const def = await this.defs.getById(app.sourceId)
    const startNode = def?.publishedGraph?.nodes?.find(n => n.type === 'start')
    const form = Array.isArray(startNode?.config?.inputs) ? startNode.config.inputs : []

    const title = `会话 ${new Date().toLocaleDateString('zh-CN')}`
    // 隔离：应用会话独立存储，不再往 dialogs 表建占位行（避免污染 AI 对话）。
    // 会话 id 由仓库自生成，消息写入 app_session_messages（session_id）。
    const session = await this.deps.appSessions.create({
      appId,
      title,
      lastStartInputs: startInputs ?? null,
    })
    await this.writeCard(session.id, {
      card: WORKFLOW_SESSION_CARDS.startForm,
      appId,
      form,
    })
    return session
  }

  async listSessions(appId: string): Promise<AppSessionRecord[]> {
    return this.deps.appSessions.listByApp(appId)
  }

  async getSession(sessionId: string): Promise<AppSessionRecord | null> {
    return this.deps.appSessions.findById(sessionId)
  }

  async renameSession(sessionId: string, title: string): Promise<AppSessionRecord | null> {
    return this.deps.appSessions.update(sessionId, { title })
  }

  /** 删除会话：级联删会话消息（独立表）+ 会话行；运行中的会话先拒绝删除 */
  async deleteSession(sessionId: string): Promise<void> {
    const session = await this.deps.appSessions.findById(sessionId)
    if (!session) return
    if (session.status === APP_SESSION_STATUSES.running) {
      throw new Error('会话正在运行中，请等待结束或取消后删除')
    }
    // 会话消息在独立表（app_session_messages），不再依赖 dialog 级联删除
    await this.deps.appSessionMessages.deleteBySessionId(sessionId)
    await this.deps.appSessions.delete(sessionId)
    logger.info(`[AppSessionService] 会话删除：${sessionId}`)
  }

  async getSessionMessages(sessionId: string): Promise<unknown[]> {
    return this.deps.appSessionMessages.getBySessionId(sessionId)
  }

  /**
   * boot 恢复（workflow-boot 在引擎 recoverOnBoot 之后调用）：
   * 重建 runId→session 内存映射（进程重启后 Map 丢失）并对 running 会话收口——
   * - lastRunId 已终态（引擎 boot 已把在途 run 标 interrupted/timed_out，此处大概率命中）：
   *   succeeded → 补写结果卡片并归 idle；其余 → 写错误卡并置 failed
   * - 仍非终态（如挂起审核等待续跑）：重新登记 runToSession，事件桥继续接管
   * - 无 lastRunId 的 running 会话（异常态）：直接归 idle
   */
  async recoverOnBoot(): Promise<{ sessions: number; recovered: number; finalized: number }> {
    const sessions = await this.deps.appSessions.listByStatus(APP_SESSION_STATUSES.running)
    let recovered = 0
    let finalized = 0
    for (const s of sessions) {
      try {
        const runId = s.lastRunId
        if (!runId) {
          await this.deps.appSessions.update(s.id, { status: APP_SESSION_STATUSES.idle })
          continue
        }
        const detail = await this.deps.runService.getRunDetail?.(runId)
        const status = detail?.run?.status
        if (status && WORKFLOW_RUN_TERMINAL_STATUSES.has(status)) {
          if (status === WORKFLOW_RUN_STATUSES.succeeded) {
            await this.finishSucceeded(s.id, runId)
          } else {
            await this.writeCard(s.id, {
              card: WORKFLOW_SESSION_CARDS.message,
              runId,
              content: `运行${status}：${detail?.run?.error ?? '已结束'}`,
            })
            await this.deps.appSessions.update(s.id, { status: APP_SESSION_STATUSES.failed })
          }
          finalized++
        } else {
          this.runToSession.set(runId, s.id)
          recovered++
        }
      } catch (e) {
        // 单个会话恢复失败不阻断其余（boot 纪律：故障不致命）
        logger.error(`[AppSessionService] 会话恢复失败（session=${s.id}）`, e)
      }
    }
    if (sessions.length > 0) {
      logger.info(`[AppSessionService] boot 恢复：会话 ${sessions.length}（终态补写 ${finalized} / 映射重建 ${recovered}）`)
    }
    return { sessions: sessions.length, recovered, finalized }
  }

  // ==================== 启动/多轮 ====================

  async startRun(sessionId: string, inputs?: Record<string, unknown>): Promise<{ runId: string; status: string }> {
    const session = await this.deps.appSessions.findById(sessionId)
    if (!session) throw new Error('会话不存在')
    const app = await this.apps.findById(session.appId)
    if (!app || app.enabled !== 1) throw new Error('应用不可用或已停用')
    // 评审 #72：渠道关闭后已建会话同样不可再启动运行（对齐 createSession 的渠道开关语义）
    if (app.channelSession !== 1) throw new Error('应用未开启会话渠道')
    if (!app.sourceId) throw new Error('源工作流不存在')

    // 多轮：未提供 inputs 时沿用上次提交的参数（defaultValue 合并由 runService 完成）
    const effectiveInputs = inputs ?? session.lastStartInputs ?? {}

    const run = await this.deps.runService.startRun({
      definitionId: app.sourceId,
      triggerType: WORKFLOW_TRIGGER_TYPES.manual,
      inputs: effectiveInputs,
      triggerInfo: { source: 'app-session', appId: session.appId, sessionId },
    })
    if (run.status === WORKFLOW_RUN_STATUSES.skipped) {
      throw new Error('运行进行中：该工作流已有实例在运行，请稍候或取消后重试')
    }

    this.runToSession.set(run.id, sessionId)
    logger.info('[AppSessionService] startRun 已登记', { runId: run.id, sessionId })
    await this.deps.appSessions.update(sessionId, {
      status: APP_SESSION_STATUSES.running,
      lastRunId: run.id,
      lastStartInputs: effectiveInputs,
    })
    // 回显用户提交的参数（role=user 消息，前端渲染为"我"侧气泡；写入独立会话消息表）
    await this.deps.appSessionMessages.create({
      sessionId,
      role: 'user',
      content: this.formatInputsSummary(effectiveInputs),
      metadata: null,
    })
    await this.writeCard(sessionId, { card: WORKFLOW_SESSION_CARDS.runStatus, runId: run.id, status: run.status })
    return { runId: run.id, status: run.status }
  }

  /** 提交参数摘要（user 消息回显用；截断防超长） */
  private formatInputsSummary(inputs: Record<string, unknown>): string {
    try {
      const text = JSON.stringify(inputs)
      return text.length > 300 ? text.slice(0, 300) + '…' : text
    } catch {
      return '（参数无法序列化）'
    }
  }

  /** 审核恢复（runId 从会话 last_run_id 取；成功后由事件桥继续）。
   *  委托 WorkflowRunService.reviewDecide（review M3：直通 engine 曾绕过 S7 指派校验）。 */
  async reviewDecide(
    sessionId: string,
    nodeId: string,
    decision: { decision: 'approve' | 'approve_with_changes' | 'reject'; editedValues?: Record<string, unknown>; choice?: string }
  ): Promise<boolean> {
    const session = await this.deps.appSessions.findById(sessionId)
    if (!session?.lastRunId) throw new Error('会话没有运行中的任务')
    const result = await this.deps.runService.reviewDecide(session.lastRunId, nodeId, decision, session.userId ?? '')
    if (!result.success) throw new Error(result.error ?? '决策未生效')
    return true
  }

  // ==================== 事件桥 ====================

  /** 引擎 wf:run-event → 会话卡片消息（runId 维度定位会话） */
  handleRunEvent(ev: WorkflowRunEvent): void {
    if (!ev || typeof ev.runId !== 'string') return
    const sessionId = this.runToSession.get(ev.runId)
    if (!sessionId) {
      // 非应用会话触发的运行（分享页/API/编辑器）不写会话卡——warn 便于排查
      // 漏登记 / 误删映射问题（事件桥调试期定位过此路径）
      logger.debug('[AppSessionService] 事件未命中会话', { runId: ev.runId, type: ev.type })
      return
    }

    switch (ev.type) {
      case WORKFLOW_RUN_EVENT_TYPES.reviewRequested: {
        const p = (ev as { payload?: { form?: boolean; fields?: unknown[]; options?: unknown[]; interaction?: string } }).payload ?? {}
        // kind 判别：form-collect / 表单型 → 'form'；options → 'choose'；interaction=input → 'input'；其余 approve
        const kind = p.form ? 'form' as const
          : Array.isArray(p.options) && p.options.length ? 'choose' as const
          : p.interaction === 'input' ? 'input' as const : 'approve' as const
        this.enqueueCard(sessionId, () => this.writeCard(sessionId, {
          card: WORKFLOW_SESSION_CARDS.review,
          runId: ev.runId,
          nodeId: (ev as { nodeId?: string }).nodeId ?? '',
          kind,
          schema: p,
        }))
        break
      }
      case WORKFLOW_RUN_EVENT_TYPES.nodeStatus: {
        const ns = ev as { nodeId?: string; status?: string }
        this.enqueueCard(sessionId, () => this.writeCard(sessionId, { card: WORKFLOW_SESSION_CARDS.nodeStatus, runId: ev.runId, nodeId: ns.nodeId ?? '', status: ns.status ?? '' }))
        break
      }
      case WORKFLOW_RUN_EVENT_TYPES.runStatus: {
        const rs = ev as { status?: string; error?: string }
        if (rs.status === WORKFLOW_RUN_STATUSES.succeeded) {
          this.enqueueCard(sessionId, () => this.finishSucceeded(sessionId, ev.runId!))
        } else if (rs.status && WORKFLOW_RUN_TERMINAL_STATUSES.has(rs.status)) {
          // 非成功终态（failed/cancelled/timed_out/interrupted）统一收口；
          // running/waiting_review 等中间态不写卡（引擎启动时也会 emit run-status）
          this.enqueueCard(sessionId, async () => {
            await this.writeCard(sessionId, { card: WORKFLOW_SESSION_CARDS.message, runId: ev.runId!, content: `运行${rs.status}：${rs.error ?? '已结束'}` })
            await this.deps.appSessions.update(sessionId, { status: APP_SESSION_STATUSES.failed })
          })
          this.runToSession.delete(ev.runId!)
        }
        break
      }
      default:
        break
    }
  }

  /** 成功终态：聚合 run 详情的报告/消息节点输出写结果卡片 */
  private async finishSucceeded(sessionId: string, runId: string): Promise<void> {
    try {
      const detail = await this.deps.runService.getRunDetail?.(runId)
      const report = detail?.nodeRuns?.find(n => n.nodeType === 'report' && n.output?.markdown)
      if (report?.output) {
        await this.writeCard(sessionId, {
          card: WORKFLOW_SESSION_CARDS.report,
          runId,
          title: String(report.output.title ?? '报告'),
          markdown: String(report.output.markdown),
          format: report.output.format as string | undefined,
          filePath: report.output.filePath as string | undefined,
        })
      } else {
        // 无报告节点：以 message 节点输出或空占位
        const msg = detail?.nodeRuns?.find(n => n.nodeType === 'message' && n.output?.content)
        await this.writeCard(sessionId, {
          card: WORKFLOW_SESSION_CARDS.message,
          runId,
          content: msg ? String(msg.output.content) : '运行完成',
        })
      }
    } catch (e) {
      logger.warn('[AppSessionService] 成功终态聚合失败（写占位卡片）', e)
      await this.writeCard(sessionId, { card: WORKFLOW_SESSION_CARDS.message, runId, content: '运行完成' })
    } finally {
      // 终态收尾不得让 update 抛出的拒绝逃出（队列 catch 已兜底，此处再防一层）
      try {
        await this.deps.appSessions.update(sessionId, { status: APP_SESSION_STATUSES.idle })
      } catch (e) {
        logger.error('[AppSessionService] 会话归 idle 失败（runId 已清除）', e)
      }
      this.runToSession.delete(runId)
    }
  }

  /** 写会话卡片消息（metadata.sessionCard；写入独立会话消息表） */
  private writeCard(sessionId: string, card: SessionCardMeta): Promise<unknown> {
    return this.deps.appSessionMessages.create({
      sessionId,
      role: 'assistant',
      content: '',
      metadata: { sessionCard: card },
    })
  }
}
