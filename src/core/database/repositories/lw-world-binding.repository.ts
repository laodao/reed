/**
 * 项目↔世界观库绑定仓库（设定资产库 P0-2026-09-24）
 */

import type { DataSource } from 'typeorm'
import { randomUUID } from 'crypto'
import { LwWorldBindingEntity } from '../entities/lw-world-binding.entity'
import { BaseRepository } from '../base-repository'
import { getCurrentUserId } from '@core/context/user-context'
import type { WorldBinding, WorldBindingConfig, BindWorldRequest } from '@shared/types/lw-library.types'

export class LwWorldBindingRepository extends BaseRepository<LwWorldBindingEntity, WorldBinding> {
  constructor(dataSource: DataSource) {
    super(dataSource, LwWorldBindingEntity)
  }

  protected toDto(e: LwWorldBindingEntity): WorldBinding {
    let config: WorldBindingConfig | null = null
    if (e.config) {
      try {
        config = JSON.parse(e.config) as WorldBindingConfig
      } catch {
        config = null
      }
    }
    return {
      id: e.id,
      projectId: e.projectId,
      worldId: e.worldId,
      worldName: e.worldName,
      isPrimary: e.isPrimary === 1,
      config,
      createdAt: Number(e.createdAt) || 0,
    }
  }

  async listByProjectId(projectId: string): Promise<WorldBinding[]> {
    const rows = await this.scoped.find({
      where: { projectId } as any,
      order: { isPrimary: 'DESC', createdAt: 'ASC' },
    } as any)
    return this.toDtoList(rows)
  }

  /** 反查：库被哪些项目引用（删除前校验用） */
  async listByWorldId(worldId: string): Promise<WorldBinding[]> {
    const rows = await this.repo.find({ where: { worldId } as any })
    return this.toDtoList(rows)
  }

  async getByProjectAndWorld(projectId: string, worldId: string): Promise<WorldBinding | null> {
    const row = await this.scoped.findOne({ projectId, worldId } as any)
    return row ? this.toDto(row) : null
  }

  async create(data: BindWorldRequest & { worldName: string }): Promise<WorldBinding> {
    const entity = this.repo.create({
      id: `wb_${randomUUID().slice(0, 12)}`,
      projectId: data.projectId,
      worldId: data.worldId,
      worldName: data.worldName,
      isPrimary: data.isPrimary === false ? 0 : 1,
      config: data.config ? JSON.stringify(data.config) : null,
      createdAt: Date.now(),
    })
    const saved = await this.scoped.save(entity)
    return this.toDto(saved)
  }

  async updateConfig(id: string, config: WorldBindingConfig | null): Promise<WorldBinding | null> {
    const existing = await this.scoped.findOne({ id } as any)
    if (!existing) return null
    existing.config = config ? JSON.stringify(config) : null
    const saved = await this.scoped.save(existing)
    return this.toDto(saved)
  }

  async setPrimary(projectId: string, id: string): Promise<void> {
    // 租户收口：project_id 是普通列非唯一，此前裸事务可清空/翻转其他租户项目的主绑定
    const userId = getCurrentUserId()
    if (!userId) throw new Error('[LwWorldBinding] 未获取到当前用户，拒绝 setPrimary')
    await this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(LwWorldBindingEntity)
      // 先清该项目（限当前用户）全部主标记，再置目标行（限当前用户）
      await repo
        .createQueryBuilder()
        .update(LwWorldBindingEntity)
        .set({ isPrimary: 0 })
        .where('project_id = :pid AND user_id = :uid', { pid: projectId, uid: userId })
        .execute()
      await repo
        .createQueryBuilder()
        .update(LwWorldBindingEntity)
        .set({ isPrimary: 1 })
        .where('id = :id AND user_id = :uid', { id, uid: userId })
        .execute()
    })
  }

  async deleteRow(id: string): Promise<boolean> {
    const affected = await this.scoped.delete({ id } as any)
    return affected > 0
  }
}
