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
import { getEventEmitter } from '@core/interfaces/event.interface'
import { runWithUserAsync, LOCAL_DEFAULT_USER_ID } from '@core/context/user-context'
import { subscribeDomainEvents, type DomainEvent } from '@core/platform/workflow/trigger/domain-event-bus'
import { WORKFLOW_EVENT_NAMES } from '@shared/types/workflow.types'
import { createLogger } from '@core/utils/logger'
import type { KbAtomRepository, KbAtomInput } from '@core/database/repositories/kb-atom.repository'
import type { KbEntityRepository } from '@core/database/repositories/kb-entity.repository'
import type { KbKnowledgeEdgeRepository } from '@core/database/repositories/kb-knowledge-edge.repository'
import type { KbDigestPassRepository } from '@core/database/repositories/kb-digest-pass.repository'
import type { KbDocumentRepository } from '@core/database/repositories/kb-document.repository'
import type { KbChapterRepository } from '@core/database/repositories/kb-chapter.repository'
import type { KnowledgeBaseRepository } from '@core/database/repositories/knowledge-base.repository'
import { AtomizeService, AdjudicateService } from './atomize.service'
import { parseBrainConfig, type KbBrainConfig } from './brain-config'
import { tokenizeForIndex } from '@core/platform/services/kb-tokenize'
import { defaultBrainLlm, type BrainLlmFn } from './llm'

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

export interface KbBrainDigestDeps {
  /** 注入假 LLM（测试）；生产走 defaultBrainLlm */
  llm?: BrainLlmFn
  /** 注入假嵌入（测试）；生产用 KnowledgeBaseService.getEmbeddingVectors 绑定 */
  embed?: (texts: string[], kb: { id: string; embeddingConfig: string | null }) => Promise<number[][] | null>
  /** 覆盖仓储来源（测试传内存库组装的仓储集；生产 getCoreDatabaseManager） */
  repos?: () => {
    atoms: KbAtomRepository
    entities: KbEntityRepository
    edges: KbKnowledgeEdgeRepository
    passes: KbDigestPassRepository
    docs: KbDocumentRepository
    chapters: KbChapterRepository
    kbs: KnowledgeBaseRepository
    /** 入池两端：向量存储与倒排索引（缺省/未装配 → 跳过对应入池，论断落库不受阻） */
    vectors: { createBatch(rows: Array<{ chunkId: string; knowledgeBaseId: string; vector: number[] }>): Promise<void> } | null
    inverted: { insertBatch(rows: Array<{ term: string; chunkId: string; knowledgeBaseId: string; termFrequency: number }>): Promise<void> } | null
  } | null
}

export class KbBrainDigestService {
  private readonly llm: BrainLlmFn
  private readonly embedFn: NonNullable<KbBrainDigestDeps['embed']>
  private readonly reposFn: NonNullable<KbBrainDigestDeps['repos']>
  /** 文档任务串行队列（并发=1） */
  private chain: Promise<void> = Promise.resolve()

  constructor(deps: KbBrainDigestDeps = {}) {
    this.llm = deps.llm ?? defaultBrainLlm('kb-brain-atomize')
    this.embedFn = deps.embed ?? (async () => null)
    this.reposFn =
      deps.repos ??
      (() => {
        const db = getCoreDatabaseManager()
        if (!db.kbAtoms || !db.kbBrainEntities || !db.kbKnowledgeEdges || !db.kbDigestPasses || !db.kbDocuments || !db.kbChapters || !db.knowledgeBases) {
          return null
        }
        return {
          atoms: db.kbAtoms,
          entities: db.kbBrainEntities,
          edges: db.kbKnowledgeEdges,
          passes: db.kbDigestPasses,
          docs: db.kbDocuments,
          chapters: db.kbChapters,
          kbs: db.knowledgeBases,
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
    void this.enqueueDocument(documentId, event.userId)
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

  /** 启动恢复：pending / 僵死 running 的章级台账 → 重新触发所属文档（幂等由台账保证） */
  async recover(): Promise<void> {
    const repos = this.reposFn()
    if (!repos) return
    const stale = await repos.passes.recoverPending()
    const docIds = [...new Set(stale.filter((p) => p.status === 'pending').map((p) => p.documentId))]
    for (const docId of docIds) {
      logger.info(`[kb-brain] 恢复消化: doc=${docId}`)
      this.enqueueDocument(docId, LOCAL_DEFAULT_USER_ID)
    }
  }

  /* ==================== 文档级编排 ==================== */

  async digestDocument(documentId: string): Promise<void> {
    const repos = this.reposFn()
    if (!repos) return
    const { atoms, docs, chapters, kbs } = repos

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

    await docs.updateBrainStatus(documentId, { status: 'digesting', progress: 0 })
    this.emitStatus(documentId, 'digesting')

    try {
      const chapterRows = await chapters.findByDocument(documentId)
      let done = 0
      for (const chapter of chapterRows) {
        await this.digestChapter(kbId, documentId, chapter.id, chapter.title, chapter.content ?? '', chapter.contentHash)
        done++
        const progress = Math.round((done / Math.max(1, chapterRows.length)) * 95)
        await docs.updateBrainStatus(documentId, { status: 'digesting', progress })
        this.emitProgress(documentId, 'base', progress)
      }

      await this.staleUncovered(documentId, atoms, chapterRows.map((c) => c.contentHash).filter(Boolean) as string[])

      await docs.updateBrainStatus(documentId, { status: 'digested', progress: 100, error: null })
      this.emitStatus(documentId, 'digested')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      logger.warn(`[kb-brain] 消化失败 doc=${documentId}: ${msg}`)
      await docs.updateBrainStatus(documentId, { status: 'failed', error: msg.slice(0, 300) })
      this.emitStatus(documentId, 'failed', msg)
    }
  }

  /** 章级基础遍：台账幂等 → 原子化 → 实体 → 裁决 → 入池 */
  async digestChapter(
    kbId: string,
    documentId: string,
    chapterId: string,
    chapterTitle: string,
    content: string,
    chapterHash: string | null,
  ): Promise<void> {
    const repos = this.reposFn()
    if (!repos) return
    const { atoms, entities, edges, passes } = repos

    const decision = await passes.ensurePass({
      knowledgeBaseId: kbId,
      documentId,
      chapterId,
      passType: 'base',
      passKey: 'base',
      chapterHash,
    })
    if (decision.action === 'skip') return
    const pass = decision.pass
    await passes.setRunning(pass.id)

    const stats: PassStats = { atoms: 0, merged: 0, superseded: 0, suspected: 0, entities: 0, edges: 0, vectorsFailed: 0, costCalls: 0 }
    try {
      if (!content.trim()) {
        // 零产出是合法终态（纯过场章）——台账 done 防重复跑
        await passes.setDone(pass.id, stats, { calls: 0, tokensIn: 0, tokensOut: 0 })
        return
      }

      // 1. 原子化（低档；已知实体名作为挂点规范名提示）
      const existingNames = await this.knownEntityNames(kbId, entities)
      const atomizer = new AtomizeService({ llm: this.llm })
      const result = await atomizer.atomizeChapter({
        chapterTitle,
        chapterContent: content,
        knownEntityNames: existingNames,
      })
      stats.costCalls += 1

      // 2. 实体解析：mention 负面清单过滤 → upsert（规范名/别名合并）
      const mentionCache = new Map<string, string | null>()
      const resolveEntity = async (mention: string | undefined): Promise<string | null> => {
        if (!mention) return null
        const name = mention.trim()
        if (!name || name.length < 2 || MENTION_BLOCKLIST.has(name)) return null
        if (mentionCache.has(name)) return mentionCache.get(name)!
        const ent = await entities.upsertMention(kbId, { name, type: 'concept' })
        stats.entities += 1
        mentionCache.set(name, ent.id)
        return ent.id
      }

      // 3. 裁决（公共层）：候选 = 本批涉及实体的现存公共层论断
      const atomInputs: KbAtomInput[] = []
      for (const a of result.atoms) {
        atomInputs.push({
          knowledgeBaseId: kbId,
          statement: a.statement,
          type: (isValidType(a.type) ? a.type : 'fact'),
          certainty: a.certainty,
          sourceDocumentId: documentId,
          sourceChapterId: chapterId,
          sourceChapterHash: chapterHash,
          sourceQuote: a.quote.slice(0, 200),
          startOffset: a.startOffset,
          endOffset: a.endOffset,
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
        ? await atoms.findByEntities(kbId, [...entityIdsForCandidates], { lensNoteId: null, statuses: ['supported', 'suspected'] })
        : []
      const capped = candidates.slice(0, ADJUDICATE_CANDIDATE_CAP)

      let keptInputs = atomInputs
      if (capped.length > 0 && atomInputs.length > 0) {
        const judge = new AdjudicateService({ llm: this.llm })
        const verdict = await judge.adjudicate({
          newItems: atomInputs.map((a, i) => ({ idx: i, statement: a.statement })),
          existingItems: capped.map((c, i) => ({ idx: i, statement: c.statement, status: c.status })),
        })
        stats.costCalls += 1
        const dupNew = new Set(verdict.duplicates.map((d) => d.newIdx))
        const conflictOld = new Set(verdict.contradictions.filter((c) => c.severity === 'conflict').map((c) => c.oldIdx))
        const updateOld = new Set(verdict.contradictions.filter((c) => c.severity === 'update').map((c) => c.oldIdx))
        keptInputs = atomInputs.filter((_, i) => !dupNew.has(i))
        stats.merged = dupNew.size
        // 关旧开新（裁决与写入同批次——飞轮教训：永不裸 ADD）
        for (const oldIdx of updateOld) await atoms.updateStatus(capped[oldIdx].id, { status: 'superseded' })
        stats.superseded = updateOld.size
        for (const oldIdx of conflictOld) await atoms.updateStatus(capped[oldIdx].id, { status: 'suspected' })
        stats.suspected = conflictOld.size
      }

      // 4. 落库新论断 + 实体挂点
      const inserted = keptInputs.length > 0 ? await atoms.createBatch(keptInputs) : []
      stats.atoms = inserted.length
      // 挂点回填（createBatch 后按 statement 对位）
      const statementToId = new Map(inserted.map((r) => [r.statement, r.id]))
      const idByInputIdx = new Map<number, string>()
      keptInputs.forEach((inp, i) => {
        const id = statementToId.get(inp.statement)
        if (id) idByInputIdx.set(i, id)
      })
      for (const a of result.atoms) {
        const sid = await resolveEntity(a.subject)
        const oid = await resolveEntity(a.object)
        const targetId = idByInputIdx.get(atomInputs.findIndex((inp) => inp.statement === a.statement))
        if (!targetId) continue
        if (sid || oid) {
          await atoms.relinkEntity(targetId, sid, oid)
        }
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
          return [...terms.entries()].map(([term, tf]) => ({ term, chunkId: r.id, knowledgeBaseId: kbId, termFrequency: tf }))
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
    } catch (e) {
      await passes.setFailed(pass.id, e instanceof Error ? e.message : String(e))
      throw e
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
      if (a.sourceChapterHash && !hashSet.has(a.sourceChapterHash)) {
        await atoms.updateStatus(a.id, { status: 'stale' })
      }
    }
  }

  private async knownEntityNames(kbId: string, entities: KbEntityRepository): Promise<string[]> {
    const pending = await entities.pendingSummaries(kbId, 50)
    return pending.map((e) => e.name)
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
export function installKbBrainDigest(deps?: KbBrainDigestDeps): void {
  if (installed) return
  const svc = new KbBrainDigestService(deps)
  // 生产环境探活：仓储未装配（老库）→ 不安装，日志说明
  if (!deps?.repos) {
    const db = getCoreDatabaseManager()
    if (!db.kbAtoms) {
      logger.info('[kb-brain] kbAtoms 仓储未装配（旧库），消化流水线不启用')
      return
    }
  }
  installed = true
  subscribeDomainEvents((event) => svc.onDomainEvent(event))
  void svc.recover().catch((e) => logger.warn(`[kb-brain] 启动恢复失败: ${e instanceof Error ? e.message : String(e)}`))
  logger.info('[kb-brain] 消化流水线已装配（kb:document-completed 订阅 + 台账恢复）')
}

/** 测试用：卸载安装标记 */
export function resetKbBrainDigestInstall(): void {
  installed = false
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
