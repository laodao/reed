/**
 * 知识大脑·消化编排器（P1，详细设计 §3）
 * @module platform/services/kb-brain/digest-orchestrator.service
 *
 * 触发：kb:document-completed 域事件（D3：服务层订阅 + 台账驱动恢复，
 * 不走 workflow 定义——台账行级幂等强于节点重放）。
 * 链路：配置检查 → 章级基础遍（原子化→实体解析→裁决→入池）→ stale 兜底 → 状态流转。
 * 纪律：事件回调先捕获 userId 再 runWithUserAsync（ALS 教训）；文档任务串行
 * （并发=1，满足 ≤2 上限更保守）；原子层任何故障不影响现有检索主链路（fail-soft）。
 */
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { getCurrentUserId } from '@core/context/user-context'
import { KbEntitySummaryService } from './entity-summary.service'
import { KbDistillService } from './distill.service'
import { getEventEmitter } from '@core/interfaces/event.interface'
import { runWithUserAsync, LOCAL_DEFAULT_USER_ID } from '@core/context/user-context'
import { subscribeDomainEvents, type DomainEvent } from '@core/platform/workflow/trigger/domain-event-bus'
import { WORKFLOW_EVENT_NAMES } from '@shared/types/workflow.types'
import { createLogger } from '@core/utils/logger'
import type { KbAtomRepository, KbAtomInput } from '@core/database/repositories/kb-atom.repository'
import type { KbEntityRepository } from '@core/database/repositories/kb-entity.repository'
import type { KbKnowledgeEdgeRepository } from '@core/database/repositories/kb-knowledge-edge.repository'
import type { KbNoteRepository } from '@core/database/repositories/kb-note.repository'
import type { KbDigestPassRepository } from '@core/database/repositories/kb-digest-pass.repository'
import type { KbDocumentRepository } from '@core/database/repositories/kb-document.repository'
import type { KbChapterRepository } from '@core/database/repositories/kb-chapter.repository'
import type { KbChunkRepository } from '@core/database/repositories/kb-chunk.repository'
import type { KnowledgeBaseRepository } from '@core/database/repositories/knowledge-base.repository'
import { AtomizeService, AdjudicateService } from './atomize.service'
import { buildAtomizeSystem } from './prompts'
import { KbBrainProfileService } from './profile.service'
import { KbBookPassesService } from './book-passes.service'
import { parseBrainConfig, parseBrainState, stringifyBrainState, type KbBrainConfig } from './brain-config'
import { tokenizeForIndex } from '@core/platform/services/kb-tokenize'
import { buildLensPassSystem } from './prompts'
import { defaultBrainLlm, parseModelRef, type BrainLlmFn } from './llm'

const logger = createLogger('KbBrainDigest')

/** 消化进度事件通道（preload 订阅照 kb:document-progress 先例，T12 接线） */
export const BRAIN_EVENTS = {
  PROGRESS: 'kb:brain:progress',
  STATUS: 'kb:brain:status',
} as const

/** 章级候选裁决上限（超过截断——防止单次调用膨胀） */
const ADJUDICATE_CANDIDATE_CAP = 60

/** 实体负面清单（服务端硬过滤一道；prompt 内已有软约束） */
const MENTION_BLOCKLIST = new Set([
  '他', '她', '它', '他们', '她们', '它们', '我', '你', '我们', '你们',
  '这', '那', '这个', '那个', '这些', '那些', '自己', '大家', '别人', '有人',
  '爸爸', '妈妈', '爹', '娘', '父亲', '母亲', '哥哥', '姐姐', '弟弟', '妹妹',
])

/** 章级基础遍产出的统计（落台账 stats_json） */
interface PassStats {
  [k: string]: number
  atoms: number
  merged: number
  superseded: number
  suspected: number
  entities: number
  edges: number
  vectorsFailed: number
  costCalls: number
}

/** 仓储访问集（repos() 的返回形态，供内部方法签名引用） */
export interface KbBrainRepos {
  atoms: KbAtomRepository
  entities: KbEntityRepository
  notes: KbNoteRepository
  edges: KbKnowledgeEdgeRepository
  passes: KbDigestPassRepository
  docs: KbDocumentRepository
  chapters: KbChapterRepository
  kbs: KnowledgeBaseRepository
  /** chunk 仓储（T11 重链用；未装配则跳过重链） */
  chunks: KbChunkRepository | null
  vectors: { createBatch(rows: Array<{ chunkId: string; knowledgeBaseId: string; vector: number[] }>): Promise<void> } | null
  inverted: { insertBatch(rows: Array<{ term: string; chunkId: string; knowledgeBaseId: string; termFrequency: number }>): Promise<void> } | null
}

export interface KbBrainDigestDeps {
  /** 注入假 LLM（测试）；生产走 defaultBrainLlm */
  llm?: BrainLlmFn
  /** 注入假嵌入（测试）；生产用 KnowledgeBaseService.getEmbeddingVectors 绑定 */
  embed?: (texts: string[], kb: { id: string; embeddingConfig: string | null }) => Promise<number[][] | null>
  /** 覆盖仓储来源（测试传内存库组装的仓储集；生产 getCoreDatabaseManager） */
  repos?: () => KbBrainRepos | null
}

export class KbBrainDigestService {
  private readonly llm: BrainLlmFn
  private readonly embedFn: NonNullable<KbBrainDigestDeps['embed']>
  private readonly reposFn: NonNullable<KbBrainDigestDeps['repos']>
  /** 文档任务串行队列（并发=1） */
  private chain: Promise<void> = Promise.resolve()

  private readonly adjudicateLlm: BrainLlmFn

  constructor(deps: KbBrainDigestDeps = {}) {
    this.llm = deps.llm ?? defaultBrainLlm('kb-brain-atomize')
    // 裁决走独立档位（KB_ADJUDICATE_MODEL env 路由）；测试注入 deps.llm 时同步复用
    this.adjudicateLlm = deps.llm ?? defaultBrainLlm('kb-brain-adjudicate')
    this.embedFn = deps.embed ?? (async () => null)
    this.reposFn =
      deps.repos ??
      ((): KbBrainRepos | null => {
        const db = getCoreDatabaseManager()
        if (!db.kbAtoms || !db.kbBrainEntities || !db.kbKnowledgeEdges || !db.kbDigestPasses || !db.kbDocuments || !db.kbChapters || !db.knowledgeBases || !db.kbNotes) {
          return null
        }
        return {
          atoms: db.kbAtoms,
          entities: db.kbBrainEntities,
          notes: db.kbNotes,
          edges: db.kbKnowledgeEdges,
          passes: db.kbDigestPasses,
          docs: db.kbDocuments,
          chapters: db.kbChapters,
          kbs: db.knowledgeBases,
          chunks: db.kbChunks,
          vectors: db.kbVectors,
          inverted: db.kbInvertedIndex,
        }
      })
  }

  /* ==================== 域事件接入 ==================== */

  /** 事件回调入口（域事件总线 → 串行队列；userId 在回调现场同步捕获） */
  onDomainEvent(event: DomainEvent): void {
    if (event.name !== WORKFLOW_EVENT_NAMES.kbDocumentCompleted) return
    const documentId = String(event.payload?.documentId ?? '')
    if (!documentId) return
    this.enqueueDocument(documentId, event.userId).catch((e) =>
      logger.warn(`[kb-brain] 消化任务失败 doc=${documentId}: ${e instanceof Error ? e.message : String(e)}`),
    )
  }

  /** 入队（串行）；返回队列尾 promise 供测试等待 */
  enqueueDocument(documentId: string, userId: string | null): Promise<void> {
    const task = this.chain.then(() =>
      runWithUserAsync(userId ?? LOCAL_DEFAULT_USER_ID, () => this.digestDocument(documentId)),
    )
    // 链上吞错（单文档失败不阻断后续），但通过 digestDocument 内部 catch 上报
    this.chain = task.catch(() => {})
    return task
  }

  /** 手动重试入口用：某文档耗尽的章级台账复位 pending（人工意图明确才复活） */
  async reviveExhaustedChapters(documentId: string): Promise<number> {
    const repos = this.reposFn()
    if (!repos) return 0
    return repos.passes.reviveExhaustedForDocument(documentId)
  }

  /** 启动恢复：pending / 僵死 running 的章级台账 → 重新触发所属文档（幂等由台账保证） */
  async recover(): Promise<void> {
    const repos = this.reposFn()
    if (!repos) return
    // 多租户（L7 修复）：跨租户扫描（最小字段）+ 按行携带的 userId 分组重放，不再固定 LOCAL 用户
    const stale = await repos.passes.recoverPendingAllUsers()
    for (const p of stale) {
      if (p.status === 'running') await repos.passes.resetToPending(p.id)
    }
    const byUser = new Map<string, Set<string>>()
    for (const p of stale) {
      const uid = p.userId ?? LOCAL_DEFAULT_USER_ID
      if (!byUser.has(uid)) byUser.set(uid, new Set())
      byUser.get(uid)!.add(p.documentId)
    }
    for (const [uid, docIds] of byUser) {
      for (const docId of docIds) {
        logger.info(`[kb-brain] 恢复消化: doc=${docId} user=${uid}`)
        this.enqueueDocument(docId, uid).catch((e) =>
          logger.warn(`[kb-brain] 恢复任务失败 doc=${docId}: ${e instanceof Error ? e.message : String(e)}`),
        )
      }
    }
  }

  /* ==================== 文档级编排 ==================== */

  async digestDocument(documentId: string): Promise<void> {
    const repos = this.reposFn()
    if (!repos) return
    const { atoms, docs, chapters, kbs, passes } = repos

    const docRow = await docs.findById(documentId)
    if (!docRow) return
    const kbId = docRow.knowledgeBaseId
    const kb = await kbs.findById(kbId)
    if (!kb) return

    const cfg = safeParseConfig(kb.brainConfig)
    if (!cfg?.enabled || !cfg.digestion.enabled) {
      await docs.updateBrainStatus(documentId, { status: 'skipped' })
      return
    }
    if (cfg.digestion.scopeDocumentIds?.length && !cfg.digestion.scopeDocumentIds.includes(documentId)) {
      await docs.updateBrainStatus(documentId, { status: 'skipped' })
      return
    }

    // 内容画像（§类型化提取）：非空画像直接用；未识别→采样自动检测并写回 brainConfig.profile。
    // fail-soft：检测失败回落「未识别」，走缺省提取提示词，绝不阻塞消化。
    let workingCfg = cfg
    try {
      const profiler = new KbBrainProfileService({ llm: this.adjudicateLlm, repos: () => ({ chapters: repos.chapters, kbs: repos.kbs }) })
      const profile = await profiler.ensureProfile(kbId, documentId, cfg)
      if (profile.contentType) workingCfg = { ...cfg, profile }
    } catch (e) {
      logger.warn(`[kb-brain] 画像检测失败（不阻塞）: ${e instanceof Error ? e.message : String(e)}`)
    }

    // 成本熔断（§12）：KB_BRAIN_DAILY_COST_LIMIT=单库当日 LLM 调用次数上限（calls 口径近似成本；
    // token/金额口径待 provider usage 回填后升级）。缺省/非法 = 不限。
    const rawLimit = process.env.KB_BRAIN_DAILY_COST_LIMIT
    const costLimit = Number(rawLimit ?? '')
    if (rawLimit && !Number.isFinite(costLimit)) {
      logger.warn(`[kb-brain] KB_BRAIN_DAILY_COST_LIMIT 非法值 '${rawLimit}'，熔断禁用`)
    }
    if (Number.isFinite(costLimit) && costLimit > 0) {
      const since = new Date()
      since.setHours(0, 0, 0, 0)
      const today = await passes.costByKb(kbId, since)
      if (today.calls > costLimit) {
        logger.warn(`[kb-brain] 成本熔断: kb=${kbId} 今日 ${today.calls} 次 > 限额 ${costLimit}，暂停消化`)
        await docs.updateBrainStatus(documentId, { status: 'failed', error: `成本熔断（今日 ${today.calls} 次）` })
        return
      }
    }

    await docs.updateBrainStatus(documentId, { status: 'digesting', progress: 0 })
    this.emitStatus(documentId, 'digesting')

    try {
      const chapterRows = await chapters.findByDocument(documentId)
      let done = 0
      const exhaustedChapters: string[] = []
      const skippedSameChapters: Array<{ id: string; hash: string | null }> = []
      const insertedThisRun: KbAtomInput[] = []
      let busyChapters = 0
      for (const chapter of chapterRows) {
        const { outcome, inserted } = await this.digestChapter(kbId, documentId, chapter.id, chapter.title, chapter.content ?? '', chapter.contentHash, workingCfg)
        insertedThisRun.push(...inserted)
        if (outcome === 'exhausted') exhaustedChapters.push(chapter.id)
        else if (outcome === 'skipped-same') skippedSameChapters.push({ id: chapter.id, hash: chapter.contentHash })
        else if (outcome === 'busy') busyChapters++
        done++
        const progress = Math.round((done / Math.max(1, chapterRows.length)) * 95)
        await docs.updateBrainStatus(documentId, { status: 'digesting', progress })
        this.emitProgress(documentId, 'base', progress)
      }
      if (exhaustedChapters.length > 0) {
        // 重试耗尽的章不能谎报 digested（F3）：标 failed 留 error 线索，可人工重触发
        await docs.updateBrainStatus(documentId, {
          status: 'failed',
          progress: 100,
          error: `章节重试耗尽: ${exhaustedChapters.slice(0, 5).join(',')}`,
        })
        this.emitStatus(documentId, 'failed', '章节重试耗尽')
        return
      }
      if (busyChapters > 0) {
        logger.warn(`[kb-brain] doc=${documentId} 有 ${busyChapters} 章在并发运行中被跳过（瞬态）`)
      }

      // T11 重链：本轮 skip（内容未变）的章，论断按「章全局偏移+章内偏移」落进新 chunk 区间
      await this.relinkChunksForUnchanged(documentId, atoms, repos, skippedSameChapters)

      await this.staleUncovered(documentId, atoms, chapterRows.map((c) => c.contentHash).filter(Boolean) as string[])

      await docs.updateBrainStatus(documentId, { status: 'digesting', progress: 96 })

      // T13a 实体摘要演化（fail-soft，不阻塞状态流转）
      try {
        const summarizer = new KbEntitySummaryService({
          llm: this.llm,
          embed: this.embedFn,
          repos: () => ({ entities: repos.entities, atoms: repos.atoms, vectors: repos.vectors, inverted: repos.inverted }),
        })
        const embCfg = await this.kbEmbeddingConfig(kbId)
        const sum = await summarizer.summarizePending(kbId, embCfg, 20)
        if (sum.done > 0) logger.info(`[kb-brain] 实体摘要: kb=${kbId} done=${sum.done} failed=${sum.failed}`)
      } catch (e) {
        logger.warn(`[kb-brain] 实体摘要调度失败（不阻塞）: ${e instanceof Error ? e.message : String(e)}`)
      }

      // T14 重要性账户（§6.2）：按本轮实际落库论断计分，超阈值直接提炼
      await this.accrueImportance(kbId, repos, insertedThisRun)

      // T15 视角遍：runLensPasses 内 ensurePass 幂等入队+执行（schedule 独立遍是冗余双查，已删）
      await this.runLensPasses(kbId, documentId, repos, workingCfg)

      // 书级汇总遍（§流程化提取）：画像驱动关卡（概要/设定索引/人物册/伏笔台账/知识体系图），
      // 台账幂等（章节指纹），单遍 fail-soft。默认开（digestion.bookPasses），失败不挡 digested 终态。
      if (workingCfg.digestion.bookPasses !== false) {
        await docs.updateBrainStatus(documentId, { status: 'digesting', progress: 97 })
        this.emitProgress(documentId, 'book', 97)
        try {
          const bookPasses = new KbBookPassesService({ llm: this.adjudicateLlm, repos: () => repos })
          await bookPasses.runForDocument(kbId, documentId, workingCfg.profile?.contentType ?? '')
        } catch (e) {
          logger.warn(`[kb-brain] 书级汇总遍失败（不阻塞）: ${e instanceof Error ? e.message : String(e)}`)
        }
      }

      await docs.updateBrainStatus(documentId, { status: 'digested', progress: 100, error: null })
      this.emitStatus(documentId, 'digested')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      logger.warn(`[kb-brain] 消化失败 doc=${documentId}: ${msg}`)
      await docs.updateBrainStatus(documentId, { status: 'failed', error: msg.slice(0, 300) })
      this.emitStatus(documentId, 'failed', msg)
    }
  }

  /** 章级基础遍：台账幂等 → 原子化 → 实体 → 裁决 → 入池。
   *  'digested'=本轮真跑 | 'skipped-same'=同 hash 跳过 | 'busy'=并发运行中 | 'exhausted'=重试耗尽 */
  async digestChapter(
    kbId: string,
    documentId: string,
    chapterId: string,
    chapterTitle: string,
    content: string,
    chapterHash: string | null,
    cfg: KbBrainConfig,
  ): Promise<{ outcome: 'digested' | 'skipped-same' | 'busy' | 'exhausted'; inserted: KbAtomInput[] }> {
    const repos = this.reposFn()
    if (!repos) return { outcome: 'skipped-same', inserted: [] }
    const { atoms, entities, edges, passes } = repos

    const decision = await passes.ensurePass({
      knowledgeBaseId: kbId,
      documentId,
      chapterId,
      passType: 'base',
      passKey: 'base',
      chapterHash,
    })
    if (decision.action === 'skip') {
      // 三态可辨（review：'running' 是瞬态，与真耗尽不同质，不可同标 failed）
      const outcome = decision.reason === 'done-same-hash' ? 'skipped-same' : decision.reason === 'running' ? 'busy' : 'exhausted'
      return { outcome, inserted: [] }
    }
    const pass = decision.pass
    await passes.setRunning(pass.id)

    const stats: PassStats = { atoms: 0, merged: 0, superseded: 0, suspected: 0, entities: 0, edges: 0, vectorsFailed: 0, costCalls: 0 }
    try {
      if (!content.trim()) {
        // 零产出是合法终态（纯过场章）——台账 done 防重复跑
        await passes.setDone(pass.id, stats, { calls: 0, tokensIn: 0, tokensOut: 0 })
        return { outcome: 'digested', inserted: [] }
      }

      // 1. 原子化（低档；已知实体名作为挂点规范名提示；按内容画像选提取提示词变体）
      const existingNames = await this.knownEntityNames(kbId, entities)
      const atomizer = new AtomizeService({
        llm: this.llm,
        systemOverride: buildAtomizeSystem(cfg.profile?.contentType),
        modelOverride: () => (cfg.models.atomize ? parseModelRef(cfg.models.atomize) : {}),
      })
      const result = await atomizer.atomizeChapter({
        chapterTitle,
        chapterContent: content,
        knownEntityNames: existingNames,
      })
      stats.costCalls += 1

      // 2. 实体解析（P-2 语义并入 P-1 mentions）：负面清单过滤 → upsert（类型来自 mentions，缺省 concept）
      const mentionTypeByName = new Map<string, string>()
      for (const m of result.mentions ?? []) {
        if (m.name?.trim() && m.type?.trim()) mentionTypeByName.set(m.name.trim(), m.type.trim())
      }
      const mentionCache = new Map<string, string | null>()
      const resolveEntity = async (mention: string | undefined): Promise<string | null> => {
        if (!mention) return null
        const name = mention.trim()
        if (!name || name.length < 2 || MENTION_BLOCKLIST.has(name)) return null
        if (mentionCache.has(name)) return mentionCache.get(name)!
        const ent = await entities.upsertMention(kbId, { name, type: mentionTypeByName.get(name) ?? 'concept' })
        stats.entities += 1
        mentionCache.set(name, ent.id)
        return ent.id
      }

      // 3. 裁决（公共层）：候选 = 本批涉及实体的现存公共层论断
      const atomInputs: KbAtomInput[] = []
      for (const a of result.atoms) {
        atomInputs.push({
          knowledgeBaseId: kbId,
          // 长度护栏：语句放开篇幅后防跑飞——嵌入模型输入普遍 ~512 token，超长被静默截断稀释检索
          statement: a.statement.slice(0, 600),
          type: (isValidType(a.type) ? a.type : 'fact'),
          layer: (isValidLayer(a.layer) ? a.layer : 'detail'),
          certainty: a.certainty,
          sourceDocumentId: documentId,
          sourceChapterId: chapterId,
          sourceChapterHash: chapterHash,
          sourceQuote: a.quote.slice(0, 200),
          startOffset: a.startOffset,
          endOffset: a.endOffset,
          validFrom: a.validFrom,
          validUntil: a.validUntil,
          extractionPass: 'base#1',
          origin: 'ai',
        })
      }
      const entityIdsForCandidates = new Set<string>()
      for (const a of result.atoms) {
        const s = await resolveEntity(a.subject)
        const o = await resolveEntity(a.object)
        if (s) entityIdsForCandidates.add(s)
        if (o) entityIdsForCandidates.add(o)
      }
      const candidates = entityIdsForCandidates.size
        ? await atoms.findByEntities(kbId, [...entityIdsForCandidates], { lensNoteId: null, statuses: ['supported', 'suspected', 'superseded'] })
        : []
      const capped = candidates.slice(0, ADJUDICATE_CANDIDATE_CAP)

      // 4. 裁决过滤 → 开新 → 关旧（带血缘）。失败方向安全：先落新再关旧，
      // 中途崩溃只可能"新已入库旧未关"（下轮裁决按 duplicate 合并），不会丢知识。
      // 过滤 duplicates + 同批内 statement 去重；keptIdx 记录保留项的原下标（顺序对位用）
      const keptIdx: number[] = []
      let verdict: Awaited<ReturnType<AdjudicateService['adjudicate']>> | null = null
      if (capped.length > 0 && atomInputs.length > 0) {
        const judge = new AdjudicateService({
          llm: this.adjudicateLlm,
          modelOverride: () => (cfg.models.adjudicate ? parseModelRef(cfg.models.adjudicate) : {}),
        })
        verdict = await judge.adjudicate({
          newItems: atomInputs.map((a, i) => ({ idx: i, statement: a.statement })),
          existingItems: capped.map((c, i) => ({ idx: i, statement: c.statement, status: c.status })),
        })
        stats.costCalls += 1
        const dupNew = new Set(verdict.duplicates.map((d) => d.newIdx))
        // duplicates：语义等同 → 使用信号归并到旧条（Graphiti 协议）
        const dupOldIds = verdict.duplicates.map((d) => capped[d.oldIdx].id)
        if (dupOldIds.length > 0) await atoms.incUse(dupOldIds)
        stats.merged = dupNew.size
        const seen = new Set<string>()
        atomInputs.forEach((inp, i) => {
          if (dupNew.has(i)) return
          if (seen.has(inp.statement)) return
          seen.add(inp.statement)
          keptIdx.push(i)
        })
      } else {
        atomInputs.forEach((_, i) => keptIdx.push(i))
      }
      const keptInputs = keptIdx.map((i) => atomInputs[i])

      const inserted = keptInputs.length > 0 ? await atoms.createBatch(keptInputs) : []
      stats.atoms = inserted.length
      // 顺序对位：keptInputs[j] ↔ inserted[j]（createBatch 保序）——不依赖 statement 文本
      const newIdByOrigIdx = new Map<number, string>()
      keptIdx.forEach((origIdx, j) => {
        const id = inserted[j]?.id
        if (id) newIdByOrigIdx.set(origIdx, id)
      })

      if (verdict) {
        for (const c of verdict.contradictions) {
          if (c.severity === 'update') {
            await atoms.updateStatus(capped[c.oldIdx].id, {
              status: 'superseded',
              supersededByAtomId: newIdByOrigIdx.get(c.newIdx),
            })
          } else {
            await atoms.updateStatus(capped[c.oldIdx].id, { status: 'suspected' })
          }
        }
        stats.superseded = verdict.contradictions.filter((c) => c.severity === 'update').length
        stats.suspected = verdict.contradictions.filter((c) => c.severity === 'conflict').length
      }

      // 4.5 autoApproveThreshold（§3.3）：低置信论断标记 suspected 待人审，不无门槛入池
      {
        const threshold = cfg.autoApproveThreshold
        for (let j = 0; j < keptInputs.length; j++) {
          const cert = keptInputs[j].certainty ?? 0.8
          const id = inserted[j]?.id
          if (id && cert < threshold) {
            await atoms.updateStatus(id, { status: 'suspected' })
            stats.suspected += 1
          }
        }
      }

      // 4.6 实体挂点回填（顺序对位）
      for (let j = 0; j < keptIdx.length; j++) {
        const a = result.atoms[keptIdx[j]]
        const targetId = inserted[j]?.id
        if (!a || !targetId) continue
        const sid = await resolveEntity(a.subject)
        const oid = await resolveEntity(a.object)
        if (sid || oid) {
          await atoms.relinkEntity(targetId, sid, oid)
        }
      }
      // statement → 原下标（事件边用；同文取首见——同文已在同批去重，唯一）
      const statementToOrigIdx = new Map<string, number>()
      result.atoms.forEach((a, i) => {
        if (!statementToOrigIdx.has(a.statement)) statementToOrigIdx.set(a.statement, i)
      })
      const statementToId = new Map<string, string>()
      for (const [stmt, origIdx] of statementToOrigIdx) {
        const id = newIdByOrigIdx.get(origIdx)
        if (id) statementToId.set(stmt, id)
      }

      // 5. 入池：向量（失败不阻塞——可补建）+ 倒排
      if (inserted.length > 0) {
        const texts = inserted.map((r) => r.statement)
        const vectors = await this.embedFn(texts, { id: kbId, embeddingConfig: await this.kbEmbeddingConfig(kbId) })
        if (vectors && vectors.length === inserted.length && repos.vectors) {
          await repos.vectors.createBatch(
            vectors.map((vector, i) => ({ chunkId: `atom:${inserted[i].id}`, knowledgeBaseId: kbId, vector })),
          )
        } else {
          stats.vectorsFailed = inserted.length
        }
        const rows = inserted.flatMap((r) => {
          const terms = new Map<string, number>()
          for (const t of tokenizeForIndex(r.statement)) terms.set(t, (terms.get(t) ?? 0) + 1)
          return [...terms.entries()].map(([term, tf]) => ({ term, chunkId: `atom:${r.id}`, knowledgeBaseId: kbId, termFrequency: tf }))
        })
        if (repos.inverted && rows.length > 0) await repos.inverted.insertBatch(rows)
      }

      // 6. leads-to 事件边（statement 对 → 落库 atom 对）
      const edgeRows = result.events
        .map((ev) => {
          const from = statementToId.get(ev.fromStatement ?? '')
          const to = statementToId.get(ev.toStatement ?? '')
          if (!from || !to) return null
          return {
            sourceKind: 'atom' as const,
            sourceId: from,
            relation: 'leads-to' as const,
            targetKind: 'atom' as const,
            targetId: to,
            evidence: ev.evidence,
          }
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
      if (edgeRows.length > 0) {
        const r = await edges.createBatch(kbId, edgeRows)
        stats.edges = r.created
      }

      await passes.setDone(pass.id, stats, { calls: stats.costCalls, tokensIn: 0, tokensOut: 0 })
      return { outcome: 'digested', inserted: keptInputs }
    } catch (e) {
      await passes.setFailed(pass.id, e instanceof Error ? e.message : String(e))
      throw e
    }
  }

  /** mention → 实体 id（负面清单+类型+缓存；基础遍与视角遍共用） */
  private async resolveEntityId(
    kbId: string,
    mention: string | undefined,
    repos: KbBrainRepos,
    typeByName: Map<string, string>,
    cache?: Map<string, string | null>,
  ): Promise<string | null> {
    if (!mention) return null
    const name = mention.trim()
    if (!name || name.length < 2 || MENTION_BLOCKLIST.has(name)) return null
    if (cache?.has(name)) return cache.get(name)!
    const ent = await repos.entities.upsertMention(kbId, { name, type: typeByName.get(name) ?? 'concept' })
    cache?.set(name, ent.id)
    return ent.id
  }

  /**
   * T11 重链（D5）：内容未变的章（台账 done 同 hash 跳过），其论断的 sourceChunkId
   * 仍指向 reprocess 重建前的旧 chunk——按 offsets 落进新 chunk 区间并回写。
   */
  private async relinkChunksForUnchanged(
    documentId: string,
    atoms: KbAtomRepository,
    repos: KbBrainRepos,
    skippedSame: Array<{ id: string; hash: string | null }>,
  ): Promise<void> {
    if (!repos.chunks || skippedSame.length === 0) return
    const chapterRows = await repos.chapters.findByDocument(documentId)
    const chapterById = new Map(chapterRows.map((c) => [c.id, c]))
    const chunks = await repos.chunks.findByDocumentId(documentId)
    if (chunks.length === 0) return
    for (const { id: chapterId, hash } of skippedSame) {
      if (!hash) continue
      // 坐标系修正（盲审 P1）：论断 offset 是章内相对，chunk offset 是文档全局——
      // 用章节的文档全局 startOffset 平移后再匹配
      const chapter = chapterById.get(chapterId)
      const chapterDocStart = chapter?.startOffset ?? 0
      // 同 hash 多章防串（盲审）：按 sourceChapterId 收窄到本章
      const chapterAtoms = (await atoms.findByChapterHash(documentId, hash)).filter((a) => a.sourceChapterId === chapterId)
      for (const a of chapterAtoms) {
        if (a.startOffset == null || a.endOffset == null) continue
        const docStart = chapterDocStart + a.startOffset
        const docEnd = chapterDocStart + a.endOffset
        const target = chunks.find(
          (c) => c.startOffset != null && c.endOffset != null && docStart >= c.startOffset && docEnd <= c.endOffset,
        )
        if (target && target.id !== a.sourceChunkId) {
          await atoms.relinkChunk(a.id, target.id)
        }
      }
    }
  }

  /** stale 兜底（D2/D5）：base 论断的章节 hash 不在当前章节集合内 → 失去出处（chunk 重链 M2 补） */
  private async staleUncovered(
    documentId: string,
    atoms: KbAtomRepository,
    currentHashes: string[],
  ): Promise<void> {
    const live = await atoms.findByDocument(documentId, { status: ['supported', 'suspected'] })
    const hashSet = new Set(currentHashes)
    for (const a of live) {
      if (a.extractionPass.startsWith('human')) continue // 用户观感不随 reprocess 失效
      if (a.extractionPass.startsWith('lens:')) continue // 视角遍产物由视角遍生命周期管理
      // hash 不在当前章节集（含 hash 为 null 的失锚论断）→ 失去出处，防幽灵
      if (!a.sourceChapterHash || !hashSet.has(a.sourceChapterHash)) {
        await atoms.updateStatus(a.id, { status: 'stale' })
      }
    }
  }

  /** T15 视角遍执行：pending 的 lens 台账章 → 视角卡透镜重萃取（观感论断，分域入库） */
  private async runLensPasses(kbId: string, documentId: string, repos: KbBrainRepos, cfg: KbBrainConfig): Promise<void> {
    if (!cfg.lenses.enabledLensNoteIds.length) return
    const lensIds = cfg.lenses.enabledLensNoteIds
    const lensCards = await repos.notes.findByIds(lensIds)
    const attentionByLens = new Map<string, { title: string; attendTo: string[]; questions: string[]; version: number }>()
    for (const card of lensCards) {
      if (card.type !== 'lens' || card.status !== 'published') continue
      try {
        const att = JSON.parse(card.lensAttention ?? '{}') as { attendTo?: string[]; questions?: string[] }
        attentionByLens.set(card.id, {
          title: card.title,
          attendTo: att.attendTo ?? [],
          questions: att.questions ?? [],
          version: card.version,
        })
      } catch {
        continue
      }
    }
    if (attentionByLens.size === 0) return
    const chapterRows = await repos.chapters.findByDocument(documentId)
    const mentionCache = new Map<string, string | null>()
    for (const lensId of cfg.lenses.enabledLensNoteIds) {
      const lens = attentionByLens.get(lensId)
      if (!lens) continue // 视角卡缺失/未发布/格式坏——跳过该视角
      const lensAtomizer = new AtomizeService({
        llm: this.llm,
        systemOverride: buildLensPassSystem(lens),
      })
      for (const chapter of chapterRows) {
        const decision = await repos.passes.ensurePass({
          knowledgeBaseId: kbId,
          documentId,
          chapterId: chapter.id,
          passType: 'lens',
          passKey: `lens:${lensId}:v${lens.version}`,
          chapterHash: chapter.contentHash,
        })
        if (decision.action === 'skip') continue
        // 生命周期（盲审修复）：重跑前把同章旧 hash 的 lens 旧观感置 stale，防 supported 无限堆积
        await repos.atoms.staleLensAtoms(documentId, lensId, chapter.id, chapter.contentHash, `lens:${lensId}:v${lens.version}`)
        const pass = decision.pass
        await repos.passes.setRunning(pass.id)
        const stats: PassStats = { atoms: 0, merged: 0, superseded: 0, suspected: 0, entities: 0, edges: 0, vectorsFailed: 0, costCalls: 1 }
        try {
          const content = chapter.content ?? ''
          if (!content.trim()) {
            await repos.passes.setDone(pass.id, stats, { calls: 0, tokensIn: 0, tokensOut: 0 })
            continue
          }
          const result = await lensAtomizer.atomizeChapter({ chapterTitle: chapter.title, chapterContent: content })
          // 观感论断：lensNoteId + extractionPass 标注；裁决天然分域（lensNoteId 域），不与公共层互裁
          const inputs: KbAtomInput[] = result.atoms.map((a) => ({
            knowledgeBaseId: kbId,
            statement: a.statement,
            type: isValidType(a.type) ? a.type : 'claim',
            certainty: a.certainty,
            sourceDocumentId: documentId,
            sourceChapterId: chapter.id,
            sourceChapterHash: chapter.contentHash,
            sourceQuote: a.quote.slice(0, 200),
            startOffset: a.startOffset,
            endOffset: a.endOffset,
            lensNoteId: lensId,
            extractionPass: `lens:${lensId}:v${lens.version}#1`,
            origin: 'ai',
          }))
          const inserted = inputs.length > 0 ? await repos.atoms.createBatch(inputs) : []
          stats.atoms = inserted.length
          // 实体挂点（同基础遍口径）
          const mentionTypeByName = new Map<string, string>()
          for (const m of result.mentions ?? []) mentionTypeByName.set(m.name.trim(), m.type.trim())
          for (let j = 0; j < result.atoms.length; j++) {
            const a = result.atoms[j]
            const sid = await this.resolveEntityId(kbId, a.subject, repos, mentionTypeByName, mentionCache)
            const oid = await this.resolveEntityId(kbId, a.object, repos, mentionTypeByName, mentionCache)
            if ((sid || oid) && inserted[j]) await repos.atoms.relinkEntity(inserted[j].id, sid, oid)
          }
          // 视角观感入池
          if (inserted.length > 0 && repos.vectors) {
            const vectors = await this.embedFn(inserted.map((r) => r.statement), { id: kbId, embeddingConfig: await this.kbEmbeddingConfig(kbId) })
            if (vectors && vectors.length === inserted.length) {
              await repos.vectors.createBatch(vectors.map((vector, i) => ({ chunkId: `atom:${inserted[i].id}`, knowledgeBaseId: kbId, vector })))
            } else {
              stats.vectorsFailed = inserted.length
            }
          }
          await repos.passes.setDone(pass.id, stats, { calls: 1, tokensIn: 0, tokensOut: 0 })
        } catch (e) {
          await repos.passes.setFailed(pass.id, e instanceof Error ? e.message : String(e))
          logger.warn(`[kb-brain] 视角遍失败 lens=${lensId} ch=${chapter.id}（不阻塞其他视角）`)
        }
      }
    }
  }

  /** T14 重要性账户：按本轮实际落库论断计分（无窗口重复计分；仅 ai 基础遍产物计分） */
  private async accrueImportance(kbId: string, repos: KbBrainRepos, insertedThisRun: KbAtomInput[]): Promise<void> {
    const kb = await repos.kbs.findById(kbId)
    if (!kb) return
    const cfg = safeParseConfig(kb.brainConfig)
    if (!cfg?.distillation.enabled) return
    const state = parseBrainState(kb.brainState)
    let gained = 0
    for (const a of insertedThisRun) {
      gained += a.type === 'method' || a.type === 'insight' ? 3 : a.type === 'open-question' ? 2 : a.type === 'claim' ? 1 : 0.2
    }
    if (gained <= 0) return
    const importance = state.importance + gained
    logger.info(`[kb-brain] 重要性账户: kb=${kbId} +${gained.toFixed(1)} = ${importance.toFixed(1)} / 阈值 ${cfg.distillation.importanceThreshold}`)
    if (importance >= cfg.distillation.importanceThreshold) {
      // 超阈值直接在队列内提炼（串行天然限流；台账借用方案是无消费方的死代码，废弃）
      logger.info(`[kb-brain] 重要性超阈值 → 执行提炼 kb=${kbId}`)
      try {
        const distiller = new KbDistillService({
          llm: this.adjudicateLlm,
          embed: this.embedFn,
          repos: () => ({ atoms: repos.atoms, notes: repos.notes, entities: repos.entities }),
          settingPatternEnabled: cfg.patterns.settingEnabled,
          modelOverride: () => (cfg.models.adjudicate ? parseModelRef(cfg.models.adjudicate) : {}),
        })
        const embCfg = await this.kbEmbeddingConfig(kbId)
        const out = await distiller.distill(kbId, embCfg)
        logger.info(`[kb-brain] 自动提炼完成: 提议=${out.cardsProposed} 簇=${out.clustersFormed}`)
      } catch (e) {
        logger.warn(`[kb-brain] 自动提炼失败（不阻塞）: ${e instanceof Error ? e.message : String(e)}`)
      }
      await repos.kbs.updateBrainState(kbId, stringifyBrainState({ ...state, importance: 0, lastDistillAt: new Date().toISOString() }))
    } else {
      await repos.kbs.updateBrainState(kbId, stringifyBrainState({ ...state, importance }))
    }
  }

  private async knownEntityNames(kbId: string, entities: KbEntityRepository): Promise<string[]> {
    // 全部 active 实体的规范名（pendingSummaries 会让摘要完成的实体退出词表——语义错位）
    return entities.listActiveNames(kbId, 200)
  }

  private async kbEmbeddingConfig(kbId: string): Promise<string | null> {
    const repos = this.reposFn()
    if (!repos) return null
    const kb = await repos.kbs.findById(kbId)
    return kb?.embeddingConfig ?? null
  }

  private emitProgress(documentId: string, phase: string, progress: number): void {
    try {
      getEventEmitter().emit(BRAIN_EVENTS.PROGRESS, { documentId, phase, progress })
    } catch {
      /* 事件失败不影响主流程 */
    }
  }

  private emitStatus(documentId: string, status: string, error?: string): void {
    try {
      getEventEmitter().emit(BRAIN_EVENTS.STATUS, { documentId, brainStatus: status, error })
    } catch {
      /* 事件失败不影响主流程 */
    }
  }
}

/* ==================== 生产装配（幂等安装） ==================== */

let installed = false

/** pack activate / boot 时调用：订阅域事件 + 启动恢复（幂等；旧库未装配则跳过） */
export function installKbBrainDigest(
  deps?: KbBrainDigestDeps & { kbService?: { getEmbeddingVectors(texts: string[], config: Record<string, unknown>): Promise<number[][] | null> } },
): void {
  if (installed) return
  const db = getCoreDatabaseManager()
  // 生产环境探活：仓储未装配（老库）→ 不安装，日志说明
  if (!deps?.repos && !db.kbAtoms) {
    logger.info('[kb-brain] kbAtoms 仓储未装配（旧库），消化流水线不启用')
    return
  }
  // 生产缺省：embed 绑定宿主 KB 服务的嵌入调用（否则向量入池恒失败，atom 只进倒排）
  const effective: KbBrainDigestDeps = { ...deps }
  if (!effective.embed) {
    const kbSvc = deps?.kbService
    if (kbSvc) {
      effective.embed = async (texts, kb) =>
        kbSvc.getEmbeddingVectors(texts, kb.embeddingConfig ? (JSON.parse(kb.embeddingConfig) as Record<string, unknown>) : {})
    }
  }
  const svc = new KbBrainDigestService(effective)
  activeService = svc
  installed = true
  // T17：装配通道注册（长文/学习/剧集三宿主消费大脑论断与卡片）
  import('./brain-provider').then(({ installKbBrainProvider }) => installKbBrainProvider())
  subscribeDomainEvents((event) => svc.onDomainEvent(event))
  void svc.recover().catch((e) => logger.warn(`[kb-brain] 启动恢复失败: ${e instanceof Error ? e.message : String(e)}`))
  // M4 代谢整固：Electron 挂机 interval（Web 多租户不启用——dl-pace 同款限制）
  if ((process.versions as Record<string, string | undefined>).electron) {
    import('./metabolize.service')
      .then(({ KbBrainMetabolizeService }) => new KbBrainMetabolizeService().start())
      .catch((e) => logger.warn(`[kb-brain] 代谢服务启动失败: ${e instanceof Error ? e.message : String(e)}`))
    // 后台自动化（提炼动作免手点）：开机延时 + 定时巡检，产物进待审提议人审
    import('./automation.service')
      .then(({ getKbBrainAutomationService }) => getKbBrainAutomationService().start())
      .catch((e) => logger.warn(`[kb-brain] 后台自动化启动失败: ${e instanceof Error ? e.message : String(e)}`))
  }
  logger.info('[kb-brain] 消化流水线已装配（kb:document-completed 订阅 + 台账恢复）')
}

/** 测试用：卸载安装标记 */
export function resetKbBrainDigestInstall(): void {
  installed = false
  activeService = null
}

let activeService: KbBrainDigestService | null = null

/**
 * 补消化入口（面板「提取知识」按钮）：对已上传（章节树已存在）的文档直接触发
 * 消化——开脑之前完成的文档不会再发 completed 事件，这是它们的补上车通道。
 * 未装配（旧库）/未启用时返回 false。
 * @param opts.revive 复活耗尽章（默认 true=手动重试语义；后台自动化按冷却自行控制传 false）
 */
export async function enqueueDigestForExisting(
  documentId: string,
  opts?: { revive?: boolean },
): Promise<boolean> {
  if (!activeService) return false
  const uid = getCurrentUserId()
  // 手动重试语义：耗尽章（attempts>=上限）复活，否则「提取知识」永远重不动失败章
  if (opts?.revive !== false) {
    const revived = await activeService.reviveExhaustedChapters(documentId)
    if (revived > 0) logger.info(`[kb-brain] 手动重试复活耗尽章: doc=${documentId} count=${revived}`)
  }
  activeService.enqueueDocument(documentId, uid)
  return true
}

/** 后台自动化用：冷却复活耗尽章（服务未装配返回 0） */
export async function reviveExhaustedFor(documentId: string): Promise<number> {
  if (!activeService) return 0
  return activeService.reviveExhaustedChapters(documentId)
}

/* ==================== 内部工具 ==================== */

function safeParseConfig(raw: string | null | undefined): KbBrainConfig | null {
  try {
    return parseBrainConfig(raw)
  } catch {
    return null // 配置损坏按关闭处理（写入侧已响亮失败，读取侧容错）
  }
}


function isValidType(t: string): t is KbAtomInput['type'] {
  return ['fact', 'claim', 'concept', 'method', 'insight', 'open-question'].includes(t)
}

function isValidLayer(t: string | undefined): t is KbAtomInput['layer'] {
  return !!t && ['outline', 'setting', 'describe', 'detail'].includes(t)
}
