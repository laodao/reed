/**
 * 临时角色模板仓库
 * @module database/repositories/lw-temp-character-template.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 */

import type { DataSource } from 'typeorm'
import {
  TemporaryCharacterTemplateRecord,
  TemporaryCharacterTemplateType,
} from '@shared/types/longwriting.types'
import { LwTempCharacterTemplateEntity } from '../entities/lw-temp-character-template.entity'
import { BaseRepository } from '../base-repository'

/**
 * 默认临时角色模板数据
 */
const DEFAULT_CHARACTER_TEMPLATES: Omit<
  TemporaryCharacterTemplateRecord,
  'id' | 'createdAt' | 'updatedAt'
>[] = [
  {
    type: 'male_passerby',
    name: '男性路人',
    gender: 'male',
    ageMin: 20,
    ageMax: 50,
    basePrompt:
      'ordinary man, casual clothing, neutral expression, simple features, unremarkable appearance, everyday person',
    styleVariants: JSON.stringify([
      'young man with short hair',
      'middle-aged man with beard',
      'man wearing hat',
    ]),
    negativePrompt: 'distinctive features, heroic, handsome, ugly, deformed',
    matchKeywords: JSON.stringify(['路人', '过客', '行人', '路人甲', '路人乙', '男子', '男人']),
    sortOrder: 1,
    isDefault: 0,
  },
  {
    type: 'female_passerby',
    name: '女性路人',
    gender: 'female',
    ageMin: 20,
    ageMax: 50,
    basePrompt:
      'ordinary woman, casual clothing, neutral expression, simple features, unremarkable appearance, everyday person',
    styleVariants: JSON.stringify([
      'young woman with long hair',
      'middle-aged woman',
      'woman with simple hairstyle',
    ]),
    negativePrompt: 'distinctive features, beautiful, ugly, deformed, glamorous',
    matchKeywords: JSON.stringify(['路女', '女路人', '女子', '少妇', '妇人', '女人']),
    sortOrder: 2,
    isDefault: 0,
  },
  {
    type: 'elderly_male',
    name: '老年男性',
    gender: 'male',
    ageMin: 60,
    ageMax: 80,
    basePrompt:
      'elderly man, gray hair, wrinkled face, kind expression, traditional clothing, wise appearance',
    styleVariants: JSON.stringify([
      'elderly man with beard',
      'old man with cane',
      'white-haired grandfather',
    ]),
    negativePrompt: 'young, athletic, modern clothing',
    matchKeywords: JSON.stringify(['老人', '老者', '老翁', '老汉', '大爷', '老头']),
    sortOrder: 3,
    isDefault: 0,
  },
  {
    type: 'elderly_female',
    name: '老年女性',
    gender: 'female',
    ageMin: 60,
    ageMax: 80,
    basePrompt:
      'elderly woman, gray hair, wrinkled face, kind expression, traditional clothing, grandmotherly appearance',
    styleVariants: JSON.stringify([
      'old woman with shawl',
      'white-haired grandmother',
      'elderly lady with gentle smile',
    ]),
    negativePrompt: 'young, beautiful, modern clothing',
    matchKeywords: JSON.stringify(['老妇', '老太', '老奶奶', '老婆婆']),
    sortOrder: 4,
    isDefault: 0,
  },
  {
    type: 'child',
    name: '儿童',
    gender: 'other',
    ageMin: 5,
    ageMax: 12,
    basePrompt: 'young child, innocent face, simple clothing, playful expression, cute features',
    styleVariants: JSON.stringify([
      'boy with short hair',
      'girl with pigtails',
      'child in traditional clothes',
    ]),
    negativePrompt: 'adult, mature, scary, deformed',
    matchKeywords: JSON.stringify(['小孩', '儿童', '孩童', '小童', '孩子', '少年', '少女']),
    sortOrder: 5,
    isDefault: 0,
  },
  {
    type: 'shopkeeper',
    name: '店家',
    gender: 'male',
    ageMin: 30,
    ageMax: 60,
    basePrompt:
      'shopkeeper, apron, friendly expression, merchant clothing, standing behind counter, welcoming pose',
    styleVariants: JSON.stringify([
      'innkeeper with mustache',
      'vendor with goods',
      'merchant with scale',
    ]),
    negativePrompt: 'warrior, noble, servant',
    matchKeywords: JSON.stringify(['店家', '店主', '掌柜', '小二', '店小二', '老板', '商贩']),
    sortOrder: 6,
    isDefault: 0,
  },
  {
    type: 'servant',
    name: '仆人',
    gender: 'other',
    ageMin: 20,
    ageMax: 50,
    basePrompt:
      'servant, humble clothing, bowing posture, respectful expression, simple uniform',
    styleVariants: JSON.stringify([
      'maid with apron',
      'butler in formal attire',
      'attendant with tray',
    ]),
    negativePrompt: 'noble, wealthy, arrogant',
    matchKeywords: JSON.stringify(['仆人', '丫鬟', '侍女', '奴仆', '下人', '家丁']),
    sortOrder: 7,
    isDefault: 0,
  },
  {
    type: 'guard',
    name: '守卫',
    gender: 'male',
    ageMin: 25,
    ageMax: 45,
    basePrompt:
      'guard, armor, helmet, stern expression, weapon at side, alert posture, military stance',
    styleVariants: JSON.stringify([
      'gate guard with spear',
      'palace guard in formal armor',
      'city watch patrol',
    ]),
    negativePrompt: 'civilian, casual, relaxed',
    matchKeywords: JSON.stringify(['守卫', '卫兵', '门卫', '护卫', '侍卫']),
    sortOrder: 8,
    isDefault: 0,
  },
  {
    type: 'soldier',
    name: '士兵',
    gender: 'male',
    ageMin: 18,
    ageMax: 40,
    basePrompt:
      'soldier, military uniform, disciplined posture, weapon, battle-ready stance, weathered face',
    styleVariants: JSON.stringify([
      'infantry soldier with sword',
      'archer with bow',
      'cavalry soldier',
    ]),
    negativePrompt: 'civilian, noble, elegant',
    matchKeywords: JSON.stringify(['士兵', '兵卒', '军士', '将士', '战士']),
    sortOrder: 9,
    isDefault: 0,
  },
  {
    type: 'merchant',
    name: '商人',
    gender: 'male',
    ageMin: 30,
    ageMax: 55,
    basePrompt:
      'merchant, prosperous clothing, calculating expression, carrying goods, traveling appearance',
    styleVariants: JSON.stringify([
      'wealthy merchant with gold',
      'traveling trader with cart',
      'market vendor with wares',
    ]),
    negativePrompt: 'warrior, peasant, noble',
    matchKeywords: JSON.stringify(['商人', '客商', '商贾', '行商']),
    sortOrder: 10,
    isDefault: 0,
  },
  {
    type: 'beggar',
    name: '乞丐',
    gender: 'other',
    ageMin: 30,
    ageMax: 70,
    basePrompt:
      'beggar, tattered clothing, humble expression, sitting posture, weathered face, thin frame',
    styleVariants: JSON.stringify([
      'old beggar with bowl',
      'homeless wanderer',
      'crippled beggar',
    ]),
    negativePrompt: 'wealthy, clean, healthy, noble',
    matchKeywords: JSON.stringify(['乞丐', '乞讨', '叫花子', '流浪汉']),
    sortOrder: 11,
    isDefault: 0,
  },
  {
    type: 'traveler',
    name: '旅行者',
    gender: 'other',
    ageMin: 20,
    ageMax: 50,
    basePrompt:
      'traveler, practical clothing, backpack, walking staff, road-worn appearance, adventurous expression',
    styleVariants: JSON.stringify([
      'wandering swordsman',
      'pilgrim with staff',
      'merchant traveler',
    ]),
    negativePrompt: 'settled, wealthy, formal',
    matchKeywords: JSON.stringify(['旅人', '行者', '游侠', '过客', '游客']),
    sortOrder: 12,
    isDefault: 0,
  },
  {
    type: 'villager_male',
    name: '男性村民',
    gender: 'male',
    ageMin: 20,
    ageMax: 60,
    basePrompt:
      'village man, simple rustic clothing, sun-weathered face, honest expression, working hands',
    styleVariants: JSON.stringify([
      'farmer with hoe',
      'fisherman with net',
      'village elder',
    ]),
    negativePrompt: 'noble, wealthy, city dweller',
    matchKeywords: JSON.stringify(['村民', '农夫', '农民', '渔民', '猎户', '樵夫']),
    sortOrder: 13,
    isDefault: 0,
  },
  {
    type: 'villager_female',
    name: '女性村民',
    gender: 'female',
    ageMin: 20,
    ageMax: 60,
    basePrompt:
      'village woman, simple rustic clothing, gentle expression, practical hairstyle, working hands',
    styleVariants: JSON.stringify([
      'farmer woman with basket',
      'weaver at loom',
      'village mother',
    ]),
    negativePrompt: 'noble, wealthy, city dweller, glamorous',
    matchKeywords: JSON.stringify(['农妇', '村妇', '村姑', '渔女']),
    sortOrder: 14,
    isDefault: 0,
  },
  {
    type: 'noble_male',
    name: '男性贵族',
    gender: 'male',
    ageMin: 25,
    ageMax: 60,
    basePrompt:
      'nobleman, elegant clothing, refined features, proud posture, sophisticated appearance',
    styleVariants: JSON.stringify([
      'young noble in fine robes',
      'elderly lord with insignia',
      'court official in ceremonial dress',
    ]),
    negativePrompt: 'peasant, commoner, warrior',
    matchKeywords: JSON.stringify(['贵族', '公子', '少爷', '老爷', '大人', '侯爷', '王爷']),
    sortOrder: 15,
    isDefault: 0,
  },
  {
    type: 'noble_female',
    name: '女性贵族',
    gender: 'female',
    ageMin: 20,
    ageMax: 55,
    basePrompt:
      'noblewoman, elegant gown, refined features, graceful posture, sophisticated appearance',
    styleVariants: JSON.stringify([
      'young lady in silk dress',
      'matron with jewelry',
      'court lady with fan',
    ]),
    negativePrompt: 'peasant, commoner, warrior',
    matchKeywords: JSON.stringify(['贵族', '小姐', '夫人', '公主', '格格', '郡主']),
    sortOrder: 16,
    isDefault: 0,
  },
  {
    type: 'custom',
    name: '自定义',
    gender: 'other',
    ageMin: 0,
    ageMax: 100,
    basePrompt: '',
    styleVariants: JSON.stringify([]),
    negativePrompt: '',
    matchKeywords: JSON.stringify([]),
    sortOrder: 99,
    isDefault: 1,
  },
]

export class LwTempCharacterTemplateRepository extends BaseRepository<
  LwTempCharacterTemplateEntity,
  TemporaryCharacterTemplateRecord
> {
  constructor(dataSource: DataSource) {
    super(dataSource, LwTempCharacterTemplateEntity)
  }

  protected toDto(e: LwTempCharacterTemplateEntity): TemporaryCharacterTemplateRecord {
    return {
      id: e.id,
      type: e.type as TemporaryCharacterTemplateType,
      name: e.name,
      gender: e.gender as TemporaryCharacterTemplateRecord['gender'],
      ageMin: e.ageMin ?? 20,
      ageMax: e.ageMax ?? 50,
      basePrompt: e.basePrompt,
      styleVariants: e.styleVariants ?? '[]',
      negativePrompt: e.negativePrompt ?? '',
      matchKeywords: e.matchKeywords ?? '[]',
      sortOrder: e.sortOrder ?? 0,
      isDefault: e.isDefault ?? 0,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }
  }

  async getAll(): Promise<TemporaryCharacterTemplateRecord[]> {
    const rows = await this.repo
      .createQueryBuilder('t')
      .orderBy('t.sort_order', 'ASC')
      .getMany()
    return this.toDtoList(rows)
  }

  async getByType(
    type: TemporaryCharacterTemplateType,
  ): Promise<TemporaryCharacterTemplateRecord | null> {
    return this.findOneByWhere({ type } as any)
  }

  async getDefault(): Promise<TemporaryCharacterTemplateRecord | null> {
    const row = await this.repo.findOne({ where: { isDefault: 1 } as any })
    return row ? this.toDto(row) : null
  }

  async upsert(
    template: Omit<TemporaryCharacterTemplateRecord, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<TemporaryCharacterTemplateRecord> {
    const now = Date.now()
    const existing = await this.repo.findOne({ where: { type: template.type } as any })

    if (existing) {
      existing.name = template.name
      existing.gender = template.gender
      existing.ageMin = template.ageMin
      existing.ageMax = template.ageMax
      existing.basePrompt = template.basePrompt
      existing.styleVariants = template.styleVariants
      existing.negativePrompt = template.negativePrompt
      existing.matchKeywords = template.matchKeywords
      existing.sortOrder = template.sortOrder
      existing.isDefault = template.isDefault
      existing.updatedAt = now
      const saved = await this.repo.save(existing)
      return this.toDto(saved)
    }

    const id = this.generateId()
    const entity = this.repo.create({
      id,
      type: template.type,
      name: template.name,
      gender: template.gender,
      ageMin: template.ageMin,
      ageMax: template.ageMax,
      basePrompt: template.basePrompt,
      styleVariants: template.styleVariants,
      negativePrompt: template.negativePrompt,
      matchKeywords: template.matchKeywords,
      sortOrder: template.sortOrder,
      isDefault: template.isDefault,
      createdAt: now,
      updatedAt: now,
    })
    const saved = await this.repo.save(entity)
    return this.toDto(saved)
  }

  async delete(type: TemporaryCharacterTemplateType): Promise<boolean> {
    const result = await this.repo.delete({ type } as any)
    return (result.affected ?? 0) > 0
  }

  async initializeDefaultData(): Promise<void> {
    const count = await this.repo.count()
    if (count > 0) return
    console.log('[LwTempCharacterTemplateRepository] 初始化默认临时角色模板数据...')
    await this.dataSource.transaction(async () => {
      for (const template of DEFAULT_CHARACTER_TEMPLATES) {
        await this.upsert(template)
      }
    })
    console.log(
      `[LwTempCharacterTemplateRepository] 已初始化 ${DEFAULT_CHARACTER_TEMPLATES.length} 个默认模板`,
    )
  }

  async matchByKeywords(text: string): Promise<{
    template: TemporaryCharacterTemplateRecord
    confidence: number
    matchedKeywords: string[]
  } | null> {
    const templates = await this.getAll()
    let bestMatch: {
      template: TemporaryCharacterTemplateRecord
      confidence: number
      matchedKeywords: string[]
    } | null = null

    for (const template of templates) {
      if (template.type === 'custom') continue
      const keywords: string[] = JSON.parse(template.matchKeywords || '[]')
      const matchedKeywords = keywords.filter(kw => text.includes(kw))
      if (matchedKeywords.length > 0) {
        const confidence = Math.min(matchedKeywords.length / keywords.length + 0.3, 1)
        if (!bestMatch || confidence > bestMatch.confidence) {
          bestMatch = { template, confidence, matchedKeywords }
        }
      }
    }
    return bestMatch
  }

  private generateId(): string {
    return `tct_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }
}
