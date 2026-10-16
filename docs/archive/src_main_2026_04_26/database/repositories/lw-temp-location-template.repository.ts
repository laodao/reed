/**
 * 临时地点模板仓库
 * @module database/repositories/lw-temp-location-template.repository
 */

import Database from 'better-sqlite3'
import {
  TemporaryLocationTemplateRecord,
  TemporaryLocationTemplateType
} from '../../../shared/types/longwriting.types'

/**
 * 默认临时地点模板数据
 */
const DEFAULT_LOCATION_TEMPLATES: Omit<TemporaryLocationTemplateRecord, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    type: 'street',
    name: '街道',
    basePrompt: 'busy street, buildings on both sides, pedestrians, market stalls, daytime, urban scene',
    styleVariants: JSON.stringify([
      'ancient Chinese street with lanterns',
      'narrow alley between buildings',
      'wide boulevard with shops'
    ]),
    negativePrompt: 'empty, wilderness, indoor',
    matchKeywords: JSON.stringify(['街道', '街', '大街', '巷', '巷子', '胡同']),
    sortOrder: 1,
    isDefault: 0
  },
  {
    type: 'room',
    name: '房间',
    basePrompt: 'interior room, furniture, window with light, simple decoration, cozy atmosphere',
    styleVariants: JSON.stringify([
      'traditional Chinese room with wooden furniture',
      'inn guest room with bed',
      'study room with books'
    ]),
    negativePrompt: 'outdoor, crowd, grand hall',
    matchKeywords: JSON.stringify(['房间', '屋', '屋子', '房', '室内', '房中']),
    sortOrder: 2,
    isDefault: 0
  },
  {
    type: 'courtyard',
    name: '院子',
    basePrompt: 'courtyard, stone path, plants, traditional architecture, open sky, peaceful atmosphere',
    styleVariants: JSON.stringify([
      'Chinese garden courtyard with pond',
      'residential courtyard with trees',
      'temple courtyard with incense burner'
    ]),
    negativePrompt: 'indoor, street, wilderness',
    matchKeywords: JSON.stringify(['院子', '庭院', '院落', '天井']),
    sortOrder: 3,
    isDefault: 0
  },
  {
    type: 'forest_edge',
    name: '森林边缘',
    basePrompt: 'edge of forest, trees in background, open clearing, natural scenery, peaceful',
    styleVariants: JSON.stringify([
      'misty forest edge at dawn',
      'sunny clearing with wildflowers',
      'dark forest edge with shadows'
    ]),
    negativePrompt: 'city, indoor, crowd',
    matchKeywords: JSON.stringify(['林边', '林缘', '树林边缘', '林外', '林间']),
    sortOrder: 4,
    isDefault: 0
  },
  {
    type: 'mountain_path',
    name: '山路',
    basePrompt: 'mountain path, stone steps, surrounding peaks, trees, mist, natural scenery',
    styleVariants: JSON.stringify([
      'winding stone path up mountain',
      'mountain trail with waterfall',
      'steep cliff path'
    ]),
    negativePrompt: 'city, indoor, flat land',
    matchKeywords: JSON.stringify(['山路', '山道', '山径', '山间小路', '山路']),
    sortOrder: 5,
    isDefault: 0
  },
  {
    type: 'riverbank',
    name: '河岸',
    basePrompt: 'riverbank, flowing water, willow trees, boats in distance, peaceful scenery',
    styleVariants: JSON.stringify([
      'river at sunset with fishing boats',
      'peaceful stream with stones',
      'wide river with bridge'
    ]),
    negativePrompt: 'indoor, desert, mountain',
    matchKeywords: JSON.stringify(['河岸', '河边', '江边', '湖边', '水边', '河畔']),
    sortOrder: 6,
    isDefault: 0
  },
  {
    type: 'market',
    name: '市场',
    basePrompt: 'bustling market, stalls with goods, vendors, shoppers, colorful wares, lively atmosphere',
    styleVariants: JSON.stringify([
      'traditional Chinese market with canopy',
      'night market with lanterns',
      'rural market with farmers'
    ]),
    negativePrompt: 'empty, indoor, wilderness',
    matchKeywords: JSON.stringify(['市场', '集市', '市集', '街市', '墟市']),
    sortOrder: 7,
    isDefault: 0
  },
  {
    type: 'inn',
    name: '客栈',
    basePrompt: 'inn interior, wooden tables, counter, lanterns, guests eating, warm atmosphere',
    styleVariants: JSON.stringify([
      'traditional Chinese inn with red lanterns',
      'roadside teahouse',
      'rustic tavern with fireplace'
    ]),
    negativePrompt: 'modern, empty, wilderness',
    matchKeywords: JSON.stringify(['客栈', '旅店', '酒楼', '茶馆', '茶楼']),
    sortOrder: 8,
    isDefault: 0
  },
  {
    type: 'temple',
    name: '庙宇',
    basePrompt: 'temple interior, incense smoke, statue of deity, red pillars, peaceful atmosphere',
    styleVariants: JSON.stringify([
      'Buddhist temple with golden statue',
      'Taoist temple with incense burner',
      'small shrine with offerings'
    ]),
    negativePrompt: 'modern, secular, crowd',
    matchKeywords: JSON.stringify(['庙宇', '寺庙', '庙', '观', '道观', '祠堂']),
    sortOrder: 9,
    isDefault: 0
  },
  {
    type: 'custom',
    name: '自定义',
    basePrompt: '',
    styleVariants: JSON.stringify([]),
    negativePrompt: '',
    matchKeywords: JSON.stringify([]),
    sortOrder: 99,
    isDefault: 1
  }
]

/**
 * 临时地点模板仓库
 */
export class LwTempLocationTemplateRepository {
  constructor(private db: Database.Database) {}

  /**
   * 获取所有模板
   */
  getAll(): TemporaryLocationTemplateRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_temp_location_templates ORDER BY sort_order ASC
    `)
    return stmt.all() as TemporaryLocationTemplateRecord[]
  }

  /**
   * 根据类型获取模板
   */
  getByType(type: TemporaryLocationTemplateType): TemporaryLocationTemplateRecord | null {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_temp_location_templates WHERE type = ?
    `)
    return stmt.get(type) as TemporaryLocationTemplateRecord | null
  }

  /**
   * 获取默认模板
   */
  getDefault(): TemporaryLocationTemplateRecord | null {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_temp_location_templates WHERE is_default = 1 LIMIT 1
    `)
    return stmt.get() as TemporaryLocationTemplateRecord | null
  }

  /**
   * 创建或更新模板
   */
  upsert(template: Omit<TemporaryLocationTemplateRecord, 'id' | 'createdAt' | 'updatedAt'>): TemporaryLocationTemplateRecord {
    const now = Date.now()
    const existing = this.getByType(template.type)

    if (existing) {
      // 更新
      const stmt = this.db.prepare(`
        UPDATE lw_temp_location_templates SET
          name = ?, base_prompt = ?, style_variants = ?, negative_prompt = ?,
          match_keywords = ?, sort_order = ?, is_default = ?, updated_at = ?
        WHERE type = ?
      `)
      stmt.run(
        template.name, template.basePrompt, template.styleVariants, template.negativePrompt,
        template.matchKeywords, template.sortOrder, template.isDefault, now,
        template.type
      )
      return this.getByType(template.type)!
    } else {
      // 创建
      const id = this.generateId()
      const stmt = this.db.prepare(`
        INSERT INTO lw_temp_location_templates (
          id, type, name, base_prompt, style_variants, negative_prompt,
          match_keywords, sort_order, is_default, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      stmt.run(
        id, template.type, template.name, template.basePrompt,
        template.styleVariants, template.negativePrompt, template.matchKeywords,
        template.sortOrder, template.isDefault, now, now
      )
      return this.getByType(template.type)!
    }
  }

  /**
   * 删除模板
   */
  delete(type: TemporaryLocationTemplateType): boolean {
    const stmt = this.db.prepare('DELETE FROM lw_temp_location_templates WHERE type = ?')
    const result = stmt.run(type)
    return result.changes > 0
  }

  /**
   * 初始化默认模板数据
   */
  initializeDefaultData(): void {
    // 检查是否已有数据
    const count = this.db.prepare('SELECT COUNT(*) as count FROM lw_temp_location_templates').get() as { count: number }
    if (count.count > 0) return

    console.log('[LwTempLocationTemplateRepository] 初始化默认临时地点模板数据...')

    const transaction = this.db.transaction(() => {
      for (const template of DEFAULT_LOCATION_TEMPLATES) {
        this.upsert(template)
      }
    })

    transaction()
    console.log(`[LwTempLocationTemplateRepository] 已初始化 ${DEFAULT_LOCATION_TEMPLATES.length} 个默认模板`)
  }

  /**
   * 根据关键词匹配模板
   */
  matchByKeywords(text: string): { template: TemporaryLocationTemplateRecord; confidence: number; matchedKeywords: string[] } | null {
    const templates = this.getAll()
    let bestMatch: { template: TemporaryLocationTemplateRecord; confidence: number; matchedKeywords: string[] } | null = null

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
    return `tlt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}