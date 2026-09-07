/**
 * 任务树服务（26 号 M3 批2/批3 / 01 号 §5-§6；对抗 review 修复版）
 * @module core/platform/agent-runtime/tasks/task-service
 *
 * 状态机：pending_review →(批准整树) ready → running → verifying →
 * succeeded / failed →（带反馈重试）ready /（重规划）replanned+子树 → 聚合 /
 * escalated。replanned 节点参与聚合调度（review T2：曾是死状态）。
 *
 * 调度（01 号 §5.3 不做新调度器）：pumpTree 泵串行推进；schedule 幂等 + 脏标记
 * 重泵（review T4 丢唤醒）。审批/裁决通道 fire-and-forget 启泵（review W2：IPC
 * 请求不内联跑树；ALS 经 promise 链保持租户上下文）。
 *
 * 不变量：
 * - 一切终态迁移走 CAS（patchFromStatus——review T3/W4：盲 patch 曾使人工裁决
 *   被在途 LLM 验证覆盖、取消被结算复活）
 * - 根节点 id === rootId（review T1：曾双 UUID 使整树不可见）
 * - 聚合节点不执行，只聚合子产出；任一子非 succeeded → 聚合直接失败（review T7）
 * - 叶子执行异常先走重试（review T5），重试尽才重规划/升级
 *
 * 依赖方向：本服务在 agent-runtime，不认识数据库/引擎——宿主注入端口。
 */

import { randomUUID } from 'crypto'
import { createLogger } from '@core/utils/logger'
import type { AgentTaskRepository, AgentTaskRow } from '@core/database/repositories/agent-task.repository'
import type { AgentTaskSpec, PlannedTaskNode } from '@shared/types/agent.types'
import { Verifier, type VerificationSpec, type VerifierDecision } from '../verify/verifier'
import { MAX_TASK_DEPTH, Planner } from './planner'
import type { MemoryFlywheelService } from '../memory/memory-flywheel'

const logger = createLogger('AgentTaskService')

/** 单任务带反馈重试上限（Reflexion 式） */
export const MAX_RETRIES = 2

/** 聚合任务质量分 = 子任务均值（叶子计权 1，01 号 §6.4；review T14 实装） */
export function aggregateScores(scores: Array<number | null>): number | null {
  const valid = scores.filter((s) => s !== null && Number.isFinite(s) && (s as number) >= 0)
  if (valid.length === 0) return null
  return (valid as number[]).reduce((a, b) => a + b, 0) / valid.length
}

/** 执行器端口（workflow-boot 装配；22 号 §8 焊点） */
export interface TaskExecutorPorts {
  /** agent_loop 直驱（LoopRunner + 宿主；memoryLines 由宿主注入提示词/轨迹） */
  runAgentLoop: (input: {
    goal: string
    systemPrompt?: string
    toolWhitelist?: string[]
    maxSteps?: number
    sessionKey: string
    memoryLines?: string[]
    signal?: AbortSignal
  }) => Promise<{ output: unknown; stopReason: string; error?: string }>
  /** sub_workflow 执行器：startRun + 等终态（skipped 即败；waiting_review 继续等） */
  runSubWorkflow?: (input: {
    definitionId: string
    inputs: Record<string, unknown>
    taskId: string
    parentRunId?: string | null
    signal?: AbortSignal
  }) => Promise<{ output: unknown; status: string; error?: string | null }>
}

export interface TaskServiceDeps {
  tasks: AgentTaskRepository
  planner: Planner
  verifier: Verifier
  flywheel?: MemoryFlywheelService | null
  executors: TaskExecutorPorts
  clock?: () => number
}

export interface TaskTree {
  root: AgentTaskRow
  children: Map<string, AgentTaskRow[]>
}

export class AgentTaskService {
  private readonly deps: Required<Pick<TaskServiceDeps, 'tasks' | 'planner' | 'verifier' | 'executors'>> &
    Pick<TaskServiceDeps, 'flywheel' | 'clock'>
  /** 在途调度（每 root 一条泵链；脏标记防丢唤醒——review T4） */
  private readonly scheduling = new Set<string>()
  private readonly rescheduleRequested = new Set<string>()
  /** 取消信号（rootId → controller；cancelTree 中止在途执行——review W4） */
  private readonly cancelControllers = new Map<string, AbortController>()
  /** 叶子装配命中的记忆条目（taskId → entryIds；终态回写飞轮——review T8） */
  private readonly memoryHits = new Map<string, string[]>()

  constructor(deps: TaskServiceDeps) {
    this.deps = { ...deps, clock: deps.clock ?? (() => Date.now()) }
  }

  // ==================== 规划与批准 ====================

  /** LLM 静态规划 → 整树落库（pending_review；根节点 id === rootId——review T1） */
  async createPlan(goal: string, opts: { title?: string; budget?: Record<string, unknown>; signal?: AbortSignal } = {}): Promise<AgentTaskRow> {
    const tree = await this.deps.planner.planTree(goal, opts.signal)
    const rootId = `at_${randomUUID()}`
    const insertTree = async (node: PlannedTaskNode, id: string, parentId: string | null, depth: number): Promise<AgentTaskRow> => {
      const row = await this.deps.tasks.create({
        id,
        parentId,
        rootId,
        depth,
        title: node.title,
        spec: node.spec as unknown as Record<string, unknown>,
        status: 'pending_review',
        executor: node.children && node.children.length > 0 ? 'agent_loop' : (node.executor ?? 'agent_loop'),
        budget: opts.budget,
      })
      for (const child of node.children ?? []) {
        await insertTree(child, `at_${randomUUID()}`, row.id, depth + 1)
      }
      return row
    }
    const inserted = await insertTree({ ...tree, title: opts.title ?? tree.title }, rootId, null, 0)
    logger.info(`[task] 计划已创建（待人工批准）：root=${inserted.id}`)
    return inserted
  }

  /** 人工批准整树（整树一次批准）→ 全员 ready → 后台启泵（fire-and-forget，review W2） */
  async approvePlan(rootId: string): Promise<void> {
    const rows = await this.deps.tasks.listByRoot(rootId)
    if (rows.length === 0) throw new Error(`任务树不存在：${rootId}`)
    for (const row of rows) {
      if (row.status !== 'pending_review') throw new Error('计划已批准过（存在非 pending_review 节点），不可重复批准')
    }
    for (const row of rows) {
      await this.deps.tasks.patch(row.id, { status: 'ready' })
    }
    void this.schedule(rootId).catch((e) => logger.warn(`[task] 调度链异常（${rootId}）`, e))
  }

  // ==================== 查询 ====================

  async getTree(rootId: string): Promise<TaskTree> {
    const rows = await this.deps.tasks.listByRoot(rootId)
    const root = rows.find((r) => r.id === rootId)
    if (!root) throw new Error(`任务树不存在：${rootId}`)
    const children = new Map<string, AgentTaskRow[]>()
    for (const r of rows) {
      if (!r.parentId) continue
      if (!children.has(r.parentId)) children.set(r.parentId, [])
      children.get(r.parentId)!.push(r)
    }
    return { root, children }
  }

  async listRoots(): Promise<AgentTaskRow[]> {
    const statuses = ['pending_review', 'ready', 'running', 'verifying', 'succeeded', 'failed', 'escalated', 'replanned', 'cancelled']
    const roots: AgentTaskRow[] = []
    const seen = new Set<string>()
    for (const status of statuses) {
      for (const r of await this.deps.tasks.listByStatus(status)) {
        if (r.rootId === r.id && !seen.has(r.id)) {
          seen.add(r.id)
          roots.push(r)
        }
      }
    }
    return roots.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
  }

  // ==================== 调度 ====================

  /** 启动调度链（幂等 + 脏标记：泵退出窗口内的重入请求触发再泵——review T4） */
  async schedule(rootId: string): Promise<void> {
    if (this.scheduling.has(rootId)) {
      this.rescheduleRequested.add(rootId)
      return
    }
    this.scheduling.add(rootId)
    try {
      do {
        this.rescheduleRequested.delete(rootId)
        await this.pumpTree(rootId)
      } while (this.rescheduleRequested.has(rootId))
    } finally {
      this.scheduling.delete(rootId)
    }
  }

  private async pumpTree(rootId: string): Promise<void> {
    for (;;) {
      const tree = await this.getTree(rootId)
      if (this.cancelControllers.get(rootId)?.signal.aborted) break
      const runnable = this.findRunnable(tree)
      if (!runnable) break
      await this.runOne(runnable, rootId)
    }
    await this.settleUpward(rootId)
  }

  private findRunnable(tree: TaskTree): AgentTaskRow | null {
    // replanned 节点参与聚合调度（review T2：曾是死状态——重规划子任务全终态后
    // replanned 节点被聚合验证，成功路径由此闭环）
    const all = [tree.root, ...this.descendants(tree, tree.root)]
    const ready = all.filter((r) => r.status === 'ready' || r.status === 'replanned')
    if (ready.length === 0) return null
    if (all.some((r) => ['running', 'verifying'].includes(r.status))) return null // 串行（budget.maxConcurrent 后置）
    for (const r of ready) {
      const children = tree.children.get(r.id) ?? []
      if (children.length === 0) return r
      if (children.every((c) => this.isTerminal(c.status))) return r
    }
    return null
  }

  private descendants(tree: TaskTree, node: AgentTaskRow): AgentTaskRow[] {
    const children = tree.children.get(node.id) ?? []
    return children.flatMap((c) => [c, ...this.descendants(tree, c)])
  }

  private isTerminal(status: string): boolean {
    return ['succeeded', 'failed', 'cancelled'].includes(status)
  }

  /** 执行单任务：叶子 → 执行器；聚合 → 硬规则 + 子分聚合（review T7/T14） */
  private async runOne(task: AgentTaskRow, rootId: string): Promise<void> {
    const tree = await this.getTree(task.rootId)
    const children = tree.children.get(task.id) ?? []
    let output: unknown
    if (children.length > 0) {
      // 聚合硬规则（review T7）：任一子非 succeeded → 聚合直接失败，不进 LLM
      const notSucceeded = children.filter((c) => c.status !== 'succeeded')
      output = { aggregated: children.map((c) => ({ title: c.title, result: c.result, status: c.status })) }
      if (notSucceeded.length > 0) {
        await this.deps.tasks.patch(task.id, { status: 'verifying', result: output as Record<string, unknown> })
        await this.handleFailure(task, output, notSucceeded.map((c) => `子任务「${c.title}」${c.status}`))
        return
      }
      // 聚合质量分 = 子任务均值（review T14）；不进 LLM（子任务已各自过门）
      await this.deps.tasks.patch(task.id, { status: 'verifying', result: output as Record<string, unknown> })
      const score = aggregateScores(children.map((c) => c.qualityScore))
      if (score !== null && score >= 0.6) {
        await this.settleSuccess(task, output, score)
      } else {
        await this.handleFailure(task, output, score === null ? ['子任务无质量分'] : [`子树均分 ${score.toFixed(2)} 低于 0.6`])
      }
      return
    }
    await this.deps.tasks.patch(task.id, { status: 'running' })
    try {
      output = await this.execute(task, rootId)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      logger.warn(`[task] 执行异常（${task.id}）：${msg}`)
      // 执行异常先走带反馈重试（review T5：曾直接重规划——瞬时故障即烧规划 LLM）
      await this.retryOrFail(task, [msg], output)
      return
    }
    await this.verifyAndSettle(task, output)
  }

  private async execute(task: AgentTaskRow, rootId: string): Promise<unknown> {
    const spec = task.spec as unknown as AgentTaskSpec
    if (task.executor.startsWith('sub_workflow:')) {
      const definitionId = task.executor.slice('sub_workflow:'.length)
      if (!this.deps.executors.runSubWorkflow) throw new Error('sub_workflow 执行器未装配')
      const r = await this.deps.executors.runSubWorkflow({
        definitionId,
        inputs: { goal: spec.goal, taskTitle: task.title },
        taskId: task.id,
        signal: this.cancelControllers.get(rootId)?.signal,
      })
      if (r.status !== 'succeeded') throw new Error(r.error ?? `子工作流未成功（${r.status}）`)
      return r.output
    }
    if (task.executor === 'human') {
      throw new Error('human 执行器需走人工录入入口（M4 待办中心）')
    }
    // agent_loop 直驱 + 飞轮装配（读取侧：相关经验注入提示词，轨迹由宿主留痕）
    let memoryLines: string[] = []
    if (this.deps.flywheel) {
      const entries = await this.deps.flywheel.assemble(`${task.title}\n${spec.goal}`)
      memoryLines = entries.map((e) => `- [${e.kind}] ${(e.content as { title?: string }).title ?? ''}: ${(e.content as { content?: string }).content ?? ''}`)
      if (entries.length > 0) {
        this.memoryHits.set(task.id, entries.map((e) => e.id)) // 终态回写（review T8）
        logger.info(`[task] 飞轮装配命中 ${entries.length} 条（task=${task.id}）`)
      }
    }
    const systemPrompt = memoryLines.length > 0
      ? `相关经验（来自知识飞轮，供参考）：\n${memoryLines.join('\n')}`
      : undefined
    const r = await this.deps.executors.runAgentLoop({
      goal: spec.goal,
      systemPrompt,
      toolWhitelist: spec.toolWhitelist,
      maxSteps: spec.maxSteps,
      sessionKey: `task:${task.id}`,
      memoryLines,
      signal: this.cancelControllers.get(rootId)?.signal,
    })
    if (r.stopReason !== 'final') throw new Error(r.error ?? `Agent 循环未收敛（${r.stopReason}）`)
    return r.output
  }

  /** 质量门 + CAS 终态结算（review T3：人工裁决不被在途验证覆盖） */
  private async verifyAndSettle(task: AgentTaskRow, output: unknown): Promise<void> {
    const spec = task.spec as unknown as AgentTaskSpec
    const claimed = await this.deps.tasks.patchFromStatus(task.id, ['running', 'replanned'], { status: 'verifying', result: output as Record<string, unknown> })
    if (!claimed) return // 状态已被人工裁决/取消夺走——放弃结算
    const verification: VerificationSpec = { ...(spec.verification ?? {}) }
    const decision: VerifierDecision = await this.deps.verifier.verify({
      output,
      spec: verification,
      ctx: { goal: spec.goal, acceptance: spec.acceptance },
      retryCount: task.retryCount,
    })
    // LLM 评判窗口后重读：人工裁决已发生则放弃（review T3）
    const latest = await this.deps.tasks.getById(task.id)
    if (!latest || latest.status !== 'verifying') return
    if (decision.action === 'pass') {
      await this.settleSuccess(task, output, decision.score)
      return
    }
    if (decision.action === 'retry') {
      await this.retryOrFail(task, decision.defects, output, decision.feedback)
      return
    }
    if (decision.action === 'human') {
      logger.info(`[task] 质量门灰区挂起待人（${task.id}）：${decision.reason}`)
      return
    }
    await this.handleFailure(task, output, decision.defects)
  }

  /** 带反馈重试（重试尽转失败链）；聚合节点重试无意义 → 直接失败链（review T7） */
  private async retryOrFail(task: AgentTaskRow, defects: string[], output: unknown, feedback?: string): Promise<void> {
    const tree = await this.getTree(task.rootId)
    const isAggregate = (tree.children.get(task.id) ?? []).length > 0
    const spec = task.spec as unknown as AgentTaskSpec
    if (!isAggregate && task.retryCount < MAX_RETRIES) {
      await this.deps.tasks.patchFromStatus(task.id, ['verifying'], {
        status: 'ready',
        retryCount: task.retryCount + 1,
        spec: { ...spec, goal: `${spec.goal}\n\n（上一轮产出未通过验收，请修正以下问题：${feedback ?? defects.join('；')}）` },
      } as never)
      return
    }
    await this.handleFailure(task, output, defects)
  }

  private async settleSuccess(task: AgentTaskRow, output: unknown, score: number): Promise<void> {
    const claimed = await this.deps.tasks.patchFromStatus(task.id, ['verifying'], {
      status: 'succeeded',
      qualityScore: Math.max(0, Math.min(1, score)),
      result: output as Record<string, unknown>,
    })
    if (!claimed) return
    // 飞轮回写 + 蒸馏（fire-and-forget；review T8：真实命中 ids）
    if (this.deps.flywheel) {
      const hitIds = this.memoryHits.get(task.id) ?? []
      void this.deps.flywheel.reportTaskOutcome(hitIds, true).catch(() => undefined)
      void this.deps.flywheel
        .distillFromTask({ goal: (task.spec as unknown as AgentTaskSpec).goal, outputText: JSON.stringify(output ?? ''), sourceTaskId: task.id, sourceRunId: task.runId })
        .catch((e) => logger.warn(`[task] 飞轮蒸馏失败（不影响任务）：${e instanceof Error ? e.message : String(e)}`))
      this.memoryHits.delete(task.id)
    }
    logger.info(`[task] 任务通过验收（${task.id}，score=${score.toFixed(2)}）`)
  }

  /** 失败链：局部重规划（replanned + 子树；深度按剩余预算校验——review T6）→ escalated */
  private async handleFailure(task: AgentTaskRow, output: unknown, defects: string[]): Promise<void> {
    const tree = await this.getTree(task.rootId)
    const hasChildren = (tree.children.get(task.id) ?? []).length > 0
    if (!hasChildren && task.depth < MAX_TASK_DEPTH - 1) {
      try {
        // 局部重规划：剩余深度预算传给规划器（review T6：曾可叠加超限）
        const remaining = MAX_TASK_DEPTH - 1 - task.depth
        const sub = await this.deps.planner.planTree(
          `以下目标此前执行失败（原因：${defects.join('；')}），请分解为更小的可执行子任务：${(task.spec as unknown as AgentTaskSpec).goal}`,
          undefined,
          remaining,
        )
        const claimed = await this.deps.tasks.patchFromStatus(task.id, ['verifying', 'running', 'ready'], {
          status: 'replanned',
          result: output as Record<string, unknown>,
          error: defects.join('；'),
        })
        if (!claimed) return
        const failedSpec = task.spec as unknown as AgentTaskSpec
        for (const node of sub.children ?? []) {
          await this.deps.tasks.create({
            id: `at_${randomUUID()}`,
            parentId: task.id,
            rootId: task.rootId,
            depth: task.depth + 1,
            title: node.title,
            // 子任务继承失败任务的验证契约（验收标准随目标走——否则重规划链断裂）
            spec: { ...(node.spec as unknown as Record<string, unknown>), ...(failedSpec.verification ? { verification: failedSpec.verification } : {}) },
            status: 'ready',
            executor: 'agent_loop',
          })
        }
        logger.info(`[task] 已重规划（${task.id}）为 ${(sub.children ?? []).length} 个子任务`)
        return
      } catch (e) {
        logger.warn(`[task] 重规划失败（转 escalated）：${e instanceof Error ? e.message : String(e)}`)
      }
    }
    await this.deps.tasks.patchFromStatus(task.id, ['verifying', 'running', 'ready'], {
      status: 'escalated',
      result: output as Record<string, unknown>,
      error: defects.join('；') || '执行失败',
    })
    logger.info(`[task] 任务升级人工（${task.id}）`)
  }

  /** 自底向上收口：根终态时取消控制器清理 */
  private async settleUpward(rootId: string): Promise<void> {
    const tree = await this.getTree(rootId)
    if (this.isTerminal(tree.root.status)) {
      this.cancelControllers.delete(rootId)
    }
  }

  // ==================== 人工裁决入口 ====================

  /** 质量门灰区裁决（任务树 UI；approve → 成功 / reject → 失败链）。后台启泵（W2）。 */
  async verifyDecide(taskId: string, decision: 'approve' | 'reject', comment?: string): Promise<void> {
    const task = await this.deps.tasks.getById(taskId)
    if (!task) throw new Error(`任务不存在：${taskId}`)
    if (task.status !== 'verifying') throw new Error(`任务状态为 ${task.status}，不在待验收`)
    if (decision === 'approve') {
      await this.settleSuccess(task, task.result, task.qualityScore ?? 0.7)
    } else {
      await this.handleFailure({ ...task, retryCount: MAX_RETRIES }, task.result, [comment || '人工驳回'])
    }
    void this.schedule(task.rootId).catch((e) => logger.warn('[task] 裁决后调度异常', e))
  }

  /** escalated 裁决：pass / fail / retry（再来一轮） */
  async escalateDecide(taskId: string, decision: 'pass' | 'fail' | 'retry', comment?: string): Promise<void> {
    const task = await this.deps.tasks.getById(taskId)
    if (!task) throw new Error(`任务不存在：${taskId}`)
    if (task.status !== 'escalated') throw new Error(`任务状态为 ${task.status}，不在升级态`)
    if (decision === 'pass') {
      await this.settleSuccess(task, task.result, 1)
    } else if (decision === 'fail') {
      await this.deps.tasks.patch(task.id, { status: 'failed', error: comment || '人工判定失败' })
    } else {
      await this.deps.tasks.patch(task.id, { status: 'ready', retryCount: task.retryCount + 1 })
    }
    void this.schedule(task.rootId).catch((e) => logger.warn('[task] 裁决后调度异常', e))
  }

  /** 取消整树：abort 在途执行 + 终态迁移（review W4/T19） */
  async cancelTree(rootId: string): Promise<void> {
    this.cancelControllers.get(rootId)?.abort(new Error('任务树已取消'))
    const controller = new AbortController()
    controller.abort() // 立即置位：泵在下一检查点停摆，执行器 signal 收到中止
    this.cancelControllers.set(rootId, controller)
    const rows = await this.deps.tasks.listByRoot(rootId)
    for (const r of rows) {
      if (!this.isTerminal(r.status)) await this.deps.tasks.patch(r.id, { status: 'cancelled' })
    }
  }
}
