/**
 * OSS 配置数据访问层
 * @module database/repositories/oss-config.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 */

import type { DataSource } from 'typeorm'
import type {
  OSSConfig,
  CreateOSSConfigRequest,
  UpdateOSSConfigRequest,
  OSSProviderType,
} from '@shared/types/oss.types'
import { OSSConfigEntity } from '../entities/oss-config.entity'
import { BaseRepository } from '../base-repository'

export class OSSConfigRepository extends BaseRepository<
  OSSConfigEntity,
  OSSConfig
> {
  constructor(dataSource: DataSource) {
    super(dataSource, OSSConfigEntity)
    // 共享配置类 Repository：所有用户共享数据，不做 user_id 过滤
    this.useRawRepo()
  }

  /**
   * 初始化表结构（兼容旧调用：DatabaseManager 会调用 initTable）。
   * Entity 已在 DataSource 注册，此处用 dataSource.synchronize() 创建（仅当不存在时）。
   * 在生产中调用为 no-op（synchronize 检测到表存在不动）。
   */
  async initTable(): Promise<void> {
    // 由 OSS 设计：表创建独立，不在主初始化流程中。
    // 调用 dataSource.synchronize 将创建/同步本 Entity 对应的表。
    // 注：这会同步所有已注册的 Entity 表，但因为都已存在所以是 no-op；
    // 若想精确控制，可手写 CREATE TABLE IF NOT EXISTS oss_configs(...)。
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS oss_configs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        provider TEXT NOT NULL,
        access_key_id TEXT NOT NULL,
        access_key_secret TEXT NOT NULL,
        region TEXT NOT NULL,
        bucket TEXT NOT NULL,
        endpoint TEXT,
        custom_domain TEXT,
        path_prefix TEXT,
        is_enabled ${this.isPostgres() ? 'integer' : 'INTEGER'} NOT NULL DEFAULT 1,
        is_default ${this.isPostgres() ? 'integer' : 'INTEGER'} NOT NULL DEFAULT 0,
        created_at ${this.isPostgres() ? 'bigint' : 'INTEGER'} NOT NULL,
        updated_at ${this.isPostgres() ? 'bigint' : 'INTEGER'} NOT NULL
      )
    `)
  }

  private isPostgres(): boolean {
    return this.dataSource.options.type === 'postgres'
  }

  protected toDto(e: OSSConfigEntity): OSSConfig {
    return {
      id: e.id,
      name: e.name,
      provider: e.provider as OSSProviderType,
      accessKeyId: e.accessKeyId,
      accessKeySecret: e.accessKeySecret,
      region: e.region,
      bucket: e.bucket,
      endpoint: e.endpoint || undefined,
      customDomain: e.customDomain || undefined,
      pathPrefix: e.pathPrefix || undefined,
      isEnabled: e.isEnabled === 1,
      isDefault: e.isDefault === 1,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    } as OSSConfig
  }

  async create(
    request: CreateOSSConfigRequest & { id: string; accessKeySecret: string },
  ): Promise<OSSConfig> {
    const now = Date.now()
    const entity = this.repo.create({
      id: request.id,
      name: request.name,
      provider: request.provider,
      accessKeyId: request.accessKeyId,
      accessKeySecret: request.accessKeySecret,
      region: request.region,
      bucket: request.bucket,
      endpoint: request.endpoint ?? null,
      customDomain: request.customDomain ?? null,
      pathPrefix: request.pathPrefix ?? null,
      isEnabled: 1,
      isDefault: 0,
      createdAt: now,
      updatedAt: now,
    })
    const saved = await this.repo.save(entity)
    return this.toDto(saved)
  }

  async getById(id: string): Promise<OSSConfig | null> {
    return this.findOneByWhere({ id } as any)
  }

  async getAll(): Promise<OSSConfig[]> {
    const entities = await this.repo
      .createQueryBuilder('o')
      .orderBy('o.is_default', 'DESC')
      .addOrderBy('o.created_at', 'DESC')
      .getMany()
    return this.toDtoList(entities)
  }

  async getEnabled(): Promise<OSSConfig[]> {
    const entities = await this.repo
      .createQueryBuilder('o')
      .where('o.is_enabled = :e', { e: 1 })
      .orderBy('o.is_default', 'DESC')
      .addOrderBy('o.created_at', 'DESC')
      .getMany()
    return this.toDtoList(entities)
  }

  async getDefault(): Promise<OSSConfig | null> {
    // 优先返回已启用且标记为默认的配置
    const def = await this.repo.findOne({
      where: { isEnabled: 1, isDefault: 1 } as any,
    })
    if (def) return this.toDto(def)

    // 没有标记默认时，仅当启用配置恰好一条才回退（避免多配置下误选）
    const enabled = await this.repo
      .createQueryBuilder('o')
      .where('o.is_enabled = :e', { e: 1 })
      .orderBy('o.created_at', 'DESC')
      .getMany()
    return enabled.length === 1 ? this.toDto(enabled[0]!) : null
  }

  async update(
    id: string,
    request: Partial<UpdateOSSConfigRequest & { accessKeySecret?: string }>,
  ): Promise<boolean> {
    const existing = await this.repo.findOne({ where: { id } as any })
    if (!existing) return false

    if (request.name !== undefined) existing.name = request.name
    if (request.accessKeyId) existing.accessKeyId = request.accessKeyId
    if (request.accessKeySecret) existing.accessKeySecret = request.accessKeySecret
    if (request.region !== undefined) existing.region = request.region
    if (request.bucket !== undefined) existing.bucket = request.bucket
    if (request.endpoint !== undefined) existing.endpoint = request.endpoint || null
    if (request.customDomain !== undefined) existing.customDomain = request.customDomain || null
    if (request.pathPrefix !== undefined) existing.pathPrefix = request.pathPrefix || null
    if (request.isEnabled !== undefined) existing.isEnabled = request.isEnabled ? 1 : 0
    if (request.isDefault !== undefined) existing.isDefault = request.isDefault ? 1 : 0
    existing.updatedAt = Date.now()

    await this.repo.save(existing)
    return true
  }

  async setDefault(id: string): Promise<boolean> {
    const existing = await this.repo.findOne({ where: { id } as any })
    if (!existing) return false

    await this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(OSSConfigEntity)
      await repo
        .createQueryBuilder()
        .update(OSSConfigEntity)
        .set({ isDefault: 0 })
        .execute()
      await repo.update({ id } as any, { isDefault: 1 })
    })
    return true
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.repo.delete({ id } as any)
    return (result.affected ?? 0) > 0
  }

  async toggleEnabled(id: string): Promise<boolean> {
    const existing = await this.repo.findOne({ where: { id } as any })
    if (!existing) return false
    existing.isEnabled = existing.isEnabled === 1 ? 0 : 1
    existing.updatedAt = Date.now()
    await this.repo.save(existing)
    return true
  }
}
