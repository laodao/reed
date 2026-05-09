/**
 * 分镜仓库
 * @module database/repositories/storyboard.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 *              支持 transition_* 规范化字段优先 + 旧 transition JSON 字段兼容。
 */

import type { DataSource } from 'typeorm'
import {
  Storyboard,
  StoryboardCharacter,
  StoryboardStatus,
  ShotType,
  CameraAngle,
  CameraMovement,
  TransitionConfig,
  TransitionType,
  ImageAsset,
} from '@shared/types/story-to-video.types'
import { StoryboardEntity } from '../entities/episode-production/storyboard.entity'
import { BaseRepository } from '../base-repository'

export interface CreateStoryboardRequest {
  sceneScriptId: string
  shotNumber: number
  shotType: ShotType
  cameraAngle: CameraAngle
  cameraMovement: CameraMovement
  movementDuration?: number
  frameDescription: string
  subject?: string
  composition?: string
  characters: StoryboardCharacter[]
  narrationId?: string
  dialogueIds: string[]
  actionIds: string[]
  duration: number
  transition: TransitionConfig
}

export interface UpdateStoryboardRequest {
  shotType?: ShotType
  cameraAngle?: CameraAngle
  cameraMovement?: CameraMovement
  movementDuration?: number
  frameDescription?: string
  subject?: string
  composition?: string
  characters?: StoryboardCharacter[]
  narrationId?: string
  dialogueIds?: string[]
  actionIds?: string[]
  frameImage?: ImageAsset
  videoPath?: string
  duration?: number
  keyframeCount?: number
  useKeyframes?: boolean
  includeInFinal?: boolean
  transition?: TransitionConfig
  status?: StoryboardStatus
  /**
   * 用户在 ⑤ 制作 stage 挑选的资产参考图覆盖。
   * key: `${kind}:${bindingId}`，value: imageId（asset_image.id）。
   * 传 null 表示清空所有覆盖；传 undefined 不变。
   */
  referenceImageIds?: Record<string, string> | null
  /** 分镜级地点 binding 覆盖（spec 2026-05-09） */
  locationBindingIds?: string[] | null
  /** 分镜级物品 binding 覆盖（spec 2026-05-09） */
  itemBindingIds?: string[] | null
}

export class StoryboardRepository extends BaseRepository<
  StoryboardEntity,
  Storyboard
> {
  constructor(dataSource: DataSource) {
    super(dataSource, StoryboardEntity)
  }

  private toEpochMs(v: Date | number | string | null | undefined): number {
    if (v === null || v === undefined) return 0
    if (v instanceof Date) return v.getTime()
    if (typeof v === 'number') return v
    return new Date(v).getTime()
  }

  /** 解析转场配置：优先用规范化字段，回退到旧 JSON 字段 */
  private parseTransition(e: StoryboardEntity): TransitionConfig {
    if (e.transitionType) {
      return {
        type: e.transitionType as TransitionType,
        duration: e.transitionDurationMs || 500,
        direction: (e.transitionDirection as 'left' | 'right' | 'up' | 'down') || undefined,
        easing:
          (e.transitionEasing as 'linear' | 'ease_in' | 'ease_out' | 'ease_in_out') ||
          'ease_out',
        color: e.transitionColor || undefined,
      }
    }
    if (e.transition) {
      try {
        return JSON.parse(e.transition) as TransitionConfig
      } catch {
        return { type: 'cut', duration: 500 }
      }
    }
    return { type: 'cut', duration: 500 }
  }

  protected toDto(e: StoryboardEntity): Storyboard {
    return {
      id: e.id,
      sceneScriptId: e.sceneScriptId,
      shotNumber: e.shotNumber,
      shotType: e.shotType as ShotType,
      cameraAngle: e.cameraAngle as CameraAngle,
      cameraMovement: e.cameraMovement as CameraMovement,
      movementDuration: e.movementDuration ?? undefined,
      frameDescription: e.frameDescription,
      subject: e.subject ?? undefined,
      composition: e.composition ?? undefined,
      characters: ((e.characters as StoryboardCharacter[] | null) ?? []) as StoryboardCharacter[],
      narrationId: e.narrationId ?? undefined,
      dialogueIds: (e.dialogueIds as string[] | null) ?? [],
      actionIds: (e.actionIds as string[] | null) ?? [],
      frameImage: (e.frameImage as ImageAsset | null) ?? undefined,
      videoPath: e.videoPath ?? undefined,
      duration: e.duration,
      keyframeCount: e.keyframeCount,
      useKeyframes: ((e as any).useKeyframes ?? 1) !== 0,
      includeInFinal: ((e as any).includeInFinal ?? 1) !== 0,
      transition: this.parseTransition(e),
      status: e.status as StoryboardStatus,
      referenceImageIds: this.parseReferenceImageIds(e),
      locationBindingIds: ((e as any).locationBindingIds as string[] | null) ?? [],
      itemBindingIds: ((e as any).itemBindingIds as string[] | null) ?? [],
      createdAt: this.toEpochMs(e.createdAt),
      updatedAt: this.toEpochMs(e.updatedAt),
    }
  }

  /** 解析 reference_image_ids JSON 字符串为对象；解析失败 / 空 → null */
  private parseReferenceImageIds(e: StoryboardEntity): Record<string, string> | null {
    const raw = (e as any).referenceImageIds as string | null | undefined
    if (!raw) return null
    try {
      const obj = JSON.parse(raw)
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        return obj as Record<string, string>
      }
      return null
    } catch {
      return null
    }
  }

  async getBySceneScriptId(sceneScriptId: string): Promise<Storyboard[]> {
    return this.findManyByWhere(
      { sceneScriptId } as any,
      { shotNumber: 'ASC' },
    )
  }

  async getById(id: string): Promise<Storyboard | null> {
    return this.findOneByWhere({ id } as any)
  }

  async create(data: CreateStoryboardRequest): Promise<Storyboard> {
    const id = this.generateId()
    const now = new Date()
    const entity = this.repo.create({
      id,
      sceneScriptId: data.sceneScriptId,
      shotNumber: data.shotNumber,
      shotType: data.shotType,
      cameraAngle: data.cameraAngle,
      cameraMovement: data.cameraMovement,
      movementDuration: data.movementDuration ?? null,
      frameDescription: data.frameDescription,
      subject: data.subject ?? null,
      composition: data.composition ?? null,
      characters: data.characters as unknown[],
      narrationId: data.narrationId ?? null,
      dialogueIds: data.dialogueIds,
      actionIds: data.actionIds,
      frameImage: null,
      frameImageId: null,
      videoPath: null,
      duration: data.duration,
      transition: JSON.stringify(data.transition),
      transitionType: null,
      transitionDurationMs: null,
      transitionDirection: null,
      transitionEasing: null,
      transitionColor: null,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    })
    const saved = await this.scoped.save(entity)
    return this.toDto(saved)
  }

  async createMany(
    storyboards: CreateStoryboardRequest[],
  ): Promise<Storyboard[]> {
    if (storyboards.length === 0) return []
    return this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(StoryboardEntity)
      const result: Storyboard[] = []
      const now = new Date()
      for (const data of storyboards) {
        const id = this.generateId()
        const saved = await repo.save(
          repo.create({
            id,
            sceneScriptId: data.sceneScriptId,
            shotNumber: data.shotNumber,
            shotType: data.shotType,
            cameraAngle: data.cameraAngle,
            cameraMovement: data.cameraMovement,
            movementDuration: data.movementDuration ?? null,
            frameDescription: data.frameDescription,
            subject: data.subject ?? null,
            composition: data.composition ?? null,
            characters: data.characters as unknown[],
            narrationId: data.narrationId ?? null,
            dialogueIds: data.dialogueIds,
            actionIds: data.actionIds,
            frameImage: null,
            frameImageId: null,
            videoPath: null,
            duration: data.duration,
            transition: JSON.stringify(data.transition),
            transitionType: null,
            transitionDurationMs: null,
            transitionDirection: null,
            transitionEasing: null,
            transitionColor: null,
            status: 'pending',
            createdAt: now,
            updatedAt: now,
          }),
        )
        result.push(this.toDto(saved))
      }
      return result
    })
  }

  async update(
    id: string,
    data: UpdateStoryboardRequest,
  ): Promise<Storyboard | null> {
    const existing = await this.scoped.findOne({ id } as any)
    if (!existing) return null

    let changed = false
    if (data.shotType !== undefined) { existing.shotType = data.shotType; changed = true }
    if (data.cameraAngle !== undefined) { existing.cameraAngle = data.cameraAngle; changed = true }
    if (data.cameraMovement !== undefined) { existing.cameraMovement = data.cameraMovement; changed = true }
    if (data.movementDuration !== undefined) { existing.movementDuration = data.movementDuration ?? null; changed = true }
    if (data.frameDescription !== undefined) { existing.frameDescription = data.frameDescription; changed = true }
    if (data.subject !== undefined) { existing.subject = data.subject ?? null; changed = true }
    if (data.composition !== undefined) { existing.composition = data.composition ?? null; changed = true }
    if (data.characters !== undefined) { existing.characters = data.characters as unknown[]; changed = true }
    if (data.narrationId !== undefined) { existing.narrationId = data.narrationId ?? null; changed = true }
    if (data.dialogueIds !== undefined) { existing.dialogueIds = data.dialogueIds; changed = true }
    if (data.actionIds !== undefined) { existing.actionIds = data.actionIds; changed = true }
    if (data.frameImage !== undefined) {
      existing.frameImage = data.frameImage
        ? (data.frameImage as Record<string, unknown>)
        : null
      changed = true
    }
    if (data.videoPath !== undefined) { existing.videoPath = data.videoPath ?? null; changed = true }
    if (data.duration !== undefined) { existing.duration = data.duration; changed = true }
    if (data.keyframeCount !== undefined) { existing.keyframeCount = data.keyframeCount; changed = true }
    if (data.useKeyframes !== undefined) {
      ;(existing as any).useKeyframes = data.useKeyframes ? 1 : 0
      changed = true
    }
    if (data.includeInFinal !== undefined) {
      ;(existing as any).includeInFinal = data.includeInFinal ? 1 : 0
      changed = true
    }
    if (data.transition !== undefined) {
      existing.transition = JSON.stringify(data.transition)
      changed = true
    }
    if (data.status !== undefined) { existing.status = data.status; changed = true }
    if (data.referenceImageIds !== undefined) {
      ;(existing as any).referenceImageIds =
        data.referenceImageIds === null ? null : JSON.stringify(data.referenceImageIds)
      changed = true
    }
    if (data.locationBindingIds !== undefined) {
      // simple-json 字段 entity 直接用数组；TypeORM 自行 stringify
      ;(existing as any).locationBindingIds = data.locationBindingIds ?? null
      changed = true
    }
    if (data.itemBindingIds !== undefined) {
      ;(existing as any).itemBindingIds = data.itemBindingIds ?? null
      changed = true
    }

    if (!changed) return this.toDto(existing)

    existing.updatedAt = new Date()
    const saved = await this.scoped.save(existing)
    return this.toDto(saved)
  }

  async delete(id: string): Promise<boolean> {
    const affected = await this.scoped.delete({ id } as any)
    return affected > 0
  }

  /**
   * 批量重排某场景内分镜的 shotNumber。
   * orderedIds 顺序即新的 shotNumber 顺序（1-based）。
   * 用 transaction + 两步策略避免唯一约束冲突（如果将来加）：
   *   1) 先把所有目标 storyboard 的 shotNumber 设到一个临时大数（id+10000）
   *   2) 再按新顺序 1, 2, 3, ... 写回
   */
  async reorderInScene(
    sceneScriptId: string,
    orderedIds: string[],
  ): Promise<void> {
    if (orderedIds.length === 0) return

    // 验证 ids 全部属于该 scene
    const found = await this.scoped.find({ where: { sceneScriptId } as any })
    const foundIds = new Set(found.map((sb) => sb.id))
    for (const id of orderedIds) {
      if (!foundIds.has(id)) {
        throw new Error(`分镜 ${id} 不属于场景 ${sceneScriptId}`)
      }
    }

    const TEMP_OFFSET = 10000
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(StoryboardEntity)
      // 1) 临时偏移：所有传入分镜的 shotNumber 都 +OFFSET，避免和 1..N 冲突
      for (const id of orderedIds) {
        await repo.update({ id } as any, { shotNumber: () => `shot_number + ${TEMP_OFFSET}` } as any)
      }
      // 2) 按新顺序写 1..N
      for (let i = 0; i < orderedIds.length; i++) {
        await repo.update({ id: orderedIds[i] } as any, { shotNumber: i + 1 })
      }
    })
  }

  async deleteBySceneScriptId(sceneScriptId: string): Promise<number> {
    return this.scoped.delete({ sceneScriptId } as any)
  }

  async countBySceneScriptId(sceneScriptId: string): Promise<number> {
    return this.scoped.count({ sceneScriptId } as any)
  }

  async updateStatusBySceneScriptId(
    sceneScriptId: string,
    status: StoryboardStatus,
  ): Promise<number> {
    return this.scoped.update({ sceneScriptId } as any, {
      status,
      updatedAt: new Date(),
    } as any)
  }

  private generateId(): string {
    return `sb_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }
}
