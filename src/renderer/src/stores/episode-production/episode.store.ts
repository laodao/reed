/**
 * episode-production · 剧集 · store
 * @module renderer/stores/episode-production/episode.store
 * @description 剧集列表、当前剧集及 CRUD 操作、剧集进度 getter。
 *              拆自原 src/renderer/src/stores/story-to-video.ts。
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { VideoEpisode } from '../../../../shared/types/story-to-video.types'
import type { UpdateVideoEpisodeData } from '../../../../shared/types/episode-production'
import { useEpWorkbenchStore } from './workbench.store'
import { useEpScriptStore } from './script.store'
import { useEpStoryboardStore } from './storyboard.store'

/** 持久化"每个项目最后一次选中的 episodeId" */
const LAST_SELECTED_STORAGE_KEY = 'ep-production:last-selected-episode'

function loadLastSelectedMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LAST_SELECTED_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {}
  } catch (e) {
    console.warn('[ep-episode] 读取 last-selected 失败:', e)
    return {}
  }
}

function persistLastSelectedMap(map: Record<string, string>): void {
  try {
    localStorage.setItem(LAST_SELECTED_STORAGE_KEY, JSON.stringify(map))
  } catch (e) {
    console.warn('[ep-episode] 写入 last-selected 失败:', e)
  }
}

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

  /**
   * 每个项目最后一次选中的 episodeId（持久化到 localStorage）。
   * key = projectId, value = episodeId
   */
  const lastSelectedByProject = ref<Record<string, string>>(loadLastSelectedMap())

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
      // 故事背景（spec 2026-05-08）：创建对话框收集，落到 episode 主表的 storyEra/Region/Extra 列
      storyEra?: string
      storyRegion?: string
      storyBackgroundExtra?: string
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
   *
   * 接受 VideoEpisode 上除身份字段外的任意可选子集（统一契约 UpdateVideoEpisodeData）。
   */
  async function updateEpisode(
    episodeId: string,
    data: UpdateVideoEpisodeData,
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
   *
   * FU4-2 修复：之前 selectEpisode 仅清 scriptStore（scenes/currentScene），
   * 不清 storyboardStore → 切到新建剧集时仍显示上一剧集的分镜。
   * 现强制先 clear 全部下游 store，再按需加载。
   */
  async function selectEpisode(episode: VideoEpisode): Promise<void> {
    currentEpisode.value = episode
    const scriptStore = useEpScriptStore()
    const storyboardStore = useEpStoryboardStore()
    // 1. 先清空所有下游 store（防止残留前剧集数据）
    scriptStore.currentScript = null
    scriptStore.scenes = []
    scriptStore.currentScene = null
    storyboardStore.storyboards = []
    // 2. 持久化"上次选择"（按 projectId 区分）
    if (episode.projectId && episode.id) {
      lastSelectedByProject.value = {
        ...lastSelectedByProject.value,
        [episode.projectId]: episode.id,
      }
      persistLastSelectedMap(lastSelectedByProject.value)
    }
    // 3. 有剧本才加载
    if (episode.scriptId) {
      await scriptStore.loadScript(episode.scriptId)
    }
  }

  /**
   * 进入项目工作台时，决定首次自动选中哪一集：
   * 1) 优先选回上次选过的（仍存在于当前 episodes 列表中）；
   * 2) 否则回退到第一集；
   * 3) 列表为空 → null。
   *
   * 必须在 loadEpisodes 完成之后调用。
   */
  function pickInitialEpisode(projectId: string): VideoEpisode | null {
    if (episodes.value.length === 0) return null
    const lastId = lastSelectedByProject.value[projectId]
    if (lastId) {
      const found = episodes.value.find((e) => e.id === lastId)
      if (found) return found
      // id 失效（剧集被删）→ 顺手清理记忆，避免占空间
      forgetLastSelected(projectId)
    }
    return episodes.value[0]
  }

  /**
   * 清除某个项目的"上次选择"记忆（例如该剧集被删除）。
   */
  function forgetLastSelected(projectId: string): void {
    if (!(projectId in lastSelectedByProject.value)) return
    const next = { ...lastSelectedByProject.value }
    delete next[projectId]
    lastSelectedByProject.value = next
    persistLastSelectedMap(lastSelectedByProject.value)
  }

  /**
   * 清空当前剧集
   */
  function clearCurrentEpisode(): void {
    currentEpisode.value = null
    const scriptStore = useEpScriptStore()
    const storyboardStore = useEpStoryboardStore()
    scriptStore.currentScript = null
    scriptStore.scenes = []
    scriptStore.currentScene = null
    storyboardStore.storyboards = []
  }

  /**
   * FU4-1 AI 识别要素（uploaded 模式 ① 内容 stage 用）
   *
   * 调 ep:identify-uploaded-entities → 后端跑 identifyCharacters/Locations/Items
   * 并写回 episode.uploadedX 后，前端 reload episode 列表 + currentEpisode 同步。
   *
   * @param kinds 不传 = 全部三类；传子集 = 只重新识别该类，其余保留
   */
  async function identifyEntities(
    episodeId: string,
    providerConfigId: string,
    modelId: string,
    kinds?: Array<'character' | 'location' | 'item'>,
  ): Promise<{
    characters: number
    locations: number
    items: number
    kinds?: Array<'character' | 'location' | 'item'>
  } | null> {
    const wb = useEpWorkbenchStore()
    wb.error = null
    try {
      const api = (window as any).electronAPI?.episodeProduction
      if (!api?.identifyUploadedEntities) {
        wb.error = '当前环境不支持 AI 识别要素接口'
        return null
      }
      const resp = await api.identifyUploadedEntities(episodeId, providerConfigId, modelId, kinds)
      if (!resp.success) {
        wb.error = resp.error || 'AI 识别失败'
        return null
      }
      // 写回后 reload 当前剧集（拿到新的 uploadedX）
      const fresh = await window.electronAPI.episodeProduction.getEpisode(episodeId)
      if (fresh.success && fresh.data) {
        const ep = fresh.data as VideoEpisode
        const idx = episodes.value.findIndex(e => e.id === episodeId)
        if (idx !== -1) episodes.value[idx] = ep
        if (currentEpisode.value?.id === episodeId) currentEpisode.value = ep
      }
      return resp.data as {
        characters: number
        locations: number
        items: number
        kinds?: Array<'character' | 'location' | 'item'>
      }
    } catch (e: any) {
      wb.error = e.message || 'AI 识别失败'
      return null
    }
  }

  /**
   * 删除剧集
   */
  async function deleteEpisode(episodeId: string): Promise<boolean> {
    const wb = useEpWorkbenchStore()
    wb.error = null
    // 删除前抓项目 id（删除后 episode 已不在列表，无法回查）
    const ep = episodes.value.find((e) => e.id === episodeId)
    const projectIdOfEp = ep?.projectId
    try {
      const response = await window.electronAPI.episodeProduction.deleteEpisode(episodeId)
      if (response.success) {
        // 从列表中移除
        episodes.value = episodes.value.filter(e => e.id !== episodeId)
        // 若被删的是该项目"上次选择"，清掉记忆，免得下次进来又找一个不存在的 id
        if (projectIdOfEp && lastSelectedByProject.value[projectIdOfEp] === episodeId) {
          forgetLastSelected(projectIdOfEp)
        }
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
    lastSelectedByProject,
    loadEpisodes,
    createEpisode,
    updateEpisode,
    selectEpisode,
    pickInitialEpisode,
    forgetLastSelected,
    clearCurrentEpisode,
    deleteEpisode,
    identifyEntities,
  }
})
