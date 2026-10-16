/**
 * Agent 会话数据级联清理（M8 收尾：32 号登记——删除级联）
 * @module core/platform/agent-runtime/memory/session-purge
 *
 * dialog / LW 项目等业务主体删除时，其在 agent_sessions（模型侧历史）与
 * agent_trajectories（观测轨迹）中的残留会造成工作台「幽灵会话」。业务删除方
 * 按各自的 scopeKey 约定调用本助手清理；ALS 租户过滤由 BaseRepository 兜底
 * （调用方须在用户上下文内——IPC handler 均满足）。
 */

import type { DataSource } from 'typeorm'
import { createLogger } from '@core/utils/logger'
import { AgentSessionRepository } from '@core/database/repositories/agent-session.repository'
import { AgentTrajectoryRepository } from '@core/database/repositories/agent-trajectory.repository'

const logger = createLogger('AgentSessionPurge')

/** 一条业务主体的 agent 数据清理范围（conversationId=会话存储键；scopeKey=轨迹键） */
export interface AgentScopeRef {
  conversationId: string
  scopeKey: string
}

/** 批量清理会话历史 + 轨迹；失败不 throw（调用方决定是否吞）——逐条尽力清 */
export async function purgeAgentDataForScopes(
  dataSource: DataSource | null | undefined,
  refs: AgentScopeRef[],
): Promise<{ sessions: number; trajectories: number }> {
  let sessions = 0
  let trajectories = 0
  if (!dataSource) return { sessions, trajectories }
  const sessionRepo = new AgentSessionRepository(dataSource)
  const trajectoryRepo = new AgentTrajectoryRepository(dataSource)
  for (const ref of refs) {
    try {
      sessions += await sessionRepo.deleteByConversation(ref.conversationId)
    } catch (e) {
      logger.warn(`[session-purge] 会话历史清理失败 conv=${ref.conversationId}`, e)
    }
    try {
      trajectories += await trajectoryRepo.deleteByScope(ref.scopeKey)
    } catch (e) {
      logger.warn(`[session-purge] 轨迹清理失败 scope=${ref.scopeKey}`, e)
    }
  }
  if (sessions > 0 || trajectories > 0) {
    logger.info(`[session-purge] 已清理 sessions=${sessions} trajectories=${trajectories}（${refs.length} 个 scope）`)
  }
  return { sessions, trajectories }
}
