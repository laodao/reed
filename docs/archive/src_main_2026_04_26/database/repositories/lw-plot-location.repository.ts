/**
 * 情节地点关联仓库
 * @module database/repositories/lw-plot-location.repository
 * 符合第三范式，替代JSON存储
 */

import Database from 'better-sqlite3'

/**
 * 情节地点关联
 */
export interface PlotLocationRelation {
  id: string
  plotId: string
  locationId: string
  createdAt: number
}

/**
 * 情节地点关联仓库
 */
export class LwPlotLocationRepository {
  constructor(private db: Database.Database) {}

  /**
   * 根据情节ID获取所有关联的地点ID
   */
  getLocationIdsByPlotId(plotId: string): string[] {
    const stmt = this.db.prepare(`
      SELECT location_id FROM lw_plot_locations WHERE plot_id = ?
    `)
    const rows = stmt.all(plotId) as any[]
    return rows.map(row => row.location_id)
  }

  /**
   * 根据地点ID获取所有关联的情节ID
   */
  getPlotIdsByLocationId(locationId: string): string[] {
    const stmt = this.db.prepare(`
      SELECT plot_id FROM lw_plot_locations WHERE location_id = ?
    `)
    const rows = stmt.all(locationId) as any[]
    return rows.map(row => row.plot_id)
  }

  /**
   * 批量获取情节的地点ID映射
   * @param plotIds 情节ID列表
   * @returns Map<plotId, locationId[]>
   */
  getLocationIdsByPlotIds(plotIds: string[]): Map<string, string[]> {
    const result = new Map<string, string[]>()

    if (plotIds.length === 0) return result

    const placeholders = plotIds.map(() => '?').join(',')
    const stmt = this.db.prepare(`
      SELECT plot_id, location_id FROM lw_plot_locations WHERE plot_id IN (${placeholders})
    `)
    const rows = stmt.all(...plotIds) as any[]

    for (const row of rows) {
      if (!result.has(row.plot_id)) {
        result.set(row.plot_id, [])
      }
      result.get(row.plot_id)!.push(row.location_id)
    }

    // 确保所有情节都有条目
    for (const plotId of plotIds) {
      if (!result.has(plotId)) {
        result.set(plotId, [])
      }
    }

    return result
  }

  /**
   * 添加情节地点关联
   */
  add(plotId: string, locationId: string): PlotLocationRelation {
    const id = this.generateId()
    const now = Date.now()

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO lw_plot_locations (id, plot_id, location_id, created_at)
      VALUES (?, ?, ?, ?)
    `)
    stmt.run(id, plotId, locationId, now)

    return { id, plotId, locationId, createdAt: now }
  }

  /**
   * 批量添加情节地点关联（事务）
   */
  batchAdd(plotId: string, locationIds: string[]): void {
    if (locationIds.length === 0) return

    const now = Date.now()
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO lw_plot_locations (id, plot_id, location_id, created_at)
      VALUES (?, ?, ?, ?)
    `)

    const transaction = this.db.transaction(() => {
      for (const locationId of locationIds) {
        const id = this.generateId()
        stmt.run(id, plotId, locationId, now)
      }
    })

    transaction()
  }

  /**
   * 替换情节的所有地点关联
   */
  replaceAll(plotId: string, locationIds: string[]): void {
    const transaction = this.db.transaction(() => {
      // 先删除现有关联
      this.deleteByPlotId(plotId)
      // 再添加新关联
      this.batchAdd(plotId, locationIds)
    })
    transaction()
  }

  /**
   * 删除情节地点关联
   */
  delete(plotId: string, locationId: string): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM lw_plot_locations WHERE plot_id = ? AND location_id = ?
    `)
    const result = stmt.run(plotId, locationId)
    return result.changes > 0
  }

  /**
   * 删除情节的所有地点关联
   */
  deleteByPlotId(plotId: string): number {
    const stmt = this.db.prepare('DELETE FROM lw_plot_locations WHERE plot_id = ?')
    const result = stmt.run(plotId)
    return result.changes
  }

  /**
   * 删除地点的所有情节关联
   */
  deleteByLocationId(locationId: string): number {
    const stmt = this.db.prepare('DELETE FROM lw_plot_locations WHERE location_id = ?')
    const result = stmt.run(locationId)
    return result.changes
  }

  /**
   * 迁移：从JSON字段迁移到关联表
   * 将情节表中存储的地点名称转换为地点ID并存入关联表
   */
  migrateFromJson(projectId: string): number {
    // 获取项目的所有情节和地点
    const plotsStmt = this.db.prepare(`
      SELECT id, involved_locations FROM lw_story_plots WHERE project_id = ?
    `)
    const plots = plotsStmt.all(projectId) as any[]

    const locationsStmt = this.db.prepare(`
      SELECT id, name FROM lw_story_locations WHERE project_id = ?
    `)
    const locations = locationsStmt.all(projectId) as any[]

    // 建立地点名称到ID的映射
    const nameToId = new Map<string, string>()
    for (const loc of locations) {
      nameToId.set(loc.name, loc.id)
    }

    let migratedCount = 0
    const now = Date.now()
    const insertStmt = this.db.prepare(`
      INSERT OR IGNORE INTO lw_plot_locations (id, plot_id, location_id, created_at)
      VALUES (?, ?, ?, ?)
    `)

    const transaction = this.db.transaction(() => {
      for (const plot of plots) {
        const names: string[] = this.parseJsonArray(plot.involved_locations)
        for (const name of names) {
          const locationId = nameToId.get(name)
          if (locationId) {
            const id = this.generateId()
            insertStmt.run(id, plot.id, locationId, now)
            migratedCount++
          }
        }
      }
    })

    transaction()
    return migratedCount
  }

  /**
   * 生成唯一ID
   */
  private generateId(): string {
    return `pl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 解析JSON数组
   */
  private parseJsonArray(jsonStr: string | null): string[] {
    if (!jsonStr) return []
    try {
      return JSON.parse(jsonStr)
    } catch {
      return []
    }
  }
}