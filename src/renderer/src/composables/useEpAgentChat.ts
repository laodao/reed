/**
 * 剧集制作 Agent 聊天状态机（新版本）
 * @module composables/useEpAgentChat
 *
 * 复用长文写作 useAgentChat 的事件演进协议，但调用 episodeProduction.agent* API：
 * - onAgentEvent(projectId, episodeId)：stage / action:start / action:done / reply:start / reply:done / error
 * - onGenerateEvent(summaryEventId)：总结流式正文（reply:start 给出 eventId）
 * 历史恢复：episodeProduction.agentHistory(episodeId)。
 */

import { ref } from 'vue'
import type { Ref } from 'vue'

export interface EpAgentActionSummaryLite {
  type: string
  status: 'ok' | 'error' | 'skipped'
  message: string
  changed?: string[]
  data?: any
}

export interface EpAgentChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  status: 'done' | 'streaming' | 'pending' | 'error'
  actions?: EpAgentActionSummaryLite[]
  suggestions?: string[]
  summaryEventId?: string
  error?: string
}

export type EpAgentChatStage = 'idle' | 'deciding' | 'acting' | 'summarizing'

export interface EpAgentPendingChoice {
  actionType: string
  param: string
  choices: string[]
  prompt?: string
  /** EP-2：审批型 choice（harness 模式）——选定后经 decide 通路回填，非文本重入 */
  approvalId?: string
  /** 审批挂起的完整工具入参（decide 回传整体替换 input 必需——评审 P1-3） */
  pendingInput?: Record<string, unknown>
}

interface EpAgentChatOptions {
  projectId: string | Ref<string>
  episodeId: string | Ref<string>
}

let uidSeed = 0
function uid(): string {
  uidSeed += 1
  return `msg_${Date.now()}_${uidSeed}`
}

function parseAssistantMetadata(metadata?: string): { actions?: EpAgentActionSummaryLite[]; suggestions?: string[] } {
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

export function useEpAgentChat(options: EpAgentChatOptions) {
  const projectIdRef = typeof options.projectId === 'string' ? ref(options.projectId) : options.projectId
  const episodeIdRef = typeof options.episodeId === 'string' ? ref(options.episodeId) : options.episodeId

  const messages = ref<EpAgentChatMessage[]>([])
  const sending = ref(false)
  const stage = ref<EpAgentChatStage>('idle')
  const suggestions = ref<string[]>([])
  const currentActionLabel = ref<string>('')
  const error = ref<string>('')
  /** 待用户选择的多轮确认（AI 请求先选候选再执行） */
  const pendingChoice = ref<EpAgentPendingChoice | null>(null)

  let currentAssistant: EpAgentChatMessage | null = null
  let unsubAgent: (() => void) | null = null
  let unsubSummary: (() => void) | null = null

  /** 恢复历史（重进剧集） */
  async function loadHistory(): Promise<void> {
    try {
      const r = await window.electronAPI.episodeProduction.agentHistory(episodeIdRef.value)
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
      console.error('[useEpAgentChat] 加载对话历史失败:', e)
    }
  }

  function clear(): void {
    messages.value = []
    suggestions.value = []
    stage.value = 'idle'
  }

  function cancel(): void {
    window.electronAPI.episodeProduction.agentCancel(projectIdRef.value, episodeIdRef.value)
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

    unsubAgent = window.electronAPI.episodeProduction.onAgentEvent(
      projectIdRef.value,
      episodeIdRef.value,
      handleAgentEvent,
    )

    try {
      const r = await window.electronAPI.episodeProduction.agentSend(
        projectIdRef.value,
        episodeIdRef.value,
        content,
      )
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
      case 'choice:request':
        // AI 请求用户先选择候选再执行动作（审批型带 approvalId；规则型走文本重入）
        pendingChoice.value = event.choice
          ? { ...event.choice, approvalId: (event as { approvalId?: string }).approvalId, pendingInput: (event as { pendingInput?: Record<string, unknown> }).pendingInput }
          : null
        if (currentAssistant) {
          currentAssistant.status = 'done'
          currentAssistant.content = (event.choice?.prompt || '请选择：') + '\n' + (event.choice?.choices || []).join('、')
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
    suggestions.value = []
    await send(text)
  }

  /** 多轮确认：用户选定候选。审批型（harness）走 decide 通路回填完整 input；
   *  规则型（旧路径）拼带参指令文本重入 */
  async function sendChoice(choice: EpAgentPendingChoice, selected: string): Promise<void> {
    if (sending.value) return
    if (choice.approvalId) {
      pendingChoice.value = null
      const api = (window.electronAPI as { episodeProduction: { agentDecide: (p: string, e: string, a: string, act: 'select' | 'reject', s?: string) => Promise<unknown> } }).episodeProduction
      await api.agentDecide(projectIdRef.value, episodeIdRef.value, choice.approvalId, 'select', selected)
      return
    }
    pendingChoice.value = null
    const param = choice.param
    // 把选择结果作为明确指令发送（引擎决策时应直接执行对应动作）
    const text = `${choice.actionType} param ${param}=${selected}`
    await send(text)
  }

  return {
    messages,
    sending,
    stage,
    suggestions,
    currentActionLabel,
    error,
    pendingChoice,
    send,
    sendSuggestion,
    sendChoice,
    cancel,
    loadHistory,
    clear,
  }
}
