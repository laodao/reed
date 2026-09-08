/**
 * Agent 工作台 IPC 处理器（29 号 M5.5 批2）
 * @module core/packs/workflow/handlers/agent-console.handler
 *
 * ac:* 通道：会话列表（agent_sessions distinct × 运行注册表合成）/ 轨迹回放 /
 * 在途运行停止。广播事件（ac:trajectory / ac:run-update）不经 IPC handler——
 * 由宿主/registry 经平台 EventEmitter 直接广播（见 workflow-boot 与聊天宿主装配）。
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { getCurrentUserId } from '@core/context/user-context'
import { getWorkflowSubsystem } from '@core/platform/workflow/workflow-boot'
import { getAgentRunRegistry } from '@core/platform/agent-runtime/runtime/run-registry'
import { contextConversationId, describeContextMessage } from './agent-console-context'
import type { AgentConsoleContext, AgentConsoleSession } from '@shared/types/agent.types'
import type { IpcResponse } from '@shared/types/ipc.types'

function subsystem() {
  const s = getWorkflowSubsystem()
  if (!s.agentSessions || !s.agentTrajectories) {
    throw new Error('Agent 工作台数据源未装配（数据库不可用或装配失败）')
  }
  return s
}

/** conversationId → 会话族解析（与宿主 scopeKey 约定一一对应） */
function parseConversation(conversationId: string): { kind: AgentConsoleSession['kind']; scopeKey: string; refId: string | null } {
  const chatPrefix = 'system-chat-agent:dialog:'
  if (conversationId.startsWith(chatPrefix)) {
    const dialogId = conversationId.slice(chatPrefix.length)
    return { kind: 'chat', scopeKey: `dialog:${dialogId}`, refId: dialogId }
  }
  if (conversationId.startsWith('task:')) {
    return { kind: 'task', scopeKey: conversationId, refId: conversationId.slice('task:'.length) }
  }
  return { kind: 'other', scopeKey: conversationId, refId: null }
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

export function registerAgentConsoleHandlers(): void {
  ipcBridge.handle('ac:list-sessions', () =>
    wrap(async (): Promise<AgentConsoleSession[]> => {
      const s = subsystem()
      const userId = getCurrentUserId()
      const rows = await s.agentSessions!.listSessions()
      const runningScopes = new Set(getAgentRunRegistry().listRunning(userId).map((r) => r.scopeKey))
      // 展示名：聊天=对话标题；任务=叶子任务标题（rootId 经任务行反查——叶子 id
      // 不能直接当 root 跳转，29 号 review P2-1）
      const db = getCoreDatabaseManager()
      const out: AgentConsoleSession[] = []
      for (const row of rows) {
        const { kind, scopeKey, refId } = parseConversation(row.conversationId)
        let label = scopeKey
        let rootId: string | null = null
        try {
          if (kind === 'chat' && db.dialogs) {
            label = (await db.dialogs.getById(refId!))?.title ?? label
          } else if (kind === 'task' && s.agentTasks) {
            const task = await s.agentTasks.getById(refId!)
            if (task) {
              label = task.title
              rootId = task.rootId
            }
          }
        } catch { /* 标题查询失败退回 scopeKey */ }
        out.push({
          scopeKey,
          kind,
          label,
          refId,
          rootId,
          updatedAt: row.updatedAt?.toISOString() ?? null,
          messageCount: row.messageCount,
          running: runningScopes.has(scopeKey),
        })
      }
      return out
    }),
  )

  ipcBridge.handle('ac:get-trajectory', (_e, p: { scopeKey: string }) =>
    wrap(async () => {
      const s = subsystem()
      return s.agentTrajectories!.listByScope(p.scopeKey)
    }),
  )

  ipcBridge.handle('ac:stop', (_e, p: { scopeKey: string }) =>
    wrap(async () => {
      const userId = getCurrentUserId()
      // 任务会话：停止 = 取消整棵树（叶子级 abort 会被当失败重试/重规划——
      // 语义反转，29 号 review P0-1）；cancelTree 内部 scoped CAS 天然限属主
      if (p.scopeKey.startsWith('task:')) {
        const run = getAgentRunRegistry().getByScope(p.scopeKey)
        const rootId = (run?.metadata?.rootId as string | undefined) ?? p.scopeKey.slice('task:'.length)
        const s = getWorkflowSubsystem()
        await s.agentTasks?.cancelTree(rootId)
        return { stopped: true }
      }
      return { stopped: getAgentRunRegistry().abortByScope(p.scopeKey, userId) }
    }),
  )

  // 会话上下文查看（37 号实测反馈：右栏「查看」按钮）——模型侧消息历史投影
  ipcBridge.handle('ac:get-context', (_e, p: { scopeKey: string }) =>
    wrap(async (): Promise<AgentConsoleContext> => {
      const db = getCoreDatabaseManager()
      if (!db.dataSource) throw new Error('数据库未就绪，无法读取会话上下文')
      const { DbAgentSessionStore } = await import('@core/platform/agent-runtime/memory/session-store')
      const conversationId = contextConversationId(p.scopeKey)
      const history = await new DbAgentSessionStore({ dataSource: db.dataSource }).load(conversationId)
      return {
        conversationId,
        messages: (history ?? []).map((m, seq) => describeContextMessage(m, seq)),
      }
    }),
  )
}
