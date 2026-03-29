/**
 * 情节仓库
 * @module database/repositories/lw-plot.repository
 */

import Database from 'better-sqlite3'
import { StoryPlot, CreatePlotRequest, UpdatePlotRequest } from '../../../shared/types/longwriting.types'

/**
 * 情节仓库
 */
export class LwPlotRepository {
  constructor(private db: Database.Database) {}

  /**
   * 根据项目 ID 获取所有情节（按 plot_order 排序）
   */
  getByProjectId(projectId: string): StoryPlot[] {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_story_plots WHERE project_id = ? ORDER BY plot_order ASC, created_at ASC
    `)
    const rows = stmt.all(projectId) as any[]
    return rows.map(this.mapToPlot)
  }

  /**
   * 根据 ID 获取情节
   */
  getById(id: string): StoryPlot | null {
    const stmt = this.db.prepare(`SELECT * FROM lw_story_plots WHERE id = ?`)
    const row = stmt.get(id) as any
    return row ? this.mapToPlot(row) : null
  }

  /**
   * 创建情节
   */
  create(data: CreatePlotRequest): StoryPlot {
    const id = this.generateId()
    const now = Date.now()

    // 获取当前最大 plot_order
    const maxOrderStmt = this.db.prepare(`
      SELECT MAX(plot_order) as max_order FROM lw_story_plots WHERE project_id = ?
    `)
    const maxOrderResult = maxOrderStmt.get(data.projectId) as any
    const plotOrder = (maxOrderResult?.max_order ?? -1) + 1

    const stmt = this.db.prepare(`
      INSERT INTO lw_story_plots (id, project_id, title, summary, plot_order, involved_characters, involved_locations, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const involvedCharacters = JSON.stringify(data.involvedCharacters || [])
    const involvedLocations = JSON.stringify(data.involvedLocations || [])

    stmt.run(
      id,
      data.projectId,
      data.title,
      data.summary,
      plotOrder,
      involvedCharacters,
      involvedLocations,
      data.notes || null,
      now,
      now
    )

    return {
      id,
      projectId: data.projectId,
      title: data.title,
      summary: data.summary,
      plotOrder,
      involvedCharacters: data.involvedCharacters || [],
      involvedLocations: data.involvedLocations || [],
      notes: data.notes,
      createdAt: now,
      updatedAt: now
    }
  }

  /**
   * 批量创建情节（用于 AI 生成后批量插入）
   */
  batchCreate(projectId: string, plots: { title: string; summary: string; involvedCharacters?: string[] }[]): StoryPlot[] {
    const now = Date.now()
    const results: StoryPlot[] = []

    // 使用事务批量插入
    const insertStmt = this.db.prepare(`
      INSERT INTO lw_story_plots (id, project_id, title, summary, plot_order, involved_characters, involved_locations, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const transaction = this.db.transaction(() => {
      plots.forEach((plot, index) => {
        const id = this.generateId()
        const plotOrder = index
        const involvedCharacters = JSON.stringify(plot.involvedCharacters || [])

        insertStmt.run(
          id,
          projectId,
          plot.title,
          plot.summary,
          plotOrder,
          involvedCharacters,
          JSON.stringify([]),
          null,
          now,
          now
        )

        results.push({
          id,
          projectId,
          title: plot.title,
          summary: plot.summary,
          plotOrder,
          involvedCharacters: plot.involvedCharacters || [],
          involvedLocations: [],
          notes: undefined,
          createdAt: now,
          updatedAt: now
        })
      })
    })

    transaction()
    return results
  }

  /**
   * 更新情节
   */
  update(id: string, data: UpdatePlotRequest): StoryPlot | null {
    const existing = this.getById(id)
    if (!existing) return null

    const updates: string[] = []
    const values: any[] = []

    if (data.title !== undefined) {
      updates.push('title = ?')
      values.push(data.title)
    }
    if (data.summary !== undefined) {
      updates.push('summary = ?')
      values.push(data.summary)
    }
    if (data.plotOrder !== undefined) {
      updates.push('plot_order = ?')
      values.push(data.plotOrder)
    }
    if (data.involvedCharacters !== undefined) {
      updates.push('involved_characters = ?')
      values.push(JSON.stringify(data.involvedCharacters))
    }
    if (data.involvedLocations !== undefined) {
      updates.push('involved_locations = ?')
      values.push(JSON.stringify(data.involvedLocations))
    }
    if (data.notes !== undefined) {
      updates.push('notes = ?')
      values.push(data.notes)
    }

    if (updates.length === 0) return existing

    updates.push('updated_at = ?')
    values.push(Date.now())
    values.push(id)

    const stmt = this.db.prepare(`
      UPDATE lw_story_plots SET ${updates.join(', ')} WHERE id = ?
    `)
    stmt.run(...values)

    return this.getById(id)
  }

  /**
   * 批量更新情节顺序（用于拖拽排序）
   */
  reorderPlots(projectId: string, orderList: { id: string; order: number }[]): boolean {
    const updateStmt = this.db.prepare(`
      UPDATE lw_story_plots SET plot_order = ?, updated_at = ? WHERE id = ?
    `)

    const transaction = this.db.transaction(() => {
      orderList.forEach(item => {
        updateStmt.run(item.order, Date.now(), item.id)
      })
    })

    transaction()
    return true
  }

  /**
   * 删除情节
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM lw_story_plots WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }

  /**
   * 删除项目的所有情节
   */
  deleteByProjectId(projectId: string): boolean {
    const stmt = this.db.prepare('DELETE FROM lw_story_plots WHERE project_id = ?')
    const result = stmt.run(projectId)
    return result.changes > 0
  }

  /**
   * 获取项目的情节数量
   */
  countByProjectId(projectId: string): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM lw_story_plots WHERE project_id = ?')
    const result = stmt.get(projectId) as any
    return result?.count ?? 0
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `plot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 映射数据库行到对象
   */
  private mapToPlot(row: any): StoryPlot {
    return {
      id: row.id,
      projectId: row.project_id,
      title: row.title,
      summary: row.summary,
      plotOrder: row.plot_order,
      involvedCharacters: JSON.parse(row.involved_characters || '[]'),
      involvedLocations: JSON.parse(row.involved_locations || '[]'),
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }
}