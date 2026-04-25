/**
 * 情节角色关联仓库
 * @module database/repositories/lw-plot-character.repository
 * 符合第三范式，替代JSON存储
 */

import Database from 'better-sqlite3'

/**
 * 情节角色关联
 */
export interface PlotCharacterRelation {
  id: string
  plotId: string
  characterId: string
  createdAt: number
}

/**
 * 情节角色关联仓库
 */
export class LwPlotCharacterRepository {
  constructor(private db: Database.Database) {}

  /**
   * 根据情节ID获取所有关联的角色ID
   */
  getCharacterIdsByPlotId(plotId: string): string[] {
    const stmt = this.db.prepare(`
      SELECT character_id FROM lw_plot_characters WHERE plot_id = ?
    `)
    const rows = stmt.all(plotId) as any[]
    return rows.map(row => row.character_id)
  }

  /**
   * 根据角色ID获取所有关联的情节ID
   */
  getPlotIdsByCharacterId(characterId: string): string[] {
    const stmt = this.db.prepare(`
      SELECT plot_id FROM lw_plot_characters WHERE character_id = ?
    `)
    const rows = stmt.all(characterId) as any[]
    return rows.map(row => row.plot_id)
  }

  /**
   * 批量获取情节的角色ID映射
   * @param plotIds 情节ID列表
   * @returns Map<plotId, characterId[]>
   */
  getCharacterIdsByPlotIds(plotIds: string[]): Map<string, string[]> {
    const result = new Map<string, string[]>()

    if (plotIds.length === 0) return result

    const placeholders = plotIds.map(() => '?').join(',')
    const stmt = this.db.prepare(`
      SELECT plot_id, character_id FROM lw_plot_characters WHERE plot_id IN (${placeholders})
    `)
    const rows = stmt.all(...plotIds) as any[]

    for (const row of rows) {
      if (!result.has(row.plot_id)) {
        result.set(row.plot_id, [])
      }
      result.get(row.plot_id)!.push(row.character_id)
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
   * 添加情节角色关联
   */
  add(plotId: string, characterId: string): PlotCharacterRelation {
    const id = this.generateId()
    const now = Date.now()

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO lw_plot_characters (id, plot_id, character_id, created_at)
      VALUES (?, ?, ?, ?)
    `)
    stmt.run(id, plotId, characterId, now)

    return { id, plotId, characterId, createdAt: now }
  }

  /**
   * 批量添加情节角色关联（事务）
   */
  batchAdd(plotId: string, characterIds: string[]): void {
    if (characterIds.length === 0) return

    const now = Date.now()
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO lw_plot_characters (id, plot_id, character_id, created_at)
      VALUES (?, ?, ?, ?)
    `)

    const transaction = this.db.transaction(() => {
      for (const characterId of characterIds) {
        const id = this.generateId()
        stmt.run(id, plotId, characterId, now)
      }
    })

    transaction()
  }

  /**
   * 替换情节的所有角色关联
   */
  replaceAll(plotId: string, characterIds: string[]): void {
    const transaction = this.db.transaction(() => {
      // 先删除现有关联
      this.deleteByPlotId(plotId)
      // 再添加新关联
      this.batchAdd(plotId, characterIds)
    })
    transaction()
  }

  /**
   * 删除情节角色关联
   */
  delete(plotId: string, characterId: string): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM lw_plot_characters WHERE plot_id = ? AND character_id = ?
    `)
    const result = stmt.run(plotId, characterId)
    return result.changes > 0
  }

  /**
   * 删除情节的所有角色关联
   */
  deleteByPlotId(plotId: string): number {
    const stmt = this.db.prepare('DELETE FROM lw_plot_characters WHERE plot_id = ?')
    const result = stmt.run(plotId)
    return result.changes
  }

  /**
   * 删除角色的所有情节关联
   */
  deleteByCharacterId(characterId: string): number {
    const stmt = this.db.prepare('DELETE FROM lw_plot_characters WHERE character_id = ?')
    const result = stmt.run(characterId)
    return result.changes
  }

  /**
   * 迁移：从JSON字段迁移到关联表
   * 将情节表中存储的角色名称转换为角色ID并存入关联表
   */
  migrateFromJson(projectId: string): number {
    // 获取项目的所有情节和角色
    const plotsStmt = this.db.prepare(`
      SELECT id, involved_characters FROM lw_story_plots WHERE project_id = ?
    `)
    const plots = plotsStmt.all(projectId) as any[]

    const charsStmt = this.db.prepare(`
      SELECT id, name FROM lw_story_characters WHERE project_id = ?
    `)
    const characters = charsStmt.all(projectId) as any[]

    // 建立角色名称到ID的映射
    const nameToId = new Map<string, string>()
    for (const char of characters) {
      nameToId.set(char.name, char.id)
    }

    let migratedCount = 0
    const now = Date.now()
    const insertStmt = this.db.prepare(`
      INSERT OR IGNORE INTO lw_plot_characters (id, plot_id, character_id, created_at)
      VALUES (?, ?, ?, ?)
    `)

    const transaction = this.db.transaction(() => {
      for (const plot of plots) {
        const names: string[] = this.parseJsonArray(plot.involved_characters)
        for (const name of names) {
          const characterId = nameToId.get(name)
          if (characterId) {
            const id = this.generateId()
            insertStmt.run(id, plot.id, characterId, now)
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
    return `pc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
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