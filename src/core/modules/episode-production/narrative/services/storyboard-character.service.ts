/**
 * 分镜内角色管理 service（spec §4.5.3 · P5-T32）
 * @module modules/episode-production/narrative/services/storyboard-character.service
 *
 * 实现 spec §4.5.3 第 966-984 行"分镜内角色独立配置"的写入路径。
 * 配合 P5-T31 让 KeyframeGenerationService 在生成关键帧时优先读分镜级配置。
 *
 * 设计：全量替换（saveAll）
 *   - UI 编辑 dialog 显示当前 storyboard 的全部角色配置
 *   - 用户增/删/改/调整顺序 → 保存时一次性提交全列表
 *   - service 内：deleteByStoryboardId + createMany（事务）
 *   - 简化前端 / 避免 stale id 维护
 */

import type { DataSource } from 'typeorm'
import { StoryboardCharacterRepository } from '@core/database/repositories/storyboard-character.repository'
import type { StoryboardCharacter } from '@shared/types/story-to-video.types'

type Facing =
  | 'front'
  | 'left'
  | 'right'
  | 'back'
  | 'three_quarter_left'
  | 'three_quarter_right'

/** 单条分镜角色配置入参（不含 id，全量替换语义） */
export interface StoryboardCharacterInput {
  characterId: string
  positionX?: number
  positionY?: number
  positionScale?: number
  expression?: string | null
  action?: string | null
  facing?: Facing
}

export class StoryboardCharacterService {
  private readonly repo: StoryboardCharacterRepository

  constructor(ds: DataSource) {
    this.repo = new StoryboardCharacterRepository(ds)
  }

  /**
   * 列出某分镜的全部角色配置（按 sortOrder 升序）。
   */
  async listByStoryboard(
    storyboardId: string,
  ): Promise<StoryboardCharacter[]> {
    if (!storyboardId) return []
    return this.repo.getByStoryboardId(storyboardId)
  }

  /**
   * 全量替换某分镜的角色配置。
   *
   * 操作：deleteByStoryboardId + createMany（事务保证原子性）。
   *
   * sortOrder 按入参顺序自动赋值（idx 0..N-1）。
   */
  async saveAll(
    storyboardId: string,
    inputs: StoryboardCharacterInput[],
  ): Promise<StoryboardCharacter[]> {
    if (!storyboardId) {
      throw new Error('storyboardId 不能为空')
    }
    // 先删旧（即使空入参也清空，符合"全量替换"语义）
    await this.repo.deleteByStoryboardId(storyboardId)
    if (inputs.length === 0) return []
    return this.repo.createMany(
      inputs.map((it, idx) => ({
        storyboardId,
        characterId: it.characterId,
        positionX: it.positionX,
        positionY: it.positionY,
        positionScale: it.positionScale,
        expression: it.expression ?? undefined,
        action: it.action ?? undefined,
        facing: it.facing,
        sortOrder: idx,
      })),
    )
  }

  /**
   * 清空某分镜的全部角色配置（让该分镜回退到 scene 级配置）。
   */
  async clearAll(storyboardId: string): Promise<void> {
    if (!storyboardId) return
    await this.repo.deleteByStoryboardId(storyboardId)
  }
}
