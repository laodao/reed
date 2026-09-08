/**
 * agent 知识飞轮条目仓库（agent_memory_entries，26 号 M3 批1）
 * @module database/repositories/agent-memory-entry.repository
 *
 * 全部走 scoped（ALS 租户过滤）；状态变迁（approve/archive/supersede）由
 * MemoryFlywheelService 收口（闸门纪律：pending_review → active 仅经人工批准）。
 */

import { type DataSource, type FindOptionsWhere, LessThan } from 'typeorm'
import { AgentMemoryEntryEntity } from '../entities/agent-memory-entry.entity'
import { BaseRepository } from '../base-repository'

export interface AgentMemoryEntryRow {
  id: string
  kind: string
  content: Record<string, unknown>
  /** KE-1 分层：bizModule/projectId 双 NULL=用户级 L1 */
  bizModule: string | null
  projectId: string | null
  contentHash: string | null
  embedModel: string | null
  embeddingId: string | null
  sourceRunId: string | null
  sourceTaskId: string | null
  confidence: number | null
  status: string
  useCount: number
  successCount: number
  supersedesId: string | null
  createdAt: Date | null
  updatedAt: Date | null
}

export type MemoryEntryKind = 'fact' | 'sop' | 'preference' | 'skill' | 'episode-ref'
export type MemoryEntryStatus = 'pending_review' | 'active' | 'archived' | 'superseded'

function safeParse(json: string | null): Record<string, unknown> | null {
  if (!json) return null
  try {
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return null
  }
}

export class AgentMemoryEntryRepository extends BaseRepository<AgentMemoryEntryEntity, AgentMemoryEntryRow> {
  constructor(dataSource: DataSource) {
    super(dataSource, AgentMemoryEntryEntity)
  }

  async create(input: {
    id: string
    kind: MemoryEntryKind
    content: Record<string, unknown>
    sourceRunId?: string | null
    sourceTaskId?: string | null
    confidence?: number | null
    status: MemoryEntryStatus
    supersedesId?: string | null
    bizModule?: string | null
    projectId?: string | null
    contentHash?: string | null
    embedModel?: string | null
  }): Promise<AgentMemoryEntryRow> {
    const now = new Date()
    const e = new AgentMemoryEntryEntity()
    e.id = input.id
    e.userId = null // scoped.insert 注入
    e.kind = input.kind
    e.contentJson = JSON.stringify(input.content)
    e.sourceRunId = input.sourceRunId ?? null
    e.sourceTaskId = input.sourceTaskId ?? null
    e.confidence = input.confidence ?? null
    e.status = input.status
    e.useCount = 0
    e.successCount = 0
    e.supersedesId = input.supersedesId ?? null
    e.bizModule = input.bizModule ?? null
    e.projectId = input.projectId ?? null
    e.contentHash = input.contentHash ?? null
    e.embedModel = input.embedModel ?? null
    e.createdAt = now
    e.updatedAt = now
    await this.scoped.insert(e)
    return (await this.getById(input.id))!
  }

  async getById(id: string): Promise<AgentMemoryEntryRow | null> {
    const e = await this.scoped.findOne({ id })
    return e ? this.toDto(e) : null
  }

  async listByStatus(status: MemoryEntryStatus, kind?: MemoryEntryKind): Promise<AgentMemoryEntryRow[]> {
    const where: FindOptionsWhere<AgentMemoryEntryEntity> = { status }
    if (kind) where.kind = kind
    const rows = await this.scoped.find({ where, order: { createdAt: 'DESC' } })
    return this.toDtoList(rows)
  }

  /** 全部 active 条目（读取装配候选集；量级 = 用户沉淀的记忆，进程内过滤可接受） */
  async listActive(): Promise<AgentMemoryEntryRow[]> {
    return this.listByStatus('active')
  }

  /** 按层取装配候选（KE-2）：用户级 + 指定业务级 + 指定项目级三层并集 */
  async listActiveByScope(scope: { bizModule?: string; projectId?: string }): Promise<AgentMemoryEntryRow[]> {
    const rows = await this.listActive()
    return rows.filter((r) => {
      if (r.bizModule === null) return true // L1 用户级
      if (scope.bizModule && r.bizModule === scope.bizModule && r.projectId === null) return true // L2
      if (scope.projectId && r.projectId === scope.projectId) return true // L3
      return false
    })
  }

  async patch(
    id: string,
    patch: Partial<{ status: MemoryEntryStatus; useCount: number; successCount: number; supersedesId: string | null; embeddingId: string | null; confidence: number | null; contentHash: string | null; embedModel: string | null }>,
  ): Promise<void> {
    const partial: Partial<AgentMemoryEntryEntity> = { updatedAt: new Date() }
    if (patch.status !== undefined) partial.status = patch.status
    if (patch.useCount !== undefined) partial.useCount = patch.useCount
    if (patch.successCount !== undefined) partial.successCount = patch.successCount
    if (patch.supersedesId !== undefined) partial.supersedesId = patch.supersedesId
    if (patch.embeddingId !== undefined) partial.embeddingId = patch.embeddingId
    if (patch.confidence !== undefined) partial.confidence = patch.confidence
    if (patch.contentHash !== undefined) partial.contentHash = patch.contentHash
    if (patch.embedModel !== undefined) partial.embedModel = patch.embedModel
    await this.scoped.update({ id }, partial)
  }

  /** 代谢：零命中且早于 cutoff 的 active 条目归档（26 号 §4 代谢作业） */
  async archiveStaleBefore(cutoff: Date): Promise<number> {
    return this.scoped.update(
      { status: 'active', useCount: LessThan(1), createdAt: LessThan(cutoff) } as FindOptionsWhere<AgentMemoryEntryEntity>,
      { status: 'archived', updatedAt: new Date() },
    )
  }

  protected toDto(e: AgentMemoryEntryEntity): AgentMemoryEntryRow {
    return {
      id: e.id,
      kind: e.kind,
      content: safeParse(e.contentJson) ?? {},
      bizModule: e.bizModule,
      projectId: e.projectId,
      contentHash: e.contentHash,
      embedModel: e.embedModel,
      embeddingId: e.embeddingId,
      sourceRunId: e.sourceRunId,
      sourceTaskId: e.sourceTaskId,
      confidence: e.confidence,
      status: e.status,
      useCount: e.useCount ?? 0,
      successCount: e.successCount ?? 0,
      supersedesId: e.supersedesId,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }
  }
}
