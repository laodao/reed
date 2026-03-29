/**
 * 长文写作服务
 * @module services/longwriting.service
 * @description 长文写作业务逻辑服务
 */

import { DatabaseManager } from '../database'
import {
  LongWritingProject,
  CreateProjectRequest,
  UpdateProjectRequest,
  StoryOverview,
  StoryCharacter,
  CreateCharacterRequest,
  UpdateCharacterRequest,
  StoryOutline,
  CreateOutlineRequest,
  UpdateOutlineRequest,
  StoryChapter,
  ChapterVersion,
  StoryPlot,
  CreatePlotRequest,
  UpdatePlotRequest
} from '../../shared/types/longwriting.types'

/**
 * 长文写作服务
 */
export class LongWritingService {
  private static instance: LongWritingService
  private db: DatabaseManager

  private constructor() {
    this.db = DatabaseManager.getInstance()
  }

  /**
   * 获取单例实例
   */
  static getInstance(): LongWritingService {
    if (!LongWritingService.instance) {
      LongWritingService.instance = new LongWritingService()
    }
    return LongWritingService.instance
  }

  // ==================== 项目管理 ====================

  /**
   * 获取所有项目
   */
  async getProjects(): Promise<LongWritingProject[]> {
    if (!this.db.lwProjects) {
      throw new Error('数据库未初始化')
    }
    return this.db.lwProjects.getAll()
  }

  /**
   * 获取项目详情
   */
  async getProject(id: string): Promise<LongWritingProject | null> {
    if (!this.db.lwProjects) {
      throw new Error('数据库未初始化')
    }
    return this.db.lwProjects.getById(id)
  }

  /**
   * 创建项目
   */
  async createProject(data: CreateProjectRequest): Promise<LongWritingProject> {
    if (!this.db.lwProjects) {
      throw new Error('数据库未初始化')
    }

    // 创建项目
    const project = this.db.lwProjects.create(data)

    // 如果是故事类，创建对应的概要记录
    if (data.type === 'story' && this.db.lwStoryOverviews) {
      this.db.lwStoryOverviews.create(project.id)
    }

    return project
  }

  /**
   * 更新项目
   */
  async updateProject(id: string, data: UpdateProjectRequest): Promise<LongWritingProject | null> {
    if (!this.db.lwProjects) {
      throw new Error('数据库未初始化')
    }
    return this.db.lwProjects.update(id, data)
  }

  /**
   * 删除项目
   */
  async deleteProject(id: string): Promise<boolean> {
    if (!this.db.lwProjects) {
      throw new Error('数据库未初始化')
    }
    return this.db.lwProjects.delete(id)
  }

  // ==================== 故事概要 ====================

  /**
   * 获取故事概要
   */
  async getStoryOverview(projectId: string): Promise<StoryOverview | null> {
    if (!this.db.lwStoryOverviews) {
      throw new Error('数据库未初始化')
    }
    return this.db.lwStoryOverviews.getByProjectId(projectId)
  }

  /**
   * 更新故事概要
   */
  async updateStoryOverview(
    projectId: string,
    data: Partial<StoryOverview>
  ): Promise<StoryOverview | null> {
    if (!this.db.lwStoryOverviews) {
      throw new Error('数据库未初始化')
    }

    let overview = await this.getStoryOverview(projectId)
    if (!overview) {
      // 如果不存在，创建新的
      overview = this.db.lwStoryOverviews.create(projectId)
    }

    return this.db.lwStoryOverviews.update(overview.id, data)
  }

  /**
   * 锁定/解锁概要
   */
  async lockStoryOverview(projectId: string, locked: boolean): Promise<boolean> {
    if (!this.db.lwStoryOverviews) {
      throw new Error('数据库未初始化')
    }

    const overview = await this.getStoryOverview(projectId)
    if (!overview) return false

    return this.db.lwStoryOverviews.setLocked(overview.id, locked)
  }

  // ==================== 角色管理 ====================

  /**
   * 获取项目的所有角色
   */
  async getCharacters(projectId: string): Promise<StoryCharacter[]> {
    if (!this.db.lwCharacters) {
      throw new Error('数据库未初始化')
    }
    return this.db.lwCharacters.getByProjectId(projectId)
  }

  /**
   * 获取角色详情
   */
  async getCharacter(id: string): Promise<StoryCharacter | null> {
    if (!this.db.lwCharacters) {
      throw new Error('数据库未初始化')
    }
    return this.db.lwCharacters.getById(id)
  }

  /**
   * 创建角色
   */
  async createCharacter(data: CreateCharacterRequest): Promise<StoryCharacter> {
    if (!this.db.lwCharacters) {
      throw new Error('数据库未初始化')
    }
    return this.db.lwCharacters.create(data)
  }

  /**
   * 更新角色
   */
  async updateCharacter(id: string, data: UpdateCharacterRequest): Promise<StoryCharacter | null> {
    if (!this.db.lwCharacters) {
      throw new Error('数据库未初始化')
    }
    return this.db.lwCharacters.update(id, data)
  }

  /**
   * 删除角色
   */
  async deleteCharacter(id: string): Promise<boolean> {
    if (!this.db.lwCharacters) {
      throw new Error('数据库未初始化')
    }
    return this.db.lwCharacters.delete(id)
  }

  /**
   * 关联人像形象
   */
  async linkPortrait(characterId: string, portraitId: string): Promise<StoryCharacter | null> {
    return this.updateCharacter(characterId, { portraitId })
  }

  /**
   * 取消关联人像形象
   */
  async unlinkPortrait(characterId: string): Promise<StoryCharacter | null> {
    return this.updateCharacter(characterId, { portraitId: undefined } as any)
  }

  // ==================== 背景设定 ====================

  /**
   * 获取背景设定
   */
  async getBackground(projectId: string): Promise<any | null> {
    if (!this.db.lwBackgrounds) {
      throw new Error('数据库未初始化')
    }
    let background = this.db.lwBackgrounds.getByProjectId(projectId)
    if (!background) {
      background = this.db.lwBackgrounds.create(projectId)
    }
    return background
  }

  /**
   * 更新背景设定
   */
  async updateBackground(projectId: string, data: any): Promise<any | null> {
    console.log('[LongWritingService] updateBackground 开始, projectId:', projectId, 'data:', data)
    if (!this.db.lwBackgrounds) {
      console.error('[LongWritingService] 数据库未初始化')
      throw new Error('数据库未初始化')
    }
    let background = this.db.lwBackgrounds.getByProjectId(projectId)
    console.log('[LongWritingService] 现有背景:', background)
    if (!background) {
      background = this.db.lwBackgrounds.create(projectId)
      console.log('[LongWritingService] 创建新背景:', background)
    }
    const result = this.db.lwBackgrounds.update(background.id, data)
    console.log('[LongWritingService] 更新结果:', result)
    return result
  }

  // ==================== 地点管理 ====================

  /**
   * 获取项目的所有地点
   */
  async getLocations(projectId: string): Promise<any[]> {
    if (!this.db.lwLocations) {
      throw new Error('数据库未初始化')
    }
    return this.db.lwLocations.getByProjectId(projectId)
  }

  /**
   * 获取地点详情
   */
  async getLocation(id: string): Promise<any | null> {
    if (!this.db.lwLocations) {
      throw new Error('数据库未初始化')
    }
    return this.db.lwLocations.getById(id)
  }

  /**
   * 创建地点
   */
  async createLocation(data: { projectId: string; name: string; type: string; importance: string; description: string }): Promise<any> {
    if (!this.db.lwLocations) {
      throw new Error('数据库未初始化')
    }
    return this.db.lwLocations.create(data)
  }

  /**
   * 更新地点
   */
  async updateLocation(id: string, data: any): Promise<any | null> {
    if (!this.db.lwLocations) {
      throw new Error('数据库未初始化')
    }
    return this.db.lwLocations.update(id, data)
  }

  /**
   * 删除地点
   */
  async deleteLocation(id: string): Promise<boolean> {
    if (!this.db.lwLocations) {
      throw new Error('数据库未初始化')
    }
    return this.db.lwLocations.delete(id)
  }

  // ==================== 情节管理 ====================

  /**
   * 获取项目的所有情节
   */
  async getPlots(projectId: string): Promise<StoryPlot[]> {
    if (!this.db.lwPlots) {
      throw new Error('数据库未初始化')
    }
    return this.db.lwPlots.getByProjectId(projectId)
  }

  /**
   * 获取情节详情
   */
  async getPlot(id: string): Promise<StoryPlot | null> {
    if (!this.db.lwPlots) {
      throw new Error('数据库未初始化')
    }
    return this.db.lwPlots.getById(id)
  }

  /**
   * 创建情节
   */
  async createPlot(data: CreatePlotRequest): Promise<StoryPlot> {
    if (!this.db.lwPlots) {
      throw new Error('数据库未初始化')
    }
    return this.db.lwPlots.create(data)
  }

  /**
   * 批量创建情节（用于 AI 生成后批量插入）
   */
  async batchCreatePlots(projectId: string, plots: { title: string; summary: string; involvedCharacters?: string[] }[]): Promise<StoryPlot[]> {
    if (!this.db.lwPlots) {
      throw new Error('数据库未初始化')
    }
    return this.db.lwPlots.batchCreate(projectId, plots)
  }

  /**
   * 更新情节
   */
  async updatePlot(id: string, data: UpdatePlotRequest): Promise<StoryPlot | null> {
    if (!this.db.lwPlots) {
      throw new Error('数据库未初始化')
    }
    return this.db.lwPlots.update(id, data)
  }

  /**
   * 重排序情节
   */
  async reorderPlots(projectId: string, orderList: { id: string; order: number }[]): Promise<boolean> {
    if (!this.db.lwPlots) {
      throw new Error('数据库未初始化')
    }
    return this.db.lwPlots.reorderPlots(projectId, orderList)
  }

  /**
   * 删除情节
   */
  async deletePlot(id: string): Promise<boolean> {
    if (!this.db.lwPlots) {
      throw new Error('数据库未初始化')
    }
    return this.db.lwPlots.delete(id)
  }

  /**
   * 删除项目的所有情节
   */
  async deletePlotsByProjectId(projectId: string): Promise<boolean> {
    if (!this.db.lwPlots) {
      throw new Error('数据库未初始化')
    }
    return this.db.lwPlots.deleteByProjectId(projectId)
  }

  /**
   * 获取项目的情节数量
   */
  async getPlotCount(projectId: string): Promise<number> {
    if (!this.db.lwPlots) {
      throw new Error('数据库未初始化')
    }
    return this.db.lwPlots.countByProjectId(projectId)
  }

  // ==================== 角色关系 ====================

  /**
   * 获取角色的所有关系
   */
  async getCharacterRelations(characterId: string): Promise<any[]> {
    if (!this.db.db) {
      throw new Error('数据库未初始化')
    }
    const stmt = this.db.db.prepare(`
      SELECT * FROM lw_character_relations WHERE character_id = ?
    `)
    return stmt.all(characterId) as any[]
  }

  /**
   * 创建角色关系
   */
  async createCharacterRelation(data: { characterId: string; relatedCharacterId: string; relationType: string; relationDescription: string }): Promise<any> {
    if (!this.db.db) {
      throw new Error('数据库未初始化')
    }
    const id = `rel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const now = Date.now()

    const stmt = this.db.db.prepare(`
      INSERT INTO lw_character_relations (id, character_id, related_character_id, relation_type, relation_description, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    stmt.run(id, data.characterId, data.relatedCharacterId, data.relationType, data.relationDescription, now)

    return { id, ...data, createdAt: now }
  }

  /**
   * 删除角色关系
   */
  async deleteCharacterRelation(id: string): Promise<boolean> {
    if (!this.db.db) {
      throw new Error('数据库未初始化')
    }
    const stmt = this.db.db.prepare('DELETE FROM lw_character_relations WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }

  // ==================== 技能管理 ====================

  /**
   * 获取项目的所有技能
   */
  async getSkills(projectId: string): Promise<any[]> {
    if (!this.db.lwSkills) {
      throw new Error('数据库未初始化')
    }
    return this.db.lwSkills.getByProjectId(projectId)
  }

  /**
   * 获取技能详情
   */
  async getSkill(id: string): Promise<any | null> {
    if (!this.db.lwSkills) {
      throw new Error('数据库未初始化')
    }
    return this.db.lwSkills.getById(id)
  }

  /**
   * 创建技能
   */
  async createSkill(data: { projectId: string; name: string; type: string; level: string; description: string; system: string; characterIds: string[] }): Promise<any> {
    if (!this.db.lwSkills) {
      throw new Error('数据库未初始化')
    }
    return this.db.lwSkills.create(data)
  }

  /**
   * 更新技能
   */
  async updateSkill(id: string, data: any): Promise<any | null> {
    if (!this.db.lwSkills) {
      throw new Error('数据库未初始化')
    }
    return this.db.lwSkills.update(id, data)
  }

  /**
   * 删除技能
   */
  async deleteSkill(id: string): Promise<boolean> {
    if (!this.db.lwSkills) {
      throw new Error('数据库未初始化')
    }
    return this.db.lwSkills.delete(id)
  }

  // ==================== 物品管理 ====================

  /**
   * 获取项目的所有物品
   */
  async getItems(projectId: string): Promise<any[]> {
    if (!this.db.lwItems) {
      throw new Error('数据库未初始化')
    }
    return this.db.lwItems.getByProjectId(projectId)
  }

  /**
   * 获取物品详情
   */
  async getItem(id: string): Promise<any | null> {
    if (!this.db.lwItems) {
      throw new Error('数据库未初始化')
    }
    return this.db.lwItems.getById(id)
  }

  /**
   * 创建物品
   */
  async createItem(data: { projectId: string; name: string; type: string; level: string; description: string; ownerId?: string }): Promise<any> {
    if (!this.db.lwItems) {
      throw new Error('数据库未初始化')
    }
    return this.db.lwItems.create(data)
  }

  /**
   * 更新物品
   */
  async updateItem(id: string, data: any): Promise<any | null> {
    if (!this.db.lwItems) {
      throw new Error('数据库未初始化')
    }
    return this.db.lwItems.update(id, data)
  }

  /**
   * 删除物品
   */
  async deleteItem(id: string): Promise<boolean> {
    if (!this.db.lwItems) {
      throw new Error('数据库未初始化')
    }
    return this.db.lwItems.delete(id)
  }

  // ==================== 素材管理 ====================

  /**
   * 获取项目的所有素材
   */
  async getMaterials(projectId: string): Promise<any[]> {
    if (!this.db.lwMaterials) {
      throw new Error('数据库未初始化')
    }
    return this.db.lwMaterials.getByProjectId(projectId)
  }

  /**
   * 获取素材详情
   */
  async getMaterial(id: string): Promise<any | null> {
    if (!this.db.lwMaterials) {
      throw new Error('数据库未初始化')
    }
    return this.db.lwMaterials.getById(id)
  }

  /**
   * 创建素材
   */
  async createMaterial(data: { projectId: string; name: string; type: string; source?: string; content?: string; status?: string }): Promise<any> {
    if (!this.db.lwMaterials) {
      throw new Error('数据库未初始化')
    }
    return this.db.lwMaterials.create(data as any)
  }

  /**
   * 更新素材
   */
  async updateMaterial(id: string, data: any): Promise<any | null> {
    if (!this.db.lwMaterials) {
      throw new Error('数据库未初始化')
    }
    return this.db.lwMaterials.update(id, data)
  }

  /**
   * 更新素材状态
   */
  async updateMaterialStatus(id: string, status: string, errorMessage?: string): Promise<boolean> {
    if (!this.db.lwMaterials) {
      throw new Error('数据库未初始化')
    }
    return this.db.lwMaterials.updateStatus(id, status as any, errorMessage)
  }

  /**
   * 增加素材重试计数
   */
  async incrementMaterialRetryCount(id: string): Promise<number> {
    if (!this.db.lwMaterials) {
      throw new Error('数据库未初始化')
    }
    return this.db.lwMaterials.incrementRetryCount(id)
  }

  /**
   * 删除素材
   */
  async deleteMaterial(id: string): Promise<boolean> {
    if (!this.db.lwMaterials) {
      throw new Error('数据库未初始化')
    }
    return this.db.lwMaterials.delete(id)
  }

  // ==================== 大纲管理 ====================

  /**
   * 获取项目的大纲树（返回平铺列表，前端自行构建树）
   */
  async getOutlineTree(projectId: string): Promise<StoryOutline[]> {
    if (!this.db.lwOutlines) {
      throw new Error('数据库未初始化')
    }
    // 返回平铺列表，让前端根据 parentId 构建树
    return this.db.lwOutlines.getByProjectId(projectId)
  }

  /**
   * 获取大纲节点详情
   */
  async getOutline(id: string): Promise<StoryOutline | null> {
    if (!this.db.lwOutlines) {
      throw new Error('数据库未初始化')
    }
    return this.db.lwOutlines.getById(id)
  }

  /**
   * 创建大纲节点
   */
  async createOutline(data: CreateOutlineRequest): Promise<StoryOutline> {
    if (!this.db.lwOutlines) {
      throw new Error('数据库未初始化')
    }
    return this.db.lwOutlines.create(data)
  }

  /**
   * 更新大纲节点
   */
  async updateOutline(id: string, data: UpdateOutlineRequest): Promise<StoryOutline | null> {
    if (!this.db.lwOutlines) {
      throw new Error('数据库未初始化')
    }
    return this.db.lwOutlines.update(id, data)
  }

  /**
   * 删除大纲节点
   */
  async deleteOutline(id: string): Promise<boolean> {
    if (!this.db.lwOutlines) {
      throw new Error('数据库未初始化')
    }
    return this.db.lwOutlines.delete(id)
  }

  /**
   * 移动大纲节点
   */
  async moveOutline(id: string, newParentId: string | null): Promise<boolean> {
    if (!this.db.lwOutlines) {
      throw new Error('数据库未初始化')
    }
    return this.db.lwOutlines.moveTo(id, newParentId)
  }

  // ==================== 章节管理 ====================

  /**
   * 获取章节内容
   */
  async getChapter(outlineId: string): Promise<StoryChapter | null> {
    if (!this.db.lwChapters) {
      throw new Error('数据库未初始化')
    }
    return this.db.lwChapters.getByOutlineId(outlineId)
  }

  /**
   * 保存章节内容
   */
  async saveChapter(outlineId: string, content: string): Promise<StoryChapter> {
    if (!this.db.lwChapters) {
      throw new Error('数据库未初始化')
    }

    let chapter = await this.getChapter(outlineId)
    if (!chapter) {
      chapter = this.db.lwChapters.create(outlineId, content)
    } else {
      chapter = this.db.lwChapters.updateContent(chapter.id, content)!
    }

    // 创建版本记录
    this.db.lwChapters.createVersion(chapter.id, content, 'manual')

    return chapter
  }

  /**
   * 获取章节版本列表
   */
  async getChapterVersions(chapterId: string): Promise<ChapterVersion[]> {
    if (!this.db.lwChapters) {
      throw new Error('数据库未初始化')
    }
    return this.db.lwChapters.getVersions(chapterId)
  }

  /**
   * 恢复到指定版本
   */
  async restoreChapterVersion(chapterId: string, versionId: string): Promise<StoryChapter | null> {
    if (!this.db.lwChapters) {
      throw new Error('数据库未初始化')
    }
    return this.db.lwChapters.restoreVersion(chapterId, versionId)
  }

  /**
   * 锁定版本
   */
  async lockChapterVersion(versionId: string): Promise<boolean> {
    if (!this.db.lwChapters) {
      throw new Error('数据库未初始化')
    }
    return this.db.lwChapters.lockVersion(versionId)
  }

  // ==================== AI 生成相关 ====================

  /**
   * 生成故事概要（AI）
   * TODO: 实现 AI 生成逻辑
   */
  async generateStoryOverview(projectId: string, input: string): Promise<StoryOverview> {
    // TODO: 调用 AI API 生成概要
    throw new Error('AI 生成功能尚未实现')
  }

  /**
   * 生成大纲（AI）
   * TODO: 实现 AI 生成逻辑
   */
  async generateOutline(projectId: string, description: string): Promise<StoryOutline[]> {
    // TODO: 调用 AI API 生成大纲
    throw new Error('AI 生成功能尚未实现')
  }

  /**
   * 生成章节内容（AI）
   * TODO: 实现 AI 生成逻辑
   */
  async generateChapter(outlineId: string, targetWords?: number): Promise<StoryChapter> {
    // TODO: 调用 AI API 生成章节内容
    throw new Error('AI 生成功能尚未实现')
  }
}

// 导出单例获取函数
export const getLongWritingService = (): LongWritingService => LongWritingService.getInstance()