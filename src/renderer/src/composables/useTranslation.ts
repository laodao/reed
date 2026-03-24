/**
 * 翻译功能 Composable
 * @module composables/useTranslation
 */

import { ref, computed, onMounted, onUnmounted } from 'vue'
import type {
  LanguageCode,
  Language,
  TranslationRecord,
  TextTranslationRequest,
  TranslationHistoryQuery
} from '../../../shared/types/translation.types'
import { LANGUAGES, getLanguageName } from '../../../shared/types/translation.types'

/**
 * 翻译提供商
 */
interface TranslationProvider {
  id: string
  name: string
  models: Array<{
    id: string
    name: string
  }>
  configured: boolean
}

export function useTranslation() {
  // ==================== 状态 ====================

  /** 加载状态 */
  const loading = ref(false)

  /** 错误信息 */
  const error = ref<string | null>(null)

  /** 翻译中状态 */
  const translating = ref(false)

  /** 翻译提供商列表 */
  const providers = ref<TranslationProvider[]>([])

  /** 选中的提供商 ID */
  const selectedProviderId = ref<string>('')

  /** 选中的模型 ID */
  const selectedModelId = ref<string>('')

  /** 翻译历史列表 */
  const histories = ref<TranslationRecord[]>([])

  /** 历史总数 */
  const totalHistories = ref(0)

  /** 只看收藏 */
  const favoriteOnly = ref(false)

  /** 当前源语言 */
  const sourceLanguage = ref<LanguageCode>('auto')

  /** 当前目标语言 */
  const targetLanguage = ref<LanguageCode>('en')

  /** 源文本 */
  const sourceText = ref('')

  /** 目标文本 */
  const targetText = ref('')

  /** 文件翻译进度 */
  const fileProgress = ref(0)

  /** 选中的文件信息 */
  const selectedFile = ref<{ path: string; name: string; size: number } | null>(null)

  /** 实时翻译定时器 */
  let realtimeTimer: ReturnType<typeof setTimeout> | null = null

  /** 清理函数列表 */
  const cleanupFns: (() => void)[] = []

  // ==================== 计算属性 ====================

  /** 当前选中的提供商 */
  const selectedProvider = computed(() =>
    providers.value.find(p => p.id === selectedProviderId.value)
  )

  /** 当前提供商的模型列表 */
  const availableModels = computed(() => {
    const provider = selectedProvider.value
    return provider?.models || []
  })

  /** 是否有可用的提供商 */
  const hasProviders = computed(() => providers.value.length > 0)

  /** 源语言名称 */
  const sourceLanguageName = computed(() => getLanguageName(sourceLanguage.value))

  /** 目标语言名称 */
  const targetLanguageName = computed(() => getLanguageName(targetLanguage.value))

  /** 字符计数 */
  const charCount = computed(() => sourceText.value.length)

  /** 是否超过字符限制 */
  const isOverLimit = computed(() => charCount.value > 5000)

  // ==================== 方法 ====================

  /**
   * 加载翻译提供商列表
   */
  async function loadProviders(): Promise<void> {
    try {
      loading.value = true
      error.value = null

      const response = await window.electronAPI.translation.getProviders()

      if (response.success && response.data) {
        providers.value = response.data

        // 自动选择第一个已配置的提供商
        const configuredProvider = providers.value.find(p => p.configured)
        if (configuredProvider) {
          selectedProviderId.value = configuredProvider.id
          if (configuredProvider.models.length > 0) {
            selectedModelId.value = configuredProvider.models[0].id
          }
        }
      } else {
        error.value = response.error || '加载提供商失败'
      }
    } finally {
      loading.value = false
    }
  }

  /**
   * 加载翻译历史
   */
  async function loadHistories(page = 1, pageSize = 20): Promise<void> {
    try {
      loading.value = true
      error.value = null

      const query: TranslationHistoryQuery = {
        page,
        pageSize,
        favorite: favoriteOnly.value || undefined
      }

      const response = await window.electronAPI.translation.history(query)

      if (response.success && response.data) {
        histories.value = response.data.list
        totalHistories.value = response.data.total
      } else {
        error.value = response.error || '加载历史失败'
      }
    } finally {
      loading.value = false
    }
  }

  /**
   * 文本翻译
   */
  async function translateText(request?: Partial<TextTranslationRequest>): Promise<string | null> {
    try {
      translating.value = true
      error.value = null

      const response = await window.electronAPI.translation.text({
        text: request?.text || sourceText.value,
        sourceLanguage: request?.sourceLanguage || sourceLanguage.value,
        targetLanguage: request?.targetLanguage || targetLanguage.value,
        providerId: request?.providerId || selectedProviderId.value || undefined,
        modelId: request?.modelId || selectedModelId.value || undefined
      })

      if (response.success && response.data) {
        targetText.value = response.data.translatedText
        if (response.data.detectedLanguage) {
          sourceLanguage.value = response.data.detectedLanguage
        }
        // 刷新历史
        await loadHistories()
        return response.data.translatedText
      } else {
        error.value = response.error || '翻译失败'
        return null
      }
    } finally {
      translating.value = false
    }
  }

  /**
   * 选择文件
   */
  async function selectFile(): Promise<{ path: string; name: string; size: number } | null> {
    const response = await window.electronAPI.translation.selectFile()
    if (response.success && response.data) {
      selectedFile.value = response.data
      return response.data
    }
    error.value = response.error || '选择文件失败'
    return null
  }

  /**
   * 文件翻译
   */
  async function translateFile(): Promise<string | null> {
    if (!selectedFile.value) return null

    try {
      translating.value = true
      error.value = null
      fileProgress.value = 0

      const response = await window.electronAPI.translation.file({
        filePath: selectedFile.value.path,
        sourceLanguage: sourceLanguage.value,
        targetLanguage: targetLanguage.value,
        providerId: selectedProviderId.value || undefined,
        modelId: selectedModelId.value || undefined
      })

      if (response.success && response.data) {
        return response.data.translationId
      } else {
        error.value = response.error || '文件翻译失败'
        return null
      }
    } finally {
      translating.value = false
    }
  }

  /**
   * 切换收藏
   */
  async function toggleFavorite(id: string): Promise<boolean> {
    const response = await window.electronAPI.translation.toggleFavorite(id)
    if (response.success) {
      await loadHistories()
      return true
    }
    return false
  }

  /**
   * 删除记录
   */
  async function deleteHistory(id: string): Promise<boolean> {
    const response = await window.electronAPI.translation.delete(id)
    if (response.success) {
      await loadHistories()
      return true
    }
    return false
  }

  /**
   * 下载翻译结果
   */
  async function downloadResult(id: string): Promise<string | null> {
    const response = await window.electronAPI.translation.download(id)
    if (response.success && response.data) {
      return response.data
    }
    error.value = response.error || '下载失败'
    return null
  }

  /**
   * 切换收藏筛选
   */
  async function toggleFavoriteFilter(): Promise<void> {
    favoriteOnly.value = !favoriteOnly.value
    await loadHistories()
  }

  /**
   * 交换语言
   */
  function swapLanguages(): void {
    if (sourceLanguage.value === 'auto') return
    const temp = sourceLanguage.value
    sourceLanguage.value = targetLanguage.value
    targetLanguage.value = temp
  }

  /**
   * 实时翻译
   */
  function startRealtimeTranslation(): void {
    if (realtimeTimer) {
      clearTimeout(realtimeTimer)
    }
    realtimeTimer = setTimeout(() => {
      if (sourceText.value.trim()) {
        translateText()
      }
    }, 500)
  }

  /**
   * 停止实时翻译
   */
  function stopRealtimeTranslation(): void {
    if (realtimeTimer) {
      clearTimeout(realtimeTimer)
      realtimeTimer = null
    }
  }

  /**
   * 清空翻译
   */
  function clearTranslation(): void {
    sourceText.value = ''
    targetText.value = ''
    selectedFile.value = null
    fileProgress.value = 0
  }

  /**
   * 复制文本
   */
  async function copyText(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      return false
    }
  }

  // ==================== 生命周期 ====================

  onMounted(async () => {
    // 监听翻译进度
    const unsubProgress = window.electronAPI.translation.onProgress((data) => {
      fileProgress.value = data.progress
    })
    cleanupFns.push(unsubProgress)

    // 监听翻译完成
    const unsubCompleted = window.electronAPI.translation.onCompleted(async () => {
      await loadHistories()
    })
    cleanupFns.push(unsubCompleted)

    // 加载提供商和历史
    await loadProviders()
    await loadHistories()
  })

  onUnmounted(() => {
    stopRealtimeTranslation()
    cleanupFns.forEach(fn => fn())
  })

  return {
    // 状态
    loading,
    error,
    translating,
    providers,
    selectedProviderId,
    selectedModelId,
    histories,
    totalHistories,
    favoriteOnly,
    sourceLanguage,
    targetLanguage,
    sourceText,
    targetText,
    fileProgress,
    selectedFile,

    // 计算属性
    selectedProvider,
    availableModels,
    hasProviders,
    sourceLanguageName,
    targetLanguageName,
    charCount,
    isOverLimit,

    // 方法
    loadHistories,
    translateText,
    selectFile,
    translateFile,
    toggleFavorite,
    deleteHistory,
    downloadResult,
    toggleFavoriteFilter,
    swapLanguages,
    startRealtimeTranslation,
    stopRealtimeTranslation,
    clearTranslation,
    copyText,
    loadProviders,

    // 常量
    LANGUAGES
  }
}