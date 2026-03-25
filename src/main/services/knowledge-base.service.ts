/**
 * 知识库服务
 * @module services/knowledge-base.service
 * @description 知识库核心业务服务
 */

import { BrowserWindow, dialog } from 'electron'
import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { getDatabaseManager } from '../database'
import { DataPathService } from './data-path.service'
import { SecureStorageService } from './secure-storage.service'
import type {
  KnowledgeBase,
  CreateKnowledgeBaseRequest,
  UpdateKnowledgeBaseRequest,
  KbDocument,
  CreateDocumentRequest,
  SearchRequest,
  SearchResult,
  EmbeddingModel,
  FileInfo,
  FileType,
  EmbeddingConfig
} from '../../shared/types/knowledge-base.types'

// 常量配置
const CHUNK_SIZE = 800
const OVERLAP = 80
const BATCH_SIZE = 10

export class KnowledgeBaseService {

  // ==================== 知识库 CRUD ====================

  async getKnowledgeBases(): Promise<{ success: boolean; data?: KnowledgeBase[]; error?: string }> {
    try {
      const db = getDatabaseManager()
      if (!db.knowledgeBases) return { success: false, error: '数据库未初始化' }
      return { success: true, data: db.knowledgeBases.findAll() }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async getKnowledgeBase(id: string): Promise<{ success: boolean; data?: KnowledgeBase; error?: string }> {
    try {
      const db = getDatabaseManager()
      if (!db.knowledgeBases) return { success: false, error: '数据库未初始化' }
      const kb = db.knowledgeBases.findById(id)
      return kb ? { success: true, data: kb } : { success: false, error: '知识库不存在' }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async createKnowledgeBase(req: CreateKnowledgeBaseRequest): Promise<{ success: boolean; data?: KnowledgeBase; error?: string }> {
    try {
      const db = getDatabaseManager()
      if (!db.knowledgeBases) return { success: false, error: '数据库未初始化' }

      if (db.knowledgeBases.existsByName(req.name)) {
        return { success: false, error: '知识库名称已存在' }
      }
      if (db.knowledgeBases.count() >= 20) {
        return { success: false, error: '已达到知识库数量上限' }
      }

      return { success: true, data: db.knowledgeBases.create(req) }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async updateKnowledgeBase(id: string, req: UpdateKnowledgeBaseRequest): Promise<{ success: boolean; error?: string }> {
    try {
      const db = getDatabaseManager()
      if (!db.knowledgeBases) return { success: false, error: '数据库未初始化' }

      const kb = db.knowledgeBases.findById(id)
      if (!kb) return { success: false, error: '知识库不存在' }

      if (req.name && req.name !== kb.name && db.knowledgeBases.existsByName(req.name)) {
        return { success: false, error: '知识库名称已存在' }
      }

      db.knowledgeBases.update(id, req)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async deleteKnowledgeBase(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const db = getDatabaseManager()
      if (!db.knowledgeBases || !db.kbDocuments || !db.kbChunks || !db.kbVectors || !db.kbInvertedIndex) {
        return { success: false, error: '数据库未初始化' }
      }

      // 删除文件
      const dataPath = DataPathService.getInstance().getDataPath()
      const kbDir = path.join(dataPath, 'knowledge-base', id)
      if (fs.existsSync(kbDir)) fs.rmSync(kbDir, { recursive: true, force: true })

      // 删除数据库记录
      const docs = db.kbDocuments.findByKnowledgeBaseId(id)
      for (const doc of docs) {
        await db.kbVectors.deleteByDocumentId(doc.id)
        db.kbInvertedIndex.deleteByDocumentId(doc.id)
      }
      db.kbChunks.deleteByKnowledgeBaseId(id)
      db.kbDocuments.deleteByKnowledgeBaseId(id)
      db.knowledgeBases.delete(id)

      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  // ==================== 文档管理 ====================

  async uploadDocuments(kbId: string, files: FileInfo[]): Promise<{ success: boolean; data?: KbDocument[]; error?: string }> {
    try {
      const db = getDatabaseManager()
      if (!db.knowledgeBases || !db.kbDocuments) return { success: false, error: '数据库未初始化' }

      const kb = db.knowledgeBases.findById(kbId)
      if (!kb) return { success: false, error: '知识库不存在' }
      if (files.length > 20) return { success: false, error: '单次最多上传 20 个文件' }

      // 准备目录
      const dataPath = DataPathService.getInstance().getDataPath()
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

      const docs = db.kbDocuments.createBatch(requests)

      // 更新统计
      db.knowledgeBases.incrementDocumentCount(kbId, docs.length)
      db.knowledgeBases.incrementTotalSize(kbId, docs.reduce((s, d) => s + d.fileSize, 0))

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

  async getDocuments(kbId: string): Promise<{ success: boolean; data?: KbDocument[]; error?: string }> {
    try {
      const db = getDatabaseManager()
      if (!db.kbDocuments) return { success: false, error: '数据库未初始化' }
      return { success: true, data: db.kbDocuments.findByKnowledgeBaseId(kbId) }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async deleteDocument(docId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const db = getDatabaseManager()
      if (!db.kbDocuments || !db.kbChunks || !db.kbVectors || !db.kbInvertedIndex || !db.knowledgeBases) {
        return { success: false, error: '数据库未初始化' }
      }

      const doc = db.kbDocuments.findById(docId)
      if (!doc) return { success: false, error: '文档不存在' }

      if (fs.existsSync(doc.filePath)) fs.unlinkSync(doc.filePath)

      await db.kbVectors.deleteByDocumentId(docId)
      db.kbInvertedIndex.deleteByDocumentId(docId)
      const chunkCount = db.kbChunks.countByDocumentId(docId)
      db.kbChunks.deleteByDocumentId(docId)
      db.kbDocuments.delete(docId)

      db.knowledgeBases.incrementDocumentCount(doc.knowledgeBaseId, -1)
      db.knowledgeBases.incrementVectorCount(doc.knowledgeBaseId, -chunkCount)
      db.knowledgeBases.incrementTotalSize(doc.knowledgeBaseId, -doc.fileSize)

      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async reprocessDocument(docId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const db = getDatabaseManager()
      if (!db.kbDocuments || !db.knowledgeBases) return { success: false, error: '数据库未初始化' }

      const doc = db.kbDocuments.findById(docId)
      if (!doc) return { success: false, error: '文档不存在' }

      const kb = db.knowledgeBases.findById(doc.knowledgeBaseId)
      if (!kb) return { success: false, error: '知识库不存在' }

      db.kbDocuments.updateProgress(docId, 0)
      await db.kbVectors.deleteByDocumentId(docId)
      db.kbInvertedIndex.deleteByDocumentId(docId)
      db.kbChunks.deleteByDocumentId(docId)

      await this.processDocument(doc, kb)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  // ==================== 文档处理 ====================

  private async processDocument(doc: KbDocument, kb: KnowledgeBase): Promise<void> {
    const db = getDatabaseManager()
    if (!db.kbDocuments || !db.kbChunks || !db.kbVectors || !db.kbInvertedIndex || !db.knowledgeBases) {
      db.kbDocuments?.markFailed(doc.id, '数据库未初始化')
      return
    }

    console.log(`[KB] 开始处理: ${doc.name}`)

    try {
      // 1. 解析
      db.kbDocuments.updateProgress(doc.id, 10)
      const content = await this.parseFile(doc.filePath, doc.fileType)
      if (!content?.trim()) {
        db.kbDocuments.markFailed(doc.id, '文档内容为空')
        return
      }
      console.log(`[KB] 解析完成, 长度: ${content.length}`)

      // 2. 切分
      db.kbDocuments.updateProgress(doc.id, 20)
      const chunks = this.splitText(content)
      console.log(`[KB] 切分完成, 数量: ${chunks.length}`)

      // 3. 存储切片
      db.kbDocuments.updateProgress(doc.id, 30)
      const chunkRecords = db.kbChunks.createBatch(
        chunks.map(c => ({
          documentId: doc.id,
          knowledgeBaseId: kb.id,
          content: c.content,
          chunkIndex: c.index,
          startOffset: c.start,
          endOffset: c.end
        }))
      )

      // 4. 生成向量
      const config: EmbeddingConfig = kb.embeddingConfig ? JSON.parse(kb.embeddingConfig) : {}

      for (let i = 0; i < chunkRecords.length; i += BATCH_SIZE) {
        const batch = chunkRecords.slice(i, i + BATCH_SIZE)
        const texts = batch.map(c => c.content)

        const vectors = await this.getEmbeddingVectors(texts, config)
        if (!vectors) throw new Error('向量生成失败')

        await db.kbVectors.createBatch(
          vectors.map((v, idx) => ({
            chunkId: batch[idx].id,
            knowledgeBaseId: kb.id,
            vector: v
          }))
        )

        const progress = 30 + Math.floor((i / chunkRecords.length) * 50)
        db.kbDocuments.updateProgress(doc.id, progress)
      }

      // 5. 索引
      db.kbDocuments.updateProgress(doc.id, 90)
      this.buildIndex(chunkRecords, kb.id)

      // 完成
      db.kbDocuments.markCompleted(doc.id, chunks.length)
      db.knowledgeBases.incrementVectorCount(kb.id, chunks.length)
      console.log(`[KB] 处理完成: ${doc.name}`)

    } catch (e: any) {
      console.error(`[KB] 处理失败: ${doc.name}`, e)
      db.kbDocuments.markFailed(doc.id, e.message)
    }
  }

  private async parseFile(filePath: string, fileType: FileType): Promise<string> {
    const buffer = await fs.promises.readFile(filePath)

    switch (fileType) {
      case 'txt':
      case 'md':
        return buffer.toString('utf-8')

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

  private async getEmbeddingVectors(texts: string[], config: EmbeddingConfig): Promise<number[][] | null> {
    try {
      if (!config.providerConfigId) throw new Error('未配置 Embedding 提供商')

      const db = getDatabaseManager()
      const provider = await db.providerConfigs?.getById(config.providerConfigId)
      if (!provider) throw new Error('提供商配置不存在')

      const storage = SecureStorageService.getInstance()
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

  private buildIndex(chunks: any[], kbId: string): void {
    const db = getDatabaseManager()
    if (!db.kbInvertedIndex) return

    const items: Array<{ term: string; chunkId: string; knowledgeBaseId: string; termFrequency: number }> = []

    for (const chunk of chunks) {
      // 简单分词
      const words = chunk.content.toLowerCase().match(/[a-z]+/g) || []
      const chars = chunk.content.match(/[\u4e00-\u9fa5]/g) || []
      const terms = [...new Set([...words, ...chars])].filter(t => t.length > 1 || /[\u4e00-\u9fa5]/.test(t))

      const freq = new Map<string, number>()
      for (const t of terms) freq.set(t, (freq.get(t) || 0) + 1)

      for (const [term, count] of freq) {
        items.push({ term, chunkId: chunk.id, knowledgeBaseId: kbId, termFrequency: count })
      }
    }

    db.kbInvertedIndex.insertBatch(items)
  }

  // ==================== 检索 ====================

  async search(req: SearchRequest): Promise<{ success: boolean; data?: SearchResult[]; error?: string }> {
    try {
      const db = getDatabaseManager()
      if (!db.kbChunks || !db.kbDocuments || !db.kbVectors || !db.knowledgeBases) {
        return { success: false, error: '数据库未初始化' }
      }

      const kb = db.knowledgeBases.findById(req.knowledgeBaseId)
      if (!kb) return { success: false, error: '知识库不存在' }

      const config: EmbeddingConfig = kb.embeddingConfig ? JSON.parse(kb.embeddingConfig) : {}
      const vectors = await this.getEmbeddingVectors([req.query], config)
      if (!vectors) return { success: false, error: '生成查询向量失败' }

      const results = await db.kbVectors.searchSimilar(req.knowledgeBaseId, vectors[0], req.topK || 5)

      const searchResults: SearchResult[] = []
      for (const r of results) {
        const chunk = db.kbChunks.findById(r.chunkId)
        if (!chunk) continue
        const doc = db.kbDocuments.findById(chunk.documentId)
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

  // ==================== 其他 ====================

  async getEmbeddingModels(): Promise<{ success: boolean; data?: EmbeddingModel[]; error?: string }> {
    try {
      const db = getDatabaseManager()
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

  async selectFiles(window: BrowserWindow): Promise<{ success: boolean; data?: FileInfo[]; error?: string }> {
    const result = await dialog.showOpenDialog(window, {
      title: '选择文档',
      filters: [{ name: '文档', extensions: ['docx', 'doc', 'txt', 'md', 'xlsx', 'xls'] }],
      properties: ['multiSelections', 'openFile']
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: '未选择文件' }
    }

    return {
      success: true,
      data: result.filePaths.map(p => ({
        path: p,
        name: path.basename(p),
        size: fs.statSync(p).size
      }))
    }
  }

  getFileLimits() {
    return {
      maxFileSize: 50 * 1024 * 1024,
      maxFilesPerUpload: 20,
      supportedTypes: ['docx', 'doc', 'txt', 'md', 'xlsx', 'xls']
    }
  }

  private getFileType(name: string): FileType | null {
    const ext = path.extname(name).toLowerCase().slice(1)
    const map: Record<string, FileType> = { docx: 'docx', doc: 'doc', txt: 'txt', md: 'md', xlsx: 'xlsx', xls: 'xls' }
    return map[ext] || null
  }
}