/**
 * Agent 工作台会话列表的批量标题解析单测（性能回归）
 *
 * 背景：`ac:list-sessions` 逐个会话调 `db.dialogs.getById()` 取展示名——
 * 会话数 N 次 IPC/查询串行执行（N+1）。真机实测该页首开因此超时（>15s）。
 * 改为一次批量查询（`getTitlesByIds`）后只多一次查询。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const listSessions = vi.fn()
const getById = vi.fn()
const getTitlesByIds = vi.fn()

vi.mock('@core/ipc/bridge-adapter', () => {
  const handlers = new Map<string, (event: unknown, payload?: unknown) => unknown>()
  return {
    ipcBridge: {
      handle: (channel: string, fn: (event: unknown, payload?: unknown) => unknown) => { handlers.set(channel, fn) },
      removeHandler: (channel: string) => { handlers.delete(channel) },
      __handlers: handlers,
    },
  }
})

vi.mock('@core/database/database-manager.interface', () => ({
  getCoreDatabaseManager: () => ({
    dialogs: { getById, getTitlesByIds },
    agentSessions: { listSessions },
  }),
}))

vi.mock('@core/context/user-context', () => ({ getCurrentUserId: () => 'u1' }))

vi.mock('@core/platform/agent-runtime/runtime/run-registry', () => ({
  getAgentRunRegistry: () => ({ listRunning: () => [] }),
}))

vi.mock('@core/platform/workflow/workflow-boot', () => ({
  getWorkflowSubsystem: () => ({
    agentSessions: { listSessions },
    agentTrajectories: {},
    agentTasks: { getById: vi.fn() },
  }),
}))

vi.mock('@core/packs/workflow/handlers/agent-console-context', () => ({
  contextConversationId: (k: string) => k,
  describeContextMessage: () => ({}),
}))

describe('ac:list-sessions 批量标题解析', () => {
  beforeEach(() => {
    vi.resetModules()
    listSessions.mockReset()
    getById.mockReset()
    getTitlesByIds.mockReset()
    getTitlesByIds.mockResolvedValue(new Map())
  })

  async function callHandler() {
    const { registerAgentConsoleHandlers } = await import('@core/packs/workflow/handlers/agent-console.handler')
    registerAgentConsoleHandlers()
    const bridge = (await import('@core/ipc/bridge-adapter')) as unknown as {
      ipcBridge: { __handlers: Map<string, (e: unknown, p?: unknown) => unknown> }
    }
    const handler = bridge.ipcBridge.__handlers.get('ac:list-sessions')
    if (!handler) throw new Error('ac:list-sessions 未注册')
    return handler(undefined)
  }

  it('会话标题只查一次（批量），不逐个 getById', async () => {
    listSessions.mockResolvedValue([
      { conversationId: 'system-chat-agent:dialog:d1', updatedAt: new Date('2026-09-01T00:00:00Z'), messageCount: 3 },
      { conversationId: 'system-chat-agent:dialog:d2', updatedAt: new Date('2026-09-02T00:00:00Z'), messageCount: 5 },
      { conversationId: 'system-chat-agent:dialog:d3', updatedAt: new Date('2026-09-03T00:00:00Z'), messageCount: 1 },
    ])
    getTitlesByIds.mockResolvedValue(new Map([['d1', '会话一'], ['d2', '会话二']]))

    const resp = (await callHandler()) as { success: boolean; data: Array<{ scopeKey: string; label: string }> }

    expect(resp.success).toBe(true)
    expect(getTitlesByIds).toHaveBeenCalledTimes(1)
    expect(getTitlesByIds).toHaveBeenCalledWith(['d1', 'd2', 'd3'])
    expect(getById).not.toHaveBeenCalled()
    expect(resp.data.map((s) => s.label)).toEqual(['会话一', '会话二', 'dialog:d3'])
  })

  it('没有聊天会话时不发起标题查询', async () => {
    listSessions.mockResolvedValue([
      { conversationId: 'task:t1', updatedAt: null, messageCount: 0 },
    ])
    const resp = (await callHandler()) as { success: boolean; data: unknown[] }
    expect(resp.success).toBe(true)
    expect(getTitlesByIds).not.toHaveBeenCalled()
  })
})