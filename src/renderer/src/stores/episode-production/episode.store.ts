/**
 * episode-production · 剧集 · store
 * @module renderer/stores/episode-production/episode.store
 * @description 剧集列表、当前剧集及 CRUD 操作、剧集进度 getter。
 *              拆自原 src/renderer/src/stores/story-to-video.ts。
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { VideoEpisode } from '../../../../shared/types/story-to-video.types'
import { useEpWorkbenchStore } from './workbench.store'
import { useEpScriptStore } from './script.store'
import { useEpStoryboardStore } from './storyboard.store'

export const useEpEpisodeStore = defineStore('ep-episode', () => {
  // ==================== 状态 ====================

  /**
   * 当前项目的剧集列表
   */
  const episodes = ref<VideoEpisode[]>([])

  /**
   * 当前选中的剧集
   */
  const currentEpisode = ref<VideoEpisode | null>(null)

  // ==================== 计算属性 ====================

  /**
   * 剧集进度统计
   */
  const episodeProgress = computed(() => {
    if (!currentEpisode.value) return null
    const scriptStore = useEpScriptStore()
    return {
      hasScript: !!scriptStore.currentScript,
      sceneCount: scriptStore.scenes.length,
      storyboardCount: useEpStoryboardStore().storyboards.length,
    }
  })

  // ==================== 剧集管理 ====================

  /**
   * 加载剧集列表
   */
  async function loadEpisodes(projectId: string): Promise<void> {
    const wb = useEpWorkbenchStore()
    wb.loading = true
    wb.error = null
    try {
      console.log('[StoryToVideoStore] 加载剧集列表, projectId:', projectId)
      const response = await window.electronAPI.episodeProduction.listEpisodes(projectId)
      console.log('[StoryToVideoStore] 剧集列表响应:', response)
      if (response.success && response.data) {
        episodes.value = response.data as VideoEpisode[]
        console.log('[StoryToVideoStore] 剧集数量:', episodes.value.length)
      } else {
        wb.error = response.error || '加载剧集列表失败'
        console.error('[StoryToVideoStore] 加载剧集失败:', wb.error)
      }
    } catch (e: any) {
      wb.error = e.message || '加载剧集列表失败'
      console.error('[StoryToVideoStore] 异常:', e)
    } finally {
      wb.loading = false
    }
  }

  /**
   * 创建剧集
   */
  async function createEpisode(
    projectId: string,
    data: {
      sourceType: 'outline' | 'uploaded'
      outlineId?: string
      uploadedContent?: string
      episodeNumber: number
      title: string
    }
  ): Promise<VideoEpisode | null> {
    const wb = useEpWorkbenchStore()
    wb.loading = true
    wb.error = null
    try {
      const response = await window.electronAPI.episodeProduction.createEpisode(projectId, data)
      if (response.success && response.data) {
        const episode = response.data as VideoEpisode
        episodes.value.push(episode)
        return episode
      } else {
        wb.error = response.error || '创建剧集失败'
        return null
      }
    } catch (e: any) {
      wb.error = e.message || '创建剧集失败'
      return null
    } finally {
      wb.loading = false
    }
  }

  /**
   * 更新剧集
   */
  async function updateEpisode(
    episodeId: string,
    data: { episodeNumber?: number; title?: string }
  ): Promise<VideoEpisode | null> {
    const wb = useEpWorkbenchStore()
    wb.loading = true
    wb.error = null
    try {
      const response = await window.electronAPI.episodeProduction.updateEpisode(episodeId, data)
      if (response.success && response.data) {
        const episode = response.data as VideoEpisode
        // 更新列表中的剧集
        const index = episodes.value.findIndex(e => e.id === episodeId)
        if (index !== -1) {
          episodes.value[index] = episode
        }
        // 如果是当前剧集，也更新
        if (currentEpisode.value?.id === episodeId) {
          currentEpisode.value = episode
        }
        return episode
      } else {
        wb.error = response.error || '更新剧集失败'
        return null
      }
    } catch (e: any) {
      wb.error = e.message || '更新剧集失败'
      return null
    } finally {
      wb.loading = false
    }
  }

  /**
   * 选择剧集
   */
  async function selectEpisode(episode: VideoEpisode): Promise<void> {
    currentEpisode.value = episode
    const scriptStore = useEpScriptStore()
    if (episode.scriptId) {
      await scriptStore.loadScript(episode.scriptId)
    } else {
      // 清空剧本相关数据
      scriptStore.currentScript = null
      scriptStore.scenes = []
      scriptStore.currentScene = null
    }
  }

  /**
   * 清空当前剧集
   */
  function clearCurrentEpisode(): void {
    currentEpisode.value = null
    const scriptStore = useEpScriptStore()
    scriptStore.currentScript = null
    scriptStore.scenes = []
    scriptStore.currentScene = null
  }

  /**
   * 删除剧集
   */
  async function deleteEpisode(episodeId: string): Promise<boolean> {
    const wb = useEpWorkbenchStore()
    wb.error = null
    try {
      const response = await window.electronAPI.episodeProduction.deleteEpisode(episodeId)
      if (response.success) {
        // 从列表中移除
        episodes.value = episodes.value.filter(e => e.id !== episodeId)
        // 如果删除的是当前剧集，清空
        if (currentEpisode.value?.id === episodeId) {
          clearCurrentEpisode()
        }
        return true
      } else {
        wb.error = response.error || '删除剧集失败'
        return false
      }
    } catch (e: any) {
      wb.error = e.message || '删除剧集失败'
      return false
    }
  }

  return {
    episodes,
    currentEpisode,
    episodeProgress,
    loadEpisodes,
    createEpisode,
    updateEpisode,
    selectEpisode,
    clearCurrentEpisode,
    deleteEpisode,
  }
})
