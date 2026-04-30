/**
 * API 密钥数据访问层
 * @module database/repositories/api-key
 * @description 提供 API 密钥的数据库操作，密钥以加密形式存储。
 *              基于 TypeORM 实现，支持 sqlite / postgres 双方言。
 */

import type { DataSource } from 'typeorm'
import { ApiKeyEntity } from '../entities/api-key.entity'
import { BaseRepository } from '../base-repository'

interface ApiKeyDto {
  encryptedKey: string
  endpoint?: string
}

export class ApiKeyRepository extends BaseRepository<ApiKeyEntity, ApiKeyDto> {
  constructor(dataSource: DataSource) {
    super(dataSource, ApiKeyEntity)
  }

  protected toDto(e: ApiKeyEntity): ApiKeyDto {
    return {
      encryptedKey: e.encryptedKey,
      endpoint: e.endpoint || undefined,
    }
  }

  /**
   * 获取所有已配置的密钥摘要
   */
  async getAll(): Promise<Array<{ provider: string; hasEndpoint: boolean }>> {
    const entities = await this.repo.find({ select: ['provider', 'endpoint'] })
    return entities.map(e => ({
      provider: e.provider,
      hasEndpoint: !!e.endpoint,
    }))
  }

  /**
   * 保存（upsert）密钥
   */
  async save(
    provider: string,
    encryptedKey: string,
    endpoint?: string,
  ): Promise<void> {
    await this.repo.save({
      provider,
      encryptedKey,
      endpoint: endpoint ?? null,
    })
  }

  /**
   * 获取密钥
   */
  async get(provider: string): Promise<ApiKeyDto | null> {
    return this.findOneByWhere({ provider } as any)
  }

  /**
   * 删除密钥
   */
  async delete(provider: string): Promise<void> {
    await this.deleteByWhere({ provider } as any)
  }

  /**
   * 检查密钥是否存在
   */
  async exists(provider: string): Promise<boolean> {
    return this.existsByWhere({ provider } as any)
  }
}
