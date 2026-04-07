/**
 * 地点形象绑定仓库
 * @module database/repositories/location-binding.repository
 */

import Database from 'better-sqlite3'
import {
  LocationBinding,
  LocationBindingRecord,
  TimeOfDay,
  WeatherType
} from '../../../shared/types/story-to-video.types'

/**
 * 创建地点绑定请求
 */
export interface CreateLocationBindingRequest {
  projectId: string
  longWritingLocationId: string
  locationName: string
  imagePaths?: string[]
  thumbnailPath?: string
  generateConfig?: LocationBinding['generateConfig']
  generateImages?: boolean
}

/**
 * 更新地点绑定请求
 */
export interface UpdateLocationBindingRequest {
  imagePaths?: string[]
  thumbnailPath?: string | null
  generateConfig?: LocationBinding['generateConfig'] | null
  generateImages?: boolean
}

/**
 * 地点形象绑定仓库
 */
export class LocationBindingRepository {
  constructor(private db: Database.Database) {}

  /**
   * 根据项目 ID 获取所有地点绑定
   */
  getByProjectId(projectId: string): LocationBinding[] {
    const stmt = this.db.prepare(`
      SELECT * FROM location_bindings WHERE project_id = ?
    `)
    const rows = stmt.all(projectId) as LocationBindingRecord[]
    return rows.map(this.mapToBinding)
  }

  /**
   * 根据 ID 获取地点绑定
   */
  getById(id: string): LocationBinding | null {
    const stmt = this.db.prepare(`
      SELECT * FROM location_bindings WHERE id = ?
    `)
    const row = stmt.get(id) as LocationBindingRecord | undefined
    return row ? this.mapToBinding(row) : null
  }

  /**
   * 根据长文地点 ID 获取绑定
   */
  getByLongWritingLocationId(
    projectId: string,
    longWritingLocationId: string
  ): LocationBinding | null {
    const stmt = this.db.prepare(`
      SELECT * FROM location_bindings
      WHERE project_id = ? AND long_writing_location_id = ?
    `)
    const row = stmt.get(projectId, longWritingLocationId) as LocationBindingRecord | undefined
    return row ? this.mapToBinding(row) : null
  }

  /**
   * 创建地点绑定
   */
  create(data: CreateLocationBindingRequest): LocationBinding {
    const id = this.generateId()
    const now = Date.now()

    const stmt = this.db.prepare(`
      INSERT INTO location_bindings (
        id, project_id, long_writing_location_id, location_name,
        image_paths, thumbnail_path,
        generate_config, base_description, style_reference, additional_prompts,
        time_of_day, weather, generate_images,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      id,
      data.projectId,
      data.longWritingLocationId,
      data.locationName,
      JSON.stringify(data.imagePaths || []),
      data.thumbnailPath || null,
      data.generateConfig ? JSON.stringify(data.generateConfig) : null,
      data.generateConfig?.baseDescription || null,
      data.generateConfig?.styleReference || null,
      data.generateConfig?.additionalPrompts || null,
      data.generateConfig?.timeOfDay || null,
      data.generateConfig?.weather || null,
      data.generateImages ? 1 : 0,
      now,
      now
    )

    return {
      id,
      projectId: data.projectId,
      longWritingLocationId: data.longWritingLocationId,
      locationName: data.locationName,
      imagePaths: data.imagePaths || [],
      thumbnailPath: data.thumbnailPath,
      generateConfig: data.generateConfig,
      generateImages: data.generateImages ?? false,
      createdAt: now,
      updatedAt: now
    }
  }

  /**
   * 更新地点绑定
   */
  update(id: string, data: UpdateLocationBindingRequest): LocationBinding | null {
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
      updates.push('time_of_day = ?')
      values.push(data.generateConfig?.timeOfDay || null)
      updates.push('weather = ?')
      values.push(data.generateConfig?.weather || null)
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
      UPDATE location_bindings SET ${updates.join(', ')} WHERE id = ?
    `)
    stmt.run(...values)

    return this.getById(id)
  }

  /**
   * 添加图片到地点绑定
   */
  addImage(id: string, imagePath: string): boolean {
    const binding = this.getById(id)
    if (!binding) return false

    const newImagePaths = [...binding.imagePaths, imagePath]
    const stmt = this.db.prepare(`
      UPDATE location_bindings SET image_paths = ?, updated_at = ? WHERE id = ?
    `)
    stmt.run(JSON.stringify(newImagePaths), Date.now(), id)
    return true
  }

  /**
   * 删除地点绑定
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM location_bindings WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }

  /**
   * 根据项目 ID 删除所有地点绑定
   */
  deleteByProjectId(projectId: string): number {
    const stmt = this.db.prepare('DELETE FROM location_bindings WHERE project_id = ?')
    const result = stmt.run(projectId)
    return result.changes
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `lb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 映射数据库行到地点绑定对象
   */
  private mapToBinding(row: LocationBindingRecord): LocationBinding {
    let generateConfig: LocationBinding['generateConfig'] | undefined
    if (row.base_description || row.style_reference || row.additional_prompts) {
      generateConfig = {
        baseDescription: row.base_description || '',
        styleReference: row.style_reference || undefined,
        additionalPrompts: row.additional_prompts || undefined,
        timeOfDay: row.time_of_day as TimeOfDay | undefined,
        weather: row.weather as WeatherType | undefined
      }
    } else if (row.generate_config) {
      generateConfig = JSON.parse(row.generate_config)
    }

    return {
      id: row.id,
      projectId: row.project_id,
      longWritingLocationId: row.long_writing_location_id,
      locationName: row.location_name,
      imagePaths: JSON.parse(row.image_paths || '[]'),
      thumbnailPath: row.thumbnail_path || undefined,
      generateConfig,
      generateImages: !!row.generate_images,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }
}