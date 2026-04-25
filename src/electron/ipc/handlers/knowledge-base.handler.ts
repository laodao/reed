/**
 * 知识库 IPC 处理器
 * @module ipc/handlers/knowledge-base
 * @description 处理知识库相关的 IPC 请求
 */

import { ipcMain, BrowserWindow } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { KnowledgeBaseService } from '../../services/knowledge-base.service'
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
} from '@shared/types/knowledge-base.types'
import type { IpcResponse } from '@shared/types/ipc.types'

// 知识库服务实例
let knowledgeBaseService: KnowledgeBaseService | null = null

/**
 * 获取知识库服务实例
 */
function getKnowledgeBaseService(): KnowledgeBaseService {
  if (!knowledgeBaseService) {
    knowledgeBaseService = new KnowledgeBaseService()
  }
  return knowledgeBaseService
}

/**
 * 注册知识库相关 IPC 处理器
 */
export function registerKnowledgeBaseHandlers(): void {
  // ==================== 知识库管理 ====================

  // 获取知识库列表
  ipcMain.handle('knowledge-base:list', handleGetKnowledgeBases)

  // 获取知识库详情
  ipcMain.handle('knowledge-base:get', handleGetKnowledgeBase)

  // 创建知识库
  ipcMain.handle('knowledge-base:create', handleCreateKnowledgeBase)

  // 更新知识库
  ipcMain.handle('knowledge-base:update', handleUpdateKnowledgeBase)

  // 删除知识库
  ipcMain.handle('knowledge-base:delete', handleDeleteKnowledgeBase)

  // ==================== 文档管理 ====================

  // 上传文档
  ipcMain.handle('knowledge-base:upload-documents', handleUploadDocuments)

  // 添加文档（直接添加文本内容）
  ipcMain.handle('knowledge-base:add-document', handleAddDocument)

  // 添加网页
  ipcMain.handle('knowledge-base:add-webpage', handleAddWebpage)

  // 获取文档列表
  ipcMain.handle('knowledge-base:get-documents', handleGetDocuments)

  // 删除文档
  ipcMain.handle('knowledge-base:delete-document', handleDeleteDocument)

  // 重新处理文档
  ipcMain.handle('knowledge-base:reprocess-document', handleReprocessDocument)

  // 获取文档分片
  ipcMain.handle('knowledge-base:get-document-chunks', handleGetDocumentChunks)

  // 分页获取文档分片
  ipcMain.handle('knowledge-base:get-document-chunks-paginated', handleGetDocumentChunksPaginated)

  // 获取单个切片详情
  ipcMain.handle('knowledge-base:get-chunk', handleGetChunk)

  // ==================== 检索服务 ====================

  // 检索知识库
  ipcMain.handle('knowledge-base:search', handleSearch)

  // ==================== Embedding 模型 ====================

  // 获取可用的 Embedding 模型
  ipcMain.handle('knowledge-base:get-embedding-models', handleGetEmbeddingModels)

  // ==================== 文件选择 ====================

  // 选择文件
  ipcMain.handle('knowledge-base:select-files', handleSelectFiles)

  // 获取文件限制信息
  ipcMain.handle('knowledge-base:get-file-limits', handleGetFileLimits)

  console.log('[KnowledgeBaseHandlers] 知识库 IPC 处理器已注册')
}

// ==================== 知识库管理处理器 ====================

/**
 * 处理获取知识库列表
 */
async function handleGetKnowledgeBases(
  _event: IpcMainInvokeEvent
): Promise<IpcResponse<KnowledgeBase[]>> {
  const service = getKnowledgeBaseService()
  return await service.getKnowledgeBases()
}

/**
 * 处理获取知识库详情
 */
async function handleGetKnowledgeBase(
  _event: IpcMainInvokeEvent,
  id: string
): Promise<IpcResponse<KnowledgeBase>> {
  const service = getKnowledgeBaseService()
  return await service.getKnowledgeBase(id)
}

/**
 * 处理创建知识库
 */
async function handleCreateKnowledgeBase(
  _event: IpcMainInvokeEvent,
  request: CreateKnowledgeBaseRequest
): Promise<IpcResponse<KnowledgeBase>> {
  const service = getKnowledgeBaseService()
  return await service.createKnowledgeBase(request)
}

/**
 * 处理更新知识库
 */
async function handleUpdateKnowledgeBase(
  _event: IpcMainInvokeEvent,
  data: { id: string; request: UpdateKnowledgeBaseRequest }
): Promise<IpcResponse<void>> {
  const service = getKnowledgeBaseService()
  return await service.updateKnowledgeBase(data.id, data.request)
}

/**
 * 处理删除知识库
 */
async function handleDeleteKnowledgeBase(
  _event: IpcMainInvokeEvent,
  id: string
): Promise<IpcResponse<void>> {
  const service = getKnowledgeBaseService()
  return await service.deleteKnowledgeBase(id)
}

// ==================== 文档管理处理器 ====================

/**
 * 处理上传文档
 */
async function handleUploadDocuments(
  event: IpcMainInvokeEvent,
  data: { knowledgeBaseId: string; files: FileInfo[] }
): Promise<IpcResponse<KbDocument[]>> {
  const service = getKnowledgeBaseService()
  return await service.uploadDocuments(data.knowledgeBaseId, data.files)
}

/**
 * 处理添加文档（直接添加文本内容）
 */
async function handleAddDocument(
  _event: IpcMainInvokeEvent,
  data: { knowledgeBaseId: string; data: { name: string; type: 'text'; content: string } }
): Promise<IpcResponse<KbDocument>> {
  const service = getKnowledgeBaseService()
  return await service.addDocument(data.knowledgeBaseId, data.data)
}

/**
 * 处理添加网页
 */
async function handleAddWebpage(
  _event: IpcMainInvokeEvent,
  data: { knowledgeBaseId: string; url: string }
): Promise<IpcResponse<KbDocument>> {
  const service = getKnowledgeBaseService()
  return await service.addWebpage(data.knowledgeBaseId, data.url)
}

/**
 * 处理获取文档列表
 */
async function handleGetDocuments(
  _event: IpcMainInvokeEvent,
  knowledgeBaseId: string
): Promise<IpcResponse<KbDocument[]>> {
  const service = getKnowledgeBaseService()
  return await service.getDocuments(knowledgeBaseId)
}

/**
 * 处理删除文档
 */
async function handleDeleteDocument(
  _event: IpcMainInvokeEvent,
  documentId: string
): Promise<IpcResponse<void>> {
  const service = getKnowledgeBaseService()
  return await service.deleteDocument(documentId)
}

/**
 * 处理重新处理文档
 */
async function handleReprocessDocument(
  _event: IpcMainInvokeEvent,
  documentId: string
): Promise<IpcResponse<void>> {
  const service = getKnowledgeBaseService()
  return await service.reprocessDocument(documentId)
}

/**
 * 处理获取文档分片
 */
async function handleGetDocumentChunks(
  _event: IpcMainInvokeEvent,
  documentId: string
): Promise<IpcResponse<KbChunk[]>> {
  const service = getKnowledgeBaseService()
  return await service.getDocumentChunks(documentId)
}

/**
 * 处理分页获取文档分片
 */
async function handleGetDocumentChunksPaginated(
  _event: IpcMainInvokeEvent,
  data: { documentId: string; page: number; pageSize: number }
): Promise<IpcResponse<{ chunks: KbChunk[]; total: number }>> {
  const service = getKnowledgeBaseService()
  return await service.getDocumentChunksPaginated(data.documentId, data.page, data.pageSize)
}

/**
 * 处理获取单个切片详情
 */
async function handleGetChunk(
  _event: IpcMainInvokeEvent,
  chunkId: string
): Promise<IpcResponse<KbChunk>> {
  const service = getKnowledgeBaseService()
  return await service.getChunkById(chunkId)
}

// ==================== 检索服务处理器 ====================

/**
 * 处理检索知识库
 */
async function handleSearch(
  _event: IpcMainInvokeEvent,
  request: SearchRequest
): Promise<IpcResponse<SearchResult[]>> {
  const service = getKnowledgeBaseService()
  return await service.search(request)
}

// ==================== Embedding 模型处理器 ====================

/**
 * 处理获取可用的 Embedding 模型
 */
async function handleGetEmbeddingModels(
  _event: IpcMainInvokeEvent
): Promise<IpcResponse<EmbeddingModel[]>> {
  const service = getKnowledgeBaseService()
  return await service.getEmbeddingModels()
}

// ==================== 文件选择处理器 ====================

/**
 * 处理选择文件
 */
async function handleSelectFiles(
  event: IpcMainInvokeEvent
): Promise<IpcResponse<FileInfo[]>> {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window) {
    return { success: false, error: '窗口不存在' }
  }

  const service = getKnowledgeBaseService()
  return await service.selectFiles(window)
}

// ==================== 文件限制信息 ====================

/**
 * 处理获取文件限制信息
 */
async function handleGetFileLimits(
  _event: IpcMainInvokeEvent
): Promise<IpcResponse<{
  maxFileSize: number
  maxFilesPerUpload: number
  supportedTypes: string[]
}>> {
  const service = getKnowledgeBaseService()
  const limits = service.getFileLimits()
  return { success: true, data: limits }
}