/**
 * 图像数据访问层
 * @module database/repositories/image
 * @description 基于 TypeORM 实现，支持 sqlite / postgres 双方言。
 */

import { In, type DataSource } from 'typeorm'
import type { ImageRecord } from '@shared/types'
import { randomUUID } from 'crypto'
import { ImageEntity } from '../entities/image.entity'
import { BaseRepository } from '../base-repository'

interface ImagePage {
  images: ImageRecord[]
  total: number
  hasMore: boolean
}

export class ImageRepository extends BaseRepository<ImageEntity, ImageRecord> {
  constructor(dataSource: DataSource) {
    super(dataSource, ImageEntity)
  }

  protected toDto(e: ImageEntity): ImageRecord {
    return {
      id: e.id,
      dialogId: e.dialogId || undefined,
      messageId: e.messageId || undefined,
      filePath: e.filePath,
      fileName: e.fileName || undefined,
      fileSize: e.fileSize ?? undefined,
      mimeType: e.mimeType || undefined,
      width: e.width ?? undefined,
      height: e.height ?? undefined,
      favorite: e.favorite === 1,
      createdAt: e.createdAt instanceof Date ? e.createdAt : new Date(e.createdAt),
      prompt: e.prompt || undefined,
      negativePrompt: e.negativePrompt || undefined,
      style: e.style || undefined,
      quality: e.quality || undefined,
      providerId: e.providerId || undefined,
      modelId: e.modelId || undefined,
      generationParams:
        (e.generationParams as Record<string, unknown> | null) ?? undefined,
      seed: e.seed ?? undefined,
      taskId: e.taskId || undefined,
      status: (e.status as ImageRecord['status']) || 'completed',
      errorMessage: e.errorMessage || undefined,
    }
  }

  private async paginate(
    qb: ReturnType<typeof this.repo.createQueryBuilder>,
    page: number,
    pageSize: number,
  ): Promise<ImagePage> {
    const offset = (page - 1) * pageSize
    qb.orderBy('image.created_at', 'DESC').skip(offset).take(pageSize)
    const [entities, total] = await qb.getManyAndCount()
    return {
      images: this.toDtoList(entities),
      total,
      hasMore: offset + entities.length < total,
    }
  }

  async getList(
    page: number = 1,
    pageSize: number = 20,
    favoriteOnly: boolean = false,
    status?: string,
  ): Promise<ImagePage> {
    const qb = this.repo.createQueryBuilder('image')
    if (favoriteOnly) qb.andWhere('image.favorite = :fav', { fav: 1 })
    if (status) qb.andWhere('image.status = :s', { s: status })
    return this.paginate(qb, page, pageSize)
  }

  async getById(id: string): Promise<ImageRecord | null> {
    return this.findOneByWhere({ id } as any)
  }

  async getByTaskId(taskId: string): Promise<ImageRecord[]> {
    return this.findManyByWhere({ taskId } as any, { createdAt: 'DESC' })
  }

  async create(
    image: Omit<ImageRecord, 'id' | 'createdAt' | 'favorite'>,
  ): Promise<ImageRecord> {
    const id = randomUUID()
    const now = new Date()
    const status = image.status || 'completed'
    const entity = this.repo.create({
      id,
      dialogId: image.dialogId ?? null,
      messageId: image.messageId ?? null,
      filePath: image.filePath,
      fileName: image.fileName ?? null,
      fileSize: image.fileSize ?? null,
      mimeType: image.mimeType ?? null,
      width: image.width ?? null,
      height: image.height ?? null,
      favorite: 0,
      createdAt: now,
      prompt: image.prompt ?? null,
      negativePrompt: image.negativePrompt ?? null,
      style: image.style ?? null,
      quality: image.quality ?? null,
      providerId: image.providerId ?? null,
      modelId: image.modelId ?? null,
      generationParams:
        (image.generationParams as Record<string, unknown> | undefined) ?? null,
      seed: image.seed ?? null,
      taskId: image.taskId ?? null,
      status,
      errorMessage: image.errorMessage ?? null,
    })
    const saved = await this.repo.save(entity)
    return this.toDto(saved)
  }

  async update(id: string, data: Partial<ImageRecord>): Promise<void> {
    const existing = await this.repo.findOne({ where: { id } as any })
    if (!existing) return

    if (data.favorite !== undefined) existing.favorite = data.favorite ? 1 : 0
    if (data.prompt !== undefined) existing.prompt = data.prompt ?? null
    if (data.negativePrompt !== undefined) {
      existing.negativePrompt = data.negativePrompt ?? null
    }
    if (data.style !== undefined) existing.style = data.style ?? null
    if (data.quality !== undefined) existing.quality = data.quality ?? null
    if (data.providerId !== undefined) existing.providerId = data.providerId ?? null
    if (data.modelId !== undefined) existing.modelId = data.modelId ?? null
    if (data.generationParams !== undefined) {
      existing.generationParams = (data.generationParams as Record<string, unknown>) ?? null
    }
    if (data.seed !== undefined) existing.seed = data.seed ?? null
    if (data.taskId !== undefined) existing.taskId = data.taskId ?? null
    if (data.status !== undefined) existing.status = data.status
    if (data.errorMessage !== undefined) {
      existing.errorMessage = data.errorMessage ?? null
    }
    if (data.filePath !== undefined) existing.filePath = data.filePath
    if (data.fileName !== undefined) existing.fileName = data.fileName ?? null
    if (data.fileSize !== undefined) existing.fileSize = data.fileSize ?? null
    if (data.mimeType !== undefined) existing.mimeType = data.mimeType ?? null
    if (data.width !== undefined) existing.width = data.width ?? null
    if (data.height !== undefined) existing.height = data.height ?? null

    await this.repo.save(existing)
  }

  async updateStatus(
    id: string,
    status: string,
    errorMessage?: string,
  ): Promise<void> {
    const partial: Partial<ImageEntity> = { status }
    if (errorMessage !== undefined) {
      partial.errorMessage = errorMessage || null
    }
    await this.repo.update({ id } as any, partial)
  }

  async updateStatusByTaskId(
    taskId: string,
    status: string,
    errorMessage?: string,
  ): Promise<number> {
    const partial: Partial<ImageEntity> = { status }
    if (errorMessage !== undefined) {
      partial.errorMessage = errorMessage || null
    }
    const result = await this.repo.update({ taskId } as any, partial)
    return result.affected ?? 0
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete({ id } as any)
  }

  async deleteMany(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0
    const result = await this.repo.delete({ id: In(ids) } as any)
    return result.affected ?? 0
  }

  async toggleFavorite(id: string): Promise<boolean> {
    const image = await this.getById(id)
    if (!image) {
      throw new Error('Image not found')
    }
    const newFavorite = !image.favorite
    await this.update(id, { favorite: newFavorite })
    return newFavorite
  }

  async count(favoriteOnly: boolean = false, status?: string): Promise<number> {
    const qb = this.repo.createQueryBuilder('image')
    if (favoriteOnly) qb.andWhere('image.favorite = :fav', { fav: 1 })
    if (status) qb.andWhere('image.status = :s', { s: status })
    return qb.getCount()
  }

  async getByProvider(
    providerId: string,
    page: number = 1,
    pageSize: number = 20,
  ): Promise<ImagePage> {
    const qb = this.repo
      .createQueryBuilder('image')
      .where('image.provider_id = :pid', { pid: providerId })
    return this.paginate(qb, page, pageSize)
  }

  async getByModel(
    modelId: string,
    page: number = 1,
    pageSize: number = 20,
  ): Promise<ImagePage> {
    const qb = this.repo
      .createQueryBuilder('image')
      .where('image.model_id = :mid', { mid: modelId })
    return this.paginate(qb, page, pageSize)
  }
}
