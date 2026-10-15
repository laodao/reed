/**
 * 信息搜集 Pinia Store
 * @module stores/info-collection
 * @description 信息搜集包的前端状态中枢（ic: IPC 契约）：
 *  - projects：Home 项目卡片（ic:list-projects）
 *  - current：项目详情聚合（项目 + 任务流水 + 待审/已入选/已驳回源 + 结构化行）
 *  - 动作：createProject（快速/精调）/ runTask + startPolling（轻量轮询）/ confirmBatch /
 *          rejectBatch / setProjectKb / adjudicate / generateReport
 *  错误不再吞掉：loadProjects/loadProject 失败写入 errorProjects/errorDetail，视图展示三态。
 *  IPC 不可用时（Web 注入缺失 / 测试环境）优雅降级：取空列表，不抛错不白屏（dl 同款纪律）。
 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { IcBlueprint } from '@shared/types/info-collection.types'
import type { IcBlueprintCheckResult } from '@shared/utils/info-collection-blueprint'

// ==================== IPC 返回形态镜像（日期经 IPC 为 ISO 字符串） ====================

/** IPC 统一返回 { success, data?, error? } */
interface IpcResp<T> {
  success: boolean
  data?: T
  error?: string
}

export interface IcProjectDto {
  id: string
  name: string
  goal: string
  blueprint: IcBlueprint | null
  blueprintVersion: number
  kbId: string | null
  status: 'active' | 'archived'
  createdAt: string | null
  updatedAt: string | null
}

export interface IcTaskDto {
  id: string
  projectId: string
  blueprintVersion: number
  status: 'pending' | 'running' | 'reviewing' | 'done' | 'failed' | 'cancelled'
  stats: IcTaskStats | null
  createdAt: string | null
  finishedAt: string | null
}

/** 任务统计（后端 IcTaskStats 镜像；质量报告数据源） */
export interface IcTaskStats {
  searches: number
  /** VLM 图片描述次数（多模态 M2；旧任务数据可能缺失） */
  imageDescriptions?: number
  toolCalls: number
  budgetMax: number
  sourcesNew: number
  sourcesFailed: number
  rowsDraft: number
  rowsRejectedQuote: number
  rowsMerged: number
  rowsSchemaRejected: number
  negativeResults: Array<{ irId: string; question: string; note: string }>
  irCoverage: Record<string, boolean>
  coverage: number
}

export interface IcSourceDto {
  id: string
  projectId: string
  taskId: string
  url: string
  urlNormalized: string
  tier: number | null
  tierRationale: string | null
  publishedAt: string | null
  collectedAt: string | null
  fetchStatus: 'ok' | 'partial' | 'failed' | 'blocked'
  reviewStatus: 'staged' | 'confirmed' | 'rejected' | 'merged'
  kbDocumentId: string | null
  /** 统一资产登记外链（带原件的资料非空；webpage 为 null） */
  assetId: string | null
  /** 资产概要（handler 从 assets 表补；服务未装配时 null） */
  asset: { name: string; kind: string; mimeType: string | null; sizeBytes: number | null } | null
  irHits: string[]
}

export interface IcRowDto {
  id: string
  projectId: string
  taskId: string
  sourceId: string | null
  schemaId: string
  requirementId: string | null
  row: Record<string, unknown> | null
  measure: { value: number | null; unit: string | null; period: string | null; metric: string | null; dims: Record<string, unknown> | null }
  quote: string | null
  confidence: 'high' | 'low'
  status: 'draft' | 'confirmed' | 'superseded' | 'stale'
  needsReview: boolean
}

/** 整理报告结果（后端 IcReportResult 镜像；ic:generate-report） */
export interface IcReportResultDto {
  markdown: string
  /** 反查校验剔除的陈述数（宁可空缺不可无据） */
  strippedStatements: number
  /** 第二模型审的问题清单（随稿"审核备注"交付） */
  reviewIssues: string[]
  imported: boolean
  documentId: string | null
}

/** 裁决结果（转载簇/冲突归因/孤证标记；ic:adjudicate） */
export interface IcAdjudicateResultDto {
  clusters: number
  conflictsFound: number
  conflictsAttributed: number
  singleSourceRows: number
}

/** infoCollection 命名空间 API 形状（window.electronAPI 实为 any，此处守卫/类型提示） */
interface InfoCollectionApi {
  createProject: (p: { name: string; goal: string; mode?: 'quick' | 'review' }) => Promise<IpcResp<{ project: IcProjectDto; check: IcBlueprintCheckResult }>>
  draftBlueprint: (p: { goal: string }) => Promise<IpcResp<{ blueprint: IcBlueprint; check: IcBlueprintCheckResult }>>
  confirmBlueprint: (p: { projectId: string }) => Promise<IpcResp<IcProjectDto>>
  listProjects: (p?: { status?: 'active' | 'archived' }) => Promise<IpcResp<IcProjectDto[]>>
  getProject: (p: { id: string }) => Promise<IpcResp<IcProjectDto | null>>
  setProjectKb: (p: { id: string; kbId: string | null }) => Promise<IpcResp<void>>
  runTask: (p: { projectId: string }) => Promise<IpcResp<{ taskId: string }>>
  listTasks: (p: { projectId: string }) => Promise<IpcResp<IcTaskDto[]>>
  listSources: (p: { projectId: string; reviewStatus?: IcSourceDto['reviewStatus'] }) => Promise<IpcResp<IcSourceDto[]>>
  listRows: (p: { projectId: string; status?: IcRowDto['status'] }) => Promise<IpcResp<IcRowDto[]>>
  confirmBatch: (p: { projectId: string; sourceIds: string[] }) => Promise<IpcResp<{ confirmed: string[]; skipped: Array<{ id: string; reason: string }> }>>
  rejectBatch: (p: { projectId: string; sourceIds: string[]; reason?: string }) => Promise<IpcResp<number>>
  adjudicate: (p: { projectId: string }) => Promise<IpcResp<IcAdjudicateResultDto>>
  generateReport: (p: { projectId: string }) => Promise<IpcResp<IcReportResultDto>>
}

/** 守卫取 API：Electron/Web 均注入 window.electronAPI.infoCollection；缺失返回 undefined（降级） */
function icApi(): InfoCollectionApi | undefined {
  const w = window as never as { electronAPI?: { infoCollection?: InfoCollectionApi } }
  return w.electronAPI?.infoCollection
}

/** IPC 结构化克隆会把 Date 原样传回——统一规范成 ISO 字符串（运行时与 DTO 类型对齐） */
function isoDate(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString()
  if (typeof v === 'string') return v
  return String(v)
}

export const useInfoCollectionStore = defineStore('info-collection', () => {
  // ---- 列表态 ----
  const projects = ref<IcProjectDto[]>([])
  const loadingProjects = ref(false)
  const errorProjects = ref('')

  // ---- 详情态 ----
  const current = ref<IcProjectDto | null>(null)
  const tasks = ref<IcTaskDto[]>([])
  const stagedSources = ref<IcSourceDto[]>([])
  const confirmedSources = ref<IcSourceDto[]>([])
  const rejectedSources = ref<IcSourceDto[]>([])
  const rows = ref<IcRowDto[]>([])
  const loadingDetail = ref(false)
  const errorDetail = ref('')
  const running = ref(false)

  // ---- 报告 / 裁决 ----
  const lastReport = ref<IcReportResultDto | null>(null)
  const generatingReport = ref(false)

  // ---- 派生（统一口径，视图不再各算各的） ----
  /** 覆盖口径：最新一个带 stats 的任务（旧版取"第一个"，多任务时口径错） */
  const latestTask = computed(() => [...tasks.value].reverse().find(t => t.stats) ?? null)
  const coverage = computed<Record<string, boolean>>(() => latestTask.value?.stats?.irCoverage ?? {})
  const coverageRatio = computed<number | null>(() => latestTask.value?.stats?.coverage ?? null)
  const negativeResults = computed(() => latestTask.value?.stats?.negativeResults ?? [])
  const hasRunning = computed(() => tasks.value.some(t => t.status === 'running' || t.status === 'pending'))
  const pendingRows = computed(() => rows.value.filter(r => r.status === 'draft').length)

  function unwrap<T>(resp: IpcResp<T> | undefined, fallback: T): T {
    return resp?.success && resp.data !== undefined ? resp.data : fallback
  }

  async function loadProjects(): Promise<void> {
    loadingProjects.value = true
    errorProjects.value = ''
    try {
      const resp = await icApi()?.listProjects({ status: 'active' })
      if (!resp?.success) {
        errorProjects.value = resp?.error ?? 'IPC 不可用'
        return
      }
      projects.value = (resp.data ?? []).map(p => ({ ...p, createdAt: isoDate(p.createdAt), updatedAt: isoDate(p.updatedAt) }))
    } finally {
      loadingProjects.value = false
    }
  }

  /** 快速搜集：创建项目 + AI 起草蓝图 + 自检通过自动确认；返回自检结果供向导展示 */
  async function createProject(input: { name: string; goal: string; mode: 'quick' | 'review' }): Promise<{ project: IcProjectDto | null; check: IcBlueprintCheckResult | null; error?: string }> {
    const resp = await icApi()?.createProject(input)
    if (!resp?.success || !resp.data) return { project: null, check: null, error: resp?.error ?? '创建失败（IPC 不可用）' }
    await loadProjects()
    return { project: resp.data.project, check: resp.data.check }
  }

  async function confirmBlueprint(projectId: string): Promise<boolean> {
    const resp = await icApi()?.confirmBlueprint({ projectId })
    if (resp?.success && resp.data) {
      current.value = { ...resp.data, createdAt: isoDate(resp.data.createdAt), updatedAt: isoDate(resp.data.updatedAt) }
      return true
    }
    return false
  }

  async function loadProject(id: string): Promise<void> {
    loadingDetail.value = true
    errorDetail.value = ''
    try {
      const api = icApi()
      const resp = await api?.getProject({ id })
      if (!resp?.success) {
        errorDetail.value = resp?.error ?? 'IPC 不可用'
        return
      }
      const project = resp.data ?? null
      current.value = project ? { ...project, createdAt: isoDate(project.createdAt), updatedAt: isoDate(project.updatedAt) } : null
      const taskList = await unwrap(await api?.listTasks({ projectId: id }), [])
      tasks.value = taskList.map(t => ({ ...t, createdAt: isoDate(t.createdAt), finishedAt: isoDate(t.finishedAt) }))
      const mapSource = (s: IcSourceDto): IcSourceDto => ({
        ...s,
        publishedAt: isoDate(s.publishedAt),
        collectedAt: isoDate(s.collectedAt),
      })
      stagedSources.value = (await unwrap(await api?.listSources({ projectId: id, reviewStatus: 'staged' }), [])).map(mapSource)
      confirmedSources.value = (await unwrap(await api?.listSources({ projectId: id, reviewStatus: 'confirmed' }), [])).map(mapSource)
      rejectedSources.value = (await unwrap(await api?.listSources({ projectId: id, reviewStatus: 'rejected' }), [])).map(mapSource)
      rows.value = await unwrap(await api?.listRows({ projectId: id }), [])
    } finally {
      loadingDetail.value = false
    }
  }

  /** 发起搜集：IPC 成功即返回，进度交给 startPolling（旧版此处阻塞 await 到终态，按钮卡死几小时） */
  async function runTask(projectId: string): Promise<boolean> {
    const resp = await icApi()?.runTask({ projectId })
    if (!resp?.success) return false
    running.value = true
    startPolling(projectId)
    return true
  }

  // ---- 轮询：唯一实现（旧版 store 阻塞轮询 + 视图 setInterval 双份并存） ----
  let pollToken = 0
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let onSettledCb: (() => void) | null = null

  /**
   * 轻量轮询：每 tick 只拉 listTasks（1 次 IPC），终态才做一次全量 loadProject。
   * token 防串扰：切换项目/重复调用后，旧循环的写盘全部作废。
   */
  function startPolling(projectId: string, onSettled?: () => void): void {
    stopPolling()
    const token = ++pollToken
    onSettledCb = onSettled ?? null
    const tick = async (): Promise<void> => {
      if (token !== pollToken) return
      const list = await unwrap(await icApi()?.listTasks({ projectId }), [])
      if (token !== pollToken) return
      tasks.value = list.map(t => ({ ...t, createdAt: isoDate(t.createdAt), finishedAt: isoDate(t.finishedAt) }))
      if (!list.some(t => t.status === 'running' || t.status === 'pending')) {
        stopPolling()
        running.value = false
        await loadProject(projectId)
        onSettledCb?.()
      }
    }
    pollTimer = setInterval(() => void tick(), 3000)
    void tick()
  }

  function stopPolling(): void {
    pollToken++
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  async function confirmBatch(projectId: string, sourceIds: string[]): Promise<{ confirmed: string[]; skipped: Array<{ id: string; reason: string }> }> {
    const resp = await icApi()?.confirmBatch({ projectId, sourceIds })
    const empty = { confirmed: [] as string[], skipped: [] as Array<{ id: string; reason: string }> }
    const result = await unwrap(resp, empty)
    await loadProject(projectId)
    return result
  }

  async function rejectBatch(projectId: string, sourceIds: string[], reason?: string): Promise<number> {
    const n = await unwrap(await icApi()?.rejectBatch({ projectId, sourceIds, reason }), 0)
    await loadProject(projectId)
    return n
  }

  /** 绑定知识库；绑定时自动补录"已确认未入库"的历史来源，返回补录条数 */
  async function setProjectKb(projectId: string, kbId: string | null): Promise<{ ok: boolean; backfilled: number }> {
    const resp = await icApi()?.setProjectKb({ id: projectId, kbId })
    if (resp?.success && current.value?.id === projectId) current.value.kbId = kbId
    return { ok: resp?.success === true, backfilled: (resp?.data as { backfilled?: number } | undefined)?.backfilled ?? 0 }
  }

  /** 跨源裁决：转载簇/冲突归因/孤证标记；完成后全量刷新（行状态/supersede 链会变） */
  async function adjudicate(projectId: string): Promise<IcAdjudicateResultDto | null> {
    const resp = await icApi()?.adjudicate({ projectId })
    if (!resp?.success || !resp.data) return null
    await loadProject(projectId)
    return resp.data
  }

  /** 生成整理报告（要点卡反查/数据表/时间线/引用清单/质量报告 + 第二模型审；入项目 KB） */
  async function generateReport(projectId: string): Promise<{ result: IcReportResultDto | null; error?: string }> {
    generatingReport.value = true
    try {
      const resp = await icApi()?.generateReport({ projectId })
      if (!resp?.success || !resp.data) return { result: null, error: resp?.error ?? '生成失败（IPC 不可用）' }
      lastReport.value = resp.data
      return { result: resp.data }
    } finally {
      generatingReport.value = false
    }
  }

  return {
    projects,
    loadingProjects,
    errorProjects,
    current,
    tasks,
    stagedSources,
    confirmedSources,
    rejectedSources,
    rows,
    loadingDetail,
    errorDetail,
    running,
    lastReport,
    generatingReport,
    latestTask,
    coverage,
    coverageRatio,
    negativeResults,
    hasRunning,
    pendingRows,
    loadProjects,
    createProject,
    confirmBlueprint,
    loadProject,
    runTask,
    startPolling,
    stopPolling,
    confirmBatch,
    rejectBatch,
    setProjectKb,
    adjudicate,
    generateReport,
  }
})
