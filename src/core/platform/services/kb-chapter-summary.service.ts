/**
 * 章节摘要服务（M2）
 * @module platform/services/kb-chapter-summary
 *
 * 为文档的每个章节生成一段简短中文摘要，说明该章节核心内容：
 * - 数据源：kb_chapters.content（与切片同源的章节正文）
 * - 异步：scheduleDocumentSummaries 为 fire-and-forget，绝不阻塞文档处理主流程
 * - fail-soft：单章失败仅标记 summary_status='failed' + error，可经 retryFailed 重试
 * - 幂等：已 done 的章节跳过（重试只补未完成/失败项）
 * - LLM 可注入（测试注入 fake，生产走平台层 generateCompletionText）
 */
import type { KbChapterRecord, KbChapterRepository } from '@core/database/repositories/kb-chapter.repository'
import { generateCompletionText } from './simple-llm'
import { createLogger } from '@core/utils/logger'

const logger = createLogger('KbChapterSummary')

/** LLM 单轮调用函数（可注入，便于测试与替换档位） */
export type ChapterLlmFn = (req: { system: string; user: string; maxTokens?: number }) => Promise<string>

export interface KbChapterSummaryDeps {
  repo: KbChapterRepository
  /** 默认走平台层 generateCompletionText（宿主模型档位） */
  llm?: ChapterLlmFn
}

export interface SummarizeOptions {
  /** 是否重试 failed 章节（默认 true） */
  retryFailed?: boolean
  /** 并发度（默认 3；后台任务避免打爆 provider 限流） */
  concurrency?: number
  /** 单章送入模型的正文上限（默认 6000 字符，超长截断） */
  maxChars?: number
  /** 单次调用最多生成的章节数（默认 60；权威目录可能上千章，防止 LLM 成本失控） */
  maxSummaries?: number
}

export interface SummarizeResult {
  total: number
  done: number
  failed: number
  skipped: number
  /** 因 maxSummaries 上限本次未处理、仍待生成的章节数（可再次触发续跑） */
  remaining?: number
}

const SYSTEM_PROMPT =
  '你是知识库编辑。请为给定章节写一段 2~4 句的中文摘要，说明该章节的核心内容、解决的问题与在全书中的作用，' +
  '便于检索时快速判断章节主旨。只输出摘要正文：不要标题、不要 Markdown 标记、不要"本章"以外的客套话。'

export class KbChapterSummaryService {
  constructor(private readonly deps: KbChapterSummaryDeps) {}

  private callLlm(req: { system: string; user: string; maxTokens?: number }): Promise<string> {
    return this.deps.llm ? this.deps.llm(req) : generateCompletionText('chapter-summary', req)
  }

  /**
   * 文档处理后自动调度摘要（不阻塞调用方）。
   * 失败只记日志——摘要缺失不影响切片/检索可用。
   */
  scheduleDocumentSummaries(documentId: string, opts?: SummarizeOptions): void {
    void this.summarizeDocument(documentId, opts).catch((e: unknown) => {
      logger.warn(`[kb-summary] 后台摘要调度失败 doc=${documentId}: ${e instanceof Error ? e.message : String(e)}`)
    })
  }

  /**
   * 生成/重试文档章节摘要（等待完成）。
   *
   * 成本保护（maxSummaries）：权威目录可能带来大量章节（《深度学习》363 章、
   * numpy 手册上千节），逐章调用 LLM 成本失控——单次只处理「层级最浅 + 内容较长」
   * 的前 N 章，其余保持 pending（可再次触发续跑）。
   *
   * @returns 统计（total=本次处理数，done/failed/skipped/remaining）
   */
  async summarizeDocument(documentId: string, opts?: SummarizeOptions): Promise<SummarizeResult> {
    const { retryFailed = true, concurrency = 3, maxChars = 6000, maxSummaries = 60 } = opts ?? {}
    const statuses: Array<'pending' | 'failed'> = retryFailed ? ['pending', 'failed'] : ['pending']
    const all = await this.deps.repo.findByStatuses(documentId, statuses)
    // 优先：层级最浅（顶层章更有概括价值）→ 内容较长（信息量大）
    const ordered = [...all].sort(
      (a, b) => a.level - b.level || (b.content?.length ?? 0) - (a.content?.length ?? 0),
    )
    const chapters = ordered.slice(0, maxSummaries)
    const remaining = Math.max(0, ordered.length - chapters.length)
    const docsAll = await this.deps.repo.findByDocument(documentId)
    const skipped = docsAll.filter(c => c.summaryStatus === 'done').length

    let done = 0
    let failed = 0
    const queue = [...chapters]
    const workers = Array.from({ length: Math.max(1, Math.min(concurrency, queue.length)) }, async () => {
      for (;;) {
        const chapter = queue.shift()
        if (!chapter) return
        const ok = await this.summarizeOne(chapter, maxChars)
        if (ok) done++
        else failed++
      }
    })
    await Promise.all(workers)

    logger.info(
      `[kb-summary] doc=${documentId} 完成: done=${done} failed=${failed} skipped=${skipped} remaining=${remaining}`,
    )
    return { total: chapters.length, done, failed, skipped, remaining }
  }

  /** 单章摘要：成功写 done，失败写 failed + 原因（可重试） */
  private async summarizeOne(chapter: KbChapterRecord, maxChars: number): Promise<boolean> {
    const content = (chapter.content ?? '').trim()
    if (!content) {
      await this.deps.repo.updateSummary(chapter.id, { summary: '', status: 'failed', error: '章节正文为空' })
      return false
    }
    const body = content.length > maxChars ? `${content.slice(0, maxChars)}\n…（正文过长，此处截断）` : content
    try {
      const text = await this.callLlm({
        system: SYSTEM_PROMPT,
        user: `章节标题：${chapter.title}\n\n章节正文：\n${body}`,
        // 1600：推理型模型会在思考上消耗可观 token，预算过小会导致正文为空
        maxTokens: 1600,
      })
      const summary = (text ?? '').trim()
      if (!summary) throw new Error('模型返回空摘要')
      await this.deps.repo.updateSummary(chapter.id, { summary, status: 'done' })
      return true
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      logger.warn(`[kb-summary] 章节摘要失败 chapter=${chapter.id} title=${chapter.title.slice(0, 30)}: ${msg}`)
      await this.deps.repo.updateSummary(chapter.id, { summary: '', status: 'failed', error: msg.slice(0, 300) })
      return false
    }
  }
}