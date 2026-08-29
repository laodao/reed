/**
 * 工作流运行服务：启动（互斥/并发）/ 取消 / 续跑 / 审核委托 / 历史 / boot 恢复
 * @module core/modules/workflow/workflow-run.service
 * @description 引擎与存储之间的编排层：
 *              - 启动：同工作流互斥（命中→记 skipped）；全局并发超限→pending 排队
 *              - 引擎在后台执行（void + catch），绝不占住 IPC/HTTP 调用方
 *              - ALS 纪律：所有引擎调用以 runWithUserAsync(run.userId) 包裹
 *              - boot 恢复：running 且超时→timed_out，未超时→interrupted；
 *                waiting_review 保持挂起（重启后的审核决策 V1 不支持，需续跑重驱）
 */

import { LOCAL_DEFAULT_USER_ID, runWithUserAsync } from '@core/context/user-context'
import { getEventEmitter } from '@core/interfaces/event.interface'
import type { WorkflowGraph, WorkflowRunStatus, WorkflowStartInput, WorkflowTriggerType } from '@shared/types/workflow.types'
import { WORKFLOW_DEFAULTS, WORKFLOW_RUN_EVENT_CHANNEL, WORKFLOW_RUN_STATUSES, WORKFLOW_NODE_TYPES, WORKFLOW_TRIGGER_TYPES } from '@shared/types/workflow.types'
import { WorkflowEngineService, type ExecuteRunInput, type ReviewDecisionInput } from './engine/workflow-engine.service'
import type { WorkflowEngineDeps, WorkflowEventPort } from './engine/ports'
import { createWorkflowRunEventProducer } from '@core/services/event-system/workflow-run-producer'
import type {
  CreateWorkflowRunInput,
  UpdateWorkflowRunInput,
  WorkflowRunRecord,
  WorkflowRunStats,
} from '../../database/repositories/workflow-run.repository'
import type { WorkflowRunRepository } from '../../database/repositories/workflow-run.repository'
import type { WorkflowNodeRunRepository, WorkflowNodeRunRecord } from '../../database/repositories/workflow-node-run.repository'
import type { WorkflowDefinitionRepository } from '../../database/repositories/workflow-definition.repository'
import { createLogger } from '@core/utils/logger'

const logger = createLogger('WorkflowRunService')

/** 全局并发上限来源：构造入参（片6 接 settings 表后由调用方解析传入） */
export interface WorkflowRunServiceDeps {
  runs: WorkflowRunRepository
  nodeRuns: WorkflowNodeRunRepository
  definitions: WorkflowDefinitionRepository
  engine: WorkflowEngineService
  /** 全局并发运行上限（默认 WORKFLOW_DEFAULTS.maxConcurrentRuns） */
  maxConcurrentRuns?: number
  /** settings 表 wf:defaults 的全局执行设置覆盖层（boot 读取注入；优先级介于默认值与 definition.settings 之间） */
  globalSettings?: import('@shared/types/workflow.types').WorkflowExecutionSettings | null
}

/** 启动入参 */
export interface StartRunInput {
  definitionId: string
  triggerType: WorkflowTriggerType
  triggerInfo?: Record<string, unknown>
  inputs?: Record<string, unknown>
  /** C3 一次性配置覆盖（REST invoke 实验参数；透传引擎，不落定义） */
  configOverrides?: Record<string, Record<string, unknown>>
  /**
   * 强制执行发布图（C3b 分享页）：访客只跑 publishedGraph——不受草稿改动影响。
   * 手动触发缺省允许跑草稿（编辑器试运行的既有语义）。
   */
  usePublishedGraph?: boolean
}

/** 唯一约束冲突识别（评审 #31/#40）：SQLite 与 PG 的报错形态 */
function isUniqueConstraintError(e: unknown): boolean {
  const code = (e as { code?: string; driverError?: { code?: string } }) ?? {}
  if (code.code === '23505' || code.driverError?.code === '23505') return true
  const msg = e instanceof Error ? e.message : String(e)
  return /UNIQUE constraint failed|duplicate key value violates unique constraint/i.test(msg)
}

export class WorkflowRunService {
  /** 排队待启动的运行（全局并发超限时 FIFO） */
  private queue: Array<{ runId: string; userId: string; execInput: ExecuteRunInput }> = []
  /** 评审 #35：重启后 keptWaiting 审核运行的死线定时器（runId → timer），到期释放互斥槽 */
  private reviewTimeoutTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly maxConcurrentRuns: number

  constructor(private readonly deps: WorkflowRunServiceDeps) {
    this.maxConcurrentRuns = deps.maxConcurrentRuns ?? WORKFLOW_DEFAULTS.maxConcurrentRuns
  }

  /** 合并配置链：definition.settings 覆盖全局层（globalSettings） */
  private effectiveSettings(definitionSettings: unknown): import('@shared/types/workflow.types').WorkflowExecutionSettings | null {
    return { ...(this.deps.globalSettings ?? {}), ...((definitionSettings as object) ?? {}) }
  }

  /**
   * 启动一次运行。
   * 返回运行记录（status: running=已启动 / pending=排队 / skipped=互斥跳过）。
   */
  async startRun(input: StartRunInput): Promise<WorkflowRunRecord> {
    const def = await this.deps.definitions.getById(input.definitionId)
    if (!def) throw new Error('工作流不存在')

    // 互斥：同工作流已有 pending/running/waiting_review → 记 skipped（审计留痕）
    const holders = await this.deps.runs.findMutexHolders(input.definitionId)
    if (holders.length > 0) {
      return this.deps.runs.create({
        definitionId: input.definitionId,
        definitionVersion: def.publishedVersion,
        graphSnapshot: def.draftGraph ?? { version: 1, nodes: [], edges: [] },
        triggerType: input.triggerType,
        triggerInfo: input.triggerInfo,
        startInputs: input.inputs,
        status: WORKFLOW_RUN_STATUSES.skipped,
        skipReason: '同工作流已有运行中实例',
      })
    }

    // 图快照：已发布用发布图；未发布允许手动跑草稿（触发必须已发布，片6 校验）。
    // C3b：分享/外部入口强制发布图——访客不能执行未发布的草稿内容
    const graph: WorkflowGraph = input.usePublishedGraph
      ? (def.publishedGraph || def.draftGraph)
      : ((input.triggerType === WORKFLOW_TRIGGER_TYPES.manual && def.draftGraph) || def.publishedGraph || def.draftGraph)
    if (!graph || graph.nodes.length === 0) throw new Error('工作流没有可执行的图')
    // start 输入参数：required + 扩展规则校验，defaultValue 合并（定时/事件触发无来源时用默认值）
    const startNode = graph.nodes.find(n => n.type === WORKFLOW_NODE_TYPES.start)
    const inputDefs = (startNode?.config as { inputs?: WorkflowStartInput[] } | undefined)?.inputs ?? []
    const mergedInputs: Record<string, unknown> = { ...(input.inputs ?? {}) }
    for (const def2 of inputDefs) {
      if (mergedInputs[def2.key] === undefined && def2.defaultValue !== undefined) {
        mergedInputs[def2.key] = def2.defaultValue
      }
    }
    // P8：类型感知判空——空串/空数组/空对象均视为缺失（json 传 {} 不再漏检）
    const isEmptyInput = (v: unknown): boolean =>
      v === undefined ||
      v === null ||
      (typeof v === 'string' && v.trim() === '') ||
      (Array.isArray(v) && v.length === 0) ||
      (typeof v === 'object' && Object.keys(v).length === 0)
    // 必填 + 扩展规则（minLength/maxLength/pattern/min/max，与前端 RunInputForm 同规则；错误提示自动生成）
    const problems: string[] = []
    for (const def2 of inputDefs) {
      const label = def2.label || def2.key
      const v = mergedInputs[def2.key]
      if (def2.required && isEmptyInput(v)) {
        problems.push(`缺少必填的输入参数「${label}」`)
        continue
      }
      if (isEmptyInput(v)) continue
      const rule = def2.validation
      // 类型校验：数字字段收到非数字即报"类型不正确"
      if (def2.type === 'number' && typeof v !== 'number') {
        problems.push(`「${label}」类型不正确：应为数字`)
        continue
      }
      if (def2.type === 'json') {
        try { JSON.parse(String(v)) } catch { problems.push(`「${label}」类型不正确：JSON 格式无效`); continue }
      }
      // 模型字段：值为 { providerConfigId, modelId }，必填时两者都需有值
      if (def2.type === 'model') {
        const mv = v as { providerConfigId?: string; modelId?: string } | null | undefined
        if (def2.required && (!mv?.providerConfigId || !mv?.modelId)) {
          problems.push(`「${label}」需选择 Provider 与模型`)
        }
        continue
      }
      if (!rule) continue
      if (def2.type === 'string' || def2.type === 'textarea' || !def2.type) {
        const s = String(v)
        if (rule.minLength != null && s.length < rule.minLength) problems.push(`「${label}」长度不足：至少 ${rule.minLength} 个字符`)
        if (rule.maxLength != null && s.length > rule.maxLength) problems.push(`「${label}」超出长度：最多 ${rule.maxLength} 个字符`)
        if (rule.pattern) {
          try {
            if (!new RegExp(rule.pattern).test(s)) problems.push(`「${label}」格式不匹配`)
          } catch { /* 非法正则容错：不拦截 */ }
        }
      } else if (def2.type === 'number') {
        const n = v as number
        if (rule.min != null && n < rule.min) problems.push(`「${label}」不能小于 ${rule.min}`)
        if (rule.max != null && n > rule.max) problems.push(`「${label}」不能大于 ${rule.max}`)
      }
    }
    if (problems.length > 0) {
      throw new Error(`输入参数校验失败：${problems.join('；')}`)
    }

    // 评审 #31/#40：check-then-create 的竞态窗口由部分唯一索引兜底——
    // 并发第二个活动行插入被 DB 拒绝，此处捕获后与互斥检查同语义转 skipped 留痕
    let run: WorkflowRunRecord
    try {
      run = await this.deps.runs.create({
        definitionId: input.definitionId,
        definitionVersion: def.publishedVersion,
        graphSnapshot: graph,
        triggerType: input.triggerType,
        triggerInfo: input.triggerInfo,
        startInputs: mergedInputs,
        status: WORKFLOW_RUN_STATUSES.pending,
        timeoutAt: new Date(Date.now() + (def.settings?.maxDurationMs ?? WORKFLOW_DEFAULTS.maxDurationMs)),
      })
    } catch (e) {
      if (isUniqueConstraintError(e)) {
        return this.deps.runs.create({
          definitionId: input.definitionId,
          definitionVersion: def.publishedVersion,
          graphSnapshot: graph,
          triggerType: input.triggerType,
          triggerInfo: input.triggerInfo,
          startInputs: mergedInputs,
          status: WORKFLOW_RUN_STATUSES.skipped,
          skipReason: '同工作流已有运行中实例（并发启动被互斥约束拦截）',
        })
      }
      throw e
    }
    await this.launch(run.id, run.userId ?? LOCAL_DEFAULT_USER_ID, input.definitionId, graph, this.effectiveSettings(def.settings), mergedInputs, undefined, input.configOverrides, input.triggerInfo)
    return (await this.deps.runs.getById(run.id)) ?? run
  }

  /** 直接启动或进全局并发队列 */
  private async launch(
    runId: string,
    userId: string,
    definitionId: string,
    graph: WorkflowGraph,
    settings: import('@shared/types/workflow.types').WorkflowExecutionSettings | null,
    startInputs: Record<string, unknown> | null,
    resumedCheckpoints?: ExecuteRunInput['resumedCheckpoints'],
    configOverrides?: Record<string, Record<string, unknown>>,
    triggerInfo?: Record<string, unknown>
  ): Promise<void> {
    const execInput: ExecuteRunInput = {
      runId,
      userId,
      definitionId,
      graph,
      startInputs: startInputs ?? {},
      settings,
      resumedCheckpoints,
      configOverrides,
      triggerInfo,
    }
    if (this.deps.engine.activeRunningCount >= this.maxConcurrentRuns) {
      this.queue.push({ runId, userId, execInput })
      return
    }
    void this.executeRun(runId, userId, execInput)
  }

  /** 后台执行（引擎内部含看门狗/兜底 finalize）；完成后触发出队 */
  private async executeRun(runId: string, userId: string, execInput: ExecuteRunInput): Promise<void> {
    try {
      await runWithUserAsync(userId, () => this.deps.engine.execute(execInput))
    } catch (e) {
      logger.error('[WorkflowRunService] 引擎执行异常', e)
      // 引擎兜底失败时的最后防线：落 failed 终态
      try {
        await runWithUserAsync(userId, () =>
          this.deps.runs.update(runId, {
            status: WORKFLOW_RUN_STATUSES.failed,
            error: `引擎执行异常: ${e instanceof Error ? e.message : String(e)}`,
            finishedAt: new Date(),
          })
        )
      } catch (e2) {
        logger.error('[WorkflowRunService] 兜底落库失败', e2)
      }
    } finally {
      // 触发来源定义的 last_run_at 触达 + 队列出队
      const defId = execInput.definitionId
      if (defId) {
        void runWithUserAsync(userId, () =>
          this.deps.definitions.update(defId, { lastRunAt: new Date() })
        ).catch(e => logger.warn('[WorkflowRunService] lastRunAt 更新失败（不影响运行）', e))
      }
      this.drainQueue()
    }
  }

  /** FIFO 出队一个排队运行 */
  private drainQueue(): void {
    while (this.queue.length > 0 && this.deps.engine.activeRunningCount < this.maxConcurrentRuns) {
      const next = this.queue.shift()
      if (!next) break
      void this.executeRun(next.runId, next.userId, next.execInput)
    }
  }

  /** 取消：活动运行走引擎；排队/仅库中运行原子条件落库 */
  async cancelRun(runId: string, userId: string): Promise<boolean> {
    const cancelledByEngine = await runWithUserAsync(userId, () =>
      this.deps.engine.cancelRun(runId)
    )
    if (cancelledByEngine) return true
    // 排队中未启动：从队列移除并落库
    const idx = this.queue.findIndex(q => q.runId === runId)
    if (idx >= 0) this.queue.splice(idx, 1)
    const run = await this.deps.runs.getById(runId)
    if (!run) return false
    if ([WORKFLOW_RUN_STATUSES.pending, WORKFLOW_RUN_STATUSES.waiting_review].includes(run.status)) {
      // 评审 #34：原子条件迁移（UPDATE ... WHERE status IN），
      // 消除「读-判-写」窗口里与 resumeReview/引擎完结交错的终态覆盖
      return this.deps.runs.transitionIfStatus(runId, [WORKFLOW_RUN_STATUSES.pending, WORKFLOW_RUN_STATUSES.waiting_review], {
        status: WORKFLOW_RUN_STATUSES.cancelled,
        finishedAt: new Date(),
        cancelRequestedAt: new Date(),
      })
    }
    return false
  }

  /** 审核决策：委托引擎（活动挂起运行） */
  async reviewDecide(
    runId: string,
    nodeId: string,
    decision: ReviewDecisionInput,
    userId: string
  ): Promise<{ success: boolean; error?: string }> {
    const applied = await runWithUserAsync(userId, () =>
      this.deps.engine.resumeReview(runId, nodeId, decision)
    )
    if (!applied) {
      return {
        success: false,
        error: '决策未生效：运行不在活动挂起状态（应用重启后请先续跑），或提交被校验拒绝（如必填缺失/选项非法）',
      }
    }
    return { success: true }
  }

  /**
   * 断点续跑：新运行（resumed_from_run_id 链接），装配源运行 succeeded checkpoint。
   * 互斥同样适用（源运行必须是终态才可续跑）。
   */
  /**
   * 断点续跑：新运行（resumed_from_run_id 链接），装配源运行 succeeded checkpoint。
   * @param forceRerunNodeIds 强制重跑的节点（其 checkpoint 不装配，执行时重跑）——
   *        功能定稿"强制重跑指定节点"选项
   */
  async resumeRun(sourceRunId: string, forceRerunNodeIds?: string[]): Promise<WorkflowRunRecord> {
    const source = await this.deps.runs.getById(sourceRunId)
    if (!source) throw new Error('源运行不存在')
    if (![WORKFLOW_RUN_STATUSES.failed, WORKFLOW_RUN_STATUSES.cancelled, WORKFLOW_RUN_STATUSES.interrupted, WORKFLOW_RUN_STATUSES.timed_out, WORKFLOW_RUN_STATUSES.waiting_review].includes(source.status)) {
      throw new Error(`源运行状态 ${source.status} 不可续跑`)
    }
    // 互斥与 startRun 同语义：同工作流已有在途/挂起运行则拒绝
    // （waiting_review 源运行自身就占用互斥，需先取消才能续跑——错误消息说明出路）
    const holders = await this.deps.runs.findMutexHolders(source.definitionId)
    if (holders.length > 0) {
      throw new Error(
        `同工作流已有运行中实例（${holders[0].status}），请先取消或等待其结束后再续跑`
      )
    }
    const graph = source.graphSnapshot
    if (!graph) throw new Error('源运行缺少图快照')
    // 评审 #33：续跑运行沿用定义当前的执行设置与死线
    const def = await this.deps.definitions.getById(source.definitionId)
    if (!def) throw new Error('源工作流定义不存在（可能已被删除）')

    const checkpoints = await this.deps.nodeRuns.findSucceededWithOutput(sourceRunId)
    const run = await this.deps.runs.create({
      definitionId: source.definitionId,
      definitionVersion: source.definitionVersion,
      graphSnapshot: graph,
      triggerType: WORKFLOW_TRIGGER_TYPES.resume,
      // 继承源运行触发来源（C4 dialogId 等）+ 续跑溯源
      triggerInfo: { ...((source.triggerInfo as Record<string, unknown> | null) ?? {}), resumedFrom: sourceRunId },
      startInputs: source.startInputs,
      status: WORKFLOW_RUN_STATUSES.pending,
      // 评审 #33：续跑运行同样带定义级执行死线（否则重启/续跑链无限挂）
      timeoutAt: new Date(Date.now() + (def.settings?.maxDurationMs ?? WORKFLOW_DEFAULTS.maxDurationMs)),
      resumedFromRunId: sourceRunId,
    }).catch(e => {
      // 评审 #31/#40：检查与插入之间被并发运行抢先（唯一索引拒绝）——给出与互斥检查一致的出路提示
      if (isUniqueConstraintError(e)) {
        throw new Error('同工作流已有运行中实例（并发竞态，请稍后重试）')
      }
      throw e
    })
    await this.launch(
      run.id,
      run.userId ?? LOCAL_DEFAULT_USER_ID,
      source.definitionId,
      graph,
      // 评审 #33：续跑丢定义级执行设置（并发/循环/超时全落默认）——按 startRun 同款装配
      this.effectiveSettings(def.settings),
      source.startInputs,
      // 只装配根作用域 checkpoint（iteration 0）；循环体迭代行随未完成循环重跑
      checkpoints
        .filter(cp => cp.iterationIndex === 0 && !(forceRerunNodeIds ?? []).includes(cp.nodeId))
        .map(cp => ({
        nodeId: cp.nodeId,
        nodeType: cp.nodeType,
        nodeName: cp.nodeName,
        output: cp.output ?? {},
        routeTaken: cp.routeTaken,
      })),
      undefined,
      run.triggerInfo
    )
    return (await this.deps.runs.getById(run.id)) ?? run
  }

  getRun(runId: string): Promise<WorkflowRunRecord | null> {
    return this.deps.runs.getById(runId)
  }

  /** 运行详情（含节点执行记录，历史回放用） */
  async getRunDetail(runId: string): Promise<{ run: WorkflowRunRecord; nodeRuns: WorkflowNodeRunRecord[] } | null> {
    const run = await this.deps.runs.getById(runId)
    if (!run) return null
    const nodeRuns = await this.deps.nodeRuns.getByRun(runId)
    return { run, nodeRuns }
  }

  listByDefinition(definitionId: string, params: { status?: WorkflowRunStatus; page: number; pageSize: number }) {
    return this.deps.runs.listByDefinition(definitionId, params)
  }

  list(params: { status?: WorkflowRunStatus; page: number; pageSize: number }) {
    return this.deps.runs.list(params)
  }

  /** 当前用户待审核列表（顶栏徽标） */
  findWaitingReviews(): Promise<WorkflowNodeRunRecord[]> {
    return this.deps.nodeRuns.findWaitingReview()
  }

  /** 删除运行历史（连带节点记录） */
  async deleteRun(runId: string): Promise<void> {
    await this.deps.nodeRuns.deleteByRun(runId)
    await this.deps.runs.deleteById(runId)
  }

  /**
   * 评审 #35：为重启后仍在挂起审核的运行注册死线定时器。
   * 引擎的 tickReviewTimeouts 只遍历内存 activeExecutions，重启后纯库态的
   * waiting_review 运行无人看管——到点将其转 interrupted（可续跑），互斥槽随之释放。
   * 条件迁移保证与「用户先取消/续跑」并发时安全（状态已变则 no-op）。
   */
  private armWaitingReviewTimeout(run: WorkflowRunRecord): void {
    if (!run.timeoutAt) return
    const delay = run.timeoutAt.getTime() - Date.now()
    if (delay <= 0) return
    if (this.reviewTimeoutTimers.has(run.id)) return
    // setTimeout 延迟上限 2^31-1 ms（≈24.8 天），钳到上限内
    const timer = setTimeout(() => {
      this.reviewTimeoutTimers.delete(run.id)
      void runWithUserAsync(run.userId ?? LOCAL_DEFAULT_USER_ID, async () => {
        const moved = await this.deps.runs.transitionIfStatus(
          run.id,
          [WORKFLOW_RUN_STATUSES.waiting_review],
          {
            status: WORKFLOW_RUN_STATUSES.interrupted,
            finishedAt: new Date(),
            error: '审核等待已超时（应用重启后中断）',
          }
        )
        if (moved) {
          logger.info(`[WorkflowRunService] 重启后挂起审核运行 ${run.id} 到期转 interrupted，互斥槽已释放`)
        }
      }).catch(() => {})
    }, Math.min(delay, 2_147_483_647))
    // 定时器不阻止进程退出
    ;(timer as { unref?: () => void }).unref?.()
    this.reviewTimeoutTimers.set(run.id, timer)
  }

  /**
   * boot 恢复：跨租户扫描在途运行，按 userId 分组处理。
   * - running/pending 且 timeout_at 已过 → timed_out
   * - running/pending 未超时 → interrupted（不自动续跑，等用户操作）
   * - waiting_review → 保持（重启后审核决策 V1 不支持，需续跑重驱）
   */
  async recoverOnBoot(): Promise<{ timedOut: number; interrupted: number; keptWaiting: number }> {
    // 先处理已过期的挂起审核：标 interrupted（引擎内存态已丢失，续跑重驱）
    try {
      const expired = await this.deps.nodeRuns.scanExpiredWaitingReview(new Date())
      const expiredRunIds = [...new Set(expired.map(r => r.runId))]
      for (const runId of expiredRunIds) {
        const run = await this.deps.runs.getById(runId)
        if (run?.status === 'waiting_review') {
          await this.deps.runs.update(runId, {
            status: WORKFLOW_RUN_STATUSES.interrupted,
            error: '审核等待已超时（应用重启后中断）',
          })
        }
      }
    } catch (e) {
      logger.error('[WorkflowRunService] 过期审核清理失败（继续 boot 恢复）', e)
    }
    const recoverable = await this.deps.runs.scanBootRecoverable()
    const result = { timedOut: 0, interrupted: 0, keptWaiting: 0 }
    const byUser = new Map<string, WorkflowRunRecord[]>()
    for (const run of recoverable) {
      const uid = run.userId ?? LOCAL_DEFAULT_USER_ID
      const list = byUser.get(uid) ?? []
      list.push(run)
      byUser.set(uid, list)
    }
    const now = Date.now()
    for (const [userId, runs] of byUser) {
      await runWithUserAsync(userId, async () => {
        for (const run of runs) {
          if (run.status === 'waiting_review') {
            result.keptWaiting++
            // 评审 #35：重启后未到期的挂起审核也要在死线到点被处理——
            // 否则 keptWaiting 运行永久占互斥槽堵死该定义（tickReviewTimeouts 只扫内存态）
            this.armWaitingReviewTimeout(run)
            continue
          }
          const timedOut = run.timeoutAt ? run.timeoutAt.getTime() < now : false
          await this.deps.runs.update(run.id, {
            status: timedOut ? WORKFLOW_RUN_STATUSES.timed_out : WORKFLOW_RUN_STATUSES.interrupted,
            finishedAt: timedOut ? new Date() : null,
            error: timedOut ? '应用退出前已超时' : null,
          })
          if (timedOut) result.timedOut++
          else result.interrupted++
        }
      })
    }
    return result
  }
}

/**
 * 引擎依赖装配：仓库 → 引擎端口适配 + 事件推送到前端（wf:run-event 单通道）。
 * ⚠️ 事件 emit 依赖 ALS userId（Web 端按用户路由）——引擎调用链已在
 * runWithUserAsync 内，语义成立。
 *
 * M1 起（10-event-system §9）：emit 经 producer 适配器派生平台事件
 * （workflow.run.*，总线就绪时），由 ipc/ws 通道翻译回五型载荷推前端；
 * 总线未就绪/发布失败回退下方存量直推（前端实时推送不断、不影响恢复）。
 */
export function makeEngineDeps(
  runs: WorkflowRunRepository,
  nodeRuns: WorkflowNodeRunRepository
): WorkflowEngineDeps {
  // 存量直推路径（总线未启动/平台事件发布失败时的兜底；语义与改动前一致）
  const legacyEmit = (event: Parameters<WorkflowEventPort['emit']>[0]): void => {
    try {
      getEventEmitter().emit(WORKFLOW_RUN_EVENT_CHANNEL, event)
    } catch (e) {
      logger.warn('[WorkflowRunService] 事件推送失败（不影响执行）', e)
    }
  }
  return {
    runs: {
      patchRun: (runId, patch) =>
        runs.update(runId, patch as UpdateWorkflowRunInput).then(() => undefined),
    },
    nodeRuns: {
      startNode: input => nodeRuns.start(input),
      patchNode: (runId, nodeId, iterationIndex, patch) =>
        nodeRuns.update(runId, nodeId, iterationIndex, patch).then(() => undefined),
    },
    events: createWorkflowRunEventProducer(legacyEmit),
  }
}

export type { CreateWorkflowRunInput, UpdateWorkflowRunInput, WorkflowRunStats }
