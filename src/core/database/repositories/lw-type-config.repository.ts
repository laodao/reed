/**
 * 长文写作项目类型配置仓库
 * 管理项目级别的技能类型、物品类型及其等级配置
 * @module database/repositories/lw-type-config.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 */

import type { DataSource, Repository } from 'typeorm'
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
  UpdateItemLevelRequest,
} from '@shared/types/longwriting.types'
import { LwProjectSkillTypeEntity } from '../entities/lw-project-skill-type.entity'
import { LwProjectItemTypeEntity } from '../entities/lw-project-item-type.entity'
import { LwProjectSkillLevelEntity } from '../entities/lw-project-skill-level.entity'
import { LwProjectItemLevelEntity } from '../entities/lw-project-item-level.entity'

/**
 * 默认技能类型配置
 */
export const DEFAULT_SKILL_TYPE_CONFIGS: { code: string; name: string; description?: string }[] = [
  { code: 'martial', name: '武功', description: '武术技击类技能' },
  { code: 'magic', name: '法术', description: '法术咒语类技能' },
  { code: 'talent', name: '天赋', description: '与生俱来的特殊能力' },
  { code: 'tech', name: '科技', description: '科技装备类技能' },
  { code: 'other', name: '其他', description: '其他类型技能' },
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
  { code: 'other', name: '其他', description: '其他类型物品' },
]

/**
 * 默认技能等级配置（按技能类型）
 */
export const DEFAULT_SKILL_LEVELS: Record<
  string,
  { code: string; name: string; description: string }[]
> = {
  martial: [
    { code: 'beginner', name: '入门', description: '初窥门径，掌握基本招式' },
    { code: 'skilled', name: '熟练', description: '招式娴熟，可灵活运用' },
    { code: 'expert', name: '精通', description: '融会贯通，威力大增' },
    { code: 'master', name: '大成', description: '炉火纯青，登峰造极' },
    { code: 'perfect', name: '圆满', description: '返璞归真，天人合一' },
  ],
  magic: [
    { code: 'tier1', name: '一阶', description: '初步掌握，可施展基础法术' },
    { code: 'tier2', name: '二阶', description: '法力增强，可施展中等法术' },
    { code: 'tier3', name: '三阶', description: '法力深厚，可施展高等法术' },
    { code: 'tier4', name: '四阶', description: '法力通玄，可施展禁咒' },
    { code: 'tier5', name: '五阶', description: '法力无边，可改天换地' },
  ],
  talent: [
    { code: 'awakened', name: '觉醒', description: '天赋觉醒，初显端倪' },
    { code: 'growing', name: '成长', description: '天赋成长，逐渐增强' },
    { code: 'mature', name: '成熟', description: '天赋成熟，运用自如' },
    { code: 'peak', name: '巅峰', description: '天赋巅峰，无坚不摧' },
  ],
  tech: [
    { code: 'basic', name: '初级', description: '基础型号，功能简单' },
    { code: 'intermediate', name: '中级', description: '性能提升，功能丰富' },
    { code: 'advanced', name: '高级', description: '高度精密，功能强大' },
    { code: 'top', name: '顶级', description: '顶尖科技，无所不能' },
  ],
  other: [
    { code: 'basic', name: '初级', description: '初学者水平' },
    { code: 'intermediate', name: '中级', description: '有一定造诣' },
    { code: 'advanced', name: '高级', description: '高深水平' },
  ],
}

/**
 * 默认物品等级配置（按物品类型）
 */
export const DEFAULT_ITEM_LEVELS: Record<
  string,
  { code: string; name: string; description: string }[]
> = {
  weapon: [
    { code: 'common', name: '凡品', description: '普通凡铁，无特殊光泽' },
    { code: 'good', name: '良品', description: '工艺精良，隐隐有光泽' },
    { code: 'superior', name: '上品', description: '品质上乘，光芒内敛' },
    { code: 'excellent', name: '极品', description: '稀世珍品，光华四射' },
    { code: 'divine', name: '神品', description: '神兵利器，气冲斗牛' },
  ],
  artifact: [
    { code: 'mortal', name: '后天', description: '后天炼制，灵性初显' },
    { code: 'innate', name: '先天', description: '先天灵物，自有灵性' },
    { code: 'spirit', name: '灵器', description: '灵气充盈，可御使飞行' },
    { code: 'immortal', name: '仙器', description: '仙光缭绕，神通广大' },
    { code: 'divine', name: '神器', description: '神威浩荡，镇压天地' },
  ],
  medicine: [
    { code: 'low', name: '下品', description: '药效一般，颜色暗淡' },
    { code: 'medium', name: '中品', description: '药效尚可，色泽纯正' },
    { code: 'high', name: '上品', description: '药效显著，丹纹隐现' },
    { code: 'excellent', name: '极品', description: '药效惊人，丹香四溢' },
    { code: 'peerless', name: '绝品', description: '夺天地造化，引天劫降临' },
  ],
  manual: [
    { code: 'fragment', name: '残本', description: '残缺不全，难窥全貌' },
    { code: 'complete', name: '全本', description: '完整无缺，可修习全功' },
    { code: 'refined', name: '精本', description: '经过高人批注，精义尽显' },
    { code: 'unique', name: '孤本', description: '世间唯一，价值连城' },
  ],
  token: [
    { code: 'ordinary', name: '普通', description: '普通材质，无特殊异象' },
    { code: 'precious', name: '珍贵', description: '材质珍贵，纹路清晰' },
    { code: 'rare', name: '稀有', description: '稀有材质，蕴含能量波动' },
    { code: 'legendary', name: '传说', description: '传说中的信物，承载因果' },
  ],
  other: [
    { code: 'ordinary', name: '普通', description: '普通品质' },
    { code: 'excellent', name: '优秀', description: '品质优秀' },
    { code: 'outstanding', name: '卓越', description: '品质卓越' },
    { code: 'perfect', name: '完美', description: '完美无瑕' },
  ],
}

export class LwTypeConfigRepository {
  private skillTypeRepo: Repository<LwProjectSkillTypeEntity>
  private itemTypeRepo: Repository<LwProjectItemTypeEntity>
  private skillLevelRepo: Repository<LwProjectSkillLevelEntity>
  private itemLevelRepo: Repository<LwProjectItemLevelEntity>

  constructor(private dataSource: DataSource) {
    this.skillTypeRepo = dataSource.getRepository(LwProjectSkillTypeEntity)
    this.itemTypeRepo = dataSource.getRepository(LwProjectItemTypeEntity)
    this.skillLevelRepo = dataSource.getRepository(LwProjectSkillLevelEntity)
    this.itemLevelRepo = dataSource.getRepository(LwProjectItemLevelEntity)
  }

  // ==================== 技能类型配置 ====================

  async getSkillTypeConfigs(projectId: string): Promise<ProjectSkillTypeConfig[]> {
    const rows = await this.skillTypeRepo
      .createQueryBuilder('s')
      .where('s.project_id = :pid', { pid: projectId })
      .orderBy('s.sort_order', 'ASC')
      .getMany()
    return rows.map(r => this.toSkillType(r))
  }

  async getSkillTypeConfig(id: string): Promise<ProjectSkillTypeConfig | null> {
    const row = await this.skillTypeRepo.findOne({ where: { id } as any })
    return row ? this.toSkillType(row) : null
  }

  async getSkillTypeConfigByCode(
    projectId: string,
    code: string,
  ): Promise<ProjectSkillTypeConfig | null> {
    const row = await this.skillTypeRepo.findOne({
      where: { projectId, code } as any,
    })
    return row ? this.toSkillType(row) : null
  }

  async createSkillTypeConfig(
    data: CreateSkillTypeConfigRequest,
  ): Promise<ProjectSkillTypeConfig> {
    const id = this.generateId()
    const now = Date.now()
    const existing = await this.getSkillTypeConfigs(data.projectId)
    const sortOrder = existing.length

    await this.skillTypeRepo.save(
      this.skillTypeRepo.create({
        id,
        projectId: data.projectId,
        code: data.code,
        name: data.name,
        description: data.description ?? null,
        sortOrder,
        createdAt: now,
        updatedAt: now,
      }),
    )

    return {
      id,
      projectId: data.projectId,
      code: data.code,
      name: data.name,
      description: data.description,
      sortOrder,
      createdAt: now,
      updatedAt: now,
    }
  }

  async updateSkillTypeConfig(
    id: string,
    data: UpdateSkillTypeConfigRequest,
  ): Promise<ProjectSkillTypeConfig | null> {
    const row = await this.skillTypeRepo.findOne({ where: { id } as any })
    if (!row) return null
    let changed = false
    if (data.name !== undefined) {
      row.name = data.name
      changed = true
    }
    if (data.description !== undefined) {
      row.description = data.description ?? null
      changed = true
    }
    if (!changed) return this.toSkillType(row)
    row.updatedAt = Date.now()
    const saved = await this.skillTypeRepo.save(row)
    return this.toSkillType(saved)
  }

  async deleteSkillTypeConfig(id: string): Promise<boolean> {
    const config = await this.getSkillTypeConfig(id)
    if (!config) return false
    return this.dataSource.transaction(async manager => {
      await manager
        .getRepository(LwProjectSkillLevelEntity)
        .delete({ projectId: config.projectId, skillTypeCode: config.code } as any)
      const result = await manager
        .getRepository(LwProjectSkillTypeEntity)
        .delete({ id } as any)
      return (result.affected ?? 0) > 0
    })
  }

  async initializeDefaultSkillTypes(projectId: string): Promise<void> {
    for (const config of DEFAULT_SKILL_TYPE_CONFIGS) {
      const existing = await this.getSkillTypeConfigByCode(projectId, config.code)
      if (!existing) {
        await this.createSkillTypeConfig({
          projectId,
          code: config.code,
          name: config.name,
          description: config.description,
        })
        const levels = DEFAULT_SKILL_LEVELS[config.code] || []
        for (const level of levels) {
          await this.createSkillLevel({
            projectId,
            skillTypeCode: config.code,
            code: level.code,
            name: level.name,
            description: level.description,
          })
        }
      }
    }
  }

  // ==================== 物品类型配置 ====================

  async getItemTypeConfigs(projectId: string): Promise<ProjectItemTypeConfig[]> {
    const rows = await this.itemTypeRepo
      .createQueryBuilder('i')
      .where('i.project_id = :pid', { pid: projectId })
      .orderBy('i.sort_order', 'ASC')
      .getMany()
    return rows.map(r => this.toItemType(r))
  }

  async getItemTypeConfig(id: string): Promise<ProjectItemTypeConfig | null> {
    const row = await this.itemTypeRepo.findOne({ where: { id } as any })
    return row ? this.toItemType(row) : null
  }

  async getItemTypeConfigByCode(
    projectId: string,
    code: string,
  ): Promise<ProjectItemTypeConfig | null> {
    const row = await this.itemTypeRepo.findOne({ where: { projectId, code } as any })
    return row ? this.toItemType(row) : null
  }

  async createItemTypeConfig(
    data: CreateItemTypeConfigRequest,
  ): Promise<ProjectItemTypeConfig> {
    const id = this.generateId()
    const now = Date.now()
    const existing = await this.getItemTypeConfigs(data.projectId)
    const sortOrder = existing.length

    await this.itemTypeRepo.save(
      this.itemTypeRepo.create({
        id,
        projectId: data.projectId,
        code: data.code,
        name: data.name,
        description: data.description ?? null,
        sortOrder,
        createdAt: now,
        updatedAt: now,
      }),
    )

    return {
      id,
      projectId: data.projectId,
      code: data.code,
      name: data.name,
      description: data.description,
      sortOrder,
      createdAt: now,
      updatedAt: now,
    }
  }

  async updateItemTypeConfig(
    id: string,
    data: UpdateItemTypeConfigRequest,
  ): Promise<ProjectItemTypeConfig | null> {
    const row = await this.itemTypeRepo.findOne({ where: { id } as any })
    if (!row) return null
    let changed = false
    if (data.name !== undefined) {
      row.name = data.name
      changed = true
    }
    if (data.description !== undefined) {
      row.description = data.description ?? null
      changed = true
    }
    if (!changed) return this.toItemType(row)
    row.updatedAt = Date.now()
    const saved = await this.itemTypeRepo.save(row)
    return this.toItemType(saved)
  }

  async deleteItemTypeConfig(id: string): Promise<boolean> {
    const config = await this.getItemTypeConfig(id)
    if (!config) return false
    return this.dataSource.transaction(async manager => {
      await manager
        .getRepository(LwProjectItemLevelEntity)
        .delete({ projectId: config.projectId, itemTypeCode: config.code } as any)
      const result = await manager
        .getRepository(LwProjectItemTypeEntity)
        .delete({ id } as any)
      return (result.affected ?? 0) > 0
    })
  }

  async initializeDefaultItemTypes(projectId: string): Promise<void> {
    for (const config of DEFAULT_ITEM_TYPE_CONFIGS) {
      const existing = await this.getItemTypeConfigByCode(projectId, config.code)
      if (!existing) {
        await this.createItemTypeConfig({
          projectId,
          code: config.code,
          name: config.name,
          description: config.description,
        })
        const levels = DEFAULT_ITEM_LEVELS[config.code] || []
        for (const level of levels) {
          await this.createItemLevel({
            projectId,
            itemTypeCode: config.code,
            code: level.code,
            name: level.name,
            description: level.description,
          })
        }
      }
    }
  }

  // ==================== 技能等级配置 ====================

  async getSkillLevels(
    projectId: string,
    skillTypeCode: string,
  ): Promise<SkillLevelConfig[]> {
    const rows = await this.skillLevelRepo
      .createQueryBuilder('l')
      .where('l.project_id = :pid', { pid: projectId })
      .andWhere('l.skill_type_code = :code', { code: skillTypeCode })
      .orderBy('l.sort_order', 'ASC')
      .getMany()
    return rows.map(r => this.toSkillLevel(r))
  }

  async getSkillLevel(id: string): Promise<SkillLevelConfig | null> {
    const row = await this.skillLevelRepo.findOne({ where: { id } as any })
    return row ? this.toSkillLevel(row) : null
  }

  async createSkillLevel(data: CreateSkillLevelRequest): Promise<SkillLevelConfig> {
    const id = this.generateId()
    const now = Date.now()
    const existing = await this.getSkillLevels(data.projectId, data.skillTypeCode)
    const sortOrder = existing.length

    await this.skillLevelRepo.save(
      this.skillLevelRepo.create({
        id,
        projectId: data.projectId,
        skillTypeCode: data.skillTypeCode,
        code: data.code,
        name: data.name,
        description: data.description ?? null,
        sortOrder,
        createdAt: now,
        updatedAt: now,
      }),
    )

    return {
      id,
      projectId: data.projectId,
      skillTypeCode: data.skillTypeCode,
      code: data.code,
      name: data.name,
      description: data.description || '',
      sortOrder,
      createdAt: now,
      updatedAt: now,
    }
  }

  async updateSkillLevel(
    id: string,
    data: UpdateSkillLevelRequest,
  ): Promise<SkillLevelConfig | null> {
    const row = await this.skillLevelRepo.findOne({ where: { id } as any })
    if (!row) return null
    let changed = false
    if (data.name !== undefined) {
      row.name = data.name
      changed = true
    }
    if (data.description !== undefined) {
      row.description = data.description ?? null
      changed = true
    }
    if (!changed) return this.toSkillLevel(row)
    row.updatedAt = Date.now()
    const saved = await this.skillLevelRepo.save(row)
    return this.toSkillLevel(saved)
  }

  async deleteSkillLevel(id: string): Promise<boolean> {
    const result = await this.skillLevelRepo.delete({ id } as any)
    return (result.affected ?? 0) > 0
  }

  async reorderSkillLevels(
    _projectId: string,
    _skillTypeCode: string,
    orderedIds: string[],
  ): Promise<void> {
    if (orderedIds.length === 0) return
    const now = Date.now()
    await this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(LwProjectSkillLevelEntity)
      for (let i = 0; i < orderedIds.length; i++) {
        await repo.update({ id: orderedIds[i] } as any, {
          sortOrder: i,
          updatedAt: now,
        })
      }
    })
  }

  // ==================== 物品等级配置 ====================

  async getItemLevels(
    projectId: string,
    itemTypeCode: string,
  ): Promise<ItemLevelConfig[]> {
    const rows = await this.itemLevelRepo
      .createQueryBuilder('l')
      .where('l.project_id = :pid', { pid: projectId })
      .andWhere('l.item_type_code = :code', { code: itemTypeCode })
      .orderBy('l.sort_order', 'ASC')
      .getMany()
    return rows.map(r => this.toItemLevel(r))
  }

  async getItemLevel(id: string): Promise<ItemLevelConfig | null> {
    const row = await this.itemLevelRepo.findOne({ where: { id } as any })
    return row ? this.toItemLevel(row) : null
  }

  async createItemLevel(data: CreateItemLevelRequest): Promise<ItemLevelConfig> {
    const id = this.generateId()
    const now = Date.now()
    const existing = await this.getItemLevels(data.projectId, data.itemTypeCode)
    const sortOrder = existing.length

    await this.itemLevelRepo.save(
      this.itemLevelRepo.create({
        id,
        projectId: data.projectId,
        itemTypeCode: data.itemTypeCode,
        code: data.code,
        name: data.name,
        description: data.description ?? null,
        sortOrder,
        createdAt: now,
        updatedAt: now,
      }),
    )

    return {
      id,
      projectId: data.projectId,
      itemTypeCode: data.itemTypeCode,
      code: data.code,
      name: data.name,
      description: data.description || '',
      sortOrder,
      createdAt: now,
      updatedAt: now,
    }
  }

  async updateItemLevel(
    id: string,
    data: UpdateItemLevelRequest,
  ): Promise<ItemLevelConfig | null> {
    const row = await this.itemLevelRepo.findOne({ where: { id } as any })
    if (!row) return null
    let changed = false
    if (data.name !== undefined) {
      row.name = data.name
      changed = true
    }
    if (data.description !== undefined) {
      row.description = data.description ?? null
      changed = true
    }
    if (!changed) return this.toItemLevel(row)
    row.updatedAt = Date.now()
    const saved = await this.itemLevelRepo.save(row)
    return this.toItemLevel(saved)
  }

  async deleteItemLevel(id: string): Promise<boolean> {
    const result = await this.itemLevelRepo.delete({ id } as any)
    return (result.affected ?? 0) > 0
  }

  async reorderItemLevels(
    _projectId: string,
    _itemTypeCode: string,
    orderedIds: string[],
  ): Promise<void> {
    if (orderedIds.length === 0) return
    const now = Date.now()
    await this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(LwProjectItemLevelEntity)
      for (let i = 0; i < orderedIds.length; i++) {
        await repo.update({ id: orderedIds[i] } as any, {
          sortOrder: i,
          updatedAt: now,
        })
      }
    })
  }

  // ==================== 工具方法 ====================

  private generateId(): string {
    return `typecfg_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }

  private toSkillType(e: LwProjectSkillTypeEntity): ProjectSkillTypeConfig {
    return {
      id: e.id,
      projectId: e.projectId,
      code: e.code,
      name: e.name,
      description: e.description ?? undefined,
      sortOrder: e.sortOrder ?? 0,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }
  }

  private toItemType(e: LwProjectItemTypeEntity): ProjectItemTypeConfig {
    return {
      id: e.id,
      projectId: e.projectId,
      code: e.code,
      name: e.name,
      description: e.description ?? undefined,
      sortOrder: e.sortOrder ?? 0,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }
  }

  private toSkillLevel(e: LwProjectSkillLevelEntity): SkillLevelConfig {
    return {
      id: e.id,
      projectId: e.projectId,
      skillTypeCode: e.skillTypeCode,
      code: e.code,
      name: e.name,
      description: e.description ?? '',
      sortOrder: e.sortOrder ?? 0,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }
  }

  private toItemLevel(e: LwProjectItemLevelEntity): ItemLevelConfig {
    return {
      id: e.id,
      projectId: e.projectId,
      itemTypeCode: e.itemTypeCode,
      code: e.code,
      name: e.name,
      description: e.description ?? '',
      sortOrder: e.sortOrder ?? 0,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }
  }
}
