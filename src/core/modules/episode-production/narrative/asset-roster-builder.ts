/**
 * 资产花名册构建器（spec §4.1）
 * @module modules/episode-production/narrative/asset-roster-builder
 *
 * 从项目级 character_bindings / location_bindings / item_bindings 表读取
 * 全部资产，调用 *AssetService.getEffectiveData() 取生效字段（双源投影），
 * 组装成 AssetRosterForScript 喂给 EpisodeScriptGenerator。
 *
 * 使用：
 *   const roster = await buildAssetRosterForProject(ds, projectId)
 *   await scriptGen.generateFullScript(content, roster, ...)
 */

import type { DataSource } from 'typeorm'
import { CharacterBindingEntity } from '@core/database/entities/episode-production/character-binding.entity'
import { LocationBindingEntity } from '@core/database/entities/episode-production/location-binding.entity'
import { ItemBindingEntity } from '@core/database/entities/episode-production/item-binding.entity'
import { CharacterAssetService } from '@core/modules/episode-production/assets/services/character-asset.service'
import { LocationAssetService } from '@core/modules/episode-production/assets/services/location-asset.service'
import { ItemAssetService } from '@core/modules/episode-production/assets/services/item-asset.service'
import { AssetImageService } from '@core/modules/episode-production/assets/services/asset-image.service'
import type {
  AssetRosterForScript,
  AssetRosterEntry,
} from '@shared/types/episode-production'

/**
 * 按项目 ID 构建资产花名册（角色 / 地点 / 物品）。
 *
 * 内部用 *AssetService.getEffectiveData 拿"投影后的生效字段"，
 * 这样不论 binding 是 linked_lw 还是 standalone，AI 都看到一致的 name / description。
 *
 * 失败一个 binding 不阻断整个 roster：解析失败的 binding 跳过 + console.warn。
 */
export async function buildAssetRosterForProject(
  ds: DataSource,
  projectId: string,
): Promise<AssetRosterForScript> {
  const imageSvc = new AssetImageService(ds)
  const charSvc = new CharacterAssetService(ds)
  const locSvc = new LocationAssetService(ds, imageSvc)
  const itemSvc = new ItemAssetService(ds)

  const charRows = await ds
    .getRepository(CharacterBindingEntity)
    .find({ where: { projectId }, order: { createdAt: 'ASC' } })
  const locRows = await ds
    .getRepository(LocationBindingEntity)
    .find({ where: { projectId }, order: { createdAt: 'ASC' } })
  const itemRows = await ds
    .getRepository(ItemBindingEntity)
    .find({ where: { projectId }, order: { createdAt: 'ASC' } })

  const characters: AssetRosterEntry[] = []
  for (const row of charRows) {
    try {
      const eff = await charSvc.getEffectiveData(row.id)
      characters.push({
        bindingId: row.id,
        name: eff.name,
        description:
          [eff.description, eff.appearance].filter(Boolean).join(' / ') || undefined,
      })
    } catch (e) {
      console.warn(
        `[asset-roster-builder] character binding ${row.id} 跳过：`,
        (e as Error).message,
      )
    }
  }

  const locations: AssetRosterEntry[] = []
  for (const row of locRows) {
    try {
      const eff = await locSvc.getEffectiveData(row.id)
      locations.push({
        bindingId: row.id,
        name: eff.name,
        description: eff.description || undefined,
      })
    } catch (e) {
      console.warn(
        `[asset-roster-builder] location binding ${row.id} 跳过：`,
        (e as Error).message,
      )
    }
  }

  const items: AssetRosterEntry[] = []
  for (const row of itemRows) {
    try {
      const eff = await itemSvc.getEffectiveData(row.id)
      items.push({
        bindingId: row.id,
        name: eff.name,
        description: eff.description || undefined,
      })
    } catch (e) {
      console.warn(
        `[asset-roster-builder] item binding ${row.id} 跳过：`,
        (e as Error).message,
      )
    }
  }

  return { characters, locations, items }
}
