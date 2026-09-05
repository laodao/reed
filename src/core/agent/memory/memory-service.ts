/**
 * 项目级长期记忆服务
 * @module core/agent/memory/memory-service
 *
 * Schema 设计借 happyclaw memory-service（MIT，684 行）状态机，在我们 BaseRepository 上实现：
 *   kind:   fact / decision / lesson / open_loop
 *   status: proposed → active（提案卡采纳）；→ deleted（忽略）
 *           active → superseded（「换一版」替换，留版本链 supersededBy）
 *           active → conflicted（与既有条目矛盾，待裁决）
 *   source: agent_runtime / user / seed / migration（对应前端"来源"徽标）
 *   canonicalKey 稳定键去重（如 "character:林晓:motive"）；CAS 编辑 + 幂等键。
 *
 * 与设定集的关系：设定集（lw_* 表）是**正文事实**，本表是**跨会话沉淀的轻量记忆**
 * （用户的偏好、讨论中的决定、待跟进的伏笔）——两者互补，不互相替代。
 * 注入时机：context-manager 的 L1 层取 status=active 的条目摘要。
 *
 * 提取策略（接口预留，设计借 qm MemoryStrategy）：
 *   onTurnEnd(scopeId, userMsg, reply) —— 每轮结束由业务定义决定是否沉淀新记忆
 */

import type { MemoryKind, MemoryStatus } from '../types'

export interface MemoryQuery {
  scopeId: string
  kind?: MemoryKind
  status?: MemoryStatus
  keyword?: string
}

export function createMemoryService() {
  throw new Error('M1: 待实现')
}
