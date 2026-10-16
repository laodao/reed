/**
 * episode-production · 合成 · store
 * @module renderer/stores/episode-production/compose.store
 * @description 时间线、转场、视频合成与导出操作，以及视频预设查询。
 *              拆自原 src/renderer/src/stores/story-to-video.ts。
 */

import { defineStore } from 'pinia'
import { useEpWorkbenchStore } from './workbench.store'

export const useEpComposeStore = defineStore('ep-compose', () => {
  // ==================== 视频合成 ====================

  /**
   * 获取视频预设列表
   */
  async function getVideoPresets(): Promise<Array<{ id: string; name: string }> | null> {
    try {
      const response = await window.electronAPI.episodeProduction.getVideoPresets()
      if (response.success && response.data) {
        return response.data
      }
      return null
    } catch (e: any) {
      console.error('获取视频预设失败:', e)
      return null
    }
  }

  /**
   * 合成场景视频
   */
  async function synthesizeSceneVideo(
    sceneId: string,
    quality: string = 'standard',
    onProgress?: (phase: string, progress: number) => void
  ): Promise<{ outputPath: string; duration: number } | null> {
    const wb = useEpWorkbenchStore()
    wb.loading = true
    wb.error = null

    // 注册进度监听
    let unsubscribe: (() => void) | null = null
    if (onProgress) {
      unsubscribe = window.electronAPI.episodeProduction.onSynthesisProgress((_event, data) => {
        if (data.sceneId === sceneId) {
          onProgress(data.phase, data.progress)
        }
      })
    }

    try {
      const response = await window.electronAPI.episodeProduction.synthesizeSceneVideo(sceneId, quality)
      if (response.success && response.data) {
        return response.data as { outputPath: string; duration: number }
      } else {
        wb.error = response.error || '视频合成失败'
        return null
      }
    } catch (e: any) {
      wb.error = e.message || '视频合成失败'
      return null
    } finally {
      wb.loading = false
      if (unsubscribe) {
        unsubscribe()
      }
    }
  }

  /**
   * 合成单个分镜视频
   */
  async function synthesizeStoryboardVideo(
    storyboardId: string,
    quality: string = 'standard'
  ): Promise<{ outputPath: string; duration: number } | null> {
    const wb = useEpWorkbenchStore()
    wb.loading = true
    wb.error = null

    try {
      const response = await window.electronAPI.episodeProduction.synthesizeStoryboardVideo(storyboardId, quality)
      if (response.success && response.data) {
        return response.data as { outputPath: string; duration: number }
      } else {
        wb.error = response.error || '视频合成失败'
        return null
      }
    } catch (e: any) {
      wb.error = e.message || '视频合成失败'
      return null
    } finally {
      wb.loading = false
    }
  }

  /**
   * 导出视频
   */
  async function exportVideo(
    sourcePath: string,
    outputPath: string,
    quality: string = 'standard'
  ): Promise<{ outputPath: string } | null> {
    const wb = useEpWorkbenchStore()
    wb.loading = true
    wb.error = null

    try {
      const response = await window.electronAPI.episodeProduction.exportVideo(
        sourcePath,
        outputPath,
        quality
      )
      if (response.success && response.data) {
        return response.data as { outputPath: string }
      } else {
        wb.error = response.error || '导出视频失败'
        return null
      }
    } catch (e: any) {
      wb.error = e.message || '导出视频失败'
      return null
    } finally {
      wb.loading = false
    }
  }

  return {
    getVideoPresets,
    synthesizeSceneVideo,
    synthesizeStoryboardVideo,
    exportVideo,
  }
})
