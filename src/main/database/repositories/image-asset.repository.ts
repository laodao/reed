/**
 * 图像资产仓库
 * @module database/repositories/image-asset.repository
 */

import Database from 'better-sqlite3'
import {
  ImageAsset,
  ImageAssetRecord,
  ImageAssetType
} from '../../../shared/types/story-to-video.types'

/**
 * 创建图像资产请求
 */
export interface CreateImageAssetRequest {
  projectId: string
  type: ImageAssetType
  provider?: string
  model?: string
  prompt: string
  negativePrompt?: string
  imagePath: string
  thumbnailPath?: string
  width: number
  height: number
  metadata?: Record<string, any>
}

/**
 * 更新图像资产请求
 */
export interface UpdateImageAssetRequest {
  provider?: string
  model?: string
  prompt?: string
  negativePrompt?: string
  imagePath?: string
  thumbnailPath?: string
  width?: number
  height?: number
  metadata?: Record<string, any>
}

/**
 * 图像资产仓库
 */
export class ImageAssetRepository {
  constructor(private db: Database.Database) {}

  /**
   * 根据项目ID获取所有图像资产
   */
  getByProjectId(projectId: string): ImageAsset[] {
    const stmt = this.db.prepare(`
      SELECT * FROM image_assets WHERE project_id = ? ORDER BY created_at DESC
    `)
    const rows = stmt.all(projectId) as ImageAssetRecord[]
    return rows.map(this.mapToImageAsset)
  }

  /**
   * 根据ID获取图像资产
   */
  getById(id: string): ImageAsset | null {
    const stmt = this.db.prepare('SELECT * FROM image_assets WHERE id = ?')
    const row = stmt.get(id) as ImageAssetRecord | undefined
    return row ? this.mapToImageAsset(row) : null
  }

  /**
   * 根据类型获取图像资产
   */
  getByType(projectId: string, type: ImageAssetType): ImageAsset[] {
    const stmt = this.db.prepare(`
      SELECT * FROM image_assets WHERE project_id = ? AND type = ? ORDER BY created_at DESC
    `)
    const rows = stmt.all(projectId, type) as ImageAssetRecord[]
    return rows.map(this.mapToImageAsset)
  }

  /**
   * 创建图像资产
   */
  create(data: CreateImageAssetRequest): ImageAsset {
    const id = this.generateId()
    const now = Date.now()

    const stmt = this.db.prepare(`
      INSERT INTO image_assets (id, project_id, type, provider, model, prompt, negative_prompt, image_path, thumbnail_path, width, height, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      id,
      data.projectId,
      data.type,
      data.provider || null,
      data.model || null,
      data.prompt,
      data.negativePrompt || null,
      data.imagePath,
      data.thumbnailPath || null,
      data.width,
      data.height,
      data.metadata ? JSON.stringify(data.metadata) : null,
      now
    )

    return {
      id,
      type: data.type,
      provider: data.provider,
      model: data.model,
      prompt: data.prompt,
      negativePrompt: data.negativePrompt,
      imagePath: data.imagePath,
      thumbnailPath: data.thumbnailPath,
      width: data.width,
      height: data.height,
      metadata: data.metadata,
      createdAt: now
    }
  }

  /**
   * 更新图像资产
   */
  update(id: string, data: UpdateImageAssetRequest): ImageAsset | null {
    const asset = this.getById(id)
    if (!asset) return null

    const updates: string[] = []
    const values: any[] = []

    if (data.provider !== undefined) {
      updates.push('provider = ?')
      values.push(data.provider || null)
    }
    if (data.model !== undefined) {
      updates.push('model = ?')
      values.push(data.model || null)
    }
    if (data.prompt !== undefined) {
      updates.push('prompt = ?')
      values.push(data.prompt)
    }
    if (data.negativePrompt !== undefined) {
      updates.push('negative_prompt = ?')
      values.push(data.negativePrompt || null)
    }
    if (data.imagePath !== undefined) {
      updates.push('image_path = ?')
      values.push(data.imagePath)
    }
    if (data.thumbnailPath !== undefined) {
      updates.push('thumbnail_path = ?')
      values.push(data.thumbnailPath || null)
    }
    if (data.width !== undefined) {
      updates.push('width = ?')
      values.push(data.width)
    }
    if (data.height !== undefined) {
      updates.push('height = ?')
      values.push(data.height)
    }
    if (data.metadata !== undefined) {
      updates.push('metadata = ?')
      values.push(data.metadata ? JSON.stringify(data.metadata) : null)
    }

    if (updates.length === 0) return asset

    values.push(id)
    const stmt = this.db.prepare(`UPDATE image_assets SET ${updates.join(', ')} WHERE id = ?`)
    stmt.run(...values)

    return this.getById(id)
  }

  /**
   * 删除图像资产
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM image_assets WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }

  /**
   * 根据项目ID删除所有图像资产
   */
  deleteByProjectId(projectId: string): number {
    const stmt = this.db.prepare('DELETE FROM image_assets WHERE project_id = ?')
    const result = stmt.run(projectId)
    return result.changes
  }

  /**
   * 获取图像资产数量
   */
  countByProjectId(projectId: string): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM image_assets WHERE project_id = ?')
    const row = stmt.get(projectId) as { count: number }
    return row.count
  }

  /**
   * 生成唯一ID
   */
  private generateId(): string {
    return `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 映射数据库行到图像资产对象
   */
  private mapToImageAsset(row: ImageAssetRecord): ImageAsset {
    return {
      id: row.id,
      type: row.type as ImageAssetType,
      provider: row.provider || undefined,
      model: row.model || undefined,
      prompt: row.prompt,
      negativePrompt: row.negative_prompt || undefined,
      imagePath: row.image_path,
      thumbnailPath: row.thumbnail_path || undefined,
      width: row.width,
      height: row.height,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: row.created_at
    }
  }
}