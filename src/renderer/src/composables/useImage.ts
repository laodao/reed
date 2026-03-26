/**
 * 图像生成功能 Composable
 * @module composables/useImage
 * @description 封装图像生成相关的状态和逻辑
 */

import { ref, computed, onMounted, onUnmounted } from 'vue'
import type {
  ImageProvider,
  ImageModel,
  ImageTaskStatus,
  ImageGenerationRequest
} from '../../../shared/types/image-provider.types'
import type { ImageRecord } from '../../../shared/types/image.types'

/**
 * 任务轮询间隔（毫秒）
 */
const POLL_INTERVAL = 2000

/**
 * 最大轮询次数（约 5 分钟）
 */
const MAX_POLL_COUNT = 150

/**
 * 图像生成事件类型
 */
interface ImageGenerationEvent {
  type: 'generation-started' | 'generation-progress' | 'generation-completed' | 'generation-failed'
  taskId: string
  images?: ImageRecord[]
  status?: string
  progress?: number
  error?: string
}

/**
 * 图像生成功能 Composable
 */
export function useImage() {
  // ==================== 状态 ====================

  /**
   * 图像列表
   */
  const images = ref<ImageRecord[]>([])

  /**
   * 当前生成任务
   */
  const currentTask = ref<ImageTaskStatus | null>(null)

  /**
   * 提供商列表
   */
  const providers = ref<ImageProvider[]>([])

  /**
   * 当前选中的提供商 ID
   */
  const selectedProviderId = ref<string>('')

  /**
   * 当前选中的模型 ID
   */
  const selectedModelId = ref<string>('')

  /**
   * 加载状态
   */
  const loading = ref(false)

  /**
   * 生成中状态
   */
  const generating = ref(false)

  /**
   * 错误信息
   */
  const error = ref<string | null>(null)

  /**
   * 分页信息
   */
  const pagination = ref({
    page: 1,
    pageSize: 20,
    total: 0,
    hasMore: false
  })

  /**
   * 是否只显示收藏
   */
  const favoriteOnly = ref(false)

  /**
   * 轮询定时器
   */
  let pollTimer: ReturnType<typeof setInterval> | null = null

  /**
   * 轮询计数器
   */
  let pollCount = 0

  /**
   * 事件监听器清理函数
   */
  let cleanupEventListener: (() => void) | null = null

  // ==================== 计算属性 ====================

  /**
   * 是否有选中的提供商
   */
  const hasSelectedProvider = computed(() => !!selectedProviderId.value)

  /**
   * 是否有选中的模型
   */
  const hasSelectedModel = computed(() => !!selectedModelId.value)

  /**
   * 当前选中的提供商
   */
  const selectedProvider = computed(() =>
    providers.value.find(p => p.id === selectedProviderId.value)
  )

  /**
   * 所有提供商的模型列表
   */
  const availableModels = computed(() => {
    const allModels: (ImageModel & { providerId: string; providerName: string })[] = []
    for (const provider of providers.value) {
      if (provider.models) {
        for (const model of provider.models) {
          allModels.push({
            ...model,
            providerId: provider.id,
            providerName: provider.name
          })
        }
      }
    }
    return allModels
  })

  /**
   * 按提供商分组的模型列表（用于下拉选择）
   */
  const providerModels = computed(() => {
    const result: Array<{
      id: string
      name: string
      models: Array<ImageModel & { providerId: string; providerName: string }>
    }> = []

    for (const provider of providers.value) {
      if (provider.models && provider.models.length > 0) {
        result.push({
          id: provider.id,
          name: provider.name,
          models: provider.models.map(model => ({
            ...model,
            providerId: provider.id,
            providerName: provider.name
          }))
        })
      }
    }

    return result
  })

  /**
   * 当前选中的模型
   */
  const selectedModel = computed(() =>
    availableModels.value.find(m => m.id === selectedModelId.value)
  )

  /**
   * 当前任务的进度百分比
   */
  const taskProgress = computed(() => {
    if (!currentTask.value) return 0
    if (currentTask.value.status === 'completed') return 100
    if (currentTask.value.status === 'failed') return 0
    return currentTask.value.progress || 0
  })

  /**
   * 是否有更多图像
   */
  const hasMore = computed(() => pagination.value.hasMore)

  // ==================== 方法 ====================

  /**
   * 初始化
   */
  async function initialize(): Promise<void> {
    await Promise.all([
      loadProviders(),
      loadImages()
    ])
  }

  /**
   * 加载提供商列表
   */
  async function loadProviders(): Promise<void> {
    try {
      loading.value = true
      error.value = null

      const response = await window.electronAPI.image.getProviders()

      if (response.success && response.data) {
        providers.value = response.data

        // 加载所有提供商的模型
        for (const provider of providers.value) {
          if (provider.configured) {
            await loadModels(provider.id)
          }
        }

        // 自动选择第一个模型
        const allModels = availableModels.value
        if (allModels.length > 0) {
          selectedModelId.value = allModels[0].id
          selectedProviderId.value = allModels[0].providerId
        }
      } else {
        error.value = response.error || '加载提供商失败'
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '未知错误'
      error.value = errorMessage
      console.error('加载提供商失败:', err)
    } finally {
      loading.value = false
    }
  }

  /**
   * 加载模型列表
   * @param providerId - 提供商 ID（可选，默认使用当前选中的提供商）
   */
  async function loadModels(providerId?: string): Promise<ImageModel[]> {
    try {
      const id = providerId || selectedProviderId.value
      if (!id) return []

      const response = await window.electronAPI.image.getModels(id)

      if (response.success && response.data) {
        // 更新提供商的模型列表
        const provider = providers.value.find(p => p.id === id)
        if (provider) {
          provider.models = response.data
        }
        return response.data
      }
      return []
    } catch (err) {
      console.error('加载模型列表失败:', err)
      return []
    }
  }

  /**
   * 选择提供商
   * @param providerId - 提供商 ID
   */
  async function selectProvider(providerId: string): Promise<void> {
    selectedProviderId.value = providerId
    selectedModelId.value = ''

    // 加载该提供商的模型
    const models = await loadModels(providerId)
    if (models.length > 0) {
      selectedModelId.value = models[0].id
    }
  }

  /**
   * 选择模型
   * @param modelId - 模型 ID
   */
  function selectModel(modelId: string): void {
    selectedModelId.value = modelId
  }

  /**
   * 生成图像
   * @param request - 生成请求参数
   * @returns 任务 ID 或 null
   */
  async function generateImage(
    request: Omit<ImageGenerationRequest, 'model'> & { model?: string }
  ): Promise<string | null> {
    try {
      generating.value = true
      error.value = null
      currentTask.value = null

      // 从选中的模型中获取提供商 ID
      const selectedModelInfo = availableModels.value.find(m => m.id === selectedModelId.value)
      const providerId = selectedModelInfo?.providerId || selectedProviderId.value

      if (!providerId) {
        error.value = '请选择模型'
        return null
      }

      if (!selectedModelId.value && !request.model) {
        error.value = '请选择模型'
        return null
      }

      // 构建请求
      const generationRequest: ImageGenerationRequest = {
        model: request.model || selectedModelId.value,
        prompt: request.prompt,
        negativePrompt: request.negativePrompt,
        width: request.width || 1024,
        height: request.height || 1024,
        style: request.style,
        quality: request.quality,
        count: request.count || 1,
        seed: request.seed,
        referenceImage: request.referenceImage
      }

      const response = await window.electronAPI.image.generate({
        providerId: providerId,
        ...generationRequest
      })

      if (response.success && response.data?.taskId) {
        const taskId = response.data.taskId

        // 初始化任务状态
        currentTask.value = {
          taskId,
          status: 'pending',
          progress: 0
        }

        // 开始轮询任务状态
        startPolling(taskId)

        return taskId
      } else {
        error.value = response.error || '生成图像失败'
        return null
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '未知错误'
      error.value = errorMessage
      console.error('生成图像失败:', err)
      return null
    } finally {
      generating.value = false
    }
  }

  /**
   * 开始轮询任务状态
   * @param taskId - 任务 ID
   */
  function startPolling(taskId: string): void {
    // 清理之前的轮询
    stopPolling()

    // 重置计数器
    pollCount = 0

    // 开始轮询
    pollTimer = setInterval(async () => {
      pollCount++

      // 检查是否超过最大轮询次数
      if (pollCount >= MAX_POLL_COUNT) {
        stopPolling()
        error.value = '任务超时，请稍后查看结果'
        return
      }

      try {
        const response = await window.electronAPI.image.getTaskStatus(taskId)

        if (response.success && response.data) {
          currentTask.value = response.data

          // 如果任务完成或失败，停止轮询
          if (response.data.status === 'completed' || response.data.status === 'failed') {
            stopPolling()

            // 如果成功，刷新图像列表
            if (response.data.status === 'completed') {
              await loadImages()
            }

            // 如果失败，设置错误信息
            if (response.data.status === 'failed') {
              error.value = response.data.error || '图像生成失败'
            }
          }
        }
      } catch (err) {
        console.error('轮询任务状态失败:', err)
      }
    }, POLL_INTERVAL)
  }

  /**
   * 停止轮询
   */
  function stopPolling(): void {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  /**
   * 停止生成
   */
  async function stopGeneration(): Promise<void> {
    if (!currentTask.value?.taskId) return

    try {
      const response = await window.electronAPI.image.stop(currentTask.value.taskId)

      if (response.success) {
        stopPolling()
        currentTask.value = {
          ...currentTask.value,
          status: 'failed',
          error: '用户取消生成'
        }
      }
    } catch (err) {
      console.error('停止生成失败:', err)
    }
  }

  /**
   * 加载图像列表
   * @param page - 页码（可选，默认重置为第一页）
   */
  async function loadImages(page?: number): Promise<void> {
    try {
      loading.value = true
      error.value = null

      const targetPage = page ?? 1
      const response = await window.electronAPI.image.list(
        targetPage,
        pagination.value.pageSize,
        favoriteOnly.value
      )

      if (response.success && response.data) {
        images.value = response.data.images
        pagination.value = {
          ...pagination.value,
          page: targetPage,
          total: response.data.total,
          hasMore: response.data.hasMore
        }
      } else {
        error.value = response.error || '加载图像列表失败'
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '未知错误'
      error.value = errorMessage
      console.error('加载图像列表失败:', err)
    } finally {
      loading.value = false
    }
  }

  /**
   * 加载更多图像
   */
  async function loadMoreImages(): Promise<void> {
    if (!hasMore.value || loading.value) return

    try {
      loading.value = true

      const nextPage = pagination.value.page + 1
      const response = await window.electronAPI.image.list(
        nextPage,
        pagination.value.pageSize,
        favoriteOnly.value
      )

      if (response.success && response.data) {
        images.value = [...images.value, ...response.data.images]
        pagination.value = {
          ...pagination.value,
          page: nextPage,
          total: response.data.total,
          hasMore: response.data.hasMore
        }
      }
    } catch (err) {
      console.error('加载更多图像失败:', err)
    } finally {
      loading.value = false
    }
  }

  /**
   * 切换收藏筛选
   */
  async function toggleFavoriteFilter(): Promise<void> {
    favoriteOnly.value = !favoriteOnly.value
    await loadImages(1)
  }

  /**
   * 切换图像收藏状态
   * @param id - 图像 ID
   */
  async function toggleFavorite(id: string): Promise<boolean> {
    try {
      const response = await window.electronAPI.image.toggleFavorite(id)

      if (response.success) {
        // 更新本地状态
        const image = images.value.find(img => img.id === id)
        if (image) {
          image.favorite = !image.favorite
        }
        return true
      }
      return false
    } catch (err) {
      console.error('切换收藏状态失败:', err)
      return false
    }
  }

  /**
   * 删除图像
   * @param id - 图像 ID
   */
  async function deleteImage(id: string): Promise<boolean> {
    try {
      const response = await window.electronAPI.image.delete(id)

      if (response.success) {
        // 从列表中移除
        images.value = images.value.filter(img => img.id !== id)
        pagination.value.total--
        return true
      }
      return false
    } catch (err) {
      console.error('删除图像失败:', err)
      return false
    }
  }

  /**
   * 批量删除图像
   * @param ids - 图像 ID 列表
   */
  async function deleteImages(ids: string[]): Promise<number> {
    try {
      const response = await window.electronAPI.image.deleteMany(ids)

      if (response.success && response.data !== undefined) {
        const count = response.data
        // 从列表中移除
        images.value = images.value.filter(img => !ids.includes(img.id))
        pagination.value.total -= count
        return count
      }
      return 0
    } catch (err) {
      console.error('批量删除图像失败:', err)
      return 0
    }
  }

  /**
   * 获取单个图像详情
   * @param id - 图像 ID
   */
  async function getImage(id: string): Promise<ImageRecord | null> {
    try {
      const response = await window.electronAPI.image.get(id)

      if (response.success && response.data) {
        return response.data
      }
      return null
    } catch (err) {
      console.error('获取图像详情失败:', err)
      return null
    }
  }

  /**
   * 测试提供商连接
   * @param providerId - 提供商 ID
   */
  async function testProvider(providerId: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await window.electronAPI.image.testProvider(providerId)

      if (response.success && response.data) {
        return response.data
      }
      return {
        success: false,
        message: response.error || '测试连接失败'
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '未知错误'
      return {
        success: false,
        message: errorMessage
      }
    }
  }

  /**
   * 清理资源
   */
  function cleanup(): void {
    stopPolling()
    images.value = []
    currentTask.value = null
    error.value = null
  }

  /**
   * 下载图像
   * @param imageId - 图像 ID
   * @returns 保存的文件路径或 null
   */
  async function downloadImage(imageId: string): Promise<string | null> {
    try {
      const response = await window.electronAPI.image.download(imageId)

      if (response.success && response.data) {
        return response.data
      }
      error.value = response.error || '下载失败'
      return null
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '未知错误'
      error.value = errorMessage
      console.error('下载图像失败:', err)
      return null
    }
  }

  /**
   * 选择参考图片
   * @returns 图片信息或 null
   */
  async function selectReferenceImage(): Promise<{ path: string; base64: string; name: string } | null> {
    try {
      const response = await window.electronAPI.image.selectFile()

      if (response.success && response.data) {
        return response.data
      }
      error.value = response.error || '选择图片失败'
      return null
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '未知错误'
      error.value = errorMessage
      console.error('选择参考图片失败:', err)
      return null
    }
  }

  // ==================== 生命周期 ====================

  /**
   * 处理图像生成事件
   */
  function handleGenerationEvent(event: any, data: ImageGenerationEvent): void {
    console.log('[useImage] 收到图像生成事件:', data)

    switch (data.type) {
      case 'generation-started':
        // 任务开始
        currentTask.value = {
          taskId: data.taskId,
          status: 'pending',
          progress: 0
        }
        break

      case 'generation-progress':
        // 任务进度更新
        if (currentTask.value && currentTask.value.taskId === data.taskId) {
          currentTask.value = {
            ...currentTask.value,
            status: data.status as any || 'processing',
            progress: data.progress || 0
          }
        }
        break

      case 'generation-completed':
        // 任务完成
        stopPolling()
        currentTask.value = {
          taskId: data.taskId,
          status: 'completed',
          progress: 100,
          images: data.images
        }
        // 刷新图像列表
        loadImages()
        break

      case 'generation-failed':
        // 任务失败
        stopPolling()
        currentTask.value = {
          taskId: data.taskId,
          status: 'failed',
          error: data.error || '图像生成失败'
        }
        error.value = data.error || '图像生成失败'
        break
    }
  }

  onMounted(() => {
    initialize()
    // 注册事件监听器
    cleanupEventListener = window.electronAPI.image.onGenerationEvent(handleGenerationEvent)
  })

  onUnmounted(() => {
    cleanup()
    // 清理事件监听器
    if (cleanupEventListener) {
      cleanupEventListener()
      cleanupEventListener = null
    }
  })

  return {
    // 状态
    images,
    currentTask,
    providers,
    selectedProviderId,
    selectedModelId,
    loading,
    generating,
    error,
    pagination,
    favoriteOnly,

    // 计算属性
    hasSelectedProvider,
    hasSelectedModel,
    selectedProvider,
    availableModels,
    providerModels,
    selectedModel,
    taskProgress,
    hasMore,

    // 方法
    initialize,
    loadProviders,
    loadModels,
    selectProvider,
    selectModel,
    generateImage,
    stopGeneration,
    loadImages,
    loadMoreImages,
    toggleFavoriteFilter,
    toggleFavorite,
    deleteImage,
    deleteImages,
    getImage,
    testProvider,
    downloadImage,
    selectReferenceImage,
    cleanup
  }
}