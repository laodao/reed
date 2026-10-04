/**
 * 日记灵感条服务（spec 2026-09-24 日记增强 §5.3 / §6.3 一期）
 * @module core/packs/diary/services/diary-inspiration.service
 * @description 写日记时的"侧边灵感条"数据面：
 *   1. 今日到期复习卡——KbBrainFsrsService.dueNext（服务自带 learning.enabled 门槛）；
 *   2. 相关论断/卡片——KnowledgeBaseService.search 走大脑池（include: atom+note），
 *      以日记标题+首段为 query；非大脑库 fail-soft 降级出的 chunk 结果被过滤。
 *
 * 纪律：呈现为可忽略的侧边数据，绝不注入正文；本服务永不 throw——
 * 任何子通道失败都降级为空数组（对齐 writing-brain-tool 的永不阻塞写作纪律）。
 */

import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { KnowledgeBaseService } from '@core/platform/services/knowledge-base.service'
import { KbBrainFsrsService } from '@core/platform/services/kb-brain/fsrs.service'
import { DiaryService } from '@core/platform/services/diary.service'
import { getDiaryBrainSyncService } from '@core/platform/services/diary-brain-sync.service'
import type { DiaryIpcResponse } from '@shared/types/diary.types'

/** 灵感条检索的知识库上限（对齐 brain-provider cap 3） */
const MAX_KB = 3
/** 每个 KB 的 FSRS 到期卡上限 */
const DUE_PER_KB = 3
/** 每个 KB 的相关检索上限 */
const RELATED_PER_KB = 3
/** 单次检索超时（灵感条是锦上添花，不能拖住编辑器） */
const SEARCH_TIMEOUT_MS = 8000

/** 今日到期复习卡（一期仅展示，处理入口在知识大脑复习面板） */
export interface InspirationDueCard {
  noteId: string
  kbId: string
  kbName: string
  title: string
  description: string
  dueAt: string
}

/** 相关论断/卡片 */
export interface InspirationRelatedItem {
  kind: 'atom' | 'note'
  kbId: string
  kbName: string
  documentName: string
  /** atom=论断原文；note=卡片标题 */
  title: string
  snippet: string
  score: number
}

/** 相关历史日记（P2 二期：来源=「日记」库 chunk 检索，可回跳原文） */
export interface InspirationRelatedEntry {
  entryId: string
  title: string
  snippet: string
  score: number
}

export interface DiaryInspiration {
  dueCards: InspirationDueCard[]
  related: InspirationRelatedItem[]
  relatedEntries: InspirationRelatedEntry[]
}

export class DiaryInspirationService {
  private readonly fsrs = new KbBrainFsrsService()

  /**
   * 获取一篇日记的灵感条数据。永不 throw。
   */
  async getInspiration(entryId: string): Promise<DiaryIpcResponse<DiaryInspiration>> {
    const empty: DiaryInspiration = { dueCards: [], related: [], relatedEntries: [] }
    try {
      const service = new DiaryService()
      const entryResp = await service.getEntry(entryId)
      if (!entryResp.success || !entryResp.data) {
        return { success: false, error: entryResp.error || '日记不存在' }
      }
      const entry = entryResp.data
      const query = buildQuery(entry.title, entry.content || '')

      const db = getCoreDatabaseManager()
      const kbList = (await db.knowledgeBases?.findAll()) ?? []
      const targets = kbList.slice(0, MAX_KB)

      const [dueCards, related, relatedEntries] = await Promise.all([
        this.collectDueCards(targets),
        this.collectRelated(targets, query),
        this.collectRelatedEntries(entryId, query),
      ])

      return { success: true, data: { dueCards, related, relatedEntries } }
    } catch (error) {
      console.error('[DiaryInspiration] getInspiration error:', error)
      return { success: true, data: empty }
    }
  }

  /** FSRS 到期卡：逐库拉取，单库失败跳过 */
  private async collectDueCards(
    kbList: Array<{ id: string; name: string }>
  ): Promise<InspirationDueCard[]> {
    const all: InspirationDueCard[] = []
    for (const kb of kbList) {
      try {
        const items = await this.fsrs.dueNext(kb.id, DUE_PER_KB)
        for (const item of items) {
          all.push({
            noteId: item.noteId,
            kbId: kb.id,
            kbName: kb.name,
            title: item.title,
            description: item.description,
            dueAt: item.dueAt instanceof Date ? item.dueAt.toISOString() : String(item.dueAt),
          })
        }
      } catch (error) {
        console.warn(`[DiaryInspiration] FSRS 队列失败 kb=${kb.id}:`, error)
      }
    }
    all.sort((a, b) => a.dueAt.localeCompare(b.dueAt))
    return all.slice(0, 6)
  }

  /** 大脑池检索：只保留 atom/note 命中（chunk=非大脑库降级产物，丢弃） */
  private async collectRelated(
    kbList: Array<{ id: string; name: string }>,
    query: string
  ): Promise<InspirationRelatedItem[]> {
    if (!query.trim()) return []
    const kbService = new KnowledgeBaseService()
    const all: InspirationRelatedItem[] = []

    const results = await Promise.allSettled(
      kbList.map(async kb => {
        const resp = await kbService.search({
          knowledgeBaseId: kb.id,
          query,
          include: ['atom', 'note'],
          topK: RELATED_PER_KB,
          signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
        })
        if (!resp.success || !resp.data) return []
        return resp.data
          .filter(r => r.kind === 'atom' || r.kind === 'note')
          .map<InspirationRelatedItem>(r => ({
            kind: r.kind as 'atom' | 'note',
            kbId: kb.id,
            kbName: kb.name,
            documentName: r.documentName,
            title: r.kind === 'note' ? (r.note?.title || '未命名卡片') : '论断',
            snippet: r.kind === 'atom' ? (r.atom?.quote || r.context || r.content || '') : (r.content || ''),
            score: r.score,
          }))
      })
    )

    for (const r of results) {
      if (r.status === 'fulfilled') all.push(...r.value)
    }
    all.sort((a, b) => b.score - a.score)
    return all.slice(0, 6)
  }

  /**
   * 相关历史日记（P2 二期）：「日记」库 chunk 检索（opt-in 条目自动入库于此），
   * 命中文档反查 source 回跳原条目；只回 diary 来源，排除当前条目。
   */
  private async collectRelatedEntries(
    entryId: string,
    query: string
  ): Promise<InspirationRelatedEntry[]> {
    try {
      const diaryKb = await getDiaryBrainSyncService().ensureDiaryKnowledgeBase()
      if (!diaryKb) return []

      const db = getCoreDatabaseManager()
      const resp = await new KnowledgeBaseService().search({
        knowledgeBaseId: diaryKb.id,
        query,
        include: ['chunk'],
        topK: 6,
        signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
      })
      if (!resp.success || !resp.data) return []

      const out: InspirationRelatedEntry[] = []
      for (const r of resp.data) {
        if (out.length >= 5) break
        const doc = await db.kbDocuments?.findById(r.documentId)
        if (!doc?.source || doc.source.type !== 'diary' || doc.source.id === entryId) continue
        out.push({
          entryId: doc.source.id,
          title: r.documentName,
          snippet: (r.content || '').slice(0, 160),
          score: r.score,
        })
      }
      return out
    } catch (error) {
      console.warn('[DiaryInspiration] collectRelatedEntries 失败:', error)
      return []
    }
  }
}

/** 检索 query：标题 + 正文首段（截 200 字） */
function buildQuery(title: string, content: string): string {
  const firstParagraph = content
    .split(/\n{2,}/)
    .map(s => s.trim())
    .find(s => s.length > 0 && !s.startsWith('#'))
  return `${title}\n${(firstParagraph || '').slice(0, 200)}`.trim()
}
