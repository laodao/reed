/**
 * 对话式工作流 Agent 聊天状态机
 * @module composables/useAgentChat
 *
 * 消息列表（user/assistant）+ 事件驱动演进：
 * - onAgentEvent(projectId)：stage / action:start / action:done / reply:start / reply:done / error
 * - onGenerateEvent(summaryEventId)：总结流式正文（reply:start 给出 eventId）
 * 历史恢复：agentHistory 通道。
 */

import { ref } from 'vue'
import type { Ref } from 'vue'

export interface AgentActionSummaryLite {
  type: string
  status: 'ok' | 'error' | 'skipped'
  message: string
  changed?: string[]
  data?: any
}

export interface AgentChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  status: 'done' | 'streaming' | 'pending' | 'error'
  /** assistant 消息的动作摘要（预览卡/面板跳转） */
  actions?: AgentActionSummaryLite[]
  /** 下一步建议 chips */
  suggestions?: string[]
  /** 总结流式 eventId */
  summaryEventId?: string
  /** 失败原因（status=error） */
  error?: string
}

export type AgentChatStage = 'idle' | 'deciding' | 'acting' | 'summarizing'

interface AgentChatOptions {
  projectId: string | Ref<string>
  /** 每轮动作开始标签（过程提示，如"正在生成人物…"） */
  onActionStart?: (label: string) => void
}

let uidSeed = 0
function uid(): string {
  uidSeed += 1
  return `msg_${Date.now()}_${uidSeed}`
}

function parseAssistantMetadata(metadata?: string): { actions?: AgentActionSummaryLite[]; suggestions?: string[] } {
  if (!metadata) return {}
  try {
    const obj = JSON.parse(metadata)
    return {
      actions: Array.isArray(obj.actions) ? obj.actions : undefined,
      suggestions: Array.isArray(obj.suggestions) ? obj.suggestions : undefined,
    }
  } catch {
    return {}
  }
}

export function useAgentChat(options: AgentChatOptions) {
  const projectIdRef = typeof options.projectId === 'string' ? ref(options.projectId) : options.projectId

  const messages = ref<AgentChatMessage[]>([])
  const sending = ref(false)
  const stage = ref<AgentChatStage>('idle')
  const suggestions = ref<string[]>([])
  const currentActionLabel = ref<string>('')
  const error = ref<string>('')

  let currentAssistant: AgentChatMessage | null = null
  let unsubAgent: (() => void) | null = null
  let unsubSummary: (() => void) | null = null

  /** 恢复历史（重进项目） */
  async function loadHistory(): Promise<void> {
    try {
      const r = await window.electronAPI.longwriting.agentHistory(projectIdRef.value)
      if (r.success && Array.isArray(r.data)) {
        messages.value = r.data.map((m: any, i: number) => {
          const meta = parseAssistantMetadata(m.metadata)
          return {
            id: `h_${i}_${uid()}`,
            role: m.role,
            content: m.content || '',
            status: 'done',
            actions: meta.actions,
            suggestions: meta.suggestions,
          }
        })
        const lastAssistant = [...messages.value].reverse().find(m => m.role === 'assistant')
        if (lastAssistant?.suggestions) {
          suggestions.value = lastAssistant.suggestions
        }
      }
    } catch (e: any) {
      console.error('[useAgentChat] 加载对话历史失败:', e)
    }
  }

  function clear(): void {
    messages.value = []
    suggestions.value = []
    stage.value = 'idle'
  }

  function cancel(): void {
    window.electronAPI.longwriting.agentCancel(projectIdRef.value)
  }

  async function send(text: string): Promise<void> {
    const content = text.trim()
    if (!content || sending.value) return

    sending.value = true
    error.value = ''
    currentActionLabel.value = ''
    messages.value.push({ id: uid(), role: 'user', content, status: 'done' })

    currentAssistant = { id: uid(), role: 'assistant', content: '', status: 'pending' }
    messages.value.push(currentAssistant)

    // 订阅 agent 事件（本轮）
    unsubAgent = window.electronAPI.longwriting.onAgentEvent(projectIdRef.value, handleAgentEvent)

    try {
      const r = await window.electronAPI.longwriting.agentSend(projectIdRef.value, content)
      if (!r.success) {
        appendError(r.error || '发送失败')
      }
    } catch (e: any) {
      appendError(e.message || '发送失败')
    } finally {
      unsubAgent?.()
      unsubAgent = null
      unsubSummary?.()
      unsubSummary = null
      sending.value = false
      if (currentAssistant && currentAssistant.status === 'pending') {
        currentAssistant.status = 'error'
        currentAssistant.error = '未收到 AI 回复'
      }
      currentAssistant = null
    }
  }

  function handleAgentEvent(event: any): void {
    if (!event || !currentAssistant) return
    switch (event.type) {
      case 'stage':
        stage.value = event.stage
        break
      case 'action:start':
        currentActionLabel.value = event.label || ''
        break
      case 'action:done': {
        if (event.summary) {
          currentAssistant.actions = [...(currentAssistant.actions || []), event.summary]
        }
        currentActionLabel.value = ''
        break
      }
      case 'reply:start': {
        currentAssistant.status = 'streaming'
        currentAssistant.summaryEventId = event.summaryEventId
        // 订阅总结流式正文（复用 onGenerateEvent 链路）
        unsubSummary?.()
        unsubSummary = window.electronAPI.longwriting.onGenerateEvent(event.summaryEventId, (ev: any) => {
          if (!currentAssistant) return
          if (ev.type === 'content' && ev.content) {
            currentAssistant.content += ev.content
          } else if (ev.type === 'error' && ev.error) {
            appendError(ev.error)
          }
        })
        break
      }
      case 'reply:done':
        if (currentAssistant) {
          currentAssistant.status = 'done'
          if (Array.isArray(event.suggestions)) {
            currentAssistant.suggestions = event.suggestions
            suggestions.value = event.suggestions
          }
        }
        stage.value = 'idle'
        break
      case 'error':
        appendError(event.error || '发生错误')
        break
    }
  }

  function appendError(message: string): void {
    error.value = message
    if (currentAssistant && currentAssistant.status === 'pending') {
      currentAssistant.status = 'error'
      currentAssistant.error = message
    }
  }

  /** 点击 chips：作为用户消息发送 */
  async function sendSuggestion(text: string): Promise<void> {
    if (sending.value) return
    // chips 即时清空，避免重复点击
    suggestions.value = []
    await send(text)
  }

  return {
    messages,
    sending,
    stage,
    suggestions,
    currentActionLabel,
    error,
    send,
    sendSuggestion,
    cancel,
    loadHistory,
    clear,
  }
}
