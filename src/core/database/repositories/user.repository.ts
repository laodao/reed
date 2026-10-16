/**
 * 用户仓库
 * @module database/repositories/user.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 */

import type { DataSource } from 'typeorm'
import { UserEntity } from '../entities/user.entity'
import { BaseRepository } from '../base-repository'

export interface User {
  id: string
  email: string
  displayName?: string
  role: 'admin' | 'user'
  isActive: boolean
  createdAt: number
  lastLoginAt?: number
}

export interface UserWithSecret extends User {
  passwordHash: string | null
}

export class UserRepository extends BaseRepository<UserEntity, User> {
  constructor(dataSource: DataSource) {
    super(dataSource, UserEntity)
    // 用户表本身不做 user_id 过滤（注册/登录之前 ALS 还没有 userId）
    this.useRawRepo()
  }

  protected toDto(e: UserEntity): User {
    return {
      id: e.id,
      email: e.email,
      displayName: e.displayName ?? undefined,
      role: (e.role === 'admin' ? 'admin' : 'user') as 'admin' | 'user',
      isActive: e.isActive === 1,
      createdAt: e.createdAt,
      lastLoginAt: e.lastLoginAt ?? undefined,
    }
  }

  private toDtoWithSecret(e: UserEntity): UserWithSecret {
    return { ...this.toDto(e), passwordHash: e.passwordHash }
  }

  async getById(id: string): Promise<User | null> {
    return this.findOneByWhere({ id } as any)
  }

  async getByEmail(email: string): Promise<UserWithSecret | null> {
    const row = await this.repo.findOne({ where: { email } as any })
    return row ? this.toDtoWithSecret(row) : null
  }

  async getAll(): Promise<User[]> {
    const rows = await this.repo.find({ order: { createdAt: 'DESC' } as any })
    return this.toDtoList(rows)
  }

  async create(data: {
    id?: string
    email: string
    displayName?: string
    passwordHash?: string | null
    role?: 'admin' | 'user'
  }): Promise<User> {
    const id = data.id || `user_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
    const now = Date.now()
    await this.repo.save(
      this.repo.create({
        id,
        email: data.email,
        displayName: data.displayName ?? null,
        passwordHash: data.passwordHash ?? null,
        role: data.role ?? 'user',
        isActive: 1,
        createdAt: now,
        lastLoginAt: null,
      }),
    )
    return {
      id,
      email: data.email,
      displayName: data.displayName,
      role: data.role ?? 'user',
      isActive: true,
      createdAt: now,
    }
  }

  async upsert(data: {
    id: string
    email: string
    displayName?: string
    passwordHash?: string | null
    role?: 'admin' | 'user'
  }): Promise<User> {
    const existing = await this.repo.findOne({ where: { id: data.id } as any })
    if (existing) {
      existing.email = data.email
      if (data.displayName !== undefined) existing.displayName = data.displayName
      if (data.passwordHash !== undefined) existing.passwordHash = data.passwordHash
      if (data.role !== undefined) existing.role = data.role
      await this.repo.save(existing)
      return this.toDto(existing)
    }
    return this.create(data)
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.repo.update({ id } as any, { lastLoginAt: Date.now() })
  }

  async setActive(id: string, isActive: boolean): Promise<void> {
    await this.repo.update({ id } as any, { isActive: isActive ? 1 : 0 })
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.repo.delete({ id } as any)
    return (result.affected ?? 0) > 0
  }
}
