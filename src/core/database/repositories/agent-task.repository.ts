/**
 * agent 任务树仓库（agent_tasks，26 号 M3 批1）
 * @module database/repositories/agent-task.repository
 *
 * 任务树读写：状态机变迁由 TaskService 收口（本仓库只做行存取）；
 * 全部走 scoped（ALS 租户过滤），无跨租户操作——树属主即用户。
 */

import { type DataSource, type FindOptionsWhere } from 'typeorm'
import { AgentTaskEntity } from '../entities/agent-task.entity'
import { BaseRepository } from '../base-repository'

export interface AgentTaskRow {
  id: string
  parentId: string | null
  rootId: string
  depth: number
  title: string
  spec: Record<string, unknown>
  status: string
  executor: string
  runId: string | null
  budget: Record<string, unknown> | null
  qualityScore: number | null
  result: Record<string, unknown> | null
  retryCount: number
  error: string | null
  createdAt: Date | null
  updatedAt: Date | null
}

export type AgentTaskPatch = Partial<{
  status: string
  runId: string | null
  qualityScore: number | null
  result: Record<string, unknown> | null
  retryCount: number
  error: string | null
  budget: Record<string, unknown>
  spec: Record<string, unknown>
}>

function safeParse(json: string | null): Record<string, unknown> | null {
  if (!json) return null
  try {
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return null
  }
}

export class AgentTaskRepository extends BaseRepository<AgentTaskEntity, AgentTaskRow> {
  constructor(dataSource: DataSource) {
    super(dataSource, AgentTaskEntity)
  }

  async create(input: {
    id: string
    parentId: string | null
    rootId: string
    depth: number
    title: string
    spec: Record<string, unknown>
    status: string
    executor: string
    budget?: Record<string, unknown>
  }): Promise<AgentTaskRow> {
    const now = new Date()
    const e = new AgentTaskEntity()
    e.id = input.id
    e.userId = null // scoped.insert 注入
    e.parentId = input.parentId
    e.rootId = input.rootId
    e.depth = input.depth
    e.title = input.title
    e.specJson = JSON.stringify(input.spec)
    e.status = input.status
    e.executor = input.executor
    e.runId = null
    e.retryCount = 0
    e.createdAt = now
    e.updatedAt = now
    if (input.budget) e.budgetJson = JSON.stringify(input.budget)
    await this.scoped.insert(e)
    return (await this.getById(input.id))!
  }

  async getById(id: string): Promise<AgentTaskRow | null> {
    const e = await this.scoped.findOne({ id })
    return e ? this.toDto(e) : null
  }

  async listByRoot(rootId: string): Promise<AgentTaskRow[]> {
    const rows = await this.scoped.find({ where: { rootId } as FindOptionsWhere<AgentTaskEntity>, order: { depth: 'ASC', createdAt: 'ASC' } })
    return this.toDtoList(rows)
  }

  async listByStatus(status: string): Promise<AgentTaskRow[]> {
    const rows = await this.scoped.find({ where: { status } as FindOptionsWhere<AgentTaskEntity>, order: { createdAt: 'ASC' } })
    return this.toDtoList(rows)
  }

  /**
   * CAS 状态前置迁移（review T3/W4：盲 patch 曾使人工裁决被在途 LLM 验证覆盖、
   * 取消被结算复活）。仅当当前 status ∈ fromStatuses 时应用，返回是否应用。
   */
  async patchFromStatus(id: string, fromStatuses: string[], patch: AgentTaskPatch): Promise<boolean> {
    const partial: Partial<AgentTaskEntity> = { updatedAt: new Date() }
    if (patch.status !== undefined) partial.status = patch.status
    if (patch.runId !== undefined) partial.runId = patch.runId
    if (patch.qualityScore !== undefined) partial.qualityScore = patch.qualityScore
    if (patch.result !== undefined) partial.resultJson = patch.result ? JSON.stringify(patch.result) : null
    if (patch.retryCount !== undefined) partial.retryCount = patch.retryCount
    if (patch.error !== undefined) partial.error = patch.error
    if (patch.budget !== undefined) partial.budgetJson = JSON.stringify(patch.budget)
    if (patch.spec !== undefined) partial.specJson = JSON.stringify(patch.spec)
    const result = await this.repo
      .createQueryBuilder()
      .update()
      .set(partial)
      .where('id = :id AND status IN (:...statuses)', { id, statuses: fromStatuses })
      .execute()
    return (result.affected ?? 0) > 0
  }

  async patch(id: string, patch: AgentTaskPatch): Promise<void> {
    const partial: Partial<AgentTaskEntity> = { updatedAt: new Date() }
    if (patch.status !== undefined) partial.status = patch.status
    if (patch.runId !== undefined) partial.runId = patch.runId
    if (patch.qualityScore !== undefined) partial.qualityScore = patch.qualityScore
    if (patch.result !== undefined) partial.resultJson = patch.result ? JSON.stringify(patch.result) : null
    if (patch.retryCount !== undefined) partial.retryCount = patch.retryCount
    if (patch.error !== undefined) partial.error = patch.error
    if (patch.budget !== undefined) partial.budgetJson = JSON.stringify(patch.budget)
    if (patch.spec !== undefined) partial.specJson = JSON.stringify(patch.spec)
    await this.scoped.update({ id }, partial)
  }

  async deleteByRoot(rootId: string): Promise<number> {
    // scoped（review W11：裸 delete 曾与文件头纪律冲突）；当前无调用点（M4 级联预留）
    return this.scoped.delete({ rootId })
  }

  protected toDto(e: AgentTaskEntity): AgentTaskRow {
    return {
      id: e.id,
      parentId: e.parentId,
      rootId: e.rootId,
      depth: e.depth,
      title: e.title,
      spec: safeParse(e.specJson) ?? {},
      status: e.status,
      executor: e.executor,
      runId: e.runId,
      budget: safeParse(e.budgetJson),
      qualityScore: e.qualityScore,
      result: safeParse(e.resultJson),
      retryCount: e.retryCount ?? 0,
      error: e.error,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }
  }
}
