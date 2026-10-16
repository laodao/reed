/**
 * 临时实体模板服务
 * @module services/temporary-entity-template.service
 * 为临时实体生成固定形象的模板管理服务
 * 所有模板数据存储在数据库中
 */

import { DatabaseManager } from '../database'
import {
  TemporaryCharacterTemplateType,
  TemporaryLocationTemplateType,
  TemporaryCharacterTemplateRecord,
  TemporaryLocationTemplateRecord,
  TemporaryEntityTemplateMatch
} from '../../shared/types/longwriting.types'

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
  getAllCharacterTemplates(): TemporaryCharacterTemplateRecord[] {
    const db = DatabaseManager.getInstance()
    return db.lwTempCharacterTemplates?.getAll() || []
  }

  /**
   * 获取所有地点模板
   */
  getAllLocationTemplates(): TemporaryLocationTemplateRecord[] {
    const db = DatabaseManager.getInstance()
    return db.lwTempLocationTemplates?.getAll() || []
  }

  /**
   * 获取指定角色模板
   */
  getCharacterTemplate(type: TemporaryCharacterTemplateType): TemporaryCharacterTemplateRecord | null {
    const db = DatabaseManager.getInstance()
    return db.lwTempCharacterTemplates?.getByType(type) || null
  }

  /**
   * 获取指定地点模板
   */
  getLocationTemplate(type: TemporaryLocationTemplateType): TemporaryLocationTemplateRecord | null {
    const db = DatabaseManager.getInstance()
    return db.lwTempLocationTemplates?.getByType(type) || null
  }

  /**
   * 根据描述匹配角色模板
   */
  matchCharacterTemplate(name: string, description: string): TemporaryEntityTemplateMatch {
    const db = DatabaseManager.getInstance()
    const combinedText = `${name} ${description}`.toLowerCase()

    const matchResult = db.lwTempCharacterTemplates?.matchByKeywords(combinedText)

    if (matchResult) {
      return {
        templateType: matchResult.template.type,
        confidence: matchResult.confidence,
        matchedKeywords: matchResult.matchedKeywords
      }
    }

    // 如果没有匹配到，返回默认模板
    const defaultTemplate = db.lwTempCharacterTemplates?.getDefault()
    return {
      templateType: defaultTemplate?.type || 'male_passerby',
      confidence: 0.5,
      matchedKeywords: ['默认匹配']
    }
  }

  /**
   * 根据描述匹配地点模板
   */
  matchLocationTemplate(name: string, description: string): TemporaryEntityTemplateMatch {
    const db = DatabaseManager.getInstance()
    const combinedText = `${name} ${description}`.toLowerCase()

    const matchResult = db.lwTempLocationTemplates?.matchByKeywords(combinedText)

    if (matchResult) {
      return {
        templateType: matchResult.template.type,
        confidence: matchResult.confidence,
        matchedKeywords: matchResult.matchedKeywords
      }
    }

    // 如果没有匹配到，返回默认模板
    const defaultTemplate = db.lwTempLocationTemplates?.getDefault()
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
  generateCharacterImagePrompt(
    templateType: TemporaryCharacterTemplateType,
    styleName: string = 'cinematic',
    customDescription?: string
  ): string {
    const template = this.getCharacterTemplate(templateType)

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
  generateLocationImagePrompt(
    templateType: TemporaryLocationTemplateType,
    styleName: string = 'cinematic',
    customDescription?: string
  ): string {
    const template = this.getLocationTemplate(templateType)

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
  getCharacterNegativePrompt(templateType: TemporaryCharacterTemplateType): string {
    const template = this.getCharacterTemplate(templateType)
    const baseNegative = 'low quality, blurry, distorted, ugly, bad anatomy, watermark, signature'
    if (template?.negativePrompt) {
      return `${baseNegative}, ${template.negativePrompt}`
    }
    return baseNegative
  }

  /**
   * 获取地点的负面提示词
   */
  getLocationNegativePrompt(templateType: TemporaryLocationTemplateType): string {
    const template = this.getLocationTemplate(templateType)
    const baseNegative = 'low quality, blurry, distorted, watermark, signature'
    if (template?.negativePrompt) {
      return `${baseNegative}, ${template.negativePrompt}`
    }
    return baseNegative
  }

  /**
   * 批量为临时实体生成模板匹配
   */
  batchMatchTemplates(
    characters: Array<{ name: string; description: string }>,
    locations: Array<{ name: string; description: string }>
  ): {
    characters: Array<{ name: string; match: TemporaryEntityTemplateMatch }>
    locations: Array<{ name: string; match: TemporaryEntityTemplateMatch }>
  } {
    return {
      characters: characters.map(c => ({
        name: c.name,
        match: this.matchCharacterTemplate(c.name, c.description)
      })),
      locations: locations.map(l => ({
        name: l.name,
        match: this.matchLocationTemplate(l.name, l.description)
      }))
    }
  }

  /**
   * 更新角色模板
   */
  updateCharacterTemplate(
    type: TemporaryCharacterTemplateType,
    data: Partial<Omit<TemporaryCharacterTemplateRecord, 'id' | 'type' | 'createdAt' | 'updatedAt'>>
  ): TemporaryCharacterTemplateRecord | null {
    const db = DatabaseManager.getInstance()
    const existing = this.getCharacterTemplate(type)
    if (!existing) return null

    return db.lwTempCharacterTemplates?.upsert({
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
    }) || null
  }

  /**
   * 更新地点模板
   */
  updateLocationTemplate(
    type: TemporaryLocationTemplateType,
    data: Partial<Omit<TemporaryLocationTemplateRecord, 'id' | 'type' | 'createdAt' | 'updatedAt'>>
  ): TemporaryLocationTemplateRecord | null {
    const db = DatabaseManager.getInstance()
    const existing = this.getLocationTemplate(type)
    if (!existing) return null

    return db.lwTempLocationTemplates?.upsert({
      type,
      name: data.name || existing.name,
      basePrompt: data.basePrompt || existing.basePrompt,
      styleVariants: data.styleVariants || existing.styleVariants,
      negativePrompt: data.negativePrompt || existing.negativePrompt,
      matchKeywords: data.matchKeywords || existing.matchKeywords,
      sortOrder: data.sortOrder ?? existing.sortOrder,
      isDefault: data.isDefault ?? existing.isDefault
    }) || null
  }
}