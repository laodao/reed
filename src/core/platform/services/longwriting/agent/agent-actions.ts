/**
 * Agent 动作分发执行
 * @module core/platform/services/longwriting/agent/agent-actions
 *
 * 动作 → 现有生成方法（流式）→ 解析 → 落库（生成类按名称去重，只入新增）。
 * 每个动作独立 try/catch：失败不阻断后续动作，错误进执行摘要。
 *
 * v2.1（故事研讨室 M1）：落库段抽取为 `../story-persist`（纯函数、研讨室
 * adoptCard 共用），本文件保留 AI 生成调用与动作编排，落库委托之。
 */

import type {
  AgentAction,
  AgentActionSummary,
  AgentExecutionContext,
  AgentProductionState,
} from './agent.types'
import { checkActionDependency } from './agent-deps'
import {
  persistOverview,
  persistCharacters,
  persistPlots,
  persistWorld,
  persistOutlineTree,
  persistChapter,
  extractJsonObject,
  extractJsonArray,
  type StoryPersistResult,
} from '../story-persist'

// JSON 容错解析已迁至 story-persist（研讨室共用），此处保持旧导入面
export { extractJsonObject, extractJsonArray }

/** 落库结果 → 动作执行摘要（ok 带变更面/数据，skipped/error 仅文案） */
function toSummary(type: string, r: StoryPersistResult): AgentActionSummary {
  if (r.ok) {
    return { type, status: 'ok', message: r.message, changed: r.changed, data: r.data } as AgentActionSummary
  }
  return { type, status: r.skipped ? 'skipped' : 'error', message: r.message } as AgentActionSummary
}

// ==================== 动作执行 ====================

const ACTION_LABELS: Record<string, string> = {
  generate_overview: '生成故事概要',
  generate_characters: '设计人物',
  generate_world: '搭建世界观',
  generate_plots: '规划故事线',
  generate_outline: '生成故事大纲',
  write_chapter: '撰写章节',
  update_entity: '修改设定',
  delete_entity: '删除设定',
}

function makeEventId(projectId: string, type: string): string {
  return `agent-${type}-${projectId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

/**
 * 顺序执行动作（依赖不满足的标记 skipped，不执行）。
 */
export async function executeActions(
  ctx: AgentExecutionContext,
  actions: AgentAction[],
  state: AgentProductionState,
): Promise<AgentActionSummary[]> {
  const summaries: AgentActionSummary[] = []
  for (const action of actions) {
    if (!action?.type) continue

    // 依赖检查：缺失前置 → skipped（提示交给总结调用解释）
    const dep = checkActionDependency(action.type, state)
    if (!dep.ok) {
      const s: AgentActionSummary = {
        type: action.type,
        status: 'skipped',
        message: `「${ACTION_LABELS[action.type] || action.type}」暂缓：缺少${dep.missing.join('、')}`,
      }
      summaries.push(s)
      ctx.emit({ type: 'action:done', summary: s })
      continue
    }

    ctx.emit({
      type: 'action:start',
      actionType: action.type,
      label: ACTION_LABELS[action.type] || action.type,
    })

    let summary: AgentActionSummary
    try {
      summary = await dispatchAction(ctx, action)
    } catch (e: any) {
      summary = {
        type: action.type,
        status: 'error',
        message: `「${ACTION_LABELS[action.type] || action.type}」执行失败：${e.message || '未知错误'}`,
        error: e.message || '未知错误',
      }
    }
    summaries.push(summary)
    ctx.emit({ type: 'action:done', summary })
  }
  return summaries
}

/** 按类型分发到具体执行函数 */
async function dispatchAction(ctx: AgentExecutionContext, action: AgentAction): Promise<AgentActionSummary> {
  switch (action.type) {
    case 'generate_overview': return executeGenerateOverview(ctx, action)
    case 'generate_characters': return executeGenerateCharacters(ctx, action)
    case 'generate_world': return executeGenerateWorld(ctx)
    case 'generate_plots': return executeGeneratePlots(ctx)
    case 'generate_outline': return executeGenerateOutline(ctx, action)
    case 'write_chapter': return executeWriteChapter(ctx, action)
    case 'update_entity': return executeUpdateEntity(ctx, action)
    case 'delete_entity': return executeDeleteEntity(ctx, action)
    default:
      return { type: action.type, status: 'error', message: `未知动作类型：${action.type}` }
  }
}

// ==================== 具体动作（生成 + 委托 story-persist 落库） ====================

async function executeGenerateOverview(ctx: AgentExecutionContext, action: AgentAction): Promise<AgentActionSummary> {
  const { db, ai, projectId, providerConfigId, modelId } = ctx
  const input = action.params?.input?.trim() || ''
  if (!input) {
    return { type: 'generate_overview', status: 'error', message: 'generate_overview 需要 params.input（用户的想法/要求）' }
  }

  const eventId = makeEventId(projectId, 'overview')
  const resp = await ai.generateStoryOverview(eventId, projectId, input, providerConfigId, modelId)
  if (!resp.success || !resp.data) {
    return { type: 'generate_overview', status: 'error', message: resp.error || '故事概要生成失败' }
  }

  return toSummary('generate_overview', await persistOverview(db, projectId, resp.data, input))
}

async function executeGenerateCharacters(ctx: AgentExecutionContext, action: AgentAction): Promise<AgentActionSummary> {
  const { db, ai, projectId, providerConfigId, modelId } = ctx
  const requirements = action.params?.requirements

  const eventId = makeEventId(projectId, 'characters')
  const resp = await ai.generateCharacters(eventId, projectId, providerConfigId, modelId, requirements)
  if (!resp.success) {
    return { type: 'generate_characters', status: 'error', message: resp.error || '人物生成失败' }
  }

  const list = Array.isArray(resp.data) ? resp.data : extractJsonArray(resp.data)
  return toSummary('generate_characters', await persistCharacters(db, projectId, list || []))
}

async function executeGenerateWorld(ctx: AgentExecutionContext): Promise<AgentActionSummary> {
  const { db, ai, projectId, providerConfigId, modelId } = ctx

  // 背景（无背景行时先建空行，再润色时代描述）——生成段，非落库；
  // 仅背景成功时也算 ok（等价原动作"已生成世界设定：时代背景"分支，评审 P2-7）
  let bgDone = false
  try {
    const bg = await db?.lwBackgrounds?.getByProjectId(projectId)
    if (!bg) {
      await db?.lwBackgrounds?.create(projectId)
    }
    const bgRow = await db?.lwBackgrounds?.getByProjectId(projectId)
    if (bgRow && !bgRow.eraDescription) {
      const resp = await ai.polishBackground(
        makeEventId(projectId, 'bg'),
        projectId,
        'eraDescription',
        'ancient',
        '根据故事概要自动生成时代背景描述。',
        providerConfigId,
        modelId,
      )
      const content = resp?.data?.content
      if (content) {
        await db?.lwBackgrounds?.update(bgRow.id, { eraDescription: content })
        bgDone = true
      }
    }
  } catch (e) {
    console.error('[AgentAction] 背景生成失败:', e)
  }

  // 四类设定生成
  let locations: any[] = []
  let factions: any[] = []
  let skills: any[] = []
  let items: any[] = []
  try {
    const resp = await ai.generateLocations(makeEventId(projectId, 'locations'), projectId, providerConfigId, modelId)
    locations = (Array.isArray(resp?.data) ? resp.data : extractJsonArray(resp?.data)) || []
  } catch (e) {
    console.error('[AgentAction] 地点生成失败:', e)
  }
  try {
    const resp = await ai.generateFactions(makeEventId(projectId, 'factions'), projectId, providerConfigId, modelId)
    factions = (Array.isArray(resp?.data) ? resp.data : extractJsonArray(resp?.data)) || []
  } catch (e) {
    console.error('[AgentAction] 势力生成失败:', e)
  }
  try {
    const resp = await ai.generateSkillsItems(makeEventId(projectId, 'skillsitems'), projectId, providerConfigId, modelId)
    const data = extractJsonObject(resp?.data) ?? (typeof resp?.data === 'object' ? resp.data : null)
    skills = Array.isArray(data?.skills) ? data.skills : []
    items = Array.isArray(data?.items) ? data.items : []
  } catch (e) {
    console.error('[AgentAction] 技能物品生成失败:', e)
  }

  const r = await persistWorld(db, projectId, { locations, factions, skills, items })
  if (!r.ok && bgDone) {
    return { type: 'generate_world', status: 'ok', message: '已生成世界设定：时代背景', changed: ['world'] } as AgentActionSummary
  }
  return toSummary('generate_world', r)
}

async function executeGeneratePlots(ctx: AgentExecutionContext): Promise<AgentActionSummary> {
  const { db, ai, projectId, providerConfigId, modelId } = ctx

  const eventId = makeEventId(projectId, 'plots')
  const resp = await ai.generatePlots(eventId, projectId, providerConfigId, modelId)
  if (!resp.success) {
    return { type: 'generate_plots', status: 'error', message: resp.error || '故事线生成失败' }
  }
  const list = Array.isArray(resp.data) ? resp.data : extractJsonArray(resp.data)
  return toSummary('generate_plots', await persistPlots(db, projectId, list || []))
}

async function executeGenerateOutline(ctx: AgentExecutionContext, action: AgentAction): Promise<AgentActionSummary> {
  const { db, ai, projectId, providerConfigId, modelId } = ctx

  // 已有大纲：不自动覆盖（避免重复堆积），提示用户
  const treeNow = await db?.lwOutlines?.getTreeByProjectId(projectId) || []
  if (treeNow.length > 0) {
    return {
      type: 'generate_outline',
      status: 'skipped',
      message: `项目已有大纲（${treeNow.length} 个节点）。如需重新生成，请先让我删除旧大纲。`,
    }
  }

  const level = action.params?.structureLevel ?? 3
  const eventId = makeEventId(projectId, 'outline')
  const resp = await ai.generateOutlineStory(eventId, projectId, providerConfigId, modelId, level)
  if (!resp.success) {
    return { type: 'generate_outline', status: 'error', message: resp.error || '大纲生成失败' }
  }
  const tree = Array.isArray(resp.data) ? resp.data : []
  if (tree.length === 0) {
    return { type: 'generate_outline', status: 'error', message: 'AI 未返回有效的大纲数据' }
  }

  const created = await persistOutlineTree(db, projectId, tree, level)

  return {
    type: 'generate_outline',
    status: 'ok',
    message: `已生成大纲（共 ${created} 个节点，${level} 级结构）`,
    changed: ['outline'],
    data: { structureLevel: level, nodes: created },
  }
}

async function executeWriteChapter(ctx: AgentExecutionContext, action: AgentAction): Promise<AgentActionSummary> {
  const { db, ai, projectId, providerConfigId, modelId } = ctx

  // 选目标大纲节点：params.outlineId 或引擎自动选下一篇未写叶子
  let outlineId = action.params?.outlineId
  if (!outlineId) {
    const tree = await db?.lwOutlines?.getTreeByProjectId(projectId) || []
    const leaves = (tree || [])
      .filter((n: any) => n.nodeType === 'chapter' || n.nodeType === 'section')
      .sort((a: any, b: any) => a.orderIndex - b.orderIndex)
    const chaptersMap = leaves.length > 0 ? (await db?.lwChapters?.getByOutlineIds(leaves.map((l: any) => l.id))) || new Map() : new Map()
    const next = leaves.find((l: any) => !chaptersMap.has(l.id))
    if (!next) {
      return { type: 'write_chapter', status: 'error', message: '没有待写的章节（请先生成大纲，或指定章节重写）' }
    }
    outlineId = next.id
  }

  // 生成前快速校验（等价原动作顺序：无效 outlineId 不白打一次生成，评审 P2-8）
  const outline = await db?.lwOutlines?.getById(outlineId)
  if (!outline) {
    return { type: 'write_chapter', status: 'error', message: '大纲节点不存在（outlineId 无效）' }
  }

  const targetWords = action.params?.targetWords
  const style = action.params?.style
  const extraPrompt = action.params?.extraPrompt
  const eventId = makeEventId(projectId, 'chapter')
  const resp = await ai.generateChapter(eventId, projectId, outlineId, targetWords, providerConfigId, modelId, style, extraPrompt)
  if (!resp.success) {
    return { type: 'write_chapter', status: 'error', message: resp.error || '章节生成失败' }
  }
  const content = typeof resp.data === 'string' ? resp.data : resp.data?.content || ''

  return toSummary('write_chapter', await persistChapter(db, projectId, { outlineId, content, providerConfigId, modelId }, ai))
}

/**
 * 评审 #58：名称 → ID 解析。plot/outline 不在图谱实体类型（GraphEntityType）内，
 * GraphService.resolveEntities 对它们恒失败——这里按仓库字段直接匹配
 * （plot 用 title，outline 用 name）；同名取第一个并告警。
 */
async function resolveNameToId(db: any, projectId: string, type: string, name: string): Promise<string | null> {
  if (type === 'plot' || type === 'outline') {
    const repo = entityRepo(db, type)
    if (!repo?.getByProjectId) return null
    const list = (await repo.getByProjectId(projectId)) as Array<Record<string, unknown>>
    const key = type === 'plot' ? 'title' : 'name'
    const target = name.trim()
    const hits = list.filter(x => typeof x[key] === 'string' && (x[key] as string).trim() === target)
    if (hits.length === 0) return null
    if (hits.length > 1) {
      console.warn(`[AgentAction] 「${ENTITY_TYPE_LABELS[type] || type}」存在 ${hits.length} 个同名实体「${target}」，取第一个（${hits[0].id}）`)
    }
    return String(hits[0].id)
  }
  const { GraphService } = await import('../graph/graph.service')
  const [hit] = await new GraphService(db).resolveEntities(projectId, [{ type, name }] as any)
  return hit?.resolved && hit.id ? hit.id : null
}

/** 实体类型 → 落库仓库（overview 特殊处理） */
function entityRepo(db: any, type: string): any {
  const map: Record<string, any> = {
    character: db?.lwCharacters,
    location: db?.lwLocations,
    faction: db?.lwFactions,
    skill: db?.lwSkills,
    item: db?.lwItems,
    plot: db?.lwPlots,
    outline: db?.lwOutlines,
    overview: db?.lwStoryOverviews,
  }
  return map[type]
}

const ENTITY_TYPE_LABELS: Record<string, string> = {
  character: '人物', location: '地点', faction: '势力', skill: '技能', item: '物品',
  plot: '故事线', outline: '大纲节点', overview: '故事概要',
}

async function executeUpdateEntity(ctx: AgentExecutionContext, action: AgentAction): Promise<AgentActionSummary> {
  const { db, projectId } = ctx
  const params = action.params || {}
  const type = params.type
  const id = params.id
  const patch = params.patch

  if (!type || !patch || typeof patch !== 'object') {
    return { type: 'update_entity', status: 'error', message: 'update_entity 需要 type/patch 参数（可传 id 或 name 定位）' }
  }

  const repo = entityRepo(db, type)
  if (!repo) {
    return { type: 'update_entity', status: 'error', message: `不支持的实体类型：${type}` }
  }

  // 名称 → ID 解析：决策上下文只暴露实体**名称**（stateToSummary 不输出内部 id），
  // 用户说"把苏婉儿的性格改成…"时 AI 只能传名称——旧实现直接按 params.id 查 → 必失败。
  let targetId = id
  if (type === 'overview') {
    const overview = await repo.getByProjectId(projectId)
    if (!overview) return { type: 'update_entity', status: 'error', message: '故事概要不存在' }
    targetId = overview.id
  } else if (!targetId || !(await repo.getById(targetId))) {
    const name = params.name
    if (name) {
      try {
        const resolved = await resolveNameToId(db, projectId, type, String(name))
        if (resolved) targetId = resolved
      } catch (e) {
        console.error('[AgentAction] 名称解析失败（继续按 id 处理）:', e)
      }
    }
    if (!targetId) {
      return { type: 'update_entity', status: 'error', message: `${ENTITY_TYPE_LABELS[type] || type}不存在：未找到 id「${id ?? ''}」或名称「${params.name ?? ''}」对应的实体` }
    }
  }

  // M8 越权加固：id 直传路径必须校验实体归属当前项目（与 delete_entity 同款——防跨项目 id 改写）
  if (targetId && type !== 'overview') {
    const owned = await repo.getById(targetId)
    if (owned && owned.projectId !== projectId) {
      return { type: 'update_entity', status: 'error', message: `${ENTITY_TYPE_LABELS[type] || type}不存在于当前项目（id 越界已拒绝）` }
    }
  }

  const updated = await repo.update(targetId, patch)
  if (!updated) {
    return { type: 'update_entity', status: 'error', message: `${ENTITY_TYPE_LABELS[type] || type}不存在或更新失败` }
  }

  return {
    type: 'update_entity',
    status: 'ok',
    message: `已修改${ENTITY_TYPE_LABELS[type] || type}（${updated.name || targetId}）`,
    changed: [type === 'overview' ? 'overview' : type === 'outline' ? 'outline' : type === 'plot' ? 'plots' : type === 'character' ? 'characters' : 'world'],
    data: { type, id: updated.id, name: updated.name },
  }
}

async function executeDeleteEntity(ctx: AgentExecutionContext, action: AgentAction): Promise<AgentActionSummary> {
  const { db, projectId } = ctx
  const params = action.params || {}
  const type = params.type
  const id = params.id

  if (!type) {
    return { type: 'delete_entity', status: 'error', message: 'delete_entity 需要 type 参数（可传 id 或 name 定位）' }
  }

  const repo = entityRepo(db, type)
  if (!repo) {
    return { type: 'delete_entity', status: 'error', message: `不支持的实体类型：${type}` }
  }

  // 名称 → ID 解析（同 update_entity：决策上下文只暴露名称）
  let targetId = id
  if (type !== 'overview' && (!targetId || !(await repo.getById(targetId)))) {
    const name = params.name
    if (name) {
      try {
        const resolved = await resolveNameToId(db, projectId, type, String(name))
        if (resolved) targetId = resolved
      } catch (e) {
        console.error('[AgentAction] 名称解析失败（继续按 id 处理）:', e)
      }
    }
    if (!targetId) {
      return { type: 'delete_entity', status: 'error', message: `${ENTITY_TYPE_LABELS[type] || type}不存在：未找到 id「${id ?? ''}」或名称「${params.name ?? ''}」对应的实体` }
    }
  }

  // M8 越权加固：id 直传路径必须校验实体归属当前项目（防跨项目 id 直删）
  if (targetId && type !== 'overview') {
    const owned = await repo.getById(targetId)
    if (owned && owned.projectId !== projectId) {
      return { type: 'delete_entity', status: 'error', message: `${ENTITY_TYPE_LABELS[type] || type}不存在于当前项目（id 越界已拒绝）` }
    }
  }

  const before = await repo.getById(targetId)
  const ok = await repo.delete(targetId)
  if (!ok) {
    return { type: 'delete_entity', status: 'error', message: `${ENTITY_TYPE_LABELS[type] || type}不存在或删除失败` }
  }

  // 级联清理图谱边（评审 #63：faction/skill 与 handler 路径补齐，不再残留悬空边）
  if (['character', 'location', 'item', 'faction', 'skill'].includes(type)) {
    try {
      await db?.lwGraphEdges?.deleteByEntity(projectId, type, targetId)
    } catch (e) {
      console.error('[AgentAction] 清理图谱边失败（不影响删除）:', e)
    }
  }

  return {
    type: 'delete_entity',
    status: 'ok',
    message: `已删除${ENTITY_TYPE_LABELS[type] || type}：${before?.name || targetId}`,
    changed: [type === 'character' ? 'characters' : type === 'location' || type === 'faction' || type === 'skill' || type === 'item' ? 'world' : type === 'plot' ? 'plots' : type === 'outline' ? 'outline' : 'overview'],
  }
}
