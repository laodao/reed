/**
 * 长文写作实体状态快照仓库
 * @module database/repositories/lw-entity-state.repository
 */

import Database from 'better-sqlite3'
import {
  EntityStateSnapshot,
  EntityType,
  CreateEntityStateSnapshotRequest,
  UpdateEntityStateSnapshotRequest,
  SnapshotStats
} from '@shared/types/longwriting.types'

export class LwEntityStateRepository {
  constructor(private db: Database.Database) {}

  /**
   * 根据项目 ID 获取所有状态快照
   */
  getByProjectId(projectId: string): EntityStateSnapshot[] {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_entity_state_snapshots
      WHERE project_id = ?
      ORDER BY chapter_number ASC, entity_type ASC, created_at ASC
    `)
    const rows = stmt.all(projectId) as any[]
    return rows.map(row => this.mapToSnapshot(row))
  }

  /**
   * 获取实体在指定章节的状态快照
   * 返回该章节或之前最近的状态快照
   */
  getEntityStateAtChapter(
    projectId: string,
    entityType: EntityType,
    entityId: string,
    chapterNumber: number
  ): EntityStateSnapshot | null {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_entity_state_snapshots
      WHERE project_id = ?
        AND entity_type = ?
        AND entity_id = ?
        AND chapter_number <= ?
      ORDER BY chapter_number DESC
      LIMIT 1
    `)
    const row = stmt.get(projectId, entityType, entityId, chapterNumber) as any
    return row ? this.mapToSnapshot(row) : null
  }

  /**
   * 批量获取多个实体在指定章节的状态快照
   */
  getEntitiesStatesForChapter(
    projectId: string,
    chapterNumber: number,
    entities: Array<{ entityType: EntityType; entityId: string }>
  ): EntityStateSnapshot[] {
    const results: EntityStateSnapshot[] = []

    for (const entity of entities) {
      const state = this.getEntityStateAtChapter(
        projectId,
        entity.entityType,
        entity.entityId,
        chapterNumber
      )
      if (state) {
        results.push(state)
      }
    }

    return results
  }

  /**
   * 获取指定章节的所有状态快照
   */
  getByChapterNumber(projectId: string, chapterNumber: number): EntityStateSnapshot[] {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_entity_state_snapshots
      WHERE project_id = ? AND chapter_number = ?
      ORDER BY entity_type ASC, created_at ASC
    `)
    const rows = stmt.all(projectId, chapterNumber) as any[]
    return rows.map(row => this.mapToSnapshot(row))
  }

  /**
   * 根据 ID 获取状态快照
   */
  getById(id: string): EntityStateSnapshot | null {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_entity_state_snapshots WHERE id = ?
    `)
    const row = stmt.get(id) as any
    return row ? this.mapToSnapshot(row) : null
  }

  /**
   * 获取实体的最新状态快照
   */
  getLatestEntityState(
    projectId: string,
    entityType: EntityType,
    entityId: string
  ): EntityStateSnapshot | null {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_entity_state_snapshots
      WHERE project_id = ? AND entity_type = ? AND entity_id = ?
      ORDER BY chapter_number DESC
      LIMIT 1
    `)
    const row = stmt.get(projectId, entityType, entityId) as any
    return row ? this.mapToSnapshot(row) : null
  }

  /**
   * 创建状态快照
   */
  create(data: CreateEntityStateSnapshotRequest): EntityStateSnapshot {
    const id = this.generateId()
    const now = Date.now()

    const stmt = this.db.prepare(`
      INSERT INTO lw_entity_state_snapshots (
        id, project_id, entity_type, entity_id, entity_name,
        chapter_number, state_summary, key_changes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      id,
      data.projectId,
      data.entityType,
      data.entityId,
      data.entityName,
      data.chapterNumber,
      data.stateSummary,
      JSON.stringify(data.keyChanges || []),
      now,
      now
    )

    return {
      id,
      projectId: data.projectId,
      entityType: data.entityType,
      entityId: data.entityId,
      entityName: data.entityName,
      chapterNumber: data.chapterNumber,
      stateSummary: data.stateSummary,
      keyChanges: data.keyChanges || [],
      createdAt: now,
      updatedAt: now
    }
  }

  /**
   * 批量创建状态快照（使用 upsert 逻辑，避免重复）
   */
  batchCreate(dataList: CreateEntityStateSnapshotRequest[]): EntityStateSnapshot[] {
    const results: EntityStateSnapshot[] = []
    const transaction = this.db.transaction(() => {
      for (const data of dataList) {
        // 使用 upsert 避免重复
        const snapshot = this.upsert(data)
        results.push(snapshot)
      }
    })
    transaction()
    return results
  }

  /**
   * 更新状态快照
   */
  update(id: string, data: UpdateEntityStateSnapshotRequest): EntityStateSnapshot | null {
    const snapshot = this.getById(id)
    if (!snapshot) return null

    const now = Date.now()
    const updates: string[] = []
    const values: any[] = []

    if (data.stateSummary !== undefined) {
      updates.push('state_summary = ?')
      values.push(data.stateSummary)
    }
    if (data.keyChanges !== undefined) {
      updates.push('key_changes = ?')
      values.push(JSON.stringify(data.keyChanges))
    }

    if (updates.length === 0) return snapshot

    updates.push('updated_at = ?')
    values.push(now)
    values.push(id)

    const stmt = this.db.prepare(`
      UPDATE lw_entity_state_snapshots SET ${updates.join(', ')} WHERE id = ?
    `)
    stmt.run(...values)

    return this.getById(id)
  }

  /**
   * 删除状态快照
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM lw_entity_state_snapshots WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }

  /**
   * 删除指定章节的所有状态快照
   */
  deleteByChapterNumber(projectId: string, chapterNumber: number): number {
    const stmt = this.db.prepare(`
      DELETE FROM lw_entity_state_snapshots
      WHERE project_id = ? AND chapter_number = ?
    `)
    const result = stmt.run(projectId, chapterNumber)
    return result.changes
  }

  /**
   * 删除项目的所有状态快照
   */
  deleteByProjectId(projectId: string): number {
    const stmt = this.db.prepare('DELETE FROM lw_entity_state_snapshots WHERE project_id = ?')
    const result = stmt.run(projectId)
    return result.changes
  }

  /**
   * 获取项目的状态快照统计
   */
  getSnapshotStats(projectId: string): SnapshotStats {
    const snapshots = this.getByProjectId(projectId)

    const stats: SnapshotStats = {
      total: snapshots.length,
      byEntityType: {
        character: 0,
        location: 0,
        item: 0,
        faction: 0,
        skill: 0
      },
      byChapter: {}
    }

    for (const snapshot of snapshots) {
      stats.byEntityType[snapshot.entityType]++
      if (!stats.byChapter[snapshot.chapterNumber]) {
        stats.byChapter[snapshot.chapterNumber] = 0
      }
      stats.byChapter[snapshot.chapterNumber]++
    }

    return stats
  }

  /**
   * 更新或创建状态快照（如果已存在则更新，否则创建）
   */
  upsert(data: CreateEntityStateSnapshotRequest): EntityStateSnapshot {
    // 检查是否已存在相同实体在相同章节的快照
    const existingStmt = this.db.prepare(`
      SELECT id FROM lw_entity_state_snapshots
      WHERE project_id = ? AND entity_type = ? AND entity_id = ? AND chapter_number = ?
    `)
    const existing = existingStmt.get(data.projectId, data.entityType, data.entityId, data.chapterNumber) as any

    if (existing) {
      // 更新已存在的快照
      const now = Date.now()
      const updateStmt = this.db.prepare(`
        UPDATE lw_entity_state_snapshots
        SET state_summary = ?, key_changes = ?, entity_name = ?, updated_at = ?
        WHERE id = ?
      `)
      updateStmt.run(
        data.stateSummary,
        JSON.stringify(data.keyChanges || []),
        data.entityName,
        now,
        existing.id
      )
      return this.getById(existing.id)!
    } else {
      // 创建新快照
      return this.create(data)
    }
  }

  private generateId(): string {
    return `entity_state_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private mapToSnapshot(row: any): EntityStateSnapshot {
    return {
      id: row.id,
      projectId: row.project_id,
      entityType: row.entity_type as EntityType,
      entityId: row.entity_id,
      entityName: row.entity_name,
      chapterNumber: row.chapter_number,
      stateSummary: row.state_summary,
      keyChanges: this.parseKeyChanges(row.key_changes),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  private parseKeyChanges(jsonStr: string | null): string[] {
    if (!jsonStr) return []
    try {
      return JSON.parse(jsonStr)
    } catch {
      return []
    }
  }
}