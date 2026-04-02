/**
 * 长文写字典仓库
 * @module database/repositories/lw-dictionary.repository
 */

import Database from 'better-sqlite3'

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
  { code: 'item_level', name: '物品等级' }
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
    { code: 'other', name: '其他' }
  ],
  style: [
    { code: 'light', name: '轻松幽默' },
    { code: 'heavy', name: '沉重深刻' },
    { code: 'passionate', name: '热血激昂' },
    { code: 'calm', name: '冷峻沉稳' },
    { code: 'popular', name: '通俗易懂' },
    { code: 'literary', name: '文学性强' }
  ],
  target_reader: [
    { code: 'teenager', name: '青少年' },
    { code: 'youth', name: '青年' },
    { code: 'middle', name: '中年' },
    { code: 'all', name: '全年龄' }
  ],
  estimated_length: [
    { code: 'short', name: '短篇小说（5万字以下）' },
    { code: 'medium', name: '中篇小说（5-20万字）' },
    { code: 'long', name: '长篇小说（20万字以上）' }
  ],
  skill_type: [
    { code: 'martial', name: '武功' },
    { code: 'magic', name: '法术' },
    { code: 'talent', name: '天赋' },
    { code: 'tech', name: '科技' },
    { code: 'other', name: '其他' }
  ],
  skill_level: [
    { code: 'beginner', name: '初级' },
    { code: 'intermediate', name: '中级' },
    { code: 'advanced', name: '高级' },
    { code: 'master', name: '大师' }
  ],
  item_type: [
    { code: 'weapon', name: '武器' },
    { code: 'artifact', name: '神器' },
    { code: 'medicine', name: '丹药' },
    { code: 'manual', name: '秘籍' },
    { code: 'token', name: '信物' },
    { code: 'other', name: '其他' }
  ],
  item_level: [
    { code: 'common', name: '普通' },
    { code: 'rare', name: '稀有' },
    { code: 'legendary', name: '传说' },
    { code: 'divine', name: '神级' }
  ]
}

/**
 * 字典仓库
 */
export class LwDictionaryRepository {
  constructor(private db: Database.Database) {}

  // ==================== 分类管理 ====================

  /**
   * 获取所有分类
   */
  getAllCategories(): DictionaryCategory[] {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_dictionary_category ORDER BY sort_order ASC
    `)
    const rows = stmt.all() as any[]
    return rows.map(this.mapCategoryToItem)
  }

  /**
   * 根据编码获取分类
   */
  getCategoryByCode(code: string): DictionaryCategory | null {
    const stmt = this.db.prepare(`SELECT * FROM lw_dictionary_category WHERE code = ?`)
    const row = stmt.get(code) as any
    return row ? this.mapCategoryToItem(row) : null
  }

  /**
   * 创建分类
   */
  createCategory(code: string, name: string, sortOrder?: number): DictionaryCategory {
    const id = this.generateId()
    const now = Date.now()

    if (sortOrder === undefined) {
      const existing = this.getAllCategories()
      sortOrder = existing.length
    }

    const stmt = this.db.prepare(`
      INSERT INTO lw_dictionary_category (id, code, name, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    stmt.run(id, code, name, sortOrder, now, now)

    return {
      id,
      code,
      name,
      sortOrder,
      createdAt: now,
      updatedAt: now
    }
  }

  /**
   * 更新分类
   */
  updateCategory(code: string, name: string): DictionaryCategory | null {
    const category = this.getCategoryByCode(code)
    if (!category) return null

    const now = Date.now()
    const stmt = this.db.prepare(`
      UPDATE lw_dictionary_category SET name = ?, updated_at = ? WHERE code = ?
    `)
    stmt.run(name, now, code)

    return { ...category, name, updatedAt: now }
  }

  /**
   * 删除分类（同时删除分类下的所有字典项）
   */
  deleteCategory(code: string): boolean {
    // 先删除该分类下的所有字典项
    const deleteItemsStmt = this.db.prepare(`DELETE FROM lw_dictionary WHERE category_code = ?`)
    deleteItemsStmt.run(code)

    // 再删除分类
    const stmt = this.db.prepare(`DELETE FROM lw_dictionary_category WHERE code = ?`)
    const result = stmt.run(code)
    return result.changes > 0
  }

  // ==================== 字典项管理 ====================

  /**
   * 获取指定分类的所有字典项
   */
  getByCategory(categoryCode: string): DictionaryItem[] {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_dictionary
      WHERE category_code = ?
      ORDER BY sort_order ASC
    `)
    const rows = stmt.all(categoryCode) as any[]
    return rows.map(this.mapItemToItem)
  }

  /**
   * 获取所有字典项，按分类分组
   */
  getAll(): Record<string, DictionaryItem[]> {
    const result: Record<string, DictionaryItem[]> = {}
    const categories = this.getAllCategories()

    for (const category of categories) {
      result[category.code] = this.getByCategory(category.code)
    }

    return result
  }

  /**
   * 获取单个字典项
   */
  getById(id: string): DictionaryItem | null {
    const stmt = this.db.prepare(`SELECT * FROM lw_dictionary WHERE id = ?`)
    const row = stmt.get(id) as any
    return row ? this.mapItemToItem(row) : null
  }

  /**
   * 根据编码获取字典项
   */
  getByCode(categoryCode: string, code: string): DictionaryItem | null {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_dictionary WHERE category_code = ? AND code = ?
    `)
    const row = stmt.get(categoryCode, code) as any
    return row ? this.mapItemToItem(row) : null
  }

  /**
   * 添加字典项
   */
  create(categoryCode: string, code: string, name: string, sortOrder?: number): DictionaryItem {
    const id = this.generateId()
    const now = Date.now()

    if (sortOrder === undefined) {
      const existing = this.getByCategory(categoryCode)
      sortOrder = existing.length
    }

    const stmt = this.db.prepare(`
      INSERT INTO lw_dictionary (id, category_code, code, name, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    stmt.run(id, categoryCode, code, name, sortOrder, now, now)

    return {
      id,
      categoryCode,
      code,
      name,
      sortOrder,
      createdAt: now,
      updatedAt: now
    }
  }

  /**
   * 更新字典项
   */
  update(id: string, data: { code?: string; name?: string }): DictionaryItem | null {
    const item = this.getById(id)
    if (!item) return null

    const now = Date.now()
    const updates: string[] = []
    const values: any[] = []

    if (data.code !== undefined) {
      updates.push('code = ?')
      values.push(data.code)
    }
    if (data.name !== undefined) {
      updates.push('name = ?')
      values.push(data.name)
    }

    if (updates.length === 0) return item

    updates.push('updated_at = ?')
    values.push(now)
    values.push(id)

    const stmt = this.db.prepare(`
      UPDATE lw_dictionary SET ${updates.join(', ')} WHERE id = ?
    `)
    stmt.run(...values)

    return {
      ...item,
      ...data,
      updatedAt: now
    }
  }

  /**
   * 删除字典项
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare(`DELETE FROM lw_dictionary WHERE id = ?`)
    const result = stmt.run(id)
    return result.changes > 0
  }

  /**
   * 重排序
   */
  reorder(categoryCode: string, orderedIds: string[]): void {
    const stmt = this.db.prepare(`
      UPDATE lw_dictionary SET sort_order = ?, updated_at = ? WHERE id = ?
    `)
    const now = Date.now()

    for (let i = 0; i < orderedIds.length; i++) {
      stmt.run(i, now, orderedIds[i])
    }
  }

  // ==================== 初始化 ====================

  /**
   * 初始化默认分类和字典数据
   */
  initializeDefaults(): void {
    // 初始化分类
    for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
      const cat = DEFAULT_CATEGORIES[i]
      const existing = this.getCategoryByCode(cat.code)
      if (!existing) {
        this.createCategory(cat.code, cat.name, i)
      }
    }

    // 初始化字典项
    for (const [categoryCode, items] of Object.entries(DEFAULT_DICTIONARY)) {
      const existing = this.getByCategory(categoryCode)
      if (existing.length === 0) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i]
          this.create(categoryCode, item.code, item.name, i)
        }
      }
    }
  }

  // ==================== 工具方法 ====================

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `dict_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 映射分类数据库行到对象
   */
  private mapCategoryToItem(row: any): DictionaryCategory {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  /**
   * 映射字典项数据库行到对象
   */
  private mapItemToItem(row: any): DictionaryItem {
    return {
      id: row.id,
      categoryCode: row.category_code,
      code: row.code,
      name: row.name,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }
}