/**
 * 项目步骤模型配置仓库
 * @module database/repositories/lw-project-model-config.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 */

import type { DataSource } from 'typeorm'
import {
  StageModelConfig,
  StoryStage,
  CommentStage,
} from '@shared/types/longwriting.types'
import { LwProjectModelConfigEntity } from '../entities/lw-project-model-config.entity'
import { BaseRepository } from '../base-repository'

export class LwProjectModelConfigRepository extends BaseRepository<
  LwProjectModelConfigEntity,
  StageModelConfig
> {
  constructor(dataSource: DataSource) {
    super(dataSource, LwProjectModelConfigEntity)
  }

  protected toDto(e: LwProjectModelConfigEntity): StageModelConfig {
    return {
      id: e.id,
      projectId: e.projectId,
      stage: e.stage as StoryStage | CommentStage,
      providerConfigId: e.providerConfigId,
      modelId: e.modelId,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }
  }

  async getByProjectId(projectId: string): Promise<StageModelConfig[]> {
    return this.findManyByWhere({ projectId } as any)
  }

  async getByProjectAndStage(
    projectId: string,
    stage: StoryStage | CommentStage,
  ): Promise<StageModelConfig | null> {
    return this.findOneByWhere({ projectId, stage } as any)
  }

  async upsert(
    projectId: string,
    stage: StoryStage | CommentStage,
    providerConfigId: string,
    modelId: string,
  ): Promise<StageModelConfig> {
    const now = Date.now()
    const id = `modelconfig_${projectId}_${stage}`
    const existing = await this.repo.findOne({
      where: { projectId, stage } as any,
    })
    if (existing) {
      existing.providerConfigId = providerConfigId
      existing.modelId = modelId
      existing.updatedAt = now
      const saved = await this.repo.save(existing)
      return this.toDto(saved)
    }
    const entity = this.repo.create({
      id,
      projectId,
      stage,
      providerConfigId,
      modelId,
      createdAt: now,
      updatedAt: now,
    })
    const saved = await this.repo.save(entity)
    return this.toDto(saved)
  }

  async upsertMany(
    configs: Array<{
      projectId: string
      stage: StoryStage | CommentStage
      providerConfigId: string
      modelId: string
    }>,
  ): Promise<void> {
    if (configs.length === 0) return
    await this.dataSource.transaction(async () => {
      for (const c of configs) {
        await this.upsert(c.projectId, c.stage, c.providerConfigId, c.modelId)
      }
    })
  }

  async delete(
    projectId: string,
    stage: StoryStage | CommentStage,
  ): Promise<boolean> {
    const result = await this.repo.delete({ projectId, stage } as any)
    return (result.affected ?? 0) > 0
  }

  async deleteByProjectId(projectId: string): Promise<boolean> {
    const result = await this.repo.delete({ projectId } as any)
    return (result.affected ?? 0) > 0
  }
}
