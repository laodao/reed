/**
 * 长文写作向量索引服务（步骤0 新增）
 * @module core/platform/services/longwriting/lw-vector-index.service
 *
 * 把长文模块的设定/章节/记忆序列化 → embedding → 入 IVectorStore（带元数据 projectId/entityType/entityId/chapterNumber）。
 * 维护 lw_vector_indices 表：chunkId ↔ 实体映射 + contentHash（增量更新）+ preview。
 *
 * 核心能力：
 * - indexEntity / indexChapter / indexMemory：入库（增量，hash 未变跳过）
 * - search：按 projectId + entityType + chapterNumberLte 语义检索
 * - upsertEntity：增量更新（hash 比对）
 * - deleteByProject / deleteByChapter：双删（向量 + 索引表）
 * - rebuildProjectIndex：全量重建
 */

import { createHash, randomUUID } from 'crypto'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { getVectorStore } from '@core/platform/services/vector/vector-store.interface'
import { KnowledgeBaseService } from '@core/platform/services/knowledge-base.service'
import { HybridSplitter } from '@core/platform/services/chunk-splitter/hybrid-splitter'
import type { EmbeddingService } from '@core/platform/services/chunk-splitter/semantic-splitter'
import { serializeEntity, type SerializeContext } from './lw-vector-serializer'
import type {
  LwVectorEntityType,
  LwVectorSearchResult,
  LwVectorSearchOptions,
  LwVectorIndexStats,
} from '@shared/types/longwriting.types'
import type { EmbeddingConfig } from '@shared/types/knowledge-base.types'

/** 章节切片配置（fixed 策略，不触发 embedding 依赖） */
const CHAPTER_SPLIT_CONFIG = { strategy: 'fixed' as const }

/** no-op EmbeddingService（HybridSplitter 用 fixed 策略时不会被调用） */
const NOOP_EMBEDDING_SERVICE: EmbeddingService = {
  async getBatchEmbeddings(_texts: string[]): Promise<number[][]> {
    throw new Error('[LwVectorIndex] no-op embedding service 不应被调用（fixed 策略不该触发）')
  },
}

export class LwVectorIndexService {
  private static instance: LwVectorIndexService | null = null

  static getInstance(): LwVectorIndexService {
    if (!LwVectorIndexService.instance) {
      LwVectorIndexService.instance = new LwVectorIndexService()
    }
    return LwVectorIndexService.instance
  }

  /** 测试用：重置单例 */
  static resetInstance(): void {
    LwVectorIndexService.instance = null
  }

  // ==================== 入库 ====================

  /**
   * 设定入库（单实体）：角色/地点/物品/情节/大纲等
   * 增量：contentHash 未变则跳过 embedding
   */
  async indexEntity(
    projectId: string,
    entityType: LwVectorEntityType,
    entityId: string,
  ): Promise<{ indexed: boolean; reason?: string }> {
    const db = getCoreDatabaseManager()
    if (!db.lwVectorIndices) throw new Error('lwVectorIndices 仓库未初始化')

    const entity = await this.loadEntity(projectId, entityType, entityId)
    if (!entity) return { indexed: false, reason: 'entity_not_found' }

    const ctx = await this.buildSerializeContext(projectId)
    const { text, preview } = serializeEntity(entityType, entity, ctx)
    if (!text.trim()) return { indexed: false, reason: 'empty_text' }

    const contentHash = sha256(text)

    // 增量：该实体已有记录且 hash 相同 → 跳过
    const existingHashes = await db.lwVectorIndices.getContentHashes(projectId, entityType, entityId)
    if (existingHashes.size > 0) {
      const hashes = Array.from(existingHashes.values())
      if (hashes.every((h) => h === contentHash)) {
        return { indexed: false, reason: 'unchanged' }
      }
      // hash 变了 → 删旧 chunk 重建
      const oldChunkIds = Array.from(existingHashes.keys())
      const store = getVectorStore()
      await store.deleteByChunkIds(oldChunkIds)
      await db.lwVectorIndices.deleteByChunkIds(oldChunkIds)
    }

    // embedding + 入库
    const config = await this.resolveEmbeddingConfig(projectId)
    const vectors = await this.getEmbeddingVectors([text], config)
    if (!vectors || vectors.length === 0) {
      return { indexed: false, reason: 'embedding_failed' }
    }

    const store = getVectorStore()
    const chunkId = randomUUID()
    await store.insert({
      id: randomUUID(),
      chunkId,
      knowledgeBaseId: '__lw__',
      vector: vectors[0],
      createdAt: new Date(),
      projectId,
      entityType,
      entityId,
      chapterNumber: null,
    })

    await db.lwVectorIndices.create({
      projectId,
      entityType,
      entityId,
      chunkId,
      contentHash,
      preview,
    })

    return { indexed: true }
  }

  /**
   * 章节切片入库：正文按 fixed 策略切片，每片带 chapterNumber 元数据
   */
  async indexChapter(
    projectId: string,
    outlineId: string,
    chapterNumber: number,
    content: string,
  ): Promise<{ indexed: boolean; chunkCount: number; reason?: string }> {
    const db = getCoreDatabaseManager()
    if (!db.lwVectorIndices) throw new Error('lwVectorIndices 仓库未初始化')
    if (!content || content.trim().length === 0) {
      return { indexed: false, chunkCount: 0, reason: 'empty_content' }
    }

    const splitter = new HybridSplitter(NOOP_EMBEDDING_SERVICE)
    const chunks = await splitter.split(content, CHAPTER_SPLIT_CONFIG as any)
    if (chunks.length === 0) {
      return { indexed: false, chunkCount: 0, reason: 'no_chunks' }
    }

    // 章节内容变了就全量重建该章节的切片（删旧建新）
    const store = getVectorStore()
    const oldRecords = await db.lwVectorIndices.getByChapter(projectId, chapterNumber)
    if (oldRecords.length > 0) {
      const oldChunkIds = oldRecords.map((r) => r.chunkId)
      await store.deleteByChunkIds(oldChunkIds)
      await db.lwVectorIndices.deleteByChapter(projectId, chapterNumber)
    }

    // 批量 embedding
    const config = await this.resolveEmbeddingConfig(projectId)
    const chunkTexts = chunks.map((c) => c.content)
    const vectors = await this.getEmbeddingVectors(chunkTexts, config)
    if (!vectors || vectors.length !== chunkTexts.length) {
      return { indexed: false, chunkCount: 0, reason: 'embedding_failed' }
    }

    // 批量入库
    const records = chunks.map((c, i) => ({
      id: randomUUID(),
      chunkId: randomUUID(),
      knowledgeBaseId: '__lw__',
      vector: vectors[i],
      createdAt: new Date(),
      projectId,
      entityType: 'chapter' as LwVectorEntityType,
      entityId: outlineId,
      chapterNumber,
    }))
    await store.insertBatch(records)

    await db.lwVectorIndices.batchCreate(
      chunks.map((c, i) => ({
        projectId,
        entityType: 'chapter' as LwVectorEntityType,
        entityId: outlineId,
        chapterNumber,
        chunkId: records[i].chunkId,
        contentHash: sha256(c.content),
        preview: c.content.slice(0, 200),
      })),
    )

    return { indexed: true, chunkCount: chunks.length }
  }

  /**
   * 记忆入库
   */
  async indexMemory(projectId: string, memoryId: string): Promise<{ indexed: boolean; reason?: string }> {
    const db = getCoreDatabaseManager()
    if (!db.lwMemories) throw new Error('lwMemories 仓库未初始化')

    const memory = await db.lwMemories.getById(memoryId)
    if (!memory) return { indexed: false, reason: 'memory_not_found' }

    const { text, preview } = serializeEntity('memory', memory as any)
    if (!text.trim()) return { indexed: false, reason: 'empty_text' }

    const contentHash = sha256(text)
    const existingHashes = await db.lwVectorIndices!.getContentHashes(projectId, 'memory', memoryId)
    if (existingHashes.size > 0) {
      const hashes = Array.from(existingHashes.values())
      if (hashes.every((h) => h === contentHash)) {
        return { indexed: false, reason: 'unchanged' }
      }
      const oldChunkIds = Array.from(existingHashes.keys())
      const store = getVectorStore()
      await store.deleteByChunkIds(oldChunkIds)
      await db.lwVectorIndices!.deleteByChunkIds(oldChunkIds)
    }

    const config = await this.resolveEmbeddingConfig(projectId)
    const vectors = await this.getEmbeddingVectors([text], config)
    if (!vectors || vectors.length === 0) {
      return { indexed: false, reason: 'embedding_failed' }
    }

    const store = getVectorStore()
    const chunkId = randomUUID()
    await store.insert({
      id: randomUUID(),
      chunkId,
      knowledgeBaseId: '__lw__',
      vector: vectors[0],
      createdAt: new Date(),
      projectId,
      entityType: 'memory',
      entityId: memoryId,
      chapterNumber: memory.chapterNumber ?? null,
    })

    await db.lwVectorIndices!.create({
      projectId,
      entityType: 'memory',
      entityId: memoryId,
      chunkId,
      contentHash,
      preview,
    })

    return { indexed: true }
  }

  // ==================== 检索 ====================

  /**
   * 语义检索：按 projectId + 可选 entityType + chapterNumberLte 过滤
   */
  async search(
    projectId: string,
    query: string,
    opts: LwVectorSearchOptions = {},
  ): Promise<LwVectorSearchResult[]> {
    if (!query.trim()) return []

    const config = await this.resolveEmbeddingConfig(projectId)
    const queryVectors = await this.getEmbeddingVectors([query], config)
    if (!queryVectors || queryVectors.length === 0) return []

    const store = getVectorStore()
    const results = await store.searchByMetadata(
      queryVectors[0],
      {
        projectId,
        entityType: opts.entityType,
        chapterNumberLte: opts.chapterNumberLte,
      },
      opts.topK ?? 10,
      opts.scoreThreshold,
    )

    // 关联 lw_vector_indices 取 preview（优先用旁存的 preview，避免回查原表）
    const db = getCoreDatabaseManager()
    const final: LwVectorSearchResult[] = []
    for (const r of results) {
      let preview = ''
      let entityType: LwVectorEntityType = (r.metadata.entityType ?? 'character') as LwVectorEntityType
      let entityId = r.metadata.entityId ?? ''

      // 从 lw_vector_indices 取 preview + 校正 entityType/entityId
      if (db.lwVectorIndices) {
        const idxRecords = await db.lwVectorIndices.getByEntity(projectId, entityType, entityId)
        const matched = idxRecords.find((x) => x.chunkId === r.chunkId)
        if (matched) {
          preview = matched.preview ?? ''
        }
      }

      final.push({
        entityType,
        entityId,
        chunkId: r.chunkId,
        score: r.score,
        preview,
      })
    }
    return final
  }

  /** 增量更新别名 */
  async upsertEntity(
    projectId: string,
    entityType: LwVectorEntityType,
    entityId: string,
  ): Promise<{ indexed: boolean; reason?: string }> {
    return this.indexEntity(projectId, entityType, entityId)
  }

  // ==================== 删除 ====================

  async deleteByProject(projectId: string): Promise<void> {
    const db = getCoreDatabaseManager()
    if (!db.lwVectorIndices) return
    const store = getVectorStore()
    await store.deleteByMetadata({ projectId })
    await db.lwVectorIndices.deleteByProject(projectId)
  }

  async deleteByChapter(projectId: string, chapterNumber: number): Promise<void> {
    const db = getCoreDatabaseManager()
    if (!db.lwVectorIndices) return
    const store = getVectorStore()
    await store.deleteByMetadata({ projectId, chapterNumber })
    await db.lwVectorIndices.deleteByChapter(projectId, chapterNumber)
  }

  async deleteByEntity(
    projectId: string,
    entityType: LwVectorEntityType,
    entityId: string,
  ): Promise<void> {
    const db = getCoreDatabaseManager()
    if (!db.lwVectorIndices) return
    const store = getVectorStore()
    await store.deleteByMetadata({ projectId, entityType, entityId })
    await db.lwVectorIndices.deleteByEntity(projectId, entityType, entityId)
  }

  // ==================== 重建 + 统计 ====================

  /**
   * 全量重建项目索引（旧项目首次启用）
   * @param onProgress 每完成一个实体回调
   */
  async rebuildProjectIndex(
    projectId: string,
    onProgress?: (done: number, total: number) => void,
  ): Promise<{ total: number; indexed: number; skipped: number }> {
    const db = getCoreDatabaseManager()

    // 先清空旧索引（全量重建）
    await this.deleteByProject(projectId)

    type Task = { entityType: LwVectorEntityType; entityId: string; chapter?: { number: number; content: string; outlineId: string } }
    const tasks: Task[] = []

    // 收集设定类
    const characters = db.lwCharacters ? await db.lwCharacters.getByProjectId(projectId) : []
    for (const c of characters) tasks.push({ entityType: 'character', entityId: c.id })
    const locations = db.lwLocations ? await db.lwLocations.getByProjectId(projectId) : []
    for (const l of locations) tasks.push({ entityType: 'location', entityId: l.id })
    const items = db.lwItems ? await db.lwItems.getByProjectId(projectId) : []
    for (const it of items) tasks.push({ entityType: 'item', entityId: it.id })
    const plots = db.lwPlots ? await db.lwPlots.getByProjectId(projectId) : []
    for (const p of plots) tasks.push({ entityType: 'plot', entityId: p.id })

    // 收集已写章节（需正文）
    const outlines = db.lwOutlines ? await db.lwOutlines.getByProjectId(projectId) : []
    const chapterMap = db.lwChapters ? await db.lwChapters.getByOutlineIds(outlines.map((o) => o.id)) : new Map<string, any>()
    let chapterNumber = 0
    for (const o of outlines) {
      if (o.nodeType === 'chapter' || o.nodeType === 'section') chapterNumber++
      const ch = chapterMap.get(o.id)
      if (ch && ch.content && ch.content.length >= 100) {
        tasks.push({
          entityType: 'chapter',
          entityId: o.id,
          chapter: { number: chapterNumber, content: ch.content, outlineId: o.id },
        })
      }
    }

    // 收集记忆
    const memories = db.lwMemories ? await db.lwMemories.getByProjectId(projectId) : []
    for (const m of memories) tasks.push({ entityType: 'memory', entityId: m.id })

    const total = tasks.length
    let done = 0
    let indexed = 0
    let skipped = 0

    for (const t of tasks) {
      try {
        if (t.entityType === 'chapter' && t.chapter) {
          const r = await this.indexChapter(projectId, t.chapter.outlineId, t.chapter.number, t.chapter.content)
          if (r.indexed) indexed++
          else skipped++
        } else {
          const r = await this.indexEntity(projectId, t.entityType, t.entityId)
          if (r.indexed) indexed++
          else skipped++
        }
      } catch (e: any) {
        console.error(`[LwVectorIndex] 重建 ${t.entityType}:${t.entityId} 失败:`, e.message)
        skipped++
      }
      done++
      onProgress?.(done, total)
    }

    return { total, indexed, skipped }
  }

