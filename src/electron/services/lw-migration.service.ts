/**
 * 长文写作数据迁移服务
 * @module services/lw-migration.service
 * 用于将违反第三范式的JSON字段数据迁移到新的关联表
 */

import { DatabaseManager } from '../database/index'
import * as fs from 'fs'
import * as path from 'path'

/**
 * 迁移结果
 */
export interface MigrationResult {
  success: boolean
  backupPath?: string
  plotCharacters: number
  plotLocations: number
  outlineCharacters: number
  outlineLocations: number
  skillCharacters: number
  designMessages: number
  memoryEntities: number
  errors: string[]
}

/**
 * 长文写作数据迁移服务
 */
export class LwMigrationService {
  /**
   * 备份数据库
   * @returns 备份文件路径，失败返回null
   */
  static backupDatabase(): string | null {
    const db = DatabaseManager.getInstance()
    if (!db.db) {
      console.error('[LwMigrationService] 数据库未初始化，无法备份')
      return null
    }

    try {
      // 获取数据库路径
      const dbPath = db.db.name
      if (!dbPath || !fs.existsSync(dbPath)) {
        console.error('[LwMigrationService] 数据库文件不存在')
        return null
      }

      // 创建备份目录
      const backupDir = path.join(path.dirname(dbPath), 'backups')
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true })
      }

      // 生成备份文件名
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const backupFileName = `the_bot_backup_${timestamp}.db`
      const backupPath = path.join(backupDir, backupFileName)

      // 使用SQLite的备份API
      db.db.backup(backupPath)

      console.log('[LwMigrationService] 数据库备份成功:', backupPath)
      return backupPath
    } catch (error: any) {
      console.error('[LwMigrationService] 数据库备份失败:', error)
      return null
    }
  }

  /**
   * 迁移项目的所有数据到关联表
   * @param projectId 项目ID
   * @param autoBackup 是否自动备份（默认true）
   */
  static async migrateProject(projectId: string, autoBackup: boolean = true): Promise<MigrationResult> {
    const result: MigrationResult = {
      success: true,
      plotCharacters: 0,
      plotLocations: 0,
      outlineCharacters: 0,
      outlineLocations: 0,
      skillCharacters: 0,
      designMessages: 0,
      memoryEntities: 0,
      errors: []
    }

    const db = DatabaseManager.getInstance()
    if (!db.db) {
      result.success = false
      result.errors.push('数据库未初始化')
      return result
    }

    try {
      // 自动备份数据库
      if (autoBackup) {
        const backupPath = this.backupDatabase()
        if (backupPath) {
          result.backupPath = backupPath
        } else {
          result.errors.push('数据库备份失败，但继续迁移')
        }
      }

      // 1. 迁移情节角色关联
      if (db.lwPlotCharacters) {
        result.plotCharacters = await db.lwPlotCharacters.migrateFromJson(projectId)
      }

      // 2. 迁移情节地点关联
      if (db.lwPlotLocations) {
        result.plotLocations = await db.lwPlotLocations.migrateFromJson(projectId)
      }

      // 3. 迁移大纲角色关联
      if (db.lwOutlineCharacters) {
        result.outlineCharacters = await db.lwOutlineCharacters.migrateFromJson(projectId)
      }

      // 4. 迁移大纲地点关联
      if (db.lwOutlineLocations) {
        result.outlineLocations = await db.lwOutlineLocations.migrateFromJson(projectId)
      }

      // 5. 迁移技能角色关联
      if (db.lwSkillCharacters) {
        result.skillCharacters = await db.lwSkillCharacters.migrateFromJson(projectId)
      }

      // 6. 迁移设计对话消息
      if (db.lwDesignMessages) {
        result.designMessages = await this.migrateDesignMessages(projectId)
      }

      // 7. 迁移记忆实体关联
      if (db.lwMemoryEntities && db.lwMemories) {
        result.memoryEntities = await this.migrateMemoryEntities(projectId)
      }

      console.log('[LwMigrationService] 迁移完成:', result)
    } catch (error: any) {
      result.success = false
      result.errors.push(error.message || '迁移失败')
      console.error('[LwMigrationService] 迁移失败:', error)
    }

    return result
  }

  /**
   * 迁移所有项目
   * @param autoBackup 是否自动备份（默认true）
   */
  static async migrateAllProjects(autoBackup: boolean = true): Promise<MigrationResult[]> {
    const db = DatabaseManager.getInstance()
    if (!db.db || !db.lwProjects) {
      return []
    }

    // 先备份一次
    if (autoBackup) {
      this.backupDatabase()
    }

    const projects = await db.lwProjects.getAll()
    const results: MigrationResult[] = []

    for (const project of projects) {
      // 后续项目迁移不再重复备份
      const result = await this.migrateProject(project.id, false)
      results.push(result)
    }

    return results
  }

  /**
   * 检查项目是否需要迁移
   */
  static checkNeedsMigration(projectId: string): boolean {
    const db = DatabaseManager.getInstance()
    if (!db.db) return false

    // 检查情节是否有数据但关联表没有数据
    const plotCount = db.db.prepare(`
      SELECT COUNT(*) as count FROM lw_story_plots WHERE project_id = ?
    `).get(projectId) as any

    const plotCharCount = db.db.prepare(`
      SELECT COUNT(*) as count FROM lw_plot_characters
      WHERE plot_id IN (SELECT id FROM lw_story_plots WHERE project_id = ?)
    `).get(projectId) as any

    // 如果情节表有数据但关联表没有数据，则需要迁移
    if (plotCount?.count > 0 && plotCharCount?.count === 0) {
      return true
    }

    return false
  }

  /**
   * 获取迁移统计信息
   */
  static getMigrationStats(projectId: string): {
    needsMigration: boolean
    plotCount: number
    plotCharRelationCount: number
    outlineCount: number
    outlineCharRelationCount: number
    skillCount: number
    skillCharRelationCount: number
    memoryCount: number
    memoryEntityCount: number
  } {
    const db = DatabaseManager.getInstance()
    const stats = {
      needsMigration: false,
      plotCount: 0,
      plotCharRelationCount: 0,
      outlineCount: 0,
      outlineCharRelationCount: 0,
      skillCount: 0,
      skillCharRelationCount: 0,
      memoryCount: 0,
      memoryEntityCount: 0
    }

    if (!db.db) return stats

    try {
      // 情节统计
      const plotResult = db.db.prepare(`
        SELECT COUNT(*) as count FROM lw_story_plots WHERE project_id = ?
      `).get(projectId) as any
      stats.plotCount = plotResult?.count || 0

      const plotCharResult = db.db.prepare(`
        SELECT COUNT(*) as count FROM lw_plot_characters
        WHERE plot_id IN (SELECT id FROM lw_story_plots WHERE project_id = ?)
      `).get(projectId) as any
      stats.plotCharRelationCount = plotCharResult?.count || 0

      // 大纲统计
      const outlineResult = db.db.prepare(`
        SELECT COUNT(*) as count FROM lw_story_outlines WHERE project_id = ?
      `).get(projectId) as any
      stats.outlineCount = outlineResult?.count || 0

      const outlineCharResult = db.db.prepare(`
        SELECT COUNT(*) as count FROM lw_outline_characters
        WHERE outline_id IN (SELECT id FROM lw_story_outlines WHERE project_id = ?)
      `).get(projectId) as any
      stats.outlineCharRelationCount = outlineCharResult?.count || 0

      // 技能统计
      const skillResult = db.db.prepare(`
        SELECT COUNT(*) as count FROM lw_story_skills WHERE project_id = ?
      `).get(projectId) as any
      stats.skillCount = skillResult?.count || 0

      const skillCharResult = db.db.prepare(`
        SELECT COUNT(*) as count FROM lw_skill_characters
        WHERE skill_id IN (SELECT id FROM lw_story_skills WHERE project_id = ?)
      `).get(projectId) as any
      stats.skillCharRelationCount = skillCharResult?.count || 0

      // 记忆统计
      const memoryResult = db.db.prepare(`
        SELECT COUNT(*) as count FROM lw_story_memories WHERE project_id = ?
      `).get(projectId) as any
      stats.memoryCount = memoryResult?.count || 0

      const memoryEntityResult = db.db.prepare(`
        SELECT COUNT(*) as count FROM lw_memory_entities
        WHERE memory_id IN (SELECT id FROM lw_story_memories WHERE project_id = ?)
      `).get(projectId) as any
      stats.memoryEntityCount = memoryEntityResult?.count || 0

      // 判断是否需要迁移
      stats.needsMigration = (
        (stats.plotCount > 0 && stats.plotCharRelationCount === 0) ||
        (stats.outlineCount > 0 && stats.outlineCharRelationCount === 0) ||
        (stats.skillCount > 0 && stats.skillCharRelationCount === 0) ||
        (stats.memoryCount > 0 && stats.memoryEntityCount === 0)
      )
    } catch (error) {
      console.error('[LwMigrationService] 获取迁移统计失败:', error)
    }

    return stats
  }

  /**
   * 迁移设计对话消息
   */
  private static async migrateDesignMessages(projectId: string): Promise<number> {
    const db = DatabaseManager.getInstance()
    if (!db.db || !db.lwDesignMessages) return 0

    // 获取项目的所有设计对话
    const conversations = db.db.prepare(`
      SELECT id, messages FROM lw_design_conversations WHERE project_id = ?
    `).all(projectId) as any[]

    let migratedCount = 0

    for (const conv of conversations) {
      if (conv.messages) {
        migratedCount += await db.lwDesignMessages.migrateFromJson(conv.id)
      }
    }

    return migratedCount
  }

  /**
   * 迁移记忆实体关联
   */
  private static async migrateMemoryEntities(projectId: string): Promise<number> {
    const db = DatabaseManager.getInstance()
    if (!db.db || !db.lwMemoryEntities || !db.lwMemories) return 0

    const memories = await db.lwMemories.getByProjectId(projectId)
    let migratedCount = 0

    for (const memory of memories) {
      if (memory.involvedEntities && memory.involvedEntities.length > 0) {
        await db.lwMemoryEntities.replaceAll(memory.id, memory.involvedEntities)
        migratedCount += memory.involvedEntities.length
      }
    }

    return migratedCount
  }
}