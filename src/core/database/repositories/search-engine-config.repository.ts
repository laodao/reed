/**
 * 搜索引擎配置数据访问层
 * @module database/repositories/search-engine-config.repository
 * @description 提供搜索引擎配置的数据库操作。
 *              基于 TypeORM 实现，支持 sqlite / postgres 双方言。
 */

import type { DataSource } from 'typeorm'
import type {
  UserSearchEngineConfig,
  SearchEngineType,
} from '@shared/types/search-engine.types'
import { SearchEngineConfigEntity } from '../entities/search-engine-config.entity'
import { BaseRepository } from '../base-repository'

export class SearchEngineConfigRepository extends BaseRepository<
  SearchEngineConfigEntity,
  UserSearchEngineConfig
> {
  constructor(dataSource: DataSource) {
    super(dataSource, SearchEngineConfigEntity)
  }

  protected toDto(e: SearchEngineConfigEntity): UserSearchEngineConfig {
    return {
      id: e.id,
      templateId: e.templateId as SearchEngineType,
      name: e.name,
      apiKey: e.apiKeyEncrypted || undefined,
      extraConfig:
        e.extraConfig === null ? undefined : (e.extraConfig as Record<string, unknown>),
      maxResults: e.maxResults || 5,
      isEnabled: e.isEnabled === 1,
      isDefault: e.isDefault === 1,
      lastTested: this.dateToIso(e.lastTested),
      testResult: (e.testResult as 'success' | 'failed' | 'unknown') || undefined,
      createdAt: this.dateToIso(e.createdAt) ?? '',
      updatedAt: this.dateToIso(e.updatedAt) ?? '',
    }
  }

  private dateToIso(v: Date | string | null | undefined): string | undefined {
    if (v === null || v === undefined) return undefined
    if (v instanceof Date) return v.toISOString()
    if (typeof v === 'string') return v
    return undefined
  }

  /** 业务侧 ISO 字符串 → Entity Date（保留 sqlite/pg 跨方言一致） */
  private isoToDate(iso: string | null | undefined): Date | null {
    if (!iso) return null
    return new Date(iso)
  }

  async getAll(): Promise<UserSearchEngineConfig[]> {
    const entities = await this.repo
      .createQueryBuilder('c')
      .orderBy('c.is_default', 'DESC')
      .addOrderBy('c.created_at', 'ASC')
      .getMany()
    return this.toDtoList(entities)
  }

  async getById(id: string): Promise<UserSearchEngineConfig | null> {
    return this.findOneByWhere({ id } as any)
  }

  async getByTemplateId(
    templateId: SearchEngineType,
  ): Promise<UserSearchEngineConfig[]> {
    return this.findManyByWhere({ templateId } as any, { createdAt: 'ASC' })
  }

  async create(
    config: Omit<UserSearchEngineConfig, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<UserSearchEngineConfig> {
    const id = this.generateId()
    const now = new Date()
    const entity = this.repo.create({
      id,
      templateId: config.templateId,
      name: config.name,
      apiKeyEncrypted: config.apiKey ?? null,
      extraConfig: config.extraConfig ?? null,
      maxResults: config.maxResults ?? 5,
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
    updates: Partial<Omit<UserSearchEngineConfig, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<UserSearchEngineConfig | null> {
    const existing = await this.repo.findOne({ where: { id } as any })
    if (!existing) return null

    if (updates.name !== undefined) existing.name = updates.name
    if (updates.apiKey !== undefined) existing.apiKeyEncrypted = updates.apiKey || null
    if (updates.extraConfig !== undefined) existing.extraConfig = updates.extraConfig ?? null
    if (updates.maxResults !== undefined) existing.maxResults = updates.maxResults
    if (updates.isEnabled !== undefined) existing.isEnabled = updates.isEnabled ? 1 : 0
    if (updates.isDefault !== undefined) existing.isDefault = updates.isDefault ? 1 : 0
    if (updates.lastTested !== undefined) existing.lastTested = this.isoToDate(updates.lastTested)
    if (updates.testResult !== undefined) existing.testResult = updates.testResult ?? null
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

  async getDefault(): Promise<UserSearchEngineConfig | null> {
    const entity = await this.repo.findOne({
      where: { isDefault: 1, isEnabled: 1 } as any,
    })
    return entity ? this.toDto(entity) : null
  }

  async getEnabled(): Promise<UserSearchEngineConfig[]> {
    const entities = await this.repo
      .createQueryBuilder('c')
      .where('c.is_enabled = :enabled', { enabled: 1 })
      .orderBy('c.is_default', 'DESC')
      .addOrderBy('c.created_at', 'ASC')
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
      .update(SearchEngineConfigEntity)
      .set({ isDefault: 0 })
      .where('id != :id', { id: excludeId })
      .execute()
  }

  private generateId(): string {
    return `sec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 11)}`
  }
}
