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
import { StoryboardEntity } from '../entities/storyboard.entity'
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
  transition?: TransitionConfig
  status?: StoryboardStatus
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
      transition: this.parseTransition(e),
      status: e.status as StoryboardStatus,
      createdAt: this.toEpochMs(e.createdAt),
      updatedAt: this.toEpochMs(e.updatedAt),
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
    const saved = await this.repo.save(entity)
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
    const existing = await this.repo.findOne({ where: { id } as any })
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
    if (data.transition !== undefined) {
      existing.transition = JSON.stringify(data.transition)
      changed = true
    }
    if (data.status !== undefined) { existing.status = data.status; changed = true }

    if (!changed) return this.toDto(existing)

    existing.updatedAt = new Date()
    const saved = await this.repo.save(existing)
    return this.toDto(saved)
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.repo.delete({ id } as any)
    return (result.affected ?? 0) > 0
  }

  async deleteBySceneScriptId(sceneScriptId: string): Promise<number> {
    const result = await this.repo.delete({ sceneScriptId } as any)
    return result.affected ?? 0
  }

  async countBySceneScriptId(sceneScriptId: string): Promise<number> {
    return this.repo.count({ where: { sceneScriptId } as any })
  }

  async updateStatusBySceneScriptId(
    sceneScriptId: string,
    status: StoryboardStatus,
  ): Promise<number> {
    const result = await this.repo.update({ sceneScriptId } as any, {
      status,
      updatedAt: new Date(),
    })
    return result.affected ?? 0
  }

  private generateId(): string {
    return `sb_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }
}
