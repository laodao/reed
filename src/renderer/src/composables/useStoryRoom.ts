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
        if (state.value) state.value = { ...state.value, phase: event.phase }
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
    const res = await api().roomSetPhase(projectId, phase)
    if (res.success && state.value) state.value = { ...state.value, phase: res.data.phase }
  }

  /** 提问建议 chips：让主编提问 / 按阶段提示 */
  const chips = computed<string[]>(() => {
    const base = ['让主编提问', '把我们定下的整理一下']
    if (state.value?.phase === 'story-core') base.unshift('先定主角的动机与代价')
    return base
  })

  /** 卡片操作（M4 接 distill/adoptCard 通道；M3 先占位） */
  async function adoptCard(_card: ArtifactCard): Promise<void> {
    ElMessage.info('卡片采纳将在提炼闭环（M4）后可用')
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
    load,
    send,
    cancel,
    ledgerOp,
    setPhase,
    adoptCard,
  }
}

export type StoryRoomStore = ReturnType<typeof useStoryRoom>
export type { ArtifactCard, ConsensusEntry }
