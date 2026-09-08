/**
 * 故事研讨室状态编排（v2.1 M3）
 * @module renderer/composables/useStoryRoom
 *
 * 消息 / 流式 / 账本 / 卡片 / 阶段的单一状态源，订阅 `longwriting:room:{projectId}`
 * 事件通道（onRoomEvent）。设计文档 §7.2：不复用旧 useAgentChat。
 */

import { ref, computed, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import type {
  ArtifactCard,
  ConsensusEntry,
  DistillScope,
  LedgerOpInput,
  RoomEvent,
  RoomMessageView,
  RoomPhaseId,
  RoomStateView,
} from '@shared/types/story-room.types'

export type RoomStatus = 'idle' | 'loading' | 'streaming' | 'error'

export interface RoomStreamMessage {
  /** 流式累积中的主编发言（turnNo 对齐本轮） */
  content: string
  turnNo: number
}

export function useStoryRoom(projectId: string) {
  const messages = ref<RoomMessageView[]>([])
  const state = ref<RoomStateView | null>(null)
  const status = ref<RoomStatus>('loading')
  const streamMessage = ref<RoomStreamMessage | null>(null)
  /** 阶段门建议（提取器产出，用户确认后推进） */
  const gateSuggestion = ref<{ toPhase: RoomPhaseId; reason: string } | null>(null)
  /** 矛盾提醒（写作教练位：scanContradictions 结果） */
  const conflicts = ref<Array<{ id?: string; description?: string; message?: string }>>([])

  const busy = computed(() => status.value === 'streaming')

  const api = () => window.electronAPI.longwriting

  /** 事件解绑函数（组件卸载时清理） */
  let dispose: (() => void) | null = null

  function handleEvent(event: RoomEvent) {
    switch (event.type) {
      case 'message:delta':
        if (!streamMessage.value) streamMessage.value = { content: '', turnNo: (state.value?.turnNo ?? 0) + 1 }
        streamMessage.value.content += event.text
        break
      case 'message:done':
        streamMessage.value = null
        if (event.message) messages.value.push(event.message)
        break
      case 'ledger:update':
        if (state.value) state.value = { ...state.value, ledger: event.ledger }
        break
      case 'card:ready':
        if (state.value) state.value = { ...state.value, pendingCards: [...state.value.pendingCards, ...event.cards] }
        break
      case 'card:update':
        if (state.value) {
          const cards = state.value.pendingCards.map((c) => (c.id === event.card.id ? event.card : c))
          state.value = { ...state.value, pendingCards: cards }
        }
        break
      case 'phase:changed':
        gateSuggestion.value = null
        if (state.value) state.value = { ...state.value, phase: event.phase }
        loadConflictsIfWriting()
        break
      case 'gate:suggest':
        gateSuggestion.value = { toPhase: event.toPhase, reason: event.reason }
        break
      case 'error':
        status.value = 'error'
        streamMessage.value = null
        ElMessage.error(event.error || '本轮研讨出错')
        break
    }
  }

  async function load(): Promise<void> {
    status.value = 'loading'
    try {
      const res = await api().roomHistory(projectId)
      if (!res.success) throw new Error(res.error || '加载研讨历史失败')
      messages.value = res.data.messages || []
      state.value = res.data.state
      dispose?.()
      dispose = api().onRoomEvent(projectId, handleEvent as (e: unknown) => void)
      status.value = 'idle'
    } catch (e: any) {
      status.value = 'error'
      ElMessage.error(e.message || '研讨室加载失败')
    }
  }

  async function send(text: string): Promise<void> {
    const content = text.trim()
    if (!content || busy.value) return
    // 本地先上屏（乐观），message:done 时由后端消息替代——后端回执带 id/metadata，
    // 为避免重复，done 后重整一次（done 只 push assistant，用户消息不回推）
    messages.value.push({ role: 'user', content, timestamp: Date.now() })
    status.value = 'streaming'
    streamMessage.value = { content: '', turnNo: (state.value?.turnNo ?? 0) + 1 }
    try {
      const res = await api().roomSend(projectId, content)
      if (!res.success) throw new Error(res.error || '发送失败')
    } catch (e: any) {
      status.value = 'error'
      streamMessage.value = null
      ElMessage.error(e.message || '本轮研讨出错')
    } finally {
      if (status.value === 'streaming') status.value = 'idle'
    }
  }

  function cancel(): void {
    api().roomCancel(projectId)
  }

  async function ledgerOp(op: LedgerOpInput): Promise<void> {
    const res = await api().roomLedgerUpdate(projectId, op)
    if (!res.success) {
      ElMessage.error(res.error || '账本操作失败')
      return
    }
    if (state.value) state.value = { ...state.value, ledger: res.data.ledger }
  }

  async function setPhase(phase: RoomPhaseId): Promise<void> {
    gateSuggestion.value = null
    const res = await api().roomSetPhase(projectId, phase)
    if (res.success && state.value) state.value = { ...state.value, phase: res.data.phase }
  }

  async function setTarget(target: 'novel' | 'script'): Promise<void> {
    const res = await api().roomSetTarget(projectId, target)
    if (res.success && state.value) state.value = { ...state.value, contentTarget: target }
  }

  /** 门确认：提炼下一阶段范围 + 推进阶段 */
  async function acceptGate(): Promise<void> {
    const to = gateSuggestion.value?.toPhase
    if (!to) return
    gateSuggestion.value = null
    const scope = to === 'characters' ? 'characters' : to === 'plots' ? 'plots' : to === 'outline' ? 'outline' : undefined
    if (scope) await distill(scope)
    await setPhase(to)
  }

  /** 写作教练位：拉取矛盾提醒（writing 阶段） */
  async function loadConflictsIfWriting(): Promise<void> {
    if (state.value?.phase !== 'writing') {
      conflicts.value = []
      return
    }
    try {
      const res = await api().graphScanContradictions(projectId)
      const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : []
      conflicts.value = list.slice(0, 10)
    } catch {
      conflicts.value = []
    }
  }

  /** 提问建议 chips：让主编提问 / 按阶段提示 */
  const chips = computed<string[]>(() => {
    const base = ['让主编提问', '把我们定下的整理一下']
    if (state.value?.phase === 'story-core') base.unshift('先定主角的动机与代价')
    return base
  })

  /** 按需提炼：按当前阶段推荐范围（或显式 scope） */
  function suggestScope(): DistillScope {
    const phase = state.value?.phase ?? 'story-core'
    if (phase === 'characters') return 'characters'
    if (phase === 'plots') return 'plots'
    if (phase === 'outline' || phase === 'writing') return 'outline'
    return 'overview'
  }

  async function distill(scope?: DistillScope): Promise<ArtifactCard[]> {
    const target = scope || suggestScope()
    const res = await api().roomDistill(projectId, target)
    if (!res.success) {
      ElMessage.warning(res.error || '提炼失败')
      return []
    }
    ElMessage.success(`已整理出 ${res.data.cards.length} 张卡片，请确认`)
    return res.data.cards
  }

  async function adoptCard(card: ArtifactCard, patch?: Record<string, unknown>): Promise<boolean> {
    const res = await api().roomAdoptCard(projectId, card.id, patch)
    if (!res.success) {
      ElMessage.error(res.error || '采纳失败')
      return false
    }
    ElMessage.success(res.data.card.resultNote || '已采纳入库')
    return res.data.card.status === 'adopted'
  }

  async function regenerateCard(card: ArtifactCard, feedback: string): Promise<void> {
    const res = await api().roomRegenerateCard(projectId, card.id, feedback)
    if (!res.success) ElMessage.error(res.error || '重提失败')
  }

  async function ignoreCard(card: ArtifactCard): Promise<void> {
    await api().roomIgnoreCard(projectId, card.id)
  }

  onBeforeUnmount(() => {
    dispose?.()
    dispose = null
  })

  return {
    messages,
    state,
    status,
    streamMessage,
    busy,
    chips,
    gateSuggestion,
    conflicts,
    load,
    send,
    cancel,
    ledgerOp,
    setPhase,
    setTarget,
    acceptGate,
    loadConflictsIfWriting,
    suggestScope,
    distill,
    adoptCard,
    regenerateCard,
    ignoreCard,
  }
}

export type StoryRoomStore = ReturnType<typeof useStoryRoom>
export type { ArtifactCard, ConsensusEntry }
