/**
 * 「出场资产集合 + 主图就绪」共享判定（2026-09-24 一致性修复 · 审计 X1）
 * @module platform/episode-production/services/appearing-assets
 *
 * readiness（Studio 四 tab 提示）与 stage-gate（④→⑤ 主图硬卡）曾各写一份口径
 * 且互相矛盾，此处抽成共享函数防止再次漂移。统一口径：
 *   出场集合 = 场景 characters[].characterBindingId + 场景 locationBindingId
 *            + 分镜 characters[].characterId + 分镜 locationBindingIds；
 *   主图就绪 = asset_image 存在 is_main=1 且 image_path 非空的行
 *            （is_main=1 但 image_path 为空的占位行不算就绪）。
 * 仅查询 + 计算，不修改数据。
 */

import type { SceneCharacter, StoryboardCharacter } from '@shared/types/story-to-video.types'

/** 出场资产 binding id 集合（角色 / 地点） */
export interface AppearingAssetIds {
  charIds: Set<string>
  locIds: Set<string>
}

interface AppearingSceneLike {
  characters?: unknown[] | null
  locationBindingId?: string | null
}

interface AppearingStoryboardLike {
  characters?: unknown[] | null
  locationBindingIds?: string[] | null
}

/** 从场景 + 分镜收集出场角色/地点 binding id 集合（未出场的资产不在集合内） */
export function collectAppearingAssetIds(
  scenes: readonly AppearingSceneLike[],
  storyboards: readonly AppearingStoryboardLike[],
): AppearingAssetIds {
  const charIds = new Set<string>()
  const locIds = new Set<string>()
  for (const scene of scenes) {
    for (const c of (scene.characters ?? []) as SceneCharacter[]) {
      if (c.characterBindingId) charIds.add(c.characterBindingId)
    }
    if (scene.locationBindingId) locIds.add(scene.locationBindingId)
  }
  for (const sb of storyboards) {
    for (const c of (sb.characters ?? []) as StoryboardCharacter[]) {
      if (c.characterId) charIds.add(c.characterId)
    }
    for (const id of sb.locationBindingIds ?? []) {
      if (id) locIds.add(id)
    }
  }
  return { charIds, locIds }
}

/** 主图就绪 = is_main=1 行存在且 imagePath 非空（占位行不算） */
export function mainImageReady(
  main: { imagePath?: string | null } | null | undefined,
): boolean {
  return !!main?.imagePath
}
