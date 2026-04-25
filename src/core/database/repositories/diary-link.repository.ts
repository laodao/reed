/**
 * 日记链接数据访问层
 * @module database/repositories/diary-link.repository
 */

import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import type {
  DiaryLink,
  BacklinkInfo
} from '@shared/types/diary.types'

export class DiaryLinkRepository {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  /**
   * 获取日记的所有出链（该日记引用的其他日记）
   */
  findOutgoingLinks(sourceEntryId: string): DiaryLink[] {
    const rows = this.db.prepare(`
      SELECT * FROM diary_links WHERE source_entry_id = ?
    `).all(sourceEntryId) as any[]
    return rows.map(row => this.rowToEntity(row))
  }

  /**
   * 获取日记的所有反向链接（引用该日记的其他日记）
   */
  findIncomingLinks(targetEntryId: string): BacklinkInfo[] {
    const rows = this.db.prepare(`
      SELECT l.*, e.title as source_entry_title
      FROM diary_links l
      JOIN diary_entries e ON l.source_entry_id = e.id
      WHERE l.target_entry_id = ?
    `).all(targetEntryId) as any[]
    return rows.map(row => ({
      sourceEntryId: row.source_entry_id,
      sourceEntryTitle: row.source_entry_title,
      linkText: row.link_text || undefined,
      context: undefined
    }))
  }

  /**
   * 获取未解析的链接（目标日记不存在）
   */
  findUnresolvedLinks(sourceEntryId: string): DiaryLink[] {
    const rows = this.db.prepare(`
      SELECT * FROM diary_links
      WHERE source_entry_id = ? AND target_entry_id IS NULL
    `).all(sourceEntryId) as any[]
    return rows.map(row => this.rowToEntity(row))
  }

  /**
   * 创建链接
   */
  create(
    sourceEntryId: string,
    targetTitle: string,
    options?: { targetEntryId?: string; linkText?: string; anchor?: string }
  ): DiaryLink {
    const id = randomUUID()
    const now = new Date().toISOString()

    this.db.prepare(`
      INSERT INTO diary_links (id, source_entry_id, target_entry_id, target_title, link_text, anchor, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      sourceEntryId,
      options?.targetEntryId || null,
      targetTitle,
      options?.linkText || null,
      options?.anchor || null,
      now
    )

    return {
      id,
      sourceEntryId,
      targetEntryId: options?.targetEntryId,
      targetTitle,
      linkText: options?.linkText,
      anchor: options?.anchor,
      createdAt: new Date(now)
    }
  }

  /**
   * 批量创建链接
   */
  createMany(links: Array<{
    sourceEntryId: string
    targetTitle: string
    targetEntryId?: string
    linkText?: string
    anchor?: string
  }>): void {
    const stmt = this.db.prepare(`
      INSERT INTO diary_links (id, source_entry_id, target_entry_id, target_title, link_text, anchor, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)

    const now = new Date().toISOString()
    const insertMany = this.db.transaction((items: typeof links) => {
      for (const link of items) {
        stmt.run(
          randomUUID(),
          link.sourceEntryId,
          link.targetEntryId || null,
          link.targetTitle,
          link.linkText || null,
          link.anchor || null,
          now
        )
      }
    })

    insertMany(links)
  }

  /**
   * 删除日记的所有出链
   */
  deleteBySource(sourceEntryId: string): void {
    this.db.prepare(
      'DELETE FROM diary_links WHERE source_entry_id = ?'
    ).run(sourceEntryId)
  }

  /**
   * 更新链接的目标（用于解析未创建的链接）
   */
  updateTarget(targetTitle: string, targetEntryId: string): void {
    this.db.prepare(`
      UPDATE diary_links
      SET target_entry_id = ?
      WHERE target_title = ? AND target_entry_id IS NULL
    `).run(targetEntryId, targetTitle)
  }

  /**
   * 将数据库行转换为 DiaryLink 对象
   */
  private rowToEntity(row: any): DiaryLink {
    return {
      id: row.id,
      sourceEntryId: row.source_entry_id,
      targetEntryId: row.target_entry_id || undefined,
      targetTitle: row.target_title,
      linkText: row.link_text || undefined,
      anchor: row.anchor || undefined,
      createdAt: new Date(row.created_at)
    }
  }
}