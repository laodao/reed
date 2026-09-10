/**
 * 知识库功能 Composable
 * @module composables/useKnowledgeBase
 */

import { ref, computed, onMounted, toRaw } from 'vue'
import { useKnowledgeBaseStore } from '../stores/knowledge-base'
import { storeToRefs } from 'pinia'
import type {
  KnowledgeBase,
  CreateKnowledgeBaseRequest,
  UpdateKnowledgeBaseRequest,
  KbDocument,
  KbChunk,
  SearchRequest,
  SearchResult,
  EmbeddingModel,
  FileInfo
} from '../../../shared/types/knowledge-base.types'

/**
 * 格式化文件大小
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
}

/**
 * 格式化日期
 */
function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/**
 * 获取文件类型图标
 */
function getFileTypeIcon(fileType: string): string {
  const icons: Record<string, string> = {
    pdf: 'document',
    docx: 'document',
    doc: 'document',
    txt: 'document-text',
    md: 'document-text',
    epub: 'book',
    mobi: 'book',
    azw3: 'book',
    xlsx: 'grid',
    xls: 'grid'
  }
  return icons[fileType] || 'document'
}

/**
 * 获取状态标签类型
 */
function getStatusType(status: string): 'primary' | 'success' | 'warning' | 'danger' | 'info' {
  const types: Record<string, 'primary' | 'success' | 'warning' | 'danger' | 'info'> = {
    pending: 'info',
    processing: 'primary',
    completed: 'success',
    failed: 'danger'
  }
  return types[status] || 'info'
}

/**
 * 获取状态标签文本
 */
function getStatusText(status: string): string {
  const texts: Record<string, string> = {
    pending: '待处理',
    processing: '处理中',
    completed: '已完成',
    failed: '失败'
  }
  return texts[status] || status
}

/**
 * 格式化剩余时间
 */
function formatEstimatedTime(seconds: number): string {
  if (seconds <= 0) return '即将完成'
  if (seconds < 60) return `约 ${seconds} 秒`
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60)
    const secs = seconds % 60
    return secs > 0 ? `约 ${minutes} 分 ${secs} 秒` : `约 ${minutes} 分钟`
  }
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return minutes > 0 ? `约 ${hours} 小时 ${minutes} 分` : `约 ${hours} 小时`
}

export function useKnowledgeBase() {
  // ==================== Store ====================

  const store = useKnowledgeBaseStore()
  const {
    knowledgeBases,
    currentKnowledgeBase,
    documents,
    searchResults,
    embeddingModels,
    isLoading,
    isSearching,
    error,
    knowledgeBaseCount,
    hasCurrentKnowledgeBase,
    documentCount,
    documentEstimatedTimes
  } = storeToRefs(store)

  // ==================== 本地状态 ====================

  /** 搜索关键词 */
  const searchQuery = ref('')

  /** 检索参数 */
  const searchTopK = ref(5)
  const searchVectorWeight = ref(0.7)
  const searchThreshold = ref(0.0)

  /** 选中的 Embedding 模型 */
  const selectedEmbeddingModel = ref<EmbeddingModel | null>(null)

  /** 新建知识库对话框 */
  const showCreateDialog = ref(false)
  const createForm = ref<CreateKnowledgeBaseRequest>({
    name: '',
    description: '',
    embeddingModel: '',
    embeddingDimension: 1536
  })

  /** 编辑知识库对话框 */
  const showEditDialog = ref(false)
  const editForm = ref<UpdateKnowledgeBaseRequest>({})

  // ==================== 计算属性 ====================

  /** 是否有可用的 Embedding 模型 */
  const hasEmbeddingModels = computed(() =>
    embeddingModels.value.length > 0
  )

  // ==================== 知识库管理 ====================

  /**
   * 加载知识库列表
   */
  async function loadKnowledgeBases(): Promise<void> {
    await store.loadKnowledgeBases()
  }

  /**
   * 选择知识库
   */
  async function selectKnowledgeBase(id: string): Promise<void> {
    await store.selectKnowledgeBase(id)
  }

  /**
   * 创建知识库
   */
  async function createKnowledgeBase(): Promise<KnowledgeBase | null> {
    // 使用 toRaw 确保数据可序列化
    const request = toRaw(createForm.value) as CreateKnowledgeBaseRequest
    const result = await store.createKnowledgeBase(request)
    if (result) {
      showCreateDialog.value = false
      resetCreateForm()
    }
    return result
  }

  /**
   * 更新知识库
   */
  async function updateKnowledgeBase(): Promise<boolean> {
    if (!currentKnowledgeBase.value) return false
    const result = await store.updateKnowledgeBase(currentKnowledgeBase.value.id, editForm.value)
    if (result) {
      showEditDialog.value = false
      resetEditForm()
    }
    return result
  }

  /**
   * 删除知识库
   */
  async function deleteKnowledgeBase(id: string): Promise<boolean> {
    return await store.deleteKnowledgeBase(id)
  }

  /**
   * 打开创建对话框
   */
  function openCreateDialog(): void {
    resetCreateForm()
    showCreateDialog.value = true
  }

  /**
   * 打开编辑对话框
   */
  function openEditDialog(): void {
    if (currentKnowledgeBase.value) {
      editForm.value = {
        name: currentKnowledgeBase.value.name,
        description: currentKnowledgeBase.value.description
      }
      showEditDialog.value = true
    }
  }

  /**
   * 重置创建表单
   */
  function resetCreateForm(): void {
    createForm.value.name = ''
    createForm.value.description = ''
    createForm.value.embeddingModel = ''
    createForm.value.embeddingDimension = 1536
    createForm.value.folderId = null
    delete createForm.value.embeddingConfig
    selectedEmbeddingModel.value = null
  }

  /**
   * 重置编辑表单
   */
  function resetEditForm(): void {
    editForm.value = {}
  }

  // ==================== 文档管理 ====================

  /**
   * 上传文档
   */
  async function uploadDocuments(files: FileInfo[]): Promise<KbDocument[] | null> {
    return await store.uploadDocuments(files)
  }

  /**
   * 选择并上传文件
   */
  async function selectAndUploadFiles(): Promise<KbDocument[] | null> {
    const files = await store.selectFiles()
    if (files && files.length > 0) {
      return await uploadDocuments(files)
    }
    return null
  }

  /**
   * 删除文档
   */
  async function deleteDocument(documentId: string): Promise<boolean> {
    return await store.deleteDocument(documentId)
  }

  /**
   * 重新处理文档
   */
  async function reprocessDocument(documentId: string): Promise<boolean> {
    return await store.reprocessDocument(documentId)
  }

  /**
   * 获取文档分片
   */
  async function getDocumentChunks(documentId: string): Promise<KbChunk[]> {
    return await store.getDocumentChunks(documentId)
  }

  // ==================== 检索服务 ====================

  /**
   * 检索知识库
   */
  async function searchKnowledgeBase(query?: string): Promise<SearchResult[]> {
    if (!currentKnowledgeBase.value) return []

    const request: SearchRequest = {
      knowledgeBaseId: currentKnowledgeBase.value.id,
      query: query || searchQuery.value,
      topK: searchTopK.value,
      vectorWeight: searchVectorWeight.value,
      threshold: searchThreshold.value
    }

    return await store.search(request)
  }

  /**
   * 清除检索结果
   */
  function clearSearchResults(): void {
    searchQuery.value = ''
    store.clearSearchResults()
  }

  // ==================== Embedding 模型 ====================

  /**
   * 加载 Embedding 模型列表
   */
  async function loadEmbeddingModels(): Promise<void> {
    await store.loadEmbeddingModels()
  }

  /**
   * 选择 Embedding 模型
   */
  function selectEmbeddingModel(model: EmbeddingModel): void {
    const rawModel = toRaw(model)
    selectedEmbeddingModel.value = rawModel
    createForm.value.embeddingModel = rawModel.id
    createForm.value.embeddingDimension = rawModel.dimension
    createForm.value.embeddingConfig = {
      provider: rawModel.provider,
      modelId: rawModel.id,
      providerConfigId: rawModel.providerConfigId,
      providerTemplateId: rawModel.providerTemplateId,
      ollamaBaseUrl: rawModel.ollamaBaseUrl
    }
  }

  // ==================== 工具函数 ====================

  /**
   * 清除错误
   */
  function clearError(): void {
    store.clearError()
  }

  /**
   * 重置状态
   */
  function reset(): void {
    store.reset()
    searchQuery.value = ''
    searchTopK.value = 5
    searchVectorWeight.value = 0.7
    searchThreshold.value = 0.0
    selectedEmbeddingModel.value = null
    showCreateDialog.value = false
    showEditDialog.value = false
    resetCreateForm()
    resetEditForm()
  }

  // ==================== 生命周期 ====================

  onMounted(async () => {
    // 加载知识库列表和 Embedding 模型
    await Promise.all([
      loadKnowledgeBases(),
      loadEmbeddingModels()
    ])
  })

  return {
    // Store 状态
    knowledgeBases,
    currentKnowledgeBase,
    documents,
    searchResults,
    embeddingModels,
    isLoading,
    isSearching,
    error,
    knowledgeBaseCount,
    hasCurrentKnowledgeBase,
    documentCount,
    documentEstimatedTimes,

    // 本地状态
    searchQuery,
    searchTopK,
    searchVectorWeight,
    searchThreshold,
    selectedEmbeddingModel,
    showCreateDialog,
    createForm,
    showEditDialog,
    editForm,

    // 计算属性
    hasEmbeddingModels,

    // 知识库管理
    loadKnowledgeBases,
    selectKnowledgeBase,
    createKnowledgeBase,
    updateKnowledgeBase,
    deleteKnowledgeBase,
    openCreateDialog,
    openEditDialog,

    // 文档管理
    uploadDocuments,
    selectAndUploadFiles,
    deleteDocument,
    reprocessDocument,
    getDocumentChunks,

    // 检索服务
    searchKnowledgeBase,
    clearSearchResults,

    // Embedding 模型
    loadEmbeddingModels,
    selectEmbeddingModel,

    // 工具函数
    clearError,
    reset,
    formatFileSize,
    formatDate,
    getFileTypeIcon,
    getStatusType,
    getStatusText,
    formatEstimatedTime,
    getEstimatedTime: store.getEstimatedTime
  }
}