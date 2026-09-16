/**
 * 分镜 service（spec §4.5.10 / §4.8）
 * @module platform/episode-production/narrative/services/storyboard
 *
 * 当前最小实现：把一张 panorama_snapshot 资源（asset_image.id）绑到分镜的
 * background_ref_image_id 列上，作为分镜渲染时的背景参考图。
 *
 * 读取由 P5 渲染域接入消费；本 service 仅暴露 setter / getter，不做业务校验
 * （是否存在该 asset_image / 是否 category=panorama_snapshot 留给上层校验）。
 *
 * 注：此 service 只包业务逻辑，不引入 IPC / preload / Electron-only 依赖，
 * PC + Web 双端共用；IPC handler 在 P5 接入消费方时一起加。
 */

import type { DataSource, Repository } from 'typeorm'
import { StoryboardEntity } from '@core/database/entities/episode-production/storyboard.entity'

/**
 * AI 返回的分镜 shotNumber 不保证连续（实测返回过 2/3/5）。
 * 落库前按返回数组顺序强制重排为 1..N（保持数组顺序，只改编号），
 * 避免场景内分镜编号出现缝隙 / 跳号。
 */
export function normalizeShotNumbers<T extends { shotNumber: number }>(storyboards: T[]): T[] {
  return storyboards.map((sb, i) => ({ ...sb, shotNumber: i + 1 }))
}

/**
 * H10（2026-09-16 ep-hardening）：旧分镜路径（ep:generate-storyboards / agent
 * generate_storyboards）生成完成后统计"未绑定资产"的角色。
 *
 * 判定：分镜 characters[] 中 characterId 为空的 entry（AI 输出无法反查到
 * character_binding 时 normalizeAiCharacters 会置空并保留 characterName 原名）。
 *
 * 角色名来源（去重）：
 *   1. entry 上残留的 characterName（normalize 保留的 AI 原始输出）；
 *   2. 该场 scene.characters 名单里本身就没有 characterBindingId 的角色名
 *      （能从 scene 名单推就推）。
 * count 为未绑定 entry 总数（一名角色可能在多个分镜里出现，count ≥ names.length
 * 不必然成立，两者口径不同：names 给人看，count 反映影响面）。
 */
export interface UnboundCharacterStats {
  /** 去重后的角色名清单（推不出来时可能为空） */
  names: string[]
  /** characterId 为空的分镜角色 entry 总数 */
  count: number
}

export function collectUnboundCharacters(
  storyboards: Array<{
    sceneScriptId: string
    characters?: Array<{ characterId?: string | null; characterName?: string | null }> | null
  }>,
  scenes: Array<{
    id: string
    characters?: Array<{ characterName?: string | null; characterBindingId?: string | null }> | null
  }>,
): UnboundCharacterStats {
  const sceneById = new Map(scenes.map((s) => [s.id, s]))
  const names = new Set<string>()
  let count = 0
  for (const sb of storyboards) {
    const chars = Array.isArray(sb.characters) ? sb.characters : []
    const unbound = chars.filter((c) => !c?.characterId)
    if (unbound.length === 0) continue
    count += unbound.length
    for (const c of unbound) {
      const n = typeof c?.characterName === 'string' ? c.characterName.trim() : ''
      if (n) names.add(n)
    }
    const scene = sceneById.get(sb.sceneScriptId)
    for (const sc of scene?.characters ?? []) {
      if (!sc?.characterBindingId && sc?.characterName) names.add(sc.characterName)
    }
  }
  return { names: [...names], count }
}

/**
 * 分镜业务 service。
 *
 * 当前仅实现 setBackgroundRefImage / getBackgroundRefImageId 两个方法，
 * 其它分镜增删改查仍保留在既有路径，后续按需迁入本 service。
 */
export class StoryboardService {
  constructor(private readonly ds: DataSource) {}

  private get repo(): Repository<StoryboardEntity> {
    return this.ds.getRepository(StoryboardEntity)
  }

  /**
   * 绑定 / 解绑分镜的背景 ref 图。
   *
   * @param storyboardId 分镜 ID
   * @param imageId      asset_image.id（应为 category='panorama_snapshot'）；
   *                     传 null 表示解绑
   */
  async setBackgroundRefImage(
    storyboardId: string,
    imageId: string | null,
  ): Promise<void> {
    // typeorm update 用 Record<string, unknown> 中间变量，避免 entity 严格字段类型对
    // 部分可空字段的写入推断（参考 character/location/item-asset 既有写法）。
    const patch: Record<string, unknown> = {
      backgroundRefImageId: imageId,
      updatedAt: new Date(),
    }
    await this.repo.update(storyboardId, patch)
  }

  /**
   * 读取分镜当前绑定的背景 ref 图 ID。
   *
   * @returns asset_image.id；未绑定 / 分镜不存在时返回 null
   */
  async getBackgroundRefImageId(storyboardId: string): Promise<string | null> {
    const sb = await this.repo.findOne({ where: { id: storyboardId } })
    return sb?.backgroundRefImageId ?? null
  }
}
