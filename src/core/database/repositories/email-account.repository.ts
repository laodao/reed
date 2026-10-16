/**
 * 邮箱账号仓库（邮件收发）
 * @module core/database/repositories/email-account.repository
 * @description 多租户（继承 BaseRepository 的 scoped 按 userId 自动过滤）；
 *              passEnc 为 SecureStorage 加密后的密文，create/update 由 service 层负责加密传入。
 *              安全（评审 #16）：DTO 一律不携带 passEnc 密文（渲染端/浏览器无任何需要），
 *              服务层连接前解密走 getRawById 取原始实体。
 */

import type { DataSource, FindOptionsWhere } from 'typeorm'
import type { EmailAccount } from '@shared/types/email.types'
import { EmailAccountEntity } from '../entities/email-account.entity'
import { BaseRepository } from '../base-repository'

export interface CreateEmailAccountInput {
  name: string
  host?: string | null
  imapHost: string
  imapPort?: number
  imapSecure?: boolean
  smtpHost: string
  smtpPort?: number
  smtpSecure?: boolean
  user: string
  /** SecureStorage 加密后的密文（service 层负责加密） */
  passEnc: string
  fromName?: string | null
}

export interface UpdateEmailAccountInput {
  name?: string
  host?: string | null
  imapHost?: string
  imapPort?: number
  imapSecure?: boolean
  smtpHost?: string
  smtpPort?: number
  smtpSecure?: boolean
  user?: string
  /** SecureStorage 加密后的密文（service 层负责加密）；不传则保持原值 */
  passEnc?: string
  fromName?: string | null
}

export class EmailAccountRepository extends BaseRepository<EmailAccountEntity, EmailAccount> {
  constructor(dataSource: DataSource) {
    super(dataSource, EmailAccountEntity)
  }

  private generateId(): string {
    return `email_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }

  protected toDto(e: EmailAccountEntity): EmailAccount {
    return {
      id: e.id,
      name: e.name,
      host: e.host ?? '',
      imapHost: e.imapHost,
      imapPort: e.imapPort,
      imapSecure: e.imapSecure,
      smtpHost: e.smtpHost,
      smtpPort: e.smtpPort,
      smtpSecure: e.smtpSecure,
      user: e.user,
      // 评审 #16：密文不出仓库 DTO 层；是否已配置密码用布尔派生
      hasPassword: !!e.passEnc,
      fromName: e.fromName ?? '',
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }
  }

  /**
   * 取原始实体（含 passEnc 密文）——仅限服务端连接前解密使用，
   * 任何返回渲染端的路径都必须走 toDto 系方法。
   */
  async getRawById(id: string): Promise<EmailAccountEntity | null> {
    return this.scoped.findOne({ id } as FindOptionsWhere<EmailAccountEntity>)
  }

  async list(): Promise<EmailAccount[]> {
    const rows = await this.scoped.qb('e').orderBy('e.created_at', 'DESC').getMany()
    return this.toDtoList(rows)
  }

  async findById(id: string): Promise<EmailAccount | null> {
    const e = await this.scoped.findOne({ id } as FindOptionsWhere<EmailAccountEntity>)
    return e ? this.toDto(e) : null
  }

  async create(data: CreateEmailAccountInput): Promise<EmailAccount> {
    const now = new Date()
    const entity = await this.scoped.save({
      id: this.generateId(),
      name: data.name,
      host: data.host ?? null,
      imapHost: data.imapHost,
      imapPort: data.imapPort ?? 993,
      imapSecure: data.imapSecure ?? true,
      smtpHost: data.smtpHost,
      smtpPort: data.smtpPort ?? 465,
      smtpSecure: data.smtpSecure ?? true,
      user: data.user,
      passEnc: data.passEnc,
      fromName: data.fromName ?? null,
      createdAt: now,
      updatedAt: now,
    } as Partial<EmailAccountEntity>)
    return this.toDto(entity as EmailAccountEntity)
  }

  async update(id: string, patch: UpdateEmailAccountInput): Promise<EmailAccount | null> {
    const partial: Partial<EmailAccountEntity> = { updatedAt: new Date() }
    if (patch.name !== undefined) partial.name = patch.name
    if (patch.host !== undefined) partial.host = patch.host
    if (patch.imapHost !== undefined) partial.imapHost = patch.imapHost
    if (patch.imapPort !== undefined) partial.imapPort = patch.imapPort
    if (patch.imapSecure !== undefined) partial.imapSecure = patch.imapSecure
    if (patch.smtpHost !== undefined) partial.smtpHost = patch.smtpHost
    if (patch.smtpPort !== undefined) partial.smtpPort = patch.smtpPort
    if (patch.smtpSecure !== undefined) partial.smtpSecure = patch.smtpSecure
    if (patch.user !== undefined) partial.user = patch.user
    if (patch.passEnc !== undefined) partial.passEnc = patch.passEnc
    if (patch.fromName !== undefined) partial.fromName = patch.fromName
    await this.scoped.update({ id } as FindOptionsWhere<EmailAccountEntity>, partial)
    return this.findById(id)
  }

  async delete(id: string): Promise<number> {
    return this.scoped.delete({ id } as FindOptionsWhere<EmailAccountEntity>)
  }
}
