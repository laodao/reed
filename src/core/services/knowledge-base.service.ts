/**
 * 知识库服务
 * @module services/knowledge-base.service
 * @description 知识库核心业务服务
 */

import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import nodejieba from 'nodejieba'
import { parse } from 'node-html-parser'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { getEventEmitter } from '@core/interfaces/event.interface'
import { getPathProvider } from '@core/interfaces/path.interface'
import { getSecureStorage } from '@core/interfaces/storage.interface'
import { HybridSplitter, EmbeddingService, SplitConfig, DEFAULT_SPLIT_CONFIG, SplitChunk } from '@core/services/chunk-splitter'
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
  SplitStrategy
} from '@shared/types/knowledge-base.types'

// 常量配置
const CHUNK_SIZE = 800
const OVERLAP = 80
const BATCH_SIZE = 10

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
   */
  async addDocument(kbId: string, data: { name: string; type: 'text'; content: string }): Promise<{ success: boolean; data?: KbDocument; error?: string }> {
    try {
      const db = getCoreDatabaseManager()
      if (!db.knowledgeBases || !db.kbDocuments) return { success: false, error: '数据库未初始化' }

      const kb = await db.knowledgeBases.findById(kbId)
      if (!kb) return { success: false, error: '知识库不存在' }

      // 准备目录
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

      return { success: true, data: doc }
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

      if (fs.existsSync(doc.filePath)) fs.unlinkSync(doc.filePath)

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
        // 生成临时 ID 用于映射
        const tempId = chunk.parentChunkId || ''
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

    } catch (e: any) {
      console.error(`[KB] 处理失败: ${doc.name}`, e)
      await db.kbDocuments.markFailed(doc.id, e.message)
      this.emitStatus(doc.id, 'failed', undefined, e.message)
    }
  }

  private async parseFile(filePath: string, fileType: FileType): Promise<string> {
    const buffer = await fs.promises.readFile(filePath)

    switch (fileType) {
      case 'txt':
      case 'md':
      case 'webpage':  // 网页内容存储为 txt 格式
        // 尝试多种编码解析文本文件
        return this.decodeTextFile(buffer)

      case 'pdf': {
        const pdfParse = require('pdf-parse')
        const data = await pdfParse(buffer)
        return data.text
      }

      case 'epub': {
        const EPub = require('epub-parser')
        const epub = await EPub.parse(filePath)
        let text = ''
        for (const section of epub.sections) {
          if (section.html) {
            // 简单提取文本，去除 HTML 标签
            const html = section.html
            const plainText = html
              .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
              .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
            text += plainText + '\n\n'
          }
        }
        return text
      }

      case 'docx': {
        const mammoth = require('mammoth')
        const result = await mammoth.extractRawText({ buffer })
        return result.value
      }

      case 'xlsx':
      case 'xls': {
        const XLSX = require('xlsx')
        const wb = XLSX.read(buffer)
        return wb.SheetNames.map(name => {
          const sheet = wb.Sheets[name]
          return `## ${name}\n${XLSX.utils.sheet_to_csv(sheet)}`
        }).join('\n\n')
      }

      default:
        throw new Error(`不支持的文件类型: ${fileType}`)
    }
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

  async getEmbeddingVectors(texts: string[], config: EmbeddingConfig): Promise<number[][] | null> {
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
        body: JSON.stringify({ model, input: texts })
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

    // 中文停用词列表
    const stopWords = new Set([
      '的', '了', '和', '是', '就', '都', '而', '及', '与', '着',
      '或', '一个', '没有', '我们', '你们', '他们', '它们', '这个', '那个',
      '这些', '那些', '不是', '什么', '怎么', '如何', '为什么', '因为',
      '所以', '但是', '如果', '虽然', '可以', '可能', '应该', '需要',
      '会', '能', '要', '有', '在', '上', '下', '里', '外', '中',
      '很', '太', '更', '最', '非常', '十分', '极其', '相当'
    ])

    const items: Array<{ term: string; chunkId: string; knowledgeBaseId: string; termFrequency: number }> = []

    for (const chunk of chunks) {
      // 使用 nodejieba 进行中文分词（搜索引擎模式）
      const chineseText = chunk.content.replace(/[a-zA-Z0-9\s]+/g, ' ')
      const chineseTerms = nodejieba.cutForSearch(chineseText)

      // 提取英文单词
      const englishWords = chunk.content.toLowerCase().match(/[a-z]+/g) || []

      // 合并中英文词汇，过滤停用词和单字（中文单字除非是特定字否则过滤）
      const allTerms = [...chineseTerms, ...englishWords]
        .map(t => t.trim())
        .filter(t => {
          if (t.length < 2) return false // 过滤单字
          if (stopWords.has(t)) return false // 过滤停用词
          return true
        })

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
      const vectors = await this.getEmbeddingVectors([req.query], config)
      if (!vectors) return { success: false, error: '生成查询向量失败' }

      const results = await db.kbVectors.searchSimilar(req.knowledgeBaseId, vectors[0], req.topK || 5)

      const searchResults: SearchResult[] = []
      for (const r of results) {
        const chunk = await db.kbChunks.findById(r.chunkId)
        if (!chunk) continue
        const doc = await db.kbDocuments.findById(chunk.documentId)
        if (!doc) continue

        searchResults.push({
          chunkId: chunk.id,
          documentId: doc.id,
          documentName: doc.name,
          content: chunk.content,
          score: r.score
        })
      }

      return { success: true, data: searchResults }
    } catch (e: any) {
      console.error('[KB] 检索失败:', e)
      return { success: false, error: e.message }
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
    try {
      const db = getCoreDatabaseManager()
      if (!db.providerConfigs) return { success: false, error: '数据库未初始化' }

      const configs = await db.providerConfigs.getEnabled()
      const models: EmbeddingModel[] = []

      for (const cfg of configs) {
        if (!cfg.models) continue
        for (const m of cfg.models) {
          if (m.type === 'embedding') {
            models.push({
              id: m.id,
              name: `${cfg.name} - ${m.name}`,
              provider: 'cloud',
              dimension: m.contextWindow || 1536,
              maxTokens: m.maxOutputTokens || 8192,
              providerConfigId: cfg.id,
              providerTemplateId: cfg.templateId
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
      supportedTypes: ['docx', 'doc', 'txt', 'md', 'xlsx', 'xls']
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
    const ext = path.extname(name).toLowerCase().slice(1)
    const map: Record<string, FileType> = { docx: 'docx', doc: 'doc', txt: 'txt', md: 'md', xlsx: 'xlsx', xls: 'xls' }
    return map[ext] || null
  }
}