/**
 * 知识大脑 IPC 处理器（T12，详细设计 §7.1 核心集）
 * @module core/packs/knowledge-base/handlers/kb-brain.handler
 *
 * 前缀 `kb:brain:` 落在包 manifest 的 'kb:' 前缀内（ipc-guard 自动覆盖）。
 * distill（手动提炼触发）随 T14 上线；review 通道随 M3 FSRS 上线。
 */
import { ipcBridge } from '@core/ipc/bridge-adapter'
import { KnowledgeBaseService } from '@core/platform/services/knowledge-base.service'
import { getKbBrainPanelService } from '@core/platform/services/kb-brain/brain-panel.service'
import { KbDistillService } from '@core/platform/services/kb-brain/distill.service'
import { safeBrainEmbed } from '@core/platform/services/kb-brain/smelt-common'
import { KbBrainFsrsService } from '@core/platform/services/kb-brain/fsrs.service'
import { KbResearchService } from '@core/platform/services/kb-brain/research.service'
import { enqueueDigestForExisting } from '@core/platform/services/kb-brain/digest-orchestrator.service'
import { getKbGoalDistillService } from '@core/platform/services/kb-brain/goal-distill.service'
import { getKbConsolidateService } from '@core/platform/services/kb-brain/consolidate.service'
import { getKbCleanupService } from '@core/platform/services/kb-brain/cleanup.service'
import { getKbLayerRelabelService } from '@core/platform/services/kb-brain/layer-relabel.service'
import { getKbBookPassesService } from '@core/platform/services/kb-brain/book-passes.service'
import { KbBrainHealthService } from '@core/platform/services/kb-brain/health.service'
import { parseModelRef } from '@core/platform/services/kb-brain/llm'
import { parseBrainConfig } from '@core/platform/services/kb-brain/brain-config'
import { getKbForeshadowScanService } from '@core/platform/services/kb-brain/foreshadow-scan.service'
import { getKbAutomationLogService } from '@core/platform/services/kb-brain/automation-log.service'
import type { SearchResult } from '@shared/types/knowledge-base.types'

let kbService: KnowledgeBaseService | null = null
function svc(): KnowledgeBaseService {
  if (!kbService) kbService = new KnowledgeBaseService()
  return kbService
}

export function registerKbBrainHandlers(): void {
  const panel = getKbBrainPanelService()

  ipcBridge.handle('kb:brain:get-config', (_e, p: { kbId: string }) => panel.getConfig(p.kbId))

  ipcBridge.handle(
    'kb:brain:update-config',
    (_e, p: { kbId: string; patch: Record<string, unknown> }) =>
      panel.updateConfig(p.kbId, p.patch as never)
  )

  ipcBridge.handle('kb:brain:doc-status', async (_e, p: { kbId: string }) => {
    const out = await svc().getDocuments(p.kbId)
    if (!out.success || !out.data) return out
    const docs = out.data.map(d => ({
      id: d.id,
      name: d.name,
      brainStatus: d.brainStatus ?? null,
      brainProgress: d.brainProgress ?? null,
      brainError: d.brainError ?? null
    }))
    return { success: true, data: docs }
  })

  ipcBridge.handle(
    'kb:brain:list-atoms',
    (
      _e,
      p: {
        kbId: string
        documentId?: string
        page?: number
        pageSize?: number
        status?: string
        type?: string
        types?: string[]
        origin?: string
        layer?: string
        foreshadow?: 'dangling'
      }
    ) => panel.listAtoms(p)
  )

  ipcBridge.handle('kb:brain:get-atom', (_e, p: { atomId: string }) => panel.getAtom(p.atomId))

  ipcBridge.handle(
    'kb:brain:list-notes',
    (_e, p: { kbId: string; status?: string; type?: string; page?: number; pageSize?: number }) =>
      panel.listNotes(p)
  )

  ipcBridge.handle(
    'kb:brain:proposal-inbox',
    (_e, p: { kbId: string; page?: number; pageSize?: number }) => panel.proposalInbox(p)
  )

  ipcBridge.handle(
    'kb:brain:decide-proposal',
    (
      _e,
      p: {
        noteId: string
        action: 'publish' | 'publish-edited' | 'reject'
        patch?: { title?: string; body?: string; description?: string }
      }
    ) => panel.decideProposal(p)
  )

  ipcBridge.handle('kb:brain:list-lens', (_e, p: { kbId: string }) => panel.listLenses(p.kbId))

  ipcBridge.handle(
    'kb:brain:upsert-lens',
    (
      _e,
      p: {
        kbId: string
        id?: string
        title: string
        description: string
        attendTo: string[]
        questions: string[]
      }
    ) => panel.upsertLens(p)
  )

  ipcBridge.handle(
    'kb:brain:capture-reading',
    (
      _e,
      p: {
        kbId: string
        documentId: string
        chapterId?: string
        chapterHash?: string
        quote: string
        remark: string
        startOffset?: number
        endOffset?: number
        lensNoteId?: string
      }
    ) => panel.captureReading(p)
  )

  ipcBridge.handle('kb:brain:stats', (_e, p: { kbId: string }) => panel.stats(p.kbId))

  // 大脑体检（§检查机制）：只读覆盖率/构成/建议报告，面板手动触发
  ipcBridge.handle('kb:brain:health-check', (_e, p: { kbId: string }) =>
    new KbBrainHealthService().check(p.kbId)
  )

  // T14 手动提炼（任务边界闸门）
  let distillBusy = false
  ipcBridge.handle('kb:brain:distill', async (_e, p: { kbId: string; documentIds?: string[] }) => {
    if (distillBusy) return { success: false, error: '提炼进行中，请稍候' }
    distillBusy = true
    try {
      const kbRow = await svc()
        .getKnowledgeBase(p.kbId)
        .then(r => r.data)
      const { parseBrainConfig } = await import('@core/platform/services/kb-brain/brain-config')
      const cfg = kbRow?.brainConfig ? parseBrainConfig(kbRow.brainConfig) : null
      const svc2 = new KbDistillService({
        // 提炼是降级型消费（无向量也能按 type 分组），失败原因由 safeBrainEmbed 记日志
        embed: (texts, kb) =>
          safeBrainEmbed(
            (t, k) => svc().getEmbeddingVectors(t, k.embeddingConfig ? JSON.parse(k.embeddingConfig) : {}),
            texts,
            kb,
            'kb:brain:distill',
          ),
        settingPatternEnabled: cfg?.patterns.settingEnabled ?? true,
        characterPatternEnabled: cfg?.patterns.characterEnabled ?? false,
        modelOverride: () => (cfg?.models.adjudicate ? parseModelRef(cfg.models.adjudicate) : {})
      })
      const embCfg = kbRow?.embeddingConfig ?? null
      const outcome = await svc2.distill(p.kbId, embCfg, { documentIds: p.documentIds })
      return { success: true, data: outcome }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    } finally {
      distillBusy = false
    }
  })

  // 冲突面：suspected 论断列表（人审裁决）
  ipcBridge.handle('kb:brain:conflicts', async (_e, p: { kbId: string }) => {
    const db = await import('@core/database/database-manager.interface')
    const manager = db.getCoreDatabaseManager()
    if (!manager.kbAtoms) return { success: false, error: '知识大脑未启用（旧库）' }
    const rows = await manager.kbAtoms.findByKb(p.kbId, { status: ['suspected'], limit: 100 })
    return { success: true, data: rows }
  })

  // 冲突裁决：人工判 supported（保留）或 superseded（废弃，可指认替代论断）
  ipcBridge.handle(
    'kb:brain:resolve-conflict',
    async (
      _e,
      p: { atomId: string; verdict: 'supported' | 'superseded'; supersededByAtomId?: string }
    ) => {
      const db = await import('@core/database/database-manager.interface')
      const manager = db.getCoreDatabaseManager()
      if (!manager.kbAtoms) return { success: false, error: '知识大脑未启用（旧库）' }
      await manager.kbAtoms.updateStatus(p.atomId, {
        status: p.verdict,
        supersededByAtomId: p.verdict === 'superseded' ? (p.supersededByAtomId ?? null) : undefined
      })
      return { success: true }
    }
  )

  // 模型设置下拉源（系统已启用提供商的对话模型）
  ipcBridge.handle('kb:brain:list-models', async _e => {
    const out = await svc().getChatModels()
    if (!out.success || !out.data) return out
    return {
      success: true,
      data: out.data.map(m => ({
        label: m.name,
        value: m.providerConfigId ? `${m.providerConfigId}:${m.id}` : m.id
      }))
    }
  })

  // 提取目标提炼（经验维度 map-reduce；分钟级多次 LLM → 立即入队返回，前端轮询状态）
  // 共享单例：与后台自动化共用 running 单飞锁，手动/自动互斥不重跑
  const goalDistill = getKbGoalDistillService()
  interface GoalRunRecord {
    ok: boolean
    error?: string
    proposed?: boolean
    cards?: number
    skippedDuplicate?: boolean
    cardTitle?: string | null
    fragments?: number
  }
  const goalLastResult = new Map<string, GoalRunRecord>()
  ipcBridge.handle('kb:brain:goal-run', async (_e, p: { kbId: string; goalId: string }) => {
    const kbRow = await svc()
      .getKnowledgeBase(p.kbId)
      .then(r => r.data)
    const cfg = kbRow?.brainConfig ? parseBrainConfig(kbRow.brainConfig) : null
    const goal = cfg?.goals.find(g => g.id === p.goalId)
    if (!goal) return { success: false, error: '提取目标不存在或已删除' }
    if (!goal.enabled) return { success: false, error: '目标未启用' }
    if (goalDistill.isRunning(p.kbId, goal.id)) return { success: false, error: '该目标提炼进行中' }
    // 每库模型（brainConfig.models.adjudicate）——提炼与裁决同档位
    goalDistill.setModelOverride(p.kbId, () =>
      cfg?.models.adjudicate ? parseModelRef(cfg.models.adjudicate) : {}
    )
    goalDistill
      .runGoal(p.kbId, goal)
      .then(out => {
        goalLastResult.set(`${p.kbId}:${goal.id}`, { ok: true, ...out })
        console.info(
          `[kb-brain] 目标提炼完成 kb=${p.kbId} goal=${goal.name} fragments=${out.fragments} proposed=${out.proposed}`
        )
      })
      .catch(e => {
        goalLastResult.set(`${p.kbId}:${goal.id}`, {
          ok: false,
          error: e instanceof Error ? e.message : String(e)
        })
        console.warn(
          `[kb-brain] 目标提炼失败 kb=${p.kbId} goal=${goal.name}: ${e instanceof Error ? e.message : String(e)}`
        )
      })
    return { success: true, data: { queued: true } }
  })
  ipcBridge.handle('kb:brain:goal-status', (_e, p: { kbId: string }) => {
    const running = goalDistill.runningGoals(p.kbId)
    const last: Record<string, GoalRunRecord> = {}
    for (const [key, rec] of goalLastResult) {
      const [kbId, goalId] = key.split(':')
      if (kbId === p.kbId && goalId) last[goalId] = rec
    }
    return { success: true, data: { running, last } }
  })

  // 论断归纳整理（二次提炼：细碎合并；fire-and-forget + 进度轮询，与 goal-run 同款动线）
  const consolidate = getKbConsolidateService()
  ipcBridge.handle('kb:brain:consolidate-run', (_e, p: { kbId: string }) => {
    if (consolidate.isRunning(p.kbId)) return { success: false, error: '论断归纳进行中' }
    consolidate
      .run(p.kbId)
      .then(s =>
        console.info(
          `[kb-brain] 论断归纳完成 kb=${p.kbId} 批次=${s.processedBatches}/${s.totalBatches} 合并组=${s.mergedGroups} 归档=${s.supersededAtoms} 失败批=${s.failedBatches}`
        )
      )
      .catch(e =>
        console.warn(
          `[kb-brain] 论断归纳失败 kb=${p.kbId}: ${e instanceof Error ? e.message : String(e)}`
        )
      )
    return { success: true, data: { queued: true } }
  })
  ipcBridge.handle('kb:brain:consolidate-status', (_e, p: { kbId: string }) => {
    return { success: true, data: consolidate.status(p.kbId) }
  })

  // 存量垃圾论断清理（LLM 分诊归档；fire-and-forget + 进度轮询）
  const cleanup = getKbCleanupService()
  ipcBridge.handle('kb:brain:cleanup-run', async (_e, p: { kbId: string }) => {
    if (cleanup.isRunning(p.kbId)) return { success: false, error: '垃圾清理进行中' }
    // 每库模型（brainConfig.models.adjudicate）——分诊与裁决同档位
    const kbRow = await svc()
      .getKnowledgeBase(p.kbId)
      .then(r => r.data)
    const cleanupCfg = kbRow?.brainConfig ? parseBrainConfig(kbRow.brainConfig) : null
    cleanup.setModelOverride(p.kbId, () =>
      cleanupCfg?.models.adjudicate ? parseModelRef(cleanupCfg.models.adjudicate) : {}
    )
    cleanup
      .run(p.kbId)
      .then(st =>
        console.info(
          `[kb-brain] 垃圾清理完成 kb=${p.kbId} 批次=${st.processedBatches}/${st.totalBatches} 归档=${st.archivedCount} 失败批=${st.failedBatches}`
        )
      )
      .catch(e =>
        console.warn(
          `[kb-brain] 垃圾清理失败 kb=${p.kbId}: ${e instanceof Error ? e.message : String(e)}`
        )
      )
    return { success: true, data: { queued: true } }
  })
  ipcBridge.handle('kb:brain:cleanup-status', (_e, p: { kbId: string }) => {
    return { success: true, data: cleanup.status(p.kbId) }
  })

  // 存量论断分层补标（老库迁移：layer 恒 detail → LLM 批量重标四层；fire-and-forget + 进度轮询）
  const layerRelabel = getKbLayerRelabelService()
  ipcBridge.handle('kb:brain:layer-relabel-run', async (_e, p: { kbId: string }) => {
    if (layerRelabel.isRunning(p.kbId)) return { success: false, error: '分层补标进行中' }
    const kbRow = await svc()
      .getKnowledgeBase(p.kbId)
      .then(r => r.data)
    const relabelCfg = kbRow?.brainConfig ? parseBrainConfig(kbRow.brainConfig) : null
    layerRelabel.setModelOverride(p.kbId, () =>
      relabelCfg?.models.adjudicate ? parseModelRef(relabelCfg.models.adjudicate) : {}
    )
    layerRelabel
      .run(p.kbId)
      .then(st =>
        console.info(
          `[kb-brain] 分层补标完成 kb=${p.kbId} 批次=${st.processedBatches}/${st.totalBatches} 重标=${st.relabeledCount} 失败批=${st.failedBatches}`
        )
      )
      .catch(e =>
        console.warn(
          `[kb-brain] 分层补标失败 kb=${p.kbId}: ${e instanceof Error ? e.message : String(e)}`
        )
      )
    return { success: true, data: { queued: true } }
  })
  ipcBridge.handle('kb:brain:layer-relabel-status', (_e, p: { kbId: string }) => {
    return { success: true, data: layerRelabel.status(p.kbId) }
  })

  // 书级汇总补跑（老库文档消化完成于书级遍上线前、不会再发 completed 事件——
  // 台账幂等，重复点击安全；fire-and-forget + 进度轮询）
  const bookPasses = getKbBookPassesService()
  ipcBridge.handle('kb:brain:book-passes-run', async (_e, p: { kbId: string }) => {
    if (bookPasses.isRunningKb(p.kbId)) return { success: false, error: '书级汇总进行中' }
    const kbRow = await svc()
      .getKnowledgeBase(p.kbId)
      .then(r => r.data)
    if (!kbRow) return { success: false, error: '知识库不存在' }
    const bpCfg = kbRow.brainConfig ? parseBrainConfig(kbRow.brainConfig) : null
    bookPasses.setModelOverride(p.kbId, () =>
      bpCfg?.models.adjudicate ? parseModelRef(bpCfg.models.adjudicate) : {}
    )
    const docs = await svc()
      .getDocuments(p.kbId)
      .then(r => (r.success && r.data ? r.data.map(d => d.id) : []))
    if (docs.length === 0) return { success: false, error: '知识库没有文档' }
    bookPasses
      .runForKnowledgeBase(p.kbId, bpCfg?.profile?.contentType ?? '', docs)
      .then(st =>
        console.info(
          `[kb-brain] 书级汇总补跑完成 kb=${p.kbId} 文档=${st.processedDocs}/${st.totalDocs}`
        )
      )
      .catch(e =>
        console.warn(
          `[kb-brain] 书级汇总补跑失败 kb=${p.kbId}: ${e instanceof Error ? e.message : String(e)}`
        )
      )
    return { success: true, data: { queued: true } }
  })
  ipcBridge.handle('kb:brain:book-passes-status', (_e, p: { kbId: string }) => {
    return { success: true, data: bookPasses.kbStatus(p.kbId) }
  })

  // G3 伏笔扫描（sets-up 边候选生成器；fire-and-forget + 状态轮询；仅手动触发——自动扫描需独立成本闸门）
  const foreshadow = getKbForeshadowScanService()
  ipcBridge.handle('kb:brain:foreshadow-run', (_e, p: { kbId: string }) => {
    if (foreshadow.isRunning(p.kbId)) return { success: false, error: '伏笔扫描进行中' }
    foreshadow
      .run(p.kbId)
      .then(st =>
        console.info(
          `[kb-brain] 伏笔扫描完成 kb=${p.kbId} 文档=${st.scannedDocs} 悬念=${st.setups} 提案=${st.linksProposed} 新增=${st.created} 重复=${st.deduped}`
        )
      )
      .catch(e =>
        console.warn(
          `[kb-brain] 伏笔扫描失败 kb=${p.kbId}: ${e instanceof Error ? e.message : String(e)}`
        )
      )
    return { success: true, data: { queued: true } }
  })
  ipcBridge.handle('kb:brain:foreshadow-status', (_e, p: { kbId: string }) => {
    return { success: true, data: foreshadow.status(p.kbId) }
  })

  // T18 FSRS 复习：到期队列 / 评分
  const fsrs = new KbBrainFsrsService()
  ipcBridge.handle('kb:brain:review-next', async (_e, p: { kbId: string; limit?: number }) => {
    const items = await fsrs.dueNext(p.kbId, p.limit ?? 10)
    return { success: true, data: items }
  })
  ipcBridge.handle(
    'kb:brain:review-grade',
    async (_e, p: { kbId: string; noteId: string; rating: 1 | 2 | 3 | 4 }) =>
      fsrs.grade(p.kbId, p.noteId, p.rating)
  )

  // 补消化：对已上传（开脑前完成）的文档直接触发提取
  ipcBridge.handle('kb:brain:digest-document', async (_e, p: { documentId: string }) => {
    const ok = await enqueueDigestForExisting(p.documentId)
    return ok
      ? { success: true, data: { queued: true } }
      : { success: false, error: '知识大脑未启用或仓储未装配' }
  })

  // M4 深度研究流（分钟级多次 LLM；invoke 长等待 + research 事件推送过程）
  let researchBusy = false
  ipcBridge.handle('kb:brain:research', async (_e, p: { question: string }) => {
    if (researchBusy) return { success: false, error: '研究进行中，请稍候' }
    if (!p?.question?.trim()) return { success: false, error: '研究问题不能为空' }
    researchBusy = true
    try {
      const svc2 = new KbResearchService()
      const report = await svc2.research(p.question)
      return { success: true, data: report }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    } finally {
      researchBusy = false
    }
  })

  // M4 技能导出（published 卡 → SKILL.md 内容，前端 saveBlobAs 落盘）
  ipcBridge.handle('kb:brain:export-skill', (_e, p: { noteId: string }) =>
    panel.exportSkill(p.noteId)
  )

  // M4 品味侧写（taste 计算+落 brain_state）
  ipcBridge.handle('kb:brain:taste', (_e, p: { kbId: string }) => panel.computeTaste(p.kbId))

  // brain 检索直通（论断页签的调试检索 / 面板预览）
  ipcBridge.handle(
    'kb:brain:search',
    async (
      _e,
      p: {
        knowledgeBaseId: string
        query: string
        topK?: number
        include?: Array<'chunk' | 'atom' | 'note'>
        lensNoteId?: string
        intent?: 'lookup' | 'synthesize'
      }
    ) =>
      (await svc().search({ ...p })) as { success: boolean; data?: SearchResult[]; error?: string }
  )

  // v2 P4：自动化动作日志（面板时间线）+ 撤销
  ipcBridge.handle(
    'kb:brain:auto-log-list',
    (_e, p: { kbId: string; limit?: number }) => getKbAutomationLogService().listRecent(p.kbId, p.limit ?? 10),
  )
  ipcBridge.handle(
    'kb:brain:auto-log-undo',
    (_e, p: { logId: string }) => getKbAutomationLogService().undo(p.logId),
  )
}
