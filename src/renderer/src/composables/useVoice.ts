/**
 * 语音功能 Composable
 * @module composables/useVoice
 */

import { ref, computed, onMounted, onUnmounted } from 'vue'
import type {
  VoiceProvider,
  VoiceSpeaker,
  VoiceRecord,
  TTSRequest,
  STTRequest,
  VoiceHistoryQuery,
  VoiceLanguageCode
} from '../../../shared/types/voice.types'
import { VOICE_LANGUAGES, getVoiceLanguageName } from '../../../shared/types/voice.types'

// 全局状态
const globalTTSGenerating = ref(false)
const globalSTTProcessing = ref(false)

export function useVoice() {
  // ==================== 状态 ====================

  /** 加载状态 */
  const loading = ref(false)

  /** 错误信息 */
  const error = ref<string | null>(null)

  /** TTS 生成中 */
  const ttsGenerating = globalTTSGenerating

  /** STT 处理中 */
  const sttProcessing = globalSTTProcessing

  /** 语音提供商列表 */
  const providers = ref<VoiceProvider[]>([])

  /** 发音人列表 */
  const voices = ref<VoiceSpeaker[]>([])

  /** 选中的提供商 ID */
  const selectedProviderId = ref<string>('')

  /** 选中的模型 ID */
  const selectedModelId = ref<string>('')

  /** 选中的发音人 ID */
  const selectedVoiceId = ref<string>('')

  /** 语音历史列表 */
  const histories = ref<VoiceRecord[]>([])

  /** 历史总数 */
  const totalHistories = ref(0)

  /** 只看收藏 */
  const favoriteOnly = ref(false)

  /** 当前语言 */
  const currentLanguage = ref<VoiceLanguageCode>('zh')

  /** 语速 (0.5-2.0) */
  const speed = ref(1.0)

  /** 音调 (-12 到 12) */
  const pitch = ref(0)

  /** 音量 (0-100) */
  const volume = ref(100)

  /** 输入文本 */
  const inputText = ref('')

  /** 输出音频路径 */
  const outputAudioPath = ref<string | null>(null)

  /** 选中的音频文件 */
  const selectedAudioFile = ref<{ path: string; name: string; size: number } | null>(null)

  /** 识别结果文本 */
  const recognizedText = ref('')

  /** 清理函数列表 */
  const cleanupFns: (() => void)[] = []

  // ==================== 计算属性 ====================

  /** 当前选中的提供商 */
  const selectedProvider = computed(() =>
    providers.value.find(p => p.id === selectedProviderId.value)
  )

  /** 所有提供商的模型列表 */
  const availableModels = computed(() => {
    const allModels: Array<{ id: string; name: string; providerId: string; providerName: string }> = []
    for (const provider of providers.value) {
      if (provider.models) {
        for (const model of provider.models) {
          allModels.push({
            id: model.id,
            name: model.name,
            providerId: provider.id,
            providerName: provider.name
          })
        }
      }
    }
    return allModels
  })

  /** 按提供商分组的模型列表（用于下拉选择） */
  const providerModels = computed(() => {
    const result: Array<{
      id: string
      name: string
      models: Array<{ id: string; name: string; providerId: string; providerName: string }>
    }> = []

    for (const provider of providers.value) {
      if (provider.models && provider.models.length > 0) {
        result.push({
          id: provider.id,
          name: provider.name,
          models: provider.models.map(model => ({
            id: model.id,
            name: model.name,
            providerId: provider.id,
            providerName: provider.name
          }))
        })
      }
    }

    return result
  })

  /** 是否有可用的提供商 */
  const hasProviders = computed(() => providers.value.length > 0)

  /** 当前语言名称 */
  const currentLanguageName = computed(() => getVoiceLanguageName(currentLanguage.value))

  /** 文本字符计数 */
  const charCount = computed(() => inputText.value.length)

  /** 是否超过字符限制 */
  const isOverLimit = computed(() => charCount.value > 5000)

  /** 当前发音人 */
  const selectedSpeaker = computed(() =>
    voices.value.find(v => v.id === selectedVoiceId.value)
  )

  // ==================== 方法 ====================

  /**
   * 加载语音提供商列表
   */
  async function loadProviders(): Promise<void> {
    try {
      loading.value = true
      error.value = null

      const response = await window.electronAPI.voice.getProviders()

      if (response.success && response.data) {
        providers.value = response.data

        // 自动选择第一个模型
        const allModels = availableModels.value
        if (allModels.length > 0) {
          selectedModelId.value = allModels[0].id
          selectedProviderId.value = allModels[0].providerId
        }
      } else {
        error.value = response.error || '加载提供商失败'
      }
    } finally {
      loading.value = false
    }
  }

  /**
   * 加载发音人列表
   */
  async function loadVoices(): Promise<void> {
    try {
      loading.value = true
      error.value = null

      const response = await window.electronAPI.voice.getVoices(selectedProviderId.value || undefined, currentLanguage.value)

      if (response.success && response.data) {
        voices.value = response.data

        // 默认选择第一个发音人
        if (voices.value.length > 0 && !selectedVoiceId.value) {
          selectedVoiceId.value = voices.value[0].id
        }
      } else {
        error.value = response.error || '加载发音人失败'
      }
    } finally {
      loading.value = false
    }
  }

  /**
   * 加载语音历史
   */
  async function loadHistories(page = 1, pageSize = 20, type?: 'tts' | 'stt'): Promise<void> {
    try {
      loading.value = true
      error.value = null

      const query: VoiceHistoryQuery = {
        page,
        pageSize,
        type,
        favorite: favoriteOnly.value || undefined
      }

      const response = await window.electronAPI.voice.history(query)

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
   * 文本转语音
   */
  async function generateSpeech(text?: string): Promise<string | null> {
    try {
      ttsGenerating.value = true
      error.value = null
      outputAudioPath.value = null

      // 从选中的模型中获取提供商 ID
      const selectedModelInfo = availableModels.value.find(m => m.id === selectedModelId.value)
      const providerId = selectedModelInfo?.providerId || selectedProviderId.value

      const request: TTSRequest = {
        text: text || inputText.value,
        voiceId: selectedVoiceId.value,
        language: currentLanguage.value,
        speed: speed.value,
        pitch: pitch.value,
        volume: volume.value,
        providerId: providerId || undefined,
        modelId: selectedModelId.value || undefined
      }

      const response = await window.electronAPI.voice.tts(request)

      if (response.success && response.data) {
        outputAudioPath.value = response.data.audioPath
        // 刷新历史
        await loadHistories()
        return response.data.audioPath
      } else {
        error.value = response.error || '语音生成失败'
        return null
      }
    } finally {
      ttsGenerating.value = false
    }
  }

  /**
   * 选择音频文件
   */
  async function selectAudioFile(): Promise<{ path: string; name: string; size: number } | null> {
    const response = await window.electronAPI.voice.selectFile()
    if (response.success && response.data) {
      selectedAudioFile.value = response.data
      return response.data
    }
    error.value = response.error || '选择文件失败'
    return null
  }

  /**
   * 语音转文本
   */
  async function recognizeSpeech(audioPath?: string, audioData?: string): Promise<string | null> {
    try {
      sttProcessing.value = true
      error.value = null
      recognizedText.value = ''

      // 从选中的模型中获取提供商 ID
      const selectedModelInfo = availableModels.value.find(m => m.id === selectedModelId.value)
      const providerId = selectedModelInfo?.providerId || selectedProviderId.value

      const request: STTRequest = {
        audioPath: audioPath || selectedAudioFile.value?.path,
        audioData,
        language: currentLanguage.value,
        providerId: providerId || undefined,
        modelId: selectedModelId.value || undefined
      }

      const response = await window.electronAPI.voice.stt(request)

      if (response.success && response.data) {
        recognizedText.value = response.data.text
        // 刷新历史
        await loadHistories()
        return response.data.text
      } else {
        error.value = response.error || '语音识别失败'
        return null
      }
    } finally {
      sttProcessing.value = false
    }
  }

  /**
   * 切换收藏
   */
  async function toggleFavorite(id: string): Promise<boolean> {
    const response = await window.electronAPI.voice.toggleFavorite(id)
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
    const response = await window.electronAPI.voice.delete(id)
    if (response.success) {
      await loadHistories()
      return true
    }
    return false
  }

  /**
   * 切换收藏筛选
   */
  async function toggleFavoriteFilter(): Promise<void> {
    favoriteOnly.value = !favoriteOnly.value
    await loadHistories()
  }

  /**
   * 清空输入
   */
  function clearInput(): void {
    inputText.value = ''
    outputAudioPath.value = null
    selectedAudioFile.value = null
    recognizedText.value = ''
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
    // 监听 TTS 完成
    const unsubTTS = window.electronAPI.voice.onTTSCompleted((data) => {
      outputAudioPath.value = data.audioPath
      ttsGenerating.value = false
    })
    cleanupFns.push(unsubTTS)

    // 监听 STT 完成
    const unsubSTT = window.electronAPI.voice.onSTTCompleted((data) => {
      recognizedText.value = data.text
      sttProcessing.value = false
    })
    cleanupFns.push(unsubSTT)

    // 加载提供商和发音人
    await loadProviders()
    await loadVoices()
    await loadHistories()
  })

  onUnmounted(() => {
    cleanupFns.forEach(fn => fn())
  })

  return {
    // 状态
    loading,
    error,
    ttsGenerating,
    sttProcessing,
    providers,
    voices,
    selectedProviderId,
    selectedModelId,
    selectedVoiceId,
    histories,
    totalHistories,
    favoriteOnly,
    currentLanguage,
    speed,
    pitch,
    volume,
    inputText,
    outputAudioPath,
    selectedAudioFile,
    recognizedText,

    // 计算属性
    selectedProvider,
    availableModels,
    providerModels,
    hasProviders,
    currentLanguageName,
    charCount,
    isOverLimit,
    selectedSpeaker,

    // 方法
    loadProviders,
    loadVoices,
    loadHistories,
    generateSpeech,
    selectAudioFile,
    recognizeSpeech,
    toggleFavorite,
    deleteHistory,
    toggleFavoriteFilter,
    clearInput,
    copyText,

    // 常量
    VOICE_LANGUAGES
  }
}