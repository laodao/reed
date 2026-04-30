/**
 * 知识库数据访问层
 * @module database/repositories/knowledge-base.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 */

import type { DataSource } from 'typeorm'
import { randomUUID } from 'crypto'
import type {
  KnowledgeBase,
  CreateKnowledgeBaseRequest,
  UpdateKnowledgeBaseRequest,
  KnowledgeBaseStats,
} from '@shared/types/knowledge-base.types'
import { KnowledgeBaseEntity } from '../entities/knowledge-base.entity'
import { BaseRepository } from '../base-repository'

export class KnowledgeBaseRepository extends BaseRepository<
  KnowledgeBaseEntity,
  KnowledgeBase
> {
  constructor(dataSource: DataSource) {
    super(dataSource, KnowledgeBaseEntity)
  }

  protected toDto(e: KnowledgeBaseEntity): KnowledgeBase {
    return {
      id: e.id,
      name: e.name,
      description: e.description || undefined,
      embeddingModel: e.embeddingModel,
      embeddingDimension: e.embeddingDimension,
      embeddingConfig: e.embeddingConfig || undefined,
      documentCount: e.documentCount,
      vectorCount: e.vectorCount,
      totalSize: e.totalSize,
      createdAt: e.createdAt instanceof Date ? e.createdAt : new Date(e.createdAt),
      updatedAt: e.updatedAt instanceof Date ? e.updatedAt : new Date(e.updatedAt),
    }
  }

  async findAll(): Promise<KnowledgeBase[]> {
    return this.findManyByWhere({} as any, { createdAt: 'DESC' })
  }

  async findById(id: string): Promise<KnowledgeBase | null> {
    return this.findOneByWhere({ id } as any)
  }

  async existsByName(name: string): Promise<boolean> {
    return this.existsByWhere({ name } as any)
  }

  async create(request: CreateKnowledgeBaseRequest): Promise<KnowledgeBase> {
    const id = randomUUID()
    const now = new Date()
    const provider = request.embeddingConfig?.provider || 'cloud'
    const configString = request.embeddingConfig
      ? JSON.stringify(request.embeddingConfig)
      : null

    const entity = this.repo.create({
      id,
      name: request.name,
      description: request.description ?? null,
      embeddingModel: request.embeddingModel,
      embeddingProvider: provider,
      embeddingDimension: request.embeddingDimension,
      embeddingConfig: configString,
      documentCount: 0,
      vectorCount: 0,
      totalSize: 0,
      createdAt: now,
      updatedAt: now,
    })
    const saved = await this.repo.save(entity)
    return this.toDto(saved)
  }

  async update(
    id: string,
    request: UpdateKnowledgeBaseRequest,
  ): Promise<boolean> {
    const existing = await this.repo.findOne({ where: { id } as any })
    if (!existing) return false

    let changed = false
    if (request.name !== undefined) {
      existing.name = request.name
      changed = true
    }
    if (request.description !== undefined) {
      existing.description = request.description ?? null
      changed = true
    }

    if (!changed) return false

    existing.updatedAt = new Date()
    await this.repo.save(existing)
    return true
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.repo.delete({ id } as any)
    return (result.affected ?? 0) > 0
  }

  async updateStats(id: string, stats: KnowledgeBaseStats): Promise<void> {
    await this.repo.update({ id } as any, {
      documentCount: stats.documentCount,
      vectorCount: stats.vectorCount,
      totalSize: stats.totalSize,
      updatedAt: new Date(),
    })
  }

  async incrementDocumentCount(id: string, delta: number = 1): Promise<void> {
    await this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(KnowledgeBaseEntity)
      await repo.increment({ id } as any, 'documentCount', delta)
      await repo.update({ id } as any, { updatedAt: new Date() })
    })
  }

  async incrementVectorCount(id: string, delta: number): Promise<void> {
    await this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(KnowledgeBaseEntity)
      // increment 不支持负数（typeorm 限制），统一改用算术
      if (delta >= 0) {
        await repo.increment({ id } as any, 'vectorCount', delta)
      } else {
        await repo.decrement({ id } as any, 'vectorCount', -delta)
      }
      await repo.update({ id } as any, { updatedAt: new Date() })
    })
  }

  async incrementTotalSize(id: string, delta: number): Promise<void> {
    await this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(KnowledgeBaseEntity)
      if (delta >= 0) {
        await repo.increment({ id } as any, 'totalSize', delta)
      } else {
        await repo.decrement({ id } as any, 'totalSize', -delta)
      }
      await repo.update({ id } as any, { updatedAt: new Date() })
    })
  }

  async count(): Promise<number> {
    return this.repo.count()
  }
}
