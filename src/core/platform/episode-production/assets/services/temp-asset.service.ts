/**
 * temp-asset.service
 * @module platform/episode-production/assets/services/temp-asset.service
 * @description 临时角色/地点图片生成服务。
 *              拆自原 story-to-video-resource.service.ts 的
 *              generateTemporaryCharacterImage / generateTemporaryLocationImage 方法。
 *              P2 Task 6：lw entity 的 generatedImageId 字段已移除，
 *              生成结果改为写入 asset_image 表（category='main'，is_main=1）。
 */

import type { DataSource } from 'typeorm'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { AssetImageRepository } from '@core/database/repositories/asset-image.repository'
import { ImageService } from '@core/platform/services/image.service'
import type { ImageGenerationRequest } from '@shared/types'

/**
 * 临时实体图片生成服务
 */
export class TempAssetService {
  private static instance: TempAssetService

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): TempAssetService {
    if (!TempAssetService.instance) {
      TempAssetService.instance = new TempAssetService()
    }
    return TempAssetService.instance
  }

  /**
   * 为临时角色生成形象图片
   * 使用模板生成固定形象，保持视频一致性
   */
  async generateTemporaryCharacterImage(    characterId: string,
    styleName: string = 'cinematic',
    providerConfigId?: string,
    modelId?: string
  ): Promise<{ success: boolean; imageId?: string; error?: string }> {
    const db = getCoreDatabaseManager()
    if (!db.lwCharacters) {
      return { success: false, error: '数据库未初始化' }
    }

    const character = await db.lwCharacters.getById(characterId)
    if (!character) {
      return { success: false, error: '角色不存在' }
    }

    if (character.importance !== 'temporary') {
      return { success: false, error: '只能为临时角色生成模板图片' }
    }

    // 导入临时实体模板服务
    const { TemporaryEntityTemplateService } = await import('@core/packs/episode-production/services/temporary-entity-template.service')
    const templateService = TemporaryEntityTemplateService.getInstance()

    // 获取模板类型，如果没有则匹配
    const templateType = character.templateType ||
      (await templateService.matchCharacterTemplate(character.name, character.appearance)).templateType

    // 生成图片提示词
    const prompt = await templateService.generateCharacterImagePrompt(
      templateType as any,
      styleName,
      character.appearance
    )
    const negativePrompt = await templateService.getCharacterNegativePrompt(templateType as any)

    console.log(`[StoryToVideoResource] 为临时角色 "${character.name}" 生成图片`)
    console.log(`[StoryToVideoResource] 模板类型: ${templateType}`)
    console.log(`[StoryToVideoResource] Prompt: ${prompt.substring(0, 100)}...`)

    try {
      // 调用图像生成服务
      const request: ImageGenerationRequest = {
        prompt,
        negativePrompt,
        width: 512,
        height: 768,
        model: modelId,
        providerConfigId,
        count: 1,
        skipHistory: true
      }

      const response = await ImageService.generateImage(request)

      if (response.success && response.images && response.images.length > 0) {
        const imageInfo = response.images[0]
        const imageRef = imageInfo.url || ''

        // 写入 asset_image 表（character/main）—— P2 Task 6 移除 lw entity.generatedImageId 后的新写路径
        await writeAssetImageMain(db.dataSource, 'character', characterId, imageRef)

        console.log(`[StoryToVideoResource] 临时角色图片生成成功: ${imageRef}`)

        return {
          success: true,
          imageId: imageRef,
        }
      }

      return {
        success: false,
        error: response.error || '图片生成失败'
      }
    } catch (error: any) {
      console.error('[StoryToVideoResource] 生成临时角色图片失败:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * 为临时地点生成形象图片
   */
  async generateTemporaryLocationImage(    locationId: string,
    styleName: string = 'cinematic',
    providerConfigId?: string,
    modelId?: string
  ): Promise<{ success: boolean; imageId?: string; error?: string }> {
    const db = getCoreDatabaseManager()
    if (!db.lwLocations) {
      return { success: false, error: '数据库未初始化' }
    }

    const location = await db.lwLocations.getById(locationId)
    if (!location) {
      return { success: false, error: '地点不存在' }
    }

    if (location.entityImportance !== 'temporary') {
      return { success: false, error: '只能为临时地点生成模板图片' }
    }

    // 导入临时实体模板服务
    const { TemporaryEntityTemplateService } = await import('@core/packs/episode-production/services/temporary-entity-template.service')
    const templateService = TemporaryEntityTemplateService.getInstance()

    // 获取模板类型，如果没有则匹配
    const templateType = location.templateType ||
      (await templateService.matchLocationTemplate(location.name, location.description)).templateType

    // 生成图片提示词
    const prompt = await templateService.generateLocationImagePrompt(
      templateType as any,
      styleName,
      location.description
    )
    const negativePrompt = await templateService.getLocationNegativePrompt(templateType as any)

    console.log(`[StoryToVideoResource] 为临时地点 "${location.name}" 生成图片`)

    try {
      // 调用图像生成服务
      const request: ImageGenerationRequest = {
        prompt,
        negativePrompt,
        width: 1920,
        height: 1080,
        model: modelId,
        providerConfigId,
        count: 1,
        skipHistory: true
      }

      const response = await ImageService.generateImage(request)

      if (response.success && response.images && response.images.length > 0) {
        const imageInfo = response.images[0]
        const imageRef = imageInfo.url || ''

        // 写入 asset_image 表（location/main）—— P2 Task 6 移除 lw entity.generatedImageId 后的新写路径
        await writeAssetImageMain(db.dataSource, 'location', locationId, imageRef)

        return {
          success: true,
          imageId: imageRef,
        }
      }

      return {
        success: false,
        error: response.error || '图片生成失败'
      }
    } catch (error: any) {
      console.error('[StoryToVideoResource] 生成临时地点图片失败:', error)
      return { success: false, error: error.message }
    }
  }
}

/**
 * 将生成图写入 asset_image 表作为 main 图（幂等）。
 * asset_id 为 binding 的 id；此处直接用 lwCharacterId / lwLocationId 作为 asset_id 的备选，
 * 实际上 temp-asset 阶段 binding 不一定存在，因此以 lwEntityId 作为 asset_id。
 * 若 asset_image 中已有 (asset_type, asset_id, is_main=1) 则跳过，保持幂等。
 *
 * 复核修复：原实现裸 SQL INSERT 列清单漏 user_id，行落成 NULL 租户孤儿——
 * 改走 AssetImageRepository（BaseRepository scoped），user_id 随 ALS 自动注入。
 *
 * @param ds - TypeORM DataSource
 * @param assetType - 'character' | 'location'
 * @param assetId - 对应 binding 或 lw entity 的 id
 * @param imagePath - 图片路径
 */
async function writeAssetImageMain(
  ds: DataSource | null,
  assetType: 'character' | 'location',
  assetId: string,
  imagePath: string,
): Promise<void> {
  if (!ds) return
  const repo = new AssetImageRepository(ds)
  // 幂等检查：该 asset 已有主图则跳过
  const existing = await repo.getMainImage(assetType, assetId)
  if (existing) return
  await repo.createMainImage({ assetType, assetId, imagePath })
}
