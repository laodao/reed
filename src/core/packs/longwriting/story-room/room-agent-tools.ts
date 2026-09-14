/**
 * 故事研讨室 Agent 工具定义（46 号：双模式宿主）
 * @module packs/longwriting/story-room/room-agent-tools
 *
 * 与 dl-agent-tools 同构：标准 packId 注册（`pack:lw-room:<name>`，registry 建
 * 裸名别名 + loop wire-name 兜底）；def 不捕获项目——projectId 从 ctx.logContext
 * （宿主 runtimeContext 注入）运行时还原。
 * - 读工具：查故事圣经（实体/关系/事件/伏笔）/ 查共识账本；
 * - 写工具：一律只落「设计包」草稿（room-design），确认后才走正式落库——
 *   「全部设计完整体让用户确认」的纪律由数据流保证，不靠提示词自觉；
 * - 进度工具：lw_task_progress 只发事件不落库（照抄 dl_task_progress 模式）。
 *
 * 技能/工作流（discover_capabilities/invoke_skill/run_workflow/get_workflow_run）
 * 为 builtin 系统工具，宿主 bindings 引用裸名即可（workflow-boot 已注册）。
 */

import { z } from 'zod'
import type { AgentToolContext, AgentToolDef } from '@core/platform/agent-runtime/types'
import type { AgentToolRegistry } from '@core/platform/agent-runtime/tools/registry'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { DesignItemKind } from '@shared/types/story-room.types'
import { addDesignItem, ensureDraftPackage } from './room-design'
import { getRoomState } from './room-state'
import { ledgerSnapshotText } from './room-ledger'
import { emitRoomEvent } from './room-events'
import { GraphService } from '@core/platform/services/longwriting/graph/graph.service'

export const LW_ROOM_PACK_ID = 'lw-room'

// 步数上限已迁入「参数设置 → 长文写作 → 故事研讨室」（`longwriting:storyRoom`.editorMaxSteps，
// 默认 24 / 上限 60——六扇门复盘：上限本职是失控兜底而非预算），使用点现读；原
// LW_ROOM_MAX_STEPS 环境变量覆盖通道退役。

/** 从工具执行上下文还原研讨室上下文 */
function lwCtxFrom(ctx: AgentToolContext): { projectId: string } {
  const log = (ctx.logContext ?? {}) as Record<string, unknown>
  const projectId = typeof log.projectId === 'string' ? log.projectId : ''
  if (!projectId) {
    throw new Error('缺少研讨室上下文（runtimeContext.projectId 未注入）——lw 工具只能在研讨室宿主内调用')
  }
  return { projectId }
}

/** 写工具统一出口：落设计包 + 发 task:progress 事件 */
async function saveDesign(
  ctx: AgentToolContext,
  input: { taskTitle?: string },
  kind: DesignItemKind,
  label: string,
  payload: Record<string, any>,
  note?: string,
): Promise<{ ok: true; data: unknown }> {
  const { projectId } = lwCtxFrom(ctx)
  const db = getCoreDatabaseManager()
  await ensureDraftPackage(db, projectId, { taskTitle: input.taskTitle })
  const item = await addDesignItem(db, projectId, {
    kind,
    label,
    payload,
    note,
    taskTitle: input.taskTitle,
  })
  emitRoomEvent(projectId, {
    type: 'task:progress',
    message: `✓ 已入设计包：${label}`,
    tool: `lw_save_${kind}`,
    status: 'ok',
  })
  return { ok: true, data: { status: 'ok', message: `已入设计包（第 ${item.id} 项），确认后生效`, itemId: item.id } }
}

// ==================== 读工具 ====================

const queryBibleSchema = z.object({
  query: z.object({
    type: z
      .enum(['character', 'location', 'item', 'faction', 'skill', 'all'])
      .optional()
      .describe('实体类型（缺省=all）'),
    name: z.string().optional().describe('按名称精确匹配单个实体（给出时返回该实体详情：字段/关系/事件/状态）'),
    chapter: z.number().int().min(1).optional().describe('时间线锚点章节（查该章仍生效的关系与已发生事件；缺省=全时段）'),
    includeForeshadows: z.boolean().optional().describe('附带待回收伏笔清单'),
  }),
})

/** 读工具：查故事圣经（实体/关系/事件/伏笔统一入口，输出截断防爆上下文） */
function buildQueryBibleToolDef(): AgentToolDef {
  return {
    name: 'lw_query_bible',
    description:
      '查询本项目已确立的故事设定：人物/场景/物品/势力/技能实体、它们之间的关系（可按章节锚点过滤）、已发生事件与待回收伏笔。设计任务前必须先查，避免与既有设定冲突或重复。',
    inputSchema: queryBibleSchema,
    dangerLevel: 'read',
    executeTimeoutMs: 30_000,
    autoApprovableInWorkflow: true,
    execute: async (input, ctx) => {
      const { projectId } = lwCtxFrom(ctx)
      const db = getCoreDatabaseManager()
      const q = ((input ?? {}) as { query?: Record<string, any> }).query ?? {}
      const graph = new GraphService(db)
      const lines: string[] = []

      // 单实体详情：字段 + 生效关系 + 相关事件
      if (q.name) {
        const type = (q.type && q.type !== 'all' ? q.type : 'character') as any
        const resolved = await graph.resolveEntities(projectId, [{ type, name: String(q.name) }])
        const hit = resolved[0]
        if (!hit?.resolved || !hit.id) {
          return { ok: true, data: { found: false, message: `未找到名为「${q.name}」的${type === 'all' ? '' : type}实体` } }
        }
        const node = await graph.getNode(projectId, hit.type as any, hit.id)
        const chapter = Number(q.chapter) || undefined
        const edges = chapter
          ? await graph.edgesAt(projectId, hit.id, chapter)
          : await graph.getRelations(projectId, hit.type as any, hit.id)
        const relText = edges
          .map((e) => `${e.sourceId === hit.id ? '→' : '←'} ${e.relationType}（${e.sourceId === hit.id ? e.targetType : e.sourceType}:${e.sourceId === hit.id ? e.targetId : e.sourceId}）${e.validUntilChapter !== undefined ? '【已失效】' : ''}`)
          .join('\n')
        const events = ((await db?.lwEvents?.getByProjectId(projectId)) || [])
          .filter((ev: any) => (ev.state ?? 'happened') === 'happened' && (ev.involvedEntities || []).some((x: any) => x.id === hit.id))
          .slice(0, 8)
        lines.push(`【${hit.name}】ID=${hit.id}`)
        if (node?.description) lines.push(`简介：${node.description}`)
        if (relText) lines.push(`关系：\n${relText}`)
        if (events.length) lines.push(`相关事件：\n${events.map((ev: any) => `- 第${ev.chapterNumber || '—'}章 ${ev.name}`).join('\n')}`)
        return { ok: true, data: { found: true, text: lines.join('\n') } }
      }

      // 列表：实体名册（按类型）
      const types: string[] = q.type && q.type !== 'all' ? [q.type] : ['character', 'location', 'item', 'faction', 'skill']
      for (const t of types) {
        const list = (await (db as any)?.[repotFor(t)]?.getByProjectId?.(projectId)) || []
        const names = list.map((x: any) => `${x.name}(${x.id})`).join('、')
        if (names) lines.push(`【${t}】${names}`)
      }

      // 事件（按章过滤可选）
      const events = ((await db?.lwEvents?.getByProjectId(projectId)) || []).filter(
        (ev: any) => (ev.state ?? 'happened') === 'happened' && (!q.chapter || ev.chapterNumber === Number(q.chapter) || (ev.chapterNumber || 0) < Number(q.chapter)),
      )
      if (events.length) {
        lines.push(
          `【事件】\n${events
            .slice(0, 20)
            .map((ev: any) => `- 第${ev.chapterNumber || '—'}章 ${ev.name}${ev.description ? `：${String(ev.description).slice(0, 50)}` : ''}`)
            .join('\n')}`,
        )
      }

      // 伏笔
      if (q.includeForeshadows) {
        const fs = (await db?.lwForeshadows?.getByProjectId(projectId)) || []
        const open = fs.filter((f: any) => f.status === 'open').slice(0, 10)
        if (open.length) lines.push(`【待回收伏笔】\n${open.map((f: any) => `- 第${f.plantedChapter ?? '—'}章埋设：${f.content}`).join('\n')}`)
      }

      const text = lines.join('\n\n') || '（圣经为空：尚无任何已确立设定）'
      return { ok: true, data: { text: text.slice(0, 6000) } }
    },
  }
}

/** 类型 → 仓储键（lw_query_bible 列表用） */
function repotFor(t: string): string {
  switch (t) {
    case 'character': return 'lwCharacters'
    case 'location': return 'lwLocations'
    case 'item': return 'lwItems'
    case 'faction': return 'lwFactions'
    case 'skill': return 'lwSkills'
    default: return 'lwCharacters'
  }
}

/** 读工具：查共识账本（confirmed/tentative 结论，讨论的"宪法"） */
function buildQueryLedgerToolDef(): AgentToolDef {
  return {
    name: 'lw_query_ledger',
    description: '查询研讨共识账本：与用户已确认/待确认的创作共识（前提、人物要点、基调、禁忌等）。设计须与 confirmed 结论一致，不得复活 rejected 方案。',
    inputSchema: z.object({}).describe('无需参数'),
    dangerLevel: 'read',
    executeTimeoutMs: 15_000,
    autoApprovableInWorkflow: true,
    execute: async (_input, ctx) => {
      const { projectId } = lwCtxFrom(ctx)
      const state = await getRoomState(getCoreDatabaseManager(), projectId)
      const text = ledgerSnapshotText(state.ledger) || '（账本为空）'
      return { ok: true, data: { text: text.slice(0, 4000), phase: state.phase, turnNo: state.turnNo } }
    },
  }
}

// ==================== 进度工具 ====================

const taskProgressSchema = z.object({
  action: z.enum(['plan', 'start', 'done']).describe('plan=声明任务计划；start=开始某一步；done=完成某一步'),
  step: z.number().int().min(1).optional(),
  total: z.number().int().min(1).optional(),
  label: z.string().optional().describe('步骤名称/任务标题（plan 时=任务名）'),
})

function buildTaskProgressToolDef(): AgentToolDef {
  return {
    name: 'lw_task_progress',
    description:
      '上报设计任务的拆解与执行进度（只展示，不改数据）：开始复杂设计前用 action=plan 声明任务名与步骤数，之后 start/done 逐步上报。简单讨论不要调用。',
    inputSchema: taskProgressSchema,
    dangerLevel: 'read',
    executeTimeoutMs: 15_000,
    autoApprovableInWorkflow: true,
    execute: async (input, ctx) => {
      const { projectId } = lwCtxFrom(ctx)
      const raw = (input ?? {}) as { action: string; step?: number; total?: number; label?: string }
      const label = raw.label?.trim() ? ` ${raw.label.trim()}` : ''
      const msg =
        raw.action === 'plan'
          ? `任务计划：共 ${raw.total ?? '?'} 步${label}`
          : raw.action === 'start'
            ? `▶ 开始第 ${raw.step ?? '?'} 步${label}`
            : `✓ 完成第 ${raw.step ?? '?'} 步${label}`
      emitRoomEvent(projectId, { type: 'task:progress', message: msg, tool: 'lw_task_progress', status: 'ok' })
      return { ok: true, data: { status: 'ok', message: msg } }
    },
  }
}

// ==================== 写工具（只落设计包草稿） ====================

const saveCardSchema = z.object({
  taskTitle: z.string().optional().describe('任务标题（本轮首个写工具调用时建包用）'),
  card: z.object({
    kind: z.enum(['overview', 'character', 'plot', 'world', 'outline', 'chapter', 'conflict', 'custom', 'foreshadow']).describe('卡片类型'),
    title: z.string().min(1).describe('卡片标题（如「人物卡 · 林晓」）'),
    data: z.record(z.string(), z.unknown()).describe('卡片数据（与对应落库结构同构：character=人物字段，world=地点/物品/势力/技能清单…）'),
    volumeIndex: z.number().int().optional(),
    note: z.string().optional().describe('给用户的确认提示（如"新增角色，与既有 X 为师徒"）'),
  }),
})

function buildSaveCardToolDef(): AgentToolDef {
  return {
    name: 'lw_save_card',
    description:
      '把一张结构化设计卡（概要/人物/故事线/世界设定/大纲/章节/伏笔/自定义分类）加入设计包。只入草稿包，用户整体确认后才落库——不会立即生效。同类信息用一张卡汇总，不要碎片化。',
    inputSchema: saveCardSchema,
    dangerLevel: 'write',
    executeTimeoutMs: 30_000,
    autoApprovableInWorkflow: false,
    execute: async (input, ctx) => {
      const raw = (input ?? {}) as { taskTitle?: string; card?: any }
      const card = raw.card ?? {}
      const label = `卡片 · ${card.title ?? card.kind}`
      return saveDesign(ctx, { taskTitle: raw.taskTitle }, 'card', label, raw as Record<string, any>, card.note)
    },
  }
}

const saveEventSchema = z.object({
  taskTitle: z.string().optional(),
  event: z.object({
    name: z.string().min(1).describe('事件名（≤15 字）'),
    description: z.string().optional().describe('事件经过（谁/在哪/发生了什么/结果）'),
    involvedEntities: z
      .array(z.object({ type: z.string(), id: z.string().optional(), name: z.string() }))
      .optional()
      .describe('涉及实体（id 尽量用 lw_query_bible 查到的）'),
    stateBefore: z.string().optional(),
    stateAfter: z.string().optional(),
    chapterNumber: z.number().int().min(0).optional().describe('发生章节；0 或缺省=规划中尚未锚定章节'),
  }),
})

function buildSaveEventToolDef(): AgentToolDef {
  return {
    name: 'lw_save_event',
    description:
      '把一个故事事件加入设计包（如"林晓在比武大会夺魁"）。chapterNumber 缺省=规划中事件；已锚定章节的事件确认后进事件时间线，写作时会自动注入防冲突上下文。',
    inputSchema: saveEventSchema,
    dangerLevel: 'write',
    executeTimeoutMs: 30_000,
    autoApprovableInWorkflow: false,
    execute: async (input, ctx) => {
      const raw = (input ?? {}) as { taskTitle?: string; event?: any }
      const ev = raw.event ?? {}
      const label = `事件 · ${ev.name ?? ''}`
      return saveDesign(ctx, { taskTitle: raw.taskTitle }, 'event', label, ev as Record<string, any>)
    }
  }
}

const saveRelationSchema = z.object({
  taskTitle: z.string().optional(),
  relation: z.object({
    sourceName: z.string().min(1).describe('起点实体名'),
    targetType: z.enum(['character', 'location', 'item', 'faction', 'skill']).optional(),
    targetName: z.string().min(1).describe('终点实体名'),
    changeType: z.enum(['new', 'ended']).optional().describe('new=建立关系（默认）；ended=终结既有关系'),
    relationType: z.string().min(1).describe('关系短词（夫妻/师徒/结义/敌对/主仆/所属…）'),
    description: z.string().optional().describe('关系说明/依据'),
    validFromChapter: z.number().int().optional().describe('自第几章起生效（研讨期缺省=第 1 章；ended 缺省=故事开始前已终结）'),
  }),
})

function buildSaveRelationToolDef(): AgentToolDef {
  return {
    name: 'lw_save_relation',
    description:
      '把一条实体关系加入设计包（人物-人物/人物-地点/人物-物品/人物-势力…）。changeType=ended 表示终结既有关系（决裂/离婚等）。确认后进图谱时间线。',
    inputSchema: saveRelationSchema,
    dangerLevel: 'write',
    executeTimeoutMs: 30_000,
    autoApprovableInWorkflow: false,
    execute: async (input, ctx) => {
      const raw = (input ?? {}) as { taskTitle?: string; relation?: any }
      const rel = raw.relation ?? {}
      const label = `关系 · ${rel.sourceName ?? '?'} ${rel.changeType === 'ended' ? '✕' : '→'} ${rel.targetName ?? '?'}：${rel.relationType ?? ''}`
      return saveDesign(ctx, { taskTitle: raw.taskTitle }, 'relation', label, rel as Record<string, any>)
    },
  }
}

// ==================== 注册与白名单 ====================

function buildLwRoomToolDefs(): AgentToolDef[] {
  return [
    buildQueryBibleToolDef(),
    buildQueryLedgerToolDef(),
    buildSaveCardToolDef(),
    buildSaveEventToolDef(),
    buildSaveRelationToolDef(),
  ]
}

/** 懒注册（幂等）：宿主首次 sendMessage 时调用 */
export function registerLwRoomTools(registry: AgentToolRegistry): void {
  const existing = new Set(registry.listSpecs({ packId: LW_ROOM_PACK_ID }).map((s) => s.name))
  for (const def of buildLwRoomToolDefs()) {
    const namespaced = `pack:${LW_ROOM_PACK_ID}:${def.name}`
    if (existing.has(namespaced)) continue
    registry.register(def, { packId: LW_ROOM_PACK_ID })
  }
  if (!existing.has(`pack:${LW_ROOM_PACK_ID}:lw_task_progress`)) {
    registry.register(buildTaskProgressToolDef(), { packId: LW_ROOM_PACK_ID })
  }
}

/** 宿主 bindings 裸名清单（写+读+进度） */
export function lwRoomToolNames(): string[] {
  return [...buildLwRoomToolDefs().map((d) => d.name), 'lw_task_progress']
}
