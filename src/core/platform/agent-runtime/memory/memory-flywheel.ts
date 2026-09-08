/**
 * 知识飞轮服务（26 号 M3 批4 / 01 号 §4）
 * @module core/platform/agent-runtime/memory/memory-flywheel
 *
 * 闭环：任务 succeeded → distiller 从轨迹蒸馏候选（pending_review）→ 闸门
 * （查重 + 置信度 + 默认人工批准）→ active → 读取装配进 agent-loop 上下文
 * （system prompt「相关经验」段 + 轨迹 memoryRefs 可见引用）→ use_count/
 * success_count 回写（哪类做法能通过验收是最有价值的记忆——01 号 §6.4）。
 *
 * 闸门纪律（宁可慢不可脏，01 号 §M3 风险）：蒸馏产出一律 pending_review；
 * confidence < CONFIDENCE_GATE 直接丢弃；查重（canonicalKey 精确 + 关键词
 * 重叠率）命中既有 active 条目则跳过。
 * 向量层：embedding_id 为 LanceDB 复用位（01 号 §4.4）；M3 最小闭环用
 * 关键词匹配，向量检索随真实需求接线。
 */

import { randomUUID } from 'crypto'
import { createLogger } from '@core/utils/logger'
import { getCurrentUserId } from '@core/context/user-context'
import { stableStringify } from '@core/platform/agent-runtime/runtime/approval'
import type { AgentMemoryEntryRepository, AgentMemoryEntryRow, MemoryEntryKind } from '@core/database/repositories/agent-memory-entry.repository'

const logger = createLogger('AgentMemoryFlywheel')

/** 置信度闸门（低于直接丢弃，不入待审） */
export const CONFIDENCE_GATE = 0.7

/** KE-3 向量端口（34 号 v2 §3）：宿主适配层注入（KB 嵌入 + IVectorStore）；缺省=纯关键词检索 */
export interface MemoryVectorPort {
  /** 嵌入文本批次；返回向量与模型指纹；null=嵌入不可用（降级关键词） */
  embedTexts(texts: string[]): Promise<{ vectors: number[][]; model: string } | null>
  /** 按分区写入（kbId=分区键 mem:{userId}[:biz:...][:proj:...]） */
  upsert(records: Array<{ id: string; kbId: string; vector: number[]; content: string; model: string }>): Promise<void>
  search(kbId: string, vector: number[], topK: number): Promise<Array<{ id: string; score: number }>>
  remove(ids: string[]): Promise<void>
}
/** 查重的关键词重叠率阈值（Jaccard 简化实现） */
export const DEDUP_OVERLAP_THRESHOLD = 0.6
/** 读取装配条数上限 */
export const ASSEMBLE_TOP_K = 3
/** 蒸馏条数上限 */
export const DISTILL_MAX_ITEMS = 3
/** 代谢：零命中归档天数 */
export const ARCHIVE_STALE_DAYS = 30

export interface MemoryCandidate {
  kind: MemoryEntryKind
  title: string
  content: string
  confidence: number
}

/** 依赖端口：蒸馏 LLM / 仓储 / 时钟（宿主注入） */
export interface MemoryFlywheelDeps {
  /** KE-3 向量端口（可选；缺省纯关键词） */
  vector?: MemoryVectorPort
  repo: AgentMemoryEntryRepository
  /** 蒸馏：轨迹/结果文本 → 候选条目（宿主封装 resolveModel + generateText） */
  distill?: (input: { goal: string; output: string; signal?: AbortSignal }) => Promise<MemoryCandidate[]>
  clock?: () => number
}

/** 关键词集合（简易中文/英文分词：按标点与空白切 + 2-gram 兜底） */
export function tokenize(text: string): Set<string> {
  const cleaned = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')
  const words = cleaned.split(' ').filter((w) => w.length > 1)
  const set = new Set(words)
  // CJK 无空格分词：相邻汉字 2-gram（召回优先；查重场景宁多勿漏）
  const cjkRuns = text.match(/[\u4e00-\u9fff]{2,}/g) ?? []
  for (const run of cjkRuns) {
    for (let i = 0; i < run.length - 1; i++) set.add(run.slice(i, i + 2))
  }
  return set
}

/** Jaccard 相似度（查重简化实现） */
export function overlapRatio(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const w of a) if (b.has(w)) inter++
  return inter / (a.size + b.size - inter)
}

export class MemoryFlywheelService {
  private readonly deps: Required<Pick<MemoryFlywheelDeps, 'repo' | 'clock'>> & Pick<MemoryFlywheelDeps, 'distill' | 'vector'>

  constructor(deps: MemoryFlywheelDeps) {
    this.deps = { repo: deps.repo, distill: deps.distill, vector: deps.vector, clock: deps.clock ?? (() => Date.now()) }
  }

  /**
   * 任务成功后蒸馏候选（fire-and-forget 语义由调用方决定；本方法不 throw）。
   * 返回入库（pending_review）条数；置信度不足/蒸馏失败丢弃并留痕。
   */
  async distillFromTask(input: {
    goal: string
    outputText: string
    sourceRunId?: string | null
    sourceTaskId?: string | null
    /** KE-1 分层（34 号 v2）：任务归属 → L2/L3 打标；缺省落用户级 L1 */
    scope?: { bizModule?: string; projectId?: string } | null
    signal?: AbortSignal
  }): Promise<number> {
    if (!this.deps.distill) return 0
    let candidates: MemoryCandidate[]
    try {
      candidates = await this.deps.distill({ goal: input.goal, output: input.outputText.slice(0, 16_000), signal: input.signal })
    } catch (e) {
      logger.warn(`[memory] 蒸馏失败（跳过）：${e instanceof Error ? e.message : String(e)}`)
      return 0
    }
    let saved = 0
    for (const c of candidates.slice(0, DISTILL_MAX_ITEMS)) {
      if (!c.title?.trim() || !c.content?.trim()) continue
      // 闸门②：置信度（NaN 同拒——review T18）
      if (!(Number(c.confidence) >= CONFIDENCE_GATE)) {
        logger.info(`[memory] 候选置信度不足（${c.confidence}），丢弃：${c.title}`)
        continue
      }
      // 闸门①：查重（与既有 active 条目关键词重叠）
      if (await this.isDuplicate(c.content)) {
        logger.info(`[memory] 候选与既有条目重复，丢弃：${c.title}`)
        continue
      }
      await this.deps.repo.create({
        id: `mem_${randomUUID()}`,
        kind: c.kind,
        content: { title: c.title.trim(), content: c.content.trim() },
        sourceRunId: input.sourceRunId ?? null,
        sourceTaskId: input.sourceTaskId ?? null,
        confidence: c.confidence,
        status: 'pending_review', // 闸门③：默认人工批准
        bizModule: input.scope?.bizModule ?? null,
        projectId: input.scope?.projectId ?? null,
      })
      saved++
    }
    return saved
  }

  /** 用户层装配（chat 宿主：对话未绑定业务，只取 L1 用户级经验） */
  async assembleUserLevel(taskText: string, topK = ASSEMBLE_TOP_K): Promise<AgentMemoryEntryRow[]> {
    return this.assemble(taskText, topK, { bizModule: '' })
  }

  /** 查重：与既有 active 及待审条目重叠率超阈值判重（review T18：曾对 pending 盲视，
   *  多条相似候选可同时过闸堆积） */
  async isDuplicate(content: string): Promise<boolean> {
    const existing = [...(await this.deps.repo.listActive()), ...(await this.deps.repo.listByStatus('pending_review'))]
    const tokens = tokenize(content)
    for (const entry of existing) {
      const text = String((entry.content as { content?: string }).content ?? '')
      if (overlapRatio(tokens, tokenize(text)) >= DEDUP_OVERLAP_THRESHOLD) return true
    }
    return false
  }

  /**
   * 读取装配：按任务文本关键词匹配 active 条目 top-k（命中词数排序）。
   * 命中条目 use_count 在任务 succeeded 时回写（防装配即计数虚增）。
   */
  async assemble(taskText: string, topK = ASSEMBLE_TOP_K, scope?: { bizModule?: string; projectId?: string } | null): Promise<AgentMemoryEntryRow[]> {
    // KE-2 分层装配（34 号 v2）：候选按 scope 三层过滤，得分 = 命中数 × 层级权重，
    // 分层配额（每层 topK 总 3×topK）——同题冲突时项目级事实优先
    // KE-3 混合检索：向量召回分（0.6 权重）与关键词命中并集融合；向量不可用纯关键词
    const partitions = scope
      ? [
          `mem:${getCurrentUserId() ?? 'local'}`,
          ...(scope.bizModule ? [`mem:${getCurrentUserId() ?? 'local'}:biz:${scope.bizModule}`] : []),
          ...(scope.projectId ? [`mem:${getCurrentUserId() ?? 'local'}:proj:${scope.bizModule ?? 'default'}:${scope.projectId}`] : []),
        ]
      : null
    const vectorScores = new Map<string, number>()
    const vp = this.deps.vector
    if (vp && partitions) {
      try {
        const embedded = await vp.embedTexts([taskText])
        if (embedded && embedded.vectors.length > 0 && embedded.vectors[0].length > 0) {
          for (const kbId of partitions) {
            for (const hit of await vp.search(kbId, embedded.vectors[0], topK * 2)) {
              const entryId = hit.id.replace(/^memvec_/, '')
              vectorScores.set(entryId, Math.max(vectorScores.get(entryId) ?? 0, hit.score))
            }
          }
        }
      } catch (e) {
        logger.warn(`[memory] 向量召回失败（降级关键词）：${e instanceof Error ? e.message : String(e)}`)
      }
    }
    const active = scope
      ? await this.deps.repo.listActiveByScope(scope)
      : await this.deps.repo.listActive()
    if (active.length === 0) return []
    const layerWeight = (r: AgentMemoryEntryRow): number => (r.projectId ? 1.3 : r.bizModule ? 1.15 : 1.0)
    const tokens = tokenize(taskText)
    const scored = active
      .map((e) => {
        const content = String((e.content as { content?: string }).content ?? '') + String((e.content as { title?: string }).title ?? '')
        const entryTokens = tokenize(content)
        let hits = 0
        for (const w of tokens) if (entryTokens.has(w)) hits++
        return { entry: e, hits, weight: layerWeight(e) }
      })
      .filter((s) => s.hits > 0 || vectorScores.has(s.entry.id))
      .sort((a, b) => (b.hits + 0.6 * (vectorScores.get(b.entry.id) ?? 0)) * b.weight - (a.hits + 0.6 * (vectorScores.get(a.entry.id) ?? 0)) * a.weight)
    if (!scope) return scored.slice(0, topK).map((s) => s.entry)
    // 分层配额：L1/L2/L3 各 topK，总量 3×topK
    const quota = { l1: topK, l2: topK, l3: topK }
    const picked: AgentMemoryEntryRow[] = []
    for (const s of scored) {
      const slot = s.entry.projectId ? 'l3' : s.entry.bizModule ? 'l2' : 'l1'
      if (quota[slot as keyof typeof quota] <= 0) continue
      quota[slot as keyof typeof quota]--
      picked.push(s.entry)
      if (picked.length >= topK * 3) break
    }
    return picked
    return scored.map((s) => s.entry)
  }

  /** 人工批准（闸门③的唯一放行路径） */
  /** KE-3：条目生效后异步嵌入（fire-and-forget；失败降级关键词，不阻塞主链路） */
  private embedEntry(entry: AgentMemoryEntryRow): void {
    const vp = this.deps.vector
    if (!vp) return
    void (async () => {
      try {
        const text = String((entry.content as { title?: string }).title ?? '') + '\n' + String((entry.content as { content?: string }).content ?? '')
        const uid = getCurrentUserId() ?? 'local'
        const partition = entry.projectId
          ? `mem:${uid}:proj:${entry.bizModule ?? 'default'}:${entry.projectId}`
          : entry.bizModule
            ? `mem:${uid}:biz:${entry.bizModule}`
            : `mem:${uid}`
        const contentHash = stableStringify(entry.content).slice(0, 64)
        // 增量+漂移纪律（评审 P2-8）：内容与模型都没变就不重嵌入
        if (entry.contentHash === contentHash && entry.embedModel && entry.embeddingId) {
          logger.info(`[memory] 条目未变化，跳过重嵌入（${entry.id}）`)
          return
        }
        const embedded = await vp.embedTexts([text])
        if (!embedded || embedded.vectors.length === 0) return
        const recordId = `memvec_${entry.id}`
        await vp.upsert([{ id: recordId, kbId: partition, vector: embedded.vectors[0], content: text, model: embedded.model }])
        await this.deps.repo.patch(entry.id, { embeddingId: recordId, contentHash, embedModel: embedded.model })
        logger.info(`[memory] 条目已向量化（${entry.id}，partition=${partition.slice(0, 24)}…）`)
      } catch (e) {
        logger.warn(`[memory] 向量化失败（降级关键词检索）：${e instanceof Error ? e.message : String(e)}`)
      }
    })()
  }

  async approve(id: string): Promise<void> {
    const entry = await this.deps.repo.getById(id)
    if (!entry) throw new Error(`记忆条目不存在：${id}`)
    if (entry.status !== 'pending_review') throw new Error(`条目状态为 ${entry.status}，不可批准`)
    await this.deps.repo.patch(id, { status: 'active' })
    // KE-3：生效即向量化（fire-and-forget，失败降级关键词）
    this.embedEntry({ ...entry, status: 'active' })
  }

  /** 人工归档（拒绝入库）；已向量化条目同步清向量（评审 P2：存储无界增长） */
  async archive(id: string): Promise<void> {
    const entry = await this.deps.repo.getById(id)
    if (!entry) throw new Error(`记忆条目不存在：${id}`)
    await this.deps.repo.patch(id, { status: 'archived' })
  }

  /** 任务终态回写：succeeded → success_count++；failed 仅计数（负样本留痕） */
  /** 手工录入（KE-1）：默认 pending_review 走人工批准闸门（宁可慢不可脏） */
  async addManual(input: {
    kind: MemoryCandidate['kind']
    title: string
    content: string
    confidence?: number | null
    scope?: { bizModule?: string; projectId?: string } | null
  }): Promise<AgentMemoryEntryRow> {
    if (!input.title?.trim() || !input.content?.trim()) throw new Error('标题与内容不能为空')
    const validKinds = ['fact', 'sop', 'preference', 'skill', 'episode-ref']
    if (!validKinds.includes(input.kind)) throw new Error(`未知类型：${input.kind}`)
    if (await this.isDuplicate(input.content)) throw new Error('与既有条目重复')
    // 分区对称（评审 P2）：projectId 无 bizModule 时归入 default 分区，保证嵌入/检索同键
    const bizModule = input.scope?.projectId ? (input.scope.bizModule ?? 'default') : (input.scope?.bizModule ?? null)
    return this.deps.repo.create({
      id: `mem_${randomUUID()}`,
      kind: input.kind,
      content: { title: input.title.trim(), content: input.content.trim() },
      confidence: input.confidence ?? 1,
      status: 'pending_review',
      bizModule,
      projectId: input.scope?.projectId ?? null,
    })
  }

  /** 失效（KE-1：评审 P2-7——原只有 approve/archive，无"驳回"语义；reject 归 archive） */
  async reject(id: string): Promise<void> {
    await this.deps.repo.patch(id, { status: 'archived' })
    void this.removeVectors(id)
  }

  /** 清条目向量（fire-and-forget） */
  private removeVectors(id: string): void {
    const vp = this.deps.vector
    if (!vp) return
    void vp.remove([`memvec_${id}`]).catch((e) => logger.warn(`[memory] 清向量失败：${e instanceof Error ? e.message : String(e)}`))
  }

  async reportTaskOutcome(entryIds: string[], succeeded: boolean): Promise<void> {
    for (const id of entryIds) {
      const entry = await this.deps.repo.getById(id)
      if (!entry) continue
      await this.deps.repo.patch(id, {
        useCount: entry.useCount + 1,
        successCount: succeeded ? entry.successCount + 1 : entry.successCount,
      })
    }
  }

  /** 待审列表（记忆审批 UI 数据源） */
  async listPending() {
    return this.deps.repo.listByStatus('pending_review')
  }

  /** 已生效条目列表 */
  async listActiveEntries() {
    return this.deps.repo.listActive()
  }

  /** 已归档条目列表（M8 用户反馈①：生命周期全量可见） */
  async listArchivedEntries() {
    return this.deps.repo.listByStatus('archived')
  }

  /** 代谢：零命中且超期条目归档（cron 接线后置；TaskService 批处理入口） */
  async archiveStale(): Promise<number> {
    const cutoff = new Date(this.deps.clock() - ARCHIVE_STALE_DAYS * 86_400_000)
    return this.deps.repo.archiveStaleBefore(cutoff)
  }
}
