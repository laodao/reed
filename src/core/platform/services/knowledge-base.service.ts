/**
 * 知识库服务
 * @module platform/services/knowledge-base.service
 * @description 知识库核心业务服务
 */

import fs from 'fs'
import path from 'path'
import { createHash, randomUUID } from 'crypto'
import nodejieba from 'nodejieba'
import { parse } from 'node-html-parser'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { KbQaPairRecord } from '@core/database/repositories/kb-qa-pair.repository'
import { getEventEmitter } from '@core/interfaces/event.interface'
import { getPathProvider } from '@core/interfaces/path.interface'
import { getSecureStorage } from '@core/interfaces/storage.interface'
import { HybridSplitter, EmbeddingService, SplitConfig, DEFAULT_SPLIT_CONFIG, SplitChunk, StructureDetector } from '@core/platform/services/chunk-splitter'
import type { KbChapterInput, KbChapterRecord } from '@core/database/repositories/kb-chapter.repository'
import {
  buildChapterLookup,
  chapterPathOf,
  matchChapter,
  type ChapterLookup,
} from '@core/platform/services/kb-chapter-lookup'
import { KbChapterSummaryService } from '@core/platform/services/kb-chapter-summary.service'
import { extractTextFromFile, inferFileType } from '@core/utils/extract-text'
import { publishDomainEvent } from '@core/platform/workflow/trigger/domain-event-bus'
import { WORKFLOW_EVENT_NAMES } from '@shared/types/workflow.types'
import type {
  KnowledgeBase,
  CreateKnowledgeBaseRequest,
  UpdateKnowledgeBaseRequest,
  KbDocument,
  KbChunk,
  CreateDocumentRequest,
  CreateChunkRequest,
  SearchRequest,
  SearchResult,
  EmbeddingModel,
  FileInfo,
  FileType,
  EmbeddingConfig,
  SplitStrategy,
  DocumentSource,
  AddDocumentResult,
  KnowledgeBaseFolder,
} from '@shared/types/knowledge-base.types'

// 常量配置
const CHUNK_SIZE = 800
const OVERLAP = 80
const BATCH_SIZE = 10

/** D3：索引分词停用词（buildIndex 与 BM25 检索共用——同一套词表才能对得上） */
const INDEX_STOP_WORDS = new Set([
  '的', '了', '和', '是', '就', '都', '而', '及', '与', '着',
  '或', '一个', '没有', '我们', '你们', '他们', '它们', '这个', '那个',
  '这些', '那些', '不是', '什么', '怎么', '如何', '为什么', '因为',
  '所以', '但是', '如果', '虽然', '可以', '可能', '应该', '需要',
  '会', '能', '要', '有', '在', '上', '下', '里', '外', '中',
  '很', '太', '更', '最', '非常', '十分', '极其', '相当',
])

/** D3：索引分词（jieba cutForSearch 中文 + 英文词元，去停用词/单字）——建索引与查询同源 */
function tokenizeForIndex(text: string): string[] {
  const chineseText = text.replace(/[a-zA-Z0-9\s]+/g, ' ')
  const chineseTerms = nodejieba.cutForSearch(chineseText)
  const englishWords = text.toLowerCase().match(/[a-z]+/g) || []
  return [...chineseTerms, ...englishWords]
    .map(t => t.trim())
    .filter(t => t.length >= 2 && !INDEX_STOP_WORDS.has(t))
}

/** QA 对向量的 chunkId 命名空间前缀（与 addQaPair 写入一致；文档检索须剔除） */
const QA_CHUNK_ID_PREFIX = 'qa:'
/** 文档召回补偿条数：抵偿 QA 命名空间向量占用的 topK 名额 */
const QA_VECTOR_FETCH_PADDING = 10
/** QA xlsx 导入文件大小上限（评审 #77：解析无上限是 DoS 面） */
const QA_IMPORT_MAX_FILE_BYTES = 10 * 1024 * 1024
/** QA xlsx 导入行数上限（评审 #77） */
const QA_IMPORT_MAX_ROWS = 10_000

/** BM25 参数（k1 词频饱和、b 长度归一；业界标准值） */
const BM25_K1 = 1.2
const BM25_B = 0.75

// IPC 事件通道
const KB_EVENTS = {
  DOCUMENT_PROGRESS: 'kb:document-progress',
  DOCUMENT_STATUS: 'kb:document-status',
  KNOWLEDGE_BASE_STATS: 'kb:stats'
} as const

/**
 * Embedding 服务适配器
 * 将 KnowledgeBaseService 的 getEmbeddingVectors 方法适配到 EmbeddingService 接口
 */
class EmbeddingServiceAdapter implements EmbeddingService {
  private service: KnowledgeBaseService
  private config: EmbeddingConfig

  constructor(service: KnowledgeBaseService, config: EmbeddingConfig) {
    this.service = service
    this.config = config
  }

  async getBatchEmbeddings(texts: string[]): Promise<number[][]> {
    const vectors = await this.service.getEmbeddingVectors(texts, this.config)
    if (!vectors) {
      throw new Error('Embedding API 调用失败')
    }
    return vectors
  }
}

export class KnowledgeBaseService {
  private emitProgress(documentId: string, progress: number, estimatedSeconds?: number): void {
    getEventEmitter().emit(KB_EVENTS.DOCUMENT_PROGRESS, { documentId, progress, estimatedSeconds })
  }

  private emitStatus(documentId: string, status: string, chunkCount?: number, errorMessage?: string): void {
    getEventEmitter().emit(KB_EVENTS.DOCUMENT_STATUS, { documentId, status, chunkCount, errorMessage })
    // 工作流事件触发埋点：文档处理终态（不影响主流程）
    if (status === 'completed' || status === 'failed') {
      publishDomainEvent(
        status === 'completed' ? WORKFLOW_EVENT_NAMES.kbDocumentCompleted : WORKFLOW_EVENT_NAMES.kbDocumentFailed,
        { documentId, status }
      )
    }
  }

  private async emitKnowledgeBaseStats(kbId: string): Promise<void> {
    const db = getCoreDatabaseManager()
    if (!db.knowledgeBases) return
    const kb = await db.knowledgeBases.findById(kbId)
    if (kb) {
      getEventEmitter().emit(KB_EVENTS.KNOWLEDGE_BASE_STATS, {
        id: kb.id,
        documentCount: kb.documentCount,
        vectorCount: kb.vectorCount,
        totalSize: kb.totalSize,
      })
    }
  }

  // ==================== 知识库 CRUD ====================

  async getKnowledgeBases(): Promise<{ success: boolean; data?: KnowledgeBase[]; error?: string }> {
    try {
      const db = getCoreDatabaseManager()
      if (!db.knowledgeBases) return { success: false, error: '数据库未初始化' }
      return { success: true, data: await db.knowledgeBases.findAll() }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async getKnowledgeBase(id: string): Promise<{ success: boolean; data?: KnowledgeBase; error?: string }> {
    try {
      const db = getCoreDatabaseManager()
      if (!db.knowledgeBases) return { success: false, error: '数据库未初始化' }
      const kb = await db.knowledgeBases.findById(id)
      return kb ? { success: true, data: kb } : { success: false, error: '知识库不存在' }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async createKnowledgeBase(req: CreateKnowledgeBaseRequest): Promise<{ success: boolean; data?: KnowledgeBase; error?: string }> {
    try {
      const db = getCoreDatabaseManager()
      if (!db.knowledgeBases) return { success: false, error: '数据库未初始化' }

      if (await db.knowledgeBases.existsByName(req.name)) {
        return { success: false, error: '知识库名称已存在' }
      }
      if (await db.knowledgeBases.count() >= 20) {
        return { success: false, error: '已达到知识库数量上限' }
      }

      // 防御性校验：缺 embedding 配置的库后续文档处理必然失败（"未配置 Embedding 提供商"），
      // 创建时就拦下，避免产生永远不可用的库
      const ec = req.embeddingConfig
      if (!ec?.modelId) {
        return { success: false, error: '缺少 Embedding 配置（embeddingConfig.modelId）' }
      }
      if (ec.provider !== 'local' && !ec.providerConfigId) {
        return { success: false, error: '缺少 Embedding 提供商配置（embeddingConfig.providerConfigId）' }
      }

      return { success: true, data: await db.knowledgeBases.create(req) }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async updateKnowledgeBase(id: string, req: UpdateKnowledgeBaseRequest): Promise<{ success: boolean; error?: string }> {
    try {
      const db = getCoreDatabaseManager()
      if (!db.knowledgeBases) return { success: false, error: '数据库未初始化' }

      const kb = await db.knowledgeBases.findById(id)
      if (!kb) return { success: false, error: '知识库不存在' }

      if (req.name && req.name !== kb.name && await db.knowledgeBases.existsByName(req.name)) {
        return { success: false, error: '知识库名称已存在' }
      }

      await db.knowledgeBases.update(id, req)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  // ==================== 知识库目录（分组/分类） ====================

  async listKbFolders(): Promise<{ success: boolean; data?: KnowledgeBaseFolder[]; error?: string }> {
    try {
      const db = getCoreDatabaseManager()
      if (!db.kbFolders) return { success: false, error: '数据库未初始化' }
      return { success: true, data: await db.kbFolders.listAll() }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async createKbFolder(name: string): Promise<{ success: boolean; data?: KnowledgeBaseFolder; error?: string }> {
    try {
      const db = getCoreDatabaseManager()
      if (!db.kbFolders) return { success: false, error: '数据库未初始化' }
      const trimmed = name?.trim()
      if (!trimmed) return { success: false, error: '目录名称不能为空' }
      const existing = await db.kbFolders.listAll()
      if (existing.some(f => f.name === trimmed)) {
        return { success: false, error: '目录名称已存在' }
      }
      return { success: true, data: await db.kbFolders.create({ name: trimmed }) }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async renameKbFolder(id: string, name: string): Promise<{ success: boolean; error?: string }> {
    try {
      const db = getCoreDatabaseManager()
      if (!db.kbFolders) return { success: false, error: '数据库未初始化' }
      const trimmed = name?.trim()
      if (!trimmed) return { success: false, error: '目录名称不能为空' }
      await db.kbFolders.update(id, { name: trimmed })
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  /** 删除目录：目录下的知识库移到"未分类"（folder_id=null），不级联删库 */
  async deleteKbFolder(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const db = getCoreDatabaseManager()
      if (!db.kbFolders || !db.knowledgeBases) return { success: false, error: '数据库未初始化' }
      await db.kbFolders.delete(id)
      // 目录内知识库归未分类
      const list = await db.knowledgeBases.findAll()
      for (const kb of list) {
        if (kb.folderId === id) await db.knowledgeBases.update(kb.id, { folderId: null })
      }
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async deleteKnowledgeBase(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const db = getCoreDatabaseManager()
      if (!db.knowledgeBases || !db.kbDocuments || !db.kbChunks || !db.kbVectors || !db.kbInvertedIndex) {
        return { success: false, error: '数据库未初始化' }
      }
      // 删除文件
      const dataPath = getPathProvider().getDataPath()
      const kbDir = path.join(dataPath, 'knowledge-base', id)
      if (fs.existsSync(kbDir)) fs.rmSync(kbDir, { recursive: true, force: true })

      // 删除数据库记录
      const docs = await db.kbDocuments.findByKnowledgeBaseId(id)
      for (const doc of docs) {
        await db.kbVectors.deleteByDocumentId(doc.id)
        await db.kbInvertedIndex.deleteByDocumentId(doc.id)
      }
      await db.kbChunks.deleteByKnowledgeBaseId(id)
      await db.kbDocuments.deleteByKnowledgeBaseId(id)
      // D1：QA 对级联——QA 向量按 chunkId 命名空间逐条删（与文档向量无 documentId 关联）
      if (db.kbQaPairs) {
        const pairs = await db.kbQaPairs.listByKnowledgeBaseId(id)
        for (const pair of pairs) {
          for (let i = 0; i < 1 + pair.similarQuestions.length; i++) {
            await db.kbVectors.deleteByChunkId(KnowledgeBaseService.qaVectorChunkId(pair.id, i))
          }
        }
        await db.kbQaPairs.deleteByKnowledgeBaseId(id)
      }
      await db.knowledgeBases.delete(id)

      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  // ==================== 文档管理 ====================

  async uploadDocuments(kbId: string, files: FileInfo[]): Promise<{ success: boolean; data?: KbDocument[]; error?: string }> {
    try {
      const db = getCoreDatabaseManager()
      if (!db.knowledgeBases || !db.kbDocuments) return { success: false, error: '数据库未初始化' }

      const kb = await db.knowledgeBases.findById(kbId)
      if (!kb) return { success: false, error: '知识库不存在' }
      if (files.length > 20) return { success: false, error: '单次最多上传 20 个文件' }

      // 准备目录
      const dataPath = getPathProvider().getDataPath()
      const docDir = path.join(dataPath, 'knowledge-base', kbId, 'documents')
      if (!fs.existsSync(docDir)) fs.mkdirSync(docDir, { recursive: true })

      const requests: CreateDocumentRequest[] = []
      for (const file of files) {
        if (file.size > 50 * 1024 * 1024) continue // 跳过超过 50MB 的文件

        const fileType = this.getFileType(file.name)
        if (!fileType) continue

        const docId = randomUUID()
        const ext = path.extname(file.name)
        const destPath = path.join(docDir, `${docId}${ext}`)
        await fs.promises.copyFile(file.path, destPath)

        requests.push({
          knowledgeBaseId: kbId,
          name: file.name,
          filePath: destPath,
          fileType,
          fileSize: file.size
        })
      }

      const docs = await db.kbDocuments.createBatch(requests)

      // 更新统计
      await db.knowledgeBases.incrementDocumentCount(kbId, docs.length)
      await db.knowledgeBases.incrementTotalSize(kbId, docs.reduce((s, d) => s + d.fileSize, 0))

      // 发送知识库统计更新事件
      this.emitKnowledgeBaseStats(kbId)

      // 异步处理
      for (const doc of docs) {
        this.processDocument(doc, kb).catch(e => console.error('[KB] 处理失败:', e))
      }

      return { success: true, data: docs }
    } catch (e: any) {
      console.error('[KB] 上传失败:', e)
      return { success: false, error: e.message }
    }
  }

  /**
   * 添加文档（直接添加文本内容）
   * 支持 upsert 语义：传入 source 时若同源文档已存在则更新，否则新建。
   */
  async addDocument(
    kbId: string,
    data: { name: string; type: 'text'; content: string; source?: DocumentSource },
  ): Promise<{ success: boolean; data?: AddDocumentResult; error?: string }> {
    try {
      const db = getCoreDatabaseManager()
      if (!db.knowledgeBases || !db.kbDocuments) {
        return { success: false, error: '数据库未初始化' }
      }

      const kb = await db.knowledgeBases.findById(kbId)
      if (!kb) return { success: false, error: '知识库不存在' }

      // 1. 命中已有同源文档 → upsert
      if (data.source) {
        const existing = await db.kbDocuments.findBySource(kbId, data.source)
        if (existing) {
          const newBuf = Buffer.from(data.content, 'utf-8')
          // 覆盖文件内容（复用 existing.filePath，避免文件孤立）
          await fs.promises.writeFile(existing.filePath, newBuf)

          const sizeDelta = newBuf.length - existing.fileSize
          const oldChunkCount = existing.chunkCount

          // 重置 doc 元信息
          await db.kbDocuments.resetForUpsert(existing.id, {
            name: data.name,
            fileSize: newBuf.length,
          })

          // 同步 KB 统计：documentCount 不变；totalSize 按 delta；vectorCount 暂减
          if (sizeDelta !== 0) {
            await db.knowledgeBases.incrementTotalSize(kbId, sizeDelta)
          }
          if (oldChunkCount > 0) {
            await db.knowledgeBases.incrementVectorCount(kbId, -oldChunkCount)
          }

          // 清旧 artifacts（chunks/vectors/inverted-index）
          await this.clearDocumentArtifacts(existing.id)

          this.emitKnowledgeBaseStats(kbId)

          // 构造更新后的 DTO（供 processDocument 使用）
          const refreshed: KbDocument = {
            ...existing,
            name: data.name,
            fileSize: newBuf.length,
            status: 'processing',
            progress: 0,
            chunkCount: 0,
            errorMessage: undefined,
          }
          // 异步重跑流水线
          this.processDocument(refreshed, kb).catch(e =>
            console.error('[KB] upsert 处理失败:', e),
          )

          return { success: true, data: { doc: refreshed, isUpdate: true } }
        }
      }

      // 2. 未命中或未传 source → 走原新建路径
      const dataPath = getPathProvider().getDataPath()
      const docDir = path.join(dataPath, 'knowledge-base', kbId, 'documents')
      if (!fs.existsSync(docDir)) fs.mkdirSync(docDir, { recursive: true })

      const docId = randomUUID()
      const destPath = path.join(docDir, `${docId}.txt`)

      // 写入文本内容到文件
      const contentBuffer = Buffer.from(data.content, 'utf-8')
      await fs.promises.writeFile(destPath, contentBuffer)

      const request: CreateDocumentRequest = {
        knowledgeBaseId: kbId,
        name: data.name,
        filePath: destPath,
        fileType: 'txt',
        fileSize: contentBuffer.length,
        source: data.source,
      }

      const doc = await db.kbDocuments.create(request)

      // 更新统计
      await db.knowledgeBases.incrementDocumentCount(kbId, 1)
      await db.knowledgeBases.incrementTotalSize(kbId, doc.fileSize)

      // 发送知识库统计更新事件
      this.emitKnowledgeBaseStats(kbId)

      // 异步处理
      this.processDocument(doc, kb).catch(e => console.error('[KB] 处理失败:', e))

      return { success: true, data: { doc, isUpdate: false } }
    } catch (e: any) {
      console.error('[KB] 添加文档失败:', e)
      return { success: false, error: e.message }
    }
  }

  async getDocuments(kbId: string): Promise<{ success: boolean; data?: KbDocument[]; error?: string }> {
    try {
      const db = getCoreDatabaseManager()
      if (!db.kbDocuments) return { success: false, error: '数据库未初始化' }
      return { success: true, data: await db.kbDocuments.findByKnowledgeBaseId(kbId) }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async deleteDocument(docId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const db = getCoreDatabaseManager()
      if (!db.kbDocuments || !db.kbChunks || !db.kbVectors || !db.kbInvertedIndex || !db.knowledgeBases) {
        return { success: false, error: '数据库未初始化' }
      }

      const doc = await db.kbDocuments.findById(docId)
      if (!doc) return { success: false, error: '文档不存在' }

      const kbId = doc.knowledgeBaseId

      this.deleteDocumentFile(doc.filePath)

      await db.kbVectors.deleteByDocumentId(docId)
      await db.kbInvertedIndex.deleteByDocumentId(docId)
      await db.kbChunks.deleteByDocumentId(docId)
      await db.kbDocuments.delete(docId)

      // 使用文档的 chunkCount 字段计算向量数（只有处理完成时才设置）
      // 避免删除未完成文档时向量数变成负数
      const vectorCount = doc.chunkCount || 0
      await db.knowledgeBases.incrementDocumentCount(kbId, -1)
      if (vectorCount > 0) {
        await db.knowledgeBases.incrementVectorCount(kbId, -vectorCount)
      }
      await db.knowledgeBases.incrementTotalSize(kbId, -doc.fileSize)

      // 发送知识库统计更新事件
      this.emitKnowledgeBaseStats(kbId)

      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async reprocessDocument(docId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const db = getCoreDatabaseManager()
      if (!db.kbDocuments || !db.knowledgeBases) return { success: false, error: '数据库未初始化' }

      const doc = await db.kbDocuments.findById(docId)
      if (!doc) return { success: false, error: '文档不存在' }

      const kb = await db.knowledgeBases.findById(doc.knowledgeBaseId)
      if (!kb) return { success: false, error: '知识库不存在' }

      await db.kbDocuments.updateProgress(docId, 0)
      await this.clearDocumentArtifacts(docId)
      await this.processDocument(doc, kb)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  /**
   * 删除文档对应的物理文件副本。
   * 只删应用数据目录里的副本（上传时 copyFile 复制而来），不会碰用户原始文件。
   * - 历史数据的 file_path 可能是相对路径（按进程 CWD 解析会误判不存在）→ 先规范化
   * - Windows 上 copyFile 会保留源文件只读属性，unlink 会 EPERM → 先去掉只读再删
   * - 文件删除失败不应阻断删除流程（DB 记录/向量/切片照常清理），仅记日志
   */
  private deleteDocumentFile(filePath: string): void {
    try {
      let resolved = filePath
      if (!path.isAbsolute(resolved)) {
        // 相对路径基准是 dataPath（与 asset-paths-to-relative 迁移约定一致）；
        // 兼容更老的数据（可能相对 dataPath 上级）：先按 dataPath 解析，不存在再回退 '..'
        const primary = path.join(getPathProvider().getDataPath(), resolved)
        resolved = fs.existsSync(primary)
          ? primary
          : path.join(getPathProvider().getDataPath(), '..', resolved)
      }
      if (fs.existsSync(resolved)) {
        try {
          fs.unlinkSync(resolved)
        } catch {
          // 只读属性（如从只读源 copyFile 保留下来）→ 去只读后重试
          fs.chmodSync(resolved, 0o666)
          fs.unlinkSync(resolved)
        }
      }
    } catch (e: any) {
      console.warn(`[KB] 删除文档文件失败（不阻断删除流程）: ${filePath}`, e?.message)
    }
  }

  /**
   * 清空一篇文档相关的所有派生数据：vectors / inverted-index / chunks。
   * 由 reprocessDocument 与 addDocument 的 upsert 分支共用。
   * 顺序与 deleteDocument 保持一致，避免外键约束被违反。
   */
  private async clearDocumentArtifacts(docId: string): Promise<void> {
    const db = getCoreDatabaseManager()
    if (!db.kbVectors || !db.kbInvertedIndex || !db.kbChunks) return
    await db.kbVectors.deleteByDocumentId(docId)
    await db.kbInvertedIndex.deleteByDocumentId(docId)
    await db.kbChunks.deleteByDocumentId(docId)
  }

  // ==================== 文档处理 ====================

  private async processDocument(doc: KbDocument, kb: KnowledgeBase): Promise<void> {
    const db = getCoreDatabaseManager()
    if (!db.kbDocuments || !db.kbChunks || !db.kbVectors || !db.kbInvertedIndex || !db.knowledgeBases) {
      db.kbDocuments?.markFailed(doc.id, '数据库未初始化')
      return
    }

    console.log(`[KB] 开始处理: ${doc.name}`)
    const startTime = Date.now()

    try {
      // 1. 解析
      await db.kbDocuments.updateProgress(doc.id, 10)
      this.emitProgress(doc.id, 10, undefined)
      const content = await this.parseFile(doc.filePath, doc.fileType)
      if (!content?.trim()) {
        await db.kbDocuments.markFailed(doc.id, '文档内容为空')
        this.emitStatus(doc.id, 'failed', undefined, '文档内容为空')
        return
      }
      console.log(`[KB] 解析完成, 长度: ${content.length}`)

      // 1.5 章节树落库（与切片同源的结构检测；供检索上下文注入/章节摘要消费）
      // 失败不影响切片与向量主流程（章节是增强能力，见 syncChapters 内部 fail-soft）
      await this.syncChapters(doc.id, kb.id, doc.name, content)

      // 2. 切分配置
      const embeddingConfig: EmbeddingConfig = kb.embeddingConfig ? JSON.parse(kb.embeddingConfig) : {}
      const splitConfig: SplitConfig = kb.splitConfig
        ? JSON.parse(kb.splitConfig)
        : { ...DEFAULT_SPLIT_CONFIG, strategy: (kb.splitStrategy || 'hybrid') as SplitStrategy }

      // 3. 切分（使用新的 HybridSplitter）
      await db.kbDocuments.updateProgress(doc.id, 20)
      this.emitProgress(doc.id, 20, undefined)

      const embeddingService = new EmbeddingServiceAdapter(this, embeddingConfig)
      const hybridSplitter = new HybridSplitter(embeddingService)

      const splitChunks: SplitChunk[] = []
      try {
        splitChunks.push(...await hybridSplitter.split(content, splitConfig))
        console.log(`[KB] 切分完成, 数量: ${splitChunks.length}, 策略: ${splitConfig.strategy}`)
      } catch (splitError: any) {
        // 切分失败（可能是 Embedding API 失败），标记文档失败
        console.error(`[KB] 切分失败: ${splitError.message}`)
        await db.kbDocuments.markFailed(doc.id, splitError.message)
        this.emitStatus(doc.id, 'failed', undefined, splitError.message)
        return
      }

      // 4. 存储切片（包含层级信息）
      await db.kbDocuments.updateProgress(doc.id, 30)
      this.emitProgress(doc.id, 30, undefined)

      // 构建父 chunk ID 映射
      const chunkIdMap = new Map<string, string>()

      const chunkRequests: CreateChunkRequest[] = splitChunks.map(chunk => {
        return {
          documentId: doc.id,
          knowledgeBaseId: kb.id,
          content: chunk.content,
          chunkIndex: chunk.index,
          startOffset: chunk.startOffset,
          endOffset: chunk.endOffset,
          title: chunk.title,
          level: chunk.level,
          parentChunkId: chunk.parentChunkId,
          splitMethod: chunk.splitMethod,
          sectionPath: chunk.sectionPath
        }
      })

      const chunkRecords = await db.kbChunks.createBatch(chunkRequests)

      // 构建真实 ID 映射
      for (let i = 0; i < splitChunks.length; i++) {
        if (splitChunks[i].parentChunkId) {
          // 查找父 chunk 的真实 ID
          const parentIndex = splitChunks.findIndex(
            c => c.startOffset === splitChunks[i].startOffset && c.index < splitChunks[i].index
          )
          if (parentIndex >= 0 && chunkRecords[parentIndex]) {
            chunkIdMap.set(splitChunks[i].parentChunkId!, chunkRecords[parentIndex].id)
          }
        }
      }

      // 5. 生成向量
      const totalBatches = Math.ceil(chunkRecords.length / BATCH_SIZE)
      const estimatedBatchTime = 2 // 秒

      let batchIndex = 0
      for (let i = 0; i < chunkRecords.length; i += BATCH_SIZE) {
        const batch = chunkRecords.slice(i, i + BATCH_SIZE)
        const texts = batch.map(c => c.content)

        const vectors = await this.getEmbeddingVectors(texts, embeddingConfig)
        if (!vectors) throw new Error('向量生成失败')

        await db.kbVectors.createBatch(
          vectors.map((v, idx) => ({
            chunkId: batch[idx].id,
            knowledgeBaseId: kb.id,
            vector: v
          }))
        )

        batchIndex++
        const progress = 30 + Math.floor((i / chunkRecords.length) * 50)
        await db.kbDocuments.updateProgress(doc.id, progress)

        const remainingBatches = totalBatches - batchIndex
        const avgBatchTime = (Date.now() - startTime - 5000) / batchIndex / 1000
        const estimatedRemaining = Math.max(0, Math.round(remainingBatches * Math.max(avgBatchTime, estimatedBatchTime)))

        this.emitProgress(doc.id, progress, estimatedRemaining)
      }

      // 6. 索引
      await db.kbDocuments.updateProgress(doc.id, 90)
      this.emitProgress(doc.id, 90, 3)
      await this.buildIndex(chunkRecords, kb.id)

      // 完成
      await db.kbDocuments.markCompleted(doc.id, splitChunks.length)
      await db.knowledgeBases.incrementVectorCount(kb.id, splitChunks.length)
      this.emitProgress(doc.id, 100, 0)
      this.emitStatus(doc.id, 'completed', splitChunks.length)
      this.emitKnowledgeBaseStats(kb.id)
      console.log(`[KB] 处理完成: ${doc.name}, 耗时: ${Math.round((Date.now() - startTime) / 1000)}秒`)

      // 7. 章节摘要（异步后台生成，不阻塞处理完成；单章失败标记 failed 可重试）
      this.scheduleChapterSummaries(doc.id)

    } catch (e: any) {
      console.error(`[KB] 处理失败: ${doc.name}`, e)
      await db.kbDocuments.markFailed(doc.id, e.message)
      this.emitStatus(doc.id, 'failed', undefined, e.message)
    }
  }

  /**
   * 章节摘要调度（M2）：文档处理完成后异步生成章节摘要。
   * fire-and-forget——不阻塞 reprocess 返回；未装配/异常只记日志。
   */
  private scheduleChapterSummaries(documentId: string): void {
    const db = getCoreDatabaseManager()
    if (!db.kbChapters) return
    try {
      const service = new KbChapterSummaryService({ repo: db.kbChapters })
      service.scheduleDocumentSummaries(documentId)
    } catch (e: unknown) {
      console.warn(`[KB] 章节摘要调度失败（不影响主流程）: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  /**
   * 章节树落库（M2）：用与切片同源的结构检测（StructureDetector）把文档章节
   * 落成树形实体（kb_chapters），供检索上下文注入（M3）与章节摘要使用。
   *
   * - 有结构：按 sections 建树，父章节由「层级栈」解析（level 更小的最近前驱）
   * - 无结构：落单条「整篇章节」（标题=文档名，摘要退化为整篇摘要）
   * - 幂等：每次处理全量重建；摘要状态重置 pending，由摘要服务异步补齐
   * - fail-soft：任何异常只记日志，绝不影响切片/向量主流程
   */
  private async syncChapters(
    documentId: string,
    knowledgeBaseId: string,
    docName: string,
    content: string,
  ): Promise<void> {
    const db = getCoreDatabaseManager()
    if (!db.kbChapters) return // 未装配（旧库/部分测试环境）：跳过

    try {
      const structure = new StructureDetector().detect(content)
      const inputs: KbChapterInput[] = []
      const hash = (text: string): string => createHash('sha256').update(text).digest('hex')

      if (structure.hasStructure && structure.sections.length > 0) {
        // 层级栈：父 = 栈中最近的 level 更小者；同/更深层出栈
        const stack: Array<{ id: string; level: number }> = []
        structure.sections.forEach((section, index) => {
          const id = randomUUID()
          while (stack.length > 0 && stack[stack.length - 1].level >= section.level) {
            stack.pop()
          }
          const parentId = stack.length > 0 ? stack[stack.length - 1].id : null
          stack.push({ id, level: section.level })
          inputs.push({
            id,
            documentId,
            knowledgeBaseId,
            title: section.title,
            level: section.level,
            parentTitle: section.parentTitle ?? null,
            parentId,
            ordering: index,
            startOffset: section.startIndex,
            endOffset: section.endIndex,
            content: section.content,
            contentHash: hash(section.content),
          })
        })
      } else {
        inputs.push({
          id: randomUUID(),
          documentId,
          knowledgeBaseId,
          title: docName,
          level: 1,
          parentTitle: null,
          parentId: null,
          ordering: 0,
          startOffset: 0,
          endOffset: content.length,
          content,
          contentHash: hash(content),
        })
      }

      const count = await db.kbChapters.replaceByDocument(documentId, inputs)
      console.log(`[KB] 章节树落库完成: ${count} 个章节`)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`[KB] 章节树落库失败（不影响切片入库）: ${msg}`)
    }
  }

  /**
   * 提取文件内容（pdf/epub 走 Rust 解析器输出 Markdown，供切片器按章节/段落结构切分；
   * txt/md 原样返回）。
   * 支持 txt/md/pdf/epub/docx/xlsx；中文编码自动检测。
   * 注：原 decodeTextFile/hasGarbledChars 已迁入 extract-text，此处仅保留 parseFile 入口。
   */
  private async parseFile(filePath: string, fileType: FileType): Promise<string> {
    // file_path 入库约定为 dataPath 相对路径（asset-paths-to-relative 迁移会把绝对路径改写为相对），
    // 从 DB 重读（重新处理/重启后续跑）必须解析回绝对路径，否则按进程 CWD 解析必 ENOENT
    const resolved = path.isAbsolute(filePath)
      ? filePath
      : path.join(getPathProvider().getDataPath(), filePath)
    return extractTextFromFile(resolved, fileType, { asMarkdown: true })
  }

  /**
   * 尝试多种编码解析文本文件
   * 优先级：自动检测 > UTF-8 > GBK > GB2312
   */
  private decodeTextFile(buffer: Buffer): string {
    // 尝试 UTF-8（带BOM检测）
    if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
      // UTF-8 with BOM
      return buffer.slice(3).toString('utf-8')
    }

    // 使用 jschardet 自动检测编码
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const jschardet = require('jschardet')
      const detected = jschardet.detect(buffer)

      if (detected && detected.encoding && detected.confidence > 0.7) {
        const encoding = detected.encoding.toLowerCase()
        console.log(`[KB] 检测到编码: ${encoding} (置信度: ${detected.confidence})`)

        // 处理常见的编码名称别名
        const encodingMap: Record<string, string> = {
          'utf-8': 'utf-8',
          'utf8': 'utf-8',
          'gbk': 'gbk',
          'gb2312': 'gbk',  // GB2312 是 GBK 的子集，用 GBK 解码更安全
          'gb18030': 'gbk',
          'big5': 'big5',
          'shift_jis': 'shiftjis',
          'euc-jp': 'eucjp',
          'iso-8859-1': 'latin1',
          'ascii': 'utf-8',  // ASCII 兼容 UTF-8
        }

        const targetEncoding = encodingMap[encoding] || encoding

        if (targetEncoding === 'utf-8') {
          const text = buffer.toString('utf-8')
          if (!this.hasGarbledChars(text)) {
            return text
          }
        } else {
          try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const iconv = require('iconv-lite')
            if (iconv.encodingExists(targetEncoding)) {
              const text = iconv.decode(buffer, targetEncoding)
              if (!this.hasGarbledChars(text)) {
                return text
              }
            }
          } catch {
            // iconv 解码失败，继续尝试其他方法
          }
        }
      }
    } catch (e) {
      console.log('[KB] 编码检测失败:', e)
    }

    // 尝试 UTF-8
    try {
      const utf8Text = buffer.toString('utf-8')
      // 检查是否有乱码字符（UTF-8 解码错误通常会产生的替换字符）
      if (!this.hasGarbledChars(utf8Text)) {
        return utf8Text
      }
    } catch {
      // UTF-8 解码失败，继续尝试其他编码
    }

    // 尝试 GBK（最常见的中文字符编码）
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const iconv = require('iconv-lite')
      const gbkText = iconv.decode(buffer, 'gbk')
      if (!this.hasGarbledChars(gbkText)) {
        return gbkText
      }
    } catch {
      // iconv-lite 未安装或解码失败
    }

    // 最后使用 UTF-8 强制解码（即使有乱码也比 latin1 好，因为 latin1 对中文完全不可读）
    console.log('[KB] 警告: 无法确定文件编码，使用 UTF-8 强制解码')
    return buffer.toString('utf-8')
  }

  /**
   * 检查文本是否包含乱码字符
   */
  private hasGarbledChars(text: string): boolean {
    // 检查常见的乱码模式
    const garbledPatterns = [
      /\ufffd/,           // Unicode 替换字符
      // eslint-disable-next-line no-control-regex
      /[\x00-\x08\x0b\x0c\x0e-\x1f]/, // 控制字符（换行、制表符除外）
    ]

    // 统计非ASCII字符的比例，如果乱码太多可能是编码错误
    let nonAsciiCount = 0
    let garbledCount = 0

    for (const char of text) {
      const code = char.charCodeAt(0)
      if (code > 127) {
        nonAsciiCount++
        // 检测是否为乱码字符
        if (code === 0xfffd || (code >= 0x80 && code <= 0x9f)) {
          garbledCount++
        }
      }
    }

    // 如果非ASCII字符中乱码比例超过20%，认为有乱码
    if (nonAsciiCount > 0 && garbledCount / nonAsciiCount > 0.2) {
      return true
    }

    // 检查是否有连续的乱码模式
    for (const pattern of garbledPatterns) {
      if (pattern.test(text)) {
        return true
      }
    }

    return false
  }

  private splitText(text: string): Array<{ content: string; index: number; start: number; end: number }> {
    const result: Array<{ content: string; index: number; start: number; end: number }> = []
    let start = 0
    let index = 0

    while (start < text.length) {
      let end = Math.min(start + CHUNK_SIZE, text.length)

      // 只在不是文本末尾时寻找边界
      if (end < text.length) {
        const boundary = Math.max(
          text.lastIndexOf('。', end),
          text.lastIndexOf('\n', end)
        )
        if (boundary > start + CHUNK_SIZE / 2) end = boundary + 1
      }

      const content = text.slice(start, end).trim()
      if (content) result.push({ content, index: index++, start, end })

      // 修复：确保 start 总是前进，避免无限循环
      const nextStart = end - OVERLAP
      start = (nextStart <= start) ? end : nextStart
    }

    return result
  }

  async getEmbeddingVectors(texts: string[], config: EmbeddingConfig, signal?: AbortSignal): Promise<number[][] | null> {
    try {
      if (!config.providerConfigId) throw new Error('未配置 Embedding 提供商')

      const db = getCoreDatabaseManager()
      const provider = await db.providerConfigs?.getById(config.providerConfigId)
      if (!provider) throw new Error('提供商配置不存在')

      const storage = getSecureStorage()
      if (!storage.isInitialized()) await storage.initialize()
      const apiKey = storage.decrypt(provider.apiKey || '')

      const model = config.modelId || 'text-embedding-v3'
      let url: string
      let headers: Record<string, string>

      switch (provider.templateId) {
        case 'bailian':
        case 'dashscope':
          url = 'https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings'
          headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
          break
        case 'zhipu':
          url = 'https://open.bigmodel.cn/api/paas/v4/embeddings'
          headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
          break
        default:
          url = `${provider.baseUrl || 'https://api.openai.com/v1'}/embeddings`
          headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
      }

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model, input: texts }),
        ...(signal ? { signal } : {})
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error?.message || err.message || 'API 调用失败')
      }

      const data = await res.json()
      return data.data.sort((a: any, b: any) => a.index - b.index).map((d: any) => d.embedding)
    } catch (e) {
      console.error('[KB] Embedding 失败:', e)
      return null
    }
  }

  private async buildIndex(chunks: any[], kbId: string): Promise<void> {
    const db = getCoreDatabaseManager()
    if (!db.kbInvertedIndex) return

    const items: Array<{ term: string; chunkId: string; knowledgeBaseId: string; termFrequency: number }> = []

    for (const chunk of chunks) {
      // 分词与检索同源（tokenizeForIndex：jieba cutForSearch + 英文词元，去停用词/单字）
      const allTerms = tokenizeForIndex(chunk.content)

      const freq = new Map<string, number>()
      for (const t of allTerms) freq.set(t, (freq.get(t) || 0) + 1)

      for (const [term, count] of freq) {
        items.push({ term, chunkId: chunk.id, knowledgeBaseId: kbId, termFrequency: count })
      }
    }

    await db.kbInvertedIndex.insertBatch(items)
  }

  // ==================== 检索 ====================

  async search(req: SearchRequest): Promise<{ success: boolean; data?: SearchResult[]; error?: string }> {
    try {
      const db = getCoreDatabaseManager()
      if (!db.kbChunks || !db.kbDocuments || !db.kbVectors || !db.knowledgeBases) {
        return { success: false, error: '数据库未初始化' }
      }

      const kb = await db.knowledgeBases.findById(req.knowledgeBaseId)
      if (!kb) return { success: false, error: '知识库不存在' }

      const config: EmbeddingConfig = kb.embeddingConfig ? JSON.parse(kb.embeddingConfig) : {}
      // D3 混合检索权重：1（缺省）= 纯向量（旧行为）；0 = 纯关键词；中间值 = 加权融合
      const vectorWeight = req.vectorWeight != null ? Math.min(1, Math.max(0, req.vectorWeight)) : 1
      const topK = req.topK || 5
      const threshold = req.threshold != null && req.threshold > 0 ? req.threshold : null

      // 向量召回（weight=0 时跳过嵌入调用省一次 API）。
      // H4：QA 命名空间（qa: 前缀）不参与文档检索——多召回以补偿被剔除的名额。
      const vecScores = new Map<string, number>()
      if (vectorWeight > 0) {
        const vectors = await this.getEmbeddingVectors([req.query], config, req.signal)
        if (!vectors) return { success: false, error: '生成查询向量失败' }
        // 混合时 3 倍召回（融合需要候选并集）+ QA 前缀剔除补偿
        const fetchK = (vectorWeight < 1 ? topK * 3 : topK) + QA_VECTOR_FETCH_PADDING
        const raw = await db.kbVectors.searchSimilar(req.knowledgeBaseId, vectors[0], fetchK)
        for (const r of raw) {
          if (r.chunkId.startsWith(QA_CHUNK_ID_PREFIX)) continue
          if (threshold !== null && r.score < threshold) continue // H3：阈值作用于原始余弦（保留既有语义）
          vecScores.set(r.chunkId, r.score)
          // 混合模式不按 topK 截断：候选集必须是 topK*3 的完整并集（排名第 topK+1~
          // 3topK 的向量命中才能被 BM25 同向命中"顶"进融合）；纯向量模式才截断到 topK
          if (vectorWeight >= 1 && vecScores.size >= topK) break
        }
      }

      // 关键词召回（BM25；无倒排索引/无命中时降级空——纯向量路径不受影响）
      const bm25 = vectorWeight < 1 ? await this.bm25Scores(req.knowledgeBaseId, req.query) : new Map<string, number>()

      // 候选并集 → 融合打分。
      // H3 语义：阈值已在各路原始分上过滤（上方的余弦阈值 + BM25 的 idf 加权分无
      // 绝对含义，不做阈值过滤）；融合分只用于排序，不回写为结果 score——
      // 纯向量路径的 score 保持原始余弦，下游展示/过滤不失真。
      const maxVec = Math.max(0, ...vecScores.values())
      const maxBm = Math.max(0, ...bm25.values())
      const candidates = new Set([...vecScores.keys(), ...bm25.keys()])
      const fused: Array<{ chunkId: string; score: number; raw: number }> = []
      for (const chunkId of candidates) {
        const v = maxVec > 0 ? (vecScores.get(chunkId) ?? 0) / maxVec : 0
        const b = maxBm > 0 ? (bm25.get(chunkId) ?? 0) / maxBm : 0
        // 融合分用于排序；回显 score 用原始最高分（向量优先，纯关键词路径用 BM25 分）
        const raw = vecScores.get(chunkId) ?? bm25.get(chunkId) ?? 0
        fused.push({ chunkId, score: vectorWeight * v + (1 - vectorWeight) * b, raw })
      }
      fused.sort((a, b) => b.score - a.score)

      const searchResults: SearchResult[] = []
      // M3：章节上下文缓存（按 documentId 懒加载，同文档多命中只查一次章节表）
      const chapterCache = new Map<string, ChapterLookup>()
      for (const r of fused.slice(0, topK)) {
        const chunk = await db.kbChunks.findById(r.chunkId)
        if (!chunk) continue
        const doc = await db.kbDocuments.findById(chunk.documentId)
        if (!doc) continue

        const chapter = await this.resolveChapterForChunk(chunk, chapterCache)
        searchResults.push({
          chunkId: chunk.id,
          documentId: doc.id,
          documentName: doc.name,
          content: chunk.content,
          score: Number(r.raw.toFixed(4)),
          ...(chapter
            ? {
                chapterPath: this.chapterPathOf(chapter, chapterCache.get(chapter.documentId)!.byId),
                ...(chapter.summary ? { chapterSummary: chapter.summary } : {}),
              }
            : {}),
        })
      }

      // D2 rerank：KB 配置了 rerank 且未被显式关闭 → 相关度重排（失败降级原序不阻断）
      if (kb.rerankConfig && req.useRerank !== false && searchResults.length > 1) {
        const reranked = await this.applyRerank(kb, req.query, searchResults, req.signal)
        if (reranked) return { success: true, data: reranked }
      }

      return { success: true, data: searchResults }
    } catch (e: any) {
      console.error('[KB] 检索失败:', e)
      return { success: false, error: e.message }
    }
  }

  /**
   * M3：解析命中块所属章节（检索结果携带章节路径 + 摘要）。
   *
   * 匹配优先级（review 修复同名章节歧义）：
   *  1) 章节全路径 key（chunk.sectionPath 全路径归一化拼接）——「第一节 设立」这类
   *     标题在多章下重复出现时靠父路径区分，避免摘要张冠李戴
   *  2) 标题精确（chunk.title / sectionPath 末项 / 首项，归一化）
   *  3) 标题包含兜底（标题带前缀/被截断时）
   * 未装配章节表或无匹配返回 null。
   */
  private async resolveChapterForChunk(
    chunk: KbChunk,
    cache: Map<string, ChapterLookup>,
  ): Promise<KbChapterRecord | null> {
    const db = getCoreDatabaseManager()
    if (!db.kbChapters) return null

    let lookup = cache.get(chunk.documentId)
    if (!lookup) {
      lookup = buildChapterLookup(await db.kbChapters.findByDocument(chunk.documentId))
      cache.set(chunk.documentId, lookup)
    }
    return matchChapter(lookup, chunk.title, chunk.sectionPath)
  }

  /**
   * D3 BM25 关键词打分：返回 chunkId -> 分数（未归一）。
   * 依赖倒排索引（文档入库时 buildIndex 写入）；索引缺失/无命中返回空 Map（调用方降级）。
   */
  private async bm25Scores(knowledgeBaseId: string, query: string): Promise<Map<string, number>> {
    const db = getCoreDatabaseManager()
    if (!db.kbInvertedIndex) return new Map()
    const terms = [...new Set(tokenizeForIndex(query))]
    if (terms.length === 0) return new Map()

    const [postings, dfMap, totalChunks, avgLen] = await Promise.all([
      db.kbInvertedIndex.findByTerms(knowledgeBaseId, terms),
      db.kbInvertedIndex.getDocumentFrequencies(knowledgeBaseId),
      db.kbInvertedIndex.getChunkCount(knowledgeBaseId),
      db.kbInvertedIndex.getAverageChunkLength(knowledgeBaseId),
    ])
    if (totalChunks === 0 || avgLen === 0) return new Map()

    // M3：长度归一需要候选 chunk 的真实文档长度（倒排索引不存 chunk 长度，
    // 从 kb_chunks 现取——候选集是命中的少量 chunk，代价可控）
    const candidateIds = new Set<string>()
    for (const items of postings.values()) for (const item of items) candidateIds.add(item.chunkId)
    const docLen = new Map<string, number>()
    for (const chunkId of candidateIds) {
      const chunk = await db.kbChunks?.findById(chunkId)
      // 长度用分词口径（与建索引的 avgLen 同口径：索引项频次和）——取 content 长度做近似
      if (chunk) docLen.set(chunkId, Math.max(1, tokenizeForIndex(chunk.content).length))
    }

    const scores = new Map<string, number>()
    for (const [term, items] of postings) {
      const df = dfMap.get(term) ?? 0
      if (df === 0) continue
      const idf = Math.log(1 + (totalChunks - df + 0.5) / (df + 0.5))
      for (const item of items) {
        const tf = item.termFrequency
        const len = docLen.get(item.chunkId) ?? avgLen
        // BM25 tf 饱和 + 文档长度归一（标准公式：tf 在分子，docLen 只进分母衰减项）
        const norm = tf * (BM25_K1 + 1) / (tf + BM25_K1 * (1 - BM25_B + BM25_B * len / avgLen))
        scores.set(item.chunkId, (scores.get(item.chunkId) ?? 0) + idf * norm)
      }
    }
    return scores
  }

  // ==================== D2 rerank 重排序 ====================

  /** rerank 配置面（kb.rerankConfig JSON） */
  private parseRerankConfig(kb: KnowledgeBase): { providerConfigId: string; modelId?: string } | null {
    if (!kb.rerankConfig) return null
    try {
      const cfg = JSON.parse(kb.rerankConfig)
      if (cfg && typeof cfg.providerConfigId === 'string' && cfg.providerConfigId) return cfg
    } catch {
      // 损坏配置降级为未启用
    }
    return null
  }

/** 对检索结果执行 rerank（公开入口：search 内联调用） */
  private async applyRerank(
    kb: KnowledgeBase,
    query: string,
    results: SearchResult[],
    signal?: AbortSignal
  ): Promise<SearchResult[] | null> {
    const cfg = this.parseRerankConfig(kb)
    if (!cfg || results.length < 2) return null
    try {
      const db = getCoreDatabaseManager()
      const provider = await db.providerConfigs?.getById(cfg.providerConfigId)
      if (!provider) throw new Error('rerank 提供商配置不存在')
      const storage = getSecureStorage()
      if (!storage.isInitialized()) await storage.initialize()
      const apiKey = storage.decrypt(provider.apiKey || '')

      // rerank 端点：主流（Jina/Cohere/Bailian 兼容）形态 POST {model, query, documents}
      let url: string
      switch (provider.templateId) {
        case 'bailian':
        case 'dashscope':
          url = 'https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank'
          break
        default:
          url = `${provider.baseUrl || 'https://api.jina.ai/v1'}/rerank`
      }

      // 请求体按提供商形态分叉：Jina/Cohere 兼容扁平 {model,query,documents,top_n}；
      // bailian/dashscope Text Rerank 要求嵌套 {model, input:{query,documents}, parameters:{top_n}}
      const isBailian = provider.templateId === 'bailian' || provider.templateId === 'dashscope'
      const body = isBailian
        ? {
            model: cfg.modelId || 'gte-rerank-v2',
            input: { query, documents: results.map(r => r.content) },
            parameters: { top_n: results.length, return_documents: false },
          }
        : {
            model: cfg.modelId || 'gte-rerank-v2',
            query,
            documents: results.map(r => r.content),
            top_n: results.length,
          }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        ...(signal ? { signal } : {}),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error?.message || err.message || 'rerank API 调用失败')
      }
      const data = await res.json()
      // 兼容 results:[{index, relevance_score|score}] 与 bailian output.results:[{index, relevanceScore}]
      const rows: Array<{ index: number; relevance_score?: number; score?: number; relevanceScore?: number }> =
        data.results ?? data.output?.results ?? []
      if (!Array.isArray(rows) || rows.length === 0) throw new Error('rerank 响应格式不识别')
      return rows
        .map(r => ({
          result: results[r.index],
          score: r.relevance_score ?? r.score ?? r.relevanceScore ?? 0,
        }))
        .filter(x => x.result)
        .sort((a, b) => b.score - a.score)
        .map(x => ({ ...x.result, score: x.score }))
    } catch (e) {
      console.error('[KB] rerank 失败（降级原序）:', e)
      return null
    }
  }

  /**
   * 获取文档分片列表
   */
  async getDocumentChunks(documentId: string): Promise<{ success: boolean; data?: KbChunk[]; error?: string }> {
    try {
      const db = getCoreDatabaseManager()
      if (!db.kbChunks || !db.kbDocuments) {
        return { success: false, error: '数据库未初始化' }
      }

      const doc = await db.kbDocuments.findById(documentId)
      if (!doc) return { success: false, error: '文档不存在' }

      const chunks = await db.kbChunks.findByDocumentId(documentId)
      return { success: true, data: chunks }
    } catch (e: any) {
      console.error('[KB] 获取文档分片失败:', e)
      return { success: false, error: e.message }
    }
  }

  /**
   * 分页获取文档切片列表（不包含 content 字段，减少内存占用）
   */
  async getDocumentChunksPaginated(
    documentId: string,
    page: number = 1,
    pageSize: number = 20
  ): Promise<{ success: boolean; data?: { chunks: KbChunk[]; total: number }; error?: string }> {
    try {
      const db = getCoreDatabaseManager()
      if (!db.kbChunks || !db.kbDocuments) {
        return { success: false, error: '数据库未初始化' }
      }

      const doc = await db.kbDocuments.findById(documentId)
      if (!doc) return { success: false, error: '文档不存在' }

      const offset = (page - 1) * pageSize
      const chunks = await db.kbChunks.findByDocumentIdPaginated(documentId, offset, pageSize)
      const total = await db.kbChunks.countByDocumentIdPaginated(documentId)

      // 移除 content 字段，减少内存占用
      const lightChunks = chunks.map(chunk => ({
        id: chunk.id,
        documentId: chunk.documentId,
        knowledgeBaseId: chunk.knowledgeBaseId,
        chunkIndex: chunk.chunkIndex,
        startOffset: chunk.startOffset,
        endOffset: chunk.endOffset,
        metadata: chunk.metadata,
        createdAt: chunk.createdAt
      })) as KbChunk[]

      return { success: true, data: { chunks: lightChunks, total } }
    } catch (e: any) {
      console.error('[KB] 分页获取文档分片失败:', e)
      return { success: false, error: e.message }
    }
  }

  /**
   * 获取单个切片详情（包含 content 字段）
   */
  async getChunkById(chunkId: string): Promise<{ success: boolean; data?: KbChunk; error?: string }> {
    try {
      const db = getCoreDatabaseManager()
      if (!db.kbChunks) {
        return { success: false, error: '数据库未初始化' }
      }

      const chunk = await db.kbChunks.findById(chunkId)
      if (!chunk) return { success: false, error: '切片不存在' }

      return { success: true, data: chunk }
    } catch (e: any) {
      console.error('[KB] 获取切片详情失败:', e)
      return { success: false, error: e.message }
    }
  }

  // ==================== 其他 ====================

  async getEmbeddingModels(): Promise<{ success: boolean; data?: EmbeddingModel[]; error?: string }> {
    return this.listModelsByType('embedding', 1536, 8192)
  }

  /** D2：列出可选 rerank 模型（复用 listModelsByType——维度/token 上限对 rerank 无意义，置 0） */
  async getRerankModels(): Promise<{ success: boolean; data?: EmbeddingModel[]; error?: string }> {
    return this.listModelsByType('rerank', 0, 0)
  }

  /** 按模型类型列出已启用提供商的模型（embedding/rerank 共用；严禁复制粘贴两份） */
  private async listModelsByType(
    type: string,
    defaultDimension: number,
    defaultMaxTokens: number
  ): Promise<{ success: boolean; data?: EmbeddingModel[]; error?: string }> {
    try {
      const db = getCoreDatabaseManager()
      if (!db.providerConfigs) return { success: false, error: '数据库未初始化' }
      const configs = await db.providerConfigs.getEnabled()
      const models: EmbeddingModel[] = []
      for (const cfg of configs) {
        if (!cfg.models) continue
        for (const m of cfg.models) {
          if (m.type === type) {
            models.push({
              id: m.id,
              name: `${cfg.name} - ${m.name}`,
              provider: 'cloud',
              dimension: m.contextWindow || defaultDimension,
              maxTokens: m.maxOutputTokens || defaultMaxTokens,
              providerConfigId: cfg.id,
              providerTemplateId: cfg.templateId,
            })
          }
        }
      }
      return { success: true, data: models }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }


  // selectFiles 已移到 IPC handler（dialog.showOpenDialog 是 Electron 平台特性）

  getFileLimits() {
    return {
      maxFileSize: 50 * 1024 * 1024,
      maxFilesPerUpload: 20,
      // 注意：doc（Word 97-2003 二进制格式）解析未实现（mammoth 仅支持 docx），
      // 不要列在这里 —— 上传收下却处理不了会永远卡 pending。
      supportedTypes: ['docx', 'txt', 'md', 'xlsx', 'xls', 'pdf', 'epub', 'mobi', 'azw3']
    }
  }

  /**
   * 添加网页文档
   * 抓取网页内容并添加到知识库
   */
  async addWebpage(kbId: string, url: string): Promise<{ success: boolean; data?: KbDocument; error?: string }> {
    try {
      const db = getCoreDatabaseManager()
      if (!db.knowledgeBases || !db.kbDocuments) return { success: false, error: '数据库未初始化' }

      const kb = await db.knowledgeBases.findById(kbId)
      if (!kb) return { success: false, error: '知识库不存在' }

      // 验证 URL
      let parsedUrl: URL
      try {
        parsedUrl = new URL(url)
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
          return { success: false, error: '仅支持 HTTP/HTTPS 协议' }
        }
      } catch {
        return { success: false, error: '无效的 URL 格式' }
      }

      // 抓取网页内容
      console.log(`[KB] 开始抓取网页: ${url}`)
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
        },
        signal: AbortSignal.timeout(30000) // 30秒超时
      })

      if (!response.ok) {
        return { success: false, error: `请求失败: ${response.status} ${response.statusText}` }
      }

      const contentType = response.headers.get('content-type') || ''
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
        return { success: false, error: '不支持的内容类型，仅支持 HTML 页面' }
      }

      const html = await response.text()

      // 解析 HTML 提取正文
      const { title, content } = this.extractWebpageContent(html, url)

      if (!content?.trim()) {
        return { success: false, error: '网页内容为空或无法提取' }
      }

      // 准备目录
      const dataPath = getPathProvider().getDataPath()
      const docDir = path.join(dataPath, 'knowledge-base', kbId, 'documents')
      if (!fs.existsSync(docDir)) fs.mkdirSync(docDir, { recursive: true })

      const docId = randomUUID()
      const destPath = path.join(docDir, `${docId}.txt`)

      // 写入文本内容到文件
      const contentBuffer = Buffer.from(content, 'utf-8')
      await fs.promises.writeFile(destPath, contentBuffer)

      // 使用网页标题或 URL 作为文档名称
      const docName = title || parsedUrl.hostname + parsedUrl.pathname

      const request: CreateDocumentRequest = {
        knowledgeBaseId: kbId,
        name: docName,
        filePath: destPath,
        fileType: 'webpage',
        fileSize: contentBuffer.length
      }

      const doc = await db.kbDocuments.create(request)

      // 更新统计
      await db.knowledgeBases.incrementDocumentCount(kbId, 1)
      await db.knowledgeBases.incrementTotalSize(kbId, doc.fileSize)

      // 发送知识库统计更新事件
      this.emitKnowledgeBaseStats(kbId)

      // 异步处理
      this.processDocument(doc, kb).catch(e => console.error('[KB] 处理失败:', e))

      console.log(`[KB] 网页添加成功: ${url}`)
      return { success: true, data: doc }
    } catch (e: any) {
      console.error('[KB] 添加网页失败:', e)
      if (e.name === 'AbortError' || e.name === 'TimeoutError') {
        return { success: false, error: '请求超时，请检查网址是否可访问' }
      }
      return { success: false, error: e.message || '添加网页失败' }
    }
  }

  /**
   * 从 HTML 中提取正文内容
   */
  private extractWebpageContent(html: string, url: string): { title: string; content: string } {
    const root = parse(html)

    // 获取标题
    let title = ''
    // 优先使用 og:title
    const ogTitleMeta = root.querySelector('meta[property="og:title"]')
    if (ogTitleMeta) {
      title = ogTitleMeta.getAttribute('content') || ''
    }
    if (!title) {
      const titleEl = root.querySelector('title')
      title = titleEl ? titleEl.text.trim() : ''
    }

    // 移除不需要的元素
    const removeSelectors = [
      'script', 'style', 'noscript', 'iframe', 'header', 'footer', 'nav', 'aside',
      '[role="navigation"]', '[role="banner"]', '[role="complementary"]',
      '.sidebar', '.navigation', '.menu', '.advertisement', '.ad', '.ads', '.comment', '.comments'
    ]
    for (const selector of removeSelectors) {
      for (const el of root.querySelectorAll(selector)) {
        el.remove()
      }
    }

    // 尝试找到主要内容区域
    const contentSelectors = [
      'article', 'main', '[role="main"]', '#content', '#main',
      '.content', '.main', '.post', '.article', 'body'
    ]
    let contentEl = null
    for (const selector of contentSelectors) {
      contentEl = root.querySelector(selector)
      if (contentEl) break
    }

    if (!contentEl) {
      contentEl = root
    }

    // 提取文本
    let content = contentEl.text

    // 清理文本
    content = content
      .replace(/\s+/g, ' ')  // 合并空白字符
      .replace(/\n\s*\n/g, '\n\n')  // 合并多余空行
      .trim()

    // 添加来源信息
    content = `标题: ${title}\n来源: ${url}\n\n${content}`

    return { title, content }
  }

  private getFileType(name: string): FileType | null {
    // 复用 extract-text 的推断（含 pdf/epub，修复历史遗漏）
    const type = inferFileType(name)
    // doc（Word 97-2003）解析未实现：这里拒绝，避免上传后永远卡 pending。
    // 用户请将 .doc 另存为 .docx 后上传。
    if (type === 'doc') return null
    return type
  }

  // ==================== D1 QA 知识库（问答对 + 双路径检索） ====================

  /** QA 对的向量 chunkId 命名空间：qa:<pairId>:<variantIndex>（question=0，相似问题 1..n） */
  private static qaVectorChunkId(pairId: string, variantIndex: number): string {
    return `${QA_CHUNK_ID_PREFIX}${pairId}:${variantIndex}`
  }

  private qaVariantCount(pair: { similarQuestions: string[] }): number {
    return 1 + pair.similarQuestions.length
  }

  /** 解析 KB 的嵌入配置 */
  private parseEmbeddingConfig(kb: KnowledgeBase): EmbeddingConfig {
    return kb.embeddingConfig ? JSON.parse(kb.embeddingConfig) : {}
  }

  /** 为 QA 对生成并写入变体向量；返回写入条数 */
  private async embedQaPair(
    kb: KnowledgeBase,
    pairId: string,
    question: string,
    similarQuestions: string[]
  ): Promise<number> {
    const db = getCoreDatabaseManager()
    if (!db.kbVectors) throw new Error('数据库未初始化')
    const variants = [question, ...similarQuestions].map(t => t.trim()).filter(Boolean)
    if (variants.length === 0) throw new Error('问题不能为空')
    const vectors = await this.getEmbeddingVectors(variants, this.parseEmbeddingConfig(kb))
    if (!vectors) throw new Error('生成 QA 向量失败')
    await db.kbVectors.createBatch(
      vectors.map((vector, i) => ({
        chunkId: KnowledgeBaseService.qaVectorChunkId(pairId, i),
        knowledgeBaseId: kb.id,
        vector,
      }))
    )
    return vectors.length
  }

  async addQaPair(knowledgeBaseId: string, input: {
    question: string
    answer: string
    similarQuestions?: string[]
  }): Promise<{ success: boolean; data?: KbQaPairRecord; error?: string }> {
    try {
      const db = getCoreDatabaseManager()
      if (!db.knowledgeBases || !db.kbQaPairs || !db.kbVectors) {
        return { success: false, error: '数据库未初始化' }
      }
      const kb = await db.knowledgeBases.findById(knowledgeBaseId)
      if (!kb) return { success: false, error: '知识库不存在' }
      const question = input.question.trim()
      const answer = input.answer.trim()
      if (!question || !answer) return { success: false, error: '问题和答案都不能为空' }
      const similar = (input.similarQuestions ?? []).map(x => x.trim()).filter(Boolean)

      const pair = await db.kbQaPairs.create({ knowledgeBaseId, question, answer, similarQuestions: similar })
      let added: number
      try {
        added = await this.embedQaPair(kb, pair.id, question, similar)
      } catch (e) {
        // M1：向量化失败回滚行（不留"有行无向量"的孤儿——检索永不命中却在 UI 显示）
        await db.kbQaPairs.delete(pair.id).catch(() => {})
        throw e
      }
      await db.knowledgeBases.updateStats(knowledgeBaseId, {
        documentCount: kb.documentCount,
        vectorCount: (kb.vectorCount ?? 0) + added,
        totalSize: kb.totalSize,
      })
      return { success: true, data: pair }
    } catch (e: any) {
      console.error('[KB] 新增 QA 对失败:', e)
      return { success: false, error: e.message }
    }
  }

  async updateQaPair(id: string, patch: {
    question?: string
    answer?: string
    similarQuestions?: string[]
  }): Promise<{ success: boolean; data?: KbQaPairRecord; error?: string }> {
    try {
      const db = getCoreDatabaseManager()
      if (!db.knowledgeBases || !db.kbQaPairs || !db.kbVectors) {
        return { success: false, error: '数据库未初始化' }
      }
      const old = await db.kbQaPairs.findById(id)
      if (!old) return { success: false, error: 'QA 对不存在' }
      const kb = await db.knowledgeBases.findById(old.knowledgeBaseId)
      if (!kb) return { success: false, error: '知识库不存在' }
      // 评审 #75：补偿回滚基线——任何变更前先快照（防仓库实现返回活引用被原地改写）
      const rollbackTo = { question: old.question, answer: old.answer, similarQuestions: old.similarQuestions }

      const question = (patch.question ?? old.question).trim()
      const answer = (patch.answer ?? old.answer).trim()
      const similar = (patch.similarQuestions ?? old.similarQuestions).map(x => x.trim()).filter(Boolean)
      if (!question || !answer) return { success: false, error: '问题和答案都不能为空' }

      // 评审 #75：更新必须原子——任意一步失败都不得留下「有行无向量」或「文本与向量不一致」。
      // 顺序：先算新向量（不动库）→ 快照旧向量（补偿用）→ 删旧向量 → 改文本 → 写新向量；
      // 任一步失败则恢复快照向量并回滚文本行。
      const vectors = await this.getEmbeddingVectors(
        [question, ...similar].map(t => t.trim()).filter(Boolean),
        this.parseEmbeddingConfig(kb),
      )
      if (!vectors) throw new Error('生成 QA 向量失败')

      // 快照旧变体向量（向量存储无跨库事务，用快照做补偿回滚）
      const oldChunkIds = Array.from({ length: this.qaVariantCount(old) }, (_, i) =>
        KnowledgeBaseService.qaVectorChunkId(id, i)
      )
      const oldVectors: Array<{ chunkId: string; knowledgeBaseId: string; vector: number[] }> = []
      for (const chunkId of oldChunkIds) {
        const rec = await db.kbVectors.getByChunkId(chunkId).catch(() => null)
        if (rec && rec.knowledgeBaseId === kb.id) oldVectors.push({ chunkId: rec.chunkId, knowledgeBaseId: rec.knowledgeBaseId, vector: rec.vector })
      }

      // 删旧变体向量（确定性重建：按旧变体数枚举 chunkId）
      for (const chunkId of oldChunkIds) await db.kbVectors.deleteByChunkId(chunkId)

      try {
        const updated = await db.kbQaPairs.update(id, { question, answer, similarQuestions: similar })
        await db.kbVectors.createBatch(
          vectors.map((vector, i) => ({
            chunkId: KnowledgeBaseService.qaVectorChunkId(id, i),
            knowledgeBaseId: kb.id,
            vector,
          }))
        )
        await db.knowledgeBases.updateStats(kb.id, {
          documentCount: kb.documentCount,
          vectorCount: Math.max(0, (kb.vectorCount ?? 0) - oldChunkIds.length) + vectors.length,
          totalSize: kb.totalSize,
        })
        return { success: true, data: updated ?? undefined }
      } catch (e) {
        // 补偿：清掉可能写了一半的新向量 → 恢复旧向量 → 回滚文本行
        console.error('[KB] 更新 QA 对失败，执行补偿回滚:', e)
        await db.kbVectors.deleteByChunkIds(
          vectors.map((_, i) => KnowledgeBaseService.qaVectorChunkId(id, i))
        ).catch(() => {})
        if (oldVectors.length) await db.kbVectors.createBatch(oldVectors).catch(() => {})
        await db.kbQaPairs.update(id, { ...rollbackTo }).catch(() => {})
        throw e
      }
    } catch (e: any) {
      console.error('[KB] 更新 QA 对失败:', e)
      return { success: false, error: e.message }
    }
  }

  async deleteQaPair(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const db = getCoreDatabaseManager()
      if (!db.knowledgeBases || !db.kbQaPairs || !db.kbVectors) {
        return { success: false, error: '数据库未初始化' }
      }
      const pair = await db.kbQaPairs.findById(id)
      if (!pair) return { success: true } // 幂等
      const kb = await db.knowledgeBases.findById(pair.knowledgeBaseId)
      for (let i = 0; i < this.qaVariantCount(pair); i++) {
        await db.kbVectors.deleteByChunkId(KnowledgeBaseService.qaVectorChunkId(id, i))
      }
      await db.kbQaPairs.delete(id)
      if (kb) {
        await db.knowledgeBases.updateStats(kb.id, {
          documentCount: kb.documentCount,
          vectorCount: Math.max(0, (kb.vectorCount ?? 0) - this.qaVariantCount(pair)),
          totalSize: kb.totalSize,
        })
      }
      return { success: true }
    } catch (e: any) {
      console.error('[KB] 删除 QA 对失败:', e)
      return { success: false, error: e.message }
    }
  }

  async listQaPairs(knowledgeBaseId: string, keyword?: string): Promise<{ success: boolean; data?: KbQaPairRecord[]; error?: string }> {
    try {
      const db = getCoreDatabaseManager()
      if (!db.kbQaPairs) return { success: false, error: '数据库未初始化' }
      return { success: true, data: await db.kbQaPairs.listByKnowledgeBaseId(knowledgeBaseId, keyword) }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  /** QA 直出检索：命中返回标准答案（不查文档、不过 LLM）——Bisheng 双路径的 QA 路 */
  async searchQa(req: {
    knowledgeBaseId: string
    query: string
    topK?: number
    threshold?: number
    signal?: AbortSignal
  }): Promise<{ success: boolean; data?: Array<{ pairId: string; question: string; answer: string; score: number }>; error?: string }> {
    try {
      const db = getCoreDatabaseManager()
      if (!db.knowledgeBases || !db.kbQaPairs || !db.kbVectors) {
        return { success: false, error: '数据库未初始化' }
      }
      // 无 QA 对时快速返回（省一次嵌入调用）
      if ((await db.kbQaPairs.countByKnowledgeBaseId(req.knowledgeBaseId)) === 0) {
        return { success: true, data: [] }
      }
      const kb = await db.knowledgeBases.findById(req.knowledgeBaseId)
      if (!kb) return { success: false, error: '知识库不存在' }

      const vectors = await this.getEmbeddingVectors([req.query], this.parseEmbeddingConfig(kb), req.signal)
      if (!vectors) return { success: false, error: '生成查询向量失败' }

      const raw = await db.kbVectors.searchSimilar(req.knowledgeBaseId, vectors[0], req.topK || 3)
      const minScore = req.threshold ?? 0
      // QA 命中：chunkId 命名空间过滤 + 按 pair 去重（保留最高分变体）
      const best = new Map<string, { pairId: string; score: number }>()
      for (const r of raw) {
        if (r.score < minScore) continue
        const m = /^qa:([^:]+):\d+$/.exec(r.chunkId)
        if (!m) continue // 文档向量不参与 QA 直出
        const prev = best.get(m[1])
        if (!prev || r.score > prev.score) best.set(m[1], { pairId: m[1], score: r.score })
      }
      const out: Array<{ pairId: string; question: string; answer: string; score: number }> = []
      for (const { pairId, score } of best.values()) {
        const pair = await db.kbQaPairs.findById(pairId)
        if (pair) out.push({ pairId, question: pair.question, answer: pair.answer, score })
      }
      out.sort((a, b) => b.score - a.score)
      return { success: true, data: out }
    } catch (e: any) {
      console.error('[KB] QA 检索失败:', e)
      return { success: false, error: e.message }
    }
  }

  /**
   * xlsx 批量导入（表头：question / answer / similarQuestions——分号分隔的多问法）
   * 评审 #77：无上限的解析是 DoS 面——文件 10MB、行数 1 万双上限，超限明确报错。
   * （xlsx@0.18.5 存在已知原型污染/ReDoS CVE，修复版仅发布于 sheetjs 官方源，
   *   npm registry 无升级可用；上限是第一道缓解，升级路径见进度文档记录。）
   */
  async importQaPairs(knowledgeBaseId: string, fileBuffer: Buffer): Promise<{ success: boolean; data?: { imported: number; failed: number }; error?: string }> {
    try {
      if (fileBuffer.length > QA_IMPORT_MAX_FILE_BYTES) {
        return { success: false, error: `文件超出上限：${(fileBuffer.length / 1024 / 1024).toFixed(1)}MB > ${QA_IMPORT_MAX_FILE_BYTES / 1024 / 1024}MB` }
      }
      const XLSX = await import('xlsx')
      const wb = XLSX.read(fileBuffer)
      const sheet = wb.Sheets[wb.SheetNames[0]]
      if (!sheet) return { success: false, error: 'xlsx 中没有工作表' }
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet)
      if (rows.length > QA_IMPORT_MAX_ROWS) {
        return { success: false, error: `行数超出上限：${rows.length} 行 > ${QA_IMPORT_MAX_ROWS} 行，请拆分后分批导入` }
      }
      let imported = 0
      let failed = 0
      for (const row of rows) {
        const question = String(row['question'] ?? '').trim()
        const answer = String(row['answer'] ?? '').trim()
        const similar = String(row['similarQuestions'] ?? row['similar_questions'] ?? '')
          .split(/[;；]/).map(x => x.trim()).filter(Boolean)
        if (!question || !answer) { failed++; continue }
        const r = await this.addQaPair(knowledgeBaseId, { question, answer, similarQuestions: similar })
        if (r.success) imported++
        else failed++
      }
      return { success: true, data: { imported, failed } }
    } catch (e: any) {
      console.error('[KB] QA xlsx 导入失败:', e)
      return { success: false, error: e.message }
    }
  }

  /** xlsx 导出（返回 base64——双端 IPC 可序列化；前端 saveBlobAs 落盘） */
  async exportQaPairs(knowledgeBaseId: string): Promise<{ success: boolean; data?: { base64: string; fileName: string }; error?: string }> {
    try {
      const db = getCoreDatabaseManager()
      if (!db.knowledgeBases || !db.kbQaPairs) return { success: false, error: '数据库未初始化' }
      const kb = await db.knowledgeBases.findById(knowledgeBaseId)
      if (!kb) return { success: false, error: '知识库不存在' }
      const pairs = await db.kbQaPairs.listByKnowledgeBaseId(knowledgeBaseId)
      const XLSX = await import('xlsx')
      const ws = XLSX.utils.json_to_sheet(pairs.map(p => ({
        question: p.question,
        answer: p.answer,
        similarQuestions: p.similarQuestions.join('；'),
      })))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'QA')
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
      const safeName = kb.name.replace(/[\\/:*?"<>|]/g, '_')
      return { success: true, data: { base64: buf.toString('base64'), fileName: `${safeName}-QA.xlsx` } }
    } catch (e: any) {
      console.error('[KB] QA xlsx 导出失败:', e)
      return { success: false, error: e.message }
    }
  }
}