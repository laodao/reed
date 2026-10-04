/**
 * 事务内分镜插入公共 helper（2026-10-04 一致性修复第三批 · Task 2）
 * @module platform/episode-production/narrative/storyboard-insert
 * @description 两处「串行门手工 insert storyboard」（storyboard.handler 单场景路径 +
 *              storyboard-cogen.service replaceSceneStoryboards）字段清单逐字重复的公共
 *              抽取，消除漂移风险。字段口径对齐 StoryboardRepository.create（可选字段
 *              缺省 null，frameImage/frameImageId/videoPath/transition_* 规范化列/
 *              status 的默认值与 create 完全一致），另带 cogen 路径的分镜级 binding
 *              覆盖列（locationBindingIds/itemBindingIds，缺省 null 走 scene-level 默认）。
 *
 *              SQLite 串行门约束：事务回调内禁止全局 manager/仓库方法（scoped 注入
 *              user_id 会被门拒），一律走事务 manager 的 getRepository；裸 manager
 *              不注入 user_id（复核修复 P0-3），userId 由 helper 内 getCurrentUserId()
 *              手工注入（同 scoped 语义）。
 */

import type { EntityManager } from 'typeorm'
import { StoryboardEntity } from '@core/database/entities/episode-production/storyboard.entity'
import { getCurrentUserId } from '@core/context/user-context'
import type { TransitionConfig } from '@shared/types/story-to-video.types'

/** 插入字段（可选字段缺省 null；默认值口径同 StoryboardRepository.create） */
export interface InsertStoryboardData {
  sceneScriptId: string
  shotNumber: number
  shotType: string
  cameraAngle: string
  cameraMovement: string
  movementDuration?: number | null
  frameDescription: string
  subject?: string | null
  composition?: string | null
  characters: unknown[]
  narrationId?: string | null
  dialogueIds: string[]
  actionIds: string[]
  duration: number
  /** 转场配置对象（helper 内 JSON.stringify，同 StoryboardRepository.create 口径） */
  transition: TransitionConfig
  /** 分镜级 binding 覆盖列（cogen 路径填入；缺省 null 走 scene-level 默认） */
  locationBindingIds?: string[] | null
  itemBindingIds?: string[] | null
}

/** 在既有事务内插入一个分镜并返回落库实体（含生成 id 与注入的 userId） */
export async function insertStoryboardIn(
  manager: EntityManager,
  data: InsertStoryboardData,
): Promise<StoryboardEntity> {
  const repo = manager.getRepository(StoryboardEntity)
  const now = new Date()
  // 字段口径同 StoryboardRepository.create
  return repo.save(
    repo.create({
      id: `sb_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      userId: getCurrentUserId(),
      sceneScriptId: data.sceneScriptId,
      shotNumber: data.shotNumber,
      shotType: data.shotType,
      cameraAngle: data.cameraAngle,
      cameraMovement: data.cameraMovement,
      movementDuration: data.movementDuration ?? null,
      frameDescription: data.frameDescription,
      subject: data.subject ?? null,
      composition: data.composition ?? null,
      characters: data.characters,
      locationBindingIds: data.locationBindingIds ?? null,
      itemBindingIds: data.itemBindingIds ?? null,
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
}
