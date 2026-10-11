/**
 * 知识大脑·体检服务（§检查机制）
 * @module platform/services/kb-brain/health.service
 *
 * 长篇提取很难一次完整：覆盖率缺口（没消化的章/零产出章/重试耗尽章）、知识构成
 * （分层分布/悬置点/存疑论断）、实体摘要积压、书级遍状态——一次纯 DB 体检全部摸清，
 * 产出结构化报告 + 可执行建议（建议项映射到面板既有动作，不新增写操作）。
 * 纪律：只读；不调 LLM；单库几百章规模下 O(文档×章) 查询可接受（面板手动触发）。
 */
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { parseBrainConfig } from './brain-config'
import { passesForProfile } from './book-passes.service'

import { MAX_ATTEMPTS } from '@core/database/repositories/kb-digest-pass.repository'

export interface KbHealthSuggestion {
  code: string
  message: string
}

export interface KbBrainHealthReport {
  kbId: string
  profile: { contentType: string; detected: boolean }
  coverage: {
    documents: number
    documentsPending: number
    documentsFailed: number
    chaptersTotal: number
    chaptersDigested: number
    chaptersExhausted: number
    chaptersNoAtoms: number
    noAtomChapterSample: string[]
  }
  knowledge: {
    atomsWorking: number
    byStatus: Record<string, number>
    byLayer: Record<string, number>
    byType: Record<string, number>
    openQuestions: number
    notesProposed: number
    notesPublished: number
    entitiesActive: number
    entitiesPendingSummary: number
    /** v3 M3：agent 取知识次数（按通路；「第一用户是 AI」仪表） */
    consumedByTool: Record<string, number>
  }
  bookPasses: Array<{ documentName: string; passKey: string; status: string; error: string | null }>
  suggestions: KbHealthSuggestion[]
}

export class KbBrainHealthService {
  async check(kbId: string): Promise<{ success: boolean; data?: KbBrainHealthReport; error?: string }> {
    const db = getCoreDatabaseManager()
    if (!db.kbAtoms || !db.kbNotes || !db.kbDigestPasses || !db.kbDocuments || !db.kbChapters || !db.kbBrainEntities || !db.knowledgeBases) {
      return { success: false, error: '知识大脑未启用（旧库）' }
    }
    const [kb, docs] = await Promise.all([db.knowledgeBases.findById(kbId), db.kbDocuments.findByKnowledgeBaseId(kbId)])
    if (!kb) return { success: false, error: '知识库不存在' }
    const cfg = parseBrainConfig(kb.brainConfig)
    const contentType = cfg?.profile?.contentType ?? ''

    /* ---------- 覆盖率：文档 × 章 × 基础遍台账 ---------- */
    let chaptersTotal = 0
    let chaptersDigested = 0
    let chaptersExhausted = 0
    let chaptersNoAtoms = 0
    const noAtomChapterSample: string[] = []
    const bookPasses: KbBrainHealthReport['bookPasses'] = []
    for (const doc of docs) {
      const [chapterRows, passRows] = await Promise.all([
        db.kbChapters.findByDocument(doc.id),
        db.kbDigestPasses.listByDocument(doc.id),
      ])
      chaptersTotal += chapterRows.length
      const titleById = new Map(chapterRows.map((c) => [c.id, c.title]))
      const baseRows = passRows.filter((p) => p.passType === 'base')
      const doneByChapter = new Map(baseRows.filter((p) => p.status === 'done' && p.chapterId).map((p) => [p.chapterId as string, p]))
      chaptersDigested += doneByChapter.size
      chaptersExhausted += baseRows.filter((p) => p.status === 'failed' && p.attempts >= MAX_ATTEMPTS).length
      for (const [chapterId, pass] of doneByChapter) {
        let atoms = Number.NaN
        try {
          atoms = (JSON.parse(pass.statsJson ?? '{}') as { atoms?: number }).atoms ?? Number.NaN
        } catch {
          /* 损坏 stats 行按未统计处理 */
        }
        if (atoms === 0) {
          chaptersNoAtoms += 1
          if (noAtomChapterSample.length < 5) noAtomChapterSample.push(titleById.get(chapterId) ?? chapterId)
        }
      }
      const docName = doc.name
      for (const p of passRows.filter((x) => x.passType === 'book')) {
        bookPasses.push({ documentName: docName, passKey: p.passKey, status: p.status, error: p.error })
      }
    }
    const documentsPending = docs.filter((d) => !d.brainStatus || !['digested', 'digesting', 'skipped'].includes(d.brainStatus)).length
    const documentsFailed = docs.filter((d) => d.brainStatus === 'failed').length

    /* ---------- 知识构成 ---------- */
    const atomStats = await db.kbAtoms.statsByKb(kbId)
    const workingTotal = (atomStats.byStatus.supported ?? 0) + (atomStats.byStatus.suspected ?? 0) + (atomStats.byStatus.stale ?? 0)
    const [proposed, published, entitiesActive, entitiesPending] = await Promise.all([
      db.kbNotes.listByStatus(kbId, 'proposed', 1, 1),
      db.kbNotes.listByStatus(kbId, 'published', 1, 1),
      db.kbBrainEntities.countActive(kbId),
      db.kbBrainEntities.countPendingSummaries(kbId),
    ])

    /* ---------- 建议（映射到面板既有动作；只读服务不代跑） ---------- */
    const suggestions: KbHealthSuggestion[] = []
    if (!contentType) {
      suggestions.push({ code: 'profile-missing', message: '内容类型未识别（当前用通用提示词提取）——可在「设置 → 内容类型」手动指定，或重新提取让系统自动识别。' })
    }
    if (documentsPending > 0) suggestions.push({ code: 'docs-pending', message: `${documentsPending} 篇文档待提取——右栏「待提取文档」逐一或全部提取。` })
    if (chaptersExhausted > 0) suggestions.push({ code: 'chapters-exhausted', message: `${chaptersExhausted} 章重试耗尽——在「待提取文档」对该文档点「提取」复活重跑。` })
    if (atomStats.byStatus.suspected > 0) suggestions.push({ code: 'conflicts-pending', message: `${atomStats.byStatus.suspected} 条论断存疑（矛盾冲突/低置信）——建议人工复核后再入库。` })
    if (entitiesPending > 0) suggestions.push({ code: 'entities-pending-summary', message: `${entitiesPending} 个实体缺演化摘要——下次消化时自动补齐，无需手动处理。` })
    if ((atomStats.byLayer.setting ?? 0) === 0 && (atomStats.byLayer.craft ?? 0) === 0 && (atomStats.byLayer.describe ?? 0) === 0 && workingTotal > 0) {
      suggestions.push({ code: 'no-setting-layer', message: '分层统计全为「细节」——存量论断是旧版未分层提取的。点「论断整理 → 分层补标」用 AI 批量重标（比重跑提取便宜得多）。' })
    }
    if ((atomStats.openQuestions ?? 0) > 0 && contentType === 'novel' && !bookPasses.some((p) => p.passKey === 'book:foreshadow-ledger' && p.status === 'done')) {
      suggestions.push({ code: 'foreshadow-open', message: `${atomStats.openQuestions} 个悬置点（伏笔/暗线）未登记台账——点「论断整理 → 书级汇总」可补跑生成「伏笔台账」卡。` })
    }
    if (proposed.total > 0) suggestions.push({ code: 'proposals-pending', message: `${proposed.total} 张经验卡待审批——「待审提议」批准后才会进入检索池。` })
    // 书级遍的预期关卡未建（画像已识别但台账无记录）——通常是旧消化产物
    if (contentType) {
      const expected = new Set(passesForProfile(contentType).map((p) => p.key))
      const doneOrRunning = new Set(bookPasses.filter((p) => p.status === 'done' || p.status === 'running').map((p) => p.passKey))
      const missing = [...expected].filter((k) => !doneOrRunning.has(k))
      if (missing.length > 0 && documentsPending === 0) {
        suggestions.push({ code: 'book-passes-missing', message: `书级汇总遍未齐（缺 ${missing.length} 项）——点「论断整理 → 书级汇总」手动补跑（台账幂等，重复点击安全）。` })
      }
    }

    return {
      success: true,
      data: {
        kbId,
        profile: { contentType, detected: !!contentType },
        coverage: {
          documents: docs.length,
          documentsPending,
          documentsFailed,
          chaptersTotal,
          chaptersDigested,
          chaptersExhausted,
          chaptersNoAtoms,
          noAtomChapterSample,
        },
        knowledge: {
          atomsWorking: workingTotal,
          byStatus: atomStats.byStatus,
          byLayer: atomStats.byLayer,
          byType: atomStats.byType,
          openQuestions: atomStats.openQuestions ?? 0,
          notesProposed: proposed.total,
          notesPublished: published.total,
          entitiesActive,
          entitiesPendingSummary: entitiesPending,
          // v3 M3 消费记账：agent 取知识次数（「第一用户是 AI」仪表）
          consumedByTool: await db.kbConsumptionLogs?.countByTool(kbId).catch(() => ({})) ?? {},
        },
        bookPasses,
        suggestions,
      },
    }
  }
}
