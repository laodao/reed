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
import type { DlAgentMode } from '../services/dl-agent.types'

/** 统一 { success, data, error } 包装 */
async function wrap<T>(fn: () => Promise<T>): Promise<IpcResponse<T>> {
  try {
    return { success: true, data: await fn() }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}

interface DlServiceBundle {
  projects: LearningProjectService
  graph: LearningGraphService
  view: LearningViewService
  agent: DlAgentHarnessService
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
    bundle = {
      projects: new LearningProjectService(projects, concepts),
      graph: new LearningGraphService(concepts, relations, masteryLogs),
      view: new LearningViewService(db),
      agent: DlAgentHarnessService.getInstance(),
    }
    void cards
  }
  return bundle
}

export function registerDomainLearningHandlers(): void {
  // ---- 空间 CRUD ----
  ipcBridge.handle('dl:list-spaces', () => wrap(() => services().projects.listSpaces()))
  ipcBridge.handle('dl:create-space', (_e, p: { name: string; goal: string; tagline?: string; description?: string; profileId?: string }) =>
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

  // ---- 空间聚合视图（Home 卡片/Space 三栏/Atlas 图与档案） ----
  ipcBridge.handle('dl:get-space-view', (_e, p: { id: string }) => wrap(() => services().view.buildSpaceView(p.id)))
  ipcBridge.handle('dl:get-atlas-graph', (_e, p: { id: string }) => wrap(() => services().view.buildAtlasGraph(p.id)))
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
}
