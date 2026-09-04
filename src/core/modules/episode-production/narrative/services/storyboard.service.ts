/**
 * 分镜 service（spec §4.5.10 / §4.8）
 * @module modules/episode-production/narrative/services/storyboard
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
