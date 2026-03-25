/**
 * 知识库状态管理
 * @module stores/knowledge-base
 * @description 管理知识库、文档、检索等状态
 */

import { ref, computed, toRaw } from 'vue'
import { defineStore } from 'pinia'
import type {
  KnowledgeBase,
  CreateKnowledgeBaseRequest,
  UpdateKnowledgeBaseRequest,
  KbDocument,
  SearchRequest,
  SearchResult,
  EmbeddingModel,
  FileInfo
} from '../../../shared/types/knowledge-base.types'

/**
 * 使用知识库 Store
 */
export const useKnowledgeBaseStore = defineStore('knowledgeBase', () => {
  // ==================== 状态 ====================

  /**
   * 知识库列表
   */
  const knowledgeBases = ref<KnowledgeBase[]>([])

  /**
   * 当前选中的知识库
   */
  const currentKnowledgeBase = ref<KnowledgeBase | null>(null)

  /**
   * 当前知识库的文档列表
   */
  const documents = ref<KbDocument[]>([])

  /**
   * 检索结果
   */
  const searchResults = ref<SearchResult[]>([])

  /**
   * 可用的 Embedding 模型列表
   */
  const embeddingModels = ref<EmbeddingModel[]>([])

  /**
   * 是否正在加载
   */
  const isLoading = ref(false)

  /**
   * 是否正在检索
   */
  const isSearching = ref(false)

  /**
   * 错误信息
   */
  const error = ref<string | null>(null)

  // ==================== 计算属性 ====================

  /**
   * 知识库数量
   */
  const knowledgeBaseCount = computed(() => knowledgeBases.value.length)

  /**
   * 当前知识库是否已选择
   */
  const hasCurrentKnowledgeBase = computed(() => currentKnowledgeBase.value !== null)

  /**
   * 当前知识库的文档数量
   */
  const documentCount = computed(() => documents.value.length)

  // ==================== 知识库管理 ====================

  /**
   * 加载知识库列表
   */
  async function loadKnowledgeBases(): Promise<void> {
    isLoading.value = true
    error.value = null

    try {
      const response = await window.electronAPI.knowledgeBase.list()
      if (response.success && response.data) {
        knowledgeBases.value = response.data
      } else {
        error.value = response.error || '加载知识库列表失败'
      }
    } catch (err: any) {
      error.value = err.message || '加载知识库列表失败'
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 选择知识库
   */
  async function selectKnowledgeBase(id: string): Promise<void> {
    isLoading.value = true
    error.value = null

    try {
      const response = await window.electronAPI.knowledgeBase.get(id)
      if (response.success && response.data) {
        currentKnowledgeBase.value = response.data
        // 加载该知识库的文档
        await loadDocuments(id)
      } else {
        error.value = response.error || '获取知识库详情失败'
      }
    } catch (err: any) {
      error.value = err.message || '获取知识库详情失败'
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 创建知识库
   */
  async function createKnowledgeBase(request: CreateKnowledgeBaseRequest): Promise<KnowledgeBase | null> {
    isLoading.value = true
    error.value = null

    try {
      // 使用 toRaw 确保数据可序列化
      const rawRequest = toRaw(request) as CreateKnowledgeBaseRequest
      const response = await window.electronAPI.knowledgeBase.create(rawRequest)
      if (response.success && response.data) {
        knowledgeBases.value.push(response.data)
        return response.data
      } else {
        error.value = response.error || '创建知识库失败'
        return null
      }
    } catch (err: any) {
      error.value = err.message || '创建知识库失败'
      return null
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 更新知识库
   */
  async function updateKnowledgeBase(id: string, request: UpdateKnowledgeBaseRequest): Promise<boolean> {
    isLoading.value = true
    error.value = null

    try {
      const response = await window.electronAPI.knowledgeBase.update(id, request)
      if (response.success) {
        // 更新列表中的知识库
        const index = knowledgeBases.value.findIndex(kb => kb.id === id)
        if (index !== -1) {
          const kb = knowledgeBases.value[index]
          knowledgeBases.value[index] = {
            ...kb,
            ...request,
            updatedAt: new Date().toISOString()
          }
        }
        // 更新当前选中的知识库
        if (currentKnowledgeBase.value?.id === id) {
          currentKnowledgeBase.value = {
            ...currentKnowledgeBase.value,
            ...request,
            updatedAt: new Date().toISOString()
          }
        }
        return true
      } else {
        error.value = response.error || '更新知识库失败'
        return false
      }
    } catch (err: any) {
      error.value = err.message || '更新知识库失败'
      return false
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 删除知识库
   */
  async function deleteKnowledgeBase(id: string): Promise<boolean> {
    isLoading.value = true
    error.value = null

    try {
      const response = await window.electronAPI.knowledgeBase.delete(id)
      if (response.success) {
        // 从列表中移除
        knowledgeBases.value = knowledgeBases.value.filter(kb => kb.id !== id)
        // 清除当前选中的知识库
        if (currentKnowledgeBase.value?.id === id) {
          currentKnowledgeBase.value = null
          documents.value = []
        }
        return true
      } else {
        error.value = response.error || '删除知识库失败'
        return false
      }
    } catch (err: any) {
      error.value = err.message || '删除知识库失败'
      return false
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 清除当前选中的知识库
   */
  function clearCurrentKnowledgeBase(): void {
    currentKnowledgeBase.value = null
    documents.value = []
    searchResults.value = []
  }

  // ==================== 文档管理 ====================

  /**
   * 加载文档列表
   */
  async function loadDocuments(knowledgeBaseId: string): Promise<void> {
    isLoading.value = true
    error.value = null

    try {
      const response = await window.electronAPI.knowledgeBase.getDocuments(knowledgeBaseId)
      if (response.success && response.data) {
        documents.value = response.data
      } else {
        error.value = response.error || '加载文档列表失败'
      }
    } catch (err: any) {
      error.value = err.message || '加载文档列表失败'
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 上传文档
   */
  async function uploadDocuments(files: FileInfo[]): Promise<KbDocument[] | null> {
    if (!currentKnowledgeBase.value) {
      error.value = '请先选择知识库'
      return null
    }

    isLoading.value = true
    error.value = null

    try {
      const response = await window.electronAPI.knowledgeBase.uploadDocuments(
        currentKnowledgeBase.value.id,
        files
      )
      if (response.success && response.data) {
        // 添加到文档列表
        documents.value.push(...response.data)
        // 刷新知识库信息
        await selectKnowledgeBase(currentKnowledgeBase.value.id)
        return response.data
      } else {
        error.value = response.error || '上传文档失败'
        return null
      }
    } catch (err: any) {
      error.value = err.message || '上传文档失败'
      return null
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 删除文档
   */
  async function deleteDocument(documentId: string): Promise<boolean> {
    isLoading.value = true
    error.value = null

    try {
      const response = await window.electronAPI.knowledgeBase.deleteDocument(documentId)
      if (response.success) {
        // 从列表中移除
        documents.value = documents.value.filter(doc => doc.id !== documentId)
        // 刷新知识库信息
        if (currentKnowledgeBase.value) {
          await selectKnowledgeBase(currentKnowledgeBase.value.id)
        }
        return true
      } else {
        error.value = response.error || '删除文档失败'
        return false
      }
    } catch (err: any) {
      error.value = err.message || '删除文档失败'
      return false
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 重新处理文档
   */
  async function reprocessDocument(documentId: string): Promise<boolean> {
    isLoading.value = true
    error.value = null

    try {
      const response = await window.electronAPI.knowledgeBase.reprocessDocument(documentId)
      if (response.success) {
        // 刷新文档列表
        if (currentKnowledgeBase.value) {
          await loadDocuments(currentKnowledgeBase.value.id)
        }
        return true
      } else {
        error.value = response.error || '重新处理文档失败'
        return false
      }
    } catch (err: any) {
      error.value = err.message || '重新处理文档失败'
      return false
    } finally {
      isLoading.value = false
    }
  }

  // ==================== 检索服务 ====================

  /**
   * 检索知识库
   */
  async function search(request: SearchRequest): Promise<SearchResult[]> {
    isSearching.value = true
    error.value = null

    try {
      const response = await window.electronAPI.knowledgeBase.search(request)
      if (response.success && response.data) {
        searchResults.value = response.data
        return response.data
      } else {
        error.value = response.error || '检索失败'
        searchResults.value = []
        return []
      }
    } catch (err: any) {
      error.value = err.message || '检索失败'
      searchResults.value = []
      return []
    } finally {
      isSearching.value = false
    }
  }

  /**
   * 清除检索结果
   */
  function clearSearchResults(): void {
    searchResults.value = []
  }

  // ==================== Embedding 模型 ====================

  /**
   * 加载可用的 Embedding 模型
   */
  async function loadEmbeddingModels(): Promise<void> {
    try {
      const response = await window.electronAPI.knowledgeBase.getEmbeddingModels()
      if (response.success && response.data) {
        embeddingModels.value = response.data
      }
    } catch (err: any) {
      console.error('加载 Embedding 模型失败:', err)
    }
  }

  // ==================== 文件选择 ====================

  /**
   * 选择文件
   */
  async function selectFiles(): Promise<FileInfo[] | null> {
    try {
      const response = await window.electronAPI.knowledgeBase.selectFiles()
      if (response.success && response.data) {
        return response.data
      } else {
        return null
      }
    } catch (err: any) {
      error.value = err.message || '选择文件失败'
      return null
    }
  }

  // ==================== 工具函数 ====================

  /**
   * 清除错误
   */
  function clearError(): void {
    error.value = null
  }

  /**
   * 重置状态
   */
  function reset(): void {
    knowledgeBases.value = []
    currentKnowledgeBase.value = null
    documents.value = []
    searchResults.value = []
    embeddingModels.value = []
    isLoading.value = false
    isSearching.value = false
    error.value = null
  }

  return {
    // 状态
    knowledgeBases,
    currentKnowledgeBase,
    documents,
    searchResults,
    embeddingModels,
    isLoading,
    isSearching,
    error,
    // 计算属性
    knowledgeBaseCount,
    hasCurrentKnowledgeBase,
    documentCount,
    // 知识库管理
    loadKnowledgeBases,
    selectKnowledgeBase,
    createKnowledgeBase,
    updateKnowledgeBase,
    deleteKnowledgeBase,
    clearCurrentKnowledgeBase,
    // 文档管理
    loadDocuments,
    uploadDocuments,
    deleteDocument,
    reprocessDocument,
    // 检索服务
    search,
    clearSearchResults,
    // Embedding 模型
    loadEmbeddingModels,
    // 文件选择
    selectFiles,
    // 工具函数
    clearError,
    reset
  }
})