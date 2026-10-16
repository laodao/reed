/**
 * 知识大脑·书级过程工件仓库（kb_brain_artifacts 表，v4）
 * @module database/repositories/kb-brain-artifact.repository
 *
 * 语义：UNIQUE(document_id, artifact_key) 替换式 upsert——同一工件重算只更新
 * 不新增；读按文档取全集（归并链逐级取材）或按键取单件。
 * 多租户：继承 BaseRepository，user_id 自动注入。
 */
import { type DataSource, type FindOptionsWhere } from 'typeorm'
import { randomUUID } from 'crypto'
import { KbBrainArtifactEntity } from '../entities/kb-brain/kb-brain-artifact.entity'
import { BaseRepository } from '../base-repository'
import { getCurrentUserId } from '@core/context/user-context'

export interface KbBrainArtifactRecord {
  id: string
  knowledgeBaseId: string
  documentId: string
  artifactKey: string
  contentHash: string | null
  body: string | null
  updatedAt: Date | null
}

export interface KbBrainArtifactInput {
  documentId: string
  artifactKey: string
  contentHash?: string | null
  body: string
}

export class KbBrainArtifactRepository extends BaseRepository<KbBrainArtifactEntity, KbBrainArtifactRecord> {
  constructor(dataSource: DataSource) {
    super(dataSource, KbBrainArtifactEntity)
  }

  protected toDto(e: KbBrainArtifactEntity): KbBrainArtifactRecord {
    return {
      id: e.id,
      knowledgeBaseId: e.knowledgeBaseId,
      documentId: e.documentId,
      artifactKey: e.artifactKey,
      contentHash: e.contentHash ?? null,
      body: e.body ?? null,
      updatedAt: e.updatedAt ?? null,
    }
  }

  /** 替换式 upsert：同 (documentId, artifactKey) 更新 body/hash，否则新建 */
  async upsert(kbId: string, input: KbBrainArtifactInput): Promise<KbBrainArtifactRecord> {
    const existing = await this.scoped.findOne({
      documentId: input.documentId,
      artifactKey: input.artifactKey,
    } as FindOptionsWhere<KbBrainArtifactEntity>)
    if (existing) {
      existing.body = input.body
      existing.contentHash = input.contentHash ?? null
      existing.updatedAt = new Date()
      await this.scoped.save(existing)
      return this.toDto(existing)
    }
    const entity = new KbBrainArtifactEntity()
    entity.id = randomUUID()
    entity.userId = getCurrentUserId()
    entity.knowledgeBaseId = kbId
    entity.documentId = input.documentId
    entity.artifactKey = input.artifactKey
    entity.contentHash = input.contentHash ?? null
    entity.body = input.body
    const now = new Date()
    entity.createdAt = now
    entity.updatedAt = now
    await this.scoped.save(entity)
    return this.toDto(entity)
  }

  async findByDocument(documentId: string): Promise<KbBrainArtifactRecord[]> {
    const rows = await this.scoped.find({
      where: { documentId } as FindOptionsWhere<KbBrainArtifactEntity>,
      order: { artifactKey: 'ASC' } as never,
    })
    return this.toDtoList(rows)
  }

  async findByKey(documentId: string, artifactKey: string): Promise<KbBrainArtifactRecord | null> {
    const row = await this.scoped.findOne({
      documentId,
      artifactKey,
    } as FindOptionsWhere<KbBrainArtifactEntity>)
    return row ? this.toDto(row) : null
  }

  async deleteByDocument(documentId: string): Promise<void> {
    await this.scoped.delete({ documentId } as FindOptionsWhere<KbBrainArtifactEntity>)
  }
}
