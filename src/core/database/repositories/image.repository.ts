/**
 * 图像数据访问层
 * @module database/repositories/image
 * @description 提供图像的数据库操作
 */

import Database from 'better-sqlite3'
import type { ImageRecord } from '@shared/types'
import { randomUUID } from 'crypto'

/**
 * 图像数据仓库
 */
export class ImageRepository {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  /**
   * 将数据库行转换为 ImageRecord 对象
   * @param row - 数据库行
   * @returns ImageRecord
   */
  private rowToImageRecord(row: any): ImageRecord {
    return {
      id: row.id,
      dialogId: row.dialog_id || undefined,
      messageId: row.message_id || undefined,
      filePath: row.file_path,
      fileName: row.file_name || undefined,
      fileSize: row.file_size || undefined,
      mimeType: row.mime_type || undefined,
      width: row.width || undefined,
      height: row.height || undefined,
      favorite: !!row.favorite,
      createdAt: new Date(row.created_at),
      // 图像生成相关字段
      prompt: row.prompt || undefined,
      negativePrompt: row.negative_prompt || undefined,
      style: row.style || undefined,
      quality: row.quality || undefined,
      providerId: row.provider_id || undefined,
      modelId: row.model_id || undefined,
      generationParams: row.generation_params ? JSON.parse(row.generation_params) : undefined,
      seed: row.seed || undefined,
      taskId: row.task_id || undefined,
      status: row.status || 'completed',
      errorMessage: row.error_message || undefined
    }
  }

  /**
   * 获取图像列表
   * @param page - 页码
   * @param pageSize - 每页数量
   * @param favoriteOnly - 只看收藏
   * @param status - 按状态筛选
   * @returns Promise<{ images: ImageRecord[], total: number, hasMore: boolean }>
   */
  async getList(
    page: number = 1,
    pageSize: number = 20,
    favoriteOnly: boolean = false,
    status?: string
  ): Promise<{ images: ImageRecord[]; total: number; hasMore: boolean }> {
    const offset = (page - 1) * pageSize
    const conditions: string[] = []
    const params: any[] = []

    if (favoriteOnly) {
      conditions.push('favorite = 1')
    }
    if (status) {
      conditions.push('status = ?')
      params.push(status)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // 获取总数
    const countRow = this.db.prepare(
      `SELECT COUNT(*) as count FROM images ${whereClause}`
    ).get(...params) as { count: number }
    const total = countRow?.count || 0

    // 获取列表
    const rows = this.db.prepare(
      `SELECT id, dialog_id, message_id, file_path, file_name, file_size, mime_type, width, height, favorite, created_at,
              prompt, negative_prompt, style, quality, provider_id, model_id, generation_params, seed, task_id, status, error_message
       FROM images
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    ).all(...params, pageSize, offset) as any[]

    const images = rows.map(row => this.rowToImageRecord(row))

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
    const row = this.db.prepare(
      `SELECT id, dialog_id, message_id, file_path, file_name, file_size, mime_type, width, height, favorite, created_at,
              prompt, negative_prompt, style, quality, provider_id, model_id, generation_params, seed, task_id, status, error_message
       FROM images
       WHERE id = ?`
    ).get(id) as any

    if (!row) return null
    return this.rowToImageRecord(row)
  }

  /**
   * 根据任务ID获取图像
   * @param taskId - 任务ID
   * @returns Promise<ImageRecord[]>
   */
  async getByTaskId(taskId: string): Promise<ImageRecord[]> {
    const rows = this.db.prepare(
      `SELECT id, dialog_id, message_id, file_path, file_name, file_size, mime_type, width, height, favorite, created_at,
              prompt, negative_prompt, style, quality, provider_id, model_id, generation_params, seed, task_id, status, error_message
       FROM images
       WHERE task_id = ?
       ORDER BY created_at DESC`
    ).all(taskId) as any[]

    return rows.map(row => this.rowToImageRecord(row))
  }

  /**
   * 创建图像记录
   * @param image - 图像数据
   * @returns Promise<ImageRecord>
   */
  async create(image: Omit<ImageRecord, 'id' | 'createdAt' | 'favorite'>): Promise<ImageRecord> {
    const id = randomUUID()
    const now = new Date().toISOString()
    const status = image.status || 'completed'

    this.db.prepare(
      `INSERT INTO images (id, dialog_id, message_id, file_path, file_name, file_size, mime_type, width, height, favorite, created_at,
                          prompt, negative_prompt, style, quality, provider_id, model_id, generation_params, seed, task_id, status, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      image.dialogId || null,
      image.messageId || null,
      image.filePath,
      image.fileName || null,
      image.fileSize || null,
      image.mimeType || null,
      image.width || null,
      image.height || null,
      now,
      // 图像生成相关字段
      image.prompt || null,
      image.negativePrompt || null,
      image.style || null,
      image.quality || null,
      image.providerId || null,
      image.modelId || null,
      image.generationParams ? JSON.stringify(image.generationParams) : null,
      image.seed || null,
      image.taskId || null,
      status,
      image.errorMessage || null
    )

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
      createdAt: new Date(now),
      prompt: image.prompt,
      negativePrompt: image.negativePrompt,
      style: image.style,
      quality: image.quality,
      providerId: image.providerId,
      modelId: image.modelId,
      generationParams: image.generationParams,
      seed: image.seed,
      taskId: image.taskId,
      status,
      errorMessage: image.errorMessage
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

    // 图像生成相关字段
    if (data.prompt !== undefined) {
      fields.push('prompt = ?')
      values.push(data.prompt || null)
    }
    if (data.negativePrompt !== undefined) {
      fields.push('negative_prompt = ?')
      values.push(data.negativePrompt || null)
    }
    if (data.style !== undefined) {
      fields.push('style = ?')
      values.push(data.style || null)
    }
    if (data.quality !== undefined) {
      fields.push('quality = ?')
      values.push(data.quality || null)
    }
    if (data.providerId !== undefined) {
      fields.push('provider_id = ?')
      values.push(data.providerId || null)
    }
    if (data.modelId !== undefined) {
      fields.push('model_id = ?')
      values.push(data.modelId || null)
    }
    if (data.generationParams !== undefined) {
      fields.push('generation_params = ?')
      values.push(data.generationParams ? JSON.stringify(data.generationParams) : null)
    }
    if (data.seed !== undefined) {
      fields.push('seed = ?')
      values.push(data.seed || null)
    }
    if (data.taskId !== undefined) {
      fields.push('task_id = ?')
      values.push(data.taskId || null)
    }
    if (data.status !== undefined) {
      fields.push('status = ?')
      values.push(data.status)
    }
    if (data.errorMessage !== undefined) {
      fields.push('error_message = ?')
      values.push(data.errorMessage || null)
    }

    // 文件相关字段
    if (data.filePath !== undefined) {
      fields.push('file_path = ?')
      values.push(data.filePath)
    }
    if (data.fileName !== undefined) {
      fields.push('file_name = ?')
      values.push(data.fileName || null)
    }
    if (data.fileSize !== undefined) {
      fields.push('file_size = ?')
      values.push(data.fileSize || null)
    }
    if (data.mimeType !== undefined) {
      fields.push('mime_type = ?')
      values.push(data.mimeType || null)
    }
    if (data.width !== undefined) {
      fields.push('width = ?')
      values.push(data.width || null)
    }
    if (data.height !== undefined) {
      fields.push('height = ?')
      values.push(data.height || null)
    }

    if (fields.length > 0) {
      values.push(id)
      this.db.prepare(`UPDATE images SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    }
  }

  /**
   * 更新图像状态
   * @param id - 图像ID
   * @param status - 新状态
   * @param errorMessage - 错误信息（可选）
   * @returns Promise<void>
   */
  async updateStatus(id: string, status: string, errorMessage?: string): Promise<void> {
    const fields = ['status = ?']
    const values: any[] = [status]

    if (errorMessage !== undefined) {
      fields.push('error_message = ?')
      values.push(errorMessage || null)
    }

    values.push(id)
    this.db.prepare(`UPDATE images SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  }

  /**
   * 根据任务ID更新状态
   * @param taskId - 任务ID
   * @param status - 新状态
   * @param errorMessage - 错误信息（可选）
   * @returns Promise<number> - 更新的记录数
   */
  async updateStatusByTaskId(taskId: string, status: string, errorMessage?: string): Promise<number> {
    const fields = ['status = ?']
    const values: any[] = [status]

    if (errorMessage !== undefined) {
      fields.push('error_message = ?')
      values.push(errorMessage || null)
    }

    values.push(taskId)
    const result = this.db.prepare(`UPDATE images SET ${fields.join(', ')} WHERE task_id = ?`).run(...values)
    return result.changes
  }

  /**
   * 删除图像
   * @param id - 图像ID
   * @returns Promise<void>
   */
  async delete(id: string): Promise<void> {
    this.db.prepare('DELETE FROM images WHERE id = ?').run(id)
  }

  /**
   * 批量删除图像
   * @param ids - 图像ID列表
   * @returns Promise<number> - 删除的记录数
   */
  async deleteMany(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0

    const placeholders = ids.map(() => '?').join(', ')
    const result = this.db.prepare(`DELETE FROM images WHERE id IN (${placeholders})`).run(...ids)
    return result.changes
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
   * @param status - 按状态筛选
   * @returns Promise<number>
   */
  async count(favoriteOnly: boolean = false, status?: string): Promise<number> {
    const conditions: string[] = []
    const params: any[] = []

    if (favoriteOnly) {
      conditions.push('favorite = 1')
    }
    if (status) {
      conditions.push('status = ?')
      params.push(status)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const row = this.db.prepare(`SELECT COUNT(*) as count FROM images ${whereClause}`).get(...params) as { count: number }
    return row?.count || 0
  }

  /**
   * 获取指定 Provider 的图像列表
   * @param providerId - Provider ID
   * @param page - 页码
   * @param pageSize - 每页数量
   * @returns Promise<{ images: ImageRecord[], total: number, hasMore: boolean }>
   */
  async getByProvider(
    providerId: string,
    page: number = 1,
    pageSize: number = 20
  ): Promise<{ images: ImageRecord[]; total: number; hasMore: boolean }> {
    const offset = (page - 1) * pageSize

    // 获取总数
    const countRow = this.db.prepare(
      'SELECT COUNT(*) as count FROM images WHERE provider_id = ?'
    ).get(providerId) as { count: number }
    const total = countRow?.count || 0

    // 获取列表
    const rows = this.db.prepare(
      `SELECT id, dialog_id, message_id, file_path, file_name, file_size, mime_type, width, height, favorite, created_at,
              prompt, negative_prompt, style, quality, provider_id, model_id, generation_params, seed, task_id, status, error_message
       FROM images
       WHERE provider_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    ).all(providerId, pageSize, offset) as any[]

    const images = rows.map(row => this.rowToImageRecord(row))

    return {
      images,
      total,
      hasMore: offset + images.length < total
    }
  }

  /**
   * 获取指定模型的图像列表
   * @param modelId - 模型 ID
   * @param page - 页码
   * @param pageSize - 每页数量
   * @returns Promise<{ images: ImageRecord[], total: number, hasMore: boolean }>
   */
  async getByModel(
    modelId: string,
    page: number = 1,
    pageSize: number = 20
  ): Promise<{ images: ImageRecord[]; total: number; hasMore: boolean }> {
    const offset = (page - 1) * pageSize

    // 获取总数
    const countRow = this.db.prepare(
      'SELECT COUNT(*) as count FROM images WHERE model_id = ?'
    ).get(modelId) as { count: number }
    const total = countRow?.count || 0

    // 获取列表
    const rows = this.db.prepare(
      `SELECT id, dialog_id, message_id, file_path, file_name, file_size, mime_type, width, height, favorite, created_at,
              prompt, negative_prompt, style, quality, provider_id, model_id, generation_params, seed, task_id, status, error_message
       FROM images
       WHERE model_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    ).all(modelId, pageSize, offset) as any[]

    const images = rows.map(row => this.rowToImageRecord(row))

    return {
      images,
      total,
      hasMore: offset + images.length < total
    }
  }
}