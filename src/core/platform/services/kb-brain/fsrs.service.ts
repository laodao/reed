/**
 * 知识大脑·FSRS 复习调度（T18，详细设计 §8.4）
 * @module platform/services/kb-brain/fsrs.service
 *
 * ts-fsrs 封装（Anki 官方算法，MIT）：kb_notes 的 fsrs 字段是当前态缓存，
 * 评分历史在 kb_note_reviews（只追加，缓存可重建）。
 * 交互纪律（§8.4）：先回忆后揭示（UI 层）；答错不作惩罚；FSRS 只管排期。
 */
import { fsrs, createEmptyCard, type Grade, type Card } from 'ts-fsrs'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { createLogger } from '@core/utils/logger'
import type { KbNoteRepository, KbNoteRecord } from '@core/database/repositories/kb-note.repository'
import type { KbNoteReviewRepository } from '@core/database/repositories/kb-note-review.repository'

const logger = createLogger('KbBrainFsrs')

/** 默认参数：目标保持率 0.9（§8.4），其余 ts-fsrs 缺省 */
function engine(retention: number): ReturnType<typeof fsrs> {
  return fsrs({ w: undefined, request_retention: retention, maximum_interval: 365 })
}

export interface ReviewNextItem {
  noteId: string
  title: string
  description: string
  dueAt: Date
}

export interface KbBrainFsrsDeps {
  repos?: () => { notes: KbNoteRepository; reviews: KbNoteReviewRepository; learningEnabled: (kbId: string) => Promise<boolean> } | null
}

export class KbBrainFsrsService {
  private readonly reposFn: NonNullable<KbBrainFsrsDeps['repos']>

  constructor(deps: KbBrainFsrsDeps = {}) {
    this.reposFn =
      deps.repos ??
      (() => {
        const db = getCoreDatabaseManager()
        if (!db.kbNotes || !db.kbNoteReviews || !db.knowledgeBases) return null
        return {
          notes: db.kbNotes,
          reviews: db.kbNoteReviews,
          learningEnabled: async (kbId) => {
            const kb = await db.knowledgeBases?.findById(kbId)
            const cfg = kb?.brainConfig ? safeParse(kb.brainConfig) : null
            return !!cfg?.learning?.enabled
          },
        }
      })
  }

  /** 到期复习队列（due_at ≤ now 的 published 卡；learning 未启用返回空） */
  async dueNext(kbId: string, limit = 10): Promise<ReviewNextItem[]> {
    const repos = this.reposFn()
    if (!repos) return []
    if (!(await repos.learningEnabled(kbId))) return []
    const rows = await repos.notes.dueReviews(kbId, new Date(), limit)
    return rows.map((r: KbNoteRecord) => ({
      noteId: r.id,
      title: r.title,
      description: r.description,
      dueAt: r.dueAt ?? new Date(0),
    }))
  }

  /** 评分（FSRS Rating 1-4）：状态转移 + 台账追加。先回忆后揭示由 UI 保证。 */
  async grade(kbId: string, noteId: string, rating: 1 | 2 | 3 | 4): Promise<{ success: boolean; nextDueAt?: Date; error?: string }> {
    const repos = this.reposFn()
    if (!repos) return { success: false, error: '仓储未装配' }
    if (!(await repos.learningEnabled(kbId))) return { success: false, error: '学习模式未启用' }
    const note = await repos.notes.findById(noteId)
    if (!note || note.knowledgeBaseId !== kbId) return { success: false, error: '卡片不存在' }
    try {
      const f = engine(await desiredRetention(kbId, this.reposFn))
      const card = cardFromNote(note)
      const now = new Date()
      const result = f.next(card, now, rating as Grade)
      const next: Card = result.card
      // 当前态缓存回写
      await repos.notes.updateFsrsState(noteId, {
        stability: next.stability,
        difficulty: next.difficulty,
        lastReviewAt: now,
        dueAt: next.due,
        lapses: next.lapses,
        state: next.state,
      })
      // 评分历史（只追加）
      await repos.reviews.append({
        noteId,
        kbId,
        rating,
        scheduledDays: result.log.scheduled_days,
        elapsedDays: result.log.elapsed_days,
        reviewedAt: now,
      })
      return { success: true, nextDueAt: next.due }
    } catch (e) {
      logger.warn(`[kb-fsrs] 评分失败 note=${noteId}: ${e instanceof Error ? e.message : String(e)}`)
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  }
}

/** 从 note 当前态缓存重建 FSRS card（缓存缺失/损坏 → 新卡） */
function cardFromNote(note: KbNoteRecord): Card {
  const base = createEmptyCard()
  const card: Card = {
    ...base,
    due: note.dueAt ? new Date(note.dueAt) : base.due,
    stability: note.fsrsStability ?? base.stability,
    difficulty: note.fsrsDifficulty ?? base.difficulty,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: note.reviewCount,
    lapses: note.lapseCount,
    state: (note.fsrsState ?? (note.fsrsStability != null ? 2 : base.state)) as Card['state'],
    last_review: note.lastReviewAt ? new Date(note.lastReviewAt) : undefined,
  }
  return card
}

async function desiredRetention(kbId: string, _reposFn?: NonNullable<KbBrainFsrsDeps['repos']>): Promise<number> {
  try {
    const db = getCoreDatabaseManager()
    const kb = await db.knowledgeBases?.findById(kbId)
    const cfg = kb?.brainConfig ? safeParse(kb.brainConfig) : null
    return cfg?.learning?.desiredRetention ?? 0.9
  } catch {
    return 0.9
  }
}

function safeParse(raw: string): { learning?: { enabled?: boolean; desiredRetention?: number } } | null {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

