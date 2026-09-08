/**
 * 会话原始流水仓库（agent_session_events，39 号 P0-2）
 * @module database/repositories/agent-session-event.repository
 *
 * append-only 写入：insert-or-ignore 幂等批写（确定性 id se_<conv>_<seq>）。
 * maxSeq 裸查（scopeKey 全局唯一，与轨迹仓库 maxSeq 同一理由——ALS 缺失窗口读
 * 小值会导致 seq 重号）；listByConversation / deleteByConversation 走 scoped API
 * （ALS user_id 自动过滤——多租户红线）。
 */

import { type DataSource } from 'typeorm'
import { getCurrentUserId } from '@core/context/user-context'
import { AgentSessionEventEntity } from '../entities/agent-session-event.entity'
import { BaseRepository } from '../base-repository'
import type { TranscriptAppendRow } from '@core/platform/agent-runtime/memory/transcript-store'

/** 流水行 id：conversationId+seq 确定性主键 */
export function transcriptId(conversationId: string, seq: number): string {
  return `se_${conversationId}_${seq}`
}

/** 读取行 DTO（content 仍为 JSON 字符串，解析在消费方） */
export interface AgentSessionEventRow {
  seq: number
  role: string
  content: string
  createdAt: Date | null
}

export class AgentSessionEventRepository extends BaseRepository<AgentSessionEventEntity, AgentSessionEventRow> {
  constructor(dataSource: DataSource) {
    super(dataSource, AgentSessionEventEntity)
  }

  /** 幂等批写（insert-or-ignore；同 (conversation_id, seq) 重复行静默跳过） */
  async appendBatch(rows: TranscriptAppendRow[]): Promise<void> {
    if (rows.length === 0) return
    const userId = getCurrentUserId()
    const now = new Date()
    await this.repo
      .createQueryBuilder()
      .insert()
      .into(AgentSessionEventEntity)
      .values(
        rows.map((r) => ({
          id: transcriptId(r.conversationId, r.seq),
          userId,
          conversationId: r.conversationId,
          seq: r.seq,
          role: r.role,
          content: r.content,
          createdAt: now,
        })),
      )
      .orIgnore(true)
      .execute()
  }

  /** 会话内已落库最大 seq（续接起点；无行返回 0）。裸查：会话键全局唯一，
   *  maxSeq 语义与租户无关（租户过滤会在 ALS 缺失窗口读小值导致重号——review A4 同源） */
  async maxSeq(conversationId: string): Promise<number> {
    const row = await this.repo
      .createQueryBuilder('e')
      .where('e.conversation_id = :conversationId', { conversationId })
      .orderBy('e.seq', 'DESC')
      .limit(1)
      .getOne()
    return row?.seq ?? 0
  }

  /** 会话流水（seq 升序；回放/审计数据源，scoped 租户过滤） */
  async listByConversation(conversationId: string): Promise<AgentSessionEventRow[]> {
    const rows = await this.scoped
      .qb('e')
      .where('e.conversation_id = :conversationId', { conversationId })
      .orderBy('e.seq', 'ASC')
      .getMany()
    return this.toDtoList(rows)
  }

  /** 随会话重置级联删除（scoped 版：ALS userId 过滤） */
  async deleteByConversation(conversationId: string): Promise<number> {
    return this.scoped.delete({ conversationId })
  }

  protected toDto(e: AgentSessionEventEntity): AgentSessionEventRow {
    return { seq: e.seq, role: e.role, content: e.content, createdAt: e.createdAt }
  }
}
