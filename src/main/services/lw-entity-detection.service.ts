/**
 * 长文写作实体检测服务
 * @module services/lw-entity-detection.service
 * 用于检测 AI 生成的文本中出现的新实体（角色、地点、物品）
 */

import { DatabaseManager } from '../database/index'
import { createProvider } from '../providers'
import {
  NewCharacterInfo,
  NewLocationInfo,
  NewItemInfo,
  NewEntityDetectionResult,
  EntityImportance,
  StoryCharacter,
  StoryLocation,
  StoryItem,
  LocationType,
  ItemType,
  TemporaryCharacterTemplateType,
  TemporaryLocationTemplateType,
  CharacterRolePosition
} from '../../shared/types/longwriting.types'
import { TemporaryEntityTemplateService } from './temporary-entity-template.service'

/**
 * AI 提取实体结果
 */
interface AiExtractedEntities {
  characters: Array<{
    name: string
    description: string
    gender?: 'male' | 'female' | 'other'
    age?: number
    appearance?: string
    personality?: string
    occupation?: string
  }>
  locations: Array<{ name: string; description: string }>
  items: Array<{ name: string; description: string }>
}

/**
 * 实体检测服务
 */
export class LwEntityDetectionService {
  /**
   * 检测文本中的新实体
   * @param projectId 项目ID
   * @param text 要分析的文本内容
   * @param sourceOutlineId 来源大纲ID
   * @param chapterNumber 章节序号
   */
  static async detectNewEntities(
    projectId: string,
    text: string,
    sourceOutlineId?: string,
    chapterNumber?: number
  ): Promise<NewEntityDetectionResult> {
    const db = DatabaseManager.getInstance()
    if (!db.db) {
      throw new Error('数据库未初始化')
    }

    // 获取项目已有实体
    const existingCharacters = db.lwCharacters?.getByProjectId(projectId) || []
    const existingLocations = db.lwLocations?.getByProjectId(projectId) || []
    const existingItems = db.lwItems?.getByProjectId(projectId) || []

    // 通过 AI 分析文本，提取所有实体
    const allEntities = await this.extractEntitiesWithAI(text)

    // 过滤出新实体
    const newCharacters: NewCharacterInfo[] = allEntities.characters
      .filter(c => !existingCharacters.some(ec => ec.name === c.name))
      .map(c => ({
        name: c.name,
        description: c.description,
        suggestedImportance: this.classifyCharacterImportance(c.name, c.description, text),
        reason: this.getImportanceReason(c.name, c.description, text),
        // 传递 AI 提取的完整信息
        gender: c.gender,
        age: c.age,
        appearance: c.appearance || c.description,
        personality: c.personality,
        occupation: c.occupation,
        rolePosition: this.mapImportanceToRolePosition(this.classifyCharacterImportance(c.name, c.description, text))
      }))

    const newLocations: NewLocationInfo[] = allEntities.locations
      .filter(l => !existingLocations.some(el => el.name === l.name))
      .map(l => ({
        name: l.name,
        description: l.description,
        suggestedImportance: this.classifyLocationImportance(l.name, l.description, text),
        suggestedType: this.guessLocationType(l.name, l.description),
        reason: this.getImportanceReason(l.name, l.description, text)
      }))

    const newItems: NewItemInfo[] = allEntities.items
      .filter(i => !existingItems.some(ei => ei.name === i.name))
      .map(i => ({
        name: i.name,
        description: i.description,
        suggestedImportance: this.classifyItemImportance(i.name, i.description, text),
        suggestedType: this.guessItemType(i.name, i.description),
        reason: this.getImportanceReason(i.name, i.description, text)
      }))

    return {
      projectId,
      sourceOutlineId,
      chapterNumber,
      newCharacters,
      newLocations,
      newItems,
      detectedAt: Date.now()
    }
  }

  /**
   * 自动添加实体到项目
   * @param projectId 项目ID
   * @param characters 新角色列表
   * @param locations 新地点列表
   * @param items 新物品列表
   */
  static autoAddEntities(
    projectId: string,
    characters?: NewCharacterInfo[],
    locations?: NewLocationInfo[],
    items?: NewItemInfo[]
  ): {
    addedCharacters: StoryCharacter[]
    addedLocations: StoryLocation[]
    addedItems: StoryItem[]
    errors: string[]
  } {
    const db = DatabaseManager.getInstance()
    if (!db.db) {
      throw new Error('数据库未初始化')
    }

    const templateService = TemporaryEntityTemplateService.getInstance()

    const result = {
      addedCharacters: [] as StoryCharacter[],
      addedLocations: [] as StoryLocation[],
      addedItems: [] as StoryItem[],
      errors: [] as string[]
    }

    try {
      // 添加新角色
      if (characters && characters.length > 0 && db.lwCharacters) {
        for (const char of characters) {
          try {
            // 为临时角色匹配模板类型
            let templateType: TemporaryCharacterTemplateType | undefined
            if (char.suggestedImportance === 'temporary') {
              const match = templateService.matchCharacterTemplate(char.name, char.description)
              templateType = match.templateType as TemporaryCharacterTemplateType
              console.log(`[LwEntityDetectionService] 临时角色 "${char.name}" 匹配模板: ${templateType}, 置信度: ${match.confidence.toFixed(2)}`)
            }

            const created = db.lwCharacters.create({
              projectId,
              name: char.name,
              // 使用 AI 提取的完整信息，未提供时使用默认值
              gender: char.gender || 'other',
              age: char.age || 25,
              appearance: char.appearance || char.description,
              background: char.background || '',
              personality: char.personality || '',
              abilities: char.abilities || '',
              occupation: char.occupation,
              rolePosition: char.rolePosition || this.mapImportanceToRolePosition(char.suggestedImportance),
              importance: char.suggestedImportance,
              templateType,
              majorEvents: ''
            })
            result.addedCharacters.push(created)
          } catch (err: any) {
            result.errors.push(`添加角色 ${char.name} 失败: ${err.message}`)
          }
        }
      }

      // 添加新地点
      if (locations && locations.length > 0 && db.lwLocations) {
        for (const loc of locations) {
          try {
            // 为临时地点匹配模板类型
            let templateType: TemporaryLocationTemplateType | undefined
            if (loc.suggestedImportance === 'temporary') {
              const match = templateService.matchLocationTemplate(loc.name, loc.description)
              templateType = match.templateType as TemporaryLocationTemplateType
              console.log(`[LwEntityDetectionService] 临时地点 "${loc.name}" 匹配模板: ${templateType}, 置信度: ${match.confidence.toFixed(2)}`)
            }

            const created = db.lwLocations.create({
              projectId,
              name: loc.name,
              type: loc.suggestedType || 'other',
              importance: this.mapImportanceToLocationImportance(loc.suggestedImportance),
              entityImportance: loc.suggestedImportance,
              templateType,
              description: loc.description
            })
            result.addedLocations.push(created)
          } catch (err: any) {
            result.errors.push(`添加地点 ${loc.name} 失败: ${err.message}`)
          }
        }
      }

      // 添加新物品
      if (items && items.length > 0 && db.lwItems) {
        for (const item of items) {
          try {
            const created = db.lwItems.create({
              projectId,
              name: item.name,
              type: item.suggestedType || 'other',
              level: 'common',
              importance: item.suggestedImportance,
              description: item.description
            })
            result.addedItems.push(created)
          } catch (err: any) {
            result.errors.push(`添加物品 ${item.name} 失败: ${err.message}`)
          }
        }
      }

      console.log('[LwEntityDetectionService] 自动添加实体完成:', result)
    } catch (err: any) {
      result.errors.push(`自动添加实体失败: ${err.message}`)
      console.error('[LwEntityDetectionService] 自动添加实体失败:', err)
    }

    return result
  }

  /**
   * 通过 AI 提取文本中的实体
   */
  private static async extractEntitiesWithAI(text: string): Promise<AiExtractedEntities> {
    try {
      // 获取 AI 配置
      const { SecureStorageService } = await import('./secure-storage.service')
      const { PROVIDER_TEMPLATES } = await import('./provider-template.service')
      const { getDatabaseManager } = await import('../database')

      const dbManager = getDatabaseManager()
      if (!dbManager.providerConfigs) {
        console.warn('[LwEntityDetectionService] 数据库未初始化，返回空结果')
        return { characters: [], locations: [], items: [] }
      }

      // 获取默认提供商配置
      let config = await dbManager.providerConfigs.getDefault()
      if (!config) {
        const enabledConfigs = await dbManager.providerConfigs.getEnabled()
        if (enabledConfigs.length > 0) {
          config = enabledConfigs[0]
        }
      }

      if (!config || !config.apiKey) {
        console.warn('[LwEntityDetectionService] 未找到可用的 AI Provider，返回空结果')
        return { characters: [], locations: [], items: [] }
      }

      const template = PROVIDER_TEMPLATES.find(t => t.id === config!.templateId)
      if (!template) {
        console.warn('[LwEntityDetectionService] 未找到 Provider 模板，返回空结果')
        return { characters: [], locations: [], items: [] }
      }

      // 解密 API 密钥
      const secureStorage = SecureStorageService.getInstance()
      if (!secureStorage.isInitialized()) {
        await secureStorage.initialize()
      }
      const apiKey = secureStorage.decrypt(config.apiKey)

      const provider = createProvider(
        template.id,
        {
          apiKey,
          baseUrl: config.baseUrl,
          defaultModel: config.defaultModel
        },
        template,
        config
      )

      const prompt = `请分析以下小说文本，提取其中提到的所有角色、地点和物品。

文本内容：
"""
${text.substring(0, 4000)}
"""

请以 JSON 格式返回提取结果，格式如下：
{
  "characters": [
    {
      "name": "角色名称",
      "description": "简要描述",
      "gender": "性别（male/female/other，根据上下文推断）",
      "age": 年龄（数字，根据上下文推断，不确定时可省略）,
      "appearance": "外貌描述（从文本中提取，如无则省略）",
      "personality": "性格特点（从文本中提取，如无则省略）",
      "occupation": "职业/身份（如无则省略）"
    }
  ],
  "locations": [
    { "name": "地点名称", "description": "简要描述" }
  ],
  "items": [
    { "name": "物品名称", "description": "简要描述" }
  ]
}

注意：
1. 只提取在文本中明确出现或被提及的实体
2. 角色描述应简短，不超过50字
3. 不要遗漏任何实体，包括临时角色
4. 尽可能从文本中推断角色的性别、年龄、外貌、性格、职业等信息
5. 性别使用 male（男）、female（女）、other（其他/未知）
6. 只返回 JSON，不要其他解释`

      const context = {
        systemPrompt: '你是一个专业的小说分析助手，擅长从文本中提取角色、地点和物品等实体信息。',
        messages: [{ role: 'user' as const, content: prompt }]
      }

      const response = await provider.chat(context, { maxTokens: 2048 })

      // 解析 JSON 结果
      const jsonMatch = response.content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        console.warn('[LwEntityDetectionService] AI 响应未包含 JSON')
        return { characters: [], locations: [], items: [] }
      }

      const parsed = JSON.parse(jsonMatch[0])
      return {
        characters: parsed.characters || [],
        locations: parsed.locations || [],
        items: parsed.items || []
      }
    } catch (err) {
      console.error('[LwEntityDetectionService] AI 提取实体失败:', err)
      return { characters: [], locations: [], items: [] }
    }
  }

  /**
   * 根据角色信息判断重要性
   */
  private static classifyCharacterImportance(name: string, description: string, text: string): EntityImportance {
    // 计算角色在文本中的出现次数
    const occurrences = (text.match(new RegExp(name, 'g')) || []).length

    // 检查是否有对话或重要动作
    const hasDialogue = text.includes(`${name}说`) || text.includes(`${name}道`) || text.includes(`${name}问`)
    const hasAction = text.includes(`${name}挥`) || text.includes(`${name}走`) || text.includes(`${name}跑`) || text.includes(`${name}看`)

    // 根据规则判断
    if (occurrences > 10 || hasDialogue) {
      return 'main'
    } else if (occurrences > 3 || hasAction) {
      return 'secondary'
    } else {
      return 'temporary'
    }
  }

  /**
   * 根据地点信息判断重要性
   */
  private static classifyLocationImportance(name: string, description: string, text: string): EntityImportance {
    const occurrences = (text.match(new RegExp(name, 'g')) || []).length

    if (occurrences > 5) {
      return 'main'
    } else if (occurrences > 2) {
      return 'secondary'
    } else {
      return 'temporary'
    }
  }

  /**
   * 根据物品信息判断重要性
   */
  private static classifyItemImportance(name: string, description: string, text: string): EntityImportance {
    const occurrences = (text.match(new RegExp(name, 'g')) || []).length

    // 检查是否是关键物品（神器、宝物等）
    const isImportant = description.includes('神器') || description.includes('宝物') || description.includes('珍贵')

    if (isImportant || occurrences > 5) {
      return 'main'
    } else if (occurrences > 2) {
      return 'secondary'
    } else {
      return 'temporary'
    }
  }

  /**
   * 获取重要性判断的理由
   */
  private static getImportanceReason(name: string, description: string, text: string): string {
    const occurrences = (text.match(new RegExp(name, 'g')) || []).length
    return `在文本中出现 ${occurrences} 次`
  }

  /**
   * 根据名称猜测地点类型
   */
  private static guessLocationType(name: string, description: string): LocationType {
    if (name.includes('城') || name.includes('市')) return 'city'
    if (name.includes('村') || name.includes('镇')) return 'village'
    if (name.includes('山') || name.includes('峰')) return 'mountain'
    if (name.includes('宫') || name.includes('殿') || name.includes('府')) return 'palace'
    if (name.includes('林') || name.includes('林')) return 'forest'
    if (name.includes('海') || name.includes('湖') || name.includes('河')) return 'sea'
    if (name.includes('楼') || name.includes('阁') || name.includes('院')) return 'building'
    return 'other'
  }

  /**
   * 根据名称猜测物品类型
   */
  private static guessItemType(name: string, description: string): ItemType {
    if (name.includes('剑') || name.includes('刀') || name.includes('枪')) return 'weapon'
    if (description.includes('神器') || description.includes('法宝')) return 'artifact'
    if (name.includes('丹') || name.includes('药')) return 'medicine'
    if (name.includes('书') || name.includes('籍') || name.includes('典')) return 'manual'
    if (name.includes('令') || name.includes('牌') || name.includes('符')) return 'token'
    return 'other'
  }

  /**
   * 将 EntityImportance 映射到 CharacterRolePosition
   */
  private static mapImportanceToRolePosition(importance: EntityImportance): 'protagonist' | 'supporting' | 'antagonist' | 'minor' {
    switch (importance) {
      case 'main': return 'protagonist'
      case 'secondary': return 'supporting'
      case 'temporary': return 'minor'
    }
  }

  /**
   * 将 EntityImportance 映射到 LocationImportance
   */
  private static mapImportanceToLocationImportance(importance: EntityImportance): 'main' | 'important' | 'auxiliary' {
    switch (importance) {
      case 'main': return 'main'
      case 'secondary': return 'important'
      case 'temporary': return 'auxiliary'
    }
  }
}