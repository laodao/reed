/**
 * ac:get-context 纯函数单测（37 号实测反馈：会话上下文查看）
 * @module tests/unit/core/packs/workflow/agent-console-context
 *
 * 锚点：scopeKey→会话存储键互逆映射；ModelMessage 投影的截断/工具部件归类/
 * 体量统计。不拉起 IPC/DB（handler 的重依赖与本文件无关）。
 */

import { describe, expect, it } from 'vitest'
import type { ModelMessage } from 'ai'
import {
  CONTEXT_PART_LIMIT,
  CONTEXT_TEXT_LIMIT,
  contextConversationId,
  describeContextMessage,
} from '@core/packs/workflow/handlers/agent-console-context'
import {
  resetWorkflowRuntimeParams,
  setWorkflowRuntimeParams,
} from '@shared/utils/workflow-runtime-params'

describe('contextConversationId（scopeKey → 会话存储键）', () => {
  it('chat 会话：dialog:<id> → system-chat-agent:dialog:<id>（与聊天宿主 agentSessionId 互逆）', () => {
    expect(contextConversationId('dialog:d1')).toBe('system-chat-agent:dialog:d1')
  })

  it('task 会话：scopeKey 本身就是会话存储键（任务执行器以 scopeKey 落库）', () => {
    expect(contextConversationId('task:t1')).toBe('task:t1')
    expect(contextConversationId('story-room:p1')).toBe('story-room:p1')
  })
})

describe('describeContextMessage（ModelMessage → 展示投影）', () => {
  it('字符串 content：role/text 透传，无工具部件，bytes 为序列化字节数', () => {
    const m = { role: 'user', content: '帮我查天气' } as ModelMessage
    const d = describeContextMessage(m, 0)
    expect(d).toMatchObject({ seq: 0, role: 'user', text: '帮我查天气', truncated: false })
    expect(d.toolCalls).toHaveLength(0)
    expect(d.toolResults).toHaveLength(0)
    expect(d.bytes).toBeGreaterThan(0)
  })

  it('assistant 工具调用消息：tool-call 归类为 toolCalls 摘要，不混入 text', () => {
    const m = {
      role: 'assistant',
      content: [
        { type: 'text', text: '我先查一下。' },
        { type: 'tool-call', toolCallId: 'c1', toolName: 'web_search', input: { query: '天气' } },
      ],
    } as unknown as ModelMessage
    const d = describeContextMessage(m, 1)
    expect(d.text).toBe('我先查一下。')
    expect(d.toolCalls).toEqual([{ name: 'web_search', argsDigest: '{"query":"天气"}' }])
    expect(d.truncated).toBe(false)
  })

  it('tool 结果消息：tool-result 归类为 toolResults', () => {
    const m = {
      role: 'tool',
      content: [{ type: 'tool-result', toolCallId: 'c1', toolName: 'web_search', output: { ok: true } }],
    } as unknown as ModelMessage
    const d = describeContextMessage(m, 2)
    expect(d.toolResults).toEqual([{ name: 'web_search', digest: '{"ok":true}' }])
  })

  it('超长文本截断并打标（预览上限，不回传全文）', () => {
    const long = 'x'.repeat(CONTEXT_TEXT_LIMIT + 100)
    const d = describeContextMessage({ role: 'user', content: long } as ModelMessage, 3)
    expect(d.truncated).toBe(true)
    expect(d.text.length).toBeLessThanOrEqual(CONTEXT_TEXT_LIMIT + '…[截断]'.length)
  })

  it('超长工具入参截断（CONTEXT_PART_LIMIT）', () => {
    const big = { q: 'y'.repeat(CONTEXT_PART_LIMIT + 50) }
    const m = {
      role: 'assistant',
      content: [{ type: 'tool-call', toolCallId: 'c', toolName: 't', input: big }],
    } as unknown as ModelMessage
    const d = describeContextMessage(m, 4)
    expect(d.truncated).toBe(true)
    expect(d.toolCalls[0]!.argsDigest.length).toBeLessThanOrEqual(CONTEXT_PART_LIMIT + '…[截断]'.length)
  })

  /**
   * 2026-09-13「参数设置 → 工作流 → 界面展示截断」：截断长度不再是模块常量，
   * 改读运行时持有者。这里注入更小的值，证明行为跟着设置走（不再是固定 1600/400）。
   */
  it('截断长度读「参数设置 → 工作流 → 界面展示截断」', () => {
    setWorkflowRuntimeParams({ ui: { contextTextChars: 20, contextPartChars: 8 } })
    try {
      const textMsg = { role: 'user', content: 'x'.repeat(200) } as ModelMessage
      const dt = describeContextMessage(textMsg, 3)
      expect(dt.truncated).toBe(true)
      expect(dt.text.length).toBeLessThanOrEqual(20 + '…[截断]'.length)

      const big = { q: 'y'.repeat(200) }
      const toolMsg = {
        role: 'assistant',
        content: [{ type: 'tool-call', toolCallId: 'c', toolName: 't', input: big }],
      } as unknown as ModelMessage
      const dp = describeContextMessage(toolMsg, 4)
      expect(dp.toolCalls[0]!.argsDigest.length).toBeLessThanOrEqual(8 + '…[截断]'.length)
    } finally {
      resetWorkflowRuntimeParams()
    }
  })

  it('未知部件类型落入 otherParts 兜底可见', () => {    const m = {
      role: 'assistant',
      content: [
        { type: 'reasoning', text: '思考过程' },
        { type: 'text', text: '答案' },
      ],
    } as unknown as ModelMessage
    const d = describeContextMessage(m, 5)
    expect(d.otherParts).toEqual(['reasoning'])
    expect(d.text).toBe('答案')
  })
})
