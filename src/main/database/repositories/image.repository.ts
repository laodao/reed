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
   * 将数据库行转换为 ImageRecord 对象
   * @param row - 数据库行
   * @returns ImageRecord
   */
  private rowToImageRecord(row: any[]): ImageRecord {
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
      createdAt: new Date(row[10] as string),
      // 图像生成相关字段
      prompt: (row[11] as string) || undefined,
      negativePrompt: (row[12] as string) || undefined,
      style: (row[13] as string) || undefined,
      quality: (row[14] as string) || undefined,
      providerId: (row[15] as string) || undefined,
      modelId: (row[16] as string) || undefined,
      generationParams: row[17] ? JSON.parse(row[17] as string) : undefined,
      seed: (row[18] as number) || undefined,
      taskId: (row[19] as string) || undefined,
      status: (row[20] as string) || 'completed',
      errorMessage: (row[21] as string) || undefined
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
    const countResult = this.db.exec(
      `SELECT COUNT(*) as count FROM images ${whereClause}`,
      params
    )
    const total = countResult.length > 0 ? (countResult[0].values[0][0] as number) : 0

    // 获取列表
    const result = this.db.exec(
      `SELECT id, dialog_id, message_id, file_path, file_name, file_size, mime_type, width, height, favorite, created_at,
              prompt, negative_prompt, style, quality, provider_id, model_id, generation_params, seed, task_id, status, error_message
       FROM images
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    )

    const images: ImageRecord[] = []
    if (result.length > 0) {
      result[0].values.forEach((row) => {
        images.push(this.rowToImageRecord(row))
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
      `SELECT id, dialog_id, message_id, file_path, file_name, file_size, mime_type, width, height, favorite, created_at,
              prompt, negative_prompt, style, quality, provider_id, model_id, generation_params, seed, task_id, status, error_message
       FROM images
       WHERE id = ?`,
      [id]
    )
    if (result.length > 0 && result[0].values.length > 0) {
      return this.rowToImageRecord(result[0].values[0])
    }
    return null
  }

  /**
   * 根据任务ID获取图像
   * @param taskId - 任务ID
   * @returns Promise<ImageRecord[]>
   */
  async getByTaskId(taskId: string): Promise<ImageRecord[]> {
    const result = this.db.exec(
      `SELECT id, dialog_id, message_id, file_path, file_name, file_size, mime_type, width, height, favorite, created_at,
              prompt, negative_prompt, style, quality, provider_id, model_id, generation_params, seed, task_id, status, error_message
       FROM images
       WHERE task_id = ?
       ORDER BY created_at DESC`,
      [taskId]
    )

    const images: ImageRecord[] = []
    if (result.length > 0) {
      result[0].values.forEach((row) => {
        images.push(this.rowToImageRecord(row))
      })
    }
    return images
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

    this.db.run(
      `INSERT INTO images (id, dialog_id, message_id, file_path, file_name, file_size, mime_type, width, height, favorite, created_at,
                          prompt, negative_prompt, style, quality, provider_id, model_id, generation_params, seed, task_id, status, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      this.db.run(`UPDATE images SET ${fields.join(', ')} WHERE id = ?`, values)
      this.dbManager.save()
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
    this.db.run(`UPDATE images SET ${fields.join(', ')} WHERE id = ?`, values)
    this.dbManager.save()
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
    this.db.run(`UPDATE images SET ${fields.join(', ')} WHERE task_id = ?`, values)
    this.dbManager.save()

    // 返回更新的记录数
    const result = this.db.exec('SELECT changes() as count')
    return result.length > 0 ? (result[0].values[0][0] as number) : 0
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
   * 批量删除图像
   * @param ids - 图像ID列表
   * @returns Promise<number> - 删除的记录数
   */
  async deleteMany(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0

    const placeholders = ids.map(() => '?').join(', ')
    this.db.run(`DELETE FROM images WHERE id IN (${placeholders})`, ids)
    this.dbManager.save()

    const result = this.db.exec('SELECT changes() as count')
    return result.length > 0 ? (result[0].values[0][0] as number) : 0
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
    const result = this.db.exec(`SELECT COUNT(*) as count FROM images ${whereClause}`, params)
    return result.length > 0 ? (result[0].values[0][0] as number) : 0
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
    const countResult = this.db.exec(
      'SELECT COUNT(*) as count FROM images WHERE provider_id = ?',
      [providerId]
    )
    const total = countResult.length > 0 ? (countResult[0].values[0][0] as number) : 0

    // 获取列表
    const result = this.db.exec(
      `SELECT id, dialog_id, message_id, file_path, file_name, file_size, mime_type, width, height, favorite, created_at,
              prompt, negative_prompt, style, quality, provider_id, model_id, generation_params, seed, task_id, status, error_message
       FROM images
       WHERE provider_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [providerId, pageSize, offset]
    )

    const images: ImageRecord[] = []
    if (result.length > 0) {
      result[0].values.forEach((row) => {
        images.push(this.rowToImageRecord(row))
      })
    }

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
    const countResult = this.db.exec(
      'SELECT COUNT(*) as count FROM images WHERE model_id = ?',
      [modelId]
    )
    const total = countResult.length > 0 ? (countResult[0].values[0][0] as number) : 0

    // 获取列表
    const result = this.db.exec(
      `SELECT id, dialog_id, message_id, file_path, file_name, file_size, mime_type, width, height, favorite, created_at,
              prompt, negative_prompt, style, quality, provider_id, model_id, generation_params, seed, task_id, status, error_message
       FROM images
       WHERE model_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [modelId, pageSize, offset]
    )

    const images: ImageRecord[] = []
    if (result.length > 0) {
      result[0].values.forEach((row) => {
        images.push(this.rowToImageRecord(row))
      })
    }

    return {
      images,
      total,
      hasMore: offset + images.length < total
    }
  }
}