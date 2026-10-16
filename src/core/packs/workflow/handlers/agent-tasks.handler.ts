/**
 * Agent 任务树/知识飞轮 IPC 处理器（26 号 M3 批5；双端共用 ipcBridge）
 * @module core/packs/workflow/handlers/agent-tasks.handler
 *
 * 通道前缀：at:*（任务树）/ am:*（记忆飞轮）。子系统未装配（数据源缺失）
 * 返回明确错误。业务在 AgentTaskService / MemoryFlywheelService（agent-runtime），
 * handler 不写业务（架构铁律）。
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getWorkflowSubsystem } from '@core/platform/workflow/workflow-boot'
import type { IpcResponse } from '@shared/types/ipc.types'
import type { AgentTaskView } from '@shared/types/agent.types'
import type { AgentTaskRow } from '@core/database/repositories/agent-task.repository'

/** 子系统守卫：任务/飞轮未装配（db.dataSource 缺失或装配失败）→ 明确错误 */
function tasks() {
  const t = getWorkflowSubsystem().agentTasks
  if (!t) throw new Error('任务树子系统未装配（数据库不可用或装配失败）')
  return t
}

function flywheel() {
  const m = getWorkflowSubsystem().memoryFlywheel
  if (!m) throw new Error('知识飞轮已停用（2026-09 暂停；重开：AGENT_MEMORY_FLYWHEEL=on）')
  return m
}

function wrap<T>(fn: () => Promise<T>): Promise<IpcResponse<T>> {
  try {
    return fn().then(
      (data) => ({ success: true, data }) as IpcResponse<T>,
      (e) => ({ success: false, error: e instanceof Error ? e.message : String(e) }) as IpcResponse<T>,
    )
  } catch (e) {
    return Promise.resolve({ success: false, error: e instanceof Error ? e.message : String(e) })
  }
}

function toView(r: AgentTaskRow): AgentTaskView {
  return {
    id: r.id,
    parentId: r.parentId,
    rootId: r.rootId,
    depth: r.depth,
    title: r.title,
    spec: r.spec as unknown as AgentTaskView['spec'],
    status: r.status as AgentTaskView['status'],
    executor: r.executor,
    runId: r.runId,
    qualityScore: r.qualityScore,
    result: r.result,
    retryCount: r.retryCount,
    error: r.error,
    createdAt: r.createdAt?.toISOString() ?? null,
    updatedAt: r.updatedAt?.toISOString() ?? null,
  }
}

export function registerAgentTaskHandlers(): void {
  // ==================== 任务树 ====================
  ipcBridge.handle('at:create-plan', (_e, p: { goal: string; title?: string }) =>
    wrap(async () => toView(await tasks().createPlan(p.goal, { title: p.title }))),
  )
  ipcBridge.handle('at:approve-plan', (_e, p: { rootId: string }) =>
    wrap(async () => { await tasks().approvePlan(p.rootId); return { approved: true } }),
  )
  ipcBridge.handle('at:get-tree', (_e, p: { rootId: string }) =>
    wrap(async () => {
      const tree = await tasks().getTree(p.rootId)
      const nodes: AgentTaskRow[] = [tree.root]
      for (const list of tree.children.values()) nodes.push(...list)
      return { root: toView(tree.root), nodes: nodes.map(toView) }
    }),
  )
  ipcBridge.handle('at:list-roots', () =>
    wrap(async () => (await tasks().listRoots()).map(toView)),
  )
  ipcBridge.handle('at:verify-decide', (_e, p: { taskId: string; decision: 'approve' | 'reject'; comment?: string }) =>
    wrap(async () => { await tasks().verifyDecide(p.taskId, p.decision, p.comment); return { done: true } }),
  )
  ipcBridge.handle('at:escalate-decide', (_e, p: { taskId: string; decision: 'pass' | 'fail' | 'retry'; comment?: string }) =>
    wrap(async () => { await tasks().escalateDecide(p.taskId, p.decision, p.comment); return { done: true } }),
  )
  ipcBridge.handle('at:cancel', (_e, p: { rootId: string }) =>
    wrap(async () => { await tasks().cancelTree(p.rootId); return { cancelled: true } }),
  )

  // ==================== 知识飞轮 ====================
  ipcBridge.handle('am:list-pending', () =>
    wrap(async () => flywheel().listPending()),
  )
  ipcBridge.handle('am:list-active', () =>
    wrap(async () => flywheel().listActiveEntries()),
  )
  ipcBridge.handle('am:list-archived', () =>
    wrap(async () => flywheel().listArchivedEntries()),
  )
  ipcBridge.handle('am:approve', (_e, p: { id: string }) =>
    wrap(async () => { await flywheel().approve(p.id); return { approved: true } }),
  )
  ipcBridge.handle('am:add-manual', (_e, p: { kind: string; title: string; content: string; bizModule?: string; projectId?: string }) =>
    wrap(async () => { await flywheel().addManual({ kind: p.kind as never, title: p.title, content: p.content, scope: { bizModule: p.bizModule, projectId: p.projectId } }); return { added: true } }),
  )
  ipcBridge.handle('am:reject', (_e, p: { id: string }) =>
    wrap(async () => { await flywheel().reject(p.id); return { rejected: true } }),
  )
  ipcBridge.handle('am:archive', (_e, p: { id: string }) =>
    wrap(async () => { await flywheel().archive(p.id); return { archived: true } }),
  )
}
