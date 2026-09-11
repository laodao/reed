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
  BibleDistillScope,
  ConsensusEntry,
  DesignPackage,
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

export interface RoomModelOpts {
  providerConfigId?: string
  modelId?: string
}

export function useStoryRoom(projectId: string) {
  const messages = ref<RoomMessageView[]>([])
  /** 主编/整理器模型偏好（顶栏选择；缺省 undefined 走宿主默认） */
  const modelOpts = ref<RoomModelOpts>({})
  const state = ref<RoomStateView | null>(null)
  const status = ref<RoomStatus>('loading')
  const streamMessage = ref<RoomStreamMessage | null>(null)
  /** 阶段门建议（提取器产出，用户确认后推进） */
  const gateSuggestion = ref<{ toPhase: RoomPhaseId; reason: string } | null>(null)
  /** 矛盾提醒（写作教练位：scanContradictions 结果） */
  const conflicts = ref<Array<{ id?: string; description?: string; message?: string }>>([])
  /** 设计任务流水（lw_task_progress / lw_save_* 的过程 chip） */
  const taskLog = ref<Array<{ message: string; tool?: string; status?: string }>>([])
  /** 待确认设计包（design:ready 事件置位；确认/驳回后清空） */
  const designReady = ref<DesignPackage | null>(null)

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
      case 'task:progress':
        taskLog.value.push({ message: event.message, tool: event.tool, status: event.status })
        if (taskLog.value.length > 60) taskLog.value.splice(0, taskLog.value.length - 60)
        break
      case 'design:ready':
        // 拉最新状态拿完整包 → 前端弹确认面板
        void (async () => {
          try {
            const res = await api().roomState(projectId)
            if (res.success) {
              state.value = res.data.state ?? res.data
              const pkg = state.value?.designPackages.find((p) => p.id === event.packageId)
              if (pkg) designReady.value = pkg
            }
          } catch { /* 状态刷新失败不阻断 */ }
        })()
        break
      case 'target:changed':
        if (state.value) state.value = { ...state.value, contentTarget: event.target }
        ElMessage.success(event.target === 'script' ? '内容目标已切换为：短剧剧本' : '内容目标已切换为：长篇小说')
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

  function setModelOpts(opts: RoomModelOpts): void {
    modelOpts.value = opts
  }

  async function send(text: string): Promise<void> {
    const content = text.trim()
    if (!content || busy.value) return
    // 新轮开始：清上一轮任务流水（设计包草稿在确认面板处理，不受影响）
    taskLog.value = []
    // 本地先上屏（乐观），失败时回滚（评审 P2-15）；message:done 只推 assistant
    const optimistic: RoomMessageView = { role: 'user', content, timestamp: Date.now() }
    messages.value.push(optimistic)
    status.value = 'streaming'
    streamMessage.value = { content: '', turnNo: (state.value?.turnNo ?? 0) + 1 }
    try {
      const res = await api().roomSend(projectId, content, { ...modelOpts.value })
      if (!res.success) throw new Error(res.error || '发送失败')
      // 设计轮收尾：同步一次状态（draft 包已生成，design:ready 事件也会触发刷新）
      if (res.data?.mode === 'design') await refreshState()
    } catch (e: any) {
      status.value = 'error'
      streamMessage.value = null
      // 评审 A8：用户原话已落库/仍在——不删乐观气泡（删了会出现「无提问的道歉气泡」）
      ElMessage.error(e.message || '本轮研讨出错')
    } finally {
      if (status.value === 'streaming') status.value = 'idle'
    }
  }

  /** 拉最新房间状态（state 通道返回含 designPackages） */
  async function refreshState(): Promise<void> {
    const res = await api().roomState(projectId)
    if (res.success) state.value = res.data.state ?? res.data
  }

  /** 设计包确认（整包或逐项） */
  async function confirmDesign(packageId: string, itemIds?: string[]): Promise<boolean> {
    const res = await api().roomDesignConfirm(projectId, packageId, itemIds)
    if (!res.success) {
      ElMessage.error(res.error || '设计包确认失败')
      return false
    }
    const results: Array<{ ok: boolean; message: string }> = res.data?.results ?? []
    const failed = results.filter((r) => !r.ok)
    if (failed.length) ElMessage.warning(`部分条目落库失败：${failed[0].message}`)
    else ElMessage.success(`设计包已确认入库（${results.length} 项）`)
    designReady.value = null
    await refreshState()
    return !failed.length
  }

  /** 驳回设计包 */
  async function discardDesign(packageId: string): Promise<void> {
    const res = await api().roomDesignDiscard(projectId, packageId)
    if (!res.success) ElMessage.error(res.error || '驳回失败')
    else ElMessage.info('设计包已驳回（未落库）')
    designReady.value = null
    await refreshState()
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

  /** 动作建议 chips（原型：面向动作的短语，点击即发送） */
  const chips = computed<string[]>(() => [
    '加一个反派',
    '设计一个新门派',
    '查一下现有设定',
    '把主角的动机改成复仇',
    '生成大纲',
    '我想写架空历史',
  ])

  /** 按需提炼：按当前阶段推荐范围（或显式 scope） */
  function suggestScope(): DistillScope {
    const phase = state.value?.phase ?? 'story-core'
    if (phase === 'characters') return 'characters'
    if (phase === 'plots') return 'plots'
    if (phase === 'outline') return 'outline'
    if (phase === 'writing') return 'chapter'  // 评审 A1：写作阶段可出章节卡
    return 'overview'
  }

  async function distill(scope?: BibleDistillScope): Promise<ArtifactCard[]> {
    const target = scope || suggestScope()
    const res = await api().roomDistill(projectId, target, { ...modelOpts.value })
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
    // 失败态用错误色提示（评审 P2-10：失败文案不再冒充成功 toast）
    const done = res.data.card.status === 'adopted'
    if (done) ElMessage.success(res.data.card.resultNote || '已采纳入库')
    else ElMessage.error(res.data.card.resultNote || '落库失败，可修改后重试')
    return done
  }

  async function regenerateCard(card: ArtifactCard, feedback: string): Promise<void> {
    const res = await api().roomRegenerateCard(projectId, card.id, feedback, { ...modelOpts.value })
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
    modelOpts,
    setModelOpts,
    gateSuggestion,
    conflicts,
    taskLog,
    designReady,
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
    confirmDesign,
    discardDesign,
  }
}

export type StoryRoomStore = ReturnType<typeof useStoryRoom>
export type { ArtifactCard, ConsensusEntry }
