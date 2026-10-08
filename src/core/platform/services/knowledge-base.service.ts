/**
 * 知识库服务
 * @module platform/services/knowledge-base.service
 * @description 知识库核心业务服务
 */

import fs from 'fs'
import path from 'path'
import { createHash, randomUUID } from 'crypto'
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
import { detectKeywordIntent } from '@core/platform/services/query-routing'
import { tokenizeForIndex } from '@core/platform/services/kb-tokenize'
import { BrainQueryService, type BrainQueryDeps } from './kb-brain/brain-query.service'
import { defaultBrainLlm } from './kb-brain/llm'
import { extractTextFromFile, inferFileType } from '@core/utils/extract-text'
import { resolveAssetPath, toRelativeAssetPath } from '@core/utils/asset-path'
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
import { knowledgeParams } from '@shared/utils/knowledge-params'
import { isListableChatModel } from '@shared/utils/model-predicates'

// D3：索引分词抽至 kb-tokenize（知识大脑论断入池同源复用；词表与分词必须一处定义）

/** QA 对向量的 chunkId 命名空间前缀（与 addQaPair 写入一致；文档检索须剔除） */
const QA_CHUNK_ID_PREFIX = 'qa:'

/** BM25 参数（k1 词频饱和、b 长度归一；业界标准值） */
const BM25_K1 = 1.2
const BM25_B = 0.75

/**
 * 全量取切片（含正文）的条数上限。
 * 大文档实测：6704 片 / 正文 7.09 MB 全量读会触发 SQLITE_CANTOPEN（临时文件打不开）。
 * 需要浏览全部切片的调用方应改用分页接口。
 */
const FULL_CHUNK_FETCH_LIMIT = 2000

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
    // 失败原因由 getEmbeddingVectors 抛出（含接口原话），此处不再兜底成笼统文案
    return await this.service.getEmbeddingVectors(texts, this.config)
  }
}

export class KnowledgeBaseService {
  /**
   * 在途后台处理任务（docId → Promise）。
   *
   * 用途：① 防重复触发（同一文档已在跑就不再起第二个）；② 让测试/调用方
   * 可以确定性地等待后台任务收尾，不必轮询数据库。
   */
  private readonly inFlight = new Map<string, Promise<void>>()

  /** 等待某文档的后台处理任务完成（无在途任务则立即返回）；供测试与内部编排使用 */
  async waitForBackgroundTask(docId: string): Promise<void> {
    const p = this.inFlight.get(docId)
    if (p) await p.catch(() => undefined)
  }

  /** 当前是否有在途后台任务（供重复触发防护与测试断言） */
  isProcessing(docId: string): boolean {
    return this.inFlight.has(docId)
  }

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
      // 章节表冗余存全文，随库一起清理（与 deleteDocument 同口径）
      if (db.kbChapters) await db.kbChapters.deleteByKnowledgeBaseId(id)
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
          // 入库统一相对 dataPath（正斜杠）：换数据目录/跨平台后仍可解析，UI 也不会露出本机绝对路径
          filePath: toRelativeAssetPath(destPath),
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
          // 覆盖文件内容（复用 existing.filePath，避免文件孤立）；
          // file_path 是 dataPath 相对路径 → 必须解析回绝对路径，否则会按进程 CWD 写到别处
          await fs.promises.writeFile(resolveAssetPath(existing.filePath), newBuf)

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
        // 同上传：入库相对 dataPath（正斜杠）
        filePath: toRelativeAssetPath(destPath),
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
      // 内嵌资源目录（epub 图片等）随文档一起清理
      this.removeDocumentAssets(kbId, docId)

      await db.kbVectors.deleteByDocumentId(docId)
      await db.kbInvertedIndex.deleteByDocumentId(docId)
      await db.kbChunks.deleteByDocumentId(docId)
      // 章节表冗余存全文，必须随文档一起清理（否则删除后正文仍留在库里）
      if (db.kbChapters) await db.kbChapters.deleteByDocument(docId)
      // 大脑产物级联（v2 P0 深审 B5）：论断/场面/台账随删，卡片剔引用；各阶段 fail-soft 不阻塞删文档
      try {
        const { cleanupBrainArtifactsForDocument } = await import('@core/platform/services/kb-brain/artifact-cleanup')
        await cleanupBrainArtifactsForDocument(kbId, docId, {
          atoms: db.kbAtoms ?? null,
          events: db.kbEvents ?? null,
          edges: db.kbKnowledgeEdges ?? null,
          passes: db.kbDigestPasses ?? null,
          notes: db.kbNotes ?? null,
          vectors: db.kbVectors ?? null,
        })
      } catch (e) {
        // 大脑清理失败不阻塞删文档主链路（残留可由后续代谢整固收敛）
        console.warn('[KnowledgeBaseService] 大脑产物级联清理失败（不阻塞）:', e instanceof Error ? e.message : String(e))
      }
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

  /**
   * 重新处理文档（从头跑完整管线）。
   *
   * **后台执行**（与 resumeDocument / 上传同模式）：完整管线要为全部切片重新
   * 解析+切分+逐批 embedding，大文档耗时数分钟；同步 await 会让 IPC 长时间不返回、
   * 前端 isLoading 挂住、文档列表被蒙层锁死。
   * 返回值只表示**是否成功启动**，进度/终态走事件。
   */
  async reprocessDocument(docId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const db = getCoreDatabaseManager()
      if (!db.kbDocuments || !db.knowledgeBases) return { success: false, error: '数据库未初始化' }

      const doc = await db.kbDocuments.findById(docId)
      if (!doc) return { success: false, error: '文档不存在' }

      // 防重复触发（同 resumeDocument）：并发跑两条完整管线会互相清空产物
      if (this.isProcessing(docId)) {
        return { success: false, error: '该文档正在处理中，请等待当前任务结束' }
      }

      const kb = await db.knowledgeBases.findById(doc.knowledgeBaseId)
      if (!kb) return { success: false, error: '知识库不存在' }

      await db.kbDocuments.updateProgress(docId, 0)
      this.emitStatus(docId, 'processing')
      await this.clearDocumentArtifacts(docId)
      this.runInBackground(docId, doc.name, async () => {
        await this.processDocument(doc, kb)
      })
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  /**
   * 继续处理（断点续跑）。
   *
   * 背景：processDocument 是纯内存 fire-and-forget——上传后 PC 重启，内存里的 Promise
   * 直接蒸发，文档永久停在 processing，且 UI 的「重新处理」按钮不覆盖 processing 状态，
   * 用户无路可走。
   *
   * 续跑点判定（管线顺序：解析 → 切片落库 → 逐批生成向量 → 建倒排索引 → 标记完成）：
   *  - 无切片          → 解析/切片阶段就中断，无可复用产物，从头跑完整管线
   *  - 有切片、向量不全 → 只为「没有向量的切片」补向量（已有向量绝不重算，省时省钱）
   *  - 切片+向量齐全    → 只补建倒排索引并收口完成
   *
   * 幂等：已完成的文档再续跑不会重复生成任何向量。
   *
   * **后台执行**（与上传同模式，不用 await 等完）：
   * 大文档续跑要为数千切片逐批调 embedding，耗时数分钟。此前同步 await 会让
   * IPC 长时间不返回、前端 isLoading 全程挂住、整个文档列表被蒙层锁死。
   * 现在立即返回「已受理」，进度/终态经 kb:document-progress / kb:document-status
   * 事件推进；真实失败原因由失败事件与文档 errorMessage 呈现。
   * 返回值只表示**是否成功启动**（前置校验 + 已置 processing）。
   */
  async resumeDocument(docId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const db = getCoreDatabaseManager()
      if (!db.kbDocuments || !db.knowledgeBases || !db.kbChunks) {
        return { success: false, error: '数据库未初始化' }
      }

      const doc = await db.kbDocuments.findById(docId)
      if (!doc) return { success: false, error: '文档不存在' }

      // 防重复触发：后台任务已在该文档上跑时直接拒绝，避免两条管线并发写同一份
      // chunks/vectors（互相清空彼此产物，且白烧 embedding）
      if (this.isProcessing(docId)) {
        return { success: false, error: '该文档正在处理中，请等待当前任务结束' }
      }

      const kb = await db.knowledgeBases.findById(doc.knowledgeBaseId)
      if (!kb) return { success: false, error: '知识库不存在' }

      const existing = await db.kbChunks.findByDocumentId(docId)

      // 先置为 processing：让界面立刻反映「已开始」，也避免重复点击触发两次
      await db.kbDocuments.updateProgress(docId, existing.length === 0 ? 0 : 30)
      this.emitStatus(docId, 'processing')

      if (existing.length === 0) {
        // 解析/切片阶段中断：没有可复用的切片与向量，等价于重新处理
        console.info(`[KB] 继续处理：无已落切片，从头跑完整管线: ${doc.name}`)
        await this.clearDocumentArtifacts(docId)
        this.runInBackground(docId, doc.name, async () => {
          await this.processDocument(doc, kb)
        })
        return { success: true }
      }

      console.info(`[KB] 继续处理：复用 ${existing.length} 条已落切片: ${doc.name}`)
      this.runInBackground(docId, doc.name, async () => {
        await this.completeDocumentVectors(doc, kb, existing)
      })
      return { success: true }
    } catch (e: any) {
      console.error('[KB] 继续处理启动失败:', e)
      return { success: false, error: e.message }
    }
  }

  /**
   * 后台执行长任务：不阻塞调用方，异常落库 + 发失败事件（与上传的 fire-and-forget 同纪律）。
   *
   * 关键：**必须兜住异常**——后台 Promise 若 reject 且无人接，会变成 unhandled rejection，
   * 且文档会永远停在 processing（用户看到"永远在处理中"却没有任何原因）。
   */
  private runInBackground(
    docId: string,
    docName: string,
    task: () => Promise<void>,
  ): void {
    const running = task().catch(async (e: any) => {
      const msg = e?.message || String(e)
      console.error(`[KB] 后台处理失败: ${docName}`, e)
      try {
        const db = getCoreDatabaseManager()
        await db.kbDocuments?.markFailed(docId, msg)
      } catch (markErr) {
        console.error('[KB] 写入失败状态时再次出错:', markErr)
      }
      this.emitStatus(docId, 'failed', undefined, msg)
    })
    this.inFlight.set(docId, running)
    void running.finally(() => {
      // 只清除自己那一次（避免后起的任务被前一个的 finally 误删）
      if (this.inFlight.get(docId) === running) this.inFlight.delete(docId)
    })
  }

  /**
   * 补齐切片向量 → 建索引 → 收口完成（「继续处理」的补完阶段）。
   *
   * 断点续跑核心：先查出哪些切片已有向量，只对缺失的那部分调 embedding。
   * 已有向量一律保留（不重算、不覆盖）——这是「继续处理」相对「重新处理」的价值所在。
   *
   * 取数纪律（真实故障修复）：**元信息与正文分开取**。
   * 此前一次性把整篇文档的切片（含正文）读进内存——单文档 6704 片 / 正文 7.09 MB，
   * SQLite 读溢出页时打不开临时文件，抛 SQLITE_CANTOPEN（"数据库打不开"是误导文案）。
   * 现在：先只读元信息判定待补集合，再按 embedding 批大小逐批取对应正文。
   *
   * @param doc 目标文档
   * @param kb  所属知识库
   * @param chunkRecords 目标文档的**切片元信息**（不含正文，来自 findByDocumentId 默认列）
   */
  private async completeDocumentVectors(
    doc: KbDocument,
    kb: KnowledgeBase,
    chunkRecords: KbChunk[],
  ): Promise<void> {
    const db = getCoreDatabaseManager()
    if (!db.kbDocuments || !db.kbVectors || !db.kbChunks) return

    const embeddingConfig: EmbeddingConfig = kb.embeddingConfig ? JSON.parse(kb.embeddingConfig) : {}

    // 1. 找出已具备向量的切片，其余为待补（此步只用 id，不碰正文）
    const existingVectors = await db.kbVectors.findByChunkIds(chunkRecords.map(c => c.id))
    const pendingIds = chunkRecords.filter(c => !existingVectors.has(c.id)).map(c => c.id)
    const done = chunkRecords.length - pendingIds.length
    console.log(
      `[KB] 向量补齐：共 ${chunkRecords.length} 条，已有 ${done} 条，待补 ${pendingIds.length} 条`,
    )

    // 2. 只为缺失的切片生成向量。正文**逐批按需取**（不用一次性持有全文）
    const batchSize = knowledgeParams().ingest.embeddingBatchSize
    for (let i = 0; i < pendingIds.length; i += batchSize) {
      if (!(await this.assertDocAlive(doc.id, 'resume vectors 写入前'))) return
      const idBatch = pendingIds.slice(i, i + batchSize)

      // 仅取这一批的正文（按 id 精确取，读取量 = batchSize 条）
      const withContent = await db.kbChunks.findByIds(idBatch, { includeContent: true })
      const contentById = new Map(withContent.map(c => [c.id, c.content ?? '']))
      const texts = idBatch.map(id => contentById.get(id) ?? '')

      const vectors = await this.getEmbeddingVectors(texts, embeddingConfig)

      await db.kbVectors.createBatch(
        vectors.map((v, idx) => ({
          chunkId: idBatch[idx],
          knowledgeBaseId: kb.id,
          vector: v,
        })),
      )

      const progress = 30 + Math.floor(((done + i) / chunkRecords.length) * 50)
      await db.kbDocuments.updateProgress(doc.id, progress)
      this.emitProgress(doc.id, progress, undefined)
    }

    // 3. 倒排索引（幂等重建：先清该文档旧索引，避免续跑累积重复词条）
    await db.kbDocuments.updateProgress(doc.id, 90)
    this.emitProgress(doc.id, 90, 3)
    if (!(await this.assertDocAlive(doc.id, 'resume buildIndex/markCompleted 前'))) return
    if (db.kbInvertedIndex) await db.kbInvertedIndex.deleteByDocumentId(doc.id)
    // 正文逐批取回分词（不一次性持有全文）
    await this.buildIndexBatched(chunkRecords.map(c => c.id), kb.id)

    // 4. 收口完成
    await db.kbDocuments.markCompleted(doc.id, chunkRecords.length)
    await db.knowledgeBases?.incrementVectorCount(kb.id, pendingIds.length)
    this.emitProgress(doc.id, 100, 0)
    this.emitStatus(doc.id, 'completed', chunkRecords.length)
    this.emitKnowledgeBaseStats(kb.id)
    console.log(`[KB] 继续处理完成: ${doc.name}（本次新生成向量 ${pendingIds.length} 条）`)
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
   * 清空一篇文档相关的所有派生数据：vectors / inverted-index / chunks / chapters。
   * 由 reprocessDocument 与 addDocument 的 upsert 分支共用。
   * 顺序与 deleteDocument 保持一致，避免外键约束被违反。
   * 章节一并清掉：重解析中途失败时不能留下与已清空切片不一致的旧章节树。
   */
  private async clearDocumentArtifacts(docId: string): Promise<void> {
    const db = getCoreDatabaseManager()
    if (!db.kbVectors || !db.kbInvertedIndex || !db.kbChunks) return
    await db.kbVectors.deleteByDocumentId(docId)
    await db.kbInvertedIndex.deleteByDocumentId(docId)
    await db.kbChunks.deleteByDocumentId(docId)
    if (db.kbChapters) await db.kbChapters.deleteByDocument(docId)
  }

  // ==================== 文档处理 ====================

  /**
   * 阶段边界存活性检查：processDocument 是 fire-and-forget（调用方仅 .catch 兜底），
   * 管线执行中文档可能已被 deleteDocument / purgeEntryIds 删除——继续跑会在
   * chunks / vectors / inverted-index / chapters 留下指向不存在文档的孤儿行。
   * 各关键阶段边界回读文档行确认仍在，已删则记 info 日志并返回 false 中止。
   * 不抛错：调用方只有 .catch 兜底，抛错只会制造 unhandled rejection 噪音。
   */
  private async assertDocAlive(docId: string, stage: string): Promise<boolean> {
    const db = getCoreDatabaseManager()
    if (!db.kbDocuments) return false
    const row = await db.kbDocuments.findById(docId).catch(() => null)
    if (!row) {
      console.info(`[KB] 文档已被删除，中止后续处理（${stage}）: ${docId}`)
      return false
    }
    return true
  }

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
      // 内嵌图片（epub 等）落到应用数据目录，正文只写 dataPath 相对路径；
      // 重新处理前先清空旧的资源目录，避免上次残留的图片混入本次结果
      const assets = this.documentAssetDir(kb.id, doc.id)
      this.removeDocumentAssets(kb.id, doc.id)
      const content = await this.parseFile(doc.filePath, doc.fileType, {
        dir: assets.abs,
        refPrefix: assets.rel,
      })
      const assetCount = this.countAssetFiles(assets.abs)
      if (assetCount > 0) {
        console.log(`[KB] 内嵌资源落盘: ${assetCount} 个 → ${assets.rel}`)
      } else {
        this.dropEmptyAssetDir(assets.abs)
      }
      if (!content?.trim()) {
        await db.kbDocuments.markFailed(doc.id, '文档内容为空')
        this.emitStatus(doc.id, 'failed', undefined, '文档内容为空')
        return
      }
      console.log(`[KB] 解析完成, 长度: ${content.length}`)

      // 1.5 章节树落库（与切片同源的结构检测；供检索上下文注入/章节摘要消费）
      // 失败不影响切片与向量主流程（章节是增强能力，见 syncChapters 内部 fail-soft）
      if (!(await this.assertDocAlive(doc.id, 'syncChapters 前'))) return
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
        if (!(await this.assertDocAlive(doc.id, 'split 前'))) return
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

      if (!(await this.assertDocAlive(doc.id, 'chunks 写入前'))) return
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

      // 5. 生成向量（批量大小走「参数设置 → 知识库 → 入库与导入」）
      const batchSize = knowledgeParams().ingest.embeddingBatchSize
      const totalBatches = Math.ceil(chunkRecords.length / batchSize)
      const estimatedBatchTime = 2 // 秒

      let batchIndex = 0
      for (let i = 0; i < chunkRecords.length; i += batchSize) {
        // 向量写入前逐批检查（embedding 网络调用是管线最慢一段，删除最可能发生在其间）
        if (!(await this.assertDocAlive(doc.id, 'vectors 写入前'))) return
        const batch = chunkRecords.slice(i, i + batchSize)
        const texts = batch.map(c => c.content)

        const vectors = await this.getEmbeddingVectors(texts, embeddingConfig)

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
      if (!(await this.assertDocAlive(doc.id, 'buildIndex/markCompleted 前'))) return
      await this.buildIndex(chunkRecords, kb.id)

      // 完成
      await db.kbDocuments.markCompleted(doc.id, splitChunks.length)
      await db.knowledgeBases.incrementVectorCount(kb.id, splitChunks.length)
      this.emitProgress(doc.id, 100, 0)
      this.emitStatus(doc.id, 'completed', splitChunks.length)
      this.emitKnowledgeBaseStats(kb.id)
      if (assetCount > 0) {
        console.log(`[KB] 内嵌资源校验: ${this.countAssetFiles(assets.abs)}/${assetCount} 仍在磁盘`)
      }
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
   *
   * @param assets 文档内嵌资源落盘信息（epub 图片等）；不传则解析器用临时目录、正文里的本地图片引用被清理
   */
  private async parseFile(
    filePath: string,
    fileType: FileType,
    assets?: { dir: string; refPrefix: string },
  ): Promise<string> {
    // file_path 入库约定为 dataPath 相对路径（asset-paths-to-relative 迁移会把绝对路径改写为相对），
    // 从 DB 重读（重新处理/重启后续跑）必须解析回绝对路径，否则按进程 CWD 解析必 ENOENT
    const resolved = resolveAssetPath(filePath)
    return extractTextFromFile(resolved, fileType, {
      asMarkdown: true,
      resourceDir: assets?.dir,
      resourceRefPrefix: assets?.refPrefix,
    })
  }

  /** 文档内嵌资源目录（dataPath 相对路径 + 绝对路径），与文档本体同属 knowledge-base/<kbId>/documents 下 */
  private documentAssetDir(kbId: string, docId: string): { abs: string; rel: string } {
    const abs = path.join(getPathProvider().getDataPath(), 'knowledge-base', kbId, 'documents', 'assets', docId)
    return { abs, rel: toRelativeAssetPath(abs) }
  }

  /**
   * 清理文档内嵌资源目录。
   * @param keepEmpty 保留空目录？重新处理前清空用 true（解析器随后写入）；删除文档用 false
   */
  private removeDocumentAssets(kbId: string, docId: string): void {
    try {
      const { abs } = this.documentAssetDir(kbId, docId)
      if (fs.existsSync(abs)) fs.rmSync(abs, { recursive: true, force: true })
    } catch (e: unknown) {
      console.warn(`[KB] 清理内嵌资源目录失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  /** 递归统计资源目录里的文件数（0/不存在都返回 0） */
  private countAssetFiles(dir: string): number {
    try {
      if (!fs.existsSync(dir)) return 0
      let count = 0
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) count += this.countAssetFiles(path.join(dir, entry.name))
        else count++
      }
      return count
    } catch {
      return 0
    }
  }

  /** 解析后若资源目录为空（文档内无图片），顺手删掉，避免留下一堆空目录 */
  private dropEmptyAssetDir(dir: string): void {
    try {
      if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    } catch {
      /* 清理失败不影响主流程 */
    }
  }

  /**
   * 生成 embedding 向量。
   *
   * 失败即抛错，**错误信息必须带出真实原因**（接口原话 / HTTP 状态 / 网络异常 / 配置缺失）——
   * 此前是 `catch { return null }`，把 key 失效、余额不足、模型名错、网络不通等全部
   * 压成调用方一句笼统的「向量生成失败」，用户完全无法定位（真实用户遭遇）。
   *
   * 调用方按各自场景转成用户可读信息；不要再退回「返回 null 表示失败」的旧契约。
   */
  async getEmbeddingVectors(texts: string[], config: EmbeddingConfig, signal?: AbortSignal): Promise<number[][]> {
    if (!config.providerConfigId) throw new Error('未配置 Embedding 提供商')

    const db = getCoreDatabaseManager()
    const provider = await db.providerConfigs?.getById(config.providerConfigId)
    if (!provider) throw new Error('Embedding 提供商配置不存在（可能已被删除，请在知识库设置中重新选择）')

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

    let res: Response
    try {
      res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model, input: texts }),
        ...(signal ? { signal } : {})
      })
    } catch (e: any) {
      // 网络层失败：DNS / 连接 / TLS / 超时 / 主动取消——原因必须保留
      if (e?.name === 'AbortError') throw new Error('Embedding 请求已取消')
      throw new Error(`Embedding 请求失败：${e?.message || '网络不可达'}（${url}）`)
    }

    if (!res.ok) {
      // 错误体可能不是 JSON（网关 502/HTML 错误页），此时退回 HTTP 状态，绝不丢原因
      let detail = ''
      try {
        const body: any = await res.json()
        detail = body?.error?.message || body?.message || body?.error || ''
        if (detail && typeof detail !== 'string') detail = JSON.stringify(detail)
      } catch {
        /* 非 JSON 错误体：用状态行兜底 */
      }
      throw new Error(
        `Embedding 接口返回 ${res.status} ${res.statusText}${detail ? `：${detail}` : ''}`,
      )
    }

    const data: any = await res.json().catch(() => null)
    if (!data?.data?.length) {
      throw new Error('Embedding 接口返回数据为空（请检查模型名是否支持 embeddings）')
    }
    return data.data
      .sort((a: any, b: any) => a.index - b.index)
      .map((d: any) => d.embedding)
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

  /**
   * 按批建倒排索引：正文不一次性持有，逐批取回分词后即时写入。
   *
   * 供「继续处理」等**只持有切片元信息**的路径使用——buildIndex 需要正文分词，
   * 但整篇文档的正文（实测 7 MB+）不能一次读进内存（SQLITE_CANTOPEN）。
   *
   * @param chunkIds 目标文档全部切片 id（顺序即 chunkIndex ASC）
   */
  private async buildIndexBatched(chunkIds: string[], kbId: string, batchSize = 500): Promise<void> {
    const db = getCoreDatabaseManager()
    if (!db.kbInvertedIndex || !db.kbChunks) return

    for (let i = 0; i < chunkIds.length; i += batchSize) {
      const idBatch = chunkIds.slice(i, i + batchSize)
      const withContent = await db.kbChunks.findByIds(idBatch, { includeContent: true })
      await this.buildIndex(withContent, kbId)
    }
  }

  // ==================== 检索 ====================

  async search(req: SearchRequest): Promise<{ success: boolean; data?: SearchResult[]; error?: string }> {
    // 知识大脑（详细设计 §5.1）：include 含 atom/note → 统一池检索；
    // 缺省/纯 chunk → 走下方存量路径（逐字节旧行为，D4 门线）
    const include = req.include?.length ? req.include : (['chunk'] as Array<'chunk' | 'atom' | 'note'>)
    if (include.some((x) => x !== 'chunk')) {
      const brain = getBrainQueryService(this)
      if (brain) {
        return brain.search({
          knowledgeBaseId: req.knowledgeBaseId,
          query: req.query,
          topK: req.topK,
          include,
          lensNoteId: req.lensNoteId,
          embeddingConfig: await this.resolveKbEmbeddingConfig(req.knowledgeBaseId),
          signal: req.signal,
          documentIds: req.documentIds,
          threshold: req.threshold,
          intent: req.intent ?? detectSynthesizeIntent(req.query),
          cragEnabled: await this.resolveKbCragEnabled(req.knowledgeBaseId),
        })
      }
      // 旧库未装配大脑仓储 → fail-soft 降级存量路径（等价 include=['chunk']）
    }
    try {
      const db = getCoreDatabaseManager()
      if (!db.kbChunks || !db.kbDocuments || !db.kbVectors || !db.knowledgeBases) {
        return { success: false, error: '数据库未初始化' }
      }

      const kb = await db.knowledgeBases.findById(req.knowledgeBaseId)
      if (!kb) return { success: false, error: '知识库不存在' }

      const config: EmbeddingConfig = kb.embeddingConfig ? JSON.parse(kb.embeddingConfig) : {}
      // D3 混合检索权重：1（缺省）= 纯向量（旧行为）；0 = 纯关键词；中间值 = 加权融合
      // M5+：查询自适应路由——未显式指定 vectorWeight/fusion 时，按查询意图选策略：
      // 关键词型（法条编号/版本号/API 符号/专有名词）→ RRF 混合（评估：recall@1 70%→80%），
      // 语义型问句保持纯向量（评估：RRF 在语义型 @1 不损失，误判代价≈0）
      let effectiveFusion = req.fusion
      let effectiveVectorWeight = req.vectorWeight
      if (effectiveFusion == null && effectiveVectorWeight == null && req.autoRoute !== false) {
        const routing = detectKeywordIntent(req.query)
        if (routing.keywordish) {
          effectiveFusion = routing.suggested.fusion
          effectiveVectorWeight = routing.suggested.vectorWeight
          console.log(
            `[KB] 查询路由: 关键词型(${routing.reasons.join(',')}) → ${effectiveFusion}/w=${effectiveVectorWeight}`,
          )
        }
      }
      const vectorWeight = effectiveVectorWeight != null ? Math.min(1, Math.max(0, effectiveVectorWeight)) : 1
      // 检索默认值走「参数设置 → 知识库 → 检索」（调用方显式指定优先）
      const topK = req.topK || knowledgeParams().retrieval.defaultTopK
      const threshold = req.threshold != null && req.threshold > 0 ? req.threshold : null

      // 向量召回（weight=0 时跳过嵌入调用省一次 API）。
      // H4：QA 命名空间（qa: 前缀）不参与文档检索——多召回以补偿被剔除的名额。
      const vecScores = new Map<string, number>()
      if (vectorWeight > 0) {
        // 失败即抛（含接口原话），由外层 catch 转成检索错误信息——不再吞成「生成查询向量失败」
        const vectors = await this.getEmbeddingVectors([req.query], config, req.signal)
        // 混合时 3 倍召回（融合需要候选并集）+ QA 前缀剔除补偿
        const fetchK = (vectorWeight < 1 ? topK * 3 : topK) + knowledgeParams().retrieval.qaVectorFetchPadding
        const raw = await db.kbVectors.searchSimilar(req.knowledgeBaseId, vectors[0], fetchK)
        for (const r of raw) {
          // 存量语义泛化（T09 防污染的向量半边）：qa: 之外，atom:/note: 也不属于
          // chunk 检索候选（否则消化后 topK 名额被 brain 行占据再丢弃，结果变少）
          if (
            r.chunkId.startsWith(QA_CHUNK_ID_PREFIX) ||
            r.chunkId.startsWith('atom:') ||
            r.chunkId.startsWith('note:') ||
            r.chunkId.startsWith('ent:')
          ) {
            continue
          }
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
      const fused: Array<{ chunkId: string; score: number; raw: number }> = []

      if (effectiveFusion === 'rrf') {
        // M4 RRF：名次倒数融合（k=60）——只用排名、不做分数校准，跨库/跨路更稳健
        const RRF_K = 60
        const rrf = new Map<string, number>()
        const byRankDesc = (m: Map<string, number>): Array<[string, number]> =>
          [...m.entries()].sort((a, b) => b[1] - a[1])
        byRankDesc(vecScores).forEach(([id], i) =>
          rrf.set(id, (rrf.get(id) ?? 0) + 1 / (RRF_K + i + 1)),
        )
        byRankDesc(bm25).forEach(([id], i) =>
          rrf.set(id, (rrf.get(id) ?? 0) + 1 / (RRF_K + i + 1)),
        )
        for (const [chunkId, score] of rrf) {
          fused.push({ chunkId, score, raw: vecScores.get(chunkId) ?? bm25.get(chunkId) ?? 0 })
        }
      } else {
        const maxVec = Math.max(0, ...vecScores.values())
        const maxBm = Math.max(0, ...bm25.values())
        const candidates = new Set([...vecScores.keys(), ...bm25.keys()])
        for (const chunkId of candidates) {
          const v = maxVec > 0 ? (vecScores.get(chunkId) ?? 0) / maxVec : 0
          const b = maxBm > 0 ? (bm25.get(chunkId) ?? 0) / maxBm : 0
          // 融合分用于排序；回显 score 用原始最高分（向量优先，纯关键词路径用 BM25 分）
          const raw = vecScores.get(chunkId) ?? bm25.get(chunkId) ?? 0
          fused.push({ chunkId, score: vectorWeight * v + (1 - vectorWeight) * b, raw })
        }
      }
      fused.sort((a, b) => b.score - a.score)

      const searchResults: SearchResult[] = []
      // M3：章节上下文缓存（按 documentId 懒加载，同文档多命中只查一次章节表）
      const chapterCache = new Map<string, ChapterLookup>()
      // M4：限定文档检索（缺省整库）；按序迭代以便过滤后仍能补足 topK
      const docFilter = req.documentIds && req.documentIds.length > 0 ? new Set(req.documentIds) : null
      for (const r of fused) {
        if (searchResults.length >= topK) break
        const chunk = await db.kbChunks.findById(r.chunkId)
        if (!chunk) continue
        if (docFilter && !docFilter.has(chunk.documentId)) continue
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
                chapterPath: chapterPathOf(chapter, chapterCache.get(chapter.documentId)!.byId),
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
  /** 读 KB 的 CRAG 开关（brain 查询纠错入参） */
  private async resolveKbCragEnabled(kbId: string): Promise<boolean> {
    const db = getCoreDatabaseManager()
    const kb = await db.knowledgeBases?.findById(kbId)
    if (!kb?.brainConfig) return false
    try {
      const { parseBrainConfig } = await import('./kb-brain/brain-config')
      return parseBrainConfig(kb.brainConfig)?.crag.enabled ?? false
    } catch {
      return false
    }
  }

  /** 读 KB 的 embedding 配置（brain 查询的嵌入入参） */
  private async resolveKbEmbeddingConfig(kbId: string): Promise<string | null> {
    const db = getCoreDatabaseManager()
    const kb = await db.knowledgeBases?.findById(kbId)
    return kb?.embeddingConfig ?? null
  }

  private async bm25Scores(knowledgeBaseId: string, query: string): Promise<Map<string, number>> {
    const db = getCoreDatabaseManager()
    if (!db.kbInvertedIndex) return new Map()
    const terms = [...new Set(tokenizeForIndex(query))]
    if (terms.length === 0) return new Map()
    // 知识大脑：atom:/note: 倒排与切片同表——统计与候选都排除 brain 命名空间，
    // 保证纯 chunk 检索的 BM25 分数不受消化进度影响（存量行为保持）
    const EXCLUDE_NS = ['atom:', 'note:', 'ent:']

    const [postings, dfMap, totalChunks, avgLen] = await Promise.all([
      db.kbInvertedIndex.findByTerms(knowledgeBaseId, terms),
      db.kbInvertedIndex.getDocumentFrequencies(knowledgeBaseId, { excludeChunkIdPrefixes: EXCLUDE_NS }),
      db.kbInvertedIndex.getChunkCount(knowledgeBaseId, { excludeChunkIdPrefixes: EXCLUDE_NS }),
      db.kbInvertedIndex.getAverageChunkLength(knowledgeBaseId, { excludeChunkIdPrefixes: EXCLUDE_NS }),
    ])
    if (totalChunks === 0 || avgLen === 0) return new Map()

    // M3：长度归一需要候选 chunk 的真实文档长度（倒排索引不存 chunk 长度，
    // 从 kb_chunks 现取——候选集是命中的少量 chunk，代价可控）
    const candidateIds = new Set<string>()
    for (const items of postings.values()) {
      for (const item of items) {
        if (EXCLUDE_NS.some((p) => item.chunkId.startsWith(p))) continue
        candidateIds.add(item.chunkId)
      }
    }
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

      // 全量取切片（含正文）在大文档上会压垮 SQLite 临时存储（SQLITE_CANTOPEN）——
      // 明确设上限，超限引导调用方改用分页接口（getDocumentChunksPaginated）
      const chunks = await db.kbChunks.findByDocumentId(documentId, {
        includeContent: true,
        limit: FULL_CHUNK_FETCH_LIMIT,
      })
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
    pageSize: number = 20,
    chapterTitle?: string,
  ): Promise<{ success: boolean; data?: { chunks: KbChunk[]; total: number }; error?: string }> {
    try {
      const db = getCoreDatabaseManager()
      if (!db.kbChunks || !db.kbDocuments) {
        return { success: false, error: '数据库未初始化' }
      }

      const doc = await db.kbDocuments.findById(documentId)
      if (!doc) return { success: false, error: '文档不存在' }

      const offset = (page - 1) * pageSize
      // M5：可选按章节过滤（章节树点选 → 只看该章节切片）
      const chunks = await db.kbChunks.findByDocumentIdPaginated(documentId, offset, pageSize, chapterTitle)
      const total = await db.kbChunks.countByDocumentIdPaginated(documentId, chapterTitle)

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

  /**
   * 知识大脑：列出系统已启用的对话模型（面板模型设置下拉源）。
   * 判定用共享谓词 isListableChatModel（与 ai-call / provider-adapter 选型口径一致）——
   * 不能按 type='chat' 过滤：ModelType 枚举里没有 'chat'；text（或缺省）与
   * multimodal+chat（视觉理解主力款）都可作为对话模型。
   */
  async getChatModels(): Promise<{ success: boolean; data?: EmbeddingModel[]; error?: string }> {
    try {
      const db = getCoreDatabaseManager()
      if (!db.providerConfigs) return { success: false, error: '数据库未初始化' }
      const configs = await db.providerConfigs.getEnabled()
      const models: EmbeddingModel[] = []
      for (const cfg of configs) {
        if (!cfg.models) continue
        for (const m of cfg.models) {
          if (!isListableChatModel(m)) continue
          models.push({
            id: m.id,
            name: `${cfg.name} - ${m.name || m.id}`,
            provider: 'cloud',
            dimension: 0,
            maxTokens: m.maxOutputTokens || 0,
            providerConfigId: cfg.id,
            providerTemplateId: cfg.templateId,
          })
        }
      }
      return { success: true, data: models }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
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
    const ingest = knowledgeParams().ingest
    return {
      maxFileSize: ingest.maxUploadBytes,
      maxFilesPerUpload: ingest.maxUploadFiles,
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
        // 同上传：入库相对 dataPath（正斜杠）
        filePath: toRelativeAssetPath(destPath),
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
      // 收窄成局部引用：闭包内 TS 不会保留上面的非空收窄
      const kbVectors = db.kbVectors
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

      // 快照旧变体向量（向量存储无跨库事务，用快照做补偿回滚）
      const oldChunkIds = Array.from({ length: this.qaVariantCount(old) }, (_, i) =>
        KnowledgeBaseService.qaVectorChunkId(id, i)
      )
      const oldVectors: Array<{ chunkId: string; knowledgeBaseId: string; vector: number[] }> = []
      for (const chunkId of oldChunkIds) {
        const rec = await db.kbVectors.findByChunkId(chunkId).catch(() => null)
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
        // 仓库只有单条删除接口（向量表按 chunkId 唯一），逐个删除等价且不引入新 API
        await Promise.all(
          vectors.map((_, i) =>
            kbVectors.deleteByChunkId(KnowledgeBaseService.qaVectorChunkId(id, i)).catch(() => {}),
          ),
        )
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

      // 失败即抛（含接口原话），由外层 catch 转成 QA 检索错误信息
      const vectors = await this.getEmbeddingVectors([req.query], this.parseEmbeddingConfig(kb), req.signal)

      const raw = await db.kbVectors.searchSimilar(
        req.knowledgeBaseId,
        vectors[0],
        req.topK || knowledgeParams().retrieval.qaTopK,
      )
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
      const { qaImportMaxBytes, qaImportMaxRows } = knowledgeParams().ingest
      if (fileBuffer.length > qaImportMaxBytes) {
        return { success: false, error: `文件超出上限：${(fileBuffer.length / 1024 / 1024).toFixed(1)}MB > ${qaImportMaxBytes / 1024 / 1024}MB` }
      }
      const XLSX = await import('xlsx')
      const wb = XLSX.read(fileBuffer)
      const sheet = wb.Sheets[wb.SheetNames[0]]
      if (!sheet) return { success: false, error: 'xlsx 中没有工作表' }
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet)
      if (rows.length > qaImportMaxRows) {
        return { success: false, error: `行数超出上限：${rows.length} 行 > ${qaImportMaxRows} 行，请拆分后分批导入` }
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

/* ==================== 知识大脑统一检索池装配（T10） ==================== */

/** 综合型查询轻判（§8.1 路由延伸）：命中比较/方法论类词 → brain 池 chunk 降权 */
function detectSynthesizeIntent(query: string): 'lookup' | 'synthesize' {
  return /比较|异同|不同|对比|方法论|套路|规律|总结|归纳|流派|风格|共性|分歧|怎么样|如何写|思路/.test(query)
    ? 'synthesize'
    : 'lookup'
}

let brainQuerySingleton: BrainQueryService | null = null

/** brain 模式检索服务（懒装配；旧库仓储缺失返回 null，调用方降级存量路径） */
function getBrainQueryService(kbService: KnowledgeBaseService): BrainQueryService | null {
  const db = getCoreDatabaseManager()
  if (!db.kbAtoms || !db.kbNotes || !db.kbChunks || !db.kbDocuments) return null
  // F14 防陈旧闭包：deps 内每次现取 manager（单例只缓存服务对象，不缓存 db 引用）
  if (brainQuerySingleton) return brainQuerySingleton
  const inv = (): typeof db.kbInvertedIndex => getCoreDatabaseManager().kbInvertedIndex
  const deps: BrainQueryDeps = {
    // 失败抛错（含真实原因），由 BrainQueryService 捕获后降级为纯词法召回并留痕
    embed: (texts, kb) => kbService.getEmbeddingVectors(texts, kb.embeddingConfig ? JSON.parse(kb.embeddingConfig) : {}),
    searchSimilar: (kbId, vector, topK) => {
      const vectors = getCoreDatabaseManager().kbVectors
      if (!vectors) return Promise.resolve([])
      return vectors.searchSimilar(kbId, vector, topK)
    },
    inverted: {
      findByTerms: (kbId, terms) => inv()?.findByTerms(kbId, terms) ?? Promise.resolve(new Map()),
      getDocumentFrequencies: (kbId, opts) => inv()?.getDocumentFrequencies(kbId, opts) ?? Promise.resolve(new Map()),
      getChunkCount: (kbId, opts) => inv()?.getChunkCount(kbId, opts) ?? Promise.resolve(0),
      getAverageChunkLength: (kbId, opts) => inv()?.getAverageChunkLength(kbId, opts) ?? Promise.resolve(0),
    },
    atoms: db.kbAtoms,
    notes: db.kbNotes,
    chunks: db.kbChunks,
    docs: db.kbDocuments,
    entities: db.kbBrainEntities ?? undefined,
    edges: db.kbKnowledgeEdges ?? undefined,
    cragLlm: defaultBrainLlm('kb-brain-adjudicate'),
  }
  brainQuerySingleton = new BrainQueryService(deps)
  return brainQuerySingleton
}
