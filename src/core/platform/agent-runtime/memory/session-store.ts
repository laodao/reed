/**
 * 会话持久化：AgentSessionStore 契约的双实现（内存 / DB）
 * @module core/platform/agent-runtime/memory/session-store
 *
 * 契约：tasks/2026-08-28-agent-loop-harness/23-interface-contracts.md §6
 *   interface AgentSessionStore {
 *     load(sessionId): Promise<ModelMessage[] | undefined>   // 空历史=undefined
 *     save(sessionId, messages): Promise<void>              // 全量替换、事务
 *     delete?(sessionId): Promise<void>
 *   }
 * 消费方：独立宿主（agent-loop 会话，state.messages 落点）；工作流宿主走
 * node state_json，不经本存储（22 号 §8 四焊接点）。
 *
 * 存储：agent_sessions 表（core/database/migrations/create-agent-tables），
 * 一行一条 ModelMessage（content=整体 JSON），Repository 走 BaseRepository 的
 * ALS user_id 自动过滤（多租户红线）；replaceAll 事务内 userId 同步捕获注入。
 *
 * conversationId（即 sessionId）约定：`{definitionId}:{scopeId}`（如 story-room:p-xxx）。
 * 旧业务会话（如 lw_design_messages）的迁移读取属业务装配层职责——平台存储
 * 不耦合业务表；迁移期由业务方在接线时预灌本存储。
 *
 * 错误纪律（对齐限流器 fail-fast 约定）：超尺寸拒存、损坏行拒读——均抛
 * 携带定位信息的自定义错误并记日志，绝不静默截断/跳过（跳过中段消息会破坏
 * tool-call 配对，导致后续模型调用 400）。
 */

import type { DataSource } from 'typeorm'
import type { ModelMessage } from 'ai'
import { createLogger } from '@core/utils/logger'
import { getCurrentUserId } from '@core/context/user-context'
import {
  AgentSessionRepository,
  type NewAgentSessionRow,
} from '@core/database/repositories/agent-session.repository'

const logger = createLogger('AgentSessionStore')

/** 单条消息序列化上限（512KB：足够容纳大结果集/长文段，拦住失控累积） */
export const MAX_MESSAGE_BYTES = 512 * 1024

/** 会话存储损坏（行 JSON 解析失败 / seq 断档）——拒绝加载，带定位信息 */
export class AgentSessionCorruptionError extends Error {
  readonly code = 'AGENT_SESSION_CORRUPTION'
  constructor(sessionId: string, detail: string) {
    super(`Agent 会话历史损坏（sessionId=${sessionId}）：${detail}。拒绝加载以避免破坏 tool-call 配对，请检查 agent_sessions 表该会话行。`)
    this.name = 'AgentSessionCorruptionError'
  }
}

/** 单条消息超过序列化上限——拒绝保存（绝不静默截断历史） */
export class AgentMessageTooLargeError extends Error {
  readonly code = 'AGENT_MESSAGE_TOO_LARGE'
  constructor(sessionId: string, index: number, role: string, bytes: number) {
    super(
      `Agent 消息超过序列化上限（sessionId=${sessionId}, 第 ${index} 条, role=${role}, ${bytes} > ${MAX_MESSAGE_BYTES} 字节）。` +
        `请在工具定义中限制输出体量，或先做摘要/落盘再入历史。`
    )
    this.name = 'AgentMessageTooLargeError'
  }
}

export interface AgentSessionStore {
  /** 空历史（含已清空）= undefined；命中则返回按序还原的完整历史 */
  load(sessionId: string): Promise<ModelMessage[] | undefined>
  /** 全量替换（事务）：任意时刻磁盘上只有旧版或新版完整历史 */
  save(sessionId: string, messages: ModelMessage[]): Promise<void>
  delete(sessionId: string): Promise<void>
}

/**
 * 内存实现：单测 / 降级（无 DataSource 场景）用；structuredClone 深隔离对齐 DB 实现的
 * JSON 往返语义。键拼入当前租户（深度 review P2：原裸 sessionId 键在降级配置下
 * 跨租户可读写全量对话）。
 */
export class InMemorySessionStore implements AgentSessionStore {
  private readonly map = new Map<string, ModelMessage[]>()

  private key(sessionId: string): string {
    return `${getCurrentUserId() ?? '_anon'}:${sessionId}`
  }

  async load(sessionId: string): Promise<ModelMessage[] | undefined> {
    const messages = this.map.get(this.key(sessionId))
    return messages && messages.length > 0 ? structuredClone(messages) : undefined
  }

  async save(sessionId: string, messages: ModelMessage[]): Promise<void> {
    this.map.set(this.key(sessionId), structuredClone(messages))
  }

  async delete(sessionId: string): Promise<void> {
    this.map.delete(this.key(sessionId))
  }
}

export interface DbAgentSessionStoreDeps {
  dataSource: DataSource
}

/** DB 实现：agent_sessions 表（多租户 ALS 隔离 + 全量替换事务） */
export class DbAgentSessionStore implements AgentSessionStore {
  private readonly repo: AgentSessionRepository

  constructor(deps: DbAgentSessionStoreDeps) {
    this.repo = new AgentSessionRepository(deps.dataSource)
  }

  async load(sessionId: string): Promise<ModelMessage[] | undefined> {
    const rows = await this.repo.listByConversation(sessionId)
    if (rows.length === 0) return undefined

    return rows.map((row, index) => {
      // 全量替换按下标重排，正常 seq 必然连续 0..n-1；断档 = 人为篡改或半途损坏
      if (row.seq !== index) {
        logger.error(`[AgentSessionStore] seq 断档 sessionId=${sessionId} 期望 ${index} 实际 ${row.seq}`)
        throw new AgentSessionCorruptionError(sessionId, `seq 断档（期望 ${index}，实际 ${row.seq}）`)
      }
      try {
        return JSON.parse(row.content) as ModelMessage
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e)
        logger.error(`[AgentSessionStore] 行解析失败 sessionId=${sessionId} seq=${row.seq}: ${reason}`)
        throw new AgentSessionCorruptionError(sessionId, `第 ${row.seq} 条 JSON 解析失败（${reason}）`)
      }
    })
  }

  async save(sessionId: string, messages: ModelMessage[]): Promise<void> {
    const rows: NewAgentSessionRow[] = messages.map((message, index) => {
      const content = JSON.stringify(message)
      const bytes = Buffer.byteLength(content, 'utf8')
      if (bytes > MAX_MESSAGE_BYTES) {
        logger.error(
          `[AgentSessionStore] 消息超限 sessionId=${sessionId} index=${index} bytes=${bytes}`
        )
        throw new AgentMessageTooLargeError(sessionId, index, messageRole(message), bytes)
      }
      return {
        conversationId: sessionId,
        seq: index,
        role: messageRole(message),
        content,
      }
    })
    await this.repo.replaceAll(sessionId, rows)
  }

  async delete(sessionId: string): Promise<void> {
    await this.repo.deleteByConversation(sessionId)
  }
}

/** 会话存储工厂：有 DataSource 走 DB，无则内存（单测 / 降级——降级即不落盘，必须留痕） */
export function createSessionStore(deps?: { dataSource: DataSource }): AgentSessionStore {
  if (deps?.dataSource) return new DbAgentSessionStore(deps)
  logger.warn('[AgentSessionStore] 未提供 DataSource，会话降级为内存实现（重启即失，不落盘）')
  return new InMemorySessionStore()
}

function messageRole(message: ModelMessage): string {
  const role = (message as { role?: unknown }).role
  return typeof role === 'string' ? role : 'unknown'
}
