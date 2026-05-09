/**
 * episode-production · 分镜 · store
 * @module renderer/stores/episode-production/storyboard.store
 * @description 分镜列表、当前分镜及 AI 生成分镜操作。
 *              拆自原 src/renderer/src/stores/story-to-video.ts。
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Storyboard } from '../../../../shared/types/story-to-video.types'
import { useEpWorkbenchStore } from './workbench.store'

export const useEpStoryboardStore = defineStore('ep-storyboard', () => {
  // ==================== 状态 ====================

  /**
   * 当前场景的分镜列表
   */
  const storyboards = ref<Storyboard[]>([])

  // ==================== 分镜管理 ====================

  /**
   * 加载分镜列表
   */
  async function loadStoryboards(sceneScriptId: string): Promise<void> {
    const wb = useEpWorkbenchStore()
    wb.loading = true
    wb.error = null
    try {
      const response = await window.electronAPI.episodeProduction.listStoryboards(sceneScriptId)
      if (response.success && response.data) {
        storyboards.value = response.data as Storyboard[]
      } else {
        wb.error = response.error || '加载分镜列表失败'
      }
    } catch (e: any) {
      wb.error = e.message || '加载分镜列表失败'
    } finally {
      wb.loading = false
    }
  }

  /**
   * 更新分镜
   */
  async function updateStoryboard(storyboardId: string, data: Partial<Storyboard>): Promise<boolean> {
    const wb = useEpWorkbenchStore()
    wb.error = null
    try {
      const response = await window.electronAPI.episodeProduction.updateStoryboard(
        storyboardId,
        JSON.parse(JSON.stringify(data))
      )
      if (response.success && response.data) {
        const updatedStoryboard = response.data as Storyboard
        const index = storyboards.value.findIndex(s => s.id === storyboardId)
        if (index !== -1) {
          storyboards.value[index] = updatedStoryboard
        }
        return true
      } else {
        wb.error = response.error || '更新分镜失败'
        return false
      }
    } catch (e: any) {
      wb.error = e.message || '更新分镜失败'
      return false
    }
  }

  /**
   * 删除分镜（级联清理 keyframes + characters，并重排剩余分镜的 shotNumber）。
   * 后端删完后这里只做本地列表回填：把 sceneScriptId 重新拉一次，避免本地 shotNumber 与后端重排结果不一致。
   *
   * 返回 { ok, error } —— UI 用 error 字段展示后端真实失败原因（之前只返 boolean，
   * UI 只能弹通用 "删除分镜失败"，定位问题非常困难）。
   */
  async function deleteStoryboard(
    storyboardId: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const wb = useEpWorkbenchStore()
    wb.error = null
    try {
      const response = await window.electronAPI.episodeProduction.deleteStoryboard(storyboardId)
      if (!response.success) {
        const msg = response.error || '删除分镜失败'
        wb.error = msg
        return { ok: false, error: msg }
      }
      const sceneId = (response.data as { sceneScriptId?: string } | undefined)?.sceneScriptId
      if (sceneId) {
        await loadStoryboards(sceneId)
      } else {
        storyboards.value = storyboards.value.filter((s) => s.id !== storyboardId)
      }
      return { ok: true }
    } catch (e: any) {
      const msg = e?.message || '删除分镜失败'
      wb.error = msg
      return { ok: false, error: msg }
    }
  }

  // ==================== AI 生成 ====================

  /**
   * 生成分镜
   */
  async function generateStoryboard(
    sceneId: string,
    providerConfigId?: string,
    modelId?: string
  ): Promise<Storyboard[] | null> {
    const wb = useEpWorkbenchStore()
    wb.generating = true
    wb.error = null
    try {
      const response = await window.electronAPI.episodeProduction.generateStoryboard(
        sceneId,
        providerConfigId,
        modelId
      )
      if (response.success && response.data) {
        const result = response.data as Storyboard[]
        storyboards.value = result
        return result
      } else {
        wb.error = response.error || '生成分镜失败'
        return null
      }
    } catch (e: any) {
      wb.error = e.message || '生成分镜失败'
      return null
    } finally {
      wb.generating = false
    }
  }

  /**
   * 批量生成分镜
   */
  async function generateStoryboards(
    scriptId: string,
    providerConfigId?: string,
    modelId?: string
  ): Promise<Storyboard[] | null> {
    const wb = useEpWorkbenchStore()
    wb.generating = true
    wb.error = null
    try {
      const response = await window.electronAPI.episodeProduction.generateStoryboards(
        scriptId,
        providerConfigId,
        modelId
      )
      if (response.success && response.data) {
        const result = response.data as Storyboard[]
        // 更新当前场景的分镜（依赖 script store 的 currentScene）
        // 注意：此处通过动态 import 避免循环依赖
        const { useEpScriptStore } = await import('./script.store')
        const scriptStore = useEpScriptStore()
        if (scriptStore.currentScene) {
          storyboards.value = result.filter(s => s.sceneScriptId === scriptStore.currentScene!.id)
        }
        return result
      } else {
        wb.error = response.error || '批量生成分镜失败'
        return null
      }
    } catch (e: any) {
      wb.error = e.message || '批量生成分镜失败'
      return null
    } finally {
      wb.generating = false
    }
  }

  return {
    storyboards,
    loadStoryboards,
    updateStoryboard,
    deleteStoryboard,
    generateStoryboard,
    generateStoryboards,
  }
})
