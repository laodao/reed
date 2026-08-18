/**
 * 知识库 IPC 处理器
 * @module ipc/handlers/knowledge-base
 * @description 处理知识库相关的 IPC 请求
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import * as fs from 'fs'
import * as path from 'path'
import { KnowledgeBaseService } from '@core/services/knowledge-base.service'

const isElectron = !!(process.versions as Record<string, string | undefined>)?.electron

function loadElectron(): { BrowserWindow?: any; dialog?: any } {
  if (!isElectron) return {}
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const e = require('electron')
  return { BrowserWindow: e.BrowserWindow, dialog: e.dialog }
}
import type {
  KnowledgeBase,
  CreateKnowledgeBaseRequest,
  UpdateKnowledgeBaseRequest,
  KbDocument,
  KbChunk,
  SearchRequest,
  SearchResult,
  EmbeddingModel,
  FileInfo,
  DocumentSource,
  AddDocumentResult
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
  ipcBridge.handle('knowledge-base:list', handleGetKnowledgeBases)

  // 获取知识库详情
  ipcBridge.handle('knowledge-base:get', handleGetKnowledgeBase)

  // 创建知识库
  ipcBridge.handle('knowledge-base:create', handleCreateKnowledgeBase)

  // 更新知识库
  ipcBridge.handle('knowledge-base:update', handleUpdateKnowledgeBase)

  // 删除知识库
  ipcBridge.handle('knowledge-base:delete', handleDeleteKnowledgeBase)

  // ==================== D1 QA 问答对 ====================
  ipcBridge.handle('kb-qa:list', handleListQaPairs)
  ipcBridge.handle('kb-qa:add', handleAddQaPair)
  ipcBridge.handle('kb-qa:update', handleUpdateQaPair)
  ipcBridge.handle('kb-qa:delete', handleDeleteQaPair)
  ipcBridge.handle('kb-qa:search', handleSearchQa)
  ipcBridge.handle('kb-qa:import-xlsx', handleImportQaXlsx)
  ipcBridge.handle('kb-qa:export-xlsx', handleExportQaXlsx)

  // ==================== 文档管理 ====================

  // 上传文档
  ipcBridge.handle('knowledge-base:upload-documents', handleUploadDocuments)

  // 添加文档（直接添加文本内容）
  ipcBridge.handle('knowledge-base:add-document', handleAddDocument)

  // 添加网页
  ipcBridge.handle('knowledge-base:add-webpage', handleAddWebpage)

  // 获取文档列表
  ipcBridge.handle('knowledge-base:get-documents', handleGetDocuments)

  // 删除文档
  ipcBridge.handle('knowledge-base:delete-document', handleDeleteDocument)

  // 重新处理文档
  ipcBridge.handle('knowledge-base:reprocess-document', handleReprocessDocument)

  // 获取文档分片
  ipcBridge.handle('knowledge-base:get-document-chunks', handleGetDocumentChunks)

  // 分页获取文档分片
  ipcBridge.handle('knowledge-base:get-document-chunks-paginated', handleGetDocumentChunksPaginated)

  // 获取单个切片详情
  ipcBridge.handle('knowledge-base:get-chunk', handleGetChunk)

  // ==================== 检索服务 ====================

  // 检索知识库
  ipcBridge.handle('knowledge-base:search', handleSearch)

  // ==================== Embedding 模型 ====================

  // 获取可用的 Embedding 模型
  ipcBridge.handle('knowledge-base:get-embedding-models', handleGetEmbeddingModels)
  ipcBridge.handle('knowledge-base:get-rerank-models', handleGetRerankModels)

  // ==================== 文件选择 ====================

  // 选择文件
  ipcBridge.handle('knowledge-base:select-files', handleSelectFiles)

  // 获取文件限制信息
  ipcBridge.handle('knowledge-base:get-file-limits', handleGetFileLimits)

  console.log('[KnowledgeBaseHandlers] 知识库 IPC 处理器已注册')
}

// ==================== 知识库管理处理器 ====================

/**
 * 处理获取知识库列表
 */
async function handleGetKnowledgeBases(
  _event: any
): Promise<IpcResponse<KnowledgeBase[]>> {
  const service = getKnowledgeBaseService()
  return await service.getKnowledgeBases()
}

/**
 * 处理获取知识库详情
 */
async function handleGetKnowledgeBase(
  _event: any,
  id: string
): Promise<IpcResponse<KnowledgeBase>> {
  const service = getKnowledgeBaseService()
  return await service.getKnowledgeBase(id)
}

/**
 * 处理创建知识库
 */
async function handleCreateKnowledgeBase(
  _event: any,
  request: CreateKnowledgeBaseRequest
): Promise<IpcResponse<KnowledgeBase>> {
  const service = getKnowledgeBaseService()
  return await service.createKnowledgeBase(request)
}

/**
 * 处理更新知识库
 */
async function handleUpdateKnowledgeBase(
  _event: any,
  data: { id: string; request: UpdateKnowledgeBaseRequest }
): Promise<IpcResponse<void>> {
  const service = getKnowledgeBaseService()
  return await service.updateKnowledgeBase(data.id, data.request)
}

/**
 * 处理删除知识库
 */
async function handleDeleteKnowledgeBase(
  _event: any,
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
  event: any,
  data: { knowledgeBaseId: string; files: FileInfo[] }
): Promise<IpcResponse<KbDocument[]>> {
  const service = getKnowledgeBaseService()
  return await service.uploadDocuments(data.knowledgeBaseId, data.files)
}

/**
 * 处理添加文档（直接添加文本内容）
 */
async function handleAddDocument(
  _event: any,
  data: {
    knowledgeBaseId: string
    data: { name: string; type: 'text'; content: string; source?: DocumentSource }
  }
): Promise<IpcResponse<AddDocumentResult>> {
  const service = getKnowledgeBaseService()
  return await service.addDocument(data.knowledgeBaseId, data.data)
}

/**
 * 处理添加网页
 */
async function handleAddWebpage(
  _event: any,
  data: { knowledgeBaseId: string; url: string }
): Promise<IpcResponse<KbDocument>> {
  const service = getKnowledgeBaseService()
  return await service.addWebpage(data.knowledgeBaseId, data.url)
}

/**
 * 处理获取文档列表
 */
async function handleGetDocuments(
  _event: any,
  knowledgeBaseId: string
): Promise<IpcResponse<KbDocument[]>> {
  const service = getKnowledgeBaseService()
  return await service.getDocuments(knowledgeBaseId)
}

/**
 * 处理删除文档
 */
async function handleDeleteDocument(
  _event: any,
  documentId: string
): Promise<IpcResponse<void>> {
  const service = getKnowledgeBaseService()
  return await service.deleteDocument(documentId)
}

/**
 * 处理重新处理文档
 */
async function handleReprocessDocument(
  _event: any,
  documentId: string
): Promise<IpcResponse<void>> {
  const service = getKnowledgeBaseService()
  return await service.reprocessDocument(documentId)
}

/**
 * 处理获取文档分片
 */
async function handleGetDocumentChunks(
  _event: any,
  documentId: string
): Promise<IpcResponse<KbChunk[]>> {
  const service = getKnowledgeBaseService()
  return await service.getDocumentChunks(documentId)
}

/**
 * 处理分页获取文档分片
 */
async function handleGetDocumentChunksPaginated(
  _event: any,
  data: { documentId: string; page: number; pageSize: number }
): Promise<IpcResponse<{ chunks: KbChunk[]; total: number }>> {
  const service = getKnowledgeBaseService()
  return await service.getDocumentChunksPaginated(data.documentId, data.page, data.pageSize)
}

/**
 * 处理获取单个切片详情
 */
async function handleGetChunk(
  _event: any,
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
  _event: any,
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
  _event: any
): Promise<IpcResponse<EmbeddingModel[]>> {
  const service = getKnowledgeBaseService()
  return await service.getEmbeddingModels()
}

// ==================== 文件选择处理器 ====================

/**
 * 处理选择文件
 */
async function handleSelectFiles(
  event: any
): Promise<IpcResponse<FileInfo[]>> {
  if (!isElectron) {
    return { success: false, error: '该功能仅在桌面端可用' }
  }
  const { BrowserWindow, dialog } = loadElectron()
  const window = BrowserWindow?.fromWebContents(event?.sender)
  if (!window) {
    return { success: false, error: '窗口不存在' }
  }

  const result = await dialog.showOpenDialog(window, {
    title: '选择文档',
    // doc（Word 97-2003）解析未实现，不提供选择；请另存为 docx 后上传
    filters: [{ name: '文档', extensions: ['docx', 'txt', 'md', 'xlsx', 'xls'] }],
    properties: ['multiSelections', 'openFile'],
  })

  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, error: '未选择文件' }
  }

  return {
    success: true,
    data: result.filePaths.map(p => ({
      path: p,
      name: path.basename(p),
      size: fs.statSync(p).size,
    })),
  }
}

// ==================== 文件限制信息 ====================

/**
 * 处理获取文件限制信息
 */
async function handleGetFileLimits(
  _event: any
): Promise<IpcResponse<{
  maxFileSize: number
  maxFilesPerUpload: number
  supportedTypes: string[]
}>> {
  const service = getKnowledgeBaseService()
  const limits = service.getFileLimits()
  return { success: true, data: limits }
}
// ==================== D1 QA 问答对处理函数 ====================

/** 列出 QA 对 */
async function handleListQaPairs(
  _event: any,
  p: { knowledgeBaseId: string; keyword?: string }
): Promise<IpcResponse<unknown>> {
  const service = getKnowledgeBaseService()
  return await service.listQaPairs(p.knowledgeBaseId, p.keyword)
}

/** 新增 QA 对（question+similarQuestions 全部向量化） */
async function handleAddQaPair(
  _event: any,
  p: { knowledgeBaseId: string; question: string; answer: string; similarQuestions?: string[] }
): Promise<IpcResponse<unknown>> {
  const service = getKnowledgeBaseService()
  return await service.addQaPair(p.knowledgeBaseId, p)
}

/** 更新 QA 对（变体向量确定性重建） */
async function handleUpdateQaPair(
  _event: any,
  p: { id: string; question?: string; answer?: string; similarQuestions?: string[] }
): Promise<IpcResponse<unknown>> {
  const service = getKnowledgeBaseService()
  return await service.updateQaPair(p.id, p)
}

/** 删除 QA 对 */
async function handleDeleteQaPair(
  _event: any,
  p: { id: string }
): Promise<IpcResponse<unknown>> {
  const service = getKnowledgeBaseService()
  return await service.deleteQaPair(p.id)
}

/** QA 直出检索（测试面板用） */
async function handleSearchQa(
  _event: any,
  p: { knowledgeBaseId: string; query: string; topK?: number; threshold?: number }
): Promise<IpcResponse<unknown>> {
  const service = getKnowledgeBaseService()
  return await service.searchQa(p)
}

/** xlsx 批量导入（fileBuffer 为 base64——IPC 可序列化） */
async function handleImportQaXlsx(
  _event: any,
  p: { knowledgeBaseId: string; base64: string }
): Promise<IpcResponse<{ imported: number; failed: number }>> {
  const service = getKnowledgeBaseService()
  return await service.importQaPairs(p.knowledgeBaseId, Buffer.from(p.base64, 'base64'))
}

/** xlsx 导出（返回 base64，前端 saveBlobAs 落盘） */
async function handleExportQaXlsx(
  _event: any,
  p: { knowledgeBaseId: string }
): Promise<IpcResponse<{ base64: string; fileName: string }>> {
  const service = getKnowledgeBaseService()
  return await service.exportQaPairs(p.knowledgeBaseId)
}

/** D2：列出可选 rerank 模型 */
async function handleGetRerankModels(_event: any): Promise<IpcResponse<unknown>> {
  const service = getKnowledgeBaseService()
  return await service.getRerankModels()
}
