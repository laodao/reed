/**
 * 领域学习 IPC 处理器（双端共用：ipcBridge 同时注册 Electron ipcMain 与 Web 路由表）
 * @module core/packs/domain-learning/handlers/domain-learning.handler
 *
 * dl: 前缀全部通道的薄壳——参数透传 + IpcResponse 包装。业务逻辑在
 * services/（project/graph/view/agent 宿主）。服务实例惰性构造
 * （activate 早于 workflow boot，不能在 activate 里拿 db/宿主单例）。
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { IpcResponse } from '@shared/types/ipc.types'
import { DlProjectRepository } from '@core/database/repositories/dl-project.repository'
import { DlConceptRepository } from '@core/database/repositories/dl-concept.repository'
import { DlRelationRepository } from '@core/database/repositories/dl-relation.repository'
import { DlMasteryLogRepository } from '@core/database/repositories/dl-mastery-log.repository'
import { DlCardRepository } from '@core/database/repositories/dl-card.repository'
import { LearningProjectService } from '../services/learning-project.service'
import { LearningGraphService } from '../services/learning-graph.service'
import { LearningViewService } from '../services/learning-view.service'
import { DlAgentHarnessService } from '../services/dl-agent-harness.service'
import { DlPaceSchedulerService, normalizePaceSettings } from '../services/dl-pace-scheduler.service'
import type { DlPaceSettings } from '@shared/types/domain-learning.types'
import type { DlAgentMode } from '../services/dl-agent.types'

/** 统一 { success, data, error } 包装 */
async function wrap<T>(fn: () => Promise<T>): Promise<IpcResponse<T>> {
  try {
    return { success: true, data: await fn() }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** 桌面端（Electron 主进程；非 ELECTRON_RUN_AS_NODE 的测试/工具进程）判定 */
function isDesktopRuntime(): boolean {
  const v = process.versions as Record<string, string | undefined>
  return !!v.electron && process.env.ELECTRON_RUN_AS_NODE !== '1'
}

interface DlServiceBundle {
  projects: LearningProjectService
  graph: LearningGraphService
  view: LearningViewService
  agent: DlAgentHarnessService
  scheduler: DlPaceSchedulerService
}

let bundle: DlServiceBundle | null = null

/** 惰性构造业务服务（首次调用时 db 已就绪） */
function services(): DlServiceBundle {
  if (!bundle) {
    const db = getCoreDatabaseManager()
    if (!db.dataSource) throw new Error('[dl] 数据库未就绪')
    const projects = new DlProjectRepository(db.dataSource)
    const concepts = new DlConceptRepository(db.dataSource)
    const relations = new DlRelationRepository(db.dataSource)
    const masteryLogs = new DlMasteryLogRepository(db.dataSource)
    const cards = new DlCardRepository(db.dataSource)
    const agent = DlAgentHarnessService.getInstance()
    const scheduler = DlPaceSchedulerService.getInstance()
    scheduler.configure({
      db,
      // 自动推进任务 = dl 宿主 research 直跑（动作仍经 dl 服务校验落 dl_* 库）
      runJob: async (job) => {
        const proj = (await db.dlProjects?.getById(job.spaceId)) ?? null
        const dm = (proj?.defaultModel ?? null) as { providerConfigId?: string; modelId?: string } | null
        await agent.sendMessage(
          'research',
          { spaceId: job.spaceId, conceptId: job.conceptId ?? null },
          job.message,
          {
            providerConfigId: dm?.providerConfigId,
            modelId: dm?.modelId,
            focusQuestionId: job.questionId ?? undefined,
          },
        )
      },
    })
    // 仅桌面端自动启停；Web 多租户无进程级定时器语义（IPC 读写配置不受影响）
    if (isDesktopRuntime()) scheduler.start()
    bundle = {
      projects: new LearningProjectService(projects, concepts),
      graph: new LearningGraphService(concepts, relations, masteryLogs),
      view: new LearningViewService(db),
      agent,
      scheduler,
    }
    void cards
  }
  return bundle
}

export function registerDomainLearningHandlers(): void {
  // ---- 空间 CRUD ----
  ipcBridge.handle('dl:list-spaces', () => wrap(() => services().projects.listSpaces()))
  ipcBridge.handle('dl:create-space', (_e, p: { name: string; goal: string; tagline?: string; description?: string; profileId?: string; profile?: Record<string, unknown> | null }) =>
    wrap(async () => {
      const id = await services().projects.createSpace(p)
      return { id }
    }))
  ipcBridge.handle('dl:get-space', (_e, p: { id: string }) => wrap(() => services().projects.getSpace(p.id)))
  ipcBridge.handle('dl:set-space-status', (_e, p: { id: string; status: 'active' | 'paused' | 'archived' }) =>
    wrap(async () => {
      await services().projects.setStatus(p.id, p.status)
      return { ok: true }
    }))

  // ---- 空间画像（M2-E：建空间带 profile 之外，可对已建空间改画像/侧重） ----
  ipcBridge.handle('dl:set-space-profile', (_e, p: { id: string; profileId?: string | null; profile?: Record<string, unknown> | null }) =>
    wrap(async () => {
      const db = getCoreDatabaseManager()
      await db.dlProjects!.patch(p.id, { profileId: p.profileId ?? null, profile: p.profile ?? null })
      return { ok: true }
    }))

  // ---- 空间聚合视图（Home 卡片/Space 三栏/Atlas 图与档案） ----
  ipcBridge.handle('dl:get-space-view', (_e, p: { id: string }) => wrap(() => services().view.buildSpaceView(p.id)))
  ipcBridge.handle('dl:get-atlas-graph', (_e, p: { id: string }) => wrap(() => services().view.buildAtlasGraph(p.id)))
  ipcBridge.handle('dl:get-atlas-views', (_e, p: { id: string }) => wrap(() => services().view.buildAtlasViews(p.id)))
  ipcBridge.handle('dl:get-node-profile', (_e, p: { id: string; nodeId: string }) =>
    wrap(() => services().view.buildNodeProfile(p.id, p.nodeId)))

  // ---- 图谱/掌握度 ----
  ipcBridge.handle('dl:pick-next', (_e, p: { id: string }) => wrap(() => services().graph.pickNextToLearn(p.id)))
  ipcBridge.handle('dl:ack-mastered', (_e, p: { id: string; conceptId: string }) =>
    wrap(async () => {
      await services().graph.ackMastered(p.id, p.conceptId)
      return { ok: true }
    }))
  ipcBridge.handle('dl:ack-confused', (_e, p: { id: string; conceptId: string; sectionKey?: string }) =>
    wrap(() => services().graph.ackConfused(p.id, p.conceptId, { sectionKey: p.sectionKey })))
  ipcBridge.handle('dl:confirm-relation', (_e, p: { id: string; sourceId: string; targetId: string; relationType: string; evidence?: string }) =>
    wrap(async () => {
      await services().graph.confirmRelation(p.id, p.sourceId, p.targetId, p.relationType, p.evidence)
      return { ok: true }
    }))

  // ---- 未解问题队列 ----
  ipcBridge.handle('dl:list-questions', (_e, p: { id: string }) =>
    wrap(async () => {
      const db = getCoreDatabaseManager()
      return db.dlQuestions!.listByProject(p.id)
    }))

  // ---- 研究/追问（agent 宿主；research 与 tutor 两模式） ----
  ipcBridge.handle('dl:agent-send', (_e, p: { mode: DlAgentMode; spaceId: string; conceptId?: string | null; message: string; providerConfigId?: string; modelId?: string; focusQuestionId?: string }) =>
    wrap(() => services().agent.sendMessage(p.mode, { spaceId: p.spaceId, conceptId: p.conceptId ?? null }, p.message, {
      providerConfigId: p.providerConfigId,
      modelId: p.modelId,
      focusQuestionId: p.focusQuestionId,
    })))
  ipcBridge.handle('dl:agent-cancel', (_e, p: { mode: DlAgentMode; spaceId: string; conceptId?: string | null }) => {
    services().agent.cancel(p.mode, { spaceId: p.spaceId, conceptId: p.conceptId ?? null })
    return wrap(async () => ({ ok: true }))
  })
  ipcBridge.handle('dl:agent-busy', (_e, p: { mode: DlAgentMode; spaceId: string; conceptId?: string | null }) =>
    wrap(async () => services().agent.isBusy(p.mode, { spaceId: p.spaceId, conceptId: p.conceptId ?? null })))

  // ---- 周期推进（M2-C；pace 配置读写 + 调度器状态） ----
  ipcBridge.handle('dl:get-space-pace', (_e, p: { id: string }) =>
    wrap(async () => {
      const row = await getCoreDatabaseManager().dlProjects!.getById(p.id)
      if (!row) throw new Error('空间不存在')
      return normalizePaceSettings(row.pace)
    }))
  ipcBridge.handle('dl:set-space-pace', (_e, p: { id: string; pace: DlPaceSettings }) =>
    wrap(async () => {
      const saved = normalizePaceSettings(p.pace)
      await getCoreDatabaseManager().dlProjects!.patch(p.id, { pace: saved })
      return saved
    }))
  ipcBridge.handle('dl:scheduler-state', () =>
    wrap(async () => {
      const s = services()
      return {
        mode: isDesktopRuntime() ? 'desktop' : 'web',
        running: s.scheduler.isRunning(),
        runningCount: s.scheduler.runningCount(),
      }
    }))
}
