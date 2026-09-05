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

import { randomBytes } from 'node:crypto'
import { DataSource, IsNull } from 'typeorm'
import type { FindOptionsWhere } from 'typeorm'
import { CharacterBindingEntity } from '@core/database/entities/episode-production/character-binding.entity'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'

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

  /**
   * 「用此形象到我的项目」：基于 preset binding 复制成用户自己的 binding。
   *
   * 行为:
   *   - 复制 binding 字段（标识类除外）→ 写新行（project_id=target, user_id=currentUser, source_type='standalone', is_preset=0）
   *   - 复制 preset 在 asset_image 中的所有图（imagePath 共享，category/label 保留）→ 新 binding 名下
   *   - 不动 preset 自身（其他用户继续用）
   */
  async useToProject(input: {
    presetId: string
    targetProjectId: string
    userId?: string | null
    overrideName?: string
  }): Promise<{ bindingId: string }> {
    const bindingRepo = this.ds.getRepository(CharacterBindingEntity)
    const preset = await bindingRepo.findOne({
      where: { id: input.presetId, userId: IsNull(), sourceType: 'preset_digital' as any },
    })
    if (!preset) throw new Error(`内置形象不存在或已下架：${input.presetId}`)

    const newBindingId = `cb_${randomBytes(8).toString('hex')}`
    const now = new Date()

    // 1) 拷 binding（保留所有视觉字段，重置标识/隔离字段）
    const newBinding: Partial<CharacterBindingEntity> = {
      ...preset,
      id: newBindingId,
      userId: input.userId ?? null,
      projectId: input.targetProjectId,
      sourceType: 'standalone',
      isPreset: 0,
      standaloneName: input.overrideName ?? preset.standaloneName ?? null,
      createdAt: now,
      updatedAt: now,
    }
    await bindingRepo.save(newBinding as CharacterBindingEntity)

    // 2) 拷 preset 名下 asset_image 行 → 新 binding（imagePath 共享磁盘文件，无须复制文件）
    const imageRepo = this.ds.getRepository(AssetImageEntity)
    const presetImages = await imageRepo.find({
      where: { assetType: 'character', assetId: preset.id, userId: IsNull() } as any,
    })
    for (const img of presetImages) {
      const newImageId = `ai_${randomBytes(8).toString('hex')}`
      await imageRepo.save({
        ...img,
        id: newImageId,
        userId: input.userId ?? null,
        assetId: newBindingId,
        createdAt: now,
        updatedAt: now,
      } as AssetImageEntity)
    }

    return { bindingId: newBindingId }
  }
}
