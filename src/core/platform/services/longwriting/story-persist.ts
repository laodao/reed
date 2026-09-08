/**
 * 故事结构化成果落库（故事研讨室 v2.1 M1：从 agent-actions.ts 抽取的落库段）
 * @module core/platform/services/longwriting/story-persist
 *
 * 纯落库函数：输入 = 解析后的结构化数据（整理器卡片与旧 agent 生成结果同构），
 * 内部不做任何 AI 调用（章节图谱流水线例外，经参数注入 ai）。旧 agent-actions
 * 与研讨室 adoptCard 共用本模块——「复用经过测试的持久化逻辑，与旧对话 UI 无关」。
 * 落库行为与原内联实现逐字段等价（对照单测 + 旧 workflow spec 回归双保险）；
 * 两处已登记的刻意差异：回执 data 形状（characters/plots 包一层对象键）与
 * write_chapter 的 outlineId 校验时机（提前到生成前）——消费方均已核实不受影响。
 */

import { createLogger } from '@core/utils/logger'

const logger = createLogger('StoryPersist')

/** 落库结果（研讨室卡片采纳回执 / 旧动作摘要的共同底座） */
export interface StoryPersistResult {
  ok: boolean
  /** ok=false 时区分「全部已存在（跳过）」与「数据无效（失败）」 */
  skipped?: boolean
  message: string
  changed: string[]
  data?: Record<string, unknown>
}

// ==================== JSON 容错解析（原 agent-actions 同款，迁出共用） ====================

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

// ==================== 概要 ====================

/**
 * 概要 upsert（原 executeGenerateOverview 落库段）。
 * data 字段缺省时回落库内现有值；overview 行缺失时先建行再更新（防假成功）。
 */
export async function persistOverview(
  db: any,
  projectId: string,
  data: {
    title?: string
    storyType?: string | null
    summary?: string
    coreConflict?: string
    keyCharacters?: any[]
    keyLocations?: any[]
    estimatedChapters?: number | null
  },
  input?: string,
): Promise<StoryPersistResult> {
  let overview = await db?.lwStoryOverviews?.getByProjectId(projectId)
  const patch = {
    title: data.title || overview?.title || '未命名',
    storyType: data.storyType || overview?.storyType || null,
    summary: data.summary || overview?.summary || '',
    coreConflict: data.coreConflict || overview?.coreConflict || '',
    coreIdea: input || overview?.coreIdea || null,
    keyCharacters: data.keyCharacters || [],
    keyLocations: data.keyLocations || [],
    estimatedChapters: data.estimatedChapters ?? overview?.estimatedChapters ?? null,
    isSaved: true,
  }
  if (overview) {
    await db.lwStoryOverviews.update(overview.id, patch)
  } else {
    // overview 行缺失（历史遗留/异常库）：先建行再更新——否则结构化成果被丢弃，
    // 却仍返回成功（假成功反馈，前端按 changed 刷新拿到的是空数据）
    overview = await db.lwStoryOverviews.create(projectId)
    await db.lwStoryOverviews.update(overview.id, patch)
  }

  const title = patch.title
  return {
    ok: true,
    message: `已保存故事概要「${title}」（预估 ${data.estimatedChapters || '?'} 章）`,
    changed: ['overview'],
    data: { title, estimatedChapters: data.estimatedChapters },
  }
}

// ==================== 实体关系同步（图谱动态更新，幂等） ====================

export interface EntityRelationInput {
  sourceType: string
  sourceName: string
  targetType: string
  targetName: string
  relationType: string
  description?: string
}

/**
 * 从落库条目提取实体关系并幂等落库。
 * 提取器失败/无关系时不抛错（不阻断主流程）。
 */
export async function syncRelationsFromInput(
  db: any,
  projectId: string,
  items: any[],
  extractor: (item: any) => EntityRelationInput[],
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
    const { GraphService } = await import('./graph/graph.service')
    await new GraphService(db).syncEntityRelations(projectId, relations)
  } catch (e) {
    logger.warn('实体关系同步失败（不影响主流程）', e)
  }
}

// ==================== 人物 ====================

/**
 * 人物入库（原 executeGenerateCharacters 落库段）：按名称去重只入新增，
 * AI 输出 relations → 人物间关系边。
 */
export async function persistCharacters(db: any, projectId: string, list: any[]): Promise<StoryPersistResult> {
  const chars = Array.isArray(list) ? list : []
  if (chars.length === 0) {
    return { ok: false, message: 'AI 未返回有效的人物数据', changed: [] }
  }

  const existing = (await db?.lwCharacters?.getByProjectId(projectId)) || []
  const existingNames = new Set(existing.map((c: any) => c.name))
  const newChars = chars.filter((c: any) => c?.name?.trim() && !existingNames.has(c.name))

  if (newChars.length === 0) {
    return { ok: false, skipped: true, message: '没有新人物需要添加（结构化数据中的人物都已存在）', changed: [] }
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
    ok: true,
    message: `新增人物：${created.map((c: any) => c.name).join('、')}`,
    changed: ['characters'],
    data: { characters: created.map((c: any) => ({ id: c.id, name: c.name, rolePosition: c.rolePosition })) },
  }
}

// ==================== 故事线 ====================

/** 故事线入库（原 executeGeneratePlots 落库段）：按标题去重 + batchCreate + 实体关系边 */
export async function persistPlots(db: any, projectId: string, list: any[]): Promise<StoryPersistResult> {
  const plots = Array.isArray(list) ? list : []
  if (plots.length === 0) {
    return { ok: false, message: 'AI 未返回有效的故事线数据', changed: [] }
  }

  const existing = (await db?.lwPlots?.getByProjectId(projectId)) || []
  const existingTitles = new Set(existing.map((p: any) => p.title))
  const newPlots = plots.filter((p: any) => p?.title?.trim() && !existingTitles.has(p.title))

  if (newPlots.length === 0) {
    return { ok: false, skipped: true, message: '没有新的故事线需要添加（都已存在）', changed: [] }
  }

  await db?.lwPlots?.batchCreate(
    projectId,
    newPlots.map((p: any) => ({
      title: p.title.trim(),
      summary: p.summary || '',
      involvedCharacters: p.involvedCharacters || [],
    })),
  )

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
    ok: true,
    message: `新增故事线 ${newPlots.length} 条：${newPlots.map((p: any) => p.title).join('、')}`,
    changed: ['plots'],
    data: { plots: newPlots.map((p: any) => ({ title: p.title })) },
  }
}

// ==================== 世界设定 ====================

/**
 * 世界设定四类入库（原 executeGenerateWorld 落库段；背景润色属生成不在此层）。
 * data 各数组可选，按名称去重只入新增。
 */
export async function persistWorld(
  db: any,
  projectId: string,
  data: { locations?: any[]; factions?: any[]; skills?: any[]; items?: any[] },
): Promise<StoryPersistResult> {
  const done: string[] = []

  // 地点
  try {
    const list = Array.isArray(data.locations) ? data.locations : []
    if (list.length > 0) {
      const existing = (await db?.lwLocations?.getByProjectId(projectId)) || []
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
    logger.warn('地点落库失败', e)
  }

  // 势力
  try {
    const list = Array.isArray(data.factions) ? data.factions : []
    if (list.length > 0) {
      const existing = (await db?.lwFactions?.getByProjectId(projectId)) || []
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
    logger.warn('势力落库失败', e)
  }

  // 技能 + 物品
  try {
    const skills = Array.isArray(data.skills) ? data.skills : []
    const items = Array.isArray(data.items) ? data.items : []
    if (skills.length > 0) {
      const existing = (await db?.lwSkills?.getByProjectId(projectId)) || []
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
      const existing = (await db?.lwItems?.getByProjectId(projectId)) || []
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
    logger.warn('技能物品落库失败', e)
  }

  if (done.length === 0) {
    return { ok: false, message: '没有新的世界设定需要添加（结构化数据为空或都已存在）', changed: [] }
  }
  return { ok: true, message: `已保存世界设定：${done.join('、')}`, changed: ['world'] }
}

// ==================== 大纲 ====================

/**
 * 大纲建树（原 createOutlineTree 原样迁出；复刻 OutlineStage 前端逻辑：
 * 卷→章→节 / 章→节 / 章）。返回成功创建的节点数。
 */
export async function persistOutlineTree(db: any, projectId: string, tree: any[], level: number): Promise<number> {
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

// ==================== 章节 ====================

/**
 * 章节正文落库（原 executeWriteChapter 落库段；复刻 saveChapter 语义：
 * create/updateContent + createVersion）+ 图谱流水线（事件提取→状态切片→
 * 自动建边→章节状态摘要，分步容错）。ai 缺省时跳过图谱流水线（正文照常保存）。
 */
export async function persistChapter(
  db: any,
  projectId: string,
  params: { outlineId: string; content: string; providerConfigId?: string; modelId?: string },
  ai?: any,
): Promise<StoryPersistResult> {
  const { outlineId, content } = params
  const outline = await db?.lwOutlines?.getById(outlineId)
  if (!outline) {
    return { ok: false, message: '大纲节点不存在（outlineId 无效）', changed: [] }
  }
  if (!content || !content.trim()) {
    return { ok: false, message: '章节正文为空', changed: [] }
  }

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

  if (ai) {
    try {
      const { ChapterGraphProcessor } = await import('./graph/chapter-graph.processor')
      const processor = new ChapterGraphProcessor(db, ai)
      const tree = (await db?.lwOutlines?.getTreeByProjectId(projectId)) || []
      const leaves = (tree || [])
        .filter((n: any) => n.nodeType === 'chapter' || n.nodeType === 'section')
        .sort((a: any, b: any) => a.orderIndex - b.orderIndex)
      const chapterNumber = leaves.findIndex((l: any) => l.id === outlineId) + 1 || 1
      await processor.process({
        projectId,
        outlineId,
        chapterContent: content,
        chapterNumber,
        providerConfigId: params.providerConfigId,
        modelId: params.modelId,
      })
    } catch (e) {
      logger.warn('章节图谱流水线失败（正文已保存）', e)
    }
  }

  const words = content.length
  return {
    ok: true,
    message: `已保存「${outline.name}」（约 ${Math.round(words / 100) / 10} 千字）`,
    changed: ['chapters', 'outline'],
    data: { outlineId, name: outline.name, words },
  }
}
