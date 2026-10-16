/**
 * 会话上下文查看的纯函数（ac:get-context，37 号实测反馈）
 * @module core/packs/workflow/handlers/agent-console-context
 *
 * 从 agent-console.handler 拆出：ModelMessage → 展示投影不碰 IPC/DB，
 * 单测可直接锚定截断与部件归类行为。
 */

import type { ModelMessage } from 'ai'
import type { AgentConsoleContextMessage } from '@shared/types/agent.types'
import { workflowRuntimeParams } from '@shared/utils/workflow-runtime-params'

// 注意（2026-09-13 参数设置）：下面两个导出常量现在是**内置默认值**，
// 真正的生效值在使用点从「参数设置 → 工作流 → 界面展示截断」现读。
/** 文本预览上限（上下文查看是"看清构成"不是全文导出；全量在会话存储里） */
export const CONTEXT_TEXT_LIMIT = 1600
/** 工具部件摘要上限 */
export const CONTEXT_PART_LIMIT = 400

/** 生效的展示截断（使用点现读） */
const uiLimits = (): { text: number; part: number } => {
  const ui = workflowRuntimeParams().ui
  return { text: ui.contextTextChars, part: ui.contextPartChars }
}

/** scopeKey → 会话存储 conversationId（与两个宿主的落库键约定互逆：
 *  聊天宿主 agentSessionId = `system-chat-agent:dialog:<id>`；任务执行器直接用 `task:<id>`） */
export function contextConversationId(scopeKey: string): string {
  return scopeKey.startsWith('dialog:') ? `system-chat-agent:${scopeKey}` : scopeKey
}

function truncate(s: string, max: number): { text: string; truncated: boolean } {
  return s.length <= max ? { text: s, truncated: false } : { text: `${s.slice(0, max)}…[截断]`, truncated: true }
}

function safeJson(value: unknown): string {
  if (value === undefined || value === null) return ''
  try {
    return JSON.stringify(value) ?? ''
  } catch {
    return '[unserializable]'
  }
}

/** ModelMessage → 展示投影（纯函数）：文本拼装、工具部件摘要、体量统计 */
export function describeContextMessage(message: ModelMessage, seq: number): AgentConsoleContextMessage {
  const raw = JSON.stringify(message) ?? ''
  const content = message.content
  const parts = Array.isArray(content) ? content : [{ type: 'text', text: String(content ?? '') }]
  const textChunks: string[] = []
  const toolCalls: AgentConsoleContextMessage['toolCalls'] = []
  const toolResults: AgentConsoleContextMessage['toolResults'] = []
  const otherParts: string[] = []
  let truncated = false
  for (const part of parts) {
    const type = (part as { type?: unknown }).type
    if (type === 'text' || (type === undefined && typeof (part as { text?: unknown }).text === 'string')) {
      const r = truncate(String((part as { text?: unknown }).text ?? ''), uiLimits().text)
      if (r.text) textChunks.push(r.text)
      truncated = truncated || r.truncated
    } else if (type === 'tool-call') {
      const p = part as { toolName?: unknown; input?: unknown }
      const r = truncate(safeJson(p.input), uiLimits().part)
      toolCalls.push({ name: String(p.toolName ?? '?'), argsDigest: r.text })
      truncated = truncated || r.truncated
    } else if (type === 'tool-result') {
      const p = part as { toolName?: unknown; output?: unknown }
      const r = truncate(safeJson(p.output), uiLimits().part)
      toolResults.push({ name: String(p.toolName ?? '?'), digest: r.text })
      truncated = truncated || r.truncated
    } else if (typeof type === 'string') {
      otherParts.push(type)
    }
  }
  return {
    seq,
    role: typeof message.role === 'string' ? message.role : 'unknown',
    text: textChunks.join('\n\n'),
    toolCalls,
    toolResults,
    otherParts,
    truncated,
    bytes: Buffer.byteLength(raw, 'utf8'),
  }
}
