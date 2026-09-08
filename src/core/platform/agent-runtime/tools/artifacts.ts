/**
 * 工具产物归档（39 号 P1-1——registry 头注释里预留的 resultRef 落地）
 * @module core/platform/agent-runtime/tools/artifacts
 *
 * 端口 + 工厂：完整工具结果按 toolCallId 落档（DB 实现 agent_tool_artifacts 表，
 * 无 DataSource 降级为 null = 不归档），上下文内的截断/剪枝/折叠占位可经
 * get_tool_result 按 toolCallId 回查全文。
 *
 * 语义纪律：
 * - 只归档成功结果（失败回填本就只含错误摘要，无回查价值）
 * - save 幂等（toolCallId 确定性主键，orIgnore）——并行完成序重放不冲突
 * - 归档是观测/回查面不是正确性依赖：写失败由调用方 warn 收口，绝不外泄进循环
 * - 读取走租户过滤（ALS user_id）——toolCallId 不可枚举，租户过滤是纵深防御
 */

import { createLogger } from '@core/utils/logger'

const logger = createLogger('AgentToolArtifacts')

/** 单条产物 JSON 字节上限（与轨迹 payload 同量级；超限整体拒存留痕——产物缺失
 *  可接受，脏行不可接受） */
export const ARTIFACT_MAX_BYTES = 256 * 1024

export interface ToolArtifactRecord {
  scopeKey: string
  toolCallId: string
  toolName: string
  args: unknown
  result: unknown
  ok: boolean
}

export interface ToolArtifactPort {
  save(record: ToolArtifactRecord): Promise<void>
  load(toolCallId: string): Promise<ToolArtifactRecord | undefined>
  /** 随 scope（会话/任务）级联删除——宿主生命周期清理用 */
  deleteByScope(scopeKey: string): Promise<number>
  /** 会话树级联（含 `${scope}:sub_*` 子代理产物）；未实现时退化为 deleteByScope */
  deleteByScopeTree?(scopeKey: string): Promise<number>
}

interface ArtifactRepoLike {
  upsert(record: ToolArtifactRecord & { userId: string | null }): Promise<void>
  findByToolCallId(toolCallId: string): Promise<ToolArtifactRecord | undefined>
  deleteByScope(scopeKey: string): Promise<number>
  /** 会话树级联（含 `${scope}:sub_*` 子代理产物）；未实现时 store 退化为 deleteByScope */
  deleteByScopeTree?(scopeKey: string): Promise<number>
}

export interface ToolArtifactStoreDeps {
  repo: ArtifactRepoLike
}

/** DB 仓储适配（AgentToolArtifactRepository 满足 ArtifactRepoLike） */
export function createToolArtifactStore(deps: ToolArtifactStoreDeps): ToolArtifactPort {
  return {
    async save(record) {
      const { getCurrentUserId } = await import('@core/context/user-context')
      const content = JSON.stringify({ args: record.args, result: record.result })
      if (Buffer.byteLength(content, 'utf8') > ARTIFACT_MAX_BYTES) {
        logger.warn(
          `[artifacts] 产物超限拒存 toolCallId=${record.toolCallId} tool=${record.toolName} bytes=${Buffer.byteLength(content, 'utf8')}`,
        )
        return
      }
      await deps.repo.upsert({ ...record, userId: getCurrentUserId() })
    },
    async load(toolCallId) {
      return deps.repo.findByToolCallId(toolCallId)
    },
    async deleteByScope(scopeKey) {
      return deps.repo.deleteByScope(scopeKey)
    },
    async deleteByScopeTree(scopeKey) {
      if (typeof deps.repo.deleteByScopeTree === 'function') return deps.repo.deleteByScopeTree(scopeKey)
      return deps.repo.deleteByScope(scopeKey)
    },
  }
}
