/**
 * 信息搜集「项目」仓库（ic_projects，2026-10-07 设计落地）
 * @module database/repositories/ic-project.repository
 *
 * 项目 = 长期资料分区 + 当前生效蓝图。蓝图 JSON 以 IcBlueprint 读写（解析失败
 * 返回 null 由服务层处理——坏蓝图不炸读取）。内容不落本表：正文与整理产出在
 * 项目 kb_id 对应的知识库（v2 设计裁决）。
 */

import type { DataSource } from 'typeorm'
import { IcProjectEntity } from '../entities/info-collection/ic-project.entity'
import type { IcBlueprint, IcProjectStatus, IcRefreshPolicy } from '@shared/types/info-collection.types'
import { BaseRepository } from '../base-repository'

/** ic_projects 行 DTO（JSON 已解析） */
export interface IcProjectRow {
  id: string
  userId: string | null
  name: string
  goal: string
  /** 解析失败为 null（坏蓝图不炸读取；服务层据此拒绝执行） */
  blueprint: IcBlueprint | null
  blueprintVersion: number
  kbId: string | null
  refreshPolicy: IcRefreshPolicy | null
  status: IcProjectStatus
  createdAt: Date | null
  updatedAt: Date | null
}

function safeParse<T>(json: string | null): T | null {
  if (!json) return null
  try {
    return JSON.parse(json) as T
  } catch {
    return null
  }
}

export class IcProjectRepository extends BaseRepository<IcProjectEntity, IcProjectRow> {
  constructor(dataSource: DataSource) {
    super(dataSource, IcProjectEntity)
  }

  async create(input: {
    id: string
    name: string
    goal: string
    blueprint: IcBlueprint
    kbId?: string | null
    refreshPolicy?: IcRefreshPolicy | null
  }): Promise<IcProjectRow> {
    const now = new Date()
    const e = new IcProjectEntity()
    e.id = input.id
    e.userId = null // scoped.insert 注入
    e.name = input.name
    e.goal = input.goal
    e.blueprintJson = JSON.stringify(input.blueprint)
    e.blueprintVersion = input.blueprint.version ?? 1
    e.kbId = input.kbId ?? null
    e.refreshPolicyJson = input.refreshPolicy ? JSON.stringify(input.refreshPolicy) : null
    e.status = 'active'
    e.createdAt = now
    e.updatedAt = now
    await this.scoped.insert(e)
    return (await this.getById(input.id))!
  }

  async getById(id: string): Promise<IcProjectRow | null> {
    const e = await this.scoped.findOne({ id })
    return e ? this.toDto(e) : null
  }

  async list(status?: IcProjectStatus): Promise<IcProjectRow[]> {
    const rows = await this.scoped.find({
      where: status ? { status } : {},
      order: { updatedAt: 'DESC' },
    })
    return this.toDtoList(rows)
  }

  async patch(
    id: string,
    partial: Partial<{
      name: string
      goal: string
      blueprint: IcBlueprint
      kbId: string | null
      refreshPolicy: IcRefreshPolicy | null
      status: IcProjectStatus
    }>,
  ): Promise<void> {
    const p: Partial<IcProjectEntity> = { updatedAt: new Date() }
    if (partial.name !== undefined) p.name = partial.name
    if (partial.goal !== undefined) p.goal = partial.goal
    if (partial.blueprint !== undefined) {
      p.blueprintJson = JSON.stringify(partial.blueprint)
      p.blueprintVersion = partial.blueprint.version
    }
    if (partial.kbId !== undefined) p.kbId = partial.kbId
    if (partial.refreshPolicy !== undefined) {
      p.refreshPolicyJson = partial.refreshPolicy ? JSON.stringify(partial.refreshPolicy) : null
    }
    if (partial.status !== undefined) p.status = partial.status
    await this.scoped.update({ id }, p)
  }

  protected toDto(e: IcProjectEntity): IcProjectRow {
    return {
      id: e.id,
      userId: e.userId,
      name: e.name,
      goal: e.goal,
      blueprint: safeParse<IcBlueprint>(e.blueprintJson),
      blueprintVersion: e.blueprintVersion,
      kbId: e.kbId,
      refreshPolicy: safeParse<IcRefreshPolicy>(e.refreshPolicyJson),
      status: e.status as IcProjectStatus,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }
  }
}
