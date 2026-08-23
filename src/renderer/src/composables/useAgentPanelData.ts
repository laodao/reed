/**
 * Agent 数据面板聚合 composable
 * @module composables/useAgentPanelData
 *
 * 聚合右侧面板全部数据（概览/人物/世界/故事线/大纲/章节），
 * 事件驱动分区刷新：changed 分区只重拉对应数据，避免整面板重载。
 */

import { ref, reactive } from 'vue'
import type { Ref } from 'vue'

export type PanelSection = 'overview' | 'characters' | 'world' | 'plots' | 'outline' | 'chapters'

export interface AgentPanelData {
  overview: any | null
  characters: any[]
  background: any | null
  locations: any[]
  factions: any[]
  skills: any[]
  items: any[]
  plots: any[]
  outlineTree: any[]
  chaptersMap: Record<string, any>
}

export interface AgentProductionStateLite {
  overview: { exists: boolean; title?: string; storyType?: string; estimatedChapters?: number }
  characters: { count: number }
  world: { background: boolean; locations: number; factions: number; skills: number; items: number }
  plots: { count: number }
  outline: { total: number; written: number; unwrittenLeaves: number }
  chapters: { written: number; totalWords: number }
}

export function useAgentPanelData(projectId: string | Ref<string>) {
  const projectIdRef = typeof projectId === 'string' ? ref(projectId) : projectId

  const loading = ref(false)
  const data = reactive<AgentPanelData>({
    overview: null,
    characters: [],
    background: null,
    locations: [],
    factions: [],
    skills: [],
    items: [],
    plots: [],
    outlineTree: [],
    chaptersMap: {},
  })
  /** 生产状态（概览 Tab + 进度带） */
  const productionState = ref<AgentProductionStateLite | null>(null)

  async function fetchSection(section: PanelSection): Promise<void> {
    const api = window.electronAPI.longwriting
    switch (section) {
      case 'overview': {
        const r = await api.getStoryOverview(projectIdRef.value)
        if (r.success) data.overview = r.data || null
        break
      }
      case 'characters': {
        const r = await api.getCharacters(projectIdRef.value)
        if (r.success) data.characters = r.data || []
        break
      }
      case 'world': {
        const [bg, locs, facs, skills, items] = await Promise.all([
          api.getBackground(projectIdRef.value),
          api.getLocations(projectIdRef.value),
          api.getFactions(projectIdRef.value),
          api.getSkills(projectIdRef.value),
          api.getItems(projectIdRef.value),
        ])
        if (bg.success) data.background = bg.data || null
        if (locs.success) data.locations = locs.data || []
        if (facs.success) data.factions = facs.data || []
        if (skills.success) data.skills = skills.data || []
        if (items.success) data.items = items.data || []
        break
      }
      case 'plots': {
        const r = await api.getPlots(projectIdRef.value)
        if (r.success) data.plots = r.data || []
        break
      }
      case 'outline':
      case 'chapters': {
        const r = await api.getOutlineTree(projectIdRef.value)
        if (r.success) data.outlineTree = r.data || []
        // 章节 Map：叶子节点一次查
        const leaves = (data.outlineTree || []).filter(
          (n: any) => n.nodeType === 'chapter' || n.nodeType === 'section',
        )
        if (leaves.length > 0) {
          const cr = await api.getChaptersByOutlineIds(leaves.map((l: any) => l.id))
          if (cr.success) data.chaptersMap = cr.data || {}
        } else {
          data.chaptersMap = {}
        }
        break
      }
    }
  }

  async function fetchProductionState(): Promise<void> {
    try {
      const r = await window.electronAPI.longwriting.agentState(projectIdRef.value)
      if (r.success && r.data) {
        productionState.value = r.data
      }
    } catch {
      /* 忽略：面板不阻塞 */
    }
  }

  /** 刷新面板（sections 为空则全量；传分区则只拉对应分区 + 生产状态） */
  async function refresh(sections?: PanelSection[]): Promise<void> {
    loading.value = true
    try {
      const targets: PanelSection[] = sections && sections.length > 0 ? sections : ALL_SECTIONS
      await Promise.all(targets.map(s => fetchSection(s)))
      await fetchProductionState()
    } finally {
      loading.value = false
    }
  }

  /** 初始全量加载 */
  async function load(): Promise<void> {
    await refresh()
  }

  return { data, productionState, loading, refresh, load }
}

const ALL_SECTIONS: PanelSection[] = ['overview', 'characters', 'world', 'plots', 'outline', 'chapters']
