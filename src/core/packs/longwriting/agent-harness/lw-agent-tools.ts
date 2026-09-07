/**
 * 长文写作 Agent 动作工具集（30 号 M6）
 * @module core/packs/longwriting/agent-harness/lw-agent-tools
 *
 * 旧 JSON 决策协议的 8 个动作 → harness AgentToolDef。执行体整体复用
 * executeActions（依赖检查/skipped/富 action 事件/逐动作容错都在其中）——
 * 工具只是「单动作调用」的 harness 形态，零逻辑复制。
 *
 * 不进全局 AgentToolRegistry（boot 顺序：pack activate 早于 workflow-boot），
 * 由宿主直驱 LoopRunner 消费（loop 自带 zod 校验/超时/截断包装）。
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

export function buildLwAgentToolDefs(deps: LwAgentDeps): AgentToolDef<any>[] {
  // AgentToolDef 的 TInput 在 execute 参数位逆变——具体入参类型无法直接赋给
  // AgentToolDef<unknown>；运行时入参仍经 loop 层 zod safeParse（any 不泄漏校验路径）
  const counter = { calls: 0 }

  const generateOverview: AgentToolDef<z.infer<typeof GenerateOverviewInput>> = {
    name: 'generate_overview',
    description: '生成/重写故事概要。params.input 必填：用户的想法与要求（题材、基调、核心冲突等）。',
    inputSchema: z.object({ input: z.string().min(1).describe('用户的想法/要求') }),
    dangerLevel: 'write',
    executeTimeoutMs: 300_000,
    execute: async (input) => {
      const r = await runOne(deps, 'generate_overview', input, counter)
      return { ok: r.ok, summary: r.summary }
    },
  }

  const generateCharacters: AgentToolDef<z.infer<typeof GenerateCharactersInput>> = {
    name: 'generate_characters',
    description: '设计主要人物（依赖故事概要已存在）。requirements 可选：对人物的特殊要求。',
    inputSchema: z.object({ requirements: z.string().optional().describe('人物要求') }),
    dangerLevel: 'write',
    executeTimeoutMs: 300_000,
    execute: async (input) => {
      const r = await runOne(deps, 'generate_characters', input, counter)
      return { ok: r.ok, summary: r.summary }
    },
  }

  const generateWorld: AgentToolDef<z.infer<typeof GenerateWorldInput>> = {
    name: 'generate_world',
    description: '搭建世界观：背景/地点/势力/功法物品四类设定（依赖故事概要）。',
    inputSchema: z.object({}),
    dangerLevel: 'write',
    executeTimeoutMs: 600_000,
    execute: async () => {
      const r = await runOne(deps, 'generate_world', {}, counter)
      return { ok: r.ok, summary: r.summary }
    },
  }

  const generatePlots: AgentToolDef<z.infer<typeof GenerateWorldInput>> = {
    name: 'generate_plots',
    description: '规划故事线（依赖故事概要）。',
    inputSchema: z.object({}),
    dangerLevel: 'write',
    executeTimeoutMs: 300_000,
    execute: async () => {
      const r = await runOne(deps, 'generate_plots', {}, counter)
      return { ok: r.ok, summary: r.summary }
    },
  }

  const generateOutline: AgentToolDef<z.infer<typeof GenerateOutlineInput>> = {
    name: 'generate_outline',
    description: '生成故事大纲树（卷/章/节；依赖故事概要；已有完整大纲时会跳过）。structureLevel：1=粗纲 2=二级 3=细纲（缺省 3）。',
    inputSchema: z.object({ structureLevel: z.number().int().min(1).max(3).optional() }),
    dangerLevel: 'write',
    executeTimeoutMs: 600_000,
    execute: async (input) => {
      const r = await runOne(deps, 'generate_outline', input, counter)
      return { ok: r.ok, summary: r.summary }
    },
  }

  const writeChapter: AgentToolDef<z.infer<typeof WriteChapterInput>> = {
    name: 'write_chapter',
    description: '撰写下一章正文（依赖大纲；不传 outlineId 自动选下一篇未写叶子）。targetWords 目标字数，style 文风，extraPrompt 额外要求。耗时较长。',
    inputSchema: z.object({
      outlineId: z.string().optional().describe('目标大纲节点 id（缺省自动选下一篇未写叶子）'),
      targetWords: z.number().int().positive().optional(),
      style: z.string().optional(),
      extraPrompt: z.string().optional(),
    }),
    dangerLevel: 'write',
    executeTimeoutMs: 900_000,
    execute: async (input) => {
      const r = await runOne(deps, 'write_chapter', input, counter)
      return { ok: r.ok, summary: r.summary }
    },
  }

  const updateEntity: AgentToolDef<z.infer<typeof UpdateEntityInput>> = {
    name: 'update_entity',
    description: '修改设定实体（character/location/faction/skill/item/plot/outline/overview）。用 id 或 name 定位，patch 为要更新的字段对象。',
    inputSchema: z.object({
      type: EntityType,
      id: z.string().optional(),
      name: z.string().optional().describe('按名称定位（查不到 id 时用）'),
      patch: z.record(z.string(), z.unknown()).describe('要更新的字段'),
    }),
    dangerLevel: 'write',
    executeTimeoutMs: 120_000,
    execute: async (input) => {
      const r = await runOne(deps, 'update_entity', input, counter)
      return { ok: r.ok, summary: r.summary }
    },
  }

  const deleteEntity: AgentToolDef<z.infer<typeof DeleteEntityInput>> = {
    name: 'delete_entity',
    description: '删除设定实体（用 id 或 name 定位；级联清理关系边）。',
    inputSchema: z.object({
      type: EntityType,
      id: z.string().optional(),
      name: z.string().optional(),
    }),
    dangerLevel: 'write',
    executeTimeoutMs: 120_000,
    execute: async (input) => {
      const r = await runOne(deps, 'delete_entity', input, counter)
      return { ok: r.ok, summary: r.summary }
    },
  }

  return [
    generateOverview,
    generateCharacters,
    generateWorld,
    generatePlots,
    generateOutline,
    writeChapter,
    updateEntity,
    deleteEntity,
  ]
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
