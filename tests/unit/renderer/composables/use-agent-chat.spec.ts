/**
 * useAgentChat 对话状态机 单测
 * 覆盖：send 消息追加、事件驱动演进（stage/action/reply 流式）、历史恢复、错误处理、chips 发送。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useAgentChat } from '../../../../src/renderer/src/composables/useAgentChat'

/** 模拟 agent 事件发射（测试内手动触发 onAgentEvent 回调） */
function makeApi(over: Record<string, unknown> = {}) {
  const agentListeners: Array<(event: any) => void> = []
  const summaryListeners: Array<(event: any) => void> = []
  const api = {
    agentSend: vi.fn(async () => ({ success: true })),
    agentHistory: vi.fn(async () => ({ success: true, data: [] })),
    agentCancel: vi.fn(async () => ({ success: true })),
    onAgentEvent: vi.fn((_projectId: string, cb: (e: any) => void) => {
      agentListeners.push(cb)
      return () => { /* noop */ }
    }),
    onGenerateEvent: vi.fn((_eventId: string, cb: (e: any) => void) => {
      summaryListeners.push(cb)
      return () => { /* noop */ }
    }),
  }
  return {
    api,
    emitAgent: (e: any) => agentListeners.forEach(cb => cb(e)),
    emitSummary: (e: any) => summaryListeners.forEach(cb => cb(e)),
    ...over,
  }
}

describe('useAgentChat 对话状态机', () => {
  let mock: ReturnType<typeof makeApi>

  beforeEach(() => {
    mock = makeApi()
    vi.stubGlobal('window', { electronAPI: { longwriting: mock.api } })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('send 追加 user 消息 + 占位 assistant 消息', async () => {
    const chat = useAgentChat({ projectId: 'p1' })
    const p = chat.send('你好')
    expect(chat.messages.value).toHaveLength(2)
    expect(chat.messages.value[0].role).toBe('user')
    expect(chat.messages.value[0].content).toBe('你好')
    expect(chat.messages.value[1].role).toBe('assistant')
    expect(chat.messages.value[1].status).toBe('pending')
    await p
    expect(chat.sending.value).toBe(false)
  })

  it('空消息不发送', async () => {
    const chat = useAgentChat({ projectId: 'p1' })
    await chat.send('   ')
    expect(mock.api.agentSend).not.toHaveBeenCalled()
  })

  it('事件驱动：action:done 记录动作摘要', async () => {
    const chat = useAgentChat({ projectId: 'p1' })
    const p = chat.send('设计人物')
    mock.emitAgent({ type: 'action:start', actionType: 'generate_characters', label: '设计人物' })
    expect(chat.currentActionLabel.value).toBe('设计人物')
    mock.emitAgent({
      type: 'action:done',
      summary: { type: 'generate_characters', status: 'ok', message: '新增人物：张三', changed: ['characters'] },
    })
    expect(chat.messages.value[1].actions).toHaveLength(1)
    await p
  })

  it('reply 流式：reply:start 订阅总结事件，content 累加，reply:done 结束并带 chips', async () => {
    const chat = useAgentChat({ projectId: 'p1' })
    const p = chat.send('你好')
    mock.emitAgent({ type: 'reply:start', summaryEventId: 'evt-1' })
    expect(chat.messages.value[1].status).toBe('streaming')
    mock.emitSummary({ type: 'content', content: '好的，' })
    mock.emitSummary({ type: 'content', content: '我来帮你。' })
    expect(chat.messages.value[1].content).toBe('好的，我来帮你。')
    mock.emitAgent({ type: 'reply:done', suggestions: ['设计主角'] })
    expect(chat.messages.value[1].status).toBe('done')
    expect(chat.suggestions.value).toEqual(['设计主角'])
    await p
  })

  it('发送失败 → assistant 消息标记 error', async () => {
    const bad = makeApi({ api: { ...mock.api, agentSend: vi.fn(async () => ({ success: false, error: '网络错误' })) } })
    vi.stubGlobal('window', { electronAPI: { longwriting: bad.api } })
    const chat = useAgentChat({ projectId: 'p1' })
    await chat.send('你好')
    expect(chat.messages.value[1].status).toBe('error')
    expect(chat.messages.value[1].error).toContain('网络错误')
    expect(chat.error.value).toContain('网络错误')
  })

  it('loadHistory 恢复历史（含 metadata 解析）', async () => {
    const withHistory = makeApi({
      api: {
        ...mock.api,
        agentHistory: vi.fn(async () => ({
          success: true,
          data: [
            { role: 'user', content: '我想写个故事', timestamp: 1 },
            {
              role: 'assistant',
              content: '好的',
              timestamp: 2,
              metadata: JSON.stringify({
                actions: [{ type: 'generate_overview', status: 'ok', message: '已生成概要' }],
                suggestions: ['设计主角'],
              }),
            },
          ],
        })),
      },
    })
    vi.stubGlobal('window', { electronAPI: { longwriting: withHistory.api } })
    const chat = useAgentChat({ projectId: 'p1' })
    await chat.loadHistory()
    expect(chat.messages.value).toHaveLength(2)
    expect(chat.messages.value[1].actions![0].message).toBe('已生成概要')
    expect(chat.suggestions.value).toEqual(['设计主角'])
  })

  it('sendSuggestion 清空 chips 并发送', async () => {
    const chat = useAgentChat({ projectId: 'p1' })
    chat.suggestions.value = ['设计主角']
    const p = chat.sendSuggestion('设计主角')
    expect(chat.suggestions.value).toEqual([])
    await p
    expect(mock.api.agentSend).toHaveBeenCalledWith('p1', '设计主角')
  })
})
