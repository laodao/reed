/**
 * agent 工具调用审计仓库（agent_tool_calls，25 号 M2 批1）
 * @module database/repositories/agent-tool-call.repository
 *
 * registry 审计 sink 的落库底座：单条 fire-and-forget 写（调用方吞异常只 warn）。
 * 写入路径显式捕获 ALS userId（scoped 语义手动对齐——registry 审计回调发生在
 * 工具执行管线内，ALS 在位，但审计不允许因租户上下文异常而打断调用方）。
 */

import { randomUUID } from 'crypto'
import { type DataSource } from 'typeorm'
import { getCurrentUserId } from '@core/context/user-context'
import { AgentToolCallEntity } from '../entities/agent-tool-call.entity'
import { BaseRepository } from '../base-repository'

export interface AgentToolCallAppend {
  runId?: string | null
  nodeId?: string | null
  sessionKey?: string | null
  toolName: string
  dangerLevel: string
  approval: string
  status: string
  errorCode?: string | null
  argsPreview?: string | null
  resultPreview?: string | null
  truncated?: boolean
  durationMs?: number | null
  context?: Record<string, unknown>
}

export class AgentToolCallRepository extends BaseRepository<AgentToolCallEntity, AgentToolCallEntity> {
  constructor(dataSource: DataSource) {
    super(dataSource, AgentToolCallEntity)
  }

  /** 单条审计落库（fire-and-forget 语义由调用方保证——本方法只负责写入） */
  async append(input: AgentToolCallAppend): Promise<void> {
    const entity = new AgentToolCallEntity()
    entity.id = randomUUID()
    entity.userId = getCurrentUserId()
    entity.runId = input.runId ?? null
    entity.nodeId = input.nodeId ?? null
    entity.sessionKey = input.sessionKey ?? null
    entity.toolName = input.toolName
    entity.dangerLevel = input.dangerLevel
    entity.approval = input.approval
    entity.status = input.status
    entity.errorCode = input.errorCode ?? null
    entity.argsPreview = input.argsPreview ?? null
    entity.resultPreview = input.resultPreview ?? null
    entity.truncated = input.truncated ?? false
    entity.durationMs = input.durationMs ?? null
    entity.contextJson = input.context ? JSON.stringify(input.context) : null
    entity.createdAt = new Date()
    await this.repo.insert(entity)
  }

  /** 按 run 查询（审计排查用；升序） */
  async listByRun(runId: string): Promise<AgentToolCallEntity[]> {
    return this.scoped.qb('c').where('c.run_id = :runId', { runId }).orderBy('c.created_at', 'ASC').getMany()
  }

  /** 随 run 级联删除（deleteRun 调用；跨租户裸操作，属主校验在调用方） */
  async deleteByRunRaw(runId: string): Promise<number> {
    const result = await this.repo.delete({ runId })
    return result.affected ?? 0
  }

  protected toDto(e: AgentToolCallEntity): AgentToolCallEntity {
    return e
  }
}
