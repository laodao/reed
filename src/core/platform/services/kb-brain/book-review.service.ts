/**
 * 终审复核 + 全书综述（P3）
 * @module platform/services/kb-brain/book-review.service
 *
 * 用户设计的最后两步：
 * - 复核：全书读完、知识沉淀后专门过一遍——知识对不对得上原文、前后是否矛盾、
 *   有无缺口。产出复核报告（问题清单 + 结论），存 kb_notes(type='reading-review')。
 * - 综述：基于工作记忆 + 书级卡 + 关系图谱，输出一篇完整文章：整体架构/世界设定/
 *   角色/故事情节/暗线伏笔/写作手法和技巧/本书优点（哪里写得好、为什么吸引人），
 *   存 kb_notes(type='book-summary')，可直接阅读导出。
 */
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { KbNoteRepository } from '@core/database/repositories/kb-note.repository'
import type { KbBrainArtifactRepository } from '@core/database/repositories/kb-brain-artifact.repository'
import { extractJsonFromResponse } from '@core/platform/services/ai-call'
import { createLogger } from '@core/utils/logger'
import {
  createKbScopedLlm,
  BRAIN_LLM_MAX_TOKENS,
  type BrainLlmFn,
  type BrainModelRef,
  type KbScopedLlm
} from './llm'
import { REVIEW_SYSTEM, buildReviewUser, BOOK_SUMMARY_SYSTEM, buildBookSummaryUser } from './prompts'

const logger = createLogger('KbBookReview')

export interface BookReviewDeps {
  llm?: BrainLlmFn
  modelOverride?: () => BrainModelRef
  repos?: () => { notes: KbNoteRepository; artifacts?: KbBrainArtifactRepository | null } | null
}

export interface ReviewIssue {
  severity: string
  kind: string
  detail: string
  chapterHint: string
}

export class KbBookReviewService {
  private readonly scoped: KbScopedLlm
  private readonly reposFn: () => { notes: KbNoteRepository; artifacts?: KbBrainArtifactRepository | null } | null
  private readonly running = new Set<string>()

  constructor(deps: BookReviewDeps = {}) {
    this.scoped = createKbScopedLlm('kb-brain-adjudicate', {
      injected: deps.llm,
      fallback: deps.modelOverride
    })
    this.reposFn =
      deps.repos ??
      ((): { notes: KbNoteRepository; artifacts?: KbBrainArtifactRepository | null } | null => {
        const db = getCoreDatabaseManager()
        if (!db.kbNotes) return null
        return { notes: db.kbNotes, artifacts: db.kbBrainArtifacts ?? null }
      })
  }

  setModelOverride(kbId: string, fn: () => BrainModelRef): void {
    this.scoped.setOverride(kbId, fn)
  }

  isRunning(kbId: string, documentId: string): boolean {
    return this.running.has(`${kbId}:${documentId}`)
  }

  private llmFor(kbId: string): BrainLlmFn {
    return this.scoped.llmFor(kbId)
  }

  /** 名册摘要文本（v4：复核/综述的人物与设定底料；无快照返回空） */
  private async rosterDigest(artifacts: KbBrainArtifactRepository, _kbId: string, documentId: string): Promise<string> {
    try {
      const a = await artifacts.findByKey(documentId, 'roster')
      if (!a) return ''
      const snap = JSON.parse(a.body ?? '{}') as { characters?: Array<{ name: string; tier: string; aliases: string[]; sampleFacts: string[] }> }
      return (snap.characters ?? [])
        .slice(0, 30)
        .map(c => `- ${c.name}（${c.tier}${c.aliases.length ? `/${c.aliases.join('/')}` : ''}）：${c.sampleFacts.join('；').slice(0, 100)}`)
        .join('\n')
    } catch {
      return ''
    }
  }

  /** 定位/创建文档的附属知识卡（复核报告/综述文章） */
  private async findArtifactNote(
    notes: KbNoteRepository,
    kbId: string,
    documentId: string,
    type: 'reading-review' | 'book-summary'
  ): Promise<{ id: string; version: number; body: string } | null> {
    return notes.findReadingMemory(kbId, documentId, type) as unknown as {
      id: string
      version: number
      body: string
    } | null
  }

  /** 终审复核：工作记忆自查 + 与书级卡交叉核对，产出问题清单与结论 */
  async runReview(
    kbId: string,
    documentId: string,
    docName: string
  ): Promise<{ issues: number; verdict: string; noteId: string }> {
    const key = `${kbId}:${documentId}:review`
    if (this.running.has(key)) throw new Error('复核进行中，请稍候')
    const repos = this.reposFn()
    if (!repos) throw new Error('知识大脑未启用（旧库）')
    this.running.add(key)
    try {
      // v4 取材切换：书级卡+名册为主，工作记忆可选（未跑精读的书不再被硬卡）
      const memory = await repos.notes.findReadingMemory(kbId, documentId)
      const cards = await repos.notes.listBookCards(kbId, documentId)
      const cardDigest = cards
        .map(c => `【${c.title}】\n${(c.body ?? '').slice(0, 1500)}`)
        .join('\n\n')
      const rosterDigest = repos.artifacts ? await this.rosterDigest(repos.artifacts, kbId, documentId) : ''
      if (!(memory?.body ?? '').trim() && !cardDigest && !rosterDigest)
        throw new Error('没有可复核的知识（既无工作记忆也无书级卡/名册）')

      const raw = await this.llmFor(kbId)({
        system: REVIEW_SYSTEM,
        user: buildReviewUser(docName, (memory?.body ?? '') || cardDigest || rosterDigest, [cardDigest, rosterDigest].filter(Boolean).join('\n\n')),
        maxTokens: BRAIN_LLM_MAX_TOKENS
      })
      const parsed = extractJsonFromResponse(raw) as
        | Partial<{ issues: ReviewIssue[]; verdict: string }>
        | null
      const issues = Array.isArray(parsed?.issues) ? parsed!.issues! : []
      const verdict = typeof parsed?.verdict === 'string' ? parsed!.verdict : ''

      const body =
        `## 复核结论\n\n${verdict}\n\n## 问题清单（${issues.length}）\n\n` +
        issues
          .map(
            i =>
              `- **[${i.severity ?? '中'}] ${i.kind ?? '一致性'}**：${i.detail}${i.chapterHint ? `（${i.chapterHint}）` : ''}`
          )
          .join('\n')

      const existing = await this.findArtifactNote(repos.notes, kbId, documentId, 'reading-review')
      let noteId: string
      if (existing) {
        const updated = await repos.notes.evolveCard(existing.id, {
          body,
          description: `终审复核报告：${issues.length} 个问题。文档：${docName}`
        })
        noteId = updated?.id ?? existing.id
      } else {
        const created = await repos.notes.propose(kbId, {
          title: `《${docName}》终审复核报告`,
          description: `终审复核：工作记忆与书级卡交叉核对的问题清单与结论。文档：${docName}`,
          type: 'reading-review',
          body,
          tags: JSON.stringify([`doc:${documentId}`])
        })
        const published = await repos.notes.publish(created.id)
        noteId = published?.id ?? created.id
      }
      logger.info(`[kb-review] kb=${kbId} doc=${documentId} 复核完成：${issues.length} 个问题`)
      return { issues: issues.length, verdict, noteId }
    } finally {
      this.running.delete(key)
    }
  }

  /** 全书综述：组装工作记忆+书级卡+关系边，生成完整文章 */
  async runSummary(
    kbId: string,
    documentId: string,
    docName: string
  ): Promise<{ chars: number; noteId: string }> {
    const key = `${kbId}:${documentId}:summary`
    if (this.running.has(key)) throw new Error('综述生成进行中，请稍候')
    const repos = this.reposFn()
    if (!repos) throw new Error('知识大脑未启用（旧库）')
    this.running.add(key)
    try {
      // v4 取材切换：同复核——卡+名册为主，记忆可选
      const memory = await repos.notes.findReadingMemory(kbId, documentId)
      const cards = await repos.notes.listBookCards(kbId, documentId)
      const cardDigest = cards
        .map(c => `【${c.title}】\n${(c.body ?? '').slice(0, 1200)}`)
        .join('\n\n')
      const rosterDigest = repos.artifacts ? await this.rosterDigest(repos.artifacts, kbId, documentId) : ''
      if (!(memory?.body ?? '').trim() && !cardDigest && !rosterDigest)
        throw new Error('没有可综述的知识（既无工作记忆也无书级卡/名册）')

      const raw = await this.llmFor(kbId)({
        system: BOOK_SUMMARY_SYSTEM,
        user: buildBookSummaryUser(docName, (memory?.body ?? '') || rosterDigest, [cardDigest, rosterDigest].filter(Boolean).join('\n\n')),
        maxTokens: BRAIN_LLM_MAX_TOKENS
      })
      const article = raw.trim()
      if (article.length < 200) throw new Error('综述生成过短，疑似失败')

      const existing = await this.findArtifactNote(repos.notes, kbId, documentId, 'book-summary')
      let noteId: string
      if (existing) {
        const updated = await repos.notes.evolveCard(existing.id, {
          body: article,
          description: `全书综述：整体架构/世界设定/角色/故事情节/暗线伏笔/写作手法/本书优点。文档：${docName}`
        })
        noteId = updated?.id ?? existing.id
      } else {
        const created = await repos.notes.propose(kbId, {
          title: `《${docName}》全书综述`,
          description: `全书综述文章：整体架构/世界设定/角色/故事情节/暗线伏笔/写作手法和技巧/本书优点。文档：${docName}`,
          type: 'book-summary',
          body: article,
          tags: JSON.stringify([`doc:${documentId}`])
        })
        const published = await repos.notes.publish(created.id)
        noteId = published?.id ?? created.id
      }
      logger.info(`[kb-review] kb=${kbId} doc=${documentId} 综述完成：${article.length} 字`)
      return { chars: article.length, noteId }
    } finally {
      this.running.delete(key)
    }
  }
}

let singleton: KbBookReviewService | null = null

export function getKbBookReviewService(): KbBookReviewService {
  if (!singleton) singleton = new KbBookReviewService()
  return singleton
}
