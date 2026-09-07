/**
 * 会话历史清洗（30 号总收口后自聊天宿主上移）
 * @module core/platform/agent-runtime/runtime/session-sanitize
 *
 * 模型流中途失败可把「悬空 tool-call」持久化——下一轮直发 provider 将 400 且
 * 永续；Anthropic 系还要求消息严格交替。读取侧统一清洗：
 * ① 丢弃没有对应 tool-result 的 assistant tool-call 段（全空则丢整条）；
 * ② 合并连续 user 消息（错误轮空历史会形成 [user, user]）。
 */

import type { ModelMessage } from 'ai'

export function sanitizeSessionHistory(messages: ModelMessage[]): ModelMessage[] {
  const resultIds = new Set<string>()
  for (const m of messages) {
    if (m.role !== 'tool' || !Array.isArray(m.content)) continue
    for (const p of m.content as Array<{ type?: string; toolCallId?: string }>) {
      if (p?.type === 'tool-result' && p.toolCallId) resultIds.add(p.toolCallId)
    }
  }
  const cleaned: ModelMessage[] = []
  for (const m of messages) {
    if (m.role === 'assistant' && Array.isArray(m.content)) {
      const parts = (m.content as Array<{ type?: string; toolCallId?: string }>).filter(
        (p) => p?.type !== 'tool-call' || resultIds.has(p.toolCallId ?? ''),
      )
      if (parts.length === 0) continue
      cleaned.push(parts.length === (m.content as unknown[]).length ? m : ({ ...m, content: parts } as ModelMessage))
      continue
    }
    cleaned.push(m)
  }
  const merged: ModelMessage[] = []
  for (const m of cleaned) {
    const prev = merged[merged.length - 1]
    if (m.role === 'user' && prev?.role === 'user' && typeof prev.content === 'string' && typeof m.content === 'string') {
      merged[merged.length - 1] = { role: 'user', content: `${prev.content}\n\n${m.content}` }
      continue
    }
    merged.push(m)
  }
  return merged
}
