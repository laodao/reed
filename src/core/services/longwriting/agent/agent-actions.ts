/**
 * Agent 动作分发执行
 * @module core/services/longwriting/agent/agent-actions
 *
 * 动作 → 现有生成方法（流式）→ 解析 → 落库（生成类按名称去重，只入新增）。
 * 每个动作独立 try/catch：失败不阻断后续动作，错误进执行摘要。
 */

import type {
  AgentAction,
  AgentActionSummary,
  AgentExecutionContext,
  AgentProductionState,
} from './agent.types'
import { checkActionDependency } from './agent-deps'

// ==================== JSON 容错解析 ====================

/** 从 AI 输出提取 JSON 对象（容忍 markdown 代码块/前后杂文） */
export function extractJsonObject(text: string): any | null {
  if (!text) return null
  let s = text.trim()
  s = s.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
  const first = s.indexOf('{')
  const last = s.lastIndexOf('}')
  if (first !== -1 && last > first) {
    try {
      return JSON.parse(s.substring(first, last + 1))
    } catch {
      /* 继续尝试数组提取 */
    }
  }
  return null
}

/** 从 AI 输出提取 JSON 数组 */
export function extractJsonArray(text: string): any[] | null {
  if (!text) return null
  let s = text.trim()
  s = s.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
  const first = s.indexOf('[')
  const last = s.lastIndexOf(']')
  if (first !== -1 && last > first) {
    try {
      const v = JSON.parse(s.substring(first, last + 1))
      return Array.isArray(v) ? v : null
    } catch {
      return null
    }
  }
  return null
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

// ==================== 具体动作 ====================

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
  const d = resp.data

  let overview = await db?.lwStoryOverviews?.getByProjectId(projectId)
  const patch = {
    title: d.title || overview?.title || '未命名',
    storyType: d.storyType || overview?.storyType || null,
    summary: d.summary || overview?.summary || '',
    coreConflict: d.coreConflict || overview?.coreConflict || '',
    coreIdea: input || overview?.coreIdea || null,
    keyCharacters: d.keyCharacters || [],
    keyLocations: d.keyLocations || [],
    estimatedChapters: d.estimatedChapters ?? overview?.estimatedChapters ?? null,
    isSaved: true,
  }
  if (overview) {
    await db.lwStoryOverviews.update(overview.id, patch)
  } else {
    // overview 行缺失（历史遗留/异常库）：先建行再更新——否则 AI 生成结果被丢弃，
    // 却仍返回 status:'ok'（假成功反馈，前端按 changed 刷新拿到的是空数据）
    overview = await db.lwStoryOverviews.create(projectId)
    await db.lwStoryOverviews.update(overview.id, patch)
  }

  const title = d.title || '未命名'
  return {
    type: 'generate_overview',
    status: 'ok',
    message: `已生成故事概要「${title}」（预估 ${d.estimatedChapters || '?'} 章）`,
    changed: ['overview'],
    data: { title, estimatedChapters: d.estimatedChapters },
  }
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
  if (!list || list.length === 0) {
    return { type: 'generate_characters', status: 'error', message: 'AI 未返回有效的人物数据' }
  }

  // 按名称去重：只入库新增（支持"再补一个女二号"这类增量需求）
  const existing = await db?.lwCharacters?.getByProjectId(projectId) || []
  const existingNames = new Set(existing.map((c: any) => c.name))
  const newChars = list.filter((c: any) => c?.name?.trim() && !existingNames.has(c.name))

  if (newChars.length === 0) {
    return { type: 'generate_characters', status: 'skipped', message: '没有新人物需要添加（AI 返回的人物都已存在）' }
  }

  const created: any[] = []
  for (const c of newChars) {
    const saved = await db?.lwCharacters?.create({
      projectId,
      name: c.name.trim(),
      gender: c.gender || 'other',
      age: c.age ?? 0,
      height: c.height,
      weight: c.weight,
      race: c.race,
      occupation: c.occupation,
      position: c.position,
      rolePosition: c.rolePosition,
      appearance: c.appearance,
      background: c.background,
      personality: c.personality,
      abilities: c.abilities,
      majorEvents: c.majorEvents,
    })
    if (saved) created.push(saved)
  }

  // 图谱动态更新：角色间关系（AI 输出 relations）→ 幂等落库
  await syncRelationsFromInput(db, projectId, newChars, (c: any) =>
    (c.relations || []).map((rel: any) => ({
      sourceType: 'character',
      sourceName: c.name.trim(),
      targetType: 'character',
      targetName: String(rel.targetName || '').trim(),
      relationType: rel.relationType || '关联',
      description: rel.description || '',
    })),
  )

  return {
    type: 'generate_characters',
    status: 'ok',
    message: `新增人物：${created.map((c: any) => c.name).join('、')}`,
    changed: ['characters'],
    data: created.map((c: any) => ({ id: c.id, name: c.name, rolePosition: c.rolePosition })),
  }
}

async function executeGenerateWorld(ctx: AgentExecutionContext): Promise<AgentActionSummary> {
  const { db, ai, projectId, providerConfigId, modelId } = ctx
  const done: string[] = []
  const changed: any[] = ['world']

  // 1. 背景（无背景行时先建空行，再润色时代描述）
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
        done.push('时代背景')
      }
    } else if (bgRow) {
      done.push('时代背景')
    }
  } catch (e) {
    console.error('[AgentAction] 背景生成失败:', e)
  }

  // 2. 地点
  try {
    const resp = await ai.generateLocations(makeEventId(projectId, 'locations'), projectId, providerConfigId, modelId)
    const list = Array.isArray(resp?.data) ? resp.data : extractJsonArray(resp?.data)
    if (list && list.length > 0) {
      const existing = await db?.lwLocations?.getByProjectId(projectId) || []
      const names = new Set(existing.map((l: any) => l.name))
      const fresh = list.filter((l: any) => l?.name?.trim() && !names.has(l.name))
      for (const l of fresh) {
        await db?.lwLocations?.create({
          projectId,
          name: l.name.trim(),
          type: l.type || 'other',
          importance: l.importance || 'auxiliary',
          description: l.description || '',
          mapId: l.suggestedMapId,
        })
      }
      if (fresh.length > 0) done.push(`地点${fresh.length}个`)
    }
  } catch (e) {
    console.error('[AgentAction] 地点生成失败:', e)
  }

  // 3. 势力
  try {
    const resp = await ai.generateFactions(makeEventId(projectId, 'factions'), projectId, providerConfigId, modelId)
    const list = Array.isArray(resp?.data) ? resp.data : extractJsonArray(resp?.data)
    if (list && list.length > 0) {
      const existing = await db?.lwFactions?.getByProjectId(projectId) || []
      const names = new Set(existing.map((f: any) => f.name))
      const fresh = list.filter((f: any) => f?.name?.trim() && !names.has(f.name))
      for (const f of fresh) {
        await db?.lwFactions?.create({
          projectId,
          factionType: f.factionType || 'other',
          name: f.name.trim(),
          description: f.description || '',
        })
      }
      if (fresh.length > 0) done.push(`势力${fresh.length}个`)
    }
  } catch (e) {
    console.error('[AgentAction] 势力生成失败:', e)
  }

  // 4. 技能 + 物品
  try {
    const resp = await ai.generateSkillsItems(makeEventId(projectId, 'skillsitems'), projectId, providerConfigId, modelId)
    const data = extractJsonObject(resp?.data) ?? (typeof resp?.data === 'object' ? resp.data : null)
    const skills = Array.isArray(data?.skills) ? data.skills : []
    const items = Array.isArray(data?.items) ? data.items : []
    if (skills.length > 0) {
      const existing = await db?.lwSkills?.getByProjectId(projectId) || []
      const names = new Set(existing.map((s: any) => s.name))
      const fresh = skills.filter((s: any) => s?.name?.trim() && !names.has(s.name))
      for (const s of fresh) {
        await db?.lwSkills?.create({
          projectId,
          name: s.name.trim(),
          type: s.type || 'ability',
          level: s.level || 'beginner',
          description: s.description || '',
          system: s.system || '',
          characterIds: [],
        })
      }
      if (fresh.length > 0) done.push(`技能${fresh.length}个`)
    }
    if (items.length > 0) {
      const existing = await db?.lwItems?.getByProjectId(projectId) || []
      const names = new Set(existing.map((i: any) => i.name))
      const fresh = items.filter((i: any) => i?.name?.trim() && !names.has(i.name))
      for (const i of fresh) {
        await db?.lwItems?.create({
          projectId,
          name: i.name.trim(),
          type: i.type || 'artifact',
          level: i.level || 'common',
          description: i.description || '',
        })
      }
      if (fresh.length > 0) done.push(`物品${fresh.length}个`)
    }
  } catch (e) {
    console.error('[AgentAction] 技能物品生成失败:', e)
  }

  if (done.length === 0) {
    return { type: 'generate_world', status: 'error', message: '世界设定生成失败：AI 未返回有效数据' }
  }
  return {
    type: 'generate_world',
    status: 'ok',
    message: `已生成世界设定：${done.join('、')}`,
    changed,
  }
}

async function executeGeneratePlots(ctx: AgentExecutionContext): Promise<AgentActionSummary> {
  const { db, ai, projectId, providerConfigId, modelId } = ctx

  const eventId = makeEventId(projectId, 'plots')
  const resp = await ai.generatePlots(eventId, projectId, providerConfigId, modelId)
  if (!resp.success) {
    return { type: 'generate_plots', status: 'error', message: resp.error || '故事线生成失败' }
  }
  const list = Array.isArray(resp.data) ? resp.data : extractJsonArray(resp.data)
  if (!list || list.length === 0) {
    return { type: 'generate_plots', status: 'error', message: 'AI 未返回有效的故事线数据' }
  }

  const existing = await db?.lwPlots?.getByProjectId(projectId) || []
  const existingTitles = new Set(existing.map((p: any) => p.title))
  const newPlots = list.filter((p: any) => p?.title?.trim() && !existingTitles.has(p.title))

  if (newPlots.length === 0) {
    return { type: 'generate_plots', status: 'skipped', message: '没有新的故事线需要添加（都已存在）' }
  }

  await db?.lwPlots?.batchCreate(
    projectId,
    newPlots.map((p: any) => ({
      title: p.title.trim(),
      summary: p.summary || '',
      involvedCharacters: p.involvedCharacters || [],
    })),
  )

  // 图谱动态更新：情节中体现的实体关系 → 幂等落库
  await syncRelationsFromInput(db, projectId, newPlots, (p: any) =>
    (p.entityRelations || []).map((rel: any) => ({
      sourceType: rel.sourceType || 'character',
      sourceName: String(rel.sourceName || '').trim(),
      targetType: rel.targetType || 'character',
      targetName: String(rel.targetName || '').trim(),
      relationType: rel.relationType || '关联',
      description: rel.description || '',
    })),
  )

  return {
    type: 'generate_plots',
    status: 'ok',
    message: `新增故事线 ${newPlots.length} 条：${newPlots.map((p: any) => p.title).join('、')}`,
    changed: ['plots'],
    data: newPlots.map((p: any) => ({ title: p.title })),
  }
}

/**
 * 从生成结果提取实体关系并幂等落库（图谱动态更新）。
 * 提取器失败/无关系时不抛错（不阻断主流程）。
 */
async function syncRelationsFromInput(
  db: any,
  projectId: string,
  items: any[],
  extractor: (item: any) => Array<{
    sourceType: string
    sourceName: string
    targetType: string
    targetName: string
    relationType: string
    description?: string
  }>,
): Promise<void> {
  if (!db?.lwGraphEdges || !Array.isArray(items) || items.length === 0) return
  try {
    const relations: any[] = []
    for (const item of items) {
      for (const rel of extractor(item)) {
        const src = rel.sourceName.trim()
        const tgt = rel.targetName.trim()
        if (!src || !tgt || src === tgt) continue
        relations.push({
          sourceType: rel.sourceType || 'character',
          sourceName: src,
          targetType: rel.targetType || 'character',
          targetName: tgt,
          relationType: rel.relationType || '关联',
          description: rel.description || '',
        })
      }
    }
    if (relations.length === 0) return
    const { GraphService } = await import('../graph/graph.service')
    await new GraphService(db).syncEntityRelations(projectId, relations)
  } catch (e) {
    console.error('[AgentAction] 实体关系同步失败（不影响主流程）:', e)
  }
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

  const created = await createOutlineTree(db, projectId, tree, level)

  return {
    type: 'generate_outline',
    status: 'ok',
    message: `已生成大纲（共 ${created} 个节点，${level} 级结构）`,
    changed: ['outline'],
    data: { structureLevel: level, nodes: created },
  }
}

/** 大纲建树（复刻 OutlineStage 前端逻辑：卷→章→节 / 章→节 / 章） */
async function createOutlineTree(db: any, projectId: string, tree: any[], level: number): Promise<number> {
  let count = 0
  if (level === 3) {
    for (const vol of tree) {
      const v = await db?.lwOutlines?.create({
        projectId, name: vol.name, nodeType: 'volume',
        summary: vol.summary || '', estimatedWords: vol.estimatedWords || 0,
      })
      if (!v) continue
      count++
      for (const ch of vol.chapters || []) {
        const c = await db?.lwOutlines?.create({
          projectId, parentId: v.id, name: ch.name, nodeType: 'chapter',
          summary: ch.summary || '', estimatedWords: ch.estimatedWords || 0,
        })
        if (!c) continue
        count++
        for (const sec of ch.sections || []) {
          await db?.lwOutlines?.create({
            projectId, parentId: c.id, name: sec.name, nodeType: 'section',
            summary: sec.summary || '', estimatedWords: sec.estimatedWords || 0,
          })
          count++
        }
      }
    }
  } else if (level === 2) {
    for (const ch of tree) {
      const c = await db?.lwOutlines?.create({
        projectId, name: ch.name, nodeType: 'chapter',
        summary: ch.summary || '', estimatedWords: ch.estimatedWords || 0,
      })
      if (!c) continue
      count++
      for (const sec of ch.sections || []) {
        await db?.lwOutlines?.create({
          projectId, parentId: c.id, name: sec.name, nodeType: 'section',
          summary: sec.summary || '', estimatedWords: sec.estimatedWords || 0,
        })
        count++
      }
    }
  } else {
    for (const ch of tree) {
      await db?.lwOutlines?.create({
        projectId, name: ch.name, nodeType: 'chapter',
        summary: ch.summary || '', estimatedWords: ch.estimatedWords || 0,
      })
      count++
    }
  }
  return count
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
  if (!content.trim()) {
    return { type: 'write_chapter', status: 'error', message: 'AI 未返回章节正文' }
  }

  // 落库（复刻 saveChapter 语义：create/updateContent + createVersion）
  const existingChapter = await db?.lwChapters?.getByOutlineId(outlineId)
  let chapter = existingChapter
  if (!chapter) {
    chapter = await db?.lwChapters?.create(outlineId, content)
  } else {
    chapter = await db?.lwChapters?.updateContent(chapter.id, content)
  }
  if (chapter) {
    await db?.lwChapters?.createVersion(chapter.id, content, 'manual')
  }

  // 图谱流水线：事件提取 → 状态切片 → 自动建边 → 章节状态摘要（分步容错，失败不阻断）
  try {
    const { ChapterGraphProcessor } = await import('../graph/chapter-graph.processor')
    const processor = new ChapterGraphProcessor(db, ai)
    const tree = await db?.lwOutlines?.getTreeByProjectId(projectId) || []
    const leaves = (tree || [])
      .filter((n: any) => n.nodeType === 'chapter' || n.nodeType === 'section')
      .sort((a: any, b: any) => a.orderIndex - b.orderIndex)
    const chapterNumber = leaves.findIndex((l: any) => l.id === outlineId) + 1 || 1
    await processor.process({
      projectId,
      outlineId,
      chapterContent: content,
      chapterNumber,
      providerConfigId,
      modelId,
    })
  } catch (e) {
    console.error('[AgentAction] 章节图谱流水线失败（正文已保存）:', e)
  }

  const words = content.length
  return {
    type: 'write_chapter',
    status: 'ok',
    message: `已写好「${outline.name}」（约 ${Math.round(words / 100) / 10} 千字）`,
    changed: ['chapters', 'outline'],
    data: { outlineId, name: outline.name, words },
  }
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
