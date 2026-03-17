/**
 * 图像数据访问层
 * @module database/repositories/image
 * @description 提供图像的数据库操作
 */

import { Database as SqlJsDatabase } from 'sql.js'
import type { ImageRecord } from '../../../shared/types'
import type { DatabaseManager } from '../index'
import { randomUUID } from 'crypto'

/**
 * 图像数据仓库
 */
export class ImageRepository {
  private db: SqlJsDatabase
  private dbManager: DatabaseManager

  constructor(db: SqlJsDatabase, dbManager: DatabaseManager) {
    this.db = db
    this.dbManager = dbManager
  }

  /**
   * 获取图像列表
   * @param page - 页码
   * @param pageSize - 每页数量
   * @param favoriteOnly - 只看收藏
   * @returns Promise<{ images: ImageRecord[], total: number, hasMore: boolean }>
   */
  async getList(
    page: number = 1,
    pageSize: number = 20,
    favoriteOnly: boolean = false
  ): Promise<{ images: ImageRecord[]; total: number; hasMore: boolean }> {
    const offset = (page - 1) * pageSize
    const whereClause = favoriteOnly ? 'WHERE favorite = 1' : ''

    // 获取总数
    const countResult = this.db.exec(`SELECT COUNT(*) as count FROM images ${whereClause}`)
    const total = countResult.length > 0 ? (countResult[0].values[0][0] as number) : 0

    // 获取列表
    const result = this.db.exec(
      `SELECT id, dialog_id, message_id, file_path, file_name, file_size, mime_type, width, height, favorite, created_at
       FROM images
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [pageSize, offset]
    )

    const images: ImageRecord[] = []
    if (result.length > 0) {
      result[0].values.forEach((row) => {
        images.push({
          id: row[0] as string,
          dialogId: (row[1] as string) || undefined,
          messageId: (row[2] as string) || undefined,
          filePath: row[3] as string,
          fileName: (row[4] as string) || undefined,
          fileSize: (row[5] as number) || undefined,
          mimeType: (row[6] as string) || undefined,
          width: (row[7] as number) || undefined,
          height: (row[8] as number) || undefined,
          favorite: !!row[9],
          createdAt: new Date(row[10] as string)
        })
      })
    }

    return {
      images,
      total,
      hasMore: offset + images.length < total
    }
  }

  /**
   * 根据ID获取图像
   * @param id - 图像ID
   * @returns Promise<ImageRecord | null>
   */
  async getById(id: string): Promise<ImageRecord | null> {
    const result = this.db.exec(
      `SELECT id, dialog_id, message_id, file_path, file_name, file_size, mime_type, width, height, favorite, created_at
       FROM images
       WHERE id = ?`,
      [id]
    )
    if (result.length > 0 && result[0].values.length > 0) {
      const row = result[0].values[0]
      return {
        id: row[0] as string,
        dialogId: (row[1] as string) || undefined,
        messageId: (row[2] as string) || undefined,
        filePath: row[3] as string,
        fileName: (row[4] as string) || undefined,
        fileSize: (row[5] as number) || undefined,
        mimeType: (row[6] as string) || undefined,
        width: (row[7] as number) || undefined,
        height: (row[8] as number) || undefined,
        favorite: !!row[9],
        createdAt: new Date(row[10] as string)
      }
    }
    return null
  }

  /**
   * 创建图像记录
   * @param image - 图像数据
   * @returns Promise<ImageRecord>
   */
  async create(image: Omit<ImageRecord, 'id' | 'createdAt' | 'favorite'>): Promise<ImageRecord> {
    const id = randomUUID()
    const now = new Date().toISOString()
    this.db.run(
      `INSERT INTO images (id, dialog_id, message_id, file_path, file_name, file_size, mime_type, width, height, favorite, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [
        id,
        image.dialogId || null,
        image.messageId || null,
        image.filePath,
        image.fileName || null,
        image.fileSize || null,
        image.mimeType || null,
        image.width || null,
        image.height || null,
        now
      ]
    )
    this.dbManager.save()
    return {
      id,
      dialogId: image.dialogId,
      messageId: image.messageId,
      filePath: image.filePath,
      fileName: image.fileName,
      fileSize: image.fileSize,
      mimeType: image.mimeType,
      width: image.width,
      height: image.height,
      favorite: false,
      createdAt: new Date(now)
    }
  }

  /**
   * 更新图像
   * @param id - 图像ID
   * @param data - 更新数据
   * @returns Promise<void>
   */
  async update(id: string, data: Partial<ImageRecord>): Promise<void> {
    const fields: string[] = []
    const values: any[] = []

    if (data.favorite !== undefined) {
      fields.push('favorite = ?')
      values.push(data.favorite ? 1 : 0)
    }

    if (fields.length > 0) {
      values.push(id)
      this.db.run(`UPDATE images SET ${fields.join(', ')} WHERE id = ?`, values)
      this.dbManager.save()
    }
  }

  /**
   * 删除图像
   * @param id - 图像ID
   * @returns Promise<void>
   */
  async delete(id: string): Promise<void> {
    this.db.run('DELETE FROM images WHERE id = ?', [id])
    this.dbManager.save()
  }

  /**
   * 切换收藏状态
   * @param id - 图像ID
   * @returns Promise<boolean> - 新的收藏状态
   */
  async toggleFavorite(id: string): Promise<boolean> {
    const image = await this.getById(id)
    if (!image) {
      throw new Error('Image not found')
    }
    const newFavorite = !image.favorite
    await this.update(id, { favorite: newFavorite })
    return newFavorite
  }

  /**
   * 统计图像数量
   * @param favoriteOnly - 只统计收藏
   * @returns Promise<number>
   */
  async count(favoriteOnly: boolean = false): Promise<number> {
    const whereClause = favoriteOnly ? 'WHERE favorite = 1' : ''
    const result = this.db.exec(`SELECT COUNT(*) as count FROM images ${whereClause}`)
    return result.length > 0 ? (result[0].values[0][0] as number) : 0
  }
}
