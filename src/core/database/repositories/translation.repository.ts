/**
 * 翻译数据访问层
 * @module database/repositories/translation
 * @description 基于 TypeORM 实现，支持 sqlite / postgres 双方言。
 *              所有方法已从同步签名迁移为 Promise<T>。
 */

import type { DataSource } from 'typeorm'
import type {
  TranslationRecord,
  TranslationHistoryQuery,
} from '@shared/types/translation.types'
import { randomUUID } from 'crypto'
import { TranslationEntity } from '../entities/translation.entity'
import { BaseRepository } from '../base-repository'

export class TranslationRepository extends BaseRepository<
  TranslationEntity,
  TranslationRecord
> {
  constructor(dataSource: DataSource) {
    super(dataSource, TranslationEntity)
  }

  protected toDto(e: TranslationEntity): TranslationRecord {
    return {
      id: e.id,
      type: e.type as TranslationRecord['type'],
      sourceLanguage: e.sourceLanguage as TranslationRecord['sourceLanguage'],
      targetLanguage: e.targetLanguage as TranslationRecord['targetLanguage'],
      sourceText: e.sourceText || undefined,
      targetText: e.targetText || undefined,
      sourceFile: e.sourceFile || undefined,
      sourceFileName: e.sourceFileName || undefined,
      targetFile: e.targetFile || undefined,
      status: e.status as TranslationRecord['status'],
      favorite: e.favorite === 1,
      wordCount: e.wordCount,
      providerId: e.providerId || undefined,
      modelId: e.modelId || undefined,
      errorMessage: e.errorMessage || undefined,
      createdAt: new Date(e.createdAt),
    }
  }

  async getList(
    query: TranslationHistoryQuery,
  ): Promise<{ list: TranslationRecord[]; total: number }> {
    const { page, pageSize, type, favorite } = query
    const offset = (page - 1) * pageSize

    const qb = this.repo.createQueryBuilder('t')
    if (type) qb.andWhere('t.type = :type', { type })
    if (favorite !== undefined) {
      qb.andWhere('t.favorite = :fav', { fav: favorite ? 1 : 0 })
    }
    qb.orderBy('t.created_at', 'DESC').skip(offset).take(pageSize)

    const [entities, total] = await qb.getManyAndCount()
    return { list: this.toDtoList(entities), total }
  }

  async getById(id: string): Promise<TranslationRecord | null> {
    return this.findOneByWhere({ id } as any)
  }

  async create(
    record: Omit<TranslationRecord, 'id' | 'createdAt'>,
  ): Promise<TranslationRecord> {
    const id = randomUUID()
    const nowIso = new Date().toISOString()
    const entity = this.repo.create({
      id,
      type: record.type,
      sourceLanguage: record.sourceLanguage,
      targetLanguage: record.targetLanguage,
      sourceText: record.sourceText ?? null,
      targetText: record.targetText ?? null,
      sourceFile: record.sourceFile ?? null,
      sourceFileName: record.sourceFileName ?? null,
      targetFile: record.targetFile ?? null,
      status: record.status,
      favorite: record.favorite ? 1 : 0,
      wordCount: record.wordCount,
      providerId: record.providerId ?? null,
      modelId: record.modelId ?? null,
      errorMessage: record.errorMessage ?? null,
      createdAt: nowIso,
    })
    const saved = await this.repo.save(entity)
    return this.toDto(saved)
  }

  async update(id: string, data: Partial<TranslationRecord>): Promise<void> {
    const existing = await this.repo.findOne({ where: { id } as any })
    if (!existing) return

    if (data.targetText !== undefined) existing.targetText = data.targetText ?? null
    if (data.targetFile !== undefined) existing.targetFile = data.targetFile ?? null
    if (data.status !== undefined) existing.status = data.status
    if (data.favorite !== undefined) existing.favorite = data.favorite ? 1 : 0
    if (data.errorMessage !== undefined) {
      existing.errorMessage = data.errorMessage ?? null
    }
    await this.repo.save(existing)
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete({ id } as any)
  }

  async toggleFavorite(id: string): Promise<boolean> {
    const record = await this.getById(id)
    if (!record) {
      throw new Error('Translation record not found')
    }
    const newFavorite = !record.favorite
    await this.update(id, { favorite: newFavorite })
    return newFavorite
  }

  async count(favoriteOnly: boolean = false): Promise<number> {
    if (favoriteOnly) {
      return this.repo.count({ where: { favorite: 1 } as any })
    }
    return this.repo.count()
  }
}
