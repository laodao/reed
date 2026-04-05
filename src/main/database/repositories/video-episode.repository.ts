/**
 * 剧集仓库
 * @module database/repositories/video-episode.repository
 */

import Database from 'better-sqlite3'
import {
  VideoEpisode,
  VideoEpisodeRecord,
  AudioTrack,
  EpisodeStatus
} from '../../../shared/types/story-to-video.types'

/**
 * 创建剧集请求
 */
export interface CreateVideoEpisodeRequest {
  projectId: string
  outlineId: string
  episodeNumber: number
  title: string
}

/**
 * 更新剧集请求
 */
export interface UpdateVideoEpisodeRequest {
  title?: string
  status?: EpisodeStatus
  duration?: number
  scriptId?: string
  audioTracks?: AudioTrack[]
}

/**
 * 剧集仓库
 */
export class VideoEpisodeRepository {
  constructor(private db: Database.Database) {}

  /**
   * 根据项目 ID 获取所有剧集（排除已删除的）
   */
  getByProjectId(projectId: string): VideoEpisode[] {
    const stmt = this.db.prepare(`
      SELECT * FROM video_episodes WHERE project_id = ? AND deleted_at IS NULL ORDER BY episode_number ASC
    `)
    const rows = stmt.all(projectId) as VideoEpisodeRecord[]
    return rows.map(this.mapToEpisode)
  }

  /**
   * 根据 ID 获取剧集（排除已删除的）
   */
  getById(id: string): VideoEpisode | null {
    const stmt = this.db.prepare(`
      SELECT * FROM video_episodes WHERE id = ? AND deleted_at IS NULL
    `)
    const row = stmt.get(id) as VideoEpisodeRecord | undefined
    return row ? this.mapToEpisode(row) : null
  }

  /**
   * 根据大纲 ID 获取剧集（排除已删除的）
   */
  getByOutlineId(projectId: string, outlineId: string): VideoEpisode | null {
    const stmt = this.db.prepare(`
      SELECT * FROM video_episodes WHERE project_id = ? AND outline_id = ? AND deleted_at IS NULL
    `)
    const row = stmt.get(projectId, outlineId) as VideoEpisodeRecord | undefined
    return row ? this.mapToEpisode(row) : null
  }

  /**
   * 创建剧集
   */
  create(data: CreateVideoEpisodeRequest): VideoEpisode {
    const id = this.generateId()
    const now = Date.now()

    const stmt = this.db.prepare(`
      INSERT INTO video_episodes (id, project_id, outline_id, episode_number, title, status, duration, script_id, audio_tracks, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      id,
      data.projectId,
      data.outlineId,
      data.episodeNumber,
      data.title,
      'pending',
      0,
      null,
      JSON.stringify([]),
      now,
      now
    )

    return {
      id,
      projectId: data.projectId,
      outlineId: data.outlineId,
      episodeNumber: data.episodeNumber,
      title: data.title,
      status: 'pending',
      duration: 0,
      audioTracks: [],
      createdAt: now,
      updatedAt: now
    }
  }

  /**
   * 批量创建剧集
   */
  createMany(episodes: CreateVideoEpisodeRequest[]): VideoEpisode[] {
    const results: VideoEpisode[] = []
    const transaction = this.db.transaction(() => {
      for (const data of episodes) {
        results.push(this.create(data))
      }
    })
    transaction()
    return results
  }

  /**
   * 更新剧集
   */
  update(id: string, data: UpdateVideoEpisodeRequest): VideoEpisode | null {
    const episode = this.getById(id)
    if (!episode) return null

    const updates: string[] = []
    const values: any[] = []

    if (data.title !== undefined) {
      updates.push('title = ?')
      values.push(data.title)
    }
    if (data.status !== undefined) {
      updates.push('status = ?')
      values.push(data.status)
    }
    if (data.duration !== undefined) {
      updates.push('duration = ?')
      values.push(data.duration)
    }
    if (data.scriptId !== undefined) {
      updates.push('script_id = ?')
      values.push(data.scriptId || null)
    }
    if (data.audioTracks !== undefined) {
      updates.push('audio_tracks = ?')
      values.push(JSON.stringify(data.audioTracks))
    }

    if (updates.length === 0) return episode

    updates.push('updated_at = ?')
    values.push(Date.now())
    values.push(id)

    const stmt = this.db.prepare(`
      UPDATE video_episodes SET ${updates.join(', ')} WHERE id = ?
    `)
    stmt.run(...values)

    return this.getById(id)
  }

  /**
   * 删除剧集（逻辑删除）
   */
  delete(id: string): boolean {
    const now = Date.now()
    const stmt = this.db.prepare('UPDATE video_episodes SET deleted_at = ?, updated_at = ? WHERE id = ?')
    const result = stmt.run(now, now, id)
    return result.changes > 0
  }

  /**
   * 根据项目 ID 删除所有剧集（逻辑删除）
   */
  deleteByProjectId(projectId: string): number {
    const now = Date.now()
    const stmt = this.db.prepare('UPDATE video_episodes SET deleted_at = ?, updated_at = ? WHERE project_id = ?')
    const result = stmt.run(now, now, projectId)
    return result.changes
  }

  /**
   * 恢复已删除的剧集
   */
  restore(id: string): boolean {
    const stmt = this.db.prepare('UPDATE video_episodes SET deleted_at = NULL, updated_at = ? WHERE id = ?')
    const result = stmt.run(Date.now(), id)
    return result.changes > 0
  }

  /**
   * 获取剧集数量
   */
  countByProjectId(projectId: string): number {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM video_episodes WHERE project_id = ?
    `)
    const row = stmt.get(projectId) as { count: number }
    return row.count
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `ve_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 映射数据库行到剧集对象
   */
  private mapToEpisode(row: VideoEpisodeRecord): VideoEpisode {
    return {
      id: row.id,
      projectId: row.project_id,
      outlineId: row.outline_id,
      episodeNumber: row.episode_number,
      title: row.title,
      status: row.status as EpisodeStatus,
      duration: row.duration,
      scriptId: row.script_id || undefined,
      audioTracks: JSON.parse(row.audio_tracks) as AudioTrack[],
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }
}