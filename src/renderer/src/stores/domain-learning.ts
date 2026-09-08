/**
 * 领域共学空间 Pinia Store
 * @module stores/domain-learning
 * @description 领域学习包的前端状态中枢（Electron preload / Web bridge 共用契约）：
 *  - spaces：Home 列表卡片（dl:list-spaces）
 *  - currentSpaceView：三栏学习空间页聚合视图（dl:get-space-view，概念/边/树/追问/统计）
 *  - 掌握度推进（ackMastered / ackConfused）、继续学习（pickNext）
 *  - 研究/追问 Agent（sendAgent / cancelAgent）+ 事件订阅生命周期（subscribeAgentEvent /
 *    subscribeStream / unsubscribeAll）
 *  IPC 不可用时（Web 注入缺失 / 测试环境）优雅降级：取空列表、置空视图，不抛错不白屏。
 */
import { ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  DlAtlasGraph,
  DlAtlasViews,
  DlNodeProfile,
  DlPaceSettings,
  DlSpaceSummary,
  DlSpaceView,
} from '@shared/types/domain-learning.types'

// ==================== IPC 返回形态（IpcResponse 精简镜像） ====================

/** IPC 统一返回 { success, data?, error? }（与后端 IpcResponse 对齐） */
interface IpcLike<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

/** 新建空间入参（对齐 dl:create-space；M2-E：可带预设 id 与自定义画像 JSON） */
export interface DlCreateSpaceInput {
  name: string
  goal: string
  tagline?: string
  description?: string
  profileId?: string
  profile?: Record<string, unknown> | null
}

/** dl agent 动作事件（通道 dl:agent:<spaceId>[:<conceptId>]；契约对齐后端 dl-agent.types） */
export interface DlAgentUiEvent {
  type: 'stage' | 'reply:start' | 'reply:done' | 'action:done' | 'error' | 'question:open'
  stage?: 'deciding' | 'acting'
  summaryEventId?: string
  error?: string
  tool?: string
  summary?: { tool: string; status: 'ok' | 'skipped' | 'error'; message: string; data?: unknown }
  questionId?: string
  suggestions?: string[]
}

/** dl 流式正文增量（通道 dl:generate:<eventId>） */
export interface DlGenerateUiEvent {
  type: 'content' | 'error'
  content?: string
  error?: string
}

/** dl:agent-send 返回（DlAgentSendResult 最小契约） */
export interface DlAgentSendResultUi {
  actionSummaries: Array<{ tool: string; status: 'ok' | 'skipped' | 'error'; message: string }>
  content: string
  questionId?: string | null
  suggestions: string[]
}

/** dl:ack-confused 返回 */
export interface DlAckConfusedResultUi {
  confusedCount: number
  splitSuggested: boolean
}

/** domainLearning 命名空间 API 形状（electronAPI 实为 any，此处仅作守卫/类型提示） */
interface DomainLearningApi {
  listSpaces(): Promise<IpcLike<DlSpaceSummary[]>>
  createSpace(p: DlCreateSpaceInput): Promise<IpcLike<{ id: string }>>
  getSpaceView(id: string): Promise<IpcLike<DlSpaceView | null>>
  getAtlasGraph(id: string): Promise<IpcLike<DlAtlasGraph | null>>
  getNodeProfile(id: string, nodeId: string): Promise<IpcLike<DlNodeProfile | null>>
  pickNext(id: string): Promise<IpcLike<string | null>>
  ackMastered(id: string, conceptId: string): Promise<IpcLike<{ ok: boolean }>>
  ackConfused(id: string, conceptId: string, sectionKey?: string): Promise<IpcLike<DlAckConfusedResultUi>>
  agentSend(p: {
    mode: 'research' | 'tutor'
    spaceId: string
    conceptId?: string | null
    message: string
    providerConfigId?: string
    modelId?: string
    focusQuestionId?: string
  }): Promise<IpcLike<DlAgentSendResultUi>>
  agentCancel(p: { mode: 'research' | 'tutor'; spaceId: string; conceptId?: string | null }): Promise<IpcLike<{ ok: boolean }>>
  agentBusy(p: { mode: 'research' | 'tutor'; spaceId: string; conceptId?: string | null }): Promise<IpcLike<boolean>>
  getSpacePace(id: string): Promise<IpcLike<DlPaceSettings>>
  setSpacePace(p: { id: string; pace: DlPaceSettings }): Promise<IpcLike<DlPaceSettings>>
  getAtlasViews(id: string): Promise<IpcLike<DlAtlasViews | null>>
  setSpaceProfile(p: { id: string; profileId?: string | null; profile?: Record<string, unknown> | null }): Promise<IpcLike<{ ok: boolean }>>
  schedulerState(): Promise<IpcLike<{ mode: 'desktop' | 'web'; running: boolean; runningCount: number }>>
  onAgentEvent(spaceId: string, conceptId: string | null | undefined, cb: (event: DlAgentUiEvent) => void): () => void
  onStream(eventId: string, cb: (event: DlGenerateUiEvent) => void): () => void
}

/** 守卫取 API：Electron/Web 均注入 window.electronAPI.domainLearning */
function api(): DomainLearningApi | null {
  const w = window as never as { electronAPI?: { domainLearning?: DomainLearningApi } }
  return w.electronAPI?.domainLearning ?? null
}

export const useDomainLearningStore = defineStore('domainLearning', () => {
  // ==================== 状态 ====================

  /** 空间列表（Home 卡片；IPC 缺失降级为空数组） */
  const spaces = ref<DlSpaceSummary[]>([])
  /** 当前空间聚合视图（Space/Atlas 页主数据源；未加载或不存在为 null） */
  const currentSpaceView = ref<DlSpaceView | null>(null)
  /** 是否正在拉空间列表 */
  const loadingSpaces = ref(false)
  /** 是否正在拉当前空间视图 */
  const loadingView = ref(false)
  /** 最近一次操作错误（成功/降级时为 null） */
  const error = ref<string | null>(null)
  /** Agent 事件订阅注册表（subscribeAgentEvent/subscribeStream 登记；unsubscribeAll 统一清理） */
  const unsubscribers: Array<() => void> = []

  // ==================== 空间列表 ====================

  /** 拉取空间列表（Home 页 onMounted；IPC 缺失 → 空列表，不抛错） */
  async function fetchSpaces(): Promise<void> {
    const a = api()
    if (!a) {
      spaces.value = []
      return
    }
    loadingSpaces.value = true
    error.value = null
    try {
      const r = await a.listSpaces()
      if (r?.success && Array.isArray(r.data)) spaces.value = r.data
      else error.value = r?.error ?? '加载空间列表失败'
    } catch (e: any) {
      error.value = e?.message ?? '加载空间列表失败'
      console.error('[domain-learning] 拉取空间列表失败:', e)
    } finally {
      loadingSpaces.value = false
    }
  }

  // ==================== 空间聚合视图 ====================

  /** 拉取三栏空间视图并写回 currentSpaceView；返回该视图（失败/缺失 → null） */
  async function fetchSpaceView(id: string): Promise<DlSpaceView | null> {
    const a = api()
    if (!a) return null
    loadingView.value = true
    error.value = null
    try {
      const r = await a.getSpaceView(id)
      if (r?.success && r.data) {
        currentSpaceView.value = r.data
        return r.data
      }
      currentSpaceView.value = null
      error.value = r?.error ?? '获取空间视图失败'
      return null
    } catch (e: any) {
      currentSpaceView.value = null
      error.value = e?.message ?? '获取空间视图失败'
      console.error('[domain-learning] 拉取空间视图失败:', e)
      return null
    } finally {
      loadingView.value = false
    }
  }

  /** 新建空间；返回新空间 id（失败 → null） */
  async function createSpace(input: DlCreateSpaceInput): Promise<string | null> {
    const a = api()
    if (!a) return null
    error.value = null
    try {
      const r = await a.createSpace(input)
      if (r?.success && r.data?.id) {
        // 同步进列表（新建即出现在 Home）
        await fetchSpaces()
        return r.data.id
      }
      error.value = r?.error ?? '新建空间失败'
      return null
    } catch (e: any) {
      error.value = e?.message ?? '新建空间失败'
      console.error('[domain-learning] 新建空间失败:', e)
      return null
    }
  }

  /** 推荐下一个待学概念（无 → null） */
  async function pickNext(id: string): Promise<string | null> {
    const a = api()
    if (!a) return null
    error.value = null
    try {
      const r = await a.pickNext(id)
      if (r?.success && typeof r.data === 'string') return r.data
      error.value = r?.error ?? '获取推荐概念失败'
      return null
    } catch (e: any) {
      error.value = e?.message ?? '获取推荐概念失败'
      console.error('[domain-learning] pickNext 失败:', e)
      return null
    }
  }

  // ==================== Atlas（知识全景） ====================

  /** 拉取知识全景图（dl:get-atlas-graph；失败 → null） */
  async function fetchAtlasGraph(id: string): Promise<DlAtlasGraph | null> {
    const a = api()
    if (!a) return null
    error.value = null
    try {
      const r = await a.getAtlasGraph(id)
      if (r?.success && r.data) return r.data
      error.value = r?.error ?? '获取知识全景失败'
      return null
    } catch (e: any) {
      error.value = e?.message ?? '获取知识全景失败'
      console.error('[domain-learning] 拉取知识全景失败:', e)
      return null
    }
  }

  /** 拉取节点档案（dl:get-node-profile；失败 → null） */
  async function fetchNodeProfile(id: string, nodeId: string): Promise<DlNodeProfile | null> {
    const a = api()
    if (!a) return null
    error.value = null
    try {
      const r = await a.getNodeProfile(id, nodeId)
      if (r?.success && r.data) return r.data
      error.value = r?.error ?? '获取节点档案失败'
      return null
    } catch (e: any) {
      error.value = e?.message ?? '获取节点档案失败'
      console.error('[domain-learning] 拉取节点档案失败:', e)
      return null
    }
  }

  // ==================== Atlas 增强视图 / 空间设置（M2-E） ====================

  /** 当前空间增强视图载荷（dl:get-atlas-views） */
  const currentAtlasViews = ref<DlAtlasViews | null>(null)

  /** 拉取增强视图（时间线/流程/矩阵/三层；写回 currentAtlasViews，失败 → null） */
  async function fetchAtlasViews(id: string): Promise<DlAtlasViews | null> {
    const a = api()
    if (!a) return null
    error.value = null
    try {
      const r = await a.getAtlasViews(id)
      if (r?.success && r.data) {
        currentAtlasViews.value = r.data
        return r.data
      }
      currentAtlasViews.value = null
      error.value = r?.error ?? '获取图谱增强视图失败'
      return null
    } catch (e: any) {
      currentAtlasViews.value = null
      error.value = e?.message ?? '获取图谱增强视图失败'
      console.error('[domain-learning] 拉取增强视图失败:', e)
      return null
    }
  }

  /** 保存空间画像（预设 id + 自定义 JSON；成功后刷新空间视图以更新标签/侧重） */
  async function saveSpaceProfile(p: {
    id: string
    profileId?: string | null
    profile?: Record<string, unknown> | null
  }): Promise<boolean> {
    const a = api()
    if (!a) return false
    error.value = null
    try {
      const r = await a.setSpaceProfile(p)
      if (r?.success) {
        await fetchSpaceView(p.id)
        return true
      }
      error.value = r?.error ?? '保存画像失败'
      return false
    } catch (e: any) {
      error.value = e?.message ?? '保存画像失败'
      console.error('[domain-learning] 保存画像失败:', e)
      return false
    }
  }

  /** 读取空间周期推进配置（dl:get-space-pace；失败 → null） */
  async function paceOf(id: string): Promise<DlPaceSettings | null> {
    const a = api()
    if (!a) return null
    try {
      const r = await a.getSpacePace(id)
      return r?.success && r.data ? r.data : null
    } catch {
      return null
    }
  }

  /** 保存空间周期推进配置（dl:set-space-pace；返回保存值，失败 → null） */
  async function savePaceOf(id: string, pace: DlPaceSettings): Promise<DlPaceSettings | null> {
    const a = api()
    if (!a) return null
    try {
      const r = await a.setSpacePace({ id, pace })
      return r?.success && r.data ? r.data : null
    } catch (e: any) {
      error.value = e?.message ?? '保存自动推进失败'
      console.error('[domain-learning] 保存自动推进失败:', e)
      return null
    }
  }

  // ==================== 掌握度反馈 ====================

  /** 标记「懂了」（mastered）；成功后由调用方自行刷新视图 */
  async function ackMastered(id: string, conceptId: string): Promise<boolean> {
    const a = api()
    if (!a) return false
    error.value = null
    try {
      const r = await a.ackMastered(id, conceptId)
      if (r?.success) return true
      error.value = r?.error ?? '标记「懂了」失败'
      return false
    } catch (e: any) {
      error.value = e?.message ?? '标记「懂了」失败'
      console.error('[domain-learning] ackMastered 失败:', e)
      return false
    }
  }

  /** 标记「没懂」（learning/拆解信号）；返回后端计数与拆解建议 */
  async function ackConfused(id: string, conceptId: string, sectionKey?: string): Promise<DlAckConfusedResultUi | null> {
    const a = api()
    if (!a) return null
    error.value = null
    try {
      const r = await a.ackConfused(id, conceptId, sectionKey)
      if (r?.success && r.data) return r.data
      error.value = r?.error ?? '标记「没懂」失败'
      return null
    } catch (e: any) {
      error.value = e?.message ?? '标记「没懂」失败'
      console.error('[domain-learning] ackConfused 失败:', e)
      return null
    }
  }

  // ==================== 研究 / 追问 Agent ====================

  /**
   * Agent 发送（整轮 await，事件面走 subscribeAgentEvent/subscribeStream）：
   * - mode='research'：研究概念/未解问题 → 产出讲义草稿落库（focusQuestionId 指定
   *   未解问题时即「开子研究」，宿主引导用问题 id 回填答案）；
   * - mode='tutor'：追问答疑 → 问题入 dl_question 队列，答上留 answered。
   */
  async function sendAgent(p: {
    mode: 'research' | 'tutor'
    spaceId: string
    conceptId?: string | null
    message: string
    focusQuestionId?: string
  }): Promise<DlAgentSendResultUi | null> {
    const a = api()
    if (!a) return null
    error.value = null
    try {
      const r = await a.agentSend(p)
      if (r?.success && r.data) return r.data
      error.value = r?.error ?? 'Agent 发送失败'
      return null
    } catch (e: any) {
      error.value = e?.message ?? 'Agent 发送失败'
      console.error('[domain-learning] agentSend 失败:', e)
      return null
    }
  }

  /** 取消某 scope 的在途 Agent 轮次 */
  async function cancelAgent(mode: 'research' | 'tutor', spaceId: string, conceptId?: string | null): Promise<void> {
    const a = api()
    if (!a) return
    try {
      await a.agentCancel({ mode, spaceId, conceptId })
    } catch { /* 静默：取消无副作用 */ }
  }

  /** 查询某 scope 是否有在途 Agent 轮次（后端内存态；查询失败视为无） */
  async function agentBusyOf(mode: 'research' | 'tutor', spaceId: string, conceptId?: string | null): Promise<boolean> {
    const a = api()
    if (!a) return false
    try {
      const r = await a.agentBusy({ mode, spaceId, conceptId })
      return !!r?.success && r.data === true
    } catch {
      return false
    }
  }

  // ==================== 事件订阅生命周期 ====================

  /**
   * 登记并返回"取消即出库"的订阅句柄：
   * 手动取消时同步从 unsubscribers 移除（幂等）；unsubscribeAll 兜底清理遗漏项。
   */
  function trackUnsubscribe(un: () => void): () => void {
    unsubscribers.push(un)
    return () => {
      const idx = unsubscribers.indexOf(un)
      if (idx >= 0) unsubscribers.splice(idx, 1)
      un()
    }
  }

  /** 订阅 agent 动作事件；返回取消函数（自动登记进 unsubscribers） */
  function subscribeAgentEvent(
    spaceId: string,
    conceptId: string | null | undefined,
    cb: (event: DlAgentUiEvent) => void,
  ): () => void {
    const a = api()
    if (!a) return () => {}
    return trackUnsubscribe(a.onAgentEvent(spaceId, conceptId, cb))
  }

  /** 订阅流式正文（dl:generate:<eventId>）；返回取消函数（自动登记进 unsubscribers） */
  function subscribeStream(eventId: string, cb: (event: DlGenerateUiEvent) => void): () => void {
    const a = api()
    if (!a) return () => {}
    return trackUnsubscribe(a.onStream(eventId, cb))
  }

  /** 统一清理全部登记过的订阅（页面卸载时调用，防泄漏） */
  function unsubscribeAll(): void {
    while (unsubscribers.length) {
      const un = unsubscribers.pop()
      un?.()
    }
  }

  /** 清除最近错误信息 */
  function clearError(): void {
    error.value = null
  }

  return {
    // 状态
    spaces,
    currentSpaceView,
    currentAtlasViews,
    loadingSpaces,
    loadingView,
    error,
    // 空间列表
    fetchSpaces,
    // 空间视图
    fetchSpaceView,
    createSpace,
    pickNext,
    // Atlas
    fetchAtlasGraph,
    fetchNodeProfile,
    fetchAtlasViews,
    // 空间设置
    saveSpaceProfile,
    paceOf,
    savePaceOf,
    // 掌握度反馈
    ackMastered,
    ackConfused,
    // Agent
    sendAgent,
    cancelAgent,
    agentBusyOf,
    subscribeAgentEvent,
    subscribeStream,
    unsubscribeAll,
    // 工具
    clearError,
  }
})
