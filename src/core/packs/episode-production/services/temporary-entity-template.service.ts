/**
 * 临时实体模板服务
 * @module services/temporary-entity-template.service
 * 为临时实体生成固定形象的模板管理服务
 * 所有模板数据存储在数据库中
 */

import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import {
  TemporaryCharacterTemplateType,
  TemporaryLocationTemplateType,
  TemporaryCharacterTemplateRecord,
  TemporaryLocationTemplateRecord,
  TemporaryEntityTemplateMatch
} from '@shared/types/longwriting.types'

/**
 * 临时实体模板服务
 */
export class TemporaryEntityTemplateService {
  private static instance: TemporaryEntityTemplateService

  private constructor() {}

  static getInstance(): TemporaryEntityTemplateService {
    if (!TemporaryEntityTemplateService.instance) {
      TemporaryEntityTemplateService.instance = new TemporaryEntityTemplateService()
    }
    return TemporaryEntityTemplateService.instance
  }

  /**
   * 获取所有角色模板
   */
  async getAllCharacterTemplates(): Promise<TemporaryCharacterTemplateRecord[]> {
    const db = getCoreDatabaseManager()
    return (await db.lwTempCharacterTemplates?.getAll()) || []
  }

  /**
   * 获取所有地点模板
   */
  async getAllLocationTemplates(): Promise<TemporaryLocationTemplateRecord[]> {
    const db = getCoreDatabaseManager()
    return (await db.lwTempLocationTemplates?.getAll()) || []
  }

  /**
   * 获取指定角色模板
   */
  async getCharacterTemplate(
    type: TemporaryCharacterTemplateType,
  ): Promise<TemporaryCharacterTemplateRecord | null> {
    const db = getCoreDatabaseManager()
    return (await db.lwTempCharacterTemplates?.getByType(type)) || null
  }

  /**
   * 获取指定地点模板
   */
  async getLocationTemplate(
    type: TemporaryLocationTemplateType,
  ): Promise<TemporaryLocationTemplateRecord | null> {
    const db = getCoreDatabaseManager()
    return (await db.lwTempLocationTemplates?.getByType(type)) || null
  }

  /**
   * 根据描述匹配角色模板
   */
  async matchCharacterTemplate(
    name: string,
    description: string,
  ): Promise<TemporaryEntityTemplateMatch> {
    const db = getCoreDatabaseManager()
    const combinedText = `${name} ${description}`.toLowerCase()

    const matchResult = await db.lwTempCharacterTemplates?.matchByKeywords(combinedText)

    if (matchResult) {
      return {
        templateType: matchResult.template.type,
        confidence: matchResult.confidence,
        matchedKeywords: matchResult.matchedKeywords
      }
    }

    // 如果没有匹配到，返回默认模板
    const defaultTemplate = await db.lwTempCharacterTemplates?.getDefault()
    return {
      templateType: defaultTemplate?.type || 'male_passerby',
      confidence: 0.5,
      matchedKeywords: ['默认匹配']
    }
  }

  /**
   * 根据描述匹配地点模板
   */
  async matchLocationTemplate(
    name: string,
    description: string,
  ): Promise<TemporaryEntityTemplateMatch> {
    const db = getCoreDatabaseManager()
    const combinedText = `${name} ${description}`.toLowerCase()

    const matchResult = await db.lwTempLocationTemplates?.matchByKeywords(combinedText)

    if (matchResult) {
      return {
        templateType: matchResult.template.type,
        confidence: matchResult.confidence,
        matchedKeywords: matchResult.matchedKeywords
      }
    }

    // 如果没有匹配到，返回默认模板
    const defaultTemplate = await db.lwTempLocationTemplates?.getDefault()
    return {
      templateType: defaultTemplate?.type || 'street',
      confidence: 0.5,
      matchedKeywords: ['默认匹配']
    }
  }

  /**
   * 生成角色形象的图片提示词
   * @param templateType 模板类型
   * @param styleName 视频风格名称
   * @param customDescription 自定义描述（可选）
   */
  async generateCharacterImagePrompt(
    templateType: TemporaryCharacterTemplateType,
    styleName: string = 'cinematic',
    customDescription?: string
  ): Promise<string> {
    const template = await this.getCharacterTemplate(templateType)

    if (!template) {
      return customDescription || 'person, general appearance'
    }

    const parts: string[] = []

    // 添加风格前缀
    const stylePrefix = this.getStylePrefix(styleName)
    parts.push(stylePrefix)

    // 添加基础提示词
    parts.push(template.basePrompt)

    // 如果有风格变体，随机选择一个
    const styleVariants: string[] = JSON.parse(template.styleVariants || '[]')
    if (styleVariants.length > 0) {
      const randomVariant = styleVariants[Math.floor(Math.random() * styleVariants.length)]
      parts.push(randomVariant)
    }

    // 添加自定义描述
    if (customDescription) {
      parts.push(customDescription)
    }

    // 添加质量后缀
    parts.push('masterpiece, best quality, highly detailed')

    return parts.join(', ')
  }

  /**
   * 生成地点形象的图片提示词
   */
  async generateLocationImagePrompt(
    templateType: TemporaryLocationTemplateType,
    styleName: string = 'cinematic',
    customDescription?: string
  ): Promise<string> {
    const template = await this.getLocationTemplate(templateType)

    if (!template) {
      return customDescription || 'location, general scenery'
    }

    const parts: string[] = []

    // 添加风格前缀
    const stylePrefix = this.getStylePrefix(styleName)
    parts.push(stylePrefix)

    // 添加基础提示词
    parts.push(template.basePrompt)

    // 如果有风格变体，随机选择一个
    const styleVariants: string[] = JSON.parse(template.styleVariants || '[]')
    if (styleVariants.length > 0) {
      const randomVariant = styleVariants[Math.floor(Math.random() * styleVariants.length)]
      parts.push(randomVariant)
    }

    // 添加自定义描述
    if (customDescription) {
      parts.push(customDescription)
    }

    // 添加质量后缀
    parts.push('masterpiece, best quality, highly detailed')

    return parts.join(', ')
  }

  /**
   * 获取风格前缀
   */
  private getStylePrefix(styleName: string): string {
    const styleMap: Record<string, string> = {
      cinematic: 'cinematic, high quality, 8k, professional photography, movie scene',
      anime: 'anime style, detailed anime art, high quality, vibrant colors',
      realistic: 'photorealistic, ultra realistic, 8k, raw photo, professional photography',
      fantasy: 'fantasy art, magical, ethereal, epic fantasy scene, digital art',
      ancient_chinese: 'ancient Chinese style, traditional Chinese painting, elegant, classical'
    }
    return styleMap[styleName] || styleMap.cinematic
  }

  /**
   * 获取角色的负面提示词
   */
  async getCharacterNegativePrompt(
    templateType: TemporaryCharacterTemplateType,
  ): Promise<string> {
    const template = await this.getCharacterTemplate(templateType)
    const baseNegative = 'low quality, blurry, distorted, ugly, bad anatomy, watermark, signature'
    if (template?.negativePrompt) {
      return `${baseNegative}, ${template.negativePrompt}`
    }
    return baseNegative
  }

  /**
   * 获取地点的负面提示词
   */
  async getLocationNegativePrompt(
    templateType: TemporaryLocationTemplateType,
  ): Promise<string> {
    const template = await this.getLocationTemplate(templateType)
    const baseNegative = 'low quality, blurry, distorted, watermark, signature'
    if (template?.negativePrompt) {
      return `${baseNegative}, ${template.negativePrompt}`
    }
    return baseNegative
  }

  /**
   * 批量为临时实体生成模板匹配
   */
  async batchMatchTemplates(
    characters: Array<{ name: string; description: string }>,
    locations: Array<{ name: string; description: string }>
  ): Promise<{
    characters: Array<{ name: string; match: TemporaryEntityTemplateMatch }>
    locations: Array<{ name: string; match: TemporaryEntityTemplateMatch }>
  }> {
    return {
      characters: await Promise.all(
        characters.map(async c => ({
          name: c.name,
          match: await this.matchCharacterTemplate(c.name, c.description),
        })),
      ),
      locations: await Promise.all(
        locations.map(async l => ({
          name: l.name,
          match: await this.matchLocationTemplate(l.name, l.description),
        })),
      ),
    }
  }

  /**
   * 更新角色模板
   */
  async updateCharacterTemplate(
    type: TemporaryCharacterTemplateType,
    data: Partial<Omit<TemporaryCharacterTemplateRecord, 'id' | 'type' | 'createdAt' | 'updatedAt'>>
  ): Promise<TemporaryCharacterTemplateRecord | null> {
    const db = getCoreDatabaseManager()
    const existing = await this.getCharacterTemplate(type)
    if (!existing) return null

    return (await db.lwTempCharacterTemplates?.upsert({
      type,
      name: data.name || existing.name,
      gender: data.gender || existing.gender,
      ageMin: data.ageMin ?? existing.ageMin,
      ageMax: data.ageMax ?? existing.ageMax,
      basePrompt: data.basePrompt || existing.basePrompt,
      styleVariants: data.styleVariants || existing.styleVariants,
      negativePrompt: data.negativePrompt || existing.negativePrompt,
      matchKeywords: data.matchKeywords || existing.matchKeywords,
      sortOrder: data.sortOrder ?? existing.sortOrder,
      isDefault: data.isDefault ?? existing.isDefault
    })) || null
  }

  /**
   * 更新地点模板
   */
  async updateLocationTemplate(
    type: TemporaryLocationTemplateType,
    data: Partial<Omit<TemporaryLocationTemplateRecord, 'id' | 'type' | 'createdAt' | 'updatedAt'>>
  ): Promise<TemporaryLocationTemplateRecord | null> {
    const db = getCoreDatabaseManager()
    const existing = await this.getLocationTemplate(type)
    if (!existing) return null

    return (await db.lwTempLocationTemplates?.upsert({
      type,
      name: data.name || existing.name,
      basePrompt: data.basePrompt || existing.basePrompt,
      styleVariants: data.styleVariants || existing.styleVariants,
      negativePrompt: data.negativePrompt || existing.negativePrompt,
      matchKeywords: data.matchKeywords || existing.matchKeywords,
      sortOrder: data.sortOrder ?? existing.sortOrder,
      isDefault: data.isDefault ?? existing.isDefault
    })) || null
  }
}