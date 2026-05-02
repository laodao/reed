/**
 * episode-production · 工作台 · store
 * @module renderer/stores/episode-production/workbench.store
 * @description 工作台全局共享状态：加载/生成中标志、错误信息、当前选中的模型配置。
 *              拆自原 src/renderer/src/stores/story-to-video.ts。
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useEpWorkbenchStore = defineStore('ep-workbench', () => {
  // ==================== 状态 ====================

  /**
   * 加载状态
   */
  const loading = ref(false)

  /**
   * AI 生成中状态
   */
  const generating = ref(false)

  /**
   * 错误信息
   */
  const error = ref<string | null>(null)

  /**
   * 当前选中的模型配置ID
   */
  const selectedProviderConfigId = ref<string | null>(null)

  /**
   * 当前选中的模型ID
   */
  const selectedModelId = ref<string | null>(null)

  // ==================== 操作 ====================

  /**
   * 更新选中的模型
   */
  function updateSelectedModel(providerConfigId: string, modelId: string): void {
    selectedProviderConfigId.value = providerConfigId
    selectedModelId.value = modelId
  }

  return {
    loading,
    generating,
    error,
    selectedProviderConfigId,
    selectedModelId,
    updateSelectedModel,
  }
})
