/**
 * Agent 工作流引擎：生产状态计算 + 依赖规则 + 下一步建议
 * @module core/services/longwriting/agent/agent-deps
 *
 * 工作流 = 依赖规则（写死最小前置，不写死顺序）+ 生产状态（从数据库实时计算）。
 * 顺序由 AI 在对话中推进，引擎只保证"动作的最小前置条件"。
 */

import type { AgentActionType, AgentProductionState } from './agent.types'

// ==================== 生产状态计算 ====================

/**
 * 实时计算项目生产状态（数据即状态，不持久化硬状态）。
 * 用现有查询通道（与向导 checkStep 同思路，但输出更完整供 AI 决策）。
 */
export async function computeProductionState(db: any, projectId: string): Promise<AgentProductionState> {
  const [overview, characters, background, locations, factions, skills, items, plots, outlineTree] =
    await Promise.all([
      db?.lwStoryOverviews?.getByProjectId(projectId) ?? Promise.resolve(null),
      db?.lwCharacters?.getByProjectId(projectId) ?? Promise.resolve([]),
      db?.lwBackgrounds?.getByProjectId(projectId) ?? Promise.resolve(null),
      db?.lwLocations?.getByProjectId(projectId) ?? Promise.resolve([]),
      db?.lwFactions?.getByProjectId(projectId) ?? Promise.resolve([]),
      db?.lwSkills?.getByProjectId(projectId) ?? Promise.resolve([]),
      db?.lwItems?.getByProjectId(projectId) ?? Promise.resolve([]),
      db?.lwPlots?.getByProjectId(projectId) ?? Promise.resolve([]),
      db?.lwOutlines?.getTreeByProjectId(projectId) ?? Promise.resolve([]),
    ])

  // 大纲叶子（chapter/section 节点按序）→ 用 getByOutlineIds 一次性判断已写/未写
  const leaves = (outlineTree || [])
    .filter((n: any) => n.nodeType === 'chapter' || n.nodeType === 'section')
    .sort((a: any, b: any) => a.orderIndex - b.orderIndex)
  const chaptersMap: Map<string, any> =
    leaves.length > 0 && db?.lwChapters
      ? (await db.lwChapters.getByOutlineIds(leaves.map((l: any) => l.id))) || new Map()
      : new Map()

  const writtenLeaves: string[] = []
  const unwrittenLeaves: Array<{ id: string; name: string }> = []
  for (const leaf of leaves) {
    if (chaptersMap.has(leaf.id)) writtenLeaves.push(leaf.id)
    else unwrittenLeaves.push({ id: leaf.id, name: leaf.name })
  }

  // 已写章节字数统计
  let totalWords = 0
  for (const ch of chaptersMap.values()) {
    totalWords += ch?.content?.length || 0
  }

  return {
    overview: {
      exists: !!overview,
      title: overview?.title || undefined,
      storyType: overview?.storyType || undefined,
      coreIdea: overview?.coreIdea || undefined,
      summary: overview?.summary || undefined,
      coreConflict: overview?.coreConflict || undefined,
      estimatedChapters: overview?.estimatedChapters || undefined,
      enabledFeatures: overview?.enabledFeatures || undefined,
    },
    characters: {
      count: (characters || []).length,
      names: (characters || []).map((c: any) => c.name),
    },
    world: {
      background: !!background,
      locations: (locations || []).length,
      factions: (factions || []).length,
      skills: (skills || []).length,
      items: (items || []).length,
    },
    plots: {
      count: (plots || []).length,
      titles: (plots || []).map((p: any) => p.title),
    },
    outline: {
      total: (outlineTree || []).length,
      written: writtenLeaves.length,
      unwrittenLeaves: unwrittenLeaves.length,
      nextUnwritten: unwrittenLeaves[0],
    },
    chapters: { written: chaptersMap.size, totalWords },
  }
}

// ==================== 依赖规则 ====================

/** 动作 → 最小前置（缺失时引擎跳过动作，把提示交给 AI 总结） */
const ACTION_DEPENDENCIES: Record<AgentActionType, (s: AgentProductionState) => string[]> = {
  generate_overview: () => [],
  generate_characters: s => (s.overview.exists && (s.overview.coreIdea || s.overview.summary) ? [] : ['故事概要']),
  generate_world: s => (s.overview.exists ? [] : ['故事概要']),
  generate_plots: s => (s.overview.exists ? [] : ['故事概要']),
  generate_outline: s => (s.overview.exists ? [] : ['故事概要']),
  write_chapter: s => (s.outline.unwrittenLeaves > 0 ? [] : ['未写的大纲节点']),
  update_entity: () => [],
  delete_entity: () => [],
}

export function checkActionDependency(type: AgentActionType, state: AgentProductionState): { ok: boolean; missing: string[] } {
  const missing = ACTION_DEPENDENCIES[type]?.(state) ?? []
  return { ok: missing.length === 0, missing }
}

// ==================== 下一步建议 chips ====================

/**
 * 按"生产状态缺什么"生成下一步候选（引擎兜底；AI 总结时也可补充说明）。
 * 最多 3 个，按依赖顺序优先。
 */
export function buildSuggestions(state: AgentProductionState): string[] {
  const result: string[] = []
  const overviewReady = state.overview.exists && (state.overview.coreIdea || state.overview.summary)

  if (!state.overview.exists) {
    result.push('帮我生成故事概要')
  } else if (!overviewReady) {
    result.push('根据我的想法生成故事概要')
  }

  if (overviewReady && result.length < 3) {
    if (state.characters.count === 0) {
      result.push('设计主要角色')
    } else if (state.plots.count === 0) {
      result.push('规划故事线')
    } else if (state.outline.total === 0) {
      result.push('生成故事大纲')
    } else if (state.outline.unwrittenLeaves > 0 && state.outline.nextUnwritten) {
      result.push(`写「${state.outline.nextUnwritten.name}」`)
    }
  }

  if (overviewReady && result.length < 3) {
    const worldEmpty = !state.world.background && state.world.locations === 0 && state.world.factions === 0 && state.world.skills === 0 && state.world.items === 0
    if (worldEmpty) result.push('搭建世界观设定')
    if (state.plots.count === 0 && !result.includes('规划故事线')) result.push('规划故事线')
    if (state.outline.total === 0 && !result.includes('生成故事大纲')) result.push('生成故事大纲')
  }

  return result.slice(0, 3)
}
