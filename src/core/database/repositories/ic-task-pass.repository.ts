/**
 * 信息搜集「执行台账」仓库（ic_task_passes，2026-10-07 设计落地）
 * @module database/repositories/ic-task-pass.repository
 *
 * 幂等模式照搬 kb_digest_passes：幂等键 (taskId, passKey, attempt)。
 * startAttempt 自动取同键最大 attempt +1——重跑不重复入库；getDone 供服务层
 * 判断"该遍次已完成可直接跳过"。MAX_ATTEMPTS 后由服务层守卫，人工复活=插入新 attempt。
 */

import type { DataSource } from 'typeorm'
import { IcTaskPassEntity } from '../entities/info-collection/ic-task-pass.entity'
import type { IcPassStatus } from '@shared/types/info-collection.types'
import { BaseRepository } from '../base-repository'

/** ic_task_passes 行 DTO（stats/cost 已解析） */
export interface IcPassRow {
  id: string
  userId: string | null
  projectId: string
  taskId: string
  passKey: string
  attempt: number
  status: IcPassStatus
  stats: Record<string, unknown> | null
  cost: Record<string, unknown> | null
  startedAt: Date | null
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

export class IcTaskPassRepository extends BaseRepository<IcTaskPassEntity, IcPassRow> {
  constructor(dataSource: DataSource) {
    super(dataSource, IcTaskPassEntity)
  }

  /**
   * 开始一次新尝试：attempt = 同键最大值 +1（唯一键 (task, pass, attempt) 兜底并发）。
   * 返回新插入的 running 行。
   */
  async startAttempt(input: { id: string; projectId: string; taskId: string; passKey: string }): Promise<IcPassRow> {
    const last = await this.scoped.find({
      where: { taskId: input.taskId, passKey: input.passKey },
      order: { attempt: 'DESC' },
      take: 1,
    })
    const now = new Date()
    const e = new IcTaskPassEntity()
    e.id = input.id
    e.userId = null // scoped.insert 注入
    e.projectId = input.projectId
    e.taskId = input.taskId
    e.passKey = input.passKey
    e.attempt = (last[0]?.attempt ?? 0) + 1
    e.status = 'running'
    e.statsJson = null
    e.costJson = null
    e.startedAt = now
    e.finishedAt = null
    await this.scoped.insert(e)
    return (await this.getById(input.id))!
  }

  async finish(id: string, result?: { stats?: Record<string, unknown>; cost?: Record<string, unknown> }): Promise<void> {
    const p: Partial<IcTaskPassEntity> = { status: 'done', finishedAt: new Date() }
    if (result?.stats) p.statsJson = JSON.stringify(result.stats)
    if (result?.cost) p.costJson = JSON.stringify(result.cost)
    await this.scoped.update({ id }, p)
  }

  async fail(id: string, result?: { stats?: Record<string, unknown>; cost?: Record<string, unknown> }): Promise<void> {
    const p: Partial<IcTaskPassEntity> = { status: 'failed', finishedAt: new Date() }
    if (result?.stats) p.statsJson = JSON.stringify(result.stats)
    if (result?.cost) p.costJson = JSON.stringify(result.cost)
    await this.scoped.update({ id }, p)
  }

  async getById(id: string): Promise<IcPassRow | null> {
    const e = await this.scoped.findOne({ id })
    return e ? this.toDto(e) : null
  }

  /** 该遍次最近一次成功（幂等跳过的依据）；无则 null */
  async getDone(taskId: string, passKey: string): Promise<IcPassRow | null> {
    const rows = await this.scoped.find({
      where: { taskId, passKey, status: 'done' },
      order: { attempt: 'DESC' },
      take: 1,
    })
    return rows.length > 0 ? this.toDto(rows[0]) : null
  }

  /** 该遍次最近一次失败（人工复活/重试上限的依据） */
  async getLatestFailed(taskId: string, passKey: string): Promise<IcPassRow | null> {
    const rows = await this.scoped.find({
      where: { taskId, passKey, status: 'failed' },
      order: { attempt: 'DESC' },
      take: 1,
    })
    return rows.length > 0 ? this.toDto(rows[0]) : null
  }

  async listByTask(taskId: string): Promise<IcPassRow[]> {
    const rows = await this.scoped.find({
      where: { taskId },
      order: { startedAt: 'ASC' },
    })
    return this.toDtoList(rows)
  }

  protected toDto(e: IcTaskPassEntity): IcPassRow {
    return {
      id: e.id,
      userId: e.userId,
      projectId: e.projectId,
      taskId: e.taskId,
      passKey: e.passKey,
      attempt: e.attempt,
      status: e.status as IcPassStatus,
      stats: safeParse(e.statsJson),
      cost: safeParse(e.costJson),
      startedAt: e.startedAt,
      finishedAt: e.finishedAt,
    }
  }
}
