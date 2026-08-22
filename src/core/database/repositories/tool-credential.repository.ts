/**
 * 第三方凭据仓库（片1 工具）
 * @module core/database/repositories/tool-credential.repository
 */

import type { DataSource, FindOptionsWhere } from 'typeorm'
import type { ToolCredential } from '@shared/types/tool.types'
import { ToolCredentialEntity } from '../entities/tool-credential.entity'
import { BaseRepository } from '../base-repository'

export interface CreateToolCredentialInput {
  name: string
  /** SecureStorage 加密后的密文（service 层负责加密） */
  apiKeyEnc: string
  baseUrl?: string | null
}

export class ToolCredentialRepository extends BaseRepository<ToolCredentialEntity, ToolCredential> {
  constructor(dataSource: DataSource) {
    super(dataSource, ToolCredentialEntity)
  }

  private generateId(): string {
    return `cred_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }

  protected toDto(e: ToolCredentialEntity): ToolCredential {
    return {
      id: e.id,
      name: e.name,
      apiKeyEnc: e.apiKeyEnc,
      baseUrl: e.baseUrl,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }
  }

  async list(): Promise<ToolCredential[]> {
    const rows = await this.scoped.qb('c').orderBy('c.created_at', 'DESC').getMany()
    return this.toDtoList(rows)
  }

  async findById(id: string): Promise<ToolCredential | null> {
    const e = await this.scoped.findOne({ id } as FindOptionsWhere<ToolCredentialEntity>)
    return e ? this.toDto(e) : null
  }

  async create(data: CreateToolCredentialInput): Promise<ToolCredential> {
    const now = new Date()
    const entity = await this.scoped.save({
      id: this.generateId(),
      name: data.name,
      apiKeyEnc: data.apiKeyEnc,
      baseUrl: data.baseUrl ?? null,
      createdAt: now,
      updatedAt: now,
    } as Partial<ToolCredentialEntity>)
    return this.toDto(entity as ToolCredentialEntity)
  }

  async delete(id: string): Promise<number> {
    return this.scoped.delete({ id } as FindOptionsWhere<ToolCredentialEntity>)
  }
}
