/**
 * 项目↔角色 IP 库绑定仓库（设定资产库 P0-2026-09-24）
 */

import type { DataSource } from 'typeorm'
import { randomUUID } from 'crypto'
import { LwIpBindingEntity } from '../entities/lw-ip-binding.entity'
import { BaseRepository } from '../base-repository'
import type { IpBinding } from '@shared/types/lw-library.types'

export class LwIpBindingRepository extends BaseRepository<LwIpBindingEntity, IpBinding> {
  constructor(dataSource: DataSource) {
    super(dataSource, LwIpBindingEntity)
  }

  protected toDto(e: LwIpBindingEntity): IpBinding {
    return {
      id: e.id,
      projectId: e.projectId,
      ipCharacterId: e.ipCharacterId,
      ipName: e.ipName,
      projectCharacterId: e.projectCharacterId,
      rolePosition: e.rolePosition,
      createdAt: Number(e.createdAt) || 0,
    }
  }

  async listByProjectId(projectId: string): Promise<IpBinding[]> {
    const rows = await this.scoped.find({
      where: { projectId } as any,
      order: { createdAt: 'ASC' },
    } as any)
    return this.toDtoList(rows)
  }

  /** 反查：该 IP 角色被哪些项目引用（出场故事列表） */
  async listByIpCharacterId(ipCharacterId: string): Promise<IpBinding[]> {
    const rows = await this.repo.find({ where: { ipCharacterId } as any })
    return this.toDtoList(rows)
  }

  async getByProjectAndIp(projectId: string, ipCharacterId: string): Promise<IpBinding | null> {
    const row = await this.scoped.findOne({ projectId, ipCharacterId } as any)
    return row ? this.toDto(row) : null
  }

  async getByProjectCharacterId(projectCharacterId: string): Promise<IpBinding | null> {
    const row = await this.repo.findOne({ where: { projectCharacterId } as any })
    return row ? this.toDto(row) : null
  }

  async create(data: {
    projectId: string
    ipCharacterId: string
    ipName: string
    rolePosition?: string | null
  }): Promise<IpBinding> {
    const entity = this.repo.create({
      id: `ipb_${randomUUID().slice(0, 12)}`,
      projectId: data.projectId,
      ipCharacterId: data.ipCharacterId,
      ipName: data.ipName,
      projectCharacterId: null,
      rolePosition: data.rolePosition ?? null,
      createdAt: Date.now(),
    })
    const saved = await this.scoped.save(entity)
    return this.toDto(saved)
  }

  async fillProjectCharacterId(id: string, projectCharacterId: string): Promise<void> {
    await this.repo.update({ id } as any, { projectCharacterId })
  }

  async setRolePosition(id: string, rolePosition: string | null): Promise<void> {
    await this.repo.update({ id } as any, { rolePosition })
  }

  async deleteRow(id: string): Promise<boolean> {
    const affected = await this.scoped.delete({ id } as any)
    return affected > 0
  }
}
