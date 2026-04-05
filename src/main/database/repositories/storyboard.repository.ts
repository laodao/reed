/**
 * 分镜仓库
 * @module database/repositories/storyboard.repository
 */

import Database from 'better-sqlite3'
import {
  Storyboard,
  StoryboardRecord,
  StoryboardCharacter,
  StoryboardStatus,
  ShotType,
  CameraAngle,
  CameraMovement,
  TransitionConfig,
  ImageAsset
} from '../../../shared/types/story-to-video.types'

/**
 * 创建分镜请求
 */
export interface CreateStoryboardRequest {
  sceneScriptId: string
  shotNumber: number
  shotType: ShotType
  cameraAngle: CameraAngle
  cameraMovement: CameraMovement
  movementDuration?: number
  frameDescription: string
  subject?: string
  composition?: string
  characters: StoryboardCharacter[]
  narrationId?: string
  dialogueIds: string[]
  actionIds: string[]
  duration: number
  transition: TransitionConfig
}

/**
 * 更新分镜请求
 */
export interface UpdateStoryboardRequest {
  shotType?: ShotType
  cameraAngle?: CameraAngle
  cameraMovement?: CameraMovement
  movementDuration?: number
  frameDescription?: string
  subject?: string
  composition?: string
  characters?: StoryboardCharacter[]
  narrationId?: string
  dialogueIds?: string[]
  actionIds?: string[]
  frameImage?: ImageAsset
  duration?: number
  transition?: TransitionConfig
  status?: StoryboardStatus
}

/**
 * 分镜仓库
 */
export class StoryboardRepository {
  constructor(private db: Database.Database) {}

  /**
   * 根据场景剧本 ID 获取所有分镜
   */
  getBySceneScriptId(sceneScriptId: string): Storyboard[] {
    const stmt = this.db.prepare(`
      SELECT * FROM storyboards WHERE scene_script_id = ? ORDER BY shot_number ASC
    `)
    const rows = stmt.all(sceneScriptId) as StoryboardRecord[]
    return rows.map(this.mapToStoryboard)
  }

  /**
   * 根据 ID 获取分镜
   */
  getById(id: string): Storyboard | null {
    const stmt = this.db.prepare(`
      SELECT * FROM storyboards WHERE id = ?
    `)
    const row = stmt.get(id) as StoryboardRecord | undefined
    return row ? this.mapToStoryboard(row) : null
  }

  /**
   * 创建分镜
   */
  create(data: CreateStoryboardRequest): Storyboard {
    const id = this.generateId()
    const now = Date.now()

    const stmt = this.db.prepare(`
      INSERT INTO storyboards (id, scene_script_id, shot_number, shot_type, camera_angle, camera_movement, movement_duration, frame_description, subject, composition, characters, narration_id, dialogue_ids, action_ids, frame_image, duration, transition, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      id,
      data.sceneScriptId,
      data.shotNumber,
      data.shotType,
      data.cameraAngle,
      data.cameraMovement,
      data.movementDuration || null,
      data.frameDescription,
      data.subject || null,
      data.composition || null,
      JSON.stringify(data.characters),
      data.narrationId || null,
      JSON.stringify(data.dialogueIds),
      JSON.stringify(data.actionIds),
      null,
      data.duration,
      JSON.stringify(data.transition),
      'pending',
      now,
      now
    )

    return {
      id,
      sceneScriptId: data.sceneScriptId,
      shotNumber: data.shotNumber,
      shotType: data.shotType,
      cameraAngle: data.cameraAngle,
      cameraMovement: data.cameraMovement,
      movementDuration: data.movementDuration,
      frameDescription: data.frameDescription,
      subject: data.subject,
      composition: data.composition,
      characters: data.characters,
      narrationId: data.narrationId,
      dialogueIds: data.dialogueIds,
      actionIds: data.actionIds,
      duration: data.duration,
      transition: data.transition,
      status: 'pending',
      createdAt: now,
      updatedAt: now
    }
  }

  /**
   * 批量创建分镜
   */
  createMany(storyboards: CreateStoryboardRequest[]): Storyboard[] {
    const results: Storyboard[] = []
    const transaction = this.db.transaction(() => {
      for (const data of storyboards) {
        results.push(this.create(data))
      }
    })
    transaction()
    return results
  }

  /**
   * 更新分镜
   */
  update(id: string, data: UpdateStoryboardRequest): Storyboard | null {
    const storyboard = this.getById(id)
    if (!storyboard) return null

    const updates: string[] = []
    const values: any[] = []

    if (data.shotType !== undefined) {
      updates.push('shot_type = ?')
      values.push(data.shotType)
    }
    if (data.cameraAngle !== undefined) {
      updates.push('camera_angle = ?')
      values.push(data.cameraAngle)
    }
    if (data.cameraMovement !== undefined) {
      updates.push('camera_movement = ?')
      values.push(data.cameraMovement)
    }
    if (data.movementDuration !== undefined) {
      updates.push('movement_duration = ?')
      values.push(data.movementDuration || null)
    }
    if (data.frameDescription !== undefined) {
      updates.push('frame_description = ?')
      values.push(data.frameDescription)
    }
    if (data.subject !== undefined) {
      updates.push('subject = ?')
      values.push(data.subject || null)
    }
    if (data.composition !== undefined) {
      updates.push('composition = ?')
      values.push(data.composition || null)
    }
    if (data.characters !== undefined) {
      updates.push('characters = ?')
      values.push(JSON.stringify(data.characters))
    }
    if (data.narrationId !== undefined) {
      updates.push('narration_id = ?')
      values.push(data.narrationId || null)
    }
    if (data.dialogueIds !== undefined) {
      updates.push('dialogue_ids = ?')
      values.push(JSON.stringify(data.dialogueIds))
    }
    if (data.actionIds !== undefined) {
      updates.push('action_ids = ?')
      values.push(JSON.stringify(data.actionIds))
    }
    if (data.frameImage !== undefined) {
      updates.push('frame_image = ?')
      values.push(data.frameImage ? JSON.stringify(data.frameImage) : null)
    }
    if (data.duration !== undefined) {
      updates.push('duration = ?')
      values.push(data.duration)
    }
    if (data.transition !== undefined) {
      updates.push('transition = ?')
      values.push(JSON.stringify(data.transition))
    }
    if (data.status !== undefined) {
      updates.push('status = ?')
      values.push(data.status)
    }

    if (updates.length === 0) return storyboard

    updates.push('updated_at = ?')
    values.push(Date.now())
    values.push(id)

    const stmt = this.db.prepare(`
      UPDATE storyboards SET ${updates.join(', ')} WHERE id = ?
    `)
    stmt.run(...values)

    return this.getById(id)
  }

  /**
   * 删除分镜
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM storyboards WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }

  /**
   * 根据场景剧本 ID 删除所有分镜
   */
  deleteBySceneScriptId(sceneScriptId: string): number {
    const stmt = this.db.prepare('DELETE FROM storyboards WHERE scene_script_id = ?')
    const result = stmt.run(sceneScriptId)
    return result.changes
  }

  /**
   * 获取分镜数量
   */
  countBySceneScriptId(sceneScriptId: string): number {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM storyboards WHERE scene_script_id = ?
    `)
    const row = stmt.get(sceneScriptId) as { count: number }
    return row.count
  }

  /**
   * 批量更新分镜状态
   */
  updateStatusBySceneScriptId(sceneScriptId: string, status: StoryboardStatus): number {
    const stmt = this.db.prepare(`
      UPDATE storyboards SET status = ?, updated_at = ? WHERE scene_script_id = ?
    `)
    const result = stmt.run(status, Date.now(), sceneScriptId)
    return result.changes
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `sb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 映射数据库行到分镜对象
   */
  private mapToStoryboard(row: StoryboardRecord): Storyboard {
    return {
      id: row.id,
      sceneScriptId: row.scene_script_id,
      shotNumber: row.shot_number,
      shotType: row.shot_type as ShotType,
      cameraAngle: row.camera_angle as CameraAngle,
      cameraMovement: row.camera_movement as CameraMovement,
      movementDuration: row.movement_duration || undefined,
      frameDescription: row.frame_description,
      subject: row.subject || undefined,
      composition: row.composition || undefined,
      characters: JSON.parse(row.characters) as StoryboardCharacter[],
      narrationId: row.narration_id || undefined,
      dialogueIds: JSON.parse(row.dialogue_ids) as string[],
      actionIds: JSON.parse(row.action_ids) as string[],
      frameImage: row.frame_image ? JSON.parse(row.frame_image) as ImageAsset : undefined,
      duration: row.duration,
      transition: JSON.parse(row.transition) as TransitionConfig,
      status: row.status as StoryboardStatus,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }
}