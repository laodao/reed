/**
 * 长文写字典仓库
 * @module database/repositories/lw-dictionary.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 */

import type { DataSource, Repository } from 'typeorm'
import { LwDictionaryCategoryEntity } from '../entities/lw-dictionary-category.entity'
import { LwDictionaryEntity } from '../entities/lw-dictionary.entity'

/**
 * 字典分类
 */
export interface DictionaryCategory {
  id: string
  code: string
  name: string
  sortOrder: number
  createdAt: number
  updatedAt: number
}

/**
 * 字典项
 */
export interface DictionaryItem {
  id: string
  categoryCode: string
  code: string
  name: string
  sortOrder: number
  createdAt: number
  updatedAt: number
}

/**
 * 默认字典分类
 */
export const DEFAULT_CATEGORIES: { code: string; name: string }[] = [
  { code: 'story_type', name: '故事类型' },
  { code: 'style', name: '故事风格' },
  { code: 'target_reader', name: '目标读者' },
  { code: 'estimated_length', name: '预估字数' },
  { code: 'skill_type', name: '技能类型' },
  { code: 'skill_level', name: '技能等级' },
  { code: 'item_type', name: '物品类型' },
  { code: 'item_level', name: '物品等级' },
]

/**
 * 默认字典数据
 */
export const DEFAULT_DICTIONARY: Record<string, { code: string; name: string }[]> = {
  story_type: [
    { code: 'wuxia', name: '武侠' },
    { code: 'xianxia', name: '仙侠' },
    { code: 'xuanhuan', name: '玄幻' },
    { code: 'kehuan', name: '科幻' },
    { code: 'xuanyi', name: '悬疑' },
    { code: 'dushi', name: '都市' },
    { code: 'yanqing', name: '言情' },
    { code: 'lishi', name: '历史' },
    { code: 'other', name: '其他' },
  ],
  style: [
    { code: 'light', name: '轻松幽默' },
    { code: 'heavy', name: '沉重深刻' },
    { code: 'passionate', name: '热血激昂' },
    { code: 'calm', name: '冷峻沉稳' },
    { code: 'popular', name: '通俗易懂' },
    { code: 'literary', name: '文学性强' },
  ],
  target_reader: [
    { code: 'teenager', name: '青少年' },
    { code: 'youth', name: '青年' },
    { code: 'middle', name: '中年' },
    { code: 'all', name: '全年龄' },
  ],
  estimated_length: [
    { code: 'short', name: '短篇小说（5万字以下）' },
    { code: 'medium', name: '中篇小说（5-20万字）' },
    { code: 'long', name: '长篇小说（20万字以上）' },
  ],
  skill_type: [
    { code: 'martial', name: '武功' },
    { code: 'magic', name: '法术' },
    { code: 'talent', name: '天赋' },
    { code: 'tech', name: '科技' },
    { code: 'other', name: '其他' },
  ],
  skill_level: [
    { code: 'beginner', name: '初级' },
    { code: 'intermediate', name: '中级' },
    { code: 'advanced', name: '高级' },
    { code: 'master', name: '大师' },
  ],
  item_type: [
    { code: 'weapon', name: '武器' },
    { code: 'artifact', name: '神器' },
    { code: 'medicine', name: '丹药' },
    { code: 'manual', name: '秘籍' },
    { code: 'token', name: '信物' },
    { code: 'other', name: '其他' },
  ],
  item_level: [
    { code: 'common', name: '普通' },
    { code: 'rare', name: '稀有' },
    { code: 'legendary', name: '传说' },
    { code: 'divine', name: '神级' },
  ],
}

export class LwDictionaryRepository {
  private categoryRepo: Repository<LwDictionaryCategoryEntity>
  private itemRepo: Repository<LwDictionaryEntity>

  constructor(private dataSource: DataSource) {
    this.categoryRepo = dataSource.getRepository(LwDictionaryCategoryEntity)
    this.itemRepo = dataSource.getRepository(LwDictionaryEntity)
  }

  // ==================== 分类管理 ====================

  async getAllCategories(): Promise<DictionaryCategory[]> {
    const rows = await this.categoryRepo
      .createQueryBuilder('c')
      .orderBy('c.sort_order', 'ASC')
      .getMany()
    return rows.map(r => this.toCategory(r))
  }

  async getCategoryByCode(code: string): Promise<DictionaryCategory | null> {
    const row = await this.categoryRepo.findOne({ where: { code } as any })
    return row ? this.toCategory(row) : null
  }

  async createCategory(
    code: string,
    name: string,
    sortOrder?: number,
  ): Promise<DictionaryCategory> {
    const id = this.generateId()
    const now = Date.now()
    if (sortOrder === undefined) {
      const existing = await this.getAllCategories()
      sortOrder = existing.length
    }
    await this.categoryRepo.save(
      this.categoryRepo.create({
        id,
        code,
        name,
        sortOrder,
        createdAt: now,
        updatedAt: now,
      }),
    )
    return { id, code, name, sortOrder, createdAt: now, updatedAt: now }
  }

  async updateCategory(code: string, name: string): Promise<DictionaryCategory | null> {
    const row = await this.categoryRepo.findOne({ where: { code } as any })
    if (!row) return null
    row.name = name
    row.updatedAt = Date.now()
    const saved = await this.categoryRepo.save(row)
    return this.toCategory(saved)
  }

  async deleteCategory(code: string): Promise<boolean> {
    return this.dataSource.transaction(async manager => {
      const itemRepo = manager.getRepository(LwDictionaryEntity)
      const catRepo = manager.getRepository(LwDictionaryCategoryEntity)
      await itemRepo.delete({ categoryCode: code } as any)
      const result = await catRepo.delete({ code } as any)
      return (result.affected ?? 0) > 0
    })
  }

  // ==================== 字典项管理 ====================

  async getByCategory(categoryCode: string): Promise<DictionaryItem[]> {
    const rows = await this.itemRepo
      .createQueryBuilder('d')
      .where('d.category_code = :cc', { cc: categoryCode })
      .orderBy('d.sort_order', 'ASC')
      .getMany()
    return rows.map(r => this.toItem(r))
  }

  async getAll(): Promise<Record<string, DictionaryItem[]>> {
    const result: Record<string, DictionaryItem[]> = {}
    const categories = await this.getAllCategories()
    for (const category of categories) {
      result[category.code] = await this.getByCategory(category.code)
    }
    return result
  }

  async getById(id: string): Promise<DictionaryItem | null> {
    const row = await this.itemRepo.findOne({ where: { id } as any })
    return row ? this.toItem(row) : null
  }

  async getByCode(categoryCode: string, code: string): Promise<DictionaryItem | null> {
    const row = await this.itemRepo.findOne({
      where: { categoryCode, code } as any,
    })
    return row ? this.toItem(row) : null
  }

  async create(
    categoryCode: string,
    code: string,
    name: string,
    sortOrder?: number,
  ): Promise<DictionaryItem> {
    const id = this.generateId()
    const now = Date.now()
    if (sortOrder === undefined) {
      const existing = await this.getByCategory(categoryCode)
      sortOrder = existing.length
    }
    await this.itemRepo.save(
      this.itemRepo.create({
        id,
        categoryCode,
        code,
        name,
        sortOrder,
        createdAt: now,
        updatedAt: now,
      }),
    )
    return { id, categoryCode, code, name, sortOrder, createdAt: now, updatedAt: now }
  }

  async update(
    id: string,
    data: { code?: string; name?: string },
  ): Promise<DictionaryItem | null> {
    const row = await this.itemRepo.findOne({ where: { id } as any })
    if (!row) return null
    let changed = false
    if (data.code !== undefined) {
      row.code = data.code
      changed = true
    }
    if (data.name !== undefined) {
      row.name = data.name
      changed = true
    }
    if (!changed) return this.toItem(row)
    row.updatedAt = Date.now()
    const saved = await this.itemRepo.save(row)
    return this.toItem(saved)
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.itemRepo.delete({ id } as any)
    return (result.affected ?? 0) > 0
  }

  async reorder(_categoryCode: string, orderedIds: string[]): Promise<void> {
    if (orderedIds.length === 0) return
    const now = Date.now()
    await this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(LwDictionaryEntity)
      for (let i = 0; i < orderedIds.length; i++) {
        await repo.update({ id: orderedIds[i] } as any, {
          sortOrder: i,
          updatedAt: now,
        })
      }
    })
  }

  // ==================== 初始化 ====================

  async initializeDefaults(): Promise<void> {
    // 初始化分类
    for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
      const cat = DEFAULT_CATEGORIES[i]
      const existing = await this.getCategoryByCode(cat.code)
      if (!existing) {
        await this.createCategory(cat.code, cat.name, i)
      }
    }
    // 初始化字典项
    for (const [categoryCode, items] of Object.entries(DEFAULT_DICTIONARY)) {
      const existing = await this.getByCategory(categoryCode)
      if (existing.length === 0) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i]
          await this.create(categoryCode, item.code, item.name, i)
        }
      }
    }
  }

  // ==================== 工具方法 ====================

  private generateId(): string {
    return `dict_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }

  private toCategory(e: LwDictionaryCategoryEntity): DictionaryCategory {
    return {
      id: e.id,
      code: e.code,
      name: e.name,
      sortOrder: e.sortOrder ?? 0,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }
  }

  private toItem(e: LwDictionaryEntity): DictionaryItem {
    return {
      id: e.id,
      categoryCode: e.categoryCode,
      code: e.code,
      name: e.name,
      sortOrder: e.sortOrder ?? 0,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }
  }
}
