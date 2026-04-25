/**
 * 章节状态摘要仓库
 * @module database/repositories/lw-chapter-state-summary.repository
 * @description 管理章节结束时的故事状态摘要
 */

import Database from 'better-sqlite3'
import {
  ChapterStateSummary,
  ChapterStateSummaryRecord,
  CreateChapterStateSummaryRequest
} from '@shared/types/longwriting.types'

export class LwChapterStateSummaryRepository {
  constructor(private db: Database.Database) {}

  /**
   * 根据项目 ID 获取所有章节状态摘要
   */
  getByProjectId(projectId: string): ChapterStateSummary[] {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_chapter_state_summaries
      WHERE project_id = ?
      ORDER BY chapter_number ASC
    `)
    const rows = stmt.all(projectId) as ChapterStateSummaryRecord[]
    return rows.map(row => this.mapToSummary(row))
  }

  /**
   * 根据大纲 ID 获取章节状态摘要
   */
  getByOutlineId(outlineId: string): ChapterStateSummary | null {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_chapter_state_summaries WHERE outline_id = ?
    `)
    const row = stmt.get(outlineId) as ChapterStateSummaryRecord | undefined
    return row ? this.mapToSummary(row) : null
  }

  /**
   * 获取指定章节的状态摘要
   */
  getByChapterNumber(projectId: string, chapterNumber: number): ChapterStateSummary | null {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_chapter_state_summaries
      WHERE project_id = ? AND chapter_number = ?
    `)
    const row = stmt.get(projectId, chapterNumber) as ChapterStateSummaryRecord | undefined
    return row ? this.mapToSummary(row) : null
  }

  /**
   * 获取指定章节之前的最新状态摘要
   */
  getLatestBeforeChapter(projectId: string, chapterNumber: number): ChapterStateSummary | null {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_chapter_state_summaries
      WHERE project_id = ? AND chapter_number < ?
      ORDER BY chapter_number DESC
      LIMIT 1
    `)
    const row = stmt.get(projectId, chapterNumber) as ChapterStateSummaryRecord | undefined
    return row ? this.mapToSummary(row) : null
  }

  /**
   * 获取项目的最新章节状态摘要
   */
  getLatest(projectId: string): ChapterStateSummary | null {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_chapter_state_summaries
      WHERE project_id = ?
      ORDER BY chapter_number DESC
      LIMIT 1
    `)
    const row = stmt.get(projectId) as ChapterStateSummaryRecord | undefined
    return row ? this.mapToSummary(row) : null
  }

  /**
   * 根据 ID 获取章节状态摘要
   */
  getById(id: string): ChapterStateSummary | null {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_chapter_state_summaries WHERE id = ?
    `)
    const row = stmt.get(id) as ChapterStateSummaryRecord | undefined
    return row ? this.mapToSummary(row) : null
  }

  /**
   * 创建章节状态摘要
   */
  create(data: CreateChapterStateSummaryRequest): ChapterStateSummary {
    const id = this.generateId()
    const now = Date.now()

    const stmt = this.db.prepare(`
      INSERT INTO lw_chapter_state_summaries (
        id, project_id, outline_id, chapter_number,
        story_time, current_location, character_states,
        pending_events, key_changes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      id,
      data.projectId,
      data.outlineId,
      data.chapterNumber,
      data.storyTime,
      data.currentLocation,
      data.characterStates,
      data.pendingEvents,
      data.keyChanges,
      now,
      now
    )

    return {
      id,
      projectId: data.projectId,
      outlineId: data.outlineId,
      chapterNumber: data.chapterNumber,
      storyTime: data.storyTime,
      currentLocation: data.currentLocation,
      characterStates: data.characterStates,
      pendingEvents: data.pendingEvents,
      keyChanges: data.keyChanges,
      createdAt: now,
      updatedAt: now
    }
  }

  /**
   * 更新或创建章节状态摘要（upsert）
   */
  upsert(data: CreateChapterStateSummaryRequest): ChapterStateSummary {
    // 检查是否已存在
    const existing = this.getByOutlineId(data.outlineId)

    if (existing) {
      // 更新已存在的摘要
      const now = Date.now()
      const stmt = this.db.prepare(`
        UPDATE lw_chapter_state_summaries
        SET story_time = ?, current_location = ?, character_states = ?,
            pending_events = ?, key_changes = ?, chapter_number = ?, updated_at = ?
        WHERE id = ?
      `)
      stmt.run(
        data.storyTime,
        data.currentLocation,
        data.characterStates,
        data.pendingEvents,
        data.keyChanges,
        data.chapterNumber,
        now,
        existing.id
      )
      return this.getById(existing.id)!
    } else {
      // 创建新摘要
      return this.create(data)
    }
  }

  /**
   * 删除章节状态摘要
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM lw_chapter_state_summaries WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }

  /**
   * 根据大纲 ID 删除章节状态摘要
   */
  deleteByOutlineId(outlineId: string): boolean {
    const stmt = this.db.prepare('DELETE FROM lw_chapter_state_summaries WHERE outline_id = ?')
    const result = stmt.run(outlineId)
    return result.changes > 0
  }

  /**
   * 删除项目的所有章节状态摘要
   */
  deleteByProjectId(projectId: string): number {
    const stmt = this.db.prepare('DELETE FROM lw_chapter_state_summaries WHERE project_id = ?')
    const result = stmt.run(projectId)
    return result.changes
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `ch_summary_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 映射数据库行到摘要对象
   */
  private mapToSummary(row: ChapterStateSummaryRecord): ChapterStateSummary {
    return {
      id: row.id,
      projectId: row.project_id,
      outlineId: row.outline_id,
      chapterNumber: row.chapter_number,
      storyTime: row.story_time,
      currentLocation: row.current_location,
      characterStates: row.character_states,
      pendingEvents: row.pending_events,
      keyChanges: row.key_changes,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }
}