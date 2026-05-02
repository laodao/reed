/**
 * episode-production · 制作 · store
 * @module renderer/stores/episode-production/production.store
 * @description 关键帧图像生成、音频生成及相关风格预设查询。
 *              拆自原 src/renderer/src/stores/story-to-video.ts。
 */

import { defineStore } from 'pinia'
import type { Storyboard } from '../../../../shared/types/story-to-video.types'
import { useEpWorkbenchStore } from './workbench.store'
import { useEpStoryboardStore } from './storyboard.store'

export const useEpProductionStore = defineStore('ep-production', () => {
  // ==================== 资源生成 ====================

  /**
   * 获取风格预设列表
   */
  async function getStylePresets(): Promise<Array<{ id: string; name: string }> | null> {
    try {
      const response = await window.electronAPI.episodeProduction.getStylePresets()
      if (response.success && response.data) {
        return response.data as Array<{ id: string; name: string }>
      }
      return null
    } catch (e: any) {
      console.error('获取风格预设失败:', e)
      return null
    }
  }

  /**
   * 生成分镜画面
   */
  async function generateStoryboardImage(
    storyboardId: string,
    styleName: string,
    providerConfigId?: string,
    modelId?: string
  ): Promise<Storyboard | null> {
    const wb = useEpWorkbenchStore()
    wb.loading = true
    wb.error = null
    try {
      const response = await window.electronAPI.episodeProduction.generateStoryboardImage(
        storyboardId,
        styleName,
        providerConfigId,
        modelId
      )
      if (response.success && response.data) {
        const updatedStoryboard = response.data as Storyboard
        // 更新分镜列表
        const storyboardStore = useEpStoryboardStore()
        const index = storyboardStore.storyboards.findIndex(s => s.id === storyboardId)
        if (index !== -1) {
          storyboardStore.storyboards[index] = updatedStoryboard
        }
        return updatedStoryboard
      } else {
        wb.error = response.error || '生成图像失败'
        return null
      }
    } catch (e: any) {
      wb.error = e.message || '生成图像失败'
      return null
    } finally {
      wb.loading = false
    }
  }

  /**
   * 批量生成场景画面
   */
  async function generateSceneImages(
    sceneId: string,
    styleName: string,
    providerConfigId?: string,
    modelId?: string,
    onProgress?: (index: number, total: number) => void
  ): Promise<Storyboard[] | null> {
    const wb = useEpWorkbenchStore()
    wb.loading = true
    wb.error = null

    // 注册进度监听
    let unsubscribe: (() => void) | null = null
    if (onProgress) {
      unsubscribe = window.electronAPI.episodeProduction.onImageProgress((_event, data) => {
        if (data.sceneId === sceneId) {
          onProgress(data.index, data.total)
        }
      })
    }

    try {
      const response = await window.electronAPI.episodeProduction.generateSceneImages(
        sceneId,
        styleName,
        providerConfigId,
        modelId
      )
      if (response.success && response.data) {
        const updatedStoryboards = response.data as Storyboard[]
        // 更新分镜列表
        const storyboardStore = useEpStoryboardStore()
        for (const updated of updatedStoryboards) {
          const index = storyboardStore.storyboards.findIndex(s => s.id === updated.id)
          if (index !== -1) {
            storyboardStore.storyboards[index] = updated
          }
        }
        return updatedStoryboards
      } else {
        wb.error = response.error || '批量生成图像失败'
        return null
      }
    } catch (e: any) {
      wb.error = e.message || '批量生成图像失败'
      return null
    } finally {
      wb.loading = false
      if (unsubscribe) {
        unsubscribe()
      }
    }
  }

  /**
   * 生成场景音频
   */
  async function generateSceneAudio(
    sceneId: string,
    onProgress?: (type: string, index: number, total: number) => void
  ): Promise<{ narrationPath?: string; dialogueCount: number } | null> {
    const wb = useEpWorkbenchStore()
    wb.loading = true
    wb.error = null

    // 注册进度监听
    let unsubscribe: (() => void) | null = null
    if (onProgress) {
      unsubscribe = window.electronAPI.episodeProduction.onAudioProgress((_event, data) => {
        if (data.sceneId === sceneId) {
          onProgress(data.type, data.index, data.total)
        }
      })
    }

    try {
      const response = await window.electronAPI.episodeProduction.generateAudio(sceneId)
      if (response.success && response.data) {
        return response.data as { narrationPath?: string; dialogueCount: number }
      } else {
        wb.error = response.error || '生成音频失败'
        return null
      }
    } catch (e: any) {
      wb.error = e.message || '生成音频失败'
      return null
    } finally {
      wb.loading = false
      if (unsubscribe) {
        unsubscribe()
      }
    }
  }

  return {
    getStylePresets,
    generateStoryboardImage,
    generateSceneImages,
    generateSceneAudio,
  }
})
