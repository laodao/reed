/**
 * Agent 会话消息仓库
 * @module database/repositories/agent-session.repository
 *
 * 维护 agent_sessions 表：独立宿主（agent-loop 会话）的 ModelMessage 落点。
 * 读取走 scoped API（ALS user_id 自动过滤——多租户红线）；replaceAll 是
 * 全量替换事务，事务管理器绕过 scoped API，userId 在方法入口同步捕获后
 * 显式注入 WHERE / 行值（ALS 红线：不依赖异步链上的 ALS 存活）。
 */

import { IsNull, type DataSource, type FindOptionsWhere } from 'typeorm'
import { getCurrentUserId } from '@core/context/user-context'
import { AgentSessionEntity } from '../entities/agent-session.entity'
import { BaseRepository } from '../base-repository'

/**
 * 分块插入行数：单语句多值 INSERT 撞 SQLite 绑定变量上限（32766 变量 ÷ 8 列 ≈ 4095 行），
 * 长会话全量替换必然越界；500 行/批留足余量，同一事务内原子性不变。
 */
const INSERT_CHUNK_SIZE = 500

/** 行 DTO（content 仍为 JSON 字符串，解析在 SessionStore 层） */
export interface AgentSessionRow {
  id: string
  userId: string | null
  conversationId: string
  seq: number
  role: string
  content: string
  metadata: string | null
  createdAt: Date | null
}

/** 全量替换入参（userId / id 由仓库填充） */
export interface NewAgentSessionRow {
  conversationId: string
  seq: number
  role: string
  content: string
  metadata?: string | null
}

export class AgentSessionRepository extends BaseRepository<AgentSessionEntity, AgentSessionRow> {
  constructor(dataSource: DataSource) {
    super(dataSource, AgentSessionEntity)
  }

  /** 按会话取全部消息行（seq 升序；跨租户隔离由 scoped WHERE 保证） */
  async listByConversation(conversationId: string): Promise<AgentSessionRow[]> {
    const rows = await this.scoped.find({
      where: { conversationId },
      order: { seq: 'ASC' },
    })
    return this.toDtoList(rows)
  }

  /** 删除会话全部行（返回删除数；跨租户隔离由 scoped WHERE 保证） */
  async deleteByConversation(conversationId: string): Promise<number> {
    return this.scoped.delete({ conversationId })
  }

  /**
   * 会话列表（29 号 M5.5 工作台数据源）：distinct conversation_id + 最近活动时间 +
   * 行数，按最近活动倒序。groupBy 聚合超出 ScopedRepoApi 能力——raw qb + 显式
   * userId 过滤（ALS 同步捕获，语义与 scoped 等价）。
   */
  async listSessions(): Promise<Array<{ conversationId: string; updatedAt: Date | null; messageCount: number }>> {
    const userId = getCurrentUserId()
    const qb = this.repo
      .createQueryBuilder('s')
      .select('s.conversation_id', 'conversationId')
      .addSelect('MAX(s.created_at)', 'updatedAt')
      .addSelect('COUNT(*)', 'messageCount')
      .groupBy('s.conversation_id')
      .orderBy('MAX(s.created_at)', 'DESC')
    if (userId === null) qb.where('s.user_id IS NULL')
    else qb.where('s.user_id = :uid', { uid: userId })
    const rows = await qb.getRawMany<{ conversationId: string; updatedAt: string | Date | null; messageCount: string }>()
    return rows.map((r) => ({
      conversationId: r.conversationId,
      updatedAt: r.updatedAt ? new Date(r.updatedAt) : null,
      messageCount: Number(r.messageCount ?? 0),
    }))
  }

  /**
   * 全量替换：事务内 DELETE 该会话全部行 + 按下标重排 INSERT。
   * "宁可重放不丢史"（23 号 §6）——事务保证任意时刻磁盘上只有旧版或新版完整历史。
   */
  async replaceAll(conversationId: string, rows: NewAgentSessionRow[]): Promise<void> {
    // ALS 同步捕获（红线）：事务回调内不依赖 ALS 上下文存活
    const userId = getCurrentUserId()

    await this.dataSource.transaction(async (em) => {
      await em.delete(AgentSessionEntity, {
        conversationId,
        userId: userId === null ? IsNull() : userId,
      } as FindOptionsWhere<AgentSessionEntity>)

      if (rows.length > 0) {
        for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
          await em.insert(
            AgentSessionEntity,
            rows.slice(i, i + INSERT_CHUNK_SIZE).map((r) => ({
              ...r,
              id: this.generateId(),
              userId,
              metadata: r.metadata ?? null,
              createdAt: new Date(),
            }))
          )
        }
      }
    })
  }

  private generateId(): string {
    return `ags_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }

  protected toDto(e: AgentSessionEntity): AgentSessionRow {
    return {
      id: e.id,
      userId: e.userId,
      conversationId: e.conversationId,
      seq: e.seq,
      role: e.role,
      content: e.content,
      metadata: e.metadata,
      createdAt: e.createdAt,
    }
  }
}
