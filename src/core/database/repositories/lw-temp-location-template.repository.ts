/**
 * 临时地点模板仓库
 * @module database/repositories/lw-temp-location-template.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 */

import type { DataSource } from 'typeorm'
import {
  TemporaryLocationTemplateRecord,
  TemporaryLocationTemplateType,
} from '@shared/types/longwriting.types'
import { LwTempLocationTemplateEntity } from '../entities/lw-temp-location-template.entity'
import { BaseRepository } from '../base-repository'

const DEFAULT_LOCATION_TEMPLATES: Omit<
  TemporaryLocationTemplateRecord,
  'id' | 'createdAt' | 'updatedAt'
>[] = [
  {
    type: 'street',
    name: '街道',
    basePrompt:
      'busy street, buildings on both sides, pedestrians, market stalls, daytime, urban scene',
    styleVariants: JSON.stringify([
      'ancient Chinese street with lanterns',
      'narrow alley between buildings',
      'wide boulevard with shops',
    ]),
    negativePrompt: 'empty, wilderness, indoor',
    matchKeywords: JSON.stringify(['街道', '街', '大街', '巷', '巷子', '胡同']),
    sortOrder: 1,
    isDefault: 0,
  },
  {
    type: 'room',
    name: '房间',
    basePrompt: 'interior room, furniture, window with light, simple decoration, cozy atmosphere',
    styleVariants: JSON.stringify([
      'traditional Chinese room with wooden furniture',
      'inn guest room with bed',
      'study room with books',
    ]),
    negativePrompt: 'outdoor, crowd, grand hall',
    matchKeywords: JSON.stringify(['房间', '屋', '屋子', '房', '室内', '房中']),
    sortOrder: 2,
    isDefault: 0,
  },
  {
    type: 'courtyard',
    name: '院子',
    basePrompt:
      'courtyard, stone path, plants, traditional architecture, open sky, peaceful atmosphere',
    styleVariants: JSON.stringify([
      'Chinese garden courtyard with pond',
      'residential courtyard with trees',
      'temple courtyard with incense burner',
    ]),
    negativePrompt: 'indoor, street, wilderness',
    matchKeywords: JSON.stringify(['院子', '庭院', '院落', '天井']),
    sortOrder: 3,
    isDefault: 0,
  },
  {
    type: 'forest_edge',
    name: '森林边缘',
    basePrompt: 'edge of forest, trees in background, open clearing, natural scenery, peaceful',
    styleVariants: JSON.stringify([
      'misty forest edge at dawn',
      'sunny clearing with wildflowers',
      'dark forest edge with shadows',
    ]),
    negativePrompt: 'city, indoor, crowd',
    matchKeywords: JSON.stringify(['林边', '林缘', '树林边缘', '林外', '林间']),
    sortOrder: 4,
    isDefault: 0,
  },
  {
    type: 'mountain_path',
    name: '山路',
    basePrompt: 'mountain path, stone steps, surrounding peaks, trees, mist, natural scenery',
    styleVariants: JSON.stringify([
      'winding stone path up mountain',
      'mountain trail with waterfall',
      'steep cliff path',
    ]),
    negativePrompt: 'city, indoor, flat land',
    matchKeywords: JSON.stringify(['山路', '山道', '山径', '山间小路', '山路']),
    sortOrder: 5,
    isDefault: 0,
  },
  {
    type: 'riverbank',
    name: '河岸',
    basePrompt: 'riverbank, flowing water, willow trees, boats in distance, peaceful scenery',
    styleVariants: JSON.stringify([
      'river at sunset with fishing boats',
      'peaceful stream with stones',
      'wide river with bridge',
    ]),
    negativePrompt: 'indoor, desert, mountain',
    matchKeywords: JSON.stringify(['河岸', '河边', '江边', '湖边', '水边', '河畔']),
    sortOrder: 6,
    isDefault: 0,
  },
  {
    type: 'market',
    name: '市场',
    basePrompt:
      'bustling market, stalls with goods, vendors, shoppers, colorful wares, lively atmosphere',
    styleVariants: JSON.stringify([
      'traditional Chinese market with canopy',
      'night market with lanterns',
      'rural market with farmers',
    ]),
    negativePrompt: 'empty, indoor, wilderness',
    matchKeywords: JSON.stringify(['市场', '集市', '市集', '街市', '墟市']),
    sortOrder: 7,
    isDefault: 0,
  },
  {
    type: 'inn',
    name: '客栈',
    basePrompt:
      'inn interior, wooden tables, counter, lanterns, guests eating, warm atmosphere',
    styleVariants: JSON.stringify([
      'traditional Chinese inn with red lanterns',
      'roadside teahouse',
      'rustic tavern with fireplace',
    ]),
    negativePrompt: 'modern, empty, wilderness',
    matchKeywords: JSON.stringify(['客栈', '旅店', '酒楼', '茶馆', '茶楼']),
    sortOrder: 8,
    isDefault: 0,
  },
  {
    type: 'temple',
    name: '庙宇',
    basePrompt:
      'temple interior, incense smoke, statue of deity, red pillars, peaceful atmosphere',
    styleVariants: JSON.stringify([
      'Buddhist temple with golden statue',
      'Taoist temple with incense burner',
      'small shrine with offerings',
    ]),
    negativePrompt: 'modern, secular, crowd',
    matchKeywords: JSON.stringify(['庙宇', '寺庙', '庙', '观', '道观', '祠堂']),
    sortOrder: 9,
    isDefault: 0,
  },
  {
    type: 'custom',
    name: '自定义',
    basePrompt: '',
    styleVariants: JSON.stringify([]),
    negativePrompt: '',
    matchKeywords: JSON.stringify([]),
    sortOrder: 99,
    isDefault: 1,
  },
]

export class LwTempLocationTemplateRepository extends BaseRepository<
  LwTempLocationTemplateEntity,
  TemporaryLocationTemplateRecord
> {
  constructor(dataSource: DataSource) {
    super(dataSource, LwTempLocationTemplateEntity)
  }

  protected toDto(e: LwTempLocationTemplateEntity): TemporaryLocationTemplateRecord {
    return {
      id: e.id,
      type: e.type as TemporaryLocationTemplateType,
      name: e.name,
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

  async getAll(): Promise<TemporaryLocationTemplateRecord[]> {
    const rows = await this.repo
      .createQueryBuilder('t')
      .orderBy('t.sort_order', 'ASC')
      .getMany()
    return this.toDtoList(rows)
  }

  async getByType(
    type: TemporaryLocationTemplateType,
  ): Promise<TemporaryLocationTemplateRecord | null> {
    return this.findOneByWhere({ type } as any)
  }

  async getDefault(): Promise<TemporaryLocationTemplateRecord | null> {
    const row = await this.repo.findOne({ where: { isDefault: 1 } as any })
    return row ? this.toDto(row) : null
  }

  async upsert(
    template: Omit<TemporaryLocationTemplateRecord, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<TemporaryLocationTemplateRecord> {
    const now = Date.now()
    const existing = await this.repo.findOne({ where: { type: template.type } as any })

    if (existing) {
      existing.name = template.name
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

  async delete(type: TemporaryLocationTemplateType): Promise<boolean> {
    const result = await this.repo.delete({ type } as any)
    return (result.affected ?? 0) > 0
  }

  async initializeDefaultData(): Promise<void> {
    const count = await this.repo.count()
    if (count > 0) return
    console.log('[LwTempLocationTemplateRepository] 初始化默认临时地点模板数据...')
    await this.dataSource.transaction(async () => {
      for (const template of DEFAULT_LOCATION_TEMPLATES) {
        await this.upsert(template)
      }
    })
    console.log(
      `[LwTempLocationTemplateRepository] 已初始化 ${DEFAULT_LOCATION_TEMPLATES.length} 个默认模板`,
    )
  }

  async matchByKeywords(text: string): Promise<{
    template: TemporaryLocationTemplateRecord
    confidence: number
    matchedKeywords: string[]
  } | null> {
    const templates = await this.getAll()
    let bestMatch: {
      template: TemporaryLocationTemplateRecord
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
    return `tlt_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }
}
