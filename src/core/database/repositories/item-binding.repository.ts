/**
 * 物品形象绑定仓库
 * @module database/repositories/item-binding.repository
 */

import Database from 'better-sqlite3'
import {
  ItemBinding,
  ItemBindingRecord
} from '@shared/types/story-to-video.types'

/**
 * 创建物品绑定请求
 */
export interface CreateItemBindingRequest {
  projectId: string
  longWritingItemId: string
  itemName: string
  imagePaths?: string[]
  thumbnailPath?: string
  generateConfig?: ItemBinding['generateConfig']
  generateImages?: boolean
}

/**
 * 更新物品绑定请求
 */
export interface UpdateItemBindingRequest {
  imagePaths?: string[]
  thumbnailPath?: string | null
  generateConfig?: ItemBinding['generateConfig'] | null
  generateImages?: boolean
}

/**
 * 物品形象绑定仓库
 */
export class ItemBindingRepository {
  constructor(private db: Database.Database) {}

  /**
   * 根据项目 ID 获取所有物品绑定
   */
  getByProjectId(projectId: string): ItemBinding[] {
    const stmt = this.db.prepare(`
      SELECT * FROM item_bindings WHERE project_id = ?
    `)
    const rows = stmt.all(projectId) as ItemBindingRecord[]
    return rows.map(this.mapToBinding)
  }

  /**
   * 根据 ID 获取物品绑定
   */
  getById(id: string): ItemBinding | null {
    const stmt = this.db.prepare(`
      SELECT * FROM item_bindings WHERE id = ?
    `)
    const row = stmt.get(id) as ItemBindingRecord | undefined
    return row ? this.mapToBinding(row) : null
  }

  /**
   * 根据长文物品 ID 获取绑定
   */
  getByLongWritingItemId(
    projectId: string,
    longWritingItemId: string
  ): ItemBinding | null {
    const stmt = this.db.prepare(`
      SELECT * FROM item_bindings
      WHERE project_id = ? AND long_writing_item_id = ?
    `)
    const row = stmt.get(projectId, longWritingItemId) as ItemBindingRecord | undefined
    return row ? this.mapToBinding(row) : null
  }

  /**
   * 创建物品绑定
   */
  create(data: CreateItemBindingRequest): ItemBinding {
    const id = this.generateId()
    const now = Date.now()

    const stmt = this.db.prepare(`
      INSERT INTO item_bindings (
        id, project_id, long_writing_item_id, item_name,
        image_paths, thumbnail_path,
        generate_config, base_description, style_reference, additional_prompts,
        generate_images,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      id,
      data.projectId,
      data.longWritingItemId,
      data.itemName,
      JSON.stringify(data.imagePaths || []),
      data.thumbnailPath || null,
      data.generateConfig ? JSON.stringify(data.generateConfig) : null,
      data.generateConfig?.baseDescription || null,
      data.generateConfig?.styleReference || null,
      data.generateConfig?.additionalPrompts || null,
      data.generateImages ? 1 : 0,
      now,
      now
    )

    return {
      id,
      projectId: data.projectId,
      longWritingItemId: data.longWritingItemId,
      itemName: data.itemName,
      imagePaths: data.imagePaths || [],
      thumbnailPath: data.thumbnailPath,
      generateConfig: data.generateConfig,
      generateImages: data.generateImages ?? false,
      createdAt: now,
      updatedAt: now
    }
  }

  /**
   * 更新物品绑定
   */
  update(id: string, data: UpdateItemBindingRequest): ItemBinding | null {
    const binding = this.getById(id)
    if (!binding) return null

    const updates: string[] = []
    const values: any[] = []

    if (data.imagePaths !== undefined) {
      updates.push('image_paths = ?')
      values.push(JSON.stringify(data.imagePaths))
    }
    if (data.thumbnailPath !== undefined) {
      updates.push('thumbnail_path = ?')
      values.push(data.thumbnailPath || null)
    }
    if (data.generateConfig !== undefined) {
      updates.push('generate_config = ?')
      values.push(data.generateConfig ? JSON.stringify(data.generateConfig) : null)
      updates.push('base_description = ?')
      values.push(data.generateConfig?.baseDescription || null)
      updates.push('style_reference = ?')
      values.push(data.generateConfig?.styleReference || null)
      updates.push('additional_prompts = ?')
      values.push(data.generateConfig?.additionalPrompts || null)
    }
    if (data.generateImages !== undefined) {
      updates.push('generate_images = ?')
      values.push(data.generateImages ? 1 : 0)
    }

    if (updates.length === 0) return binding

    updates.push('updated_at = ?')
    values.push(Date.now())
    values.push(id)

    const stmt = this.db.prepare(`
      UPDATE item_bindings SET ${updates.join(', ')} WHERE id = ?
    `)
    stmt.run(...values)

    return this.getById(id)
  }

  /**
   * 添加图片到物品绑定
   */
  addImage(id: string, imagePath: string): boolean {
    const binding = this.getById(id)
    if (!binding) return false

    const newImagePaths = [...binding.imagePaths, imagePath]
    const stmt = this.db.prepare(`
      UPDATE item_bindings SET image_paths = ?, updated_at = ? WHERE id = ?
    `)
    stmt.run(JSON.stringify(newImagePaths), Date.now(), id)
    return true
  }

  /**
   * 删除物品绑定
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM item_bindings WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }

  /**
   * 根据项目 ID 删除所有物品绑定
   */
  deleteByProjectId(projectId: string): number {
    const stmt = this.db.prepare('DELETE FROM item_bindings WHERE project_id = ?')
    const result = stmt.run(projectId)
    return result.changes
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `ib_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 映射数据库行到物品绑定对象
   */
  private mapToBinding(row: ItemBindingRecord): ItemBinding {
    let generateConfig: ItemBinding['generateConfig'] | undefined
    if (row.base_description || row.style_reference || row.additional_prompts) {
      generateConfig = {
        baseDescription: row.base_description || '',
        styleReference: row.style_reference || undefined,
        additionalPrompts: row.additional_prompts || undefined
      }
    } else if (row.generate_config) {
      generateConfig = JSON.parse(row.generate_config)
    }

    return {
      id: row.id,
      projectId: row.project_id,
      longWritingItemId: row.long_writing_item_id,
      itemName: row.item_name,
      imagePaths: JSON.parse(row.image_paths || '[]'),
      thumbnailPath: row.thumbnail_path || undefined,
      generateConfig,
      generateImages: !!row.generate_images,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }
}