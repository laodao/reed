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
import { normalizeLessonCardId, parseLessonExportFormat } from '@shared/utils/domain-learning-lesson-export'
import type {
  DlAtlasGraph,
  DlAtlasViews,
  DlCardView,
  DlCreateConceptInput,
  DlCreateConceptResult,
  DlLessonDigest,
  DlLessonExportFormat,
  DlLessonExportResult,
  DlCardVersionItem,
  DlCardRestoreResult,
  DlNodeProfile,
  DlNote,
  DlNoteQueryResult,
  DlPaceSettings,
  DlReviewDueItem,
  DlReviewSettings,
  DlSpacePrereq,
  DlSpaceStats,
  DlSpaceSummary,
  DlSpaceView,
  DlPlanView,
} from '@shared/types/domain-learning.types'
import { toPlainData } from '../utils/plain-data'

// ==================== IPC 返回形态（IpcResponse 精简镜像） ====================

/** IPC 统一返回 { success, data?, error? }（与后端 IpcResponse 对齐） */
interface IpcLike<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

/** 新建空间入参（对齐 dl:create-space；M2-E：画像；M4-B：可绑项目知识库） */
export interface DlCreateSpaceInput {
  name: string
  goal: string
  tagline?: string
  description?: string
  profileId?: string
  profile?: Record<string, unknown> | null
  kbId?: string | null
}

/** dl agent 动作事件（通道 dl:agent:<spaceId>[:<conceptId>]；契约对齐后端 dl-agent.types） */
export interface DlAgentUiEvent {
  type: 'stage' | 'reply:start' | 'reply:done' | 'action:done' | 'error' | 'question:open' | 'progress'
  /** 产生事件的会话模式（2026-09-09 复盘：订阅方按自己发起的 mode 过滤，防跨模式并发混流） */
  mode?: 'research' | 'tutor' | 'task' | 'verify'
  stage?: 'deciding' | 'acting'
  summaryEventId?: string
  error?: string
  tool?: string
  summary?: { tool: string; status: 'ok' | 'skipped' | 'error'; message: string; data?: unknown }
  questionId?: string
  suggestions?: string[]
  /** 活动行（type='progress'；2026-09-13：长任务滚动显示"系统正在做什么"，失败行 kind='warn'） */
  activity?: {
    line: string
    kind?: 'info' | 'warn'
    conceptId?: string | null
    step?: number
    tool?: string
  }
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
  getSpace(id: string): Promise<IpcLike<Record<string, unknown> | null>>
  createSpace(p: DlCreateSpaceInput): Promise<IpcLike<{ id: string }>>
  setSpaceKb(p: { id: string; kbId?: string | null }): Promise<IpcLike<{ kbId: string | null }>>
  getSpacePrereqs(id: string): Promise<IpcLike<DlSpacePrereq[]>>
  setSpacePrereqs(p: { id: string; prerequisites: DlSpacePrereq[] }): Promise<IpcLike<{ prerequisites: DlSpacePrereq[] }>>
  getSpaceView(id: string): Promise<IpcLike<DlSpaceView | null>>
  getAtlasGraph(id: string): Promise<IpcLike<DlAtlasGraph | null>>
  getNodeProfile(id: string, nodeId: string): Promise<IpcLike<DlNodeProfile | null>>
  pickNext(id: string): Promise<IpcLike<string | null>>
  /** 手工追加知识点（2026-09-12：用户建点 + 前置直连） */
  saveConcept(p: DlCreateConceptInput): Promise<IpcLike<DlCreateConceptResult>>
  /** 关系人审确认（未确认边 → verified） */
  confirmRelation(p: { id: string; sourceId: string; targetId: string; relationType: string; evidence?: string }): Promise<IpcLike<{ ok: boolean }>>
  /** 删除关系边（2026-09-25：错边/成环边的修复入口） */
  removeRelation(p: { id: string; relationId: string }): Promise<IpcLike<{ ok: boolean }>>
  ackMastered(id: string, conceptId: string): Promise<IpcLike<{ ok: boolean }>>
  ackConfused(id: string, conceptId: string, sectionKey?: string): Promise<IpcLike<DlAckConfusedResultUi>>
  agentSend(p: {
    mode: 'research' | 'tutor' | 'task'
    spaceId: string
    conceptId?: string | null
    message: string
    providerConfigId?: string
    modelId?: string
    focusQuestionId?: string
  }): Promise<IpcLike<DlAgentSendResultUi>>
  agentCancel(p: { mode: 'research' | 'tutor' | 'task'; spaceId: string; conceptId?: string | null }): Promise<IpcLike<{ ok: boolean }>>
  agentBusy(p: { mode: 'research' | 'tutor' | 'task'; spaceId: string; conceptId?: string | null }): Promise<IpcLike<boolean>>
  publishCard(p: { id: string; cardId: string }): Promise<IpcLike<{ ok: boolean; already?: boolean }>>
  getSpacePace(id: string): Promise<IpcLike<DlPaceSettings>>
  setSpacePace(p: { id: string; pace: DlPaceSettings }): Promise<IpcLike<DlPaceSettings>>
  getSpaceModel(id: string): Promise<IpcLike<{ providerConfigId: string | null; modelId: string | null }>>
  setSpaceModel(p: { id: string; model: { providerConfigId?: string | null; modelId?: string | null } }): Promise<IpcLike<{ model: { providerConfigId: string | null; modelId: string | null } }>>
  getAtlasViews(id: string): Promise<IpcLike<DlAtlasViews | null>>
  getSpaceStats(id: string): Promise<IpcLike<DlSpaceStats | null>>
  exportLessonDigest(id: string): Promise<IpcLike<DlLessonDigest | null>>
  /** 单篇讲义导出（md/PDF/长图；cardId 缺省=当前版） */
  exportLesson(p: { id: string; conceptId: string; format: DlLessonExportFormat; cardId?: string | null }): Promise<IpcLike<DlLessonExportResult | null>>
  /** 讲义版本列表（降序，isCurrent 标注最新版） */
  listCardVersions(p: { id: string; conceptId: string }): Promise<IpcLike<DlCardVersionItem[] | null>>
  /** 取单版讲义（只读预览） */
  getCardVersion(p: { id: string; cardId: string }): Promise<IpcLike<DlCardView | null>>
  /** 恢复到草稿（新建最新版，旧版留档） */
  restoreCard(p: { id: string; conceptId: string; cardId: string }): Promise<IpcLike<DlCardRestoreResult | null>>
  setSpaceProfile(p: { id: string; profileId?: string | null; profile?: Record<string, unknown> | null }): Promise<IpcLike<{ ok: boolean }>>
  getSpaceReview(id: string): Promise<IpcLike<DlReviewSettings>>
  setSpaceReview(p: { id: string; review: DlReviewSettings }): Promise<IpcLike<DlReviewSettings>>
  reviewDue(id: string): Promise<IpcLike<{ settings: DlReviewSettings; items: DlReviewDueItem[] }>>
  ackNeedReview(p: { id: string; conceptId: string }): Promise<IpcLike<{ ok: boolean }>>
  reviewDone(p: { id: string; conceptId: string }): Promise<IpcLike<{ ok: boolean }>>
  listNotes(p: { id: string; conceptId?: string | null }): Promise<IpcLike<DlNoteQueryResult>>
  createNote(p: {
    id: string
    conceptId?: string | null
    source: 'selection' | 'qna'
    anchorText?: string | null
    anchorStart?: number | null
    anchorEnd?: number | null
    questionId?: string | null
    contentMd: string
  }): Promise<IpcLike<{ note: DlNote; created: boolean }>>
  deleteNote(p: { id: string; noteId: string }): Promise<IpcLike<{ ok: boolean }>>
  schedulerState(): Promise<IpcLike<{ mode: 'desktop' | 'web'; running: boolean; runningCount: number }>>
  /** 方案确认流程（2026-09-13）：读方案总览 / 确认某一步（可带用户编辑后的载荷）
   *  2026-09-14：带 conceptId 时一并读回该概念的**讲义方案**（lesson 步） */
  getPlan(id: string, conceptId?: string | null): Promise<IpcLike<DlPlanView>>
  confirmPlan(p: {
    id: string
    step: 'understanding' | 'syllabus' | 'lesson'
    payload?: unknown
    feedback?: string | null
    conceptId?: string | null
  }): Promise<IpcLike<{ message: string }>>
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

  // ==================== 空间默认模型（2026-09-14：知识生成默认模型） ====================

  /** 读取空间知识生成默认模型（dl:get-space-model；双 null=跟随全局默认，失败 → null） */
  async function spaceModelOf(id: string): Promise<{ providerConfigId: string | null; modelId: string | null } | null> {
    const a = api()
    if (!a) return null
    try {
      const r = await a.getSpaceModel(id)
      if (r?.success && r.data) return r.data
      error.value = r?.error ?? '读取空间模型设置失败'
      return null
    } catch {
      return null
    }
  }

  /** 保存空间知识生成默认模型（dl:set-space-model；null=跟随全局默认，失败 → null） */
  async function saveSpaceModelOf(
    id: string,
    model: { providerConfigId?: string | null; modelId?: string | null },
  ): Promise<{ providerConfigId: string | null; modelId: string | null } | null> {
    const a = api()
    if (!a) return null
    try {
      const r = await a.setSpaceModel({ id, model })
      if (r?.success && r.data) return r.data.model
      error.value = r?.error ?? '保存空间模型设置失败'
      return null
    } catch (e: any) {
      error.value = e?.message ?? '保存空间模型设置失败'
      console.error('[domain-learning] 保存空间模型设置失败:', e)
      return null
    }
  }

  // ==================== 间隔复习（M3-B） ====================

  /** 当前空间到期复习载荷（dl:review-due；settings + items） */
  const reviewDue = ref<{ settings: DlReviewSettings; items: DlReviewDueItem[] } | null>(null)

  /** 绑定/改绑项目知识库（M4-B；kbId=null=解除）。返回 { ok, kbId }——
   *  解除绑定成功时 kbId 为 null 但 ok=true，与失败（ok=false）可区分 */
  async function saveKbOf(id: string, kbId?: string | null): Promise<{ ok: boolean; kbId: string | null }> {
    const a = api()
    if (!a) return { ok: false, kbId: null }
    try {
      const r = await a.setSpaceKb({ id, kbId: kbId ?? null })
      if (r?.success && r.data) return { ok: true, kbId: r.data.kbId ?? null }
      error.value = r?.error ?? '保存知识库绑定失败'
      return { ok: false, kbId: null }
    } catch (e: any) {
      error.value = e?.message ?? '保存知识库绑定失败'
      return { ok: false, kbId: null }
    }
  }

  /** 读当前空间绑定的知识库 id（dl:get-space；失败 → null） */
  async function spaceMetaKbOf(id: string): Promise<string | null> {
    const a = api()
    if (!a) return null
    try {
      const r = await a.getSpace(id)
      const row = r?.success && r.data ? r.data : null
      return (row?.kbId as string | null | undefined) ?? null
    } catch {
      return null
    }
  }

  // ==================== 主题学习前置要求（2026-09-12 用户需求） ====================

  /** 读主题前置要求（dl:get-space-prereqs；失败 → null 以便与"空数组=未声明"区分） */
  async function fetchSpacePrereqs(id: string): Promise<DlSpacePrereq[] | null> {
    const a = api()
    if (!a) return null
    try {
      const r = await a.getSpacePrereqs(id)
      const list = r?.success && Array.isArray(r.data) ? r.data : null
      if (!list) {
        error.value = r?.error ?? '读取主题前置要求失败'
        return null
      }
      return list
    } catch (e: any) {
      error.value = e?.message ?? '读取主题前置要求失败'
      console.error('[domain-learning] 读取主题前置要求失败:', e)
      return null
    }
  }

  /** 保存主题前置要求（dl:set-space-prereqs；成功后刷新空间视图）→ 落库结果，失败 → null */
  async function saveSpacePrereqsOf(
    id: string,
    prerequisites: DlSpacePrereq[],
  ): Promise<DlSpacePrereq[] | null> {
    const a = api()
    if (!a) return null
    try {
      const r = await a.setSpacePrereqs({ id, prerequisites })
      const saved = r?.success && r.data ? (r.data.prerequisites as DlSpacePrereq[]) : null
      if (!saved) {
        error.value = r?.error ?? '保存主题前置要求失败'
        return null
      }
      await fetchSpaceView(id)
      return saved
    } catch (e: any) {
      error.value = e?.message ?? '保存主题前置要求失败'
      console.error('[domain-learning] 保存主题前置要求失败:', e)
      return null
    }
  }

  // ==================== 手工建点 + 关系人审（2026-09-12 用户需求） ====================

  /**
   * 手工追加知识点（dl:save-concept）。成功后刷新空间视图并返回落库结果：
   * - `missingPrereqs` 非空表示勾选的前置在空间里还没有落点（UI 提示"可让 AI 补全"）。
   */
  async function createConceptOf(p: DlCreateConceptInput): Promise<DlCreateConceptResult | null> {
    const a = api()
    if (!a) return null
    try {
      // prerequisites 可能来自 reactive 表单（el-select multiple），出站前纯化，
      // 否则 Vue 代理过不了结构化克隆（"An object could not be cloned."）
      const r = await a.saveConcept(toPlainData(p))
      if (!r?.success || !r.data) {
        error.value = r?.error ?? '新建知识点失败'
        return null
      }
      await fetchSpaceView(p.id)
      return r.data
    } catch (e: any) {
      error.value = e?.message ?? '新建知识点失败'
      console.error('[domain-learning] 新建知识点失败:', e)
      return null
    }
  }

  /**
   * 关系人审确认（dl:confirm-relation）：把未确认的关系边置为 verified。
   * 成功后刷新空间视图（概念视图的 declaredPrereqs/门控随之更新）。
   */
  async function confirmRelationOf(p: {
    id: string
    sourceId: string
    targetId: string
    relationType: string
    evidence?: string
  }): Promise<boolean> {
    const a = api()
    if (!a) return false
    try {
      const r = await a.confirmRelation(p)
      if (!r?.success) {
        error.value = r?.error ?? '确认关系失败'
        return false
      }
      await fetchSpaceView(p.id)
      return true
    } catch (e: any) {
      error.value = e?.message ?? '确认关系失败'
      console.error('[domain-learning] 确认关系失败:', e)
      return false
    }
  }

  /**
   * 删除关系边（dl:remove-relation；2026-09-25）：错边/成环边的人审修复入口。
   * 成功后刷新空间视图与节点档案（关系列表随之更新）。
   */
  async function removeRelationOf(p: { id: string; relationId: string; nodeId?: string }): Promise<boolean> {
    const a = api()
    if (!a) return false
    try {
      const r = await a.removeRelation({ id: p.id, relationId: p.relationId })
      if (!r?.success) {
        error.value = r?.error ?? '删除关系失败'
        return false
      }
      await fetchSpaceView(p.id)
      if (p.nodeId) await fetchNodeProfile(p.id, p.nodeId)
      return true
    } catch (e: any) {
      error.value = e?.message ?? '删除关系失败'
      console.error('[domain-learning] 删除关系失败:', e)
      return false
    }
  }

  /** 当前空间统计载荷（dl:get-space-stats） */  const spaceStats = ref<DlSpaceStats | null>(null)

  /** 拉取学习统计（写 spaceStats；失败 → null） */
  async function fetchSpaceStats(id: string): Promise<DlSpaceStats | null> {
    const a = api()
    if (!a) return null
    try {
      const r = await a.getSpaceStats(id)
      if (r?.success && r.data) {
        spaceStats.value = r.data
        return r.data
      }
      return null
    } catch (e: any) {
      error.value = e?.message ?? '获取统计失败'
      console.error('[domain-learning] 拉取统计失败:', e)
      return null
    }
  }

  /** 讲义合集导出（dl:export-lesson-digest；返回 md 载荷，失败 → null） */
  async function exportLessonDigestOf(id: string): Promise<DlLessonDigest | null> {
    const a = api()
    if (!a) return null
    try {
      const r = await a.exportLessonDigest(id)
      return r?.success && r.data ? r.data : null
    } catch (e: any) {
      error.value = e?.message ?? '导出讲义失败'
      console.error('[domain-learning] 导出讲义失败:', e)
      return null
    }
  }

  /**
   * 单篇讲义导出（2026-09-15：知识点正文 md / PDF / 长图）。
   * IPC 不可用或失败时返回 null；错误信息写入 error ref。
   *
   * IPC 出站守卫（2026-09-15 用户报错「An object could not be cloned.」）：
   * UI 事件对象（如 el-dropdown command 事件带的组件实例）、Vue 代理都过不了
   * `ipcRenderer.invoke` 的结构化克隆，故出站载荷只允许原始类型：
   * 格式走白名单、cardId 只认非空字符串（规则单一来源 shared/utils/domain-learning-lesson-export）。
   */
  async function exportLessonOf(input: {
    spaceId: string
    conceptId: string
    format: DlLessonExportFormat
    cardId?: string | null
  }): Promise<DlLessonExportResult | null> {
    const a = api()
    if (!a) return null
    error.value = null
    const format = parseLessonExportFormat(input.format)
    if (!format) {
      error.value = '不支持的导出格式（请选择 Markdown / PDF / 长图）'
      console.error('[domain-learning] 导出格式非法，已拒绝出站:', input.format)
      return null
    }
    const conceptId = typeof input.conceptId === 'string' ? input.conceptId.trim() : ''
    if (!conceptId) {
      error.value = '缺少知识点标识，无法导出'
      return null
    }
    const spaceId = typeof input.spaceId === 'string' ? input.spaceId.trim() : ''
    if (!spaceId) {
      error.value = '缺少学习空间标识，无法导出'
      return null
    }
    try {
      const r = await a.exportLesson({ id: spaceId, conceptId, format, cardId: normalizeLessonCardId(input.cardId) })
      return r?.success && r.data ? r.data : null
    } catch (e: any) {
      error.value = e?.message ?? '导出讲义失败'
      console.error('[domain-learning] 导出讲义失败:', e)
      return null
    }
  }

  /** 讲义版本列表（2026-09-15：历史抽屉数据源） */
  async function listCardVersionsOf(spaceId: string, conceptId: string): Promise<DlCardVersionItem[] | null> {
    const a = api()
    if (!a) return null
    try {
      const r = await a.listCardVersions({ id: spaceId, conceptId })
      return r?.success && r.data ? r.data : null
    } catch (e: any) {
      error.value = e?.message ?? '拉取版本列表失败'
      console.error('[domain-learning] 拉取版本列表失败:', e)
      return null
    }
  }

  /** 取单版讲义预览（只读） */
  async function getCardVersionOf(spaceId: string, cardId: string): Promise<DlCardView | null> {
    const a = api()
    if (!a) return null
    try {
      const r = await a.getCardVersion({ id: spaceId, cardId })
      return r?.success && r.data ? (r.data as DlCardView) : null
    } catch (e: any) {
      error.value = e?.message ?? '拉取版本详情失败'
      console.error('[domain-learning] 拉取版本详情失败:', e)
      return null
    }
  }

  /** 恢复到草稿（新建最新版，旧版留档；成功后调用方应刷新视图） */
  async function restoreCardOf(input: { spaceId: string; conceptId: string; cardId: string }): Promise<DlCardRestoreResult | null> {
    const a = api()
    if (!a) return null
    try {
      const r = await a.restoreCard({ id: input.spaceId, conceptId: input.conceptId, cardId: input.cardId })
      return r?.success && r.data ? r.data : null
    } catch (e: any) {
      error.value = e?.message ?? '恢复版本失败'
      console.error('[domain-learning] 恢复版本失败:', e)
      return null
    }
  }

  // ==================== 概念笔记（M4-UX1） ====================

  /** 当前空间笔记（按概念过滤时只含该概念） */
  const notes = ref<DlNote[]>([])
  /** 空间级全部笔记（跨概念总览，M7-B） */
  const notesAll = ref<DlNote[]>([])

  /** 拉取笔记并写回 notes（conceptId 传概念则只取该概念） */
  async function fetchNotesOf(id: string, conceptId?: string | null): Promise<DlNote[]> {
    const a = api()
    if (!a) return []
    try {
      const r = await a.listNotes({ id, conceptId: conceptId ?? null })
      notes.value = r?.success && r.data ? r.data.notes : []
      return notes.value
    } catch (e: any) {
      error.value = e?.message ?? '获取笔记失败'
      return []
    }
  }

  /** 拉取空间级全部笔记并写回 notesAll（dl:list-notes conceptId=null）；
   *  quiet=true 用于后台预热（失败不污染 error 提示） */
  async function fetchNotesAll(id: string, quiet?: boolean): Promise<DlNote[]> {
    const a = api()
    if (!a) return []
    try {
      const r = await a.listNotes({ id, conceptId: null })
      notesAll.value = r?.success && r.data ? r.data.notes : []
      return notesAll.value
    } catch (e: any) {
      if (!quiet) error.value = e?.message ?? '获取全部笔记失败'
      return []
    }
  }

  /** 新建/收藏笔记（source=selection 选区笔记；qna 收藏回答，同问题幂等） */
  async function saveNote(p: {
    id: string
    conceptId?: string | null
    source: 'selection' | 'qna'
    anchorText?: string | null
    anchorStart?: number | null
    anchorEnd?: number | null
    questionId?: string | null
    contentMd: string
  }): Promise<DlNote | null> {
    const a = api()
    if (!a) return null
    try {
      const r = await a.createNote(p)
      return r?.success && r.data ? r.data.note : null
    } catch (e: any) {
      error.value = e?.message ?? '保存笔记失败'
      console.error('[domain-learning] 保存笔记失败:', e)
      return null
    }
  }

  /** 删除笔记（qna 收藏取消也走这里） */
  async function removeNoteOf(id: string, noteId: string): Promise<boolean> {
    const a = api()
    if (!a) return false
    try {
      const r = await a.deleteNote({ id, noteId })
      if (r?.success && r.data?.ok) {
        notes.value = notes.value.filter((n) => n.id !== noteId)
        notesAll.value = notesAll.value.filter((n) => n.id !== noteId)
        return true
      }
      return false
    } catch (e: any) {
      error.value = e?.message ?? '删除笔记失败'
      return false
    }
  }

  /** 读空间复习配置（dl:get-space-review） */
  async function reviewSettingsOf(id: string): Promise<DlReviewSettings | null> {
    const a = api()
    if (!a) return null
    try {
      const r = await a.getSpaceReview(id)
      return r?.success && r.data ? r.data : null
    } catch {
      return null
    }
  }

  /** 保存空间复习配置并刷新到期队列（dl:set-space-review + dl:review-due） */
  async function saveReviewSettingsOf(id: string, review: DlReviewSettings): Promise<DlReviewSettings | null> {
    const a = api()
    if (!a) return null
    try {
      const r = await a.setSpaceReview({ id, review })
      const saved = r?.success && r.data ? r.data : null
      if (saved) await fetchReviewDue(id)
      return saved
    } catch (e: any) {
      error.value = e?.message ?? '保存间隔复习失败'
      console.error('[domain-learning] 保存间隔复习失败:', e)
      return null
    }
  }

  /** 刷新到期复习队列（写 reviewDue，失败 → null） */
  async function fetchReviewDue(id: string): Promise<{ settings: DlReviewSettings; items: DlReviewDueItem[] } | null> {
    const a = api()
    if (!a) return null
    try {
      const r = await a.reviewDue(id)
      if (r?.success && r.data) {
        reviewDue.value = r.data
        return r.data
      }
      return null
    } catch (e: any) {
      error.value = e?.message ?? '获取到期复习失败'
      console.error('[domain-learning] 拉取到期复习失败:', e)
      return null
    }
  }

  /** 标为需复习（dl:ack-need-review） */
  async function needReviewOf(id: string, conceptId: string): Promise<boolean> {
    const a = api()
    if (!a) return false
    try {
      const r = await a.ackNeedReview({ id, conceptId })
      if (r?.success) {
        await fetchSpaceView(id)
        await fetchReviewDue(id)
        return true
      }
      error.value = r?.error ?? '标记需复习失败'
      return false
    } catch (e: any) {
      error.value = e?.message ?? '标记需复习失败'
      return false
    }
  }

  /** 复习完成（dl:review-done；刷新视图与到期队列） */
  async function reviewDoneOf(id: string, conceptId: string): Promise<boolean> {
    const a = api()
    if (!a) return false
    try {
      const r = await a.reviewDone({ id, conceptId })
      if (r?.success) {
        await fetchSpaceView(id)
        await fetchReviewDue(id)
        return true
      }
      error.value = r?.error ?? '完成复习失败'
      return false
    } catch (e: any) {
      error.value = e?.message ?? '完成复习失败'
      return false
    }
  }

  /** 确认发布讲义（draft→published；2026-09-09 复盘补发布闭环，成功后刷新视图/统计） */
  async function publishCard(id: string, cardId: string): Promise<boolean> {
    const a = api()
    if (!a) return false
    try {
      const r = await a.publishCard({ id, cardId })
      if (r?.success) {
        await fetchSpaceView(id)
        return true
      }
      error.value = r?.error ?? '发布讲义失败'
      return false
    } catch (e: any) {
      error.value = e?.message ?? '发布讲义失败'
      return false
    }
  }

  // ==================== 方案确认流程（2026-09-13 用户需求） ====================

  /** 当前空间的方案总览（诉求理解 + 知识体系；确认弹窗数据源） */
  const plan = ref<DlPlanView | null>(null)
  /** 是否正在读写方案 */
  const planBusy = ref(false)

  /** 拉方案总览（弹窗打开/每轮研究结束后调用）；带 conceptId 时一并取回该概念的讲义方案 */
  async function fetchPlan(id: string, conceptId?: string | null): Promise<DlPlanView | null> {
    const a = api()
    if (!a) return null
    try {
      const r = await a.getPlan(id, conceptId ?? null)
      if (r?.success && r.data) {
        plan.value = r.data
        return r.data
      }
      error.value = r?.error ?? '读取方案失败'
      return null
    } catch (e: any) {
      error.value = e?.message ?? '读取方案失败'
      console.error('[domain-learning] fetchPlan 失败:', e)
      return null
    }
  }

  /**
   * 确认某一步（诉求理解 / 知识体系 / 讲义方案）。
   * syllabus 可带 **用户编辑后的载荷**（勾选增删 + 调序的结果）；
   * lesson 可带 **用户改过区级版式的载荷**（{ conceptId, essenceType, spec }）——
   * 落库门禁与写作口径都据此更新。
   *
   * 载荷可能来自弹窗里的 reactive 草稿，Vue 代理过不了 `ipcRenderer.invoke` 的结构化克隆
   * （报「An object could not be cloned.」），故出站前统一纯化。
   */
  async function confirmPlan(p: {
    id: string
    step: 'understanding' | 'syllabus' | 'lesson'
    payload?: unknown
    feedback?: string | null
    conceptId?: string | null
  }): Promise<{ ok: boolean; message: string }> {
    const a = api()
    if (!a) return { ok: false, message: '当前环境不支持方案确认' }
    planBusy.value = true
    error.value = null
    try {
      const r = await a.confirmPlan(toPlainData(p))
      if (r?.success) {
        await fetchPlan(p.id, p.conceptId ?? null)
        return { ok: true, message: r.data?.message ?? '已确认' }
      }
      error.value = r?.error ?? '确认失败'
      return { ok: false, message: r?.error ?? '确认失败' }
    } catch (e: any) {
      error.value = e?.message ?? '确认失败'
      console.error('[domain-learning] confirmPlan 失败:', e)
      return { ok: false, message: e?.message ?? '确认失败' }
    } finally {
      planBusy.value = false
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
    mode: 'research' | 'tutor' | 'task'
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
  async function cancelAgent(mode: 'research' | 'tutor' | 'task', spaceId: string, conceptId?: string | null): Promise<void> {
    const a = api()
    if (!a) return
    try {
      await a.agentCancel({ mode, spaceId, conceptId })
    } catch { /* 静默：取消无副作用 */ }
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

  /** 查询调度器运行态（dl:scheduler-state；失败 → null） */
  async function fetchSchedulerState(): Promise<{ mode: 'desktop' | 'web'; running: boolean; runningCount: number } | null> {
    const a = api()
    if (!a) return null
    try {
      const r = await a.schedulerState()
      return r?.success && r.data ? r.data : null
    } catch {
      return null
    }
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
    // 方案确认流程（2026-09-13）
    plan,
    planBusy,
    fetchPlan,
    confirmPlan,
    // Atlas
    fetchAtlasGraph,
    fetchNodeProfile,
    fetchAtlasViews,
    // 空间设置
    saveSpaceProfile,
    paceOf,
    savePaceOf,
    saveKbOf,
    spaceMetaKbOf,
    spaceModelOf,
    saveSpaceModelOf,
    fetchSpacePrereqs,
    saveSpacePrereqsOf,
    createConceptOf,
    confirmRelationOf,
    removeRelationOf,
    // 间隔复习
    reviewDue,
    reviewSettingsOf,
    saveReviewSettingsOf,
    fetchReviewDue,
    needReviewOf,
    reviewDoneOf,
    publishCard,
    // 统计与导出
    spaceStats,
    fetchSpaceStats,
    exportLessonDigestOf,
    exportLessonOf,
    listCardVersionsOf,
    getCardVersionOf,
    restoreCardOf,
    // 概念笔记
    notes,
    fetchNotesOf,
    notesAll,
    fetchNotesAll,
    saveNote,
    removeNoteOf,
    // 掌握度反馈
    ackMastered,
    ackConfused,
    // Agent
    sendAgent,
    cancelAgent,
    subscribeAgentEvent,
    subscribeStream,
    unsubscribeAll,
    // 调度器状态（空间设置用）
    fetchSchedulerState,
  }
})
