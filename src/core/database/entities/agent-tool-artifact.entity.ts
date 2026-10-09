import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 工具产物归档 Entity（agent_tool_artifacts，39 号 P1-1）
 *
 * 一行 = 一次成功工具调用的完整结果归档（截断/剪枝/折叠发生前写入）。
 * 上下文内占位可经 get_tool_result 按 toolCallId 回查全文（分页窗口）。
 * 确定性幂等 id `ta_<toolCallId>`（upsert 语义：同 id 重放不冲突）。
 */
@Entity({ name: 'agent_tool_artifacts' })
@Index('idx_agent_artifacts_user', ['userId'])
@Index('idx_agent_artifacts_scope', ['scopeKey'])
export class AgentToolArtifactEntity {
  /**
   * 所属用户 ID（多租户隔离）。Web 端通过 ALS 注入，Electron 单用户为 null。
   */
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  /** 确定性幂等 id：ta_<toolCallId> */
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  /** 归档来源 scope（会话键/任务键；随宿主生命周期级联清理） */
  @Column({ name: 'scope_key', type: 'varchar' })
  scopeKey!: string

  /** 工具调用 id（provider 生成，全局唯一） */
  @Column({ name: 'tool_call_id', type: 'varchar' })
  toolCallId!: string

  @Column({ name: 'tool_name', type: 'varchar' })
  toolName!: string

  /** { args, result } 整体 JSON（完整形态，未截断） */
  @Column({ name: 'payload_json', type: 'text' })
  payloadJson!: string

  @Column({ name: 'created_at', type: Date, nullable: true })
  createdAt!: Date | null
}
