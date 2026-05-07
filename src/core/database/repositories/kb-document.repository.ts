/**
 * 知识库文档数据访问层
 * @module database/repositories/kb-document.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 */

import type { DataSource } from 'typeorm'
import { randomUUID } from 'crypto'
import type {
  KbDocument,
  CreateDocumentRequest,
  DocumentStatus,
  DocumentMetadata,
  DocumentSource,
} from '@shared/types/knowledge-base.types'
import { KbDocumentEntity } from '../entities/kb-document.entity'
import { BaseRepository } from '../base-repository'

export class KbDocumentRepository extends BaseRepository<
  KbDocumentEntity,
  KbDocument
> {
  constructor(dataSource: DataSource) {
    super(dataSource, KbDocumentEntity)
  }

  protected toDto(e: KbDocumentEntity): KbDocument {
    return {
      id: e.id,
      knowledgeBaseId: e.knowledgeBaseId,
      name: e.name,
      filePath: e.filePath,
      fileType: e.fileType,
      fileSize: e.fileSize,
      status: e.status as DocumentStatus,
      progress: e.progress,
      chunkCount: e.chunkCount,
      errorMessage: e.errorMessage || undefined,
      metadata: (e.metadata as DocumentMetadata | null) ?? undefined,
      source: (e.sourceType && e.sourceId)
        ? { type: e.sourceType as DocumentSource['type'], id: e.sourceId }
        : undefined,
      createdAt: e.createdAt instanceof Date ? e.createdAt : new Date(e.createdAt),
      updatedAt: e.updatedAt instanceof Date ? e.updatedAt : new Date(e.updatedAt),
    }
  }

  async findByKnowledgeBaseId(knowledgeBaseId: string): Promise<KbDocument[]> {
    return this.findManyByWhere({ knowledgeBaseId } as any, { createdAt: 'DESC' })
  }

  async findById(id: string): Promise<KbDocument | null> {
    return this.findOneByWhere({ id } as any)
  }

  async findBySource(kbId: string, source: DocumentSource): Promise<KbDocument | null> {
    return this.findOneByWhere({
      knowledgeBaseId: kbId,
      sourceType: source.type,
      sourceId: source.id,
    } as any)
  }

  async findByStatus(status: DocumentStatus): Promise<KbDocument[]> {
    return this.findManyByWhere({ status } as any, { createdAt: 'ASC' })
  }

  async create(request: CreateDocumentRequest): Promise<KbDocument> {
    const id = randomUUID()
    const now = new Date()
    const entity = this.repo.create({
      id,
      knowledgeBaseId: request.knowledgeBaseId,
      name: request.name,
      filePath: request.filePath,
      fileType: request.fileType,
      fileSize: request.fileSize,
      status: 'pending',
      progress: 0,
      chunkCount: 0,
      errorMessage: null,
      metadata: null,
      sourceType: request.source?.type ?? null,
      sourceId: request.source?.id ?? null,
      createdAt: now,
      updatedAt: now,
    })
    const saved = await this.scoped.save(entity)
    return this.toDto(saved)
  }

  async createBatch(
    requests: CreateDocumentRequest[],
  ): Promise<KbDocument[]> {
    if (requests.length === 0) return []
    const now = new Date()
    return this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(KbDocumentEntity)
      const documents: KbDocument[] = []
      for (const request of requests) {
        const id = randomUUID()
        const saved = await repo.save(
          repo.create({
            id,
            knowledgeBaseId: request.knowledgeBaseId,
            name: request.name,
            filePath: request.filePath,
            fileType: request.fileType,
            fileSize: request.fileSize,
            status: 'pending',
            progress: 0,
            chunkCount: 0,
            errorMessage: null,
            metadata: null,
            sourceType: request.source?.type ?? null,
            sourceId: request.source?.id ?? null,
            createdAt: now,
            updatedAt: now,
          }),
        )
        documents.push(this.toDto(saved))
      }
      return documents
    })
  }

  async updateProgress(id: string, progress: number): Promise<void> {
    await this.scoped.update({ id } as any, {
      progress,
      status: 'processing',
      updatedAt: new Date(),
    })
  }

  async markCompleted(id: string, chunkCount: number): Promise<void> {
    await this.scoped.update({ id } as any, {
      status: 'completed',
      progress: 100,
      chunkCount,
      updatedAt: new Date(),
    })
  }

  async markFailed(id: string, errorMessage: string): Promise<void> {
    await this.scoped.update({ id } as any, {
      status: 'failed',
      errorMessage,
      updatedAt: new Date(),
    })
  }

  async updateMetadata(id: string, metadata: DocumentMetadata): Promise<void> {
    await this.scoped.update({ id } as any, {
      metadata: metadata as Record<string, unknown>,
      updatedAt: new Date(),
    })
  }

  async delete(id: string): Promise<boolean> {
    const affected = await this.scoped.delete({ id } as any)
    return affected > 0
  }

  async deleteByKnowledgeBaseId(knowledgeBaseId: string): Promise<void> {
    await this.scoped.delete({ knowledgeBaseId } as any)
  }

  async countByKnowledgeBaseId(knowledgeBaseId: string): Promise<number> {
    return this.scoped.count({ knowledgeBaseId } as any)
  }

  async sumSizeByKnowledgeBaseId(knowledgeBaseId: string): Promise<number> {
    const row = await this.repo
      .createQueryBuilder('d')
      .select('SUM(d.file_size)', 'total')
      .where('d.knowledge_base_id = :kbId', { kbId: knowledgeBaseId })
      .getRawOne()
    return Number(row?.total) || 0
  }
}
