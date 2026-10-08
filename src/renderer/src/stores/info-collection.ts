/**
 * 信息搜集 Pinia Store
 * @module stores/info-collection
 * @description 信息搜集包的前端状态中枢（ic: IPC 契约）：
 *  - projects：Home 项目卡片（ic:list-projects）
 *  - current：项目详情聚合（项目 + 任务流水 + 待审源 + 结构化行）
 *  - 动作：createProject（快速/精调）/ runTask / confirmBatch / rejectBatch / setProjectKb
 *  IPC 不可用时（Web 注入缺失 / 测试环境）优雅降级：取空列表，不抛错不白屏（dl 同款纪律）。
 */
import { ref } from 'vue'
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

  // ---- 详情态 ----
  const current = ref<IcProjectDto | null>(null)
  const tasks = ref<IcTaskDto[]>([])
  const stagedSources = ref<IcSourceDto[]>([])
  const confirmedSources = ref<IcSourceDto[]>([])
  const rows = ref<IcRowDto[]>([])
  const loadingDetail = ref(false)
  const running = ref(false)

  async function unwrap<T>(resp: IpcResp<T> | undefined, fallback: T): Promise<T> {
    return resp?.success && resp.data !== undefined ? resp.data : fallback
  }

  async function loadProjects(): Promise<void> {
    loadingProjects.value = true
    try {
      const list = await unwrap(await icApi()?.listProjects({ status: 'active' }), [])
      projects.value = list.map(p => ({ ...p, createdAt: isoDate(p.createdAt), updatedAt: isoDate(p.updatedAt) }))
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
      current.value = resp.data
      return true
    }
    return false
  }

  async function loadProject(id: string): Promise<void> {
    loadingDetail.value = true
    try {
      const api = icApi()
      const project = await unwrap(await api?.getProject({ id }), null)
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
      rows.value = await unwrap(await api?.listRows({ projectId: id }), [])
    } finally {
      loadingDetail.value = false
    }
  }

  /** 发起搜集并轮询到终态（running 态由视图显示进度） */
  async function runTask(projectId: string): Promise<boolean> {
    const resp = await icApi()?.runTask({ projectId })
    if (!resp?.success) return false
    running.value = true
    await pollUntilSettled(projectId)
    return true
  }

  /** 轮询任务流水直至无 running/pending（3s 间隔；上限 2h 对齐后端预算） */
  async function pollUntilSettled(projectId: string): Promise<void> {
    const deadline = Date.now() + 2 * 60 * 60 * 1000
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 3000))
      tasks.value = await unwrap(await icApi()?.listTasks({ projectId }), [])
      const busy = tasks.value.some(t => t.status === 'running' || t.status === 'pending')
      if (!busy) break
    }
    running.value = false
    await loadProject(projectId)
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

  async function setProjectKb(projectId: string, kbId: string | null): Promise<boolean> {
    const resp = await icApi()?.setProjectKb({ id: projectId, kbId })
    if (resp?.success && current.value?.id === projectId) current.value.kbId = kbId
    return resp?.success === true
  }

  return {
    projects,
    loadingProjects,
    current,
    tasks,
    stagedSources,
    confirmedSources,
    rows,
    loadingDetail,
    running,
    loadProjects,
    createProject,
    confirmBlueprint,
    loadProject,
    runTask,
    confirmBatch,
    rejectBatch,
    setProjectKb,
  }
})
