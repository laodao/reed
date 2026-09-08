/**
 * EP Agent 工具集（M6.5-a，35 号 subtasks/ep-1）
 * @module platform/episode-production/agent/ep-agent-tools
 *
 * 共享注册形态：9 个生产动作注册进共享 registry 的 pack 命名空间（pack:ep-agent:*），
 * 宿主白名单经 listSpecs({packId}) 组装（全名匹配）。与长文 M6 的宿主本地闭包不同：
 * - def **不捕获项目**——projectId/episodeId 从 ctx.logContext（宿主 runtimeContext 注入）
 *   运行时读取，缺失即抛错（聊天宿主不注入 → 无法误调）；
 * - 懒注册幂等（boot 时序：pack activate 早于 workflow-boot，评审 P0-1——lw-agent-tools.ts:5-7 坑）；
 * - 每次调用前重算生产状态做依赖检查（#49 同轮依赖语义，评审 P1-5）。
 *
 * ep_confirm_choice（choice→审批映射）在 EP-2 引入，本期不含。
 */

import { z } from 'zod'
import type { AgentToolContext, AgentToolDef } from '@core/platform/agent-runtime/types'
import type { AgentToolRegistry } from '@core/platform/agent-runtime/tools/registry'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { LongWritingAIService } from '@core/platform/services/longwriting-ai.service'
import { emitEpAgentEvent } from './ep-agent-events'
import { executeSingleEpAction } from './ep-agent-actions'
import { computeEpProductionState } from './ep-agent-deps'
import type { EpAgentActionType, EpAgentExecutionContext } from './ep-agent.types'

export const EP_AGENT_PACK_ID = 'ep-agent'

/** 每轮频控（bind 时写入 maxCalls）：花费类 1、文本类 3（35 号 §4 成本闸门） */
export const EP_TOOL_MAX_CALLS: Record<string, number> = {
  generate_script: 3,
  split_scenes: 3,
  generate_storyboards: 3,
  generate_char_asset: 1,
  generate_location_asset: 1,
  generate_item_asset: 1,
  update_entity: 3,
  delete_entity: 2,
  query_database: 3,
  ep_confirm_choice: 2,
}

/** 从工具执行上下文还原 EP 执行上下文（共享注册：项目上下文只能来自 runtimeContext） */
function epCtxFrom(ctx: AgentToolContext): EpAgentExecutionContext {
  const log = (ctx.logContext ?? {}) as Record<string, unknown>
  const projectId = typeof log.projectId === 'string' ? log.projectId : ''
  const episodeId = typeof log.episodeId === 'string' ? log.episodeId : ''
  if (!projectId || !episodeId) {
    throw new Error('缺少剧集上下文（runtimeContext.projectId/episodeId 未注入）——EP 工具只能在剧集制作宿主内调用')
  }
  return {
    projectId,
    episodeId,
    providerConfigId: typeof log.providerConfigId === 'string' ? log.providerConfigId : undefined,
    modelId: typeof log.modelId === 'string' ? log.modelId : undefined,
    db: getCoreDatabaseManager(),
    ai: LongWritingAIService.getInstance(),
    emit: (event) => emitEpAgentEvent(projectId, episodeId, event),
  }
}

/** 工具结果归一：skipped/ok → {ok:true,data:摘要}（模型读 message 自纠）；error → throw（管线收口 {ok:false}） */
function summaryToResult(summary: { status: string; message: string; data?: unknown }): { ok: true; data: unknown } {
  return { ok: true, data: { status: summary.status, message: summary.message, data: summary.data ?? null } }
}

/** 各动作超时（对齐 LW 300–900s 先例——评审 P1-1：缺省 120s 会让整集剧本生成被截断） */
const EP_ACTION_TIMEOUT_MS: Record<string, number> = {
  generate_script: 600_000,
  split_scenes: 300_000,
  generate_storyboards: 600_000,
  generate_char_asset: 600_000,
  generate_location_asset: 600_000,
  generate_item_asset: 600_000,
  update_entity: 120_000,
  delete_entity: 120_000,
  query_database: 120_000,
}

/** 单个动作工具定义（actionType 即工具名；params schema 平移自 executeXxx 的参数约定） */
function epActionTool(actionType: EpAgentActionType, description: string, schema: z.ZodTypeAny): AgentToolDef {
  return {
    name: actionType,
    description,
    inputSchema: schema,
    dangerLevel: 'write',
    executeTimeoutMs: EP_ACTION_TIMEOUT_MS[actionType] ?? 300_000,
    autoApprovableInWorkflow: false,
    execute: async (input, ctx) => {
      const epCtx = epCtxFrom(ctx)
      const state = await computeEpProductionState(epCtx.db, epCtx.projectId, epCtx.episodeId)
      const { summary } = await executeSingleEpAction(epCtx, { type: actionType, params: (input ?? {}) as Record<string, any> }, state)
      if (summary.status === 'error') throw new Error(summary.error || summary.message)
      return summaryToResult(summary)
    },
  }
}

const assetNameSchema = z.object({
  name: z.string().min(1).describe('目标名称（须为项目内已有资产名）'),
  description: z.string().optional().describe('补充描述（外观/风格微调，可省略）'),
})

/** 9 个生产动作的工具定义（共享注册形态） */
export function buildEpAgentToolDefs(): AgentToolDef[] {
  return [
    epActionTool('generate_script', '生成整集剧本（synopsis+结构化场景+正文）。可选 chapterContent 提供章节原文作为改编底稿。',
      z.object({ chapterContent: z.string().optional().describe('章节原文（可选，作为改编底稿）') })),
    epActionTool('split_scenes', '从剧本 synopsis 拆分场景。前置：已生成剧本。',
      z.object({ scriptId: z.string().optional().describe('剧本 id（缺省用当前集剧本）') })),
    epActionTool('generate_storyboards', '按场景批量生成分镜。前置：已有场景拆分。',
      z.object({ scriptId: z.string().optional().describe('剧本 id（缺省用当前集剧本）') })),
    epActionTool('generate_char_asset', '为角色生成定妆主图。name 必填，须为项目内已有角色。', assetNameSchema),
    epActionTool('generate_location_asset', '为地点生成主图。name 必填，须为项目内已有地点。', assetNameSchema),
    epActionTool('generate_item_asset', '为物品生成主图。name 必填，须为项目内已有物品。', assetNameSchema),
    epActionTool('update_entity', '修改已有资产（角色/地点/物品）的设定字段。定位失败会明确报错，不静默创建。',
      z.object({
        type: z.enum(['character', 'location', 'item']),
        id: z.string().optional(),
        name: z.string().optional(),
        patch: z.record(z.string(), z.unknown()).describe('要修改的字段与值'),
      })),
    epActionTool('delete_entity', '删除已有资产（角色/地点/物品）。删除不可逆，谨慎使用。',
      z.object({
        type: z.enum(['character', 'location', 'item']),
        id: z.string().optional(),
        name: z.string().optional(),
      })),
    epActionTool('query_database', '查询外部数据源（参数化 SQL 只读）。dataSourceId 来自用户选择或数据源清单。',
      z.object({
        dataSourceId: z.string().describe('数据源 id'),
        sql: z.string().describe('SQL 模板（$1,$2 占位）'),
        params: z.array(z.unknown()).optional(),
      })),
  ]
}

/**
 * ep_confirm_choice（EP-2，choice→审批映射）：LLM 需要用户先选一个候选时调用。
 * requiresApproval → 审批卡挂起；用户选定经 approve_with_edit 的**整体替换** input 回填
 * （评审 P1-3：schema 一形两用——LLM 首呼与用户编辑同构，前端必须回传完整 input）。
 */
export const EP_CONFIRM_CHOICE_TOOL = 'ep_confirm_choice'

const EpConfirmChoiceSchema = z.object({
  actionType: z.enum(['generate_script', 'split_scenes', 'generate_storyboards', 'generate_char_asset', 'generate_location_asset', 'generate_item_asset', 'update_entity', 'delete_entity', 'query_database']),
  param: z.string().describe('需要用户填充的参数名（如 name/dataSourceId）'),
  choices: z.array(z.string()).min(1).describe('候选清单'),
  prompt: z.string().optional().describe('给用户的选择提示'),
  selected: z.string().optional().describe('用户选定的候选——由审批卡回填，模型首呼留空'),
})

/** 懒注册（幂等）：宿主首次 sendMessage 时调用——boot 时序上 pack activate 早于 workflow-boot，
 * 共享 registry 当时还不存在（评审 P0-1），因此注册只能发生在宿主首次用到 harness 之后 */
export function registerEpAgentTools(registry: AgentToolRegistry): void {
  const existing = new Set(registry.listSpecs({ packId: EP_AGENT_PACK_ID }).map((s) => s.name))
  for (const def of buildEpAgentToolDefs()) {
    const namespaced = `pack:${EP_AGENT_PACK_ID}:${def.name}`
    if (existing.has(namespaced)) continue
    registry.register(def, { packId: EP_AGENT_PACK_ID })
  }
  if (!existing.has(`pack:${EP_AGENT_PACK_ID}:${EP_CONFIRM_CHOICE_TOOL}`)) {
    registry.register(buildEpConfirmChoiceDef(), { packId: EP_AGENT_PACK_ID })
  }
}

/** ep_confirm_choice 工具定义（独立导出：单测直调 execute 验证选择校验，绕过审批管线） */
export function buildEpConfirmChoiceDef(): AgentToolDef {
  return {
        name: EP_CONFIRM_CHOICE_TOOL,
        description: '当用户请求里缺少必要选项（如"生成定妆图"但没说哪个角色）时，向用户发起选择请求。发起后本工具会挂起等待用户在审批卡中选定；返回的 selected 即用户选择，请据此继续调用对应动作工具。',
        inputSchema: EpConfirmChoiceSchema,
        dangerLevel: 'read',
        requiresApproval: true,
        approvalCard: {
          title: '需要你的选择',
          summary: (i: { prompt?: string; choices?: string[] }) => `${i.prompt || '请选择'}（候选：${(i.choices ?? []).join('、')}）`,
          editable: ['selected'],
        },
        execute: async (input) => {
          const selected = (input as { selected?: string }).selected
          const choices = (input as { choices?: string[] }).choices ?? []
          if (!selected) throw new Error('等待用户选择：请在审批卡中选定一个候选')
          if (!choices.includes(selected)) throw new Error(`所选「${selected}」不在候选清单中`)
          return summaryToResult({ status: 'ok', message: `用户已选择：${selected}`, data: { selected } })
        },
      } as AgentToolDef
}
