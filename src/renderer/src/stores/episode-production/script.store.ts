/**
 * episode-production · 剧本 · store
 * @module renderer/stores/episode-production/script.store
 * @description 章节剧本、场景剧本 state、AI 生成剧本/场景及定稿操作。
 *              拆自原 src/renderer/src/stores/story-to-video.ts。
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import type {
  EpisodeScript,
  SceneScript,
} from '../../../../shared/types/story-to-video.types'
import { useEpWorkbenchStore } from './workbench.store'
import { useEpStoryboardStore } from './storyboard.store'

export const useEpScriptStore = defineStore('ep-script', () => {
  // ==================== 状态 ====================

  /**
   * 当前剧集的剧本
   */
  const currentScript = ref<EpisodeScript | null>(null)

  /**
   * 当前剧本的场景列表
   */
  const scenes = ref<SceneScript[]>([])

  /**
   * 当前选中的场景
   */
  const currentScene = ref<SceneScript | null>(null)

  // ==================== 剧本管理 ====================

  /**
   * 加载剧本
   */
  async function loadScript(scriptId: string): Promise<void> {
    const wb = useEpWorkbenchStore()
    wb.loading = true
    wb.error = null
    try {
      const response = await window.electronAPI.episodeProduction.getScript(scriptId)
      if (response.success && response.data) {
        currentScript.value = response.data as EpisodeScript
        // 加载场景列表
        if (currentScript.value) {
          await loadScenes(currentScript.value.id)
        }
      } else {
        wb.error = response.error || '加载剧本失败'
      }
    } catch (e: any) {
      wb.error = e.message || '加载剧本失败'
    } finally {
      wb.loading = false
    }
  }

  /**
   * 更新剧本
   */
  async function updateScript(scriptId: string, data: Partial<EpisodeScript>): Promise<boolean> {
    const wb = useEpWorkbenchStore()
    wb.error = null
    try {
      const response = await window.electronAPI.episodeProduction.updateScript(
        scriptId,
        JSON.parse(JSON.stringify(data))
      )
      if (response.success && response.data) {
        currentScript.value = response.data as EpisodeScript
        return true
      } else {
        wb.error = response.error || '更新剧本失败'
        return false
      }
    } catch (e: any) {
      wb.error = e.message || '更新剧本失败'
      return false
    }
  }

  // ==================== 场景管理 ====================

  /**
   * 加载场景列表
   */
  async function loadScenes(episodeScriptId: string): Promise<void> {
    const wb = useEpWorkbenchStore()
    wb.loading = true
    wb.error = null
    try {
      const response = await window.electronAPI.episodeProduction.listScenes(episodeScriptId)
      if (response.success && response.data) {
        scenes.value = response.data as SceneScript[]
        // 如果有场景，自动选中第一个并加载分镜
        if (scenes.value.length > 0) {
          currentScene.value = scenes.value[0]
          const storyboardStore = useEpStoryboardStore()
          await storyboardStore.loadStoryboards(scenes.value[0].id)
        } else {
          // 没有场景，清空当前场景和分镜
          currentScene.value = null
          const storyboardStore = useEpStoryboardStore()
          storyboardStore.storyboards = []
        }
      } else {
        wb.error = response.error || '加载场景列表失败'
      }
    } catch (e: any) {
      wb.error = e.message || '加载场景列表失败'
    } finally {
      wb.loading = false
    }
  }

  /**
   * 加载单个场景
   */
  async function loadScene(sceneId: string): Promise<void> {
    const wb = useEpWorkbenchStore()
    wb.loading = true
    wb.error = null
    try {
      const response = await window.electronAPI.episodeProduction.getScene(sceneId)
      if (response.success && response.data) {
        currentScene.value = response.data as SceneScript
      } else {
        wb.error = response.error || '加载场景失败'
      }
    } catch (e: any) {
      wb.error = e.message || '加载场景失败'
    } finally {
      wb.loading = false
    }
  }

  /**
   * 选择场景
   */
  async function selectScene(scene: SceneScript): Promise<void> {
    currentScene.value = scene
    const storyboardStore = useEpStoryboardStore()
    await storyboardStore.loadStoryboards(scene.id)
  }

  /**
   * 更新场景
   */
  async function updateScene(sceneId: string, data: Partial<SceneScript>): Promise<boolean> {
    const wb = useEpWorkbenchStore()
    wb.error = null
    try {
      const response = await window.electronAPI.episodeProduction.updateScene(
        sceneId,
        JSON.parse(JSON.stringify(data))
      )
      if (response.success && response.data) {
        const updatedScene = response.data as SceneScript
        const index = scenes.value.findIndex(s => s.id === sceneId)
        if (index !== -1) {
          scenes.value[index] = updatedScene
        }
        if (currentScene.value?.id === sceneId) {
          currentScene.value = updatedScene
        }
        return true
      } else {
        wb.error = response.error || '更新场景失败'
        return false
      }
    } catch (e: any) {
      wb.error = e.message || '更新场景失败'
      return false
    }
  }

  /**
   * 清空当前场景
   */
  function clearCurrentScene(): void {
    currentScene.value = null
    const storyboardStore = useEpStoryboardStore()
    storyboardStore.storyboards = []
  }

  // ==================== AI 生成 ====================

  /**
   * 生成剧本
   */
  async function generateScript(
    episodeId: string,
    providerConfigId?: string,
    modelId?: string
  ): Promise<{ script: EpisodeScript; scenes: SceneScript[] } | null> {
    const wb = useEpWorkbenchStore()
    wb.generating = true
    wb.error = null
    try {
      const response = await window.electronAPI.episodeProduction.generateScript(
        episodeId,
        providerConfigId,
        modelId
      )
      if (response.success && response.data) {
        const result = response.data as { script: EpisodeScript; scenes: SceneScript[] }
        currentScript.value = result.script
        scenes.value = result.scenes
        return result
      } else {
        wb.error = response.error || '生成剧本失败'
        return null
      }
    } catch (e: any) {
      wb.error = e.message || '生成剧本失败'
      return null
    } finally {
      wb.generating = false
    }
  }

  /**
   * 生成场景
   */
  async function generateScenes(
    scriptId: string,
    providerConfigId?: string,
    modelId?: string
  ): Promise<SceneScript[] | null> {
    const wb = useEpWorkbenchStore()
    wb.generating = true
    wb.error = null
    try {
      const response = await window.electronAPI.episodeProduction.generateScenes(
        scriptId,
        providerConfigId,
        modelId
      )
      if (response.success && response.data) {
        const result = response.data as SceneScript[]
        scenes.value = result
        return result
      } else {
        wb.error = response.error || '拆分场景失败'
        return null
      }
    } catch (e: any) {
      wb.error = e.message || '拆分场景失败'
      return null
    } finally {
      wb.generating = false
    }
  }

  return {
    currentScript,
    scenes,
    currentScene,
    // 剧本管理
    loadScript,
    updateScript,
    // 场景管理
    loadScenes,
    loadScene,
    selectScene,
    updateScene,
    clearCurrentScene,
    // AI 生成
    generateScript,
    generateScenes,
  }
})
