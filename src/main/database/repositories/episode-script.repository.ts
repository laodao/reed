/**
 * 剧本仓库
 * @module database/repositories/episode-script.repository
 */

import Database from 'better-sqlite3'
import {
  EpisodeScript,
  EpisodeScriptRecord,
  SceneScript,
  ScriptStatus
} from '../../../shared/types/story-to-video.types'

/**
 * 创建剧本请求
 */
export interface CreateEpisodeScriptRequest {
  projectId: string
  episodeId: string
  outlineId: string
  synopsis?: string
}

/**
 * 更新剧本请求
 */
export interface UpdateEpisodeScriptRequest {
  synopsis?: string
  scenes?: SceneScript[]
  totalDuration?: number
  characterAppearances?: string[]
  status?: ScriptStatus
}

/**
 * 剧本仓库
 */
export class EpisodeScriptRepository {
  constructor(private db: Database.Database) {}

  /**
   * 根据剧集 ID 获取剧本
   */
  getByEpisodeId(episodeId: string): EpisodeScript | null {
    const stmt = this.db.prepare(`
      SELECT * FROM episode_scripts WHERE episode_id = ?
    `)
    const row = stmt.get(episodeId) as EpisodeScriptRecord | undefined
    return row ? this.mapToScript(row) : null
  }

  /**
   * 根据 ID 获取剧本
   */
  getById(id: string): EpisodeScript | null {
    const stmt = this.db.prepare(`
      SELECT * FROM episode_scripts WHERE id = ?
    `)
    const row = stmt.get(id) as EpisodeScriptRecord | undefined
    return row ? this.mapToScript(row) : null
  }

  /**
   * 根据项目 ID 获取所有剧本
   */
  getByProjectId(projectId: string): EpisodeScript[] {
    const stmt = this.db.prepare(`
      SELECT * FROM episode_scripts WHERE project_id = ? ORDER BY created_at ASC
    `)
    const rows = stmt.all(projectId) as EpisodeScriptRecord[]
    return rows.map(this.mapToScript)
  }

  /**
   * 创建剧本
   */
  create(data: CreateEpisodeScriptRequest): EpisodeScript {
    const id = this.generateId()
    const now = Date.now()

    const stmt = this.db.prepare(`
      INSERT INTO episode_scripts (id, project_id, episode_id, outline_id, status, synopsis, scenes, total_duration, character_appearances, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      id,
      data.projectId,
      data.episodeId,
      data.outlineId,
      'pending',
      data.synopsis || '',
      JSON.stringify([]),
      0,
      JSON.stringify([]),
      now,
      now
    )

    return {
      id,
      projectId: data.projectId,
      episodeId: data.episodeId,
      outlineId: data.outlineId,
      status: 'pending',
      synopsis: data.synopsis || '',
      scenes: [],
      totalDuration: 0,
      characterAppearances: [],
      createdAt: now,
      updatedAt: now
    }
  }

  /**
   * 更新剧本
   */
  update(id: string, data: UpdateEpisodeScriptRequest): EpisodeScript | null {
    const script = this.getById(id)
    if (!script) return null

    const updates: string[] = []
    const values: any[] = []

    if (data.synopsis !== undefined) {
      updates.push('synopsis = ?')
      values.push(data.synopsis)
    }
    if (data.scenes !== undefined) {
      updates.push('scenes = ?')
      values.push(JSON.stringify(data.scenes))
    }
    if (data.totalDuration !== undefined) {
      updates.push('total_duration = ?')
      values.push(data.totalDuration)
    }
    if (data.characterAppearances !== undefined) {
      updates.push('character_appearances = ?')
      values.push(JSON.stringify(data.characterAppearances))
    }
    if (data.status !== undefined) {
      updates.push('status = ?')
      values.push(data.status)
    }

    if (updates.length === 0) return script

    updates.push('updated_at = ?')
    values.push(Date.now())
    values.push(id)

    const stmt = this.db.prepare(`
      UPDATE episode_scripts SET ${updates.join(', ')} WHERE id = ?
    `)
    stmt.run(...values)

    return this.getById(id)
  }

  /**
   * 删除剧本
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM episode_scripts WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `es_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 映射数据库行到剧本对象
   */
  private mapToScript(row: EpisodeScriptRecord): EpisodeScript {
    return {
      id: row.id,
      projectId: row.project_id,
      episodeId: row.episode_id,
      outlineId: row.outline_id,
      status: row.status as ScriptStatus,
      synopsis: row.synopsis,
      scenes: JSON.parse(row.scenes) as SceneScript[],
      totalDuration: row.total_duration,
      characterAppearances: JSON.parse(row.character_appearances) as string[],
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }
}