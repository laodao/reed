/**
 * 日记目录数据访问层
 * @module database/repositories/diary-folder.repository
 */

import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import type {
  DiaryFolder,
  CreateDiaryFolderRequest,
  UpdateDiaryFolderRequest
} from '@shared/types/diary.types'

export class DiaryFolderRepository {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  /**
   * 将数据库行转换为 DiaryFolder 对象
   */
  private rowToEntity(row: any): DiaryFolder {
    return {
      id: row.id,
      name: row.name,
      parentId: row.parent_id || undefined,
      path: row.path,
      sortOrder: row.sort_order,
      childCount: row.child_count || 0,
      entryCount: row.entry_count || 0,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }
  }

  /**
   * 获取所有根目录
   */
  findRootFolders(): DiaryFolder[] {
    const rows = this.db.prepare(`
      SELECT f.*,
        (SELECT COUNT(*) FROM diary_folders WHERE parent_id = f.id) as child_count,
        (SELECT COUNT(*) FROM diary_entries WHERE folder_id = f.id) as entry_count
      FROM diary_folders f
      WHERE f.parent_id IS NULL
      ORDER BY f.sort_order, f.created_at DESC
    `).all() as any[]
    return rows.map(row => this.rowToEntity(row))
  }

  /**
   * 获取指定父目录下的子目录
   */
  findChildren(parentId: string): DiaryFolder[] {
    const rows = this.db.prepare(`
      SELECT f.*,
        (SELECT COUNT(*) FROM diary_folders WHERE parent_id = f.id) as child_count,
        (SELECT COUNT(*) FROM diary_entries WHERE folder_id = f.id) as entry_count
      FROM diary_folders f
      WHERE f.parent_id = ?
      ORDER BY f.sort_order, f.created_at DESC
    `).all(parentId) as any[]
    return rows.map(row => this.rowToEntity(row))
  }

  /**
   * 获取目录树（递归获取所有目录）
   */
  findAll(): DiaryFolder[] {
    const rows = this.db.prepare(`
      SELECT f.*,
        (SELECT COUNT(*) FROM diary_folders WHERE parent_id = f.id) as child_count,
        (SELECT COUNT(*) FROM diary_entries WHERE folder_id = f.id) as entry_count
      FROM diary_folders f
      ORDER BY f.sort_order, f.created_at DESC
    `).all() as any[]
    return rows.map(row => this.rowToEntity(row))
  }

  /**
   * 根据 ID 获取目录
   */
  findById(id: string): DiaryFolder | null {
    const row = this.db.prepare(`
      SELECT f.*,
        (SELECT COUNT(*) FROM diary_folders WHERE parent_id = f.id) as child_count,
        (SELECT COUNT(*) FROM diary_entries WHERE folder_id = f.id) as entry_count
      FROM diary_folders f
      WHERE f.id = ?
    `).get(id) as any
    if (!row) return null
    return this.rowToEntity(row)
  }

  /**
   * 根据路径获取目录
   */
  findByPath(path: string): DiaryFolder | null {
    const row = this.db.prepare(`
      SELECT f.*,
        (SELECT COUNT(*) FROM diary_folders WHERE parent_id = f.id) as child_count,
        (SELECT COUNT(*) FROM diary_entries WHERE folder_id = f.id) as entry_count
      FROM diary_folders f
      WHERE f.path = ?
    `).get(path) as any
    if (!row) return null
    return this.rowToEntity(row)
  }

  /**
   * 检查同名目录是否存在
   */
  existsByName(name: string, parentId?: string): boolean {
    const sql = parentId
      ? 'SELECT id FROM diary_folders WHERE name = ? AND parent_id = ?'
      : 'SELECT id FROM diary_folders WHERE name = ? AND parent_id IS NULL'
    const params = parentId ? [name, parentId] : [name]
    const row = this.db.prepare(sql).get(...params) as any
    return !!row
  }

  /**
   * 创建目录
   */
  create(request: CreateDiaryFolderRequest, fullPath: string): DiaryFolder {
    const id = randomUUID()
    const now = new Date().toISOString()

    this.db.prepare(`
      INSERT INTO diary_folders (id, name, parent_id, path, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, 0, ?, ?)
    `).run(
      id,
      request.name,
      request.parentId || null,
      fullPath,
      now,
      now
    )

    return {
      id,
      name: request.name,
      parentId: request.parentId,
      path: fullPath,
      sortOrder: 0,
      childCount: 0,
      entryCount: 0,
      createdAt: new Date(now),
      updatedAt: new Date(now)
    }
  }

  /**
   * 更新目录
   */
  update(id: string, request: UpdateDiaryFolderRequest, newPath?: string): boolean {
    const fields: string[] = []
    const values: any[] = []

    if (request.name !== undefined) {
      fields.push('name = ?')
      values.push(request.name)
    }
    if (request.sortOrder !== undefined) {
      fields.push('sort_order = ?')
      values.push(request.sortOrder)
    }
    if (newPath !== undefined) {
      fields.push('path = ?')
      values.push(newPath)
    }

    if (fields.length === 0) return false

    fields.push('updated_at = ?')
    values.push(new Date().toISOString())
    values.push(id)

    const result = this.db.prepare(
      `UPDATE diary_folders SET ${fields.join(', ')} WHERE id = ?`
    ).run(...values)

    return result.changes > 0
  }

  /**
   * 删除目录（级联删除子目录和日记）
   */
  delete(id: string): boolean {
    const result = this.db.prepare(
      'DELETE FROM diary_folders WHERE id = ?'
    ).run(id)
    return result.changes > 0
  }

  /**
   * 统计目录数量
   */
  count(): number {
    const row = this.db.prepare(
      'SELECT COUNT(*) as count FROM diary_folders'
    ).get() as { count: number }
    return row?.count || 0
  }
}