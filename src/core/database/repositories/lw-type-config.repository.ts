/**
 * 长文写作项目类型配置仓库
 * 管理项目级别的技能类型、物品类型及其等级配置
 * @module database/repositories/lw-type-config.repository
 */

import Database from 'better-sqlite3'
import type {
  ProjectSkillTypeConfig,
  ProjectItemTypeConfig,
  SkillLevelConfig,
  ItemLevelConfig,
  CreateSkillTypeConfigRequest,
  UpdateSkillTypeConfigRequest,
  CreateItemTypeConfigRequest,
  UpdateItemTypeConfigRequest,
  CreateSkillLevelRequest,
  UpdateSkillLevelRequest,
  CreateItemLevelRequest,
  UpdateItemLevelRequest
} from '@shared/types/longwriting.types'

/**
 * 默认技能类型配置
 */
export const DEFAULT_SKILL_TYPE_CONFIGS: { code: string; name: string; description?: string }[] = [
  { code: 'martial', name: '武功', description: '武术技击类技能' },
  { code: 'magic', name: '法术', description: '法术咒语类技能' },
  { code: 'talent', name: '天赋', description: '与生俱来的特殊能力' },
  { code: 'tech', name: '科技', description: '科技装备类技能' },
  { code: 'other', name: '其他', description: '其他类型技能' }
]

/**
 * 默认物品类型配置
 */
export const DEFAULT_ITEM_TYPE_CONFIGS: { code: string; name: string; description?: string }[] = [
  { code: 'weapon', name: '武器', description: '攻击类装备' },
  { code: 'artifact', name: '神器', description: '拥有特殊力量的神器' },
  { code: 'medicine', name: '丹药', description: '炼制的丹药' },
  { code: 'manual', name: '秘籍', description: '记载功法的秘籍' },
  { code: 'token', name: '信物', description: '具有特殊意义的信物' },
  { code: 'other', name: '其他', description: '其他类型物品' }
]

/**
 * 默认技能等级配置（按技能类型）
 */
export const DEFAULT_SKILL_LEVELS: Record<string, { code: string; name: string; description: string }[]> = {
  martial: [
    { code: 'beginner', name: '入门', description: '初窥门径，掌握基本招式' },
    { code: 'skilled', name: '熟练', description: '招式娴熟，可灵活运用' },
    { code: 'expert', name: '精通', description: '融会贯通，威力大增' },
    { code: 'master', name: '大成', description: '炉火纯青，登峰造极' },
    { code: 'perfect', name: '圆满', description: '返璞归真，天人合一' }
  ],
  magic: [
    { code: 'tier1', name: '一阶', description: '初步掌握，可施展基础法术' },
    { code: 'tier2', name: '二阶', description: '法力增强，可施展中等法术' },
    { code: 'tier3', name: '三阶', description: '法力深厚，可施展高等法术' },
    { code: 'tier4', name: '四阶', description: '法力通玄，可施展禁咒' },
    { code: 'tier5', name: '五阶', description: '法力无边，可改天换地' }
  ],
  talent: [
    { code: 'awakened', name: '觉醒', description: '天赋觉醒，初显端倪' },
    { code: 'growing', name: '成长', description: '天赋成长，逐渐增强' },
    { code: 'mature', name: '成熟', description: '天赋成熟，运用自如' },
    { code: 'peak', name: '巅峰', description: '天赋巅峰，无坚不摧' }
  ],
  tech: [
    { code: 'basic', name: '初级', description: '基础型号，功能简单' },
    { code: 'intermediate', name: '中级', description: '性能提升，功能丰富' },
    { code: 'advanced', name: '高级', description: '高度精密，功能强大' },
    { code: 'top', name: '顶级', description: '顶尖科技，无所不能' }
  ],
  other: [
    { code: 'basic', name: '初级', description: '初学者水平' },
    { code: 'intermediate', name: '中级', description: '有一定造诣' },
    { code: 'advanced', name: '高级', description: '高深水平' }
  ]
}

/**
 * 默认物品等级配置（按物品类型）
 */
export const DEFAULT_ITEM_LEVELS: Record<string, { code: string; name: string; description: string }[]> = {
  weapon: [
    { code: 'common', name: '凡品', description: '普通凡铁，无特殊光泽' },
    { code: 'good', name: '良品', description: '工艺精良，隐隐有光泽' },
    { code: 'superior', name: '上品', description: '品质上乘，光芒内敛' },
    { code: 'excellent', name: '极品', description: '稀世珍品，光华四射' },
    { code: 'divine', name: '神品', description: '神兵利器，气冲斗牛' }
  ],
  artifact: [
    { code: 'mortal', name: '后天', description: '后天炼制，灵性初显' },
    { code: 'innate', name: '先天', description: '先天灵物，自有灵性' },
    { code: 'spirit', name: '灵器', description: '灵气充盈，可御使飞行' },
    { code: 'immortal', name: '仙器', description: '仙光缭绕，神通广大' },
    { code: 'divine', name: '神器', description: '神威浩荡，镇压天地' }
  ],
  medicine: [
    { code: 'low', name: '下品', description: '药效一般，颜色暗淡' },
    { code: 'medium', name: '中品', description: '药效尚可，色泽纯正' },
    { code: 'high', name: '上品', description: '药效显著，丹纹隐现' },
    { code: 'excellent', name: '极品', description: '药效惊人，丹香四溢' },
    { code: 'peerless', name: '绝品', description: '夺天地造化，引天劫降临' }
  ],
  manual: [
    { code: 'fragment', name: '残本', description: '残缺不全，难窥全貌' },
    { code: 'complete', name: '全本', description: '完整无缺，可修习全功' },
    { code: 'refined', name: '精本', description: '经过高人批注，精义尽显' },
    { code: 'unique', name: '孤本', description: '世间唯一，价值连城' }
  ],
  token: [
    { code: 'ordinary', name: '普通', description: '普通材质，无特殊异象' },
    { code: 'precious', name: '珍贵', description: '材质珍贵，纹路清晰' },
    { code: 'rare', name: '稀有', description: '稀有材质，蕴含能量波动' },
    { code: 'legendary', name: '传说', description: '传说中的信物，承载因果' }
  ],
  other: [
    { code: 'ordinary', name: '普通', description: '普通品质' },
    { code: 'excellent', name: '优秀', description: '品质优秀' },
    { code: 'outstanding', name: '卓越', description: '品质卓越' },
    { code: 'perfect', name: '完美', description: '完美无瑕' }
  ]
}

/**
 * 项目类型配置仓库
 */
export class LwTypeConfigRepository {
  constructor(private db: Database.Database) {}

  // ==================== 技能类型配置 ====================

  /**
   * 获取项目的所有技能类型配置
   */
  getSkillTypeConfigs(projectId: string): ProjectSkillTypeConfig[] {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_project_skill_types
      WHERE project_id = ?
      ORDER BY sort_order ASC
    `)
    const rows = stmt.all(projectId) as any[]
    return rows.map(this.mapSkillTypeConfig)
  }

  /**
   * 获取单个技能类型配置
   */
  getSkillTypeConfig(id: string): ProjectSkillTypeConfig | null {
    const stmt = this.db.prepare(`SELECT * FROM lw_project_skill_types WHERE id = ?`)
    const row = stmt.get(id) as any
    return row ? this.mapSkillTypeConfig(row) : null
  }

  /**
   * 根据编码获取技能类型配置
   */
  getSkillTypeConfigByCode(projectId: string, code: string): ProjectSkillTypeConfig | null {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_project_skill_types WHERE project_id = ? AND code = ?
    `)
    const row = stmt.get(projectId, code) as any
    return row ? this.mapSkillTypeConfig(row) : null
  }

  /**
   * 创建技能类型配置
   */
  createSkillTypeConfig(data: CreateSkillTypeConfigRequest): ProjectSkillTypeConfig {
    const id = this.generateId()
    const now = Date.now()

    const existing = this.getSkillTypeConfigs(data.projectId)
    const sortOrder = existing.length

    const stmt = this.db.prepare(`
      INSERT INTO lw_project_skill_types (id, project_id, code, name, description, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    stmt.run(id, data.projectId, data.code, data.name, data.description || null, sortOrder, now, now)

    return {
      id,
      projectId: data.projectId,
      code: data.code,
      name: data.name,
      description: data.description,
      sortOrder,
      createdAt: now,
      updatedAt: now
    }
  }

  /**
   * 更新技能类型配置
   */
  updateSkillTypeConfig(id: string, data: UpdateSkillTypeConfigRequest): ProjectSkillTypeConfig | null {
    const config = this.getSkillTypeConfig(id)
    if (!config) return null

    const now = Date.now()
    const updates: string[] = []
    const values: any[] = []

    if (data.name !== undefined) {
      updates.push('name = ?')
      values.push(data.name)
    }
    if (data.description !== undefined) {
      updates.push('description = ?')
      values.push(data.description)
    }

    if (updates.length === 0) return config

    updates.push('updated_at = ?')
    values.push(now)
    values.push(id)

    const stmt = this.db.prepare(`
      UPDATE lw_project_skill_types SET ${updates.join(', ')} WHERE id = ?
    `)
    stmt.run(...values)

    return { ...config, ...data, updatedAt: now }
  }

  /**
   * 删除技能类型配置（同时删除关联的等级）
   */
  deleteSkillTypeConfig(id: string): boolean {
    const config = this.getSkillTypeConfig(id)
    if (!config) return false

    // 删除关联的等级
    this.db.prepare(`DELETE FROM lw_project_skill_levels WHERE project_id = ? AND skill_type_code = ?`)
      .run(config.projectId, config.code)

    // 删除类型
    const stmt = this.db.prepare(`DELETE FROM lw_project_skill_types WHERE id = ?`)
    const result = stmt.run(id)
    return result.changes > 0
  }

  /**
   * 初始化项目的默认技能类型配置
   */
  initializeDefaultSkillTypes(projectId: string): void {
    for (let i = 0; i < DEFAULT_SKILL_TYPE_CONFIGS.length; i++) {
      const config = DEFAULT_SKILL_TYPE_CONFIGS[i]
      const existing = this.getSkillTypeConfigByCode(projectId, config.code)
      if (!existing) {
        this.createSkillTypeConfig({
          projectId,
          code: config.code,
          name: config.name,
          description: config.description
        })

        // 初始化该类型的默认等级
        const levels = DEFAULT_SKILL_LEVELS[config.code] || []
        for (let j = 0; j < levels.length; j++) {
          const level = levels[j]
          this.createSkillLevel({
            projectId,
            skillTypeCode: config.code,
            code: level.code,
            name: level.name,
            description: level.description
          })
        }
      }
    }
  }

  // ==================== 物品类型配置 ====================

  /**
   * 获取项目的所有物品类型配置
   */
  getItemTypeConfigs(projectId: string): ProjectItemTypeConfig[] {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_project_item_types
      WHERE project_id = ?
      ORDER BY sort_order ASC
    `)
    const rows = stmt.all(projectId) as any[]
    return rows.map(this.mapItemTypeConfig)
  }

  /**
   * 获取单个物品类型配置
   */
  getItemTypeConfig(id: string): ProjectItemTypeConfig | null {
    const stmt = this.db.prepare(`SELECT * FROM lw_project_item_types WHERE id = ?`)
    const row = stmt.get(id) as any
    return row ? this.mapItemTypeConfig(row) : null
  }

  /**
   * 根据编码获取物品类型配置
   */
  getItemTypeConfigByCode(projectId: string, code: string): ProjectItemTypeConfig | null {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_project_item_types WHERE project_id = ? AND code = ?
    `)
    const row = stmt.get(projectId, code) as any
    return row ? this.mapItemTypeConfig(row) : null
  }

  /**
   * 创建物品类型配置
   */
  createItemTypeConfig(data: CreateItemTypeConfigRequest): ProjectItemTypeConfig {
    const id = this.generateId()
    const now = Date.now()

    const existing = this.getItemTypeConfigs(data.projectId)
    const sortOrder = existing.length

    const stmt = this.db.prepare(`
      INSERT INTO lw_project_item_types (id, project_id, code, name, description, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    stmt.run(id, data.projectId, data.code, data.name, data.description || null, sortOrder, now, now)

    return {
      id,
      projectId: data.projectId,
      code: data.code,
      name: data.name,
      description: data.description,
      sortOrder,
      createdAt: now,
      updatedAt: now
    }
  }

  /**
   * 更新物品类型配置
   */
  updateItemTypeConfig(id: string, data: UpdateItemTypeConfigRequest): ProjectItemTypeConfig | null {
    const config = this.getItemTypeConfig(id)
    if (!config) return null

    const now = Date.now()
    const updates: string[] = []
    const values: any[] = []

    if (data.name !== undefined) {
      updates.push('name = ?')
      values.push(data.name)
    }
    if (data.description !== undefined) {
      updates.push('description = ?')
      values.push(data.description)
    }

    if (updates.length === 0) return config

    updates.push('updated_at = ?')
    values.push(now)
    values.push(id)

    const stmt = this.db.prepare(`
      UPDATE lw_project_item_types SET ${updates.join(', ')} WHERE id = ?
    `)
    stmt.run(...values)

    return { ...config, ...data, updatedAt: now }
  }

  /**
   * 删除物品类型配置（同时删除关联的等级）
   */
  deleteItemTypeConfig(id: string): boolean {
    const config = this.getItemTypeConfig(id)
    if (!config) return false

    // 删除关联的等级
    this.db.prepare(`DELETE FROM lw_project_item_levels WHERE project_id = ? AND item_type_code = ?`)
      .run(config.projectId, config.code)

    // 删除类型
    const stmt = this.db.prepare(`DELETE FROM lw_project_item_types WHERE id = ?`)
    const result = stmt.run(id)
    return result.changes > 0
  }

  /**
   * 初始化项目的默认物品类型配置
   */
  initializeDefaultItemTypes(projectId: string): void {
    for (let i = 0; i < DEFAULT_ITEM_TYPE_CONFIGS.length; i++) {
      const config = DEFAULT_ITEM_TYPE_CONFIGS[i]
      const existing = this.getItemTypeConfigByCode(projectId, config.code)
      if (!existing) {
        this.createItemTypeConfig({
          projectId,
          code: config.code,
          name: config.name,
          description: config.description
        })

        // 初始化该类型的默认等级
        const levels = DEFAULT_ITEM_LEVELS[config.code] || []
        for (let j = 0; j < levels.length; j++) {
          const level = levels[j]
          this.createItemLevel({
            projectId,
            itemTypeCode: config.code,
            code: level.code,
            name: level.name,
            description: level.description
          })
        }
      }
    }
  }

  // ==================== 技能等级配置 ====================

  /**
   * 获取某技能类型的所有等级配置
   */
  getSkillLevels(projectId: string, skillTypeCode: string): SkillLevelConfig[] {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_project_skill_levels
      WHERE project_id = ? AND skill_type_code = ?
      ORDER BY sort_order ASC
    `)
    const rows = stmt.all(projectId, skillTypeCode) as any[]
    return rows.map(this.mapSkillLevelConfig)
  }

  /**
   * 获取单个技能等级配置
   */
  getSkillLevel(id: string): SkillLevelConfig | null {
    const stmt = this.db.prepare(`SELECT * FROM lw_project_skill_levels WHERE id = ?`)
    const row = stmt.get(id) as any
    return row ? this.mapSkillLevelConfig(row) : null
  }

  /**
   * 创建技能等级配置
   */
  createSkillLevel(data: CreateSkillLevelRequest): SkillLevelConfig {
    const id = this.generateId()
    const now = Date.now()

    const existing = this.getSkillLevels(data.projectId, data.skillTypeCode)
    const sortOrder = existing.length

    const stmt = this.db.prepare(`
      INSERT INTO lw_project_skill_levels (id, project_id, skill_type_code, code, name, description, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    stmt.run(id, data.projectId, data.skillTypeCode, data.code, data.name, data.description || null, sortOrder, now, now)

    return {
      id,
      projectId: data.projectId,
      skillTypeCode: data.skillTypeCode,
      code: data.code,
      name: data.name,
      description: data.description || '',
      sortOrder,
      createdAt: now,
      updatedAt: now
    }
  }

  /**
   * 更新技能等级配置
   */
  updateSkillLevel(id: string, data: UpdateSkillLevelRequest): SkillLevelConfig | null {
    const config = this.getSkillLevel(id)
    if (!config) return null

    const now = Date.now()
    const updates: string[] = []
    const values: any[] = []

    if (data.name !== undefined) {
      updates.push('name = ?')
      values.push(data.name)
    }
    if (data.description !== undefined) {
      updates.push('description = ?')
      values.push(data.description)
    }

    if (updates.length === 0) return config

    updates.push('updated_at = ?')
    values.push(now)
    values.push(id)

    const stmt = this.db.prepare(`
      UPDATE lw_project_skill_levels SET ${updates.join(', ')} WHERE id = ?
    `)
    stmt.run(...values)

    return { ...config, ...data, updatedAt: now }
  }

  /**
   * 删除技能等级配置
   */
  deleteSkillLevel(id: string): boolean {
    const stmt = this.db.prepare(`DELETE FROM lw_project_skill_levels WHERE id = ?`)
    const result = stmt.run(id)
    return result.changes > 0
  }

  /**
   * 重排序技能等级
   */
  reorderSkillLevels(projectId: string, skillTypeCode: string, orderedIds: string[]): void {
    const stmt = this.db.prepare(`
      UPDATE lw_project_skill_levels SET sort_order = ?, updated_at = ? WHERE id = ?
    `)
    const now = Date.now()

    for (let i = 0; i < orderedIds.length; i++) {
      stmt.run(i, now, orderedIds[i])
    }
  }

  // ==================== 物品等级配置 ====================

  /**
   * 获取某物品类型的所有等级配置
   */
  getItemLevels(projectId: string, itemTypeCode: string): ItemLevelConfig[] {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_project_item_levels
      WHERE project_id = ? AND item_type_code = ?
      ORDER BY sort_order ASC
    `)
    const rows = stmt.all(projectId, itemTypeCode) as any[]
    return rows.map(this.mapItemLevelConfig)
  }

  /**
   * 获取单个物品等级配置
   */
  getItemLevel(id: string): ItemLevelConfig | null {
    const stmt = this.db.prepare(`SELECT * FROM lw_project_item_levels WHERE id = ?`)
    const row = stmt.get(id) as any
    return row ? this.mapItemLevelConfig(row) : null
  }

  /**
   * 创建物品等级配置
   */
  createItemLevel(data: CreateItemLevelRequest): ItemLevelConfig {
    const id = this.generateId()
    const now = Date.now()

    const existing = this.getItemLevels(data.projectId, data.itemTypeCode)
    const sortOrder = existing.length

    const stmt = this.db.prepare(`
      INSERT INTO lw_project_item_levels (id, project_id, item_type_code, code, name, description, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    stmt.run(id, data.projectId, data.itemTypeCode, data.code, data.name, data.description || null, sortOrder, now, now)

    return {
      id,
      projectId: data.projectId,
      itemTypeCode: data.itemTypeCode,
      code: data.code,
      name: data.name,
      description: data.description || '',
      sortOrder,
      createdAt: now,
      updatedAt: now
    }
  }

  /**
   * 更新物品等级配置
   */
  updateItemLevel(id: string, data: UpdateItemLevelRequest): ItemLevelConfig | null {
    const config = this.getItemLevel(id)
    if (!config) return null

    const now = Date.now()
    const updates: string[] = []
    const values: any[] = []

    if (data.name !== undefined) {
      updates.push('name = ?')
      values.push(data.name)
    }
    if (data.description !== undefined) {
      updates.push('description = ?')
      values.push(data.description)
    }

    if (updates.length === 0) return config

    updates.push('updated_at = ?')
    values.push(now)
    values.push(id)

    const stmt = this.db.prepare(`
      UPDATE lw_project_item_levels SET ${updates.join(', ')} WHERE id = ?
    `)
    stmt.run(...values)

    return { ...config, ...data, updatedAt: now }
  }

  /**
   * 删除物品等级配置
   */
  deleteItemLevel(id: string): boolean {
    const stmt = this.db.prepare(`DELETE FROM lw_project_item_levels WHERE id = ?`)
    const result = stmt.run(id)
    return result.changes > 0
  }

  /**
   * 重排序物品等级
   */
  reorderItemLevels(projectId: string, itemTypeCode: string, orderedIds: string[]): void {
    const stmt = this.db.prepare(`
      UPDATE lw_project_item_levels SET sort_order = ?, updated_at = ? WHERE id = ?
    `)
    const now = Date.now()

    for (let i = 0; i < orderedIds.length; i++) {
      stmt.run(i, now, orderedIds[i])
    }
  }

  // ==================== 工具方法 ====================

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `typecfg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 映射技能类型配置数据库行到对象
   */
  private mapSkillTypeConfig(row: any): ProjectSkillTypeConfig {
    return {
      id: row.id,
      projectId: row.project_id,
      code: row.code,
      name: row.name,
      description: row.description,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  /**
   * 映射物品类型配置数据库行到对象
   */
  private mapItemTypeConfig(row: any): ProjectItemTypeConfig {
    return {
      id: row.id,
      projectId: row.project_id,
      code: row.code,
      name: row.name,
      description: row.description,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  /**
   * 映射技能等级配置数据库行到对象
   */
  private mapSkillLevelConfig(row: any): SkillLevelConfig {
    return {
      id: row.id,
      projectId: row.project_id,
      skillTypeCode: row.skill_type_code,
      code: row.code,
      name: row.name,
      description: row.description || '',
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  /**
   * 映射物品等级配置数据库行到对象
   */
  private mapItemLevelConfig(row: any): ItemLevelConfig {
    return {
      id: row.id,
      projectId: row.project_id,
      itemTypeCode: row.item_type_code,
      code: row.code,
      name: row.name,
      description: row.description || '',
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }
}