/**
 * 项目步骤模型配置仓库
 * @module database/repositories/lw-project-model-config.repository
 */

import Database from 'better-sqlite3'
import { StageModelConfig, StoryStage, CommentStage } from '../../../shared/types/longwriting.types'

export class LwProjectModelConfigRepository {
  constructor(private db: Database.Database) {}

  /**
   * 根据项目ID获取所有步骤模型配置
   */
  getByProjectId(projectId: string): StageModelConfig[] {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_project_model_configs WHERE project_id = ?
    `)
    const rows = stmt.all(projectId) as any[]
    return rows.map(row => this.mapToConfig(row))
  }

  /**
   * 根据项目和步骤获取模型配置
   */
  getByProjectAndStage(projectId: string, stage: StoryStage | CommentStage): StageModelConfig | null {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_project_model_configs WHERE project_id = ? AND stage = ?
    `)
    const row = stmt.get(projectId, stage) as any
    return row ? this.mapToConfig(row) : null
  }

  /**
   * 设置步骤模型配置（存在则更新，不存在则创建）
   */
  upsert(projectId: string, stage: StoryStage | CommentStage, providerConfigId: string, modelId: string): StageModelConfig {
    const now = Date.now()
    const id = `modelconfig_${projectId}_${stage}`

    const stmt = this.db.prepare(`
      INSERT INTO lw_project_model_configs (id, project_id, stage, provider_config_id, model_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id, stage) DO UPDATE SET
        provider_config_id = excluded.provider_config_id,
        model_id = excluded.model_id,
        updated_at = excluded.updated_at
    `)

    stmt.run(id, projectId, stage, providerConfigId, modelId, now, now)

    return {
      id,
      projectId,
      stage,
      providerConfigId,
      modelId,
      createdAt: now,
      updatedAt: now
    }
  }

  /**
   * 批量设置步骤模型配置
   */
  upsertMany(configs: Array<{
    projectId: string
    stage: StoryStage | CommentStage
    providerConfigId: string
    modelId: string
  }>): void {
    const now = Date.now()
    const stmt = this.db.prepare(`
      INSERT INTO lw_project_model_configs (id, project_id, stage, provider_config_id, model_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id, stage) DO UPDATE SET
        provider_config_id = excluded.provider_config_id,
        model_id = excluded.model_id,
        updated_at = excluded.updated_at
    `)

    const transaction = this.db.transaction(() => {
      for (const config of configs) {
        const id = `modelconfig_${config.projectId}_${config.stage}`
        stmt.run(id, config.projectId, config.stage, config.providerConfigId, config.modelId, now, now)
      }
    })

    transaction()
  }

  /**
   * 删除步骤模型配置
   */
  delete(projectId: string, stage: StoryStage | CommentStage): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM lw_project_model_configs WHERE project_id = ? AND stage = ?
    `)
    const result = stmt.run(projectId, stage)
    return result.changes > 0
  }

  /**
   * 删除项目的所有模型配置
   */
  deleteByProjectId(projectId: string): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM lw_project_model_configs WHERE project_id = ?
    `)
    const result = stmt.run(projectId)
    return result.changes > 0
  }

  private mapToConfig(row: any): StageModelConfig {
    return {
      id: row.id,
      projectId: row.project_id,
      stage: row.stage,
      providerConfigId: row.provider_config_id,
      modelId: row.model_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }
}