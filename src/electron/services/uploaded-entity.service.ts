/**
 * 上传模式实体服务
 * @module services/uploaded-entity.service
 * @description 处理上传剧本模式的角色/地点/物品实体创建和绑定
 */

import { DatabaseManager } from '../database'
import {
  StoryCharacter,
  StoryLocation,
  StoryItem,
  EntityImportance,
  CharacterRolePosition,
  LocationType,
  LocationImportance,
  ItemType,
  ItemLevel
} from '@shared/types/longwriting.types'
import {
  UploadedCharacter,
  UploadedLocation,
  UploadedItem
} from '@shared/types/story-to-video.types'

/**
 * 上传模式实体服务
 * 用于处理未绑定长文项目的剧集项目的实体创建和绑定
 */
export class UploadedEntityService {
  /**
   * 为上传模式的剧集创建实体并绑定
   * @param projectId 剧集项目ID
   * @param episodeId 剧集ID
   * @param characters AI识别的角色列表
   * @param locations AI识别的地点列表
   * @param items AI识别的物品列表
   * @returns 创建的实体信息
   */
  static createAndBindUploadedEntities(
    projectId: string,
    episodeId: string,
    characters: UploadedCharacter[],
    locations: UploadedLocation[],
    items: UploadedItem[]
  ): {
    characters: StoryCharacter[]
    locations: StoryLocation[]
    items: StoryItem[]
  } {
    const db = DatabaseManager.getInstance()

    console.log('[UploadedEntityService] 开始创建上传模式实体...')
    console.log('[UploadedEntityService] 角色:', characters.length, '地点:', locations.length, '物品:', items.length)

    // 创建角色实体
    const createdCharacters: StoryCharacter[] = []
    for (const char of characters) {
      // 根据 role 确定 rolePosition 和 importance
      const rolePosition: CharacterRolePosition = this.mapRoleToPosition(char.role)
      const importance: EntityImportance = rolePosition === 'protagonist' ? 'main' :
        rolePosition === 'antagonist' ? 'main' :
        rolePosition === 'supporting' ? 'secondary' : 'temporary'

      const character = db.lwCharacters.create({
        projectId,
        name: char.name,
        gender: 'other', // 上传模式默认值，用户可后续编辑
        age: 25,
        appearance: char.description || '',
        background: '',
        personality: '',
        abilities: '',
        rolePosition,
        importance,
        sourceType: 'uploaded',
        sourceEpisodeId: episodeId
      })
      createdCharacters.push(character)

      // 创建角色绑定
      if (db.characterBindings) {
        await db.characterBindings.create({
          projectId,
          longWritingCharacterId: character.id,
          voiceConfig: {
            voiceId: '',
            speed: 1.0,
            pitch: 1.0
          }
        })
      }
    }

    // 创建地点实体
    const createdLocations: StoryLocation[] = []
    for (const loc of locations) {
      const type: LocationType = this.mapLocationType(loc.type)
      const importance: LocationImportance = 'important'

      const location = await db.lwLocations.create({
        projectId,
        name: loc.name,
        type,
        importance,
        entityImportance: 'secondary',
        description: loc.description || '',
        sourceType: 'uploaded',
        sourceEpisodeId: episodeId
      })
      createdLocations.push(location)

      // 创建地点绑定
      if (db.locationBindings) {
        await db.locationBindings.create({
          projectId,
          longWritingLocationId: location.id,
          locationName: location.name,
          imagePaths: [],
          generateImages: true
        })
      }
    }

    // 创建物品实体
    const createdItems: StoryItem[] = []
    for (const item of items) {
      const type: ItemType = this.mapItemType(item.type)
      const level: ItemLevel = 'common'

      const storyItem = await db.lwItems.create({
        projectId,
        name: item.name,
        type,
        level,
        importance: 'secondary',
        description: item.description || '',
        sourceType: 'uploaded',
        sourceEpisodeId: episodeId
      })
      createdItems.push(storyItem)

      // 创建物品绑定
      if (db.itemBindings) {
        await db.itemBindings.create({
          projectId,
          longWritingItemId: storyItem.id,
          itemName: storyItem.name,
          imagePaths: [],
          generateImages: true
        })
      }
    }

    console.log('[UploadedEntityService] 实体创建完成')
    console.log('[UploadedEntityService] 创建角色:', createdCharacters.length)
    console.log('[UploadedEntityService] 创建地点:', createdLocations.length)
    console.log('[UploadedEntityService] 创建物品:', createdItems.length)

    return {
      characters: createdCharacters,
      locations: createdLocations,
      items: createdItems
    }
  }

  /**
   * 获取上传模式的实体详情
   * @param entityId 实体ID
   * @param entityType 实体类型：character, location, item
   * @returns 实体信息或null
   */
  static getUploadedEntity(
    entityId: string,
    entityType: 'character' | 'location' | 'item'
  ): StoryCharacter | StoryLocation | StoryItem | null {
    const db = DatabaseManager.getInstance()

    switch (entityType) {
      case 'character':
        return db.lwCharacters.getById(entityId)
      case 'location':
        return await db.lwLocations.getById(entityId)
      case 'item':
        return await db.lwItems.getById(entityId)
      default:
        return null
    }
  }

  /**
   * 更新上传模式的实体
   * @param entityId 实体ID
   * @param entityType 实体类型
   * @param data 更新数据
   * @returns 更新后的实体或null
   */
  static updateUploadedEntity(
    entityId: string,
    entityType: 'character' | 'location' | 'item',
    data: Partial<StoryCharacter> | Partial<StoryLocation> | Partial<StoryItem>
  ): StoryCharacter | StoryLocation | StoryItem | null {
    const db = DatabaseManager.getInstance()

    // 先验证实体是否是 uploaded 模式
    const existing = this.getUploadedEntity(entityId, entityType)
    if (!existing) {
      console.warn('[UploadedEntityService] 实体不存在:', entityId)
      return null
    }

    // 检查来源类型（只有 uploaded 模式的实体才能编辑）
    const sourceType = (existing as any).sourceType
    if (sourceType !== 'uploaded') {
      console.warn('[UploadedEntityService] 实体不是 uploaded 模式，不允许编辑:', entityId, sourceType)
      return null
    }

    switch (entityType) {
      case 'character':
        return db.lwCharacters.update(entityId, data as Partial<StoryCharacter>)
      case 'location':
        return await db.lwLocations.update(entityId, data as Partial<StoryLocation>)
      case 'item':
        return await db.lwItems.update(entityId, data as Partial<StoryItem>)
      default:
        return null
    }
  }

  /**
   * 删除上传模式的实体及其绑定
   * @param entityId 实体ID
   * @param entityType 实体类型
   * @param projectId 项目ID
   * @returns 是否删除成功
   */
  static deleteUploadedEntity(
    entityId: string,
    entityType: 'character' | 'location' | 'item',
    projectId: string
  ): boolean {
    const db = DatabaseManager.getInstance()

    // 先验证实体是否是 uploaded 模式
    const existing = this.getUploadedEntity(entityId, entityType)
    if (!existing) {
      console.warn('[UploadedEntityService] 实体不存在:', entityId)
      return false
    }

    // 检查来源类型
    const sourceType = (existing as any).sourceType
    if (sourceType !== 'uploaded') {
      console.warn('[UploadedEntityService] 实体不是 uploaded 模式，不允许删除:', entityId, sourceType)
      return false
    }

    // 删除绑定
    switch (entityType) {
      case 'character':
        if (db.characterBindings) {
          const binding = await db.characterBindings.getByLongWritingCharacterId(projectId, entityId)
          if (binding) {
            await db.characterBindings.delete(binding.id)
          }
        }
        return db.lwCharacters.delete(entityId)
      case 'location':
        if (db.locationBindings) {
          const binding = await db.locationBindings.getByLongWritingLocationId(projectId, entityId)
          if (binding) {
            await db.locationBindings.delete(binding.id)
          }
        }
        return await db.lwLocations.delete(entityId)
      case 'item':
        if (db.itemBindings) {
          const binding = await db.itemBindings.getByLongWritingItemId(projectId, entityId)
          if (binding) {
            await db.itemBindings.delete(binding.id)
          }
        }
        return await db.lwItems.delete(entityId)
      default:
        return false
    }
  }

  /**
   * 判断绑定是否来源于长文项目
   * @param binding 绑定信息（包含 longWritingCharacterId/locationId/itemId）
   * @returns 是否来源于长文项目
   */
  static isBindingFromLongWriting(binding: { longWritingCharacterId?: string; longWritingLocationId?: string; longWritingItemId?: string }): boolean {
    const db = DatabaseManager.getInstance()

    // 检查角色绑定的来源
    if (binding.longWritingCharacterId) {
      const character = db.lwCharacters.getById(binding.longWritingCharacterId)
      if (character && character.sourceType === 'longwriting') {
        return true
      }
    }

    // 检查地点绑定的来源
    if (binding.longWritingLocationId) {
      const location = await db.lwLocations.getById(binding.longWritingLocationId)
      if (location && location.sourceType === 'longwriting') {
        return true
      }
    }

    // 检查物品绑定的来源
    if (binding.longWritingItemId) {
      const item = await db.lwItems.getById(binding.longWritingItemId)
      if (item && item.sourceType === 'longwriting') {
        return true
      }
    }

    return false
  }

  /**
   * 映射角色 role 到 rolePosition
   */
  private static mapRoleToPosition(role?: string): CharacterRolePosition {
    switch (role) {
      case 'protagonist':
        return 'protagonist'
      case 'antagonist':
        return 'antagonist'
      case 'supporting':
        return 'supporting'
      case 'minor':
        return 'minor'
      default:
        return 'supporting'
    }
  }

  /**
   * 映射地点 type
   */
  private static mapLocationType(type?: string): LocationType {
    switch (type) {
      case 'city':
        return 'city'
      case 'village':
        return 'village'
      case 'mountain':
        return 'mountain'
      case 'palace':
        return 'palace'
      case 'forest':
        return 'forest'
      case 'sea':
        return 'sea'
      case 'building':
        return 'building'
      default:
        return 'other'
    }
  }

  /**
   * 映射物品 type
   */
  private static mapItemType(type?: string): ItemType {
    switch (type) {
      case 'weapon':
        return 'weapon'
      case 'artifact':
        return 'artifact'
      case 'medicine':
        return 'medicine'
      case 'manual':
        return 'manual'
      case 'token':
        return 'token'
      default:
        return 'other'
    }
  }
}