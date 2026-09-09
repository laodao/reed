/**
 * 领域学习 Agent 工具定义
 * @module packs/domain-learning/services/dl-agent-tools
 *
 * 与 EP/LW 宿主同构，但**以裸名注册（source='tool'，dl_ 前缀天然防跨包冲突）**——
 * 平台 registry 对 pack 工具会强制命名空间 `pack:<packId>:<name>` 且 loop 直接把它
 * 当 LLM function.name 透传，OpenAI 兼容 API 拒绝冒号（agent-harness 待修缺口，
 * EP/LW 同受影响；本包先裸名规避，工具域归属用 dl_ 前缀与 source 域表达）。
 * - def 不捕获空间——spaceId/conceptId 从 ctx.logContext（宿主 runtimeContext 注入）运行时还原；
 * - 懒注册幂等（boot 时序：pack activate 早于 workflow-boot，注册只能发生在宿主首次 sendMessage 之后）；
 * - 动作一律经 executeDlAction 落库（校验/人审草稿语义集中，见 dl-agent-actions）。
 *
 * 规划/技能工具（discover_capabilities / invoke_skill）由宿主白名单直接透出裸名
 * （系统工具以 source='builtin' 注册，不带 pack 前缀，见 system-agent-tools）。
 */

import { z } from 'zod'
import type { AgentToolContext, AgentToolDef } from '@core/platform/agent-runtime/types'
import type { AgentToolRegistry } from '@core/platform/agent-runtime/tools/registry'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { emitDlAgentEvent } from './dl-agent-events'
import { executeDlAction, type DlAgentActionType } from './dl-agent-actions'
import {
  DL_AGENT_PACK_ID,
  DL_TOOL_MAX_CALLS,
  type DlAgentActionSummary,
  type DlAgentExecutionContext,
} from './dl-agent.types'

/** 从工具执行上下文还原 dl 执行上下文（shared registry：空间信息只能来自 runtimeContext） */
function dlCtxFrom(ctx: AgentToolContext): DlAgentExecutionContext {
  const log = (ctx.logContext ?? {}) as Record<string, unknown>
  const spaceId = typeof log.spaceId === 'string' ? log.spaceId : ''
  const conceptId = typeof log.conceptId === 'string' ? log.conceptId : null
  if (!spaceId) {
    throw new Error('缺少学习空间上下文（runtimeContext.spaceId 未注入）——dl 工具只能在领域学习宿主内调用')
  }
  return {
    spaceId,
    conceptId,
    questionId: typeof log.questionId === 'string' ? log.questionId : null,
    providerConfigId: typeof log.providerConfigId === 'string' ? log.providerConfigId : undefined,
    modelId: typeof log.modelId === 'string' ? log.modelId : undefined,
    db: getCoreDatabaseManager(),
    emit: (e) => emitDlAgentEvent(spaceId, conceptId, e),
  }
}

function summaryToResult(summary: DlAgentActionSummary): { ok: true; data: unknown } {
  return { ok: true, data: { status: summary.status, message: summary.message, data: summary.data ?? null } }
}

/** 动作工具统一形态（dl_* 动作：写库草稿态，dangerLevel write） */
function dlActionTool(actionType: DlAgentActionType, description: string, schema: z.ZodTypeAny): AgentToolDef {
  return {
    name: actionType,
    description,
    inputSchema: schema,
    dangerLevel: 'write',
    executeTimeoutMs: 180_000,
    autoApprovableInWorkflow: false,
    execute: async (input, ctx) => {
      const dlCtx = dlCtxFrom(ctx)
      const { summary } = await executeDlAction(dlCtx, {
        type: actionType,
        params: (input ?? {}) as Record<string, unknown>,
      })
      if (summary.status === 'error') throw new Error(summary.message)
      // 富 action:done 事件：宿主 tapEvents 回流为本轮动作摘要（EP 同构）
      emitDlAgentEvent(dlCtx.spaceId, dlCtx.conceptId, { type: 'action:done', tool: actionType, summary })
      return summaryToResult(summary)
    },
  }
}

/** 概念保存 schema */
const saveConceptSchema = z.object({
  concept: z.object({
    name: z.string().min(1).describe('概念/术语名（同父下不重名；重名时更新描述）'),
    nodeType: z
      .enum(['group', 'concept', 'fact', 'definition', 'axiom', 'theory', 'method', 'artifact', 'paper', 'standard', 'regulation', 'procedure', 'case', 'person', 'controversy', 'principle'])
      .default('concept')
      .describe('节点类型；group=目录（分支/模块）'),
    en: z.string().optional().describe('英文术语'),
    parentId: z.string().nullable().optional().describe('树父 group id（null=领域根层）'),
    definitionShort: z.string().optional().describe('一句话定义（地图悬停用）'),
    researchState: z.string().optional().describe('research_state（默认 extracted）'),
    attrs: z.record(z.string(), z.unknown()).optional().describe('扩展字段'),
  }),
})

/** 关系保存 schema（建议态；人审确认走 confirmRelation） */
const saveRelationSchema = z.object({
  relation: z.object({
    sourceId: z.string().min(1).describe('起点概念 id'),
    targetId: z.string().min(1).describe('终点概念 id'),
    relationType: z.string().optional().describe('关系类型（默认 prerequisite：学 target 前需掌握 source）'),
    evidence: z.string().optional().describe('来源说明'),
  }),
})

/** 讲义保存 schema（evidence 硬校验） */
const saveCardSchema = z.object({
  card: z.object({
    conceptId: z.string().min(1).describe('概念 id'),
    essenceType: z.enum(['K-concept', 'K-oper', 'K-stmt', 'K-inst', 'K-agent', 'K-open']).describe('知识本质类型（决定模板区集）'),
    sections: z
      .array(z.object({
        key: z.string().min(1),
        title: z.string().optional(),
        style: z.string().optional(),
        md: z.string().min(1).describe('区内容 md（可含图/表/mermaid/KaTeX）'),
        folded: z.boolean().optional(),
      }))
      .min(1)
      .describe('讲义区集（模板语义；related 区不落库）'),
    works: z
      .array(z.object({ kind: z.string(), title: z.string(), authors: z.string().optional(), year: z.string().optional(), url: z.string().optional(), note: z.string().optional() }))
      .optional()
      .describe('相关著作（有则显示）'),
    evidenceSources: z
      .array(z.object({ kind: z.string(), title: z.string(), url: z.string().optional(), kbDocId: z.string().optional(), quote: z.string().optional() }))
      .min(1)
      .describe('证据来源（无证据不落库）'),
    needsVerification: z.boolean().optional().describe('含先验待验证内容时置 true'),
  }),
})

/** 答疑存档 schema */
const answerQuestionSchema = z.object({
  question: z.object({
    questionId: z.string().optional().describe('已有未解问题的 id（首次登记可省）'),
    conceptId: z.string().nullable().optional(),
    question: z.string().min(1).describe('用户问题原文'),
    answerMd: z.string().optional().describe('答案 markdown（unresolved 时不填）'),
    answerSource: z.string().optional().describe('lesson/graph/kb/ai_verified'),
    unresolved: z.boolean().optional().describe('true=答不上登记未解（保持 open，不写答案）'),
  }),
})

/** 动作工具清单 */
export function buildDlAgentToolDefs(): AgentToolDef[] {
  return [
    dlActionTool('dl_save_concept', '落库一个概念/知识节点（草稿态，待地图人审）。概念名必须来自当前空间快照或研究材料，不要编造。', saveConceptSchema),
    dlActionTool('dl_save_relation', '落库一条关系边建议（默认前置依赖，source→target=学 target 前需掌握 source；待人审确认）。', saveRelationSchema),
    dlActionTool('dl_save_card', '落库概念讲义卡片（区集 sections+著作 works+证据 evidenceSources；无证据会被拒绝）。', saveCardSchema),
    dlActionTool('dl_answer_question', '把答疑结果存档：答上写 answer+来源（answered）；答不上 unresolved=true 登记未解队列（保持 open）。', answerQuestionSchema),
  ]
}

// ==================== task 进度上报工具（M6-3 阶段三：子任务结构化进度；只上报不落库） ====================

/** task 进度工具名（仅 task 会话 bind；不在 dl_* 动作清单内） */
export const DL_TASK_PROGRESS_TOOL = 'dl_task_progress'

const taskProgressSchema = z.object({
  action: z
    .enum(['plan', 'start', 'done'])
    .describe('plan=声明任务计划（应列出步骤数与各步名称）；start=开始某一步；done=完成某一步'),
  step: z.number().int().min(1).optional().describe('步骤序号（从 1 起）'),
  total: z.number().int().min(1).optional().describe('计划步骤总数（action=plan 时填）'),
  label: z.string().optional().describe('该步名称/动作说明'),
})

/** 任务进度上报（danger=read：只发事件给前端展示，不改任何库） */
export function buildDlTaskProgressToolDef(): AgentToolDef {
  return {
    name: DL_TASK_PROGRESS_TOOL,
    description:
      '上报当前任务拆解与执行进度（只展示，不改任何数据）：任务开始前用 action=plan 声明共有几步（total+各步 label），开始某一步用 start(step,label)，完成该步用 done(step,label)。用户界面会显示你的子任务清单与完成状态。',
    inputSchema: taskProgressSchema,
    dangerLevel: 'read',
    executeTimeoutMs: 15_000,
    autoApprovableInWorkflow: true,
    execute: async (input, ctx) => {
      const dlCtx = dlCtxFrom(ctx)
      const raw = (input ?? {}) as { action: string; step?: number; total?: number; label?: string }
      const data = {
        action: raw.action,
        step: raw.step ?? null,
        total: raw.total ?? null,
        label: raw.label ?? null,
      }
      const label = raw.label?.trim() ? ` ${raw.label.trim()}` : ''
      const msg =
        raw.action === 'plan'
          ? `任务计划：共 ${raw.total ?? '?'} 步${label}`
          : raw.action === 'start'
            ? `▶ 开始第 ${raw.step ?? '?'} 步${label}`
            : `✓ 完成第 ${raw.step ?? '?'} 步${label}`
      const summary: DlAgentActionSummary = {
        tool: DL_TASK_PROGRESS_TOOL,
        status: 'ok',
        message: msg,
        data,
      }
      emitDlAgentEvent(dlCtx.spaceId, dlCtx.conceptId, { type: 'action:done', tool: DL_TASK_PROGRESS_TOOL, summary })
      return { ok: true, data: { status: 'ok', message: msg, data } }
    },
  }
}

/** 懒注册（幂等）：宿主首次 sendMessage 时调用（activate 早于 workflow boot）；
 * M4-A P1-2：平台 registry 已支持包工具 LLM 侧别名（bare 名），回归标准
 * { packId } 注册语义（内部 namespaced、可整包注销/审计归属） */
export function registerDlAgentTools(registry: AgentToolRegistry): void {
  const existing = new Set(registry.listSpecs({ packId: DL_AGENT_PACK_ID }).map((s) => s.name))
  for (const def of buildDlAgentToolDefs()) {
    const namespaced = `pack:${DL_AGENT_PACK_ID}:${def.name}`
    if (existing.has(namespaced)) continue
    registry.register(def, { packId: DL_AGENT_PACK_ID })
  }
  // task 进度上报（只读级；注册无副作用，仅 task 会话 bind 时暴露给模型）
  const nsProgress = `pack:${DL_AGENT_PACK_ID}:${DL_TASK_PROGRESS_TOOL}`
  if (!existing.has(nsProgress)) {
    registry.register(buildDlTaskProgressToolDef(), { packId: DL_AGENT_PACK_ID })
  }
}

/** dl 工具白名单（裸名清单；宿主 bindings 直接引用——工具集固定，无需 listSpecs 动态拼） */
export function dlAgentToolNames(): string[] {
  return buildDlAgentToolDefs().map((d) => d.name)
}

/** 工具频控（bind 时写入 maxCalls；动作工具由包内频控覆盖） */
export function dlToolMaxCalls(name: string): number {
  return DL_TOOL_MAX_CALLS[name] ?? 3
}
