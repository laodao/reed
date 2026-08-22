/**
 * 子工作流节点（P0 片3：工作流嵌套调用）
 * @module core/modules/workflow/nodes/sub-workflow-nodes
 * @description 调用另一个已发布工作流（运行其发布图）：
 *              - startRun（triggerType='subflow'，triggerInfo 携带父 runId，usePublishedGraph=true）
 *              - 子运行 skipped（互斥）→ 节点失败（不重试）
 *              - 轮询子运行至终态（超时 WORKFLOW_LIMITS.subflowTimeoutMs）
 *              - 输出：子运行 report 的 markdown，否则 message 输出，否则空
 */

import { WORKFLOW_LIMITS, WORKFLOW_RUN_STATUSES, WORKFLOW_RUN_TERMINAL_STATUSES } from '@shared/types/workflow.types'
import type { WorkflowNodeContext } from '../engine/node-handler'
import type { WorkflowNodeHandler } from '../engine/node-handler'
import { stringifyValue } from '../engine/variable-resolver'
import { getRunServiceAccess } from '../run-service-access'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

const subWorkflowNode: WorkflowNodeHandler = {
  type: 'sub-workflow',
  controlKind: 'task',
  cancellable: true,
  outputSchema: [
    { key: 'runId', type: 'string', desc: '子运行 id' },
    { key: 'status', type: 'string', desc: '子运行终态' },
    { key: 'result', type: 'string', desc: '子工作流 message 输出或 report markdown' },
  ],
  validateConfig(config) {
    const cfg = config as { definitionId?: string }
    if (!cfg.definitionId || !stringifyValue(cfg.definitionId).trim()) return ['子工作流 ID 不能为空']
    return []
  },
  async execute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as {
      definitionId: string
      inputs?: Array<{ key: string; value: string }>
      /** 等待子运行终态超时（默认 WORKFLOW_LIMITS.subflowTimeoutMs；测试/调优可覆盖） */
      timeoutMs?: number
    }
    const runService = getRunServiceAccess()
    const inputs: Record<string, unknown> = {}
    for (const p of cfg.inputs ?? []) {
      if (p.key) inputs[p.key] = p.value
    }
    const definitionId = stringifyValue(cfg.definitionId)
    const timeoutMs = Math.min(cfg.timeoutMs ?? WORKFLOW_LIMITS.subflowTimeoutMs, WORKFLOW_LIMITS.subflowTimeoutMs)

    ctx.logger.info('子工作流启动', { definitionId, parentRunId: ctx.runId })
    const run = await runService.startRun({
      definitionId,
      triggerType: 'subflow',
      inputs,
      triggerInfo: { source: 'subflow', parentRunId: ctx.runId },
      usePublishedGraph: true,
    })
    if (run.status === WORKFLOW_RUN_STATUSES.skipped) {
      return { status: 'failed', error: `子工作流正在运行中（${run.skipReason ?? '互斥'}）`, retryable: false }
    }

    // 轮询子运行至终态（getRunDetail 含 nodeRuns）
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (ctx.signal.aborted) {
        return { status: 'failed', error: '子工作流等待被取消', retryable: false }
      }
      const detail = await runService.getRunDetail?.(run.id)
      const status = detail?.run?.status
      if (status && WORKFLOW_RUN_TERMINAL_STATUSES.has(status)) {
        if (status !== WORKFLOW_RUN_STATUSES.succeeded) {
          return { status: 'failed', error: `子工作流${status}${detail?.run?.error ? `：${detail.run.error}` : ''}`, retryable: false }
        }
        const report = detail.nodeRuns?.find(n => n.nodeType === 'report' && n.output?.markdown)
        const msg = report ? undefined : detail.nodeRuns?.find(n => n.nodeType === 'message' && n.output?.content)
        const result = report
          ? String(report.output.markdown)
          : msg ? String(msg.output.content) : ''
        return { status: 'succeeded', output: { runId: run.id, status, result } }
      }
      await sleep(500)
    }
    return { status: 'failed', error: '子工作流执行超时', retryable: false }
  },
}

export const SUB_WORKFLOW_NODE_HANDLERS: WorkflowNodeHandler[] = [subWorkflowNode]
