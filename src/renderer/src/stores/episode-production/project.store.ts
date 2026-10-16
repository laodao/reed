/**
 * episode-production · 项目 · store
 * @module renderer/stores/episode-production/project.store
 * @description 项目列表、当前项目及 CRUD 操作，以及项目维度统计 getter。
 *              拆自原 src/renderer/src/stores/story-to-video.ts。
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { VideoProject, VideoProjectConfig } from '../../../../shared/types/story-to-video.types'
import { useEpWorkbenchStore } from './workbench.store'
import { useEpEpisodeStore } from './episode.store'
import { useEpAssetStore } from './asset.store'

/** 持久化"上次进入工作台的项目 ID"（用于剧集项目界面 sidebar 默认选中） */
const LAST_SELECTED_PROJECT_KEY = 'ep-production:last-selected-project'

function loadLastSelectedProjectId(): string | null {
  try {
    return localStorage.getItem(LAST_SELECTED_PROJECT_KEY)
  } catch (e) {
    console.warn('[ep-project] 读取 last-selected-project 失败:', e)
    return null
  }
}

function persistLastSelectedProjectId(id: string | null): void {
  try {
    if (id) localStorage.setItem(LAST_SELECTED_PROJECT_KEY, id)
    else localStorage.removeItem(LAST_SELECTED_PROJECT_KEY)
  } catch (e) {
    console.warn('[ep-project] 写入 last-selected-project 失败:', e)
  }
}

/**
 * 默认项目配置
 */
const defaultConfig: VideoProjectConfig = {
  aspectRatio: '16:9',
  resolution: 1080 as any,
  fps: 30,
  defaultTransition: 'fade' as any,
  stylePrompt: '',
  defaultNarratorVoice: '',
  defaultCharacterVoice: '',
  backgroundMusicEnabled: true,
  backgroundMusicVolume: 50,
  imageProviderId: '',
  imageModelId: '',
  imageStyle: '',
  defaultShotDuration: 5,
  defaultTransitionType: 'fade',
  defaultTransitionDuration: 500,
}

export const useEpProjectStore = defineStore('ep-project', () => {
  // ==================== 状态 ====================

  /**
   * 项目列表
   */
  const projects = ref<VideoProject[]>([])

  /**
   * 当前选中的项目
   */
  const currentProject = ref<VideoProject | null>(null)

  /**
   * 上次进入工作台的项目 ID（持久化到 localStorage，用于 sidebar 默认选中）
   */
  const lastSelectedProjectId = ref<string | null>(loadLastSelectedProjectId())

  // ==================== 计算属性 ====================

  /**
   * 项目统计信息
   */
  const projectStats = computed(() => {
    if (!currentProject.value) return null
    const episodeStore = useEpEpisodeStore()
    const assetStore = useEpAssetStore()
    return {
      episodeCount: episodeStore.episodes.length,
      characterBindingCount: assetStore.characterBindings.length,
    }
  })

  // ==================== 项目管理 ====================

  /**
   * 加载项目列表
   */
  async function loadProjects(longWritingProjectId?: string): Promise<void> {
    const wb = useEpWorkbenchStore()
    wb.loading = true
    wb.error = null
    try {
      console.log('[StoryToVideoStore] 调用 listProjects API, longWritingProjectId:', longWritingProjectId)
      const response = await window.electronAPI.episodeProduction.listProjects(longWritingProjectId)
      console.log('[StoryToVideoStore] API 响应:', response)
      if (response.success && response.data) {
        projects.value = response.data as VideoProject[]
        console.log('[StoryToVideoStore] 设置 projects.value, 数量:', projects.value.length)
      } else {
        wb.error = response.error || '加载项目列表失败'
        console.error('[StoryToVideoStore] 加载失败:', wb.error)
      }
    } catch (e: any) {
      wb.error = e.message || '加载项目列表失败'
      console.error('[StoryToVideoStore] 异常:', e)
    } finally {
      wb.loading = false
    }
  }

  /**
   * 加载单个项目
   */
  async function loadProject(projectId: string): Promise<void> {
    const wb = useEpWorkbenchStore()
    wb.loading = true
    wb.error = null
    try {
      const response = await window.electronAPI.episodeProduction.getProject(projectId)
      if (response.success && response.data) {
        currentProject.value = response.data as VideoProject
      } else {
        wb.error = response.error || '加载项目失败'
      }
    } catch (e: any) {
      wb.error = e.message || '加载项目失败'
    } finally {
      wb.loading = false
    }
  }

  /**
   * 创建项目
   */
  async function createProject(
    name: string,
    longWritingProjectId?: string,
    config?: VideoProjectConfig
  ): Promise<VideoProject | null> {
    const wb = useEpWorkbenchStore()
    wb.loading = true
    wb.error = null
    try {
      const response = await window.electronAPI.episodeProduction.createProject(
        name,
        longWritingProjectId || undefined, // 空字符串转为 undefined
        JSON.parse(JSON.stringify(config || defaultConfig))
      )
      if (response.success && response.data) {
        const project = response.data as VideoProject
        projects.value.push(project)
        return project
      } else {
        wb.error = response.error || '创建项目失败'
        return null
      }
    } catch (e: any) {
      wb.error = e.message || '创建项目失败'
      return null
    } finally {
      wb.loading = false
    }
  }

  /**
   * 更新项目
   */
  async function updateProject(
    projectId: string,
    data: { name?: string; status?: string; config?: VideoProjectConfig; longWritingProjectId?: string }
  ): Promise<boolean> {
    const wb = useEpWorkbenchStore()
    wb.error = null
    try {
      const response = await window.electronAPI.episodeProduction.updateProject(
        projectId,
        JSON.parse(JSON.stringify(data))
      )
      if (response.success && response.data) {
        const updatedProject = response.data as VideoProject
        const index = projects.value.findIndex(p => p.id === projectId)
        if (index !== -1) {
          projects.value[index] = updatedProject
        }
        if (currentProject.value?.id === projectId) {
          currentProject.value = updatedProject
        }
        return true
      } else {
        wb.error = response.error || '更新项目失败'
        return false
      }
    } catch (e: any) {
      wb.error = e.message || '更新项目失败'
      return false
    }
  }

  /**
   * 删除项目
   */
  async function deleteProject(projectId: string): Promise<boolean> {
    const wb = useEpWorkbenchStore()
    wb.error = null
    try {
      const response = await window.electronAPI.episodeProduction.deleteProject(projectId)
      if (response.success) {
        projects.value = projects.value.filter(p => p.id !== projectId)
        if (currentProject.value?.id === projectId) {
          clearCurrentProject()
        }
        return true
      } else {
        wb.error = response.error || '删除项目失败'
        return false
      }
    } catch (e: any) {
      wb.error = e.message || '删除项目失败'
      return false
    }
  }

  /**
   * 选择项目
   */
  async function selectProject(project: VideoProject): Promise<void> {
    currentProject.value = project
    const episodeStore = useEpEpisodeStore()
    const assetStore = useEpAssetStore()
    await episodeStore.loadEpisodes(project.id)
    await assetStore.loadCharacterBindings(project.id)
    await assetStore.loadLocationBindings(project.id)
    await assetStore.loadItemBindings(project.id)
  }

  /**
   * 设置并持久化上次选中的项目 ID
   */
  function setLastSelectedProjectId(id: string | null): void {
    lastSelectedProjectId.value = id
    persistLastSelectedProjectId(id)
  }

  /**
   * 清空当前项目
   */
  function clearCurrentProject(): void {
    currentProject.value = null
    const episodeStore = useEpEpisodeStore()
    const assetStore = useEpAssetStore()
    episodeStore.episodes = []
    episodeStore.currentEpisode = null
    episodeStore.clearCurrentEpisode()
    assetStore.characterBindings = []
    assetStore.locationBindings = []
    assetStore.itemBindings = []
  }

  return {
    projects,
    currentProject,
    lastSelectedProjectId,
    projectStats,
    loadProjects,
    loadProject,
    createProject,
    updateProject,
    deleteProject,
    selectProject,
    clearCurrentProject,
    setLastSelectedProjectId,
  }
})
