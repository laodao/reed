/**
 * EP Agent 工具集（M6.5-a，35 号 subtasks/ep-1）
 * @module platform/episode-production/agent/ep-agent-tools
 *
 * 共享注册形态：13 个生产动作 + ep_confirm_choice 注册进共享 registry 的 pack 命名空间（pack:ep-agent:*），
 * 宿主白名单经 listSpecs({packId}) 组装（全名匹配）。与长文 M6 的宿主本地闭包不同：
 * - def **不捕获项目**——projectId/episodeId 从 ctx.logContext（宿主 runtimeContext 注入）
 *   运行时读取，缺失即抛错（聊天宿主不注入 → 无法误调）；
 * - 懒注册幂等（boot 时序：pack activate 早于 workflow-boot，评审 P0-1——lw-agent-tools.ts:5-7 坑）；
 * - 每次调用前重算生产状态做依赖检查（#49 同轮依赖语义，评审 P1-5）。
 *
 * ep_confirm_choice（choice→审批映射，EP-2）；8a70bf6e 起补齐后半程四工具
 * （generate_keyframes / generate_segment_video / generate_scene_audio / export_mp4）。
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

/** 每轮频控（bind 时写入 maxCalls）：花费类 1、文本类 3（35 号 §4 成本闸门）。
 * 0916 晚 review 修正：批量长工具改为分页执行（keyframes/video/audio 每次调用
 * 限 8/4/6 个目标，见 ep-agent-actions），上限须允许典型剧集多页跑完 + 一次失败
 * 重试——原 keyframes:1/video:2 会让「补片→再导出」「多页续调」合法流被
 * LIMIT_EXCEEDED 拦死；export_mp4 放宽到 2 容纳一次前置校验失败后的重试。
 * 2026-09-16 S-04：资产生成类 1→3（同类动作每轮 3 次，配合 registry 的 dedupArgs
 * 按 action+参数去重——不同资产各烧一次额度，同参数重复点火直接拒）。 */
export const EP_TOOL_MAX_CALLS: Record<string, number> = {
  generate_script: 3,
  split_scenes: 3,
  generate_storyboards: 3,
  generate_keyframes: 6,
  generate_segment_video: 8,
  generate_scene_audio: 4,
  export_mp4: 2,
  generate_char_asset: 3,
  generate_location_asset: 3,
  generate_item_asset: 3,
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
  // 界面域（2026-10-15）：随 runtimeContext 注入，工具事件只发回发起会话的 scope 通道
  const agentScope = typeof log.agentScope === 'string' && log.agentScope ? log.agentScope : undefined
  return {
    projectId,
    episodeId,
    providerConfigId: typeof log.providerConfigId === 'string' ? log.providerConfigId : undefined,
    modelId: typeof log.modelId === 'string' ? log.modelId : undefined,
    db: getCoreDatabaseManager(),
    ai: LongWritingAIService.getInstance(),
    emit: (event) => emitEpAgentEvent(projectId, episodeId, event, agentScope),
    signal: ctx.signal,
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
  // 后半程四件（2026-09-16）：关键帧/配音为批量 + provider 长调用，对齐片段桥接口径；
  // 视频/导出 S-04 起改 started 语义（启动+grace 校验后即返回），不再需 30min 长超时
  generate_keyframes: 1_800_000,
  generate_segment_video: 300_000,
  generate_scene_audio: 900_000,
  export_mp4: 300_000,
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

/** 13 个生产动作的工具定义（共享注册形态；2026-09-16 补后半程四件） */
export function buildEpAgentToolDefs(): AgentToolDef[] {
  return [
    epActionTool('generate_script', '生成整集剧本（synopsis+结构化场景+正文）。可选 chapterContent 提供章节原文作为改编底稿。',
      z.object({ chapterContent: z.string().optional().describe('章节原文（可选，作为改编底稿）') })),
    epActionTool('split_scenes', '从剧本 synopsis 拆分场景。前置：已生成剧本。',
      z.object({ scriptId: z.string().optional().describe('剧本 id（缺省用当前集剧本）') })),
    epActionTool('generate_storyboards', '按场景批量生成分镜。前置：已有场景拆分。',
      z.object({ scriptId: z.string().optional().describe('剧本 id（缺省用当前集剧本）') })),
    epActionTool('generate_keyframes', '为分镜生成关键帧图（首帧/中间帧/末帧）。前置：已有分镜。缺省只为本集"尚无关键帧图"的分镜生成，已有图的跳过（不重复烧图费）。',
      z.object({
        storyboardId: z.string().optional().describe('分镜 id（缺省=本集所有缺关键帧的分镜）'),
      })),
    epActionTool('generate_segment_video', '把分镜/片段生成为视频（分钟级后台任务：返回"已启动"即成功，每段需数分钟，完成后片段/分镜状态自动变为已完成，不要为等完成而重复调用）。视频模型缺省读项目设置（config.videoModel），未配置则报错并引导去项目设置。缺省为本集全部缺视频的分镜逐个生成。',
      z.object({
        storyboardId: z.string().optional().describe('分镜 id（与 segmentId 二选一）'),
        segmentId: z.string().optional().describe('片段 id（片段制出片；与 storyboardId 二选一）'),
        providerConfigId: z.string().optional().describe('视频提供商配置 id（缺省读项目设置，再自动挑第一个启用的视频模型）'),
        modelId: z.string().optional().describe('视频模型 id（缺省同上）'),
      })),
    epActionTool('generate_scene_audio', '为场景生成配音（对白+旁白 TTS，按角色绑定音色），产物落库后导出时自动混入成片。缺省为本集所有"有缺失"的场景（旁白或任一对白缺音频即补，已有配音的部分不重复生成）；显式指定 sceneId 时整场重新配音。',
      z.object({
        sceneId: z.string().optional().describe('场景 id（缺省=本集所有缺配音的场景，只补缺失项）'),
      })),
    epActionTool('export_mp4', '整集合成导出 MP4（分钟级后台任务：返回"已启动"即成功，合成需数分钟；末端硬锁：所有入选分镜须已有视频，未满足会立即报错）。成功后剧集标记为已完成。',
      z.object({
        outputPath: z.string().optional().describe('导出文件名（只接受文件名如 "第1集.mp4"，固定写入应用导出目录；不传自动命名）'),
        burnSubtitles: z.boolean().optional().describe('是否烧入字幕（默认 true）'),
      })),
    epActionTool('generate_char_asset', '为角色生成定妆主图。name 必填，须为项目内已有角色。',
      assetNameSchema),
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
    epActionTool('query_database', '查询外部数据源（参数化 SQL 只读）。dataSourceId 从状态快照的【候选数据源名单】里取名称或 id。',
      z.object({
        dataSourceId: z.string().describe('数据源 id 或名称'),
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
  actionType: z.enum(['generate_script', 'split_scenes', 'generate_storyboards', 'generate_keyframes', 'generate_segment_video', 'generate_scene_audio', 'export_mp4', 'generate_char_asset', 'generate_location_asset', 'generate_item_asset', 'update_entity', 'delete_entity', 'query_database']),
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
