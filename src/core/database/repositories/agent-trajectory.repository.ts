/**
 * agent 轨迹仓库（agent_trajectories，25 号 M2 批1）
 * @module database/repositories/agent-trajectory.repository
 *
 * 观测面写入：insert-or-ignore 幂等批写（确定性 id tr_<scopeKey>_<seq>，崩溃恢复
 * 重放不重不漏）。写入路径显式捕获 ALS userId（appendBatch 事务外捕获——ALS 在
 * 单次写入期间不会变，遵循 workflow-run-event 仓库同款纪律）。
 * 删除随宿主生命周期：workflow 行按 runId 前缀级联（deleteRun），session 行按
 * scopeKey 精确级联（会话重置）——均为跨租户裸操作，属主校验在调用方。
 */

import { type DataSource } from 'typeorm'
import { getCurrentUserId } from '@core/context/user-context'
import { AgentTrajectoryEntity } from '../entities/agent-trajectory.entity'
import { BaseRepository } from '../base-repository'
import { escapeLikePrefix } from './platform-event.repository'

/** 单条 payload JSON 字节上限（与工具结果截断同量级；超长字节截断留痕） */
export const TRAJECTORY_PAYLOAD_MAX_BYTES = 16_384

/** 轨迹行 id：scopeKey+seq 确定性主键（可读；重放不产生第二套 id） */
export function trajectoryId(scopeKey: string, seq: number): string {
  return `tr_${scopeKey}_${seq}`
}

export interface AgentTrajectoryAppend {
  scope: 'workflow' | 'session'
  scopeKey: string
  seq: number
  iteration: number
  kind: string
  name?: string | null
  payload?: Record<string, unknown> | null
  promptTokens?: number | null
  completionTokens?: number | null
  durationMs?: number | null
}

export interface AgentTrajectoryRow {
  id: string
  scope: string
  scopeKey: string
  seq: number
  iteration: number
  kind: string
  name: string | null
  payload: Record<string, unknown> | null
  promptTokens: number | null
  completionTokens: number | null
  durationMs: number | null
  createdAt: Date | null
}

  /** payload 截断：先按内层预算截断（预留包装+转义膨胀余量——review A2：
   *  JSON.stringify 包装会把引号密集文本膨胀近 2 倍，以最终字节数为准兜底） */
  function truncatePayloadBytes(payload: Record<string, unknown> | null | undefined): string | null {
    if (!payload) return null
    let serialized: string
    try {
      serialized = JSON.stringify(payload)
    } catch {
      return '{"_unserializable":true}'
    }
    if (Buffer.byteLength(serialized, 'utf8') <= TRAJECTORY_PAYLOAD_MAX_BYTES) return serialized
    let inner = serialized
    let wrapped = ''
    for (;;) {
      wrapped = JSON.stringify({ _truncated: inner })
      if (Buffer.byteLength(wrapped, 'utf8') <= TRAJECTORY_PAYLOAD_MAX_BYTES || inner.length === 0) break
      inner = inner.slice(0, Math.floor(inner.length * 0.8))
    }
    return wrapped
  }

// ==================== 可恢复轮枚举（47号恢复能力面） ====================

/** 终态轨迹 kinds：一轮受控收束的标记（收敛发 final；stop() 各路径发 guardrail_stop） */
export const TRAJECTORY_TERMINAL_KINDS: readonly string[] = ['final', 'guardrail_stop']
/** 审批等待中的轮：挂起待人工，恢复走 resumeFromSuspend——不算崩溃可恢复 */
export const TRAJECTORY_PAUSED_KIND = 'human_request'

export interface RecoverableTurnRow {
  scopeKey: string
  seq: number
  iteration: number
  kind: string
  name: string | null
  createdAt: Date | null
}

/**
 * 子代理 scope 判定（对抗 review P1）：子代理轨迹挂 `${parent}:sub_<rand>`
 * （tools/subagent.ts 的 key 形状约定），一次性、无会话存储——对它 resumeTurn
 * 只会拿指令对空会话冷启动出幽灵时间线，绝不入恢复枚举。判定留本仓储
 * （database 层不反向依赖 platform），与 subagent.ts 约定互为锚点。
 */
function isSubagentScope(scopeKey: string): boolean {
  return /:sub_[0-9a-zA-Z]/.test(scopeKey)
}

export class AgentTrajectoryRepository extends BaseRepository<AgentTrajectoryEntity, AgentTrajectoryRow> {
  constructor(dataSource: DataSource) {
    super(dataSource, AgentTrajectoryEntity)
  }

  /** 幂等批写（insert-or-ignore；同 (scope_key, seq) 重复行静默跳过） */
  async appendBatch(entries: AgentTrajectoryAppend[]): Promise<void> {
    if (entries.length === 0) return
    const userId = getCurrentUserId()
    const now = new Date()
    await this.repo
      .createQueryBuilder()
      .insert()
      .into(AgentTrajectoryEntity)
      .values(
        entries.map((e) => ({
          id: trajectoryId(e.scopeKey, e.seq),
          userId,
          scope: e.scope,
          scopeKey: e.scopeKey,
          seq: e.seq,
          iteration: e.iteration,
          kind: e.kind,
          name: e.name ?? null,
          payloadJson: truncatePayloadBytes(e.payload),
          promptTokens: e.promptTokens ?? null,
          completionTokens: e.completionTokens ?? null,
          durationMs: e.durationMs ?? null,
          createdAt: now,
        })),
      )
      .orIgnore(true)
      .execute()
  }

  /** scope 内已落库的最大 seq（sink 续接起点；无行返回 0）。
   *  裸查：scopeKey 含全局唯一 runId/会话键，maxSeq 语义与租户无关——
   *  租户过滤反而会在 ALS 缺失窗口读小值导致 seq 重号（review A4）。 */
  async maxSeq(scopeKey: string): Promise<number> {
    const row = await this.repo
      .createQueryBuilder('t')
      .where('t.scope_key = :scopeKey', { scopeKey })
      .orderBy('t.seq', 'DESC')
      .limit(1)
      .getOne()
    return row?.seq ?? 0
  }

  /** scope 内轨迹（seq 升序；轨迹视图数据源） */
  async listByScope(scopeKey: string): Promise<AgentTrajectoryRow[]> {
    const rows = await this.scoped
      .qb('t')
      .where('t.scope_key = :scopeKey', { scopeKey })
      .orderBy('t.seq', 'ASC')
      .getMany()
    return this.toDtoList(rows)
  }

  /**
   * 随 run 级联删除（deleteRun 调用；workflow scope_key 以 `<runId>:` 开头）。
   * 跨租户裸操作：run 属主已由运行服务校验。
   */
  async deleteByRunRaw(runId: string): Promise<number> {
    const result = await this.repo
      .createQueryBuilder()
      .delete()
      .where('scope_key LIKE :prefix', { prefix: `${escapeLikePrefix(runId)}:%` })
      .execute()
    return result.affected ?? 0
  }

  /** 随会话重置级联删除（scoped 版：ALS userId 过滤——review A1：resetSession
   *  空条目分支无属主校验可触达，裸删会跨租户清他人轨迹；租户过滤是兜底防线） */
  async deleteByScope(scopeKey: string): Promise<number> {
    return this.scoped.delete({ scopeKey })
  }

  /** 跨租户裸删（仅属主已校验的路径使用：deleteRun 级联） */
  async deleteByScopeRaw(scopeKey: string): Promise<number> {
    const result = await this.repo
      .createQueryBuilder()
      .delete()
      .where('scope_key = :scopeKey', { scopeKey })
      .execute()
    return result.affected ?? 0
  }

  /** 会话树级联删除（42号 review P2：子代理轨迹挂 `${parent}:sub_*`，父 reset 曾成孤儿）。
   *  scoped SELECT 先校验属主，再按选出的 scopeKey 集合裸删——删除面不越过租户。 */
  async deleteByScopeTree(scopeKey: string): Promise<number> {
    const rows: Array<{ sk: string }> = await this.scoped
      .qb('t')
      .select('DISTINCT t.scope_key', 'sk')
      .where('t.scope_key = :root OR t.scope_key LIKE :prefix', {
        root: scopeKey,
        prefix: `${escapeLikePrefix(scopeKey)}:%`,
      })
      .getRawMany()
    let n = 0
    for (const r of rows) n += await this.deleteByScopeRaw(r.sk)
    return n
  }

  // ==================== 可恢复轮枚举（47号恢复能力面） ====================

  /**
   * 各会话「末条轨迹」即该轮终态投影：末条既非终态也非审批等待 = 中断轮
   * （崩溃/异常停在半途——步末持久化边界之后的任意形态）。只查 session scope
   * （workflow 节点的恢复由节点挂起/恢复语义自成一体承担，36 号 §3）；子代理
   * `:sub_*` 不可续跑，排除。租户：scoped 读过滤 ALS userId；降级（无 ALS）
   * 按 user_id IS NULL 口径——与 listByScope 完全同口径。
   */
  async listRecoverable(opts: { scopePrefix?: string; limit?: number } = {}): Promise<RecoverableTurnRow[]> {
    const prefix = `${escapeLikePrefix(opts.scopePrefix ?? '')}%`
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200)
    const maxRows: Array<{ sk: string; ms: number }> = await this.scoped
      .qb('t')
      .select('t.scope_key', 'sk')
      .addSelect('MAX(t.seq)', 'ms')
      .where("t.scope = 'session'")
      .andWhere('t.scope_key LIKE :prefix ESCAPE \'\\\'', { prefix })
      .groupBy('t.scope_key')
      .getRawMany()
    const scopes = maxRows.filter((r) => !isSubagentScope(r.sk))
    if (scopes.length === 0) return []
    const maxBy = new Map(scopes.map((r) => [r.sk, Number(r.ms)]))
    const lastRows = await this.scoped
      .qb('t')
      .where("t.scope = 'session'")
      .andWhere('t.scope_key LIKE :prefix ESCAPE \'\\\'', { prefix })
      .andWhere('t.seq IN (:...seqs)', { seqs: [...maxBy.values()] })
      .getMany()
    const terminal = new Set(TRAJECTORY_TERMINAL_KINDS)
    return lastRows
      .filter((r) => r.seq === maxBy.get(r.scopeKey))
      .filter((r) => !terminal.has(r.kind) && r.kind !== TRAJECTORY_PAUSED_KIND)
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
      .slice(0, limit)
      .map((r) => ({
        scopeKey: r.scopeKey,
        seq: r.seq,
        iteration: r.iteration,
        kind: r.kind,
        name: r.name,
        createdAt: r.createdAt,
      }))
  }

  protected toDto(e: AgentTrajectoryEntity): AgentTrajectoryRow {
    return {
      id: e.id,
      scope: e.scope,
      scopeKey: e.scopeKey,
      seq: e.seq,
      iteration: e.iteration,
      kind: e.kind,
      name: e.name,
      payload: e.payloadJson ? (safeParse(e.payloadJson) as Record<string, unknown> | null) : null,
      promptTokens: e.promptTokens,
      completionTokens: e.completionTokens,
      durationMs: e.durationMs,
      createdAt: e.createdAt,
    }
  }
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json)
  } catch {
    return null
  }
}
