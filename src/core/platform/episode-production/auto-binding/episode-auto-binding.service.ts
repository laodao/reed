/**
 * 剧集自动绑定服务
 * @module platform/services/episode-auto-binding.service
 * @description 创建剧集时自动绑定长文章节中的角色、地点、物品
 */

import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import {
  findCharacterBindingByName,
  findLocationBindingByName,
  findItemBindingByName,
} from '@core/platform/episode-production/assets/services/binding-name-utils'

/**
 * 自动绑定结果
 */
export interface AutoBindResult {
  boundCharacters: number
  boundLocations: number
  boundItems: number
  errors: string[]
}

/**
 * 剧集自动绑定服务
 * 在创建剧集时，自动将关联长文章节中的角色、地点、物品绑定到视频项目
 */
export class EpisodeAutoBindingService {
  /**
   * 为剧集自动绑定角色、地点、物品
   * @param videoProjectId 视频项目ID
   * @param outlineId 长文章节ID（大纲ID）
   * @returns 绑定结果
   */
  static async autoBindEntities(videoProjectId: string, outlineId: string): Promise<AutoBindResult> {
    console.log(`[EpisodeAutoBindingService] 开始自动绑定: videoProjectId=${videoProjectId}, outlineId=${outlineId}`)

    const db = getCoreDatabaseManager()
    if (!db.dataSource) {
      console.error('[EpisodeAutoBindingService] 数据库实例为 null')
      return {
        boundCharacters: 0,
        boundLocations: 0,
        boundItems: 0,
        errors: ['数据库未初始化']
      }
    }

    // 检查各个仓库是否初始化
    console.log(`[EpisodeAutoBindingService] 仓库状态: lwOutlines=${!!db.lwOutlines}, lwCharacters=${!!db.lwCharacters}, characterBindings=${!!db.characterBindings}`)

    const result: AutoBindResult = {
      boundCharacters: 0,
      boundLocations: 0,
      boundItems: 0,
      errors: []
    }

    try {
      // 0. 获取大纲信息，确定长文项目 ID
      const outline = await db.lwOutlines?.getById(outlineId)
      if (!outline) {
        console.error(`[EpisodeAutoBindingService] 大纲 ${outlineId} 不存在`)
        return {
          ...result,
          errors: [`大纲 ${outlineId} 不存在`]
        }
      }

      const longWritingProjectId = outline.projectId
      console.log(`[EpisodeAutoBindingService] 大纲 "${outline.name}" 属于长文项目: ${longWritingProjectId}`)
      console.log(`[EpisodeAutoBindingService] 大纲原始数据: involvedCharacters=${JSON.stringify(outline.involvedCharacters)}, involvedLocations=${JSON.stringify(outline.involvedLocations)}`)

      // 1. 获取大纲关联的角色ID列表（优先从关联表获取，如果没有则从JSON字段获取）
      let characterIds = await db.lwOutlineCharacters?.getCharacterIdsByOutlineId(outlineId) || []

      // 如果关联表没有数据，尝试从大纲的 JSON 字段获取
      if (characterIds.length === 0 && outline.involvedCharacters && outline.involvedCharacters.length > 0) {
        characterIds = outline.involvedCharacters
        console.log(`[EpisodeAutoBindingService] 从 JSON 字段获取角色: ${characterIds.length} 个`)

        // 同时更新关联表（数据迁移）
        try {
          await db.lwOutlineCharacters?.replaceAll(outlineId, characterIds)
        } catch (e) {
          console.warn('[EpisodeAutoBindingService] 更新角色关联表失败:', e)
        }
      }
      console.log(`[EpisodeAutoBindingService] 大纲 ${outlineId} 关联角色: ${characterIds.length} 个`)

      // 2. 获取大纲关联的地点ID列表
      let locationIds = await db.lwOutlineLocations?.getLocationIdsByOutlineId(outlineId) || []

      if (locationIds.length === 0 && outline.involvedLocations && outline.involvedLocations.length > 0) {
        locationIds = outline.involvedLocations
        console.log(`[EpisodeAutoBindingService] 从 JSON 字段获取地点: ${locationIds.length} 个`)

        // 同时更新关联表（数据迁移）
        try {
          await db.lwOutlineLocations?.replaceAll(outlineId, locationIds)
        } catch (e) {
          console.warn('[EpisodeAutoBindingService] 更新地点关联表失败:', e)
        }
      }
      console.log(`[EpisodeAutoBindingService] 大纲 ${outlineId} 关联地点: ${locationIds.length} 个`)

      // 3. 获取大纲关联的物品ID列表
      let itemIds = await db.lwOutlineItems?.getItemIdsByOutlineId(outlineId) || []

      if (itemIds.length === 0 && outline.involvedItems && outline.involvedItems.length > 0) {
        itemIds = outline.involvedItems
        console.log(`[EpisodeAutoBindingService] 从 JSON 字段获取物品: ${itemIds.length} 个`)

        // 同时更新关联表（数据迁移）
        try {
          await db.lwOutlineItems?.replaceAll(outlineId, itemIds)
        } catch (e) {
          console.warn('[EpisodeAutoBindingService] 更新物品关联表失败:', e)
        }
      }
      console.log(`[EpisodeAutoBindingService] 大纲 ${outlineId} 关联物品: ${itemIds.length} 个`)

      // 4. 绑定角色
      console.log(`[EpisodeAutoBindingService] 开始绑定角色，共 ${characterIds.length} 个`)
      for (const characterId of characterIds) {
        console.log(`[EpisodeAutoBindingService] 处理角色: ${characterId}`)
        try {
          // 检查是否已存在绑定
          const existingBinding = await db.characterBindings?.getByLongWritingCharacterId(videoProjectId, characterId)
          if (existingBinding) {
            console.log(`[EpisodeAutoBindingService] 角色 ${characterId} 已绑定，跳过`)
            continue
          }

          // 获取角色信息（验证角色存在于长文项目中）
          const character = await db.lwCharacters?.getById(characterId)
          if (!character) {
            console.warn(`[EpisodeAutoBindingService] 角色 ${characterId} 不存在`)
            result.errors.push(`角色 ${characterId} 不存在`)
            continue
          }
          console.log(`[EpisodeAutoBindingService] 找到角色: ${character.name}, projectId=${character.projectId}`)

          // 验证角色属于正确的长文项目
          if (character.projectId !== longWritingProjectId) {
            console.warn(`[EpisodeAutoBindingService] 角色 ${characterId} 不属于该长文项目（角色项目: ${character.projectId}, 长文项目: ${longWritingProjectId}），跳过`)
            continue
          }

          // 去重归一兜底（2026-09-21）：同项目已有同名 standalone binding
          // （先上传识别、后关联长文的场景）→ 复用已有 binding，不再建 linked 副本
          const dupChar = await findCharacterBindingByName(db.dataSource, videoProjectId, character.name)
          if (dupChar && dupChar.sourceType === 'standalone') {
            console.warn(`[EpisodeAutoBindingService] 角色 "${character.name}" 已有 standalone binding（${dupChar.id}），复用，跳过 linked_lw 创建`)
            continue
          }

          // 创建角色绑定（绑定到视频项目）
          console.log(`[EpisodeAutoBindingService] 创建角色绑定: videoProjectId=${videoProjectId}, characterId=${characterId}`)
          const createdBinding = await db.characterBindings?.create({
            projectId: videoProjectId,
            longWritingCharacterId: characterId,
            name: character.name,
            voiceConfig: {
              voiceId: '',
              speed: 1.0,
              pitch: 1.0
            }
          })
          console.log(`[EpisodeAutoBindingService] 绑定创建结果: ${JSON.stringify(createdBinding)}`)

          result.boundCharacters++
          console.log(`[EpisodeAutoBindingService] 自动绑定角色成功: ${character.name}`)
        } catch (err: any) {
          console.error(`[EpisodeAutoBindingService] 绑定角色 ${characterId} 失败:`, err)
          result.errors.push(`绑定角色 ${characterId} 失败: ${err.message}`)
        }
      }

      // 5. 绑定地点
      console.log(`[EpisodeAutoBindingService] 开始绑定地点，共 ${locationIds.length} 个`)
      console.log(`[EpisodeAutoBindingService] locationBindings 仓库: ${!!db.locationBindings}`)
      for (const locationId of locationIds) {
        console.log(`[EpisodeAutoBindingService] 处理地点: ${locationId}`)
        try {
          // 检查是否已存在绑定
          const existingBinding = await db.locationBindings?.getByLongWritingLocationId(videoProjectId, locationId)
          if (existingBinding) {
            console.log(`[EpisodeAutoBindingService] 地点 ${locationId} 已绑定，跳过`)
            continue
          }

          // 获取地点信息
          const location = await db.lwLocations?.getById(locationId)
          if (!location) {
            console.warn(`[EpisodeAutoBindingService] 地点 ${locationId} 不存在`)
            result.errors.push(`地点 ${locationId} 不存在`)
            continue
          }
          console.log(`[EpisodeAutoBindingService] 找到地点: ${location.name}, projectId=${location.projectId}`)

          // 验证地点属于正确的长文项目
          if (location.projectId !== longWritingProjectId) {
            console.warn(`[EpisodeAutoBindingService] 地点 ${locationId} 不属于该长文项目（地点项目: ${location.projectId}, 长文项目: ${longWritingProjectId}），跳过`)
            continue
          }

          // 去重归一兜底（2026-09-21）：同项目已有同名 standalone binding → 复用
          const dupLoc = await findLocationBindingByName(db.dataSource, videoProjectId, location.name)
          if (dupLoc && dupLoc.sourceType === 'standalone') {
            console.warn(`[EpisodeAutoBindingService] 地点 "${location.name}" 已有 standalone binding（${dupLoc.id}），复用，跳过 linked_lw 创建`)
            continue
          }

          // 创建地点绑定（绑定到视频项目）
          console.log(`[EpisodeAutoBindingService] 创建地点绑定: videoProjectId=${videoProjectId}, locationId=${locationId}`)
          const createdBinding = await db.locationBindings?.create({
            projectId: videoProjectId,
            longWritingLocationId: locationId,
            locationName: location.name,
            generateImages: false
          })
          console.log(`[EpisodeAutoBindingService] 地点绑定创建结果: ${JSON.stringify(createdBinding)}`)

          result.boundLocations++
          console.log(`[EpisodeAutoBindingService] 自动绑定地点成功: ${location.name}`)
        } catch (err: any) {
          console.error(`[EpisodeAutoBindingService] 绑定地点 ${locationId} 失败:`, err)
          result.errors.push(`绑定地点 ${locationId} 失败: ${err.message}`)
        }
      }

      // 6. 绑定物品
      console.log(`[EpisodeAutoBindingService] 开始绑定物品，共 ${itemIds.length} 个`)
      console.log(`[EpisodeAutoBindingService] itemBindings 仓库: ${!!db.itemBindings}`)
      for (const itemId of itemIds) {
        console.log(`[EpisodeAutoBindingService] 处理物品: ${itemId}`)
        try {
          // 检查是否已存在绑定
          const existingBinding = await db.itemBindings?.getByLongWritingItemId(videoProjectId, itemId)
          if (existingBinding) {
            console.log(`[EpisodeAutoBindingService] 物品 ${itemId} 已绑定，跳过`)
            continue
          }

          // 获取物品信息
          const item = await db.lwItems?.getById(itemId)
          if (!item) {
            console.warn(`[EpisodeAutoBindingService] 物品 ${itemId} 不存在`)
            result.errors.push(`物品 ${itemId} 不存在`)
            continue
          }
          console.log(`[EpisodeAutoBindingService] 找到物品: ${item.name}`)

          // 去重归一兜底（2026-09-21）：同项目已有同名 standalone binding → 复用
          const dupItem = await findItemBindingByName(db.dataSource, videoProjectId, item.name)
          if (dupItem && dupItem.sourceType === 'standalone') {
            console.warn(`[EpisodeAutoBindingService] 物品 "${item.name}" 已有 standalone binding（${dupItem.id}），复用，跳过 linked_lw 创建`)
            continue
          }

          // 创建物品绑定（绑定到视频项目）
          console.log(`[EpisodeAutoBindingService] 创建物品绑定: videoProjectId=${videoProjectId}, itemId=${itemId}`)
          const createdBinding = await db.itemBindings?.create({
            projectId: videoProjectId,
            longWritingItemId: itemId,
            itemName: item.name,
            generateImages: false
          })
          console.log(`[EpisodeAutoBindingService] 物品绑定创建结果: ${JSON.stringify(createdBinding)}`)

          result.boundItems++
          console.log(`[EpisodeAutoBindingService] 自动绑定物品成功: ${item.name}`)
        } catch (err: any) {
          console.error(`[EpisodeAutoBindingService] 绑定物品 ${itemId} 失败:`, err)
          result.errors.push(`绑定物品 ${itemId} 失败: ${err.message}`)
        }
      }

      console.log('[EpisodeAutoBindingService] 自动绑定完成:', result)
    } catch (err: any) {
      result.errors.push(`自动绑定失败: ${err.message}`)
      console.error('[EpisodeAutoBindingService] 自动绑定失败:', err)
    }

    return result
  }
}