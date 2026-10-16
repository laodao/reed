/**
 * 图像资产仓库
 * @module database/repositories/image-asset.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 *              created_at 是 INTEGER（epoch ms），不同于其他表。
 *              所有读写都走 BaseRepository.scoped.* 实现 user_id 多租户隔离。
 */

import type { DataSource } from 'typeorm'
import {
  ImageAsset,
  ImageAssetType,
} from '@shared/types/story-to-video.types'
import { ImageAssetEntity } from '../entities/image-asset.entity'
import { BaseRepository } from '../base-repository'

export interface CreateImageAssetRequest {
  projectId: string
  type: ImageAssetType
  provider?: string
  model?: string
  prompt: string
  negativePrompt?: string
  imagePath: string
  thumbnailPath?: string
  width: number
  height: number
  metadata?: Record<string, any>
}

export interface UpdateImageAssetRequest {
  provider?: string
  model?: string
  prompt?: string
  negativePrompt?: string
  imagePath?: string
  thumbnailPath?: string
  width?: number
  height?: number
  metadata?: Record<string, any>
}

export class ImageAssetRepository extends BaseRepository<
  ImageAssetEntity,
  ImageAsset
> {
  constructor(dataSource: DataSource) {
    super(dataSource, ImageAssetEntity)
  }

  protected toDto(e: ImageAssetEntity): ImageAsset {
    return {
      id: e.id,
      type: e.type as ImageAssetType,
      provider: e.provider || undefined,
      model: e.model || undefined,
      prompt: e.prompt,
      negativePrompt: e.negativePrompt || undefined,
      imagePath: e.imagePath,
      thumbnailPath: e.thumbnailPath || undefined,
      width: e.width,
      height: e.height,
      metadata: (e.metadata as Record<string, unknown> | null) ?? undefined,
      createdAt: e.createdAt,
    }
  }

  async getByProjectId(projectId: string): Promise<ImageAsset[]> {
    const es = await this.scoped.find({
      where: { projectId } as any,
      order: { createdAt: 'DESC' } as any,
    })
    return this.toDtoList(es)
  }

  async getById(id: string): Promise<ImageAsset | null> {
    const e = await this.scoped.findOne({ id } as any)
    return e ? this.toDto(e) : null
  }

  async getByType(
    projectId: string,
    type: ImageAssetType,
  ): Promise<ImageAsset[]> {
    const es = await this.scoped.find({
      where: { projectId, type } as any,
      order: { createdAt: 'DESC' } as any,
    })
    return this.toDtoList(es)
  }

  async create(data: CreateImageAssetRequest): Promise<ImageAsset> {
    const id = this.generateId()
    const now = Date.now()
    const saved = await this.scoped.save({
      id,
      projectId: data.projectId,
      type: data.type,
      provider: data.provider ?? null,
      model: data.model ?? null,
      prompt: data.prompt,
      negativePrompt: data.negativePrompt ?? null,
      imagePath: data.imagePath,
      thumbnailPath: data.thumbnailPath ?? null,
      width: data.width,
      height: data.height,
      metadata: (data.metadata as Record<string, unknown> | undefined) ?? null,
      createdAt: now,
    } as Partial<ImageAssetEntity>)
    return this.toDto(saved)
  }

  async update(
    id: string,
    data: UpdateImageAssetRequest,
  ): Promise<ImageAsset | null> {
    const existing = await this.scoped.findOne({ id } as any)
    if (!existing) return null

    let changed = false
    if (data.provider !== undefined) { existing.provider = data.provider ?? null; changed = true }
    if (data.model !== undefined) { existing.model = data.model ?? null; changed = true }
    if (data.prompt !== undefined) { existing.prompt = data.prompt; changed = true }
    if (data.negativePrompt !== undefined) { existing.negativePrompt = data.negativePrompt ?? null; changed = true }
    if (data.imagePath !== undefined) { existing.imagePath = data.imagePath; changed = true }
    if (data.thumbnailPath !== undefined) { existing.thumbnailPath = data.thumbnailPath ?? null; changed = true }
    if (data.width !== undefined) { existing.width = data.width; changed = true }
    if (data.height !== undefined) { existing.height = data.height; changed = true }
    if (data.metadata !== undefined) {
      existing.metadata = (data.metadata as Record<string, unknown>) ?? null
      changed = true
    }

    if (!changed) return this.toDto(existing)

    const saved = await this.scoped.save(existing)
    return this.toDto(saved)
  }

  async delete(id: string): Promise<boolean> {
    const affected = await this.scoped.delete({ id } as any)
    return affected > 0
  }

  async deleteByProjectId(projectId: string): Promise<number> {
    return this.scoped.delete({ projectId } as any)
  }

  async countByProjectId(projectId: string): Promise<number> {
    return this.scoped.count({ projectId } as any)
  }

  private generateId(): string {
    return `img_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }
}
