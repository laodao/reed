/**
 * 长文写作章节仓库
 * @module database/repositories/lw-chapter.repository
 */

import Database from 'better-sqlite3'
import {
  StoryChapter,
  ChapterVersion
} from '../../../shared/types/longwriting.types'

/**
 * 最大保留版本数
 */
const MAX_VERSIONS = 20

export class LwChapterRepository {
  constructor(private db: Database.Database) {}

  /**
   * 根据大纲 ID 获取章节
   */
  getByOutlineId(outlineId: string): StoryChapter | null {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_story_chapters WHERE outline_id = ?
    `)
    const row = stmt.get(outlineId) as any
    return row ? this.mapToChapter(row) : null
  }

  /**
   * 批量根据大纲 ID 获取章节
   */
  getByOutlineIds(outlineIds: string[]): Map<string, StoryChapter> {
    if (outlineIds.length === 0) return new Map()

    const placeholders = outlineIds.map(() => '?').join(',')
    const stmt = this.db.prepare(`
      SELECT * FROM lw_story_chapters WHERE outline_id IN (${placeholders})
    `)
    const rows = stmt.all(...outlineIds) as any[]

    const result = new Map<string, StoryChapter>()
    for (const row of rows) {
      const chapter = this.mapToChapter(row)
      result.set(chapter.outlineId, chapter)
    }
    return result
  }

  /**
   * 根据 ID 获取章节
   */
  getById(id: string): StoryChapter | null {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_story_chapters WHERE id = ?
    `)
    const row = stmt.get(id) as any
    return row ? this.mapToChapter(row) : null
  }

  /**
   * 创建章节
   */
  create(outlineId: string, content: string = ''): StoryChapter {
    const id = this.generateId()
    const now = Date.now()

    const stmt = this.db.prepare(`
      INSERT INTO lw_story_chapters (id, outline_id, content, word_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    const wordCount = this.countWords(content)
    stmt.run(id, outlineId, content, wordCount, now, now)

    return {
      id,
      outlineId,
      content,
      wordCount,
      createdAt: now,
      updatedAt: now
    }
  }

  /**
   * 更新章节内容
   */
  updateContent(id: string, content: string): StoryChapter | null {
    const chapter = this.getById(id)
    if (!chapter) return null

    const wordCount = this.countWords(content)
    const now = Date.now()

    const stmt = this.db.prepare(`
      UPDATE lw_story_chapters SET content = ?, word_count = ?, updated_at = ? WHERE id = ?
    `)
    stmt.run(content, wordCount, now, id)

    return this.getById(id)
  }

  /**
   * 删除章节
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM lw_story_chapters WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }

  // ==================== 版本管理 ====================

  /**
   * 获取章节的所有版本
   */
  getVersions(chapterId: string): ChapterVersion[] {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_chapter_versions WHERE chapter_id = ?
      ORDER BY version_number DESC
    `)
    const rows = stmt.all(chapterId) as any[]
    return rows.map(this.mapToVersion)
  }

  /**
   * 获取特定版本
   */
  getVersion(id: string): ChapterVersion | null {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_chapter_versions WHERE id = ?
    `)
    const row = stmt.get(id) as any
    return row ? this.mapToVersion(row) : null
  }

  /**
   * 获取最新版本
   */
  getLatestVersion(chapterId: string): ChapterVersion | null {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_chapter_versions WHERE chapter_id = ?
      ORDER BY version_number DESC LIMIT 1
    `)
    const row = stmt.get(chapterId) as any
    return row ? this.mapToVersion(row) : null
  }

  /**
   * 创建新版本
   */
  createVersion(
    chapterId: string,
    content: string,
    versionType: 'generated' | 'manual'
  ): ChapterVersion {
    const id = this.generateVersionId()
    const now = Date.now()
    const wordCount = this.countWords(content)

    // 获取下一个版本号
    const latestVersion = this.getLatestVersion(chapterId)
    const versionNumber = latestVersion ? latestVersion.versionNumber + 1 : 1

    const stmt = this.db.prepare(`
      INSERT INTO lw_chapter_versions (
        id, chapter_id, content, version_type, word_count, is_locked, version_number, created_at
      ) VALUES (?, ?, ?, ?, ?, 0, ?, ?)
    `)
    stmt.run(id, chapterId, content, versionType, wordCount, versionNumber, now)

    // 清理旧版本（保留最新的 MAX_VERSIONS 个）
    this.cleanupOldVersions(chapterId)

    return {
      id,
      chapterId,
      content,
      versionType,
      wordCount,
      isLocked: false,
      versionNumber,
      createdAt: now
    }
  }

  /**
   * 锁定版本
   */
  lockVersion(id: string): boolean {
    const stmt = this.db.prepare(`
      UPDATE lw_chapter_versions SET is_locked = 1 WHERE id = ?
    `)
    const result = stmt.run(id)
    return result.changes > 0
  }

  /**
   * 解锁版本
   */
  unlockVersion(id: string): boolean {
    const stmt = this.db.prepare(`
      UPDATE lw_chapter_versions SET is_locked = 0 WHERE id = ?
    `)
    const result = stmt.run(id)
    return result.changes > 0
  }

  /**
   * 恢复到指定版本
   */
  restoreVersion(chapterId: string, versionId: string): StoryChapter | null {
    const version = this.getVersion(versionId)
    if (!version || version.chapterId !== chapterId) return null

    // 更新章节内容
    const chapter = this.updateContent(chapterId, version.content)
    if (!chapter) return null

    // 创建新版本记录（标记为恢复）
    this.createVersion(chapterId, version.content, 'manual')

    return chapter
  }

  /**
   * 删除版本
   */
  deleteVersion(id: string): boolean {
    // 检查是否被锁定
    const version = this.getVersion(id)
    if (!version || version.isLocked) return false

    const stmt = this.db.prepare('DELETE FROM lw_chapter_versions WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }

  /**
   * 清理旧版本
   */
  private cleanupOldVersions(chapterId: string): void {
    const stmt = this.db.prepare(`
      SELECT id FROM lw_chapter_versions
      WHERE chapter_id = ? AND is_locked = 0
      ORDER BY version_number DESC
      LIMIT -1 OFFSET ${MAX_VERSIONS}
    `)
    const rows = stmt.all(chapterId) as any[]

    if (rows.length > 0) {
      const ids = rows.map(r => r.id)
      const deleteStmt = this.db.prepare(`
        DELETE FROM lw_chapter_versions WHERE id IN (${ids.map(() => '?').join(',')})
      `)
      deleteStmt.run(...ids)
    }
  }

  /**
   * 计算字数
   */
  private countWords(content: string): number {
    if (!content) return 0
    // 中文字符按字符计算，英文按单词计算
    const chineseChars = (content.match(/[\u4e00-\u9fa5]/g) || []).length
    const englishWords = (content.match(/[a-zA-Z]+/g) || []).length
    return chineseChars + englishWords
  }

  private generateId(): string {
    return `chapter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private generateVersionId(): string {
    return `ver_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private mapToChapter(row: any): StoryChapter {
    return {
      id: row.id,
      outlineId: row.outline_id,
      content: row.content || '',
      wordCount: row.word_count || 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  private mapToVersion(row: any): ChapterVersion {
    return {
      id: row.id,
      chapterId: row.chapter_id,
      content: row.content,
      versionType: row.version_type,
      wordCount: row.word_count,
      isLocked: !!row.is_locked,
      versionNumber: row.version_number,
      createdAt: row.created_at
    }
  }
}