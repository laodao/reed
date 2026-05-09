/**
 * 数字人池 service（spec 2026-05-09 ep-redesign §3.2 D3 · P-8）
 *
 * 列出全局共享的内置预设角色（user_id IS NULL + is_preset=1）。
 *
 * 多租户绕过具体机制：
 *   走裸 typeorm Repository（不经 BaseRepository 的 scope 注入），
 *   因为 BaseRepository 子类的 scoped API 会强制 WHERE user_id = currentUser，
 *   而内置数字人需要"全局共享"语义（user_id=NULL）。
 *   单独 service 隔离：只读，不写；前端 list 用，无越权风险。
 */

import { DataSource, IsNull } from 'typeorm'
import type { FindOptionsWhere } from 'typeorm'
import { CharacterBindingEntity } from '@core/database/entities/episode-production/character-binding.entity'

export interface PresetFilter {
  gender?: string
  /** 可选：按 source_type 过滤；默认仅 'preset_digital' */
  sourceType?: string
}

export class PresetDigitalHumanService {
  constructor(private readonly ds: DataSource) {}

  /**
   * 列出所有内置数字人。
   *
   * 严格条件：
   *   - user_id IS NULL（全局共享）
   *   - source_type = 'preset_digital'（spec 默认）
   *
   * 不返回普通 binding（is_preset=0 / source_type ≠ 'preset_digital' 的全部排除）。
   */
  async list(filter?: PresetFilter): Promise<CharacterBindingEntity[]> {
    const repo = this.ds.getRepository(CharacterBindingEntity)
    const where: FindOptionsWhere<CharacterBindingEntity> = {
      userId: IsNull(),
      sourceType: filter?.sourceType ?? 'preset_digital',
    }
    if (filter?.gender) {
      ;(where as any).gender = filter.gender
    }
    return await repo.find({
      where,
      order: { createdAt: 'ASC' },
    })
  }
}
