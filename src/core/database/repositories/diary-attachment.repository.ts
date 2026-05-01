/**
 * 日记附件数据访问层
 * @module database/repositories/diary-attachment.repository
 * @description 基于 TypeORM 实现，支持 sqlite / postgres 双方言。
 *              所有方法已从同步签名迁移为 Promise<T>。
 */

import type { DataSource } from 'typeorm'
import { randomUUID } from 'crypto'
import type { DiaryAttachment } from '@shared/types/diary.types'
import { DiaryAttachmentEntity } from '../entities/diary-attachment.entity'
import { BaseRepository } from '../base-repository'

export class DiaryAttachmentRepository extends BaseRepository<
  DiaryAttachmentEntity,
  DiaryAttachment
> {
  constructor(dataSource: DataSource) {
    super(dataSource, DiaryAttachmentEntity)
  }

  protected toDto(e: DiaryAttachmentEntity): DiaryAttachment {
    return {
      id: e.id,
      entryId: e.entryId,
      fileName: e.fileName,
      filePath: e.filePath,
      fileSize: e.fileSize ?? 0,
      mimeType: e.mimeType || undefined,
      createdAt: e.createdAt instanceof Date ? e.createdAt : new Date(e.createdAt),
    }
  }

  async findByEntry(entryId: string): Promise<DiaryAttachment[]> {
    return this.findManyByWhere({ entryId } as any, { createdAt: 'DESC' })
  }

  async findById(id: string): Promise<DiaryAttachment | null> {
    return this.findOneByWhere({ id } as any)
  }

  async create(
    entryId: string,
    fileName: string,
    filePath: string,
    fileSize: number,
    mimeType?: string,
  ): Promise<DiaryAttachment> {
    const id = randomUUID()
    const entity = this.repo.create({
      id,
      entryId,
      fileName,
      filePath,
      fileSize,
      mimeType: mimeType ?? null,
      createdAt: new Date(),
    })
    const saved = await this.scoped.save(entity)
    return this.toDto(saved)
  }

  async delete(id: string): Promise<boolean> {
    const affected = await this.scoped.delete({ id } as any)
    return affected > 0
  }

  async deleteByEntry(entryId: string): Promise<void> {
    await this.scoped.delete({ entryId } as any)
  }

  async count(entryId?: string): Promise<number> {
    if (entryId) return this.scoped.count({ entryId } as any)
    return this.scoped.count()
  }
}
