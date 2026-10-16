/**
 * 数据源配置数据访问层
 * @module database/repositories/datasource.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 *              数据源是共享配置类（同 oss-config / search-engine-config），不做 user_id 过滤。
 *              password 在 service 层加密后存入 password_enc；仓库只读写密文。
 */

import type { DataSource } from 'typeorm'
import type {
  DataSourceConfig,
  CreateDataSourceRequest,
  UpdateDataSourceRequest,
} from '@shared/types/datasource.types'
import { DataSourceEntity } from '../entities/datasource.entity'
import { BaseRepository } from '../base-repository'

export class DataSourceRepository extends BaseRepository<
  DataSourceEntity,
  DataSourceConfig
> {
  constructor(dataSource: DataSource) {
    super(dataSource, DataSourceEntity)
    // 共享配置类：所有用户共享数据，不做 user_id 过滤
    this.useRawRepo()
  }

  /** 初始化表结构（兼容旧调用；Entity 已在 DataSource 注册） */
  async initTable(): Promise<void> {
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS data_sources (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        driver TEXT NOT NULL,
        host TEXT NOT NULL,
        port ${this.isPostgres() ? 'integer' : 'INTEGER'} NOT NULL,
        database TEXT NOT NULL,
        username TEXT,
        password_enc TEXT,
        ssl ${this.isPostgres() ? 'integer' : 'INTEGER'} NOT NULL DEFAULT 0,
        is_enabled ${this.isPostgres() ? 'integer' : 'INTEGER'} NOT NULL DEFAULT 1,
        created_at ${this.isPostgres() ? 'bigint' : 'INTEGER'} NOT NULL,
        updated_at ${this.isPostgres() ? 'bigint' : 'INTEGER'} NOT NULL
      )
    `)
  }

  private isPostgres(): boolean {
    return this.dataSource.options.type === 'postgres'
  }

  protected toDto(e: DataSourceEntity): DataSourceConfig {
    return {
      id: e.id,
      name: e.name,
      driver: e.driver as DataSourceConfig['driver'],
      host: e.host,
      port: e.port,
      database: e.database,
      username: e.username,
      passwordEnc: e.passwordEnc,
      ssl: e.ssl === 1,
      isEnabled: e.isEnabled === 1,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    } as DataSourceConfig
  }

  async create(
    request: CreateDataSourceRequest & { id: string; passwordEnc: string | null },
  ): Promise<DataSourceConfig> {
    const now = Date.now()
    const entity = this.repo.create({
      id: request.id,
      name: request.name,
      driver: request.driver,
      host: request.host,
      port: request.port,
      database: request.database,
      username: request.username || null,
      passwordEnc: request.passwordEnc,
      ssl: request.ssl ? 1 : 0,
      isEnabled: 1,
      createdAt: now,
      updatedAt: now,
    })
    const saved = await this.repo.save(entity)
    return this.toDto(saved)
  }

  async getById(id: string): Promise<DataSourceConfig | null> {
    const e = await this.repo.findOne({ where: { id } as any })
    return e ? this.toDto(e) : null
  }

  async getAll(): Promise<DataSourceConfig[]> {
    const entities = await this.repo
      .createQueryBuilder('s')
      .orderBy('s.is_enabled', 'DESC')
      .addOrderBy('s.created_at', 'DESC')
      .getMany()
    return this.toDtoList(entities)
  }

  /** 仅启用中的（节点执行默认只允许选中已启用的数据源） */
  async getEnabled(): Promise<DataSourceConfig[]> {
    const entities = await this.repo
      .createQueryBuilder('s')
      .where('s.is_enabled = :e', { e: 1 })
      .orderBy('s.created_at', 'DESC')
      .getMany()
    return this.toDtoList(entities)
  }

  async update(
    id: string,
    request: Partial<UpdateDataSourceRequest & { passwordEnc?: string | null }>,
  ): Promise<boolean> {
    const e = await this.repo.findOne({ where: { id } as any })
    if (!e) return false

    if (request.name !== undefined) e.name = request.name
    if (request.driver !== undefined) e.driver = request.driver
    if (request.host !== undefined) e.host = request.host
    if (request.port !== undefined) e.port = request.port
    if (request.database !== undefined) e.database = request.database
    if (request.username !== undefined) e.username = request.username || null
    if (request.passwordEnc !== undefined) e.passwordEnc = request.passwordEnc
    if (request.ssl !== undefined) e.ssl = request.ssl ? 1 : 0
    if (request.isEnabled !== undefined) e.isEnabled = request.isEnabled ? 1 : 0
    e.updatedAt = Date.now()

    await this.repo.save(e)
    return true
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.repo.delete({ id } as any)
    return (result.affected ?? 0) > 0
  }

  async toggleEnabled(id: string): Promise<boolean> {
    const e = await this.repo.findOne({ where: { id } as any })
    if (!e) return false
    e.isEnabled = e.isEnabled === 1 ? 0 : 1
    e.updatedAt = Date.now()
    await this.repo.save(e)
    return true
  }
}
