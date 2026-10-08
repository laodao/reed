/**
 * 滚动阅读产线（P1：全书工作记忆）
 * @module platform/services/kb-brain/book-reading.service
 *
 * 用户设计的「滚动式阅读理解」：按批通读全书，每批提示词携带此前批次的积累理解
 * （工作记忆），新知识增量合并（新增/更新/冲突标记），读完沉淀出全书设定、人物
 * 档案、情节链、伏笔台账——供关系图谱（P2）、终审复核（P3）与全书综述（P3）取材。
 *
 * - 存储：kb_notes，type='reading-memory'，每文档一份（tags 带 doc:<id>），随批次演进
 * - 断点续跑：复用章级台账 kb_digest_passes（passType='reading'，passKey='reading'，
 *   chapterId=批末章）——ensurePass 的 done-same-hash 幂等即天然断点
 * - 溯源：提示词强制每条信息带（第N章）；记忆为中间产物，论断层仍由逐章原子化负责
 * - 批大小：按字符预算规划（默认 24000 字/批，env KB_READING_BATCH_CHARS 可调）；
 *   按模型 contextWindow 动态计算待 provider 侧暴露真实窗口后接入
 */
import { createHash } from 'node:crypto'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { KbChapterRecord, KbChapterRepository } from '@core/database/repositories/kb-chapter.repository'
import type { KbDigestPassRepository } from '@core/database/repositories/kb-digest-pass.repository'
import type { KbDocumentRepository } from '@core/database/repositories/kb-document.repository'
import type { KbNoteRecord, KbNoteRepository } from '@core/database/repositories/kb-note.repository'
import { extractJsonFromResponse } from '@core/platform/services/ai-call'
import { createLogger } from '@core/utils/logger'
import { isModerationRejection, isNonNarrativeChapter } from './digest-orchestrator.service'
import {
  createKbScopedLlm,
  BRAIN_LLM_MAX_TOKENS,
  type BrainLlmFn,
  type BrainModelRef,
  type KbScopedLlm
} from './llm'
import { ROLLING_READING_SYSTEM, buildRollingReadingUser } from './prompts'

const logger = createLogger('KbBookReading')

/** 单批正文字符预算（约 16K token） */
const BATCH_CHARS_DEFAULT = 24000
/** 单章正文截断（超长章保护；全书理解靠批次连续性，不靠单章全文） */
const CHAPTER_TEXT_CAP = 12000
/** 工作记忆硬上限（超出截尾，提示词层约束 8000） */
export const MAX_MEMORY_CHARS = 12000

export interface ReadingBatchPlan {
  chapters: KbChapterRecord[]
  texts: Array<{ label: string; text: string }>
  /** 批末章（台账断点锚点） */
  last: KbChapterRecord
  chars: number
}

/**
 * 批次规划：非叙事章节剔除后，按累计字符预算切批；单章超长截断。
 * 纯函数（测试友好）。
 */
export function planReadingBatches(
  chapters: KbChapterRecord[],
  opts?: { batchChars?: number; chapterCap?: number }
): ReadingBatchPlan[] {
  const batchChars =
    opts?.batchChars ?? (Number(process.env.KB_READING_BATCH_CHARS ?? '') || BATCH_CHARS_DEFAULT)
  const chapterCap = opts?.chapterCap ?? CHAPTER_TEXT_CAP
  const narrative = chapters.filter(c => !isNonNarrativeChapter(c.title, c.parentTitle))
  const plans: ReadingBatchPlan[] = []
  let cur: KbChapterRecord[] = []
  let curTexts: Array<{ label: string; text: string }> = []
  let curChars = 0
  for (const c of narrative) {
    const raw = (c.content ?? '').trim()
    if (!raw) continue
    const text = raw.length > chapterCap ? `${raw.slice(0, chapterCap)}\n（本章超长，已截断）` : raw
    const label = c.title || `#第${c.ordering}章`
    if (cur.length > 0 && curChars + text.length > batchChars) {
      plans.push({ chapters: cur, texts: curTexts, last: cur[cur.length - 1]!, chars: curChars })
      cur = []
      curTexts = []
      curChars = 0
    }
    cur.push(c)
    curTexts.push({ label, text })
    curChars += text.length
  }
  if (cur.length > 0) plans.push({ chapters: cur, texts: curTexts, last: cur[cur.length - 1]!, chars: curChars })
  return plans
}

/** 整体尾部截断兜底（模型不守结构 / 头部即超预算时）：保最新内容，丢最早 */
function tailTruncate(lines: string[], cap: number): string {
  const mark = '（……记忆超限，最早内容已截去）'
  let size = mark.length + 1
  let start = lines.length
  for (let i = lines.length - 1; i >= 0; i--) {
    const w = lines[i]!.length + 1
    if (size + w > cap) break
    size += w
    start = i
  }
  return [mark, ...lines.slice(start)].join('\n')
}

/**
 * 工作记忆硬上限截尾（保头部 + 保最新情节：卷册/设定/人物在前不丢；
 * 「情节进展」段从尾部向前保留——情节按章序追加，段尾即最新，最早细节先丢；
 * 其后段落（伏笔/存疑）预算内照装）。模型不守结构（无「情节进展」标题）或
 * 头部即装不下时退化为整体尾部截断兜底——任何形态下输出都 ≤ cap。
 */
export function capMemory(memory: string, cap = MAX_MEMORY_CHARS): string {
  if (memory.length <= cap) return memory
  const lines = memory.split('\n')
  const plotStart = lines.findIndex(l => /^## 情节进展/.test(l))
  if (plotStart === -1) return tailTruncate(lines, cap)

  const out: string[] = []
  let size = 0
  // 1. 头部段落先装（提示词纪律下体量小；装不下说明整体失控，走兜底）
  let i = 0
  for (; i < plotStart; i++) {
    const w = lines[i]!.length + 1
    if (size + w > cap - 200) break
    out.push(lines[i]!)
    size += w
  }
  if (i < plotStart) return tailTruncate(lines, cap)

  // 2. 「情节进展」段从尾部（最新）向前装填——最早细节先丢（段标题保留）
  let plotEnd = plotStart + 1
  while (plotEnd < lines.length && !/^## /.test(lines[plotEnd]!)) plotEnd++
  const TRIM_MARK = '（……更早的情节细节因记忆容量压缩，完整事件链见章级摘要与论断）'
  const heading = lines[plotStart]!
  const keptPlot: string[] = []
  let plotSize = 0
  let j = plotEnd - 1
  for (; j > plotStart; j--) {
    const w = lines[j]!.length + 1
    if (size + plotSize + w > cap - 200) break
    keptPlot.unshift(lines[j]!)
    plotSize += w
  }
  if (j === plotStart) {
    out.push(heading, ...keptPlot)
    size += heading.length + 1 + plotSize
  } else {
    out.push(heading, TRIM_MARK, ...keptPlot)
    size += heading.length + 1 + TRIM_MARK.length + 1 + plotSize
  }

  // 3. 其后段落（伏笔/存疑）预算内照装
  for (let k = plotEnd; k < lines.length; k++) {
    const w = lines[k]!.length + 1
    if (size + w > cap) break
    out.push(lines[k]!)
    size += w
  }
  return out.join('\n')
}

/**
 * 批锚点哈希（review M2）：整批各章 contentHash 合成——只哈希批末章时，批内
 * 其他章改动不失效；不含章 id，reprocess 后同内容批经 ensurePass 的
 * hash 兜底键仍可复用旧台账。
 */
function batchHash(plan: ReadingBatchPlan): string {
  return createHash('sha256')
    .update(plan.chapters.map(c => c.contentHash ?? '').join('|'))
    .digest('hex')
}

export interface BookReadingProgress {
  running: boolean
  batchesDone: number
  batchesTotal: number
  memoryChars: number
  version: number
  lastError?: string
}

export interface BookReadingDeps {
  llm?: BrainLlmFn
  modelOverride?: () => BrainModelRef
  repos?: () => ReadingRepos | null
}

export interface ReadingRepos {
  chapters: KbChapterRepository
  docs: KbDocumentRepository
  notes: KbNoteRepository
  passes: KbDigestPassRepository
}

export interface KbBookReadingRunResult {
  batches: number
  batchesTotal: number
  memoryChars: number
  version: number
}

export class KbBookReadingService {
  private readonly scoped: KbScopedLlm
  private readonly reposFn: () => ReadingRepos | null
  private readonly running = new Set<string>()
  private readonly progress = new Map<string, BookReadingProgress>()

  constructor(deps: BookReadingDeps = {}) {
    this.scoped = createKbScopedLlm('kb-brain-adjudicate', {
      injected: deps.llm,
      fallback: deps.modelOverride
    })
    this.reposFn =
      deps.repos ??
      ((): ReadingRepos | null => {
        const db = getCoreDatabaseManager()
        if (!db.kbChapters || !db.kbDocuments || !db.kbNotes || !db.kbDigestPasses) return null
        return {
          chapters: db.kbChapters,
          docs: db.kbDocuments,
          notes: db.kbNotes,
          passes: db.kbDigestPasses
        }
      })
  }

  setModelOverride(kbId: string, fn: () => BrainModelRef): void {
    this.scoped.setOverride(kbId, fn)
  }

  isRunning(kbId: string, documentId: string): boolean {
    return this.running.has(`${kbId}:${documentId}`)
  }

  isRunningKb(kbId: string): boolean {
    return [...this.running].some(k => k.startsWith(`${kbId}:`))
  }

  /** 按库聚合进度（多书顺序跑时给面板轮询） */
  kbStatus(kbId: string): BookReadingProgress & { docsTotal: number } {
    let batchesDone = 0
    let batchesTotal = 0
    let memoryChars = 0
    let docsTotal = 0
    let lastError: string | undefined
    for (const [key, p] of this.progress) {
      if (!key.startsWith(`${kbId}:`)) continue
      docsTotal++
      batchesDone += p.batchesDone
      batchesTotal += p.batchesTotal
      memoryChars += p.memoryChars
      if (p.lastError) lastError = p.lastError
    }
    return { running: this.isRunningKb(kbId), batchesDone, batchesTotal, memoryChars, version: 0, docsTotal, lastError }
  }

  status(kbId: string, documentId: string): BookReadingProgress {
    return (
      this.progress.get(`${kbId}:${documentId}`) ?? {
        running: false,
        batchesDone: 0,
        batchesTotal: 0,
        memoryChars: 0,
        version: 0
      }
    )
  }

  private llmFor(kbId: string): BrainLlmFn {
    return this.scoped.llmFor(kbId)
  }

  /** 工作记忆卡定位：type + doc tag */
  private async findMemoryNote(notes: KbNoteRepository, kbId: string, documentId: string): Promise<KbNoteRecord | null> {
    return notes.findReadingMemory(kbId, documentId)
  }

  async run(kbId: string, documentId: string): Promise<KbBookReadingRunResult> {
    const key = `${kbId}:${documentId}`
    // 竞态守卫（review M6）：check 与 add 之间不得有 await——同步抢占后，
    // 后续异步校验（repos/文档存在/归属）的失败经 finally 释放
    if (this.running.has(key)) throw new Error('全书精读进行中，请稍候')
    this.running.add(key)
    const progress: BookReadingProgress = this.progress.get(key) ?? {
      running: true,
      batchesDone: 0,
      batchesTotal: 0,
      memoryChars: 0,
      version: 0
    }
    progress.running = true
    progress.lastError = undefined
    this.progress.set(key, progress)

    try {
      const repos = this.reposFn()
      if (!repos) throw new Error('知识大脑未启用（旧库）')
      const doc = await repos.docs.findById(documentId)
      if (!doc) throw new Error('文档不存在')
      // 归属校验（review M4）：跨库 documentId 会在本库产出指向他库文档的记忆卡
      if (doc.knowledgeBaseId !== kbId) throw new Error('文档不属于该知识库')

      const chapterRows = await repos.chapters.findByDocument(documentId)
      const plans = planReadingBatches(chapterRows)
      if (plans.length === 0) throw new Error('没有可读的章节（正文为空或全部为前置页）')
      progress.batchesTotal = plans.length

      // 工作记忆卡：定位或初始化
      let note = await this.findMemoryNote(repos.notes, kbId, documentId)
      if (!note) {
        const created = await repos.notes.propose(kbId, {
          title: `《${shortBookName(doc.name)}》滚动阅读记忆`,
          description: `全书滚动精读的工作记忆（设定/人物/情节/要素/伏笔，每条带章节出处）；供关系图谱、复核与全书综述取材。文档：${doc.name}`,
          type: 'reading-memory',
          body: '',
          tags: JSON.stringify([`doc:${documentId}`])
        })
        note = await repos.notes.publish(created.id)
        if (!note) throw new Error('工作记忆卡创建失败')
      }

      let memory = note.body ?? ''
      for (let i = 0; i < plans.length; i++) {
        const plan = plans[i]!
        const decision = await repos.passes.ensurePass({
          knowledgeBaseId: kbId,
          documentId,
          chapterId: plan.last.id,
          passType: 'reading',
          passKey: 'reading',
          chapterHash: batchHash(plan)
        })
        if (decision.action === 'skip') {
          progress.batchesDone = i + 1
          continue
        }
        const pass = decision.pass
        await repos.passes.setRunning(pass.id)
        try {
          const bookMeta = `《${shortBookName(doc.name)}》共 ${chapterRows.length} 章；本批为第 ${i + 1}/${plans.length} 批（${plan.chapters.length} 章）。`
          const raw = await this.llmFor(kbId)({
            system: ROLLING_READING_SYSTEM,
            user: buildRollingReadingUser({ bookMeta, memory, chapters: plan.texts }),
            maxTokens: BRAIN_LLM_MAX_TOKENS
          })
          const parsed = extractJsonFromResponse(raw) as Partial<{ memory: unknown }> | null
          const nextMemory = typeof parsed?.memory === 'string' ? parsed.memory.trim() : ''
          if (!nextMemory) throw new Error('响应缺少 memory 字段')
          memory = capMemory(nextMemory)

          const updated = await repos.notes.evolveCard(note.id, {
            body: memory,
            description: `全书滚动精读的工作记忆（设定/人物/情节/要素/伏笔，每条带章节出处）；批次进度 ${i + 1}/${plans.length}。文档：${doc.name}`
          })
          progress.batchesDone = i + 1
          progress.memoryChars = memory.length
          progress.version = updated?.version ?? progress.version
          await repos.passes.setDone(pass.id, { batch: 1 }, { calls: 1, tokensIn: 0, tokensOut: 0 })
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          progress.lastError = msg
          // 云内容审核拦截（与 digest 同判）：重试无意义——台账耗尽封账（attempts 顶格），
          // 续跑不再重撞本批；换模型/供应商后人工 reviveExhausted 可复活（review M5）
          if (isModerationRejection(msg)) {
            await repos.passes.markExhausted(pass.id, msg)
            logger.warn(`[kb-reading] kb=${kbId} doc=${documentId} 批 ${i + 1}/${plans.length} 被云内容审核拦截，跳过（可换模型后人工重试）`)
            continue
          }
          await repos.passes.setFailed(pass.id, msg.slice(0, 300))
          logger.warn(`[kb-reading] kb=${kbId} doc=${documentId} 批 ${i + 1}/${plans.length} 失败: ${msg}`)
          // 单批失败继续下一批（记忆保持上一批状态；失败批留 failed 台账可人工重试）
        }
      }

      progress.running = false
      progress.memoryChars = memory.length
      return {
        batches: progress.batchesDone,
        batchesTotal: plans.length,
        memoryChars: memory.length,
        version: progress.version
      }
    } catch (e) {
      progress.running = false
      progress.lastError = e instanceof Error ? e.message : String(e)
      throw e
    } finally {
      this.running.delete(key)
      this.progress.set(key, progress)
    }
  }
}

function shortBookName(name: string): string {
  const s = name.replace(/\.[a-z0-9]+$/i, '').replace(/[（(【[][^）)】\]]*[）)】\]]/g, '').trim()
  return s || name
}

let singleton: KbBookReadingService | null = null

export function getKbBookReadingService(): KbBookReadingService {
  if (!singleton) singleton = new KbBookReadingService()
  return singleton
}
