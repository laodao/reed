/**
 * 文档切片数据访问层
 * @module database/repositories/kb-chunk.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 */

import { In, type DataSource } from 'typeorm'
import { randomUUID } from 'crypto'
import type {
  KbChunk,
  CreateChunkRequest,
  ChunkMetadata,
} from '@shared/types/knowledge-base.types'
import { KbChunkEntity } from '../entities/kb-chunk.entity'
import { BaseRepository } from '../base-repository'
import { getCurrentUserId } from '@core/context/user-context'

export class KbChunkRepository extends BaseRepository<KbChunkEntity, KbChunk> {
  constructor(dataSource: DataSource) {
    super(dataSource, KbChunkEntity)
  }

  protected toDto(e: KbChunkEntity): KbChunk {
    return {
      id: e.id,
      documentId: e.documentId,
      knowledgeBaseId: e.knowledgeBaseId,
      content: e.content,
      chunkIndex: e.chunkIndex,
      startOffset: e.startOffset ?? undefined,
      endOffset: e.endOffset ?? undefined,
      title: e.title ?? undefined,
      level: e.level ?? undefined,
      parentChunkId: e.parentChunkId ?? undefined,
      splitMethod: e.splitMethod ?? undefined,
      // 现有 Repo 行为：sectionPath 直接返回 string 不反序列化
      sectionPath: e.sectionPath ?? undefined,
      metadata: (e.metadata as ChunkMetadata | null) ?? undefined,
      createdAt: e.createdAt instanceof Date ? e.createdAt : new Date(e.createdAt),
    }
  }

  async findById(id: string): Promise<KbChunk | null> {
    return this.findOneByWhere({ id } as any)
  }

  async findByDocumentId(documentId: string): Promise<KbChunk[]> {
    return this.findManyByWhere({ documentId } as any, { chunkIndex: 'ASC' })
  }

  /**
   * 文档切片分页查询（可选按章节过滤，M5 章节树定位切片）。
   * 章节归属判定：结构块 title = 章节标题；段落子块靠 section_path（JSON 数组）
   * 含该章节标题（`"标题"` 或路径末尾 `"标题"]`）。
   */
  async findByDocumentIdPaginated(
    documentId: string,
    offset: number,
    limit: number,
    chapterTitle?: string,
  ): Promise<KbChunk[]> {
    if (chapterTitle && chapterTitle.trim()) {
      const qb = this.scoped
        .qb('c')
        .where('c.document_id = :documentId', { documentId })
        .andWhere(
          '(c.title = :chapterTitle OR c.section_path LIKE :likeTitle OR c.section_path LIKE :likePath)',
        )
        .setParameters({
          chapterTitle,
          likeTitle: `%"${chapterTitle}"%`,
          likePath: `%"${chapterTitle}"]%`,
        })
        .orderBy('c.chunk_index', 'ASC')
        .skip(offset)
        .take(limit)
      return this.toDtoList(await qb.getMany())
    }
    const entities = await this.scoped.find({
      where: { documentId } as any,
      order: { chunkIndex: 'ASC' } as any,
      skip: offset,
      take: limit,
    })
    return this.toDtoList(entities)
  }

  async countByDocumentIdPaginated(documentId: string, chapterTitle?: string): Promise<number> {
    if (chapterTitle && chapterTitle.trim()) {
      const qb = this.scoped
        .qb('c')
        .where('c.document_id = :documentId', { documentId })
        .andWhere(
          '(c.title = :chapterTitle OR c.section_path LIKE :likeTitle OR c.section_path LIKE :likePath)',
        )
        .setParameters({
          chapterTitle,
          likeTitle: `%"${chapterTitle}"%`,
          likePath: `%"${chapterTitle}"]%`,
        })
      return qb.getCount()
    }
    return this.scoped.count({ documentId } as any)
  }

  async findByKnowledgeBaseId(knowledgeBaseId: string): Promise<KbChunk[]> {
    return this.findManyByWhere({ knowledgeBaseId } as any, { createdAt: 'ASC' })
  }

  private buildEntityForCreate(
    request: CreateChunkRequest,
    now: Date,
  ): Partial<KbChunkEntity> {
    return {
      id: randomUUID(),
      documentId: request.documentId,
      knowledgeBaseId: request.knowledgeBaseId,
      content: request.content,
      chunkIndex: request.chunkIndex,
      startOffset: request.startOffset ?? null,
      endOffset: request.endOffset ?? null,
      title: request.title ?? null,
      level: request.level ?? null,
      parentChunkId: request.parentChunkId ?? null,
      splitMethod: request.splitMethod ?? null,
      sectionPath: request.sectionPath ? JSON.stringify(request.sectionPath) : null,
      metadata: (request.metadata as Record<string, unknown> | undefined) ?? null,
      createdAt: now,
    }
  }

  async create(request: CreateChunkRequest): Promise<KbChunk> {
    const now = new Date()
    const entity = this.repo.create(this.buildEntityForCreate(request, now))
    const saved = await this.scoped.save(entity)
    return this.toDto(saved)
  }

  async createBatch(requests: CreateChunkRequest[]): Promise<KbChunk[]> {
    if (requests.length === 0) return []
    const now = new Date()
    // 事务里要走 manager.getRepository（拿到事务范围内的 repo），
    // 不能用 this.scoped（绑定的是 dataSource 顶层 repo，会脱离事务）。
    // 但 manager.repo 不带 user_id 注入，必须手动从 ALS 拿当前 userId 填入。
    const userId = getCurrentUserId()
    return this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(KbChunkEntity)
      const result: KbChunk[] = []
      for (const request of requests) {
        const built = this.buildEntityForCreate(request, now)
        // 必须手动注入 user_id，否则后续 scoped 查询（findByDocumentId 等）
        // 因 user_id NULL 而看不到这批 chunk，UI 上"切片不可见"
        built.userId = userId
        const saved = await repo.save(repo.create(built))
        result.push(this.toDto(saved))
      }
      return result
    })
  }

  async delete(id: string): Promise<boolean> {
    const affected = await this.scoped.delete({ id } as any)
    return affected > 0
  }

  async deleteByDocumentId(documentId: string): Promise<void> {
    await this.scoped.delete({ documentId } as any)
  }

  async deleteByKnowledgeBaseId(knowledgeBaseId: string): Promise<void> {
    await this.scoped.delete({ knowledgeBaseId } as any)
  }

  async countByDocumentId(documentId: string): Promise<number> {
    return this.scoped.count({ documentId } as any)
  }

  async countByKnowledgeBaseId(knowledgeBaseId: string): Promise<number> {
    return this.scoped.count({ knowledgeBaseId } as any)
  }

  async findByIds(ids: string[]): Promise<KbChunk[]> {
    if (ids.length === 0) return []
    const entities = await this.scoped.find({
      where: { id: In(ids) } as any,
    })
    return this.toDtoList(entities)
  }

  async findByTitle(documentId: string, title: string): Promise<KbChunk | null> {
    return this.findOneByWhere({ documentId, title } as any)
  }
}
