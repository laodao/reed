/**
 * 长文写作 Agent 动作工具集（30 号 M6）
 * @module core/packs/longwriting/agent-harness/lw-agent-tools
 *
 * 旧 JSON 决策协议的 8 个动作 → harness AgentToolDef。执行体整体复用
 * executeActions（依赖检查/skipped/富 action 事件/逐动作容错都在其中）——
 * 工具只是「单动作调用」的 harness 形态，零逻辑复制。
 *
 * M6.5-d（35 号）：迁移到共享 registry 的 pack 命名空间（pack:lw-agent:*）——
 * 懒注册幂等（宿主首次 sendMessage 时调用）；def 不捕获项目，projectId/每轮运行时
 * （state/counter/emit 等）从 ctx.logContext（宿主 runtimeContext 注入）读取。
 * loop 自带 zod 校验/截断，registry 管线提供审批语义；依赖检查仍在 executeActions 内。
 */

import { z } from 'zod'
import type { AgentToolDef } from '@core/platform/agent-runtime/types'
import { executeActions } from '@core/platform/services/longwriting/agent/agent-actions'
import type { AgentExecutionContext, AgentActionSummary, AgentProductionState } from '@core/platform/services/longwriting/agent/agent.types'

/** 每轮动作数上限（对齐旧协议 AGENT_MAX_ACTIONS_PER_TURN） */
export const LW_MAX_ACTIONS_PER_TURN = 3

export interface LwAgentDeps {
  projectId: string
  providerConfigId?: string
  modelId?: string
  db: any
  ai: any
  /** 旧事件出口（executeActions 的 action:start/done 从这里发到项目通道） */
  emit: (event: any) => void
  /** 轮内状态（依赖检查用；工具调用间不刷新——与旧协议同轮同状态语义一致） */
  state: AgentProductionState
  /** 动作摘要收集器（宿主回填 assistant 消息 metadata 用） */
  onSummary?: (summary: AgentActionSummary) => void
}

export interface LwAgentDeps {
  projectId: string
  providerConfigId?: string
  modelId?: string
  db: any
  ai: any
  /** 旧事件出口（executeActions 的 action:start/done 从这里发到项目通道） */
  emit: (event: any) => void
  /** 轮内状态（依赖检查用；共享注册形态下由 runtimeContext.lwTurn 按轮注入） */
  state: AgentProductionState
  /** 动作摘要收集器（宿主回填 assistant 消息 metadata 用） */
  onSummary?: (summary: AgentActionSummary) => void
}

const EntityType = z.enum(['character', 'location', 'faction', 'skill', 'item', 'plot', 'outline', 'overview'])

/** 单动作 → executeActions → 摘要（依赖 skipped / 富事件 / 容错全部内建） */
async function runOne(deps: LwAgentDeps, type: string, params: Record<string, unknown> | undefined, counter: { calls: number }): Promise<{ ok: boolean; summary: AgentActionSummary }> {
  if (counter.calls >= LW_MAX_ACTIONS_PER_TURN) {
    const summary: AgentActionSummary = {
      type: type as AgentActionSummary['type'],
      status: 'skipped',
      message: `本轮动作数已达上限（${LW_MAX_ACTIONS_PER_TURN}），请下一轮继续`,
    }
    deps.onSummary?.(summary)
    return { ok: false, summary }
  }
  counter.calls++
  const ctx: AgentExecutionContext = {
    projectId: deps.projectId,
    providerConfigId: deps.providerConfigId,
    modelId: deps.modelId,
    db: deps.db,
    ai: deps.ai,
    emit: deps.emit,
  }
  const summaries = await executeActions(ctx, [{ type, params } as never], deps.state)
  const summary = summaries[0] ?? { type: type as AgentActionSummary['type'], status: 'error', message: '动作未返回摘要' }
  deps.onSummary?.(summary)
  return { ok: summary.status === 'ok', summary }
}


const GenerateOverviewInput = z.object({ input: z.string().min(1).describe('用户的想法/要求') })
const GenerateCharactersInput = z.object({ requirements: z.string().optional() })
const GenerateWorldInput = z.object({})
const GenerateOutlineInput = z.object({ structureLevel: z.number().int().min(1).max(3).optional() })
const WriteChapterInput = z.object({
  outlineId: z.string().optional(),
  targetWords: z.number().int().positive().optional(),
  style: z.string().optional(),
  extraPrompt: z.string().optional(),
})
const UpdateEntityInput = z.object({
  type: EntityType,
  id: z.string().optional(),
  name: z.string().optional(),
  patch: z.record(z.string(), z.unknown()),
})
const DeleteEntityInput = z.object({
  type: EntityType,
  id: z.string().optional(),
  name: z.string().optional(),
})

// ==================== M6.5-d：共享注册形态 ====================

import type { AgentToolContext } from '@core/platform/agent-runtime/types'
import type { AgentToolRegistry } from '@core/platform/agent-runtime/tools/registry'

export const LW_AGENT_PACK_ID = 'lw-agent'

/** 每轮运行时（宿主按轮构造，经 runtimeContext.lwTurn 注入——不序列化，仅进程内） */
export interface LwTurnRuntime {
  providerConfigId?: string
  modelId?: string
  db: unknown
  ai: unknown
  emit: (event: unknown) => void
  state: AgentProductionState
  onSummary?: (summary: AgentActionSummary) => void
  counter: { calls: number }
}

const LW_ACTIONS: Array<{ type: string; description: string; schema: z.ZodTypeAny; timeoutMs: number }> = [
  { type: 'generate_overview', description: '生成/重写故事概要。input 必填：用户的想法与要求（题材、基调、核心冲突等）。', schema: GenerateOverviewInput, timeoutMs: 300_000 },
  { type: 'generate_characters', description: '设计主要人物（依赖故事概要已存在）。requirements 可选：对人物的特殊要求。', schema: GenerateCharactersInput, timeoutMs: 300_000 },
  { type: 'generate_world', description: '搭建世界观：背景/地点/势力/功法物品四类设定（依赖故事概要）。', schema: GenerateWorldInput, timeoutMs: 600_000 },
  { type: 'generate_plots', description: '规划故事线（依赖故事概要）。', schema: GenerateWorldInput, timeoutMs: 300_000 },
  { type: 'generate_outline', description: '生成故事大纲树（卷/章/节；依赖故事概要；已有完整大纲时会跳过）。structureLevel：1=粗纲 2=二级 3=细纲（缺省 3）。', schema: GenerateOutlineInput, timeoutMs: 600_000 },
  { type: 'write_chapter', description: '撰写下一章正文（依赖大纲；不传 outlineId 自动选下一篇未写叶子）。targetWords 目标字数，style 文风，extraPrompt 额外要求。耗时较长。', schema: WriteChapterInput, timeoutMs: 900_000 },
  { type: 'update_entity', description: '修改设定实体（character/location/faction/skill/item/plot/outline/overview）。用 id 或 name 定位，patch 为要更新的字段对象。', schema: UpdateEntityInput, timeoutMs: 120_000 },
  { type: 'delete_entity', description: '删除设定实体（用 id 或 name 定位；级联清理关系边）。', schema: DeleteEntityInput, timeoutMs: 120_000 },
]

/** 懒注册（幂等）：宿主首次 sendMessage 时调用（boot 时序：pack activate 早于 workflow-boot） */
export function registerLwAgentTools(registry: AgentToolRegistry): void {
  const existing = new Set(registry.listSpecs({ packId: LW_AGENT_PACK_ID }).map((s) => s.name))
  for (const a of LW_ACTIONS) {
    const namespaced = `pack:${LW_AGENT_PACK_ID}:${a.type}`
    if (existing.has(namespaced)) continue
    registry.register(
      {
        name: a.type,
        description: a.description,
        inputSchema: a.schema,
        dangerLevel: 'write',
        executeTimeoutMs: a.timeoutMs,
        execute: async (input, ctx: AgentToolContext) => {
          const log = (ctx.logContext ?? {}) as Record<string, unknown>
          const projectId = typeof log.projectId === 'string' ? log.projectId : ''
          const turn = log.lwTurn as LwTurnRuntime | undefined
          if (!projectId || !turn) {
            throw new Error('缺少长文宿主上下文（runtimeContext.projectId/lwTurn 未注入）——LW 工具只能在长文宿主内调用')
          }
          const r = await runOne(
            {
              projectId,
              providerConfigId: turn.providerConfigId,
              modelId: turn.modelId,
              db: turn.db,
              ai: turn.ai,
              emit: turn.emit as never,
              state: turn.state,
              onSummary: turn.onSummary,
            },
            a.type,
            (input ?? {}) as Record<string, unknown>,
            turn.counter,
          )
          return { ok: r.ok, summary: r.summary }
        },
      } as AgentToolDef,
      { packId: LW_AGENT_PACK_ID },
    )
  }
}