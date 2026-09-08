/**
 * 工具产物归档仓库（agent_tool_artifacts，39 号 P1-1）
 * @module database/repositories/agent-tool-artifact.repository
 *
 * upsert 幂等（确定性 id ta_<toolCallId>）；load 走 scoped API（ALS user_id
 * 过滤——toolCallId 不可枚举，租户过滤是纵深防御）；deleteByScope 随宿主
 * 生命周期级联清理。
 */

import { type DataSource } from 'typeorm'
import { AgentToolArtifactEntity } from '../entities/agent-tool-artifact.entity'
import { BaseRepository } from '../base-repository'
import type { ToolArtifactRecord } from '@core/platform/agent-runtime/tools/artifacts'

/** 读取行 DTO */
export interface AgentToolArtifactRow {
  toolCallId: string
  toolName: string
  scopeKey: string
  args: unknown
  result: unknown
}

function artifactId(toolCallId: string): string {
  return `ta_${toolCallId}`
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json)
  } catch {
    return null
  }
}

export class AgentToolArtifactRepository extends BaseRepository<AgentToolArtifactEntity, AgentToolArtifactRow> {
  constructor(dataSource: DataSource) {
    super(dataSource, AgentToolArtifactEntity)
  }

  /** 幂等写（同 toolCallId 重放不冲突）；userId 在方法入口同步捕获（ALS 红线） */
  async upsert(record: ToolArtifactRecord & { userId: string | null }): Promise<void> {
    const now = new Date()
    await this.repo
      .createQueryBuilder()
      .insert()
      .into(AgentToolArtifactEntity)
      .values({
        id: artifactId(record.toolCallId),
        userId: record.userId,
        scopeKey: record.scopeKey,
        toolCallId: record.toolCallId,
        toolName: record.toolName,
        payloadJson: JSON.stringify({ args: record.args, result: record.result }),
        createdAt: now,
      })
      .orIgnore(true)
      .execute()
  }

  async findByToolCallId(toolCallId: string): Promise<ToolArtifactRecord | undefined> {
    const e = await this.scoped.findOne({ toolCallId })
    if (!e) return undefined
    const payload = safeParse(e.payloadJson) as { args?: unknown; result?: unknown } | null
    return {
      scopeKey: e.scopeKey,
      toolCallId: e.toolCallId,
      toolName: e.toolName,
      args: payload?.args,
      result: payload?.result,
      ok: true,
    }
  }

  /** 随 scope（会话/任务）级联删除（scoped 租户过滤） */
  async deleteByScope(scopeKey: string): Promise<number> {
    return this.scoped.delete({ scopeKey })
  }

  protected toDto(e: AgentToolArtifactEntity): AgentToolArtifactRow {
    const payload = safeParse(e.payloadJson) as { args?: unknown; result?: unknown } | null
    return {
      toolCallId: e.toolCallId,
      toolName: e.toolName,
      scopeKey: e.scopeKey,
      args: payload?.args,
      result: payload?.result,
    }
  }
}
