/**
 * 信息搜集「任务」仓库（ic_tasks，2026-10-07 设计落地）
 * @module database/repositories/ic-task.repository
 *
 * 任务 = 一次蓝图执行。状态机 pending → running → reviewing → done | failed | cancelled
 * 由服务层推进，仓库只做受 scope 保护的读写。
 */

import type { DataSource } from 'typeorm'
import { IcTaskEntity } from '../entities/info-collection/ic-task.entity'
import type { IcTaskStatus } from '@shared/types/info-collection.types'
import { BaseRepository } from '../base-repository'

/** ic_tasks 行 DTO（stats 已解析） */
export interface IcTaskRow {
  id: string
  userId: string | null
  projectId: string
  blueprintVersion: number
  runId: string | null
  status: IcTaskStatus
  stats: Record<string, unknown> | null
  createdAt: Date | null
  finishedAt: Date | null
}

function safeParse(json: string | null): Record<string, unknown> | null {
  if (!json) return null
  try {
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return null
  }
}

export class IcTaskRepository extends BaseRepository<IcTaskEntity, IcTaskRow> {
  constructor(dataSource: DataSource) {
    super(dataSource, IcTaskEntity)
  }

  async create(input: { id: string; projectId: string; blueprintVersion: number }): Promise<IcTaskRow> {
    const now = new Date()
    const e = new IcTaskEntity()
    e.id = input.id
    e.userId = null // scoped.insert 注入
    e.projectId = input.projectId
    e.blueprintVersion = input.blueprintVersion
    e.runId = null
    e.status = 'pending'
    e.statsJson = null
    e.createdAt = now
    e.finishedAt = null
    await this.scoped.insert(e)
    return (await this.getById(input.id))!
  }

  async getById(id: string): Promise<IcTaskRow | null> {
    const e = await this.scoped.findOne({ id })
    return e ? this.toDto(e) : null
  }

  async listByProject(projectId: string): Promise<IcTaskRow[]> {
    const rows = await this.scoped.find({
      where: { projectId },
      order: { createdAt: 'DESC' },
    })
    return this.toDtoList(rows)
  }

  async patch(
    id: string,
    partial: Partial<{
      status: IcTaskStatus
      runId: string | null
      stats: Record<string, unknown> | null
      finishedAt: Date | null
    }>,
  ): Promise<void> {
    const p: Partial<IcTaskEntity> = {}
    if (partial.status !== undefined) p.status = partial.status
    if (partial.runId !== undefined) p.runId = partial.runId
    if (partial.stats !== undefined) {
      p.statsJson = partial.stats ? JSON.stringify(partial.stats) : null
    }
    if (partial.finishedAt !== undefined) p.finishedAt = partial.finishedAt
    await this.scoped.update({ id }, p)
  }

  protected toDto(e: IcTaskEntity): IcTaskRow {
    return {
      id: e.id,
      userId: e.userId,
      projectId: e.projectId,
      blueprintVersion: e.blueprintVersion,
      runId: e.runId,
      status: e.status as IcTaskStatus,
      stats: safeParse(e.statsJson),
      createdAt: e.createdAt,
      finishedAt: e.finishedAt,
    }
  }
}
