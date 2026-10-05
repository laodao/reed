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
import { createLogger } from '@core/utils/logger'
import type { IpcResponse } from '@shared/types/ipc.types'
import { DlProjectRepository } from '@core/database/repositories/dl-project.repository'
import { DlConceptRepository } from '@core/database/repositories/dl-concept.repository'
import { DlRelationRepository } from '@core/database/repositories/dl-relation.repository'
import { DlMasteryLogRepository } from '@core/database/repositories/dl-mastery-log.repository'
import { toDlNote } from '@core/database/repositories/dl-note.repository'
import { toDlQuestionView } from '@core/database/repositories/dl-question.repository'
import { LearningProjectService } from '../services/learning-project.service'
import { LearningGraphService } from '../services/learning-graph.service'
import { LearningViewService } from '../services/learning-view.service'
import { DlAgentHarnessService } from '../services/dl-agent-harness.service'
import { DlPaceSchedulerService } from '../services/dl-pace-scheduler.service'
import { confirmDlPlan, getDlPlanView } from '../services/dl-plan.service'
import { DlLessonExportService } from '../services/dl-lesson-export.service'
import { DlLessonVersionService } from '../services/dl-lesson-version.service'
import { dlPublishNotice } from '../services/dl-notice'
import type { DlPaceSettings, DlReviewSettings, DlSpacePrereq, DlCreateConceptInput, DlLessonExportFormat } from '@shared/types/domain-learning.types'
import { normalizeLessonCardId, parseLessonExportFormat } from '@shared/utils/domain-learning-lesson-export'
import type { DlAgentMode } from '../services/dl-agent.types'

const logger = createLogger('DlHandlers')

/** 复习到期通知节流：每空间最近一次发布时间（避免每次拉取都通知） */
const lastReviewNoticeAt = new Map<string, number>()

/**
 * 把内部错误翻译成用户能懂的话（2026-09-09 复盘：不再把数据库原话直吐界面）；
 * 业务错误（本就是中文提示）原样保留，细节仍写日志。
 */
function friendlyError(msg: string): string {
  if (/UNIQUE constraint failed|duplicate key value/i.test(msg)) return '这条数据已存在，已跳过重复写入'
  if (/FOREIGN KEY constraint failed/i.test(msg)) return '关联的数据不存在，操作未完成'
  if (/SQLITE_|better-sqlite3|TypeORM|QueryFailedError/i.test(msg)) return '内部数据处理出错，请重试（详情见日志）'
  if (/ECONNREFUSED|ETIMEDOUT|fetch failed|socket hang up/i.test(msg)) return '外部服务连接失败，请检查网络或资料源后重试'
  return msg
}

/** 统一 { success, data, error } 包装 */
async function wrap<T>(fn: () => Promise<T>): Promise<IpcResponse<T>> {
  try {
    return { success: true, data: await fn() }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const stack = e instanceof Error && e.stack ? `\n${e.stack}` : ''
    logger.warn(`[dl] handler 失败：${msg}${stack}`)
    return { success: false, error: friendlyError(msg) }
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
  /** 单篇讲义导出（md/PDF/长图；平台文档工具层消费方） */
  exportLesson: DlLessonExportService
  /** 讲义版本管理（列表/预览/恢复；2026-09-15 用户需求） */
  version: DlLessonVersionService
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
      exportLesson: new DlLessonExportService(db),
      version: new DlLessonVersionService(db),
    }
  }
  return bundle
}

export function registerDomainLearningHandlers(): void {
  // ---- 空间 CRUD ----
  ipcBridge.handle('dl:list-spaces', () => wrap(() => services().projects.listSpaces()))
  ipcBridge.handle('dl:create-space', (_e, p: { name: string; goal: string; tagline?: string; description?: string; profileId?: string; profile?: Record<string, unknown> | null; kbId?: string | null }) =>
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
      await services().projects.setProfile(p.id, p.profileId, p.profile)
      return { ok: true }
    }))
  // ---- 项目知识库绑定（M4-B：建绑/改绑，供研究/核验 wf_kb_retrieve） ----
  ipcBridge.handle('dl:set-space-kb', (_e, p: { id: string; kbId?: string | null }) =>
    wrap(async () => {
      const kbId = await services().projects.setKb(p.id, p.kbId)
      return { kbId }
    }))

  // ---- 空间默认模型（2026-09-14：知识生成默认模型，双 null=跟随全局默认） ----
  ipcBridge.handle('dl:get-space-model', (_e, p: { id: string }) =>
    wrap(() => services().projects.getModelSettings(p.id)))
  ipcBridge.handle('dl:set-space-model', (_e, p: { id: string; model: { providerConfigId?: string | null; modelId?: string | null } }) =>
    wrap(async () => {
      const saved = await services().projects.setModelSettings(p.id, p.model)
      return { model: saved }
    }))

  // ---- 主题学习前置要求（2026-09-12 用户需求：整个领域的学习门槛，含领域外需自备能力） ----
  ipcBridge.handle('dl:get-space-prereqs', (_e, p: { id: string }) =>
    wrap(() => services().projects.getPrerequisites(p.id)))
  ipcBridge.handle('dl:set-space-prereqs', (_e, p: { id: string; prerequisites: DlSpacePrereq[] }) =>
    wrap(async () => {
      const saved = await services().projects.setPrerequisites(p.id, p.prerequisites)
      return { prerequisites: saved }
    }))

  // ---- 空间聚合视图（Home 卡片/Space 三栏/Atlas 图与档案） ----
  ipcBridge.handle('dl:get-space-view', (_e, p: { id: string }) => wrap(() => services().view.buildSpaceView(p.id)))
  ipcBridge.handle('dl:get-atlas-graph', (_e, p: { id: string }) => wrap(() => services().view.buildAtlasGraph(p.id)))
  ipcBridge.handle('dl:get-atlas-views', (_e, p: { id: string }) => wrap(() => services().view.buildAtlasViews(p.id)))
  ipcBridge.handle('dl:get-node-profile', (_e, p: { id: string; nodeId: string }) =>
    wrap(() => services().view.buildNodeProfile(p.id, p.nodeId)))
  ipcBridge.handle('dl:get-space-stats', (_e, p: { id: string }) => wrap(() => services().view.buildSpaceStats(p.id)))
  ipcBridge.handle('dl:export-lesson-digest', (_e, p: { id: string }) => wrap(() => services().view.buildLessonDigest(p.id)))
  // 单篇讲义导出（2026-09-15 用户需求：知识点正文导出 md/PDF/长图；cardId 缺省=当前版）
  ipcBridge.handle('dl:export-lesson', (_e, p: { id: string; conceptId: string; format: DlLessonExportFormat; cardId?: string | null }) =>
    wrap(async () => {
      // 入站守卫（与前端同一份规则）：格式白名单 + cardId 只认非空字符串。
      // 前端事件对象/代理若漏进来，这里直接拒绝，不会一路带进渲染管线。
      const format = parseLessonExportFormat(p?.format)
      if (!format) throw new Error('不支持的导出格式（请选择 Markdown / PDF / 长图）')
      const cardId = normalizeLessonCardId(p?.cardId)
      await services().projects.ensureOwned(p.id)
      const r = await services().exportLesson.export({
        spaceId: p.id,
        conceptId: p.conceptId,
        format,
        cardId,
      })
      // IPC 结构化克隆防御：只传原始类型，显式构造纯净对象（不展开、不继承）
      return {
        format: r.format,
        filename: r.filename,
        mime: r.mime,
        conceptId: r.conceptId,
        conceptName: r.conceptName,
        spaceName: r.spaceName,
        version: r.version,
        markdown: r.markdown ?? null,
        contentBase64: r.contentBase64 ?? null,
        html: r.html ?? null,
      }
    }))

  // ---- 讲义版本管理（2026-09-15：历史列表/预览/恢复到草稿） ----
  ipcBridge.handle('dl:list-card-versions', (_e, p: { id: string; conceptId: string }) =>
    wrap(async () => {
      await services().projects.ensureOwned(p.id)
      const list = await services().version.listVersions(p.id, p.conceptId)
      // 显式构造纯净数组（避免仓储返回值携带不可枚举属性）
      return list.map((v) => ({
        cardId: v.cardId,
        version: v.version,
        status: v.status,
        essenceType: v.essenceType,
        sectionsCount: v.sectionsCount,
        worksCount: v.worksCount,
        evidenceCount: v.evidenceCount,
        verifyStatus: v.verifyStatus,
        revisionNote: v.revisionNote,
        changeSource: v.changeSource,
        createdAt: v.createdAt,
        updatedAt: v.updatedAt,
        isCurrent: v.isCurrent,
      }))
    }))
  ipcBridge.handle('dl:get-card-version', (_e, p: { id: string; cardId: string }) =>
    wrap(async () => {
      await services().projects.ensureOwned(p.id)
      const c = await services().version.getVersion(p.id, p.cardId)
      if (!c) return null
      return {
        id: c.id,
        conceptId: c.conceptId,
        essenceType: c.essenceType,
        sections: c.sections,
        works: c.works,
        contentMd: c.contentMd,
        evidenceSources: c.evidenceSources,
        version: c.version,
        status: c.status,
        verification: c.verification,
        revisionNote: c.revisionNote,
        changeSource: c.changeSource,
        changed: c.changed,
        createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
        updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : c.updatedAt,
      }
    }))
  ipcBridge.handle('dl:restore-card', (_e, p: { id: string; conceptId: string; cardId: string }) =>
    wrap(async () => {
      await services().projects.ensureOwned(p.id)
      const r = await services().version.restore(p.id, p.conceptId, p.cardId)
      return { cardId: r.cardId, version: r.version, restoredFrom: r.restoredFrom }
    }))

  // ---- 图谱/掌握度 ----
  ipcBridge.handle('dl:pick-next', (_e, p: { id: string }) => wrap(() => services().graph.pickNextToLearn(p.id)))
  // 手工新建知识点（2026-09-12：用户补全知识体系；前置直连为已确认边）
  ipcBridge.handle('dl:save-concept', (_e, p: DlCreateConceptInput) =>
    wrap(async () => {
      const { id, ...input } = p
      return services().graph.createConcept(id, input)
    }))
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
  // 删除关系边（2026-09-25：错边/成环边的修复入口；删数据是人审动作，agent 工具面不提供）
  ipcBridge.handle('dl:remove-relation', (_e, p: { id: string; relationId: string }) =>
    wrap(async () => {
      await services().graph.removeRelation(p.id, p.relationId)
      return { ok: true }
    }))

  // ---- 未解问题队列 ----
  ipcBridge.handle('dl:list-questions', (_e, p: { id: string }) =>
    wrap(async () => {
      await services().projects.ensureOwned(p.id)
      // DTO 化（2026-09-09 复盘：不再直吐内部仓储行——剔 userId/Date，对齐 shared DlQuestionView）
      const rows = await getCoreDatabaseManager().dlQuestions!.listByProject(p.id)
      return rows.map((r) => toDlQuestionView(r))
    }))

  // ---- 研究/追问（agent 宿主；research 与 tutor 两模式；写路径先校验空间属主） ----
  ipcBridge.handle('dl:agent-send', (_e, p: { mode: DlAgentMode; spaceId: string; conceptId?: string | null; message: string; providerConfigId?: string; modelId?: string; focusQuestionId?: string }) =>
    wrap(async () => {
      await services().projects.ensureOwned(p.spaceId)
      // 2026-09-14 用户需求：知识生成（research/task）默认模型 = 空间默认；调用方没显式指定时读取。
      // 显式指定（如空间设置选到的模型）优先；tutor 追问仍走全局默认。
      let providerConfigId = p.providerConfigId
      let modelId = p.modelId
      if (!providerConfigId && (p.mode === 'research' || p.mode === 'task')) {
        const dm = await services().projects.getModelSettings(p.spaceId)
        if (dm.providerConfigId && dm.modelId) {
          providerConfigId = dm.providerConfigId
          modelId = dm.modelId
        }
      }
      return services().agent.sendMessage(p.mode, { spaceId: p.spaceId, conceptId: p.conceptId ?? null }, p.message, {
        providerConfigId,
        modelId,
        focusQuestionId: p.focusQuestionId,
      })
    }))
  ipcBridge.handle('dl:agent-cancel', (_e, p: { mode: DlAgentMode; spaceId: string; conceptId?: string | null }) =>
    wrap(async () => {
      await services().projects.ensureOwned(p.spaceId)
      services().agent.cancel(p.mode, { spaceId: p.spaceId, conceptId: p.conceptId ?? null })
      return { ok: true }
    }))
  ipcBridge.handle('dl:agent-busy', (_e, p: { mode: DlAgentMode; spaceId: string; conceptId?: string | null }) =>
    wrap(async () => {
      await services().projects.ensureOwned(p.spaceId)
      return services().agent.isBusy(p.mode, { spaceId: p.spaceId, conceptId: p.conceptId ?? null })
    }))

  // ---- 方案确认流程（2026-09-13：对齐诉求 → 确认知识体系 → 才允许落库；
  //      2026-09-14 加讲义方案 lesson 步：按 conceptId 取/确认某概念的讲义规格与区级计划） ----
  // 注：通道字面量必须与 ipcBridge.handle( 同行——dl-channel-consistency 护栏按行内正则抽取三端键集合
  ipcBridge.handle('dl:get-plan', (_e, p: { id: string; conceptId?: string | null }) =>
    wrap(() => getDlPlanView(getCoreDatabaseManager(), p.id, p.conceptId ?? null)))
  ipcBridge.handle('dl:confirm-plan', (_e, p: { id: string; step: 'understanding' | 'syllabus' | 'lesson'; payload?: unknown; feedback?: string | null; conceptId?: string | null }) =>
    wrap(() => confirmDlPlan(getCoreDatabaseManager(), p.id, p.step, p.payload, p.feedback ?? null, p.conceptId ?? null)))

  // ---- 周期推进（M2-C；pace 配置读写 + 调度器状态；读写经服务层校验） ----
  ipcBridge.handle('dl:get-space-pace', (_e, p: { id: string }) =>
    wrap(() => services().projects.getPaceSettings(p.id)))
  ipcBridge.handle('dl:set-space-pace', (_e, p: { id: string; pace: DlPaceSettings }) =>
    wrap(() => services().projects.setPaceSettings(p.id, p.pace)))
  ipcBridge.handle('dl:scheduler-state', () =>
    wrap(async () => {
      const s = services()
      return {
        mode: isDesktopRuntime() ? 'desktop' : 'web',
        running: s.scheduler.isRunning(),
        runningCount: s.scheduler.runningCount(),
      }
    }))

  // ---- 间隔复习（M3-B：配置/到期队列/标记与完成流转；读写经服务层校验） ----
  ipcBridge.handle('dl:get-space-review', (_e, p: { id: string }) =>
    wrap(() => services().projects.getReviewSettings(p.id)))
  ipcBridge.handle('dl:set-space-review', (_e, p: { id: string; review: DlReviewSettings }) =>
    wrap(() => services().projects.setReviewSettings(p.id, p.review)))
  ipcBridge.handle('dl:review-due', (_e, p: { id: string }) =>
    wrap(async () => {
      const s = services()
      const settings = await s.projects.getReviewSettings(p.id)
      const items = settings.enabled
        ? await s.graph.listReviewDue(p.id, { intervalMin: settings.intervalMin, limit: settings.limit })
        : []
      // 平台通知（P1-5）：有到期且超过一个复习周期未提示 → 发一次（不刷屏）
      if (items.length > 0 && settings.enabled) {
        const now = Date.now()
        const last = lastReviewNoticeAt.get(p.id) ?? 0
        if (now - last >= Math.max(1, settings.intervalMin) * 60_000) {
          lastReviewNoticeAt.set(p.id, now)
          const spaceName = (await s.projects.getSpace(p.id))?.name ?? undefined
          void dlPublishNotice('dl:review-due', { spaceId: p.id, spaceName, conceptName: items[0]?.name })
        }
      }
      return { settings, items }
    }))
  ipcBridge.handle('dl:ack-need-review', (_e, p: { id: string; conceptId: string }) =>
    wrap(async () => {
      await services().graph.markReview(p.id, p.conceptId)
      return { ok: true }
    }))
  ipcBridge.handle('dl:review-done', (_e, p: { id: string; conceptId: string }) =>
    wrap(async () => {
      await services().graph.reviewDone(p.id, p.conceptId)
      return { ok: true }
    }))

  // ---- 讲义发布（2026-09-09 复盘：draft→published 原无写入者，发布闭环断路、统计恒 0） ----
  ipcBridge.handle('dl:publish-card', (_e, p: { id: string; cardId: string }) =>
    wrap(async () => {
      const db = getCoreDatabaseManager()
      await services().projects.ensureOwned(p.id)
      const card = await db.dlCards!.getById(p.cardId)
      if (!card || card.projectId !== p.id) throw new Error('卡片不存在或不属于本空间')
      if (card.status === 'published') return { ok: true, already: true }
      const current = await db.dlCards!.getCurrentByConcept(p.id, card.conceptId)
      if (!current || current.id !== card.id) throw new Error('只能发布该概念的最新一版讲义')
      await db.dlCards!.patch(card.id, { status: 'published' })
      return { ok: true, already: false }
    }))

  // ---- 概念笔记（M4-UX1 #3 选区笔记 / #6 收藏回答；经项目属主校验） ----
  ipcBridge.handle('dl:list-notes', (_e, p: { id: string; conceptId?: string | null }) =>
    wrap(async () => {
      const db = getCoreDatabaseManager()
      await services().projects.ensureOwned(p.id)
      const rows = p.conceptId ? await db.dlNotes!.listByConcept(p.id, p.conceptId) : await db.dlNotes!.listByProject(p.id)
      return { notes: rows.map((r) => toDlNote(r)), total: rows.length }
    }))
  ipcBridge.handle('dl:create-note', (_e, p: { id: string; conceptId?: string | null; source: 'selection' | 'qna'; anchorText?: string | null; anchorStart?: number | null; anchorEnd?: number | null; questionId?: string | null; contentMd: string }) =>
    wrap(async () => {
      const db = getCoreDatabaseManager()
      await services().projects.ensureOwned(p.id)
      if (p.source === 'qna' && p.questionId) {
        const existing = await db.dlNotes!.findByQuestion(p.id, p.questionId)
        if (existing) return { note: toDlNote(existing), created: false } // 收藏幂等
        // 归属回填（2026-09-09 复盘）：收藏归属=问题真实概念（答疑历史为空间级，
        // 前端"当前概念"可能 ≠ 问题所属概念；查 question 回填防错位/防跨概念幂等键不一致）
        const q = await db.dlQuestions!.getById(p.questionId)
        if (q && q.projectId === p.id) p = { ...p, conceptId: q.conceptId ?? p.conceptId ?? null }
      }
      const row = await db.dlNotes!.create({
        id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        projectId: p.id,
        conceptId: p.conceptId,
        source: p.source,
        anchorText: p.anchorText,
        anchorStart: p.anchorStart,
        anchorEnd: p.anchorEnd,
        questionId: p.questionId,
        contentMd: p.contentMd,
      })
      return { note: toDlNote(row), created: true }
    }))
  ipcBridge.handle('dl:delete-note', (_e, p: { id: string; noteId: string }) =>
    wrap(async () => {
      const db = getCoreDatabaseManager()
      await services().projects.ensureOwned(p.id)
      const deleted = await db.dlNotes!.deleteById(p.noteId) // scoped:他人笔记删不到
      return { ok: deleted > 0 }
    }))
}
