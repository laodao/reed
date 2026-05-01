/**
 * 提供商配置数据访问层
 * @module database/repositories/provider-config
 * @description 基于 TypeORM 实现，支持 sqlite / postgres 双方言。
 */

import type { DataSource } from 'typeorm'
import type {
  UserProviderConfig,
  ModelDefinition,
} from '@shared/types/provider-template.types'
import { ProviderConfigEntity } from '../entities/provider-config.entity'
import { BaseRepository } from '../base-repository'

export class ProviderConfigRepository extends BaseRepository<
  ProviderConfigEntity,
  UserProviderConfig
> {
  constructor(dataSource: DataSource) {
    super(dataSource, ProviderConfigEntity)
    // 共享配置类 Repository：所有用户共享数据，不做 user_id 过滤
    this.useRawRepo()
  }

  private dateToIso(v: Date | string | null | undefined): string | undefined {
    if (v === null || v === undefined) return undefined
    if (v instanceof Date) return v.toISOString()
    if (typeof v === 'string') return v
    return undefined
  }

  private isoToDate(iso: string | null | undefined): Date | null {
    if (!iso) return null
    return new Date(iso)
  }

  protected toDto(e: ProviderConfigEntity): UserProviderConfig {
    return {
      id: e.id,
      shortId: e.shortId || undefined,
      templateId: e.templateId,
      name: e.name,
      apiKey: e.apiKeyEncrypted || undefined,
      accessKeyId: e.accessKeyId || undefined,
      accessKeySecret: e.accessKeySecretEncrypted || undefined,
      baseUrl: e.baseUrl || undefined,
      imageBaseUrl: e.imageBaseUrl || undefined,
      videoBaseUrl: e.videoBaseUrl || undefined,
      audioBaseUrl: e.audioBaseUrl || undefined,
      customHeaders: (e.customHeaders as Record<string, string> | null) ?? undefined,
      customParams: (e.customParams as Record<string, unknown> | null) ?? undefined,
      models: (e.models as ModelDefinition[] | null) ?? undefined,
      isEnabled: e.isEnabled === 1,
      isDefault: e.isDefault === 1,
      lastTested: this.dateToIso(e.lastTested),
      testResult: (e.testResult as 'success' | 'failed' | 'unknown') || undefined,
      createdAt: this.dateToIso(e.createdAt) ?? '',
      updatedAt: this.dateToIso(e.updatedAt) ?? '',
    }
  }

  async getAll(): Promise<UserProviderConfig[]> {
    const entities = await this.repo
      .createQueryBuilder('p')
      .orderBy('p.is_default', 'DESC')
      .addOrderBy('p.created_at', 'ASC')
      .getMany()
    return this.toDtoList(entities)
  }

  async getById(id: string): Promise<UserProviderConfig | null> {
    return this.findOneByWhere({ id } as any)
  }

  async getByTemplateId(templateId: string): Promise<UserProviderConfig[]> {
    return this.findManyByWhere({ templateId } as any, { createdAt: 'ASC' })
  }

  async create(
    config: Omit<UserProviderConfig, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<UserProviderConfig> {
    const id = this.generateId()
    const now = new Date()
    const entity = this.repo.create({
      id,
      shortId: config.shortId ?? null,
      templateId: config.templateId,
      name: config.name,
      apiKeyEncrypted: config.apiKey ?? null,
      accessKeyId: config.accessKeyId ?? null,
      accessKeySecretEncrypted: config.accessKeySecret ?? null,
      baseUrl: config.baseUrl ?? null,
      imageBaseUrl: config.imageBaseUrl ?? null,
      videoBaseUrl: config.videoBaseUrl ?? null,
      audioBaseUrl: config.audioBaseUrl ?? null,
      customHeaders: (config.customHeaders as Record<string, unknown> | undefined) ?? null,
      customParams: (config.customParams as Record<string, unknown> | undefined) ?? null,
      models: (config.models as unknown[] | undefined) ?? null,
      isEnabled: config.isEnabled ? 1 : 0,
      isDefault: config.isDefault ? 1 : 0,
      lastTested: this.isoToDate(config.lastTested),
      testResult: config.testResult ?? null,
      createdAt: now,
      updatedAt: now,
    })
    const saved = await this.repo.save(entity)

    if (config.isDefault) {
      await this.clearOtherDefaults(id)
    }

    return this.toDto(saved)
  }

  async update(
    id: string,
    updates: Partial<Omit<UserProviderConfig, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<UserProviderConfig | null> {
    const existing = await this.repo.findOne({ where: { id } as any })
    if (!existing) return null

    if (updates.name !== undefined) existing.name = updates.name
    if (updates.shortId !== undefined) existing.shortId = updates.shortId || null
    if (updates.apiKey !== undefined) existing.apiKeyEncrypted = updates.apiKey || null
    if (updates.accessKeyId !== undefined) {
      existing.accessKeyId = updates.accessKeyId || null
    }
    if (updates.accessKeySecret !== undefined) {
      existing.accessKeySecretEncrypted = updates.accessKeySecret || null
    }
    if (updates.baseUrl !== undefined) existing.baseUrl = updates.baseUrl || null
    if (updates.imageBaseUrl !== undefined) {
      existing.imageBaseUrl = updates.imageBaseUrl || null
    }
    if (updates.videoBaseUrl !== undefined) {
      existing.videoBaseUrl = updates.videoBaseUrl || null
    }
    if (updates.audioBaseUrl !== undefined) {
      existing.audioBaseUrl = updates.audioBaseUrl || null
    }
    if (updates.customHeaders !== undefined) {
      existing.customHeaders = (updates.customHeaders as Record<string, unknown>) ?? null
    }
    if (updates.customParams !== undefined) {
      existing.customParams = (updates.customParams as Record<string, unknown>) ?? null
    }
    if (updates.models !== undefined) {
      existing.models = (updates.models as unknown[]) ?? null
    }
    if (updates.isEnabled !== undefined) {
      existing.isEnabled = updates.isEnabled ? 1 : 0
    }
    if (updates.isDefault !== undefined) {
      existing.isDefault = updates.isDefault ? 1 : 0
    }
    if (updates.lastTested !== undefined) {
      existing.lastTested = this.isoToDate(updates.lastTested)
    }
    if (updates.testResult !== undefined) {
      existing.testResult = updates.testResult ?? null
    }
    existing.updatedAt = new Date()

    const saved = await this.repo.save(existing)
    if (updates.isDefault) {
      await this.clearOtherDefaults(id)
    }
    return this.toDto(saved)
  }

  async delete(id: string): Promise<boolean> {
    const existing = await this.repo.findOne({ where: { id } as any })
    if (!existing) return false
    await this.repo.delete({ id } as any)
    return true
  }

  async getDefault(): Promise<UserProviderConfig | null> {
    const entity = await this.repo.findOne({
      where: { isDefault: 1, isEnabled: 1 } as any,
    })
    return entity ? this.toDto(entity) : null
  }

  async getEnabled(): Promise<UserProviderConfig[]> {
    const entities = await this.repo
      .createQueryBuilder('p')
      .where('p.is_enabled = :e', { e: 1 })
      .orderBy('p.is_default', 'DESC')
      .addOrderBy('p.created_at', 'ASC')
      .getMany()
    return this.toDtoList(entities)
  }

  async setDefault(id: string): Promise<boolean> {
    const existing = await this.repo.findOne({ where: { id } as any })
    if (!existing) return false
    await this.clearOtherDefaults(id)
    await this.repo.update({ id } as any, {
      isDefault: 1,
      updatedAt: new Date(),
    })
    return true
  }

  async updateTestResult(
    id: string,
    result: 'success' | 'failed' | 'unknown',
    _models?: ModelDefinition[],
  ): Promise<boolean> {
    const now = new Date()
    await this.repo.update({ id } as any, {
      lastTested: now,
      testResult: result,
      updatedAt: now,
    })
    return true
  }

  private async clearOtherDefaults(excludeId: string): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .update(ProviderConfigEntity)
      .set({ isDefault: 0 })
      .where('id != :id', { id: excludeId })
      .execute()
  }

  private generateId(): string {
    return `pc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 11)}`
  }
}