  /**
   * 项目向量索引统计
   */
  async getStats(projectId: string): Promise<LwVectorIndexStats> {
    const db = getCoreDatabaseManager()
    if (!db.lwVectorIndices) {
      return { entityCount: 0, chapterCount: 0, totalChunks: 0 }
    }
    const all = await db.lwVectorIndices.getByProject(projectId)
    const entityTypes = new Set(
      all.filter((r) => r.entityType !== 'chapter').map((r) => `${r.entityType}:${r.entityId}`),
    )
    const chapterNumbers = new Set(
      all.filter((r) => r.entityType === 'chapter').map((r) => r.chapterNumber),
    )
    return {
      entityCount: entityTypes.size,
      chapterCount: chapterNumbers.size,
      totalChunks: all.length,
    }
  }

  // ==================== 内部工具 ====================

  /**
   * 解析 embedding 配置：stage='embedding' → 兜底 stage='chapters' → 抛错
   */
  private async resolveEmbeddingConfig(projectId: string): Promise<EmbeddingConfig> {
    const db = getCoreDatabaseManager()
    if (!db.lwProjectModelConfigs) {
      throw new Error('lwProjectModelConfigs 仓库未初始化')
    }

    // 1. 优先 stage='embedding'
    const cfg = await db.lwProjectModelConfigs.getByProjectAndStage(projectId, 'embedding' as any)
    if (cfg && cfg.providerConfigId && cfg.modelId) {
      return { providerConfigId: cfg.providerConfigId, modelId: cfg.modelId }
    }

    // 2. 兜底：stage='chapters'（写作模型常同 provider，embedding 用其 modelId 兜底）
    const fallback = await db.lwProjectModelConfigs.getByProjectAndStage(projectId, 'chapters' as any)
    if (fallback && fallback.providerConfigId && fallback.modelId) {
      console.warn('[LwVectorIndex] 未配置 embedding 模型，回退用 chapters 模型')
      return { providerConfigId: fallback.providerConfigId, modelId: fallback.modelId }
    }

    throw new Error(
      `[LwVectorIndex] 项目 ${projectId} 未配置 embedding 模型（请在项目设置中配置 stage='embedding' 的模型）`,
    )
  }

  /** 调 KB service 的 getEmbeddingVectors（复用 provider 路由 + 解密） */
  private async getEmbeddingVectors(
    texts: string[],
    config: EmbeddingConfig,
  ): Promise<number[][] | null> {
    const kbService = new KnowledgeBaseService()
    return kbService.getEmbeddingVectors(texts, config)
  }

  /** 加载实体（按类型分发到对应 repo） */
  private async loadEntity(
    projectId: string,
    entityType: LwVectorEntityType,
    entityId: string,
  ): Promise<any | null> {
    const db = getCoreDatabaseManager()
    switch (entityType) {
      case 'character':
        return db.lwCharacters?.getById(entityId) ?? null
      case 'location':
        return db.lwLocations?.getById(entityId) ?? null
      case 'item':
        return db.lwItems?.getById(entityId) ?? null
      case 'plot':
        return db.lwPlots?.getById(entityId) ?? null
      case 'outline':
        return db.lwOutlines?.getById(entityId) ?? null
      default:
        return null
    }
  }

  /** 构建 serializer 上下文（id→名字，解析 plot/outline 的 involved*） */
  private async buildSerializeContext(projectId: string): Promise<SerializeContext> {
    const db = getCoreDatabaseManager()
    const ctx: SerializeContext = {}
    if (db.lwCharacters) {
      const chars = await db.lwCharacters.getByProjectId(projectId)
      ctx.characterNames = Object.fromEntries(chars.map((c: any) => [c.id, c.name]))
    }
    if (db.lwLocations) {
      const locs = await db.lwLocations.getByProjectId(projectId)
      ctx.locationNames = Object.fromEntries(locs.map((l: any) => [l.id, l.name]))
    }
    if (db.lwItems) {
      const items = await db.lwItems.getByProjectId(projectId)
      ctx.itemNames = Object.fromEntries(items.map((i: any) => [i.id, i.name]))
    }
    return ctx
  }
}

/** sha256 工具 */
function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}
