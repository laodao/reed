/**
 * 长文写作服务
 * @module core/packs/longwriting/services/longwriting.service
 * @description 长文写作业务逻辑服务
 */

import * as fs from 'fs'
import * as path from 'path'
import { getCoreDatabaseManager, type ICoreDatabaseManager } from '@core/database/database-manager.interface'
import { getPathProvider } from '@core/interfaces/path.interface'
import { toRelativeAssetPath, resolveAssetPath } from '@core/utils/asset-path'
import type { OutlineDocOrder, OutlineNodeLike } from '@core/platform/services/longwriting/outline-order'

/** 文档序快照辅助（章号级联用）：与 outline-order 唯一权威保持单一来源 */
async function buildDocOrder(nodes: OutlineNodeLike[]): Promise<OutlineDocOrder> {
  const { buildOutlineDocOrder } = await import('@core/platform/services/longwriting/outline-order')
  return buildOutlineDocOrder(nodes)
}
import type { SetCoverSource } from '@shared/types/longwriting.types'
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
  UpdatePlotRequest,
  LongWritingGlobalSettings,
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
  StoryFaction,
  FactionType,
  CreateFactionRequest,
  UpdateFactionRequest,
  StoryMap,
  CreateMapRequest,
  UpdateMapRequest,
  MapGeneratedData,
  ChapterPrewrite,
  CreatePrewriteRequest,
  StoryMemory,
  CreateMemoryRequest,
  UpdateMemoryRequest,
  EntityStateSnapshot,
  EntityType,
  CreateEntityStateSnapshotRequest,
  UpdateEntityStateSnapshotRequest,
  SnapshotStats
} from '@shared/types/longwriting.types'

/**
 * 长文写作服务
 */
export class LongWritingService {
  private static instance: LongWritingService
  private db: ICoreDatabaseManager

  private constructor() {
    this.db = getCoreDatabaseManager()
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
    return await this.db.lwProjects.getAll()
  }

  /**
   * 获取项目详情
   */
  async getProject(id: string): Promise<LongWritingProject | null> {
    if (!this.db.lwProjects) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwProjects.getById(id)
  }

  /**
   * 创建项目
   */
  async createProject(data: CreateProjectRequest): Promise<LongWritingProject> {
    if (!this.db.lwProjects) {
      throw new Error('数据库未初始化')
    }

    // 创建项目
    const project = await this.db.lwProjects.create(data)

    // §G（2026-09-20）：初始化 wizard_state——读方虽容错 NULL，但写方
    // （mutateWizardState 等）依赖已存在行；历史项目曾因此为 NULL
    if (!project.wizardState) {
      await this.db.lwProjects.update(project.id, { wizardState: {} })
      project.wizardState = {}
    }

    // 如果是故事类，创建对应的概要记录
    if (data.type === 'story' && this.db.lwStoryOverviews) {
      await this.db.lwStoryOverviews.create(project.id)
    }

    // 初始化项目的默认类型配置
    if (this.db.lwTypeConfig) {
      await this.db.lwTypeConfig.initializeDefaultSkillTypes(project.id)
      await this.db.lwTypeConfig.initializeDefaultItemTypes(project.id)
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
    return await this.db.lwProjects.update(id, data)
  }

  /**
   * 删除项目
   */
  async deleteProject(id: string): Promise<boolean> {
    if (!this.db.lwProjects) {
      throw new Error('数据库未初始化')
    }
    const ok = await this.db.lwProjects.delete(id)
    // M8 级联清理：agent_sessions/trajectories 残留会造成工作台幽灵会话（32 号登记）
    try {
      const { purgeAgentDataForScopes } = await import('@core/platform/agent-runtime/memory/session-purge')
      await purgeAgentDataForScopes(this.db.dataSource, [
        { conversationId: `lw-agent:${id}`, scopeKey: `lw-agent:${id}` },
      ])
    } catch (e) {
      console.error('[longwriting] Agent 数据级联清理失败（不影响删除）:', e)
    }
    // 复核修复：图谱边/事件/状态切片/伏笔/自定义实体/向量索引建表无 FK，
    // 不显式清理会永久残留（基础表走 DB 层 FK CASCADE，此处只管伴生表）
    try {
      const { LwPurgeService } = await import('@core/platform/services/longwriting/purge.service')
      const purge = new LwPurgeService(this.db)
      purge.logResults('deleteProject', await purge.purgeProjectData(id))
    } catch (e) {
      console.error('[longwriting] 伴生数据级联清理失败（不影响删除）:', e)
    }
    // 封面文件目录（项目自持副本）随项目删除
    try {
      await fs.promises.rm(this.coverDir(id), { recursive: true, force: true })
    } catch (e) {
      console.error('[longwriting] 封面目录清理失败（不影响删除）:', e)
    }
    return ok
  }

  // ==================== 项目封面 ====================

  /** 允许作为封面的图片扩展名 → mime（落 EPUB/PDF 时按扩展名推断） */
  private static readonly COVER_IMAGE_MIMES: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
  }

  private static readonly COVER_MAX_BYTES = 10 * 1024 * 1024

  /** 封面文件目录：<dataPath>/longwriting/covers/<projectId>/（项目自持副本） */
  private coverDir(projectId: string): string {
    return path.join(getPathProvider().getDataPath(), 'longwriting', 'covers', projectId)
  }

  /**
   * 设置项目封面（上传 / 系统资产选图 / 清除）。
   * 无论来源，文件统一拷贝为项目自持副本落盘 covers/<projectId>/，
   * DB 存相对 dataPath 路径（资产被删封面不失效）。
   */
  async setProjectCover(projectId: string, source: SetCoverSource): Promise<LongWritingProject | null> {
    if (!this.db.lwProjects) {
      throw new Error('数据库未初始化')
    }
    const project = await this.db.lwProjects.getById(projectId)
    if (!project) {
      throw new Error('项目不存在')
    }

    if (source.type === 'clear') {
      const prev = project.coverPath
      const updated = await this.db.lwProjects.update(projectId, { coverPath: null })
      this.removeCoverFile(prev)
      return updated
    }

    let bytes: Buffer
    let ext: string
    if (source.type === 'upload') {
      bytes = Buffer.from(source.base64, 'base64')
      if (bytes.length === 0) throw new Error('图片内容为空')
      if (bytes.length > LongWritingService.COVER_MAX_BYTES) throw new Error('图片大小不能超过 10MB')
      ext = path.extname(source.fileName || '').toLowerCase()
      if (!LongWritingService.COVER_IMAGE_MIMES[ext]) throw new Error('仅支持 jpg/png/webp/gif 格式图片')
    } else {
      const { getAssetService } = await import('@core/platform/assets')
      const asset = await getAssetService().getAsset(source.assetId)
      if (!asset) throw new Error('资产不存在')
      if (asset.kind !== 'file' || !asset.storagePath) throw new Error('该资产不是文件型图片')
      ext = path.extname(asset.storagePath).toLowerCase()
      if (!LongWritingService.COVER_IMAGE_MIMES[ext]) throw new Error('该资产不是支持的图片格式')
      bytes = await fs.promises.readFile(resolveAssetPath(asset.storagePath))
    }

    const dir = this.coverDir(projectId)
    await fs.promises.mkdir(dir, { recursive: true })
    const absPath = path.join(dir, `cover_${Date.now()}${ext}`)
    await fs.promises.writeFile(absPath, bytes)

    const prev = project.coverPath
    const updated = await this.db.lwProjects.update(projectId, { coverPath: toRelativeAssetPath(absPath) })
    this.removeCoverFile(prev)
    return updated
  }

  /** best-effort 删除旧封面文件（只清理本项目 covers 目录内的自持副本，不碰外部路径） */
  private removeCoverFile(coverPath: string | null | undefined): void {
    if (!coverPath) return
    try {
      const abs = resolveAssetPath(coverPath)
      const rel = path.relative(this.coverRoot(), abs)
      if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return
      if (fs.existsSync(abs)) fs.unlinkSync(abs)
    } catch (e) {
      console.warn('[longwriting] 旧封面文件清理失败（不影响）:', e)
    }
  }

  private coverRoot(): string {
    return path.join(getPathProvider().getDataPath(), 'longwriting', 'covers')
  }

  // ==================== 故事概要 ====================

  /**
   * 获取故事概要
   */
  async getStoryOverview(projectId: string): Promise<StoryOverview | null> {
    if (!this.db.lwStoryOverviews) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwStoryOverviews.getByProjectId(projectId)
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
      overview = await this.db.lwStoryOverviews.create(projectId)
    }

    return await this.db.lwStoryOverviews.update(overview.id, data)
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

    return await this.db.lwStoryOverviews.setLocked(overview.id, locked)
  }

  // ==================== 角色管理 ====================

  /**
   * 获取项目的所有角色
   */
  async getCharacters(projectId: string): Promise<StoryCharacter[]> {
    if (!this.db.lwCharacters) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwCharacters.getByProjectId(projectId)
  }

  /**
   * 获取角色详情
   */
  async getCharacter(id: string): Promise<StoryCharacter | null> {
    if (!this.db.lwCharacters) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwCharacters.getById(id)
  }

  /**
   * 创建角色
   */
  async createCharacter(data: CreateCharacterRequest): Promise<StoryCharacter> {
    if (!this.db.lwCharacters) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwCharacters.create(data)
  }

  /**
   * 更新角色
   */
  async updateCharacter(id: string, data: UpdateCharacterRequest): Promise<StoryCharacter | null> {
    if (!this.db.lwCharacters) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwCharacters.update(id, data)
  }

  /**
   * 删除角色
   */
  async deleteCharacter(id: string): Promise<boolean> {
    if (!this.db.lwCharacters) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwCharacters.delete(id)
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
    let background = await this.db.lwBackgrounds.getByProjectId(projectId)
    if (!background) {
      background = await this.db.lwBackgrounds.create(projectId)
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
    let background = await this.db.lwBackgrounds.getByProjectId(projectId)
    console.log('[LongWritingService] 现有背景:', background)
    if (!background) {
      background = await this.db.lwBackgrounds.create(projectId)
      console.log('[LongWritingService] 创建新背景:', background)
    }
    const result = await this.db.lwBackgrounds.update(background.id, data)
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
    return await this.db.lwLocations.getByProjectId(projectId)
  }

  /**
   * 获取地点详情
   */
  async getLocation(id: string): Promise<any | null> {
    if (!this.db.lwLocations) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwLocations.getById(id)
  }

  /**
   * 创建地点
   */
  async createLocation(data: { projectId: string; name: string; type: string; importance: string; description: string; mapId?: string }): Promise<any> {
    if (!this.db.lwLocations) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwLocations.create(data)
  }

  /**
   * 更新地点
   */
  async updateLocation(id: string, data: any): Promise<any | null> {
    if (!this.db.lwLocations) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwLocations.update(id, data)
  }

  /**
   * 删除地点
   */
  async deleteLocation(id: string): Promise<boolean> {
    if (!this.db.lwLocations) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwLocations.delete(id)
  }

  // ==================== 势力管理 ====================

  /**
   * 获取项目的所有势力
   */
  async getFactions(projectId: string): Promise<StoryFaction[]> {
    if (!this.db.lwFactions) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwFactions.getByProjectId(projectId)
  }

  /**
   * 根据势力类型获取势力
   */
  async getFactionsByType(projectId: string, factionType: FactionType): Promise<StoryFaction[]> {
    if (!this.db.lwFactions) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwFactions.getByProjectIdAndType(projectId, factionType)
  }

  /**
   * 获取势力详情
   */
  async getFaction(id: string): Promise<StoryFaction | null> {
    if (!this.db.lwFactions) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwFactions.getById(id)
  }

  /**
   * 创建势力
   */
  async createFaction(data: CreateFactionRequest): Promise<StoryFaction> {
    if (!this.db.lwFactions) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwFactions.create({
      projectId: data.projectId,
      factionType: data.factionType,
      name: data.name,
      locationId: data.locationId,
      description: data.description ?? ''
    })
  }

  /**
   * 更新势力
   */
  async updateFaction(id: string, data: UpdateFactionRequest): Promise<StoryFaction | null> {
    if (!this.db.lwFactions) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwFactions.update(id, data as Partial<StoryFaction>)
  }

  /**
   * 删除势力
   */
  async deleteFaction(id: string): Promise<boolean> {
    if (!this.db.lwFactions) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwFactions.delete(id)
  }

  /**
   * 重排序势力
   */
  async reorderFactions(orderList: { id: string; order: number }[]): Promise<boolean> {
    if (!this.db.lwFactions) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwFactions.updateSortOrder(orderList)
  }

  // ==================== 情节管理 ====================

  /**
   * 获取项目的所有情节
   */
  async getPlots(projectId: string): Promise<StoryPlot[]> {
    if (!this.db.lwPlots) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwPlots.getByProjectId(projectId)
  }

  /**
   * 获取情节详情
   */
  async getPlot(id: string): Promise<StoryPlot | null> {
    if (!this.db.lwPlots) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwPlots.getById(id)
  }

  /**
   * 创建情节
   */
  async createPlot(data: CreatePlotRequest): Promise<StoryPlot> {
    if (!this.db.lwPlots) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwPlots.create(data)
  }

  /**
   * 批量创建情节（用于 AI 生成后批量插入）
   */
  async batchCreatePlots(projectId: string, plots: { title: string; summary: string; involvedCharacters?: string[] }[]): Promise<StoryPlot[]> {
    if (!this.db.lwPlots) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwPlots.batchCreate(projectId, plots)
  }

  /**
   * 更新情节
   */
  async updatePlot(id: string, data: UpdatePlotRequest): Promise<StoryPlot | null> {
    if (!this.db.lwPlots) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwPlots.update(id, data)
  }

  /**
   * 重排序情节
   */
  async reorderPlots(projectId: string, orderList: { id: string; order: number }[]): Promise<boolean> {
    if (!this.db.lwPlots) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwPlots.reorderPlots(projectId, orderList)
  }

  /**
   * 删除情节
   */
  async deletePlot(id: string): Promise<boolean> {
    if (!this.db.lwPlots) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwPlots.delete(id)
  }

  /**
   * 删除项目的所有情节
   */
  async deletePlotsByProjectId(projectId: string): Promise<boolean> {
    if (!this.db.lwPlots) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwPlots.deleteByProjectId(projectId)
  }

  /**
   * 获取项目的情节数量
   */
  async getPlotCount(projectId: string): Promise<number> {
    if (!this.db.lwPlots) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwPlots.countByProjectId(projectId)
  }

  // ==================== 角色关系 ====================

  /**
   * 获取角色的所有关系
   */
  async getCharacterRelations(characterId: string): Promise<any[]> {
    if (!this.db.lwCharacterRelations) {
      throw new Error('数据库未初始化')
    }
    return this.db.lwCharacterRelations.getByCharacterId(characterId)
  }

  /**
   * 创建角色关系
   */
  async createCharacterRelation(data: { characterId: string; relatedCharacterId: string; relationType: string; relationDescription: string }): Promise<any> {
    if (!this.db.lwCharacterRelations) {
      throw new Error('数据库未初始化')
    }
    return this.db.lwCharacterRelations.create(data)
  }

  /**
   * 删除角色关系
   */
  async deleteCharacterRelation(id: string): Promise<boolean> {
    if (!this.db.lwCharacterRelations) {
      throw new Error('数据库未初始化')
    }
    return this.db.lwCharacterRelations.delete(id)
  }

  // ==================== 技能管理 ====================

  /**
   * 获取项目的所有技能
   */
  async getSkills(projectId: string): Promise<any[]> {
    if (!this.db.lwSkills) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwSkills.getByProjectId(projectId)
  }

  /**
   * 获取技能详情
   */
  async getSkill(id: string): Promise<any | null> {
    if (!this.db.lwSkills) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwSkills.getById(id)
  }

  /**
   * 创建技能
   */
  async createSkill(data: { projectId: string; name: string; type: string; level: string; description: string; system: string; characterIds: string[] }): Promise<any> {
    if (!this.db.lwSkills) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwSkills.create(data)
  }

  /**
   * 更新技能
   */
  async updateSkill(id: string, data: any): Promise<any | null> {
    if (!this.db.lwSkills) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwSkills.update(id, data)
  }

  /**
   * 删除技能
   */
  async deleteSkill(id: string): Promise<boolean> {
    if (!this.db.lwSkills) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwSkills.delete(id)
  }

  // ==================== 物品管理 ====================

  /**
   * 获取项目的所有物品
   */
  async getItems(projectId: string): Promise<any[]> {
    if (!this.db.lwItems) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwItems.getByProjectId(projectId)
  }

  /**
   * 获取物品详情
   */
  async getItem(id: string): Promise<any | null> {
    if (!this.db.lwItems) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwItems.getById(id)
  }

  /**
   * 创建物品
   */
  async createItem(data: { projectId: string; name: string; type: string; level: string; description: string; ownerId?: string }): Promise<any> {
    if (!this.db.lwItems) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwItems.create(data)
  }

  /**
   * 更新物品
   */
  async updateItem(id: string, data: any): Promise<any | null> {
    if (!this.db.lwItems) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwItems.update(id, data)
  }

  /**
   * 删除物品
   */
  async deleteItem(id: string): Promise<boolean> {
    if (!this.db.lwItems) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwItems.delete(id)
  }

  // ==================== 素材管理 ====================

  /**
   * 获取项目的所有素材
   */
  async getMaterials(projectId: string): Promise<any[]> {
    if (!this.db.lwMaterials) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwMaterials.getByProjectId(projectId)
  }

  /**
   * 获取素材详情
   */
  async getMaterial(id: string): Promise<any | null> {
    if (!this.db.lwMaterials) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwMaterials.getById(id)
  }

  /**
   * 创建素材
   */
  async createMaterial(data: { projectId: string; name: string; type: string; source?: string; content?: string; status?: string }): Promise<any> {
    if (!this.db.lwMaterials) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwMaterials.create(data as any)
  }

  /**
   * 更新素材
   */
  async updateMaterial(id: string, data: any): Promise<any | null> {
    if (!this.db.lwMaterials) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwMaterials.update(id, data)
  }

  /**
   * 更新素材状态
   */
  async updateMaterialStatus(id: string, status: string, errorMessage?: string): Promise<boolean> {
    if (!this.db.lwMaterials) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwMaterials.updateStatus(id, status as any, errorMessage)
  }

  /**
   * 增加素材重试计数
   */
  async incrementMaterialRetryCount(id: string): Promise<number> {
    if (!this.db.lwMaterials) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwMaterials.incrementRetryCount(id)
  }

  /**
   * 删除素材
   */
  async deleteMaterial(id: string): Promise<boolean> {
    if (!this.db.lwMaterials) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwMaterials.delete(id)
  }

  // ==================== 大纲管理 ====================

  /**
   * 获取项目的大纲树（返回平铺列表，前端自行构建树）
   * 同时附加预写确认状态
   */
  async getOutlineTree(projectId: string): Promise<StoryOutline[]> {
    if (!this.db.lwOutlines) {
      throw new Error('数据库未初始化')
    }
    // 获取大纲列表
    const outlines = await this.db.lwOutlines.getByProjectId(projectId)

    // 批量获取预写状态
    if (this.db.lwPrewrites && outlines.length > 0) {
      const outlineIds = outlines.map(o => o.id)
      const prewrites = await this.db.lwPrewrites.getByOutlineIds(outlineIds)

      // 附加预写确认状态到大纲节点
      for (const outline of outlines) {
        const prewrite = prewrites.get(outline.id)
        outline.prewriteConfirmed = prewrite?.isConfirmed ?? false
      }
    }

    return outlines
  }

  /**
   * 获取大纲节点详情
   */
  async getOutline(id: string): Promise<StoryOutline | null> {
    if (!this.db.lwOutlines) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwOutlines.getById(id)
  }

  /**
   * 创建大纲节点
   */
  async createOutline(data: CreateOutlineRequest): Promise<StoryOutline> {
    if (!this.db.lwOutlines) {
      throw new Error('数据库未初始化')
    }
    // 章号级联（天下捕快实跑修复）：插入节点会使后续章节号整体后移，
    // 伴生数据（事件/快照/伏笔/边有效期/预写卡头）必须跟着搬，否则按章号
    // 键挂的检查从此系统性错位。变更前后各取一次文档序做 diff。
    const before = await this.docOrderSnapshot(data.projectId)
    // 建节点本身的失败原样抛（级联不背锅）
    const created: StoryOutline = await this.db.lwOutlines.create(data)
    // 级联失败不回滚建节点（节点已落库），但必须留全栈日志——章号错位是沉默毒药
    try {
      if (before) await this.cascadeChapterNumbers(before.projectId, before.order)
    } catch (e: any) {
      console.error('[LongWritingService] createOutline 章号级联失败:', e && (e.stack || e.message || e))
    }
    return created
  }

  /**
   * 更新大纲节点
   */
  async updateOutline(id: string, data: UpdateOutlineRequest): Promise<StoryOutline | null> {
    if (!this.db.lwOutlines) {
      throw new Error('数据库未初始化')
    }
    // 仅结构字段（父节点/兄弟序/节点类型）会影响文档序章号；纯改名/改概要跳过级联
    const structureChanged = data.parentId !== undefined || data.orderIndex !== undefined || data.nodeType !== undefined
    const before = structureChanged ? await this.docOrderSnapshot((await this.db.lwOutlines.getById(id))?.projectId) : null
    const updated = await this.db.lwOutlines.update(id, data)
    if (before) await this.cascadeChapterNumbers((updated as any)?.projectId ?? (await this.db.lwOutlines.getById(id))?.projectId, before)
    return updated
  }

  /**
   * 删除大纲节点
   */
  /**
   * 删除大纲节点（§B 级联版，2026-09-20）：删除节点及其全部后代，并级联清理
   * 章节正文/版本/预写/状态摘要/大纲关联（角色/条目/地点）。
   * 任一后代章节有正文且未 force → needsConfirm=true（不删，交 UI 二次确认）。
   * 实测背景：裸删除曾让残留行令后续章法写作炸 FK（3 次原始 SqliteError）。
   */
  async deleteOutline(
    id: string,
    force = false,
  ): Promise<{ deleted: boolean; needsConfirm: boolean; chapters: string[]; projectId: string | null; chapterNos: number[] }> {
    if (!this.db.lwOutlines || !this.db.dataSource) {
      throw new Error('数据库未初始化')
    }
    const empty = { deleted: false, needsConfirm: false, chapters: [], projectId: null, chapterNos: [] as number[] }
    const node = await this.db.lwOutlines.getById(id)
    if (!node) return { ...empty, deleted: false }
    const all = (await this.db.lwOutlines.getByProjectId(node.projectId)) || []

    // 收集子树（节点自身 + 全部后代）
    const ids: string[] = [id]
    const collect = (parentId: string): void => {
      for (const o of all) {
        if (o.parentId === parentId && !ids.includes(o.id)) {
          ids.push(o.id)
          collect(o.id)
        }
      }
    }
    collect(id)

    const chapterNodes = all.filter((o) => ids.includes(o.id) && o.nodeType === 'chapter')
    const { buildOutlineDocOrder, outlineChapterNumber } = await import('@core/platform/services/longwriting/outline-order')
    const docOrder = buildOutlineDocOrder(all as never)
    // 章号级联的 before 快照：删除后剩余章节号会前移，伴生数据必须跟着搬
    const docOrderBefore = buildOutlineDocOrder(all as never)

    // 正文检查：有正文的章节列出，未 force 不删
    const withContent: string[] = []
    const chapterRows: Array<{ outlineId: string; chapterId: string; chapterNo: number }> = []
    for (const cn of chapterNodes) {
      const ch = await this.db.lwChapters?.getByOutlineId(cn.id)
      const no = outlineChapterNumber(docOrder, cn.id) ?? 0
      if (ch) {
        chapterRows.push({ outlineId: cn.id, chapterId: ch.id, chapterNo: no })
        if (ch.content?.trim()) withContent.push(cn.name)
      }
    }
    if (withContent.length > 0 && !force) {
      return { deleted: false, needsConfirm: true, chapters: withContent, projectId: node.projectId, chapterNos: [] }
    }

    // 事务级联：版本 → 正文 → 预写 → 状态摘要 → 大纲关联 → 大纲节点
    const { LwChapterVersionEntity } = await import('@core/database/entities/lw-chapter-version.entity')
    const { LwChapterEntity } = await import('@core/database/entities/lw-chapter.entity')
    const { LwOutlineCharacterEntity } = await import('@core/database/entities/lw-outline-character.entity')
    const { LwOutlineItemEntity } = await import('@core/database/entities/lw-outline-item.entity')
    const { LwOutlineLocationEntity } = await import('@core/database/entities/lw-outline-location.entity')
    const { LwChapterStateSummaryEntity } = await import('@core/database/entities/lw-chapter-state-summary.entity')
    const { LwOutlineEntity } = await import('@core/database/entities/lw-outline.entity')

    await this.db.dataSource.transaction(async (em) => {
      for (const row of chapterRows) {
        await em.delete(LwChapterVersionEntity, { chapterId: row.chapterId })
        await em.delete(LwChapterEntity, { id: row.chapterId })
      }
      for (const oid of ids) {
        await em.delete(LwOutlineCharacterEntity, { outlineId: oid })
        await em.delete(LwOutlineItemEntity, { outlineId: oid })
        await em.delete(LwOutlineLocationEntity, { outlineId: oid })
        await em.delete(LwChapterStateSummaryEntity, { outlineId: oid })
      }
      for (const oid of ids) {
        await em.delete(LwOutlineEntity, { id: oid })
      }
    })

    // 删除后级联（顺序关键）：先清被删章节的伴生数据（事件/切片/伏笔/向量——无 FK、
    // 按旧章号键挂），再搬移剩余章节的章号。若先级联，被删章的残留行会占住目标章号
    // 撞快照表 UNIQUE(project,entity,chapter)（2026-09-21 E2E 实测）。handler 侧的
    // purge 调用保留为幂等兜底。
    const afterAll = (await this.db.lwOutlines.getByProjectId(node.projectId)) || []
    try {
      if (chapterRows.length > 0) {
        const { LwPurgeService } = await import('@core/platform/services/longwriting/purge.service')
        const purge = new LwPurgeService(this.db)
        for (const row of chapterRows) {
          if (row.chapterNo > 0) {
            await purge.purgeChapterDerivedData(node.projectId, row.chapterNo)
          }
        }
      }
    } catch (e) {
      console.error('[LongWritingService] 删除章节伴生数据清理失败（后续级联可能受影响）:', e)
    }
    try {
      const { cascadeChapterNumberChange } = await import('@core/platform/services/longwriting/chapter-number-sync')
      await cascadeChapterNumberChange(this.db, node.projectId, docOrderBefore, buildOutlineDocOrder(afterAll as never), afterAll as never)
    } catch (e) {
      console.warn('[LongWritingService] 删除后章号级联失败（不影响删除本身）:', e)
    }

    return {
      deleted: true,
      needsConfirm: false,
      chapters: withContent,
      projectId: node.projectId,
      chapterNos: chapterRows.map((r) => r.chapterNo).filter((n) => n > 0),
    }
  }

  /**
   * 移动大纲节点
   */
  async moveOutline(id: string, newParentId: string | null): Promise<boolean> {
    if (!this.db.lwOutlines) {
      throw new Error('数据库未初始化')
    }
    const before = await this.docOrderSnapshot((await this.db.lwOutlines.getById(id))?.projectId)
    const ok = await this.db.lwOutlines.moveTo(id, newParentId)
    if (ok && before) await this.cascadeChapterNumbers(before.projectId, before.order)
    return ok
  }

  // ==================== 章号级联（chapter-number-sync） ====================

  /** 取项目当前文档序快照（级联 diff 的 before 侧） */
  private async docOrderSnapshot(projectId?: string | null): Promise<{ projectId: string; order: Awaited<ReturnType<typeof buildDocOrder>> } | null> {
    if (!projectId || !this.db.lwOutlines) return null
    const all = (await this.db.lwOutlines.getByProjectId(projectId)) || []
    return { projectId, order: await buildDocOrder(all as never) }
  }

  /** 对比变更前后文档序并把伴生数据章号整体搬移（映射为空时是 no-op） */
  private async cascadeChapterNumbers(projectId: string | null | undefined, before: Awaited<ReturnType<typeof buildDocOrder>>): Promise<void> {
    if (!projectId || !this.db.lwOutlines) return
    const all = (await this.db.lwOutlines.getByProjectId(projectId)) || []
    const after = await buildDocOrder(all as never)
    const { cascadeChapterNumberChange } = await import('@core/platform/services/longwriting/chapter-number-sync')
    await cascadeChapterNumberChange(this.db, projectId, before, after, all as never)
  }

  // ==================== 章节管理 ====================

  /**
   * 获取章节内容
   */
  async getChapter(outlineId: string): Promise<StoryChapter | null> {
    if (!this.db.lwChapters) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwChapters.getByOutlineId(outlineId)
  }

  /**
   * 批量获取章节内容
   */
  async getChaptersByOutlineIds(outlineIds: string[]): Promise<Map<string, StoryChapter>> {
    if (!this.db.lwChapters) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwChapters.getByOutlineIds(outlineIds)
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
      chapter = await this.db.lwChapters.create(outlineId, content)
    } else {
      chapter = await this.db.lwChapters.updateContent(chapter.id, content)!
    }

    // 创建版本记录
    await this.db.lwChapters.createVersion(chapter.id, content, 'manual')

    // 进度状态同步（天下捕快实跑修复）：写完正文的章节大纲仍停在 pending，
    // 进度视图永远"0 章已写"。pending → progressing（用户手标的 completed 不降级）。
    try {
      const outline = await this.db.lwOutlines?.getById(outlineId)
      if (outline?.status === 'pending') {
        await this.db.lwOutlines.update(outlineId, { status: 'progressing' })
      }
    } catch { /* 状态同步失败不影响正文保存 */ }

    return chapter
  }

  /**
   * 获取章节版本列表
   */
  async getChapterVersions(chapterId: string): Promise<ChapterVersion[]> {
    if (!this.db.lwChapters) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwChapters.getVersions(chapterId)
  }

  /**
   * 恢复到指定版本
   */
  async restoreChapterVersion(chapterId: string, versionId: string): Promise<StoryChapter | null> {
    if (!this.db.lwChapters) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwChapters.restoreVersion(chapterId, versionId)
  }

  /**
   * 锁定版本
   */
  async lockChapterVersion(versionId: string): Promise<boolean> {
    if (!this.db.lwChapters) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwChapters.lockVersion(versionId)
  }

  // ==================== AI 生成相关 ====================

  /**
   * 生成故事概要（AI）
   * TODO: 实现 AI 生成逻辑
   */
  async generateStoryOverview(_projectId: string, _input: string): Promise<StoryOverview> {
    // TODO: 调用 AI API 生成概要
    throw new Error('AI 生成功能尚未实现')
  }

  /**
   * 生成大纲（AI）
   * TODO: 实现 AI 生成逻辑
   */
  async generateOutline(_projectId: string, _description: string): Promise<StoryOutline[]> {
    // TODO: 调用 AI API 生成大纲
    throw new Error('AI 生成功能尚未实现')
  }

  /**
   * 生成章节内容（AI）
   * TODO: 实现 AI 生成逻辑
   */
  async generateChapter(_outlineId: string, _targetWords?: number): Promise<StoryChapter> {
    // TODO: 调用 AI API 生成章节内容
    throw new Error('AI 生成功能尚未实现')
  }

  // ==================== 全局配置 ====================

  /**
   * 获取全局配置
   */
  async getGlobalSettings(): Promise<LongWritingGlobalSettings> {
    if (!this.db.lwGlobalSettings) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwGlobalSettings.getOrCreate()
  }

  /**
   * 更新全局配置
   */
  async updateGlobalSettings(data: Partial<LongWritingGlobalSettings>): Promise<LongWritingGlobalSettings | null> {
    if (!this.db.lwGlobalSettings) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwGlobalSettings.update(data)
  }

  // ==================== 字典管理 ====================

  /**
   * 获取所有字典项
   */
  // ==================== 字典管理 ====================

  /**
   * 获取所有字典分类
   */
  async getDictionaryCategories(): Promise<any[]> {
    if (!this.db.lwDictionary) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwDictionary.getAllCategories()
  }

  /**
   * 创建字典分类
   */
  async createDictionaryCategory(code: string, name: string): Promise<any> {
    if (!this.db.lwDictionary) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwDictionary.createCategory(code, name)
  }

  /**
   * 更新字典分类
   */
  async updateDictionaryCategory(code: string, name: string): Promise<any | null> {
    if (!this.db.lwDictionary) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwDictionary.updateCategory(code, name)
  }

  /**
   * 删除字典分类
   */
  async deleteDictionaryCategory(code: string): Promise<boolean> {
    if (!this.db.lwDictionary) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwDictionary.deleteCategory(code)
  }

  /**
   * 获取所有字典项
   */
  async getDictionaryAll(): Promise<Record<string, any[]>> {
    if (!this.db.lwDictionary) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwDictionary.getAll()
  }

  /**
   * 获取指定分类的字典项
   */
  async getDictionaryByCategory(categoryCode: string): Promise<any[]> {
    if (!this.db.lwDictionary) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwDictionary.getByCategory(categoryCode)
  }

  /**
   * 创建字典项
   */
  async createDictionaryItem(categoryCode: string, code: string, name: string): Promise<any> {
    if (!this.db.lwDictionary) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwDictionary.create(categoryCode, code, name)
  }

  /**
   * 更新字典项
   */
  async updateDictionaryItem(id: string, data: { code?: string; name?: string }): Promise<any | null> {
    if (!this.db.lwDictionary) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwDictionary.update(id, data)
  }

  /**
   * 删除字典项
   */
  async deleteDictionaryItem(id: string): Promise<boolean> {
    if (!this.db.lwDictionary) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwDictionary.delete(id)
  }

  /**
   * 重排序字典项
   */
  async reorderDictionary(categoryCode: string, orderedIds: string[]): Promise<void> {
    if (!this.db.lwDictionary) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwDictionary.reorder(categoryCode, orderedIds)
  }

  // ==================== 项目级别类型配置 ====================

  /**
   * 获取项目的技能类型配置
   */
  async getSkillTypeConfigs(projectId: string): Promise<ProjectSkillTypeConfig[]> {
    if (!this.db.lwTypeConfig) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwTypeConfig.getSkillTypeConfigs(projectId)
  }

  /**
   * 创建技能类型配置
   */
  async createSkillTypeConfig(data: CreateSkillTypeConfigRequest): Promise<ProjectSkillTypeConfig> {
    if (!this.db.lwTypeConfig) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwTypeConfig.createSkillTypeConfig(data)
  }

  /**
   * 更新技能类型配置
   */
  async updateSkillTypeConfig(id: string, data: UpdateSkillTypeConfigRequest): Promise<ProjectSkillTypeConfig | null> {
    if (!this.db.lwTypeConfig) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwTypeConfig.updateSkillTypeConfig(id, data)
  }

  /**
   * 删除技能类型配置
   * @returns 删除是否成功
   */
  async deleteSkillTypeConfig(id: string): Promise<boolean> {
    if (!this.db.lwTypeConfig) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwTypeConfig.deleteSkillTypeConfig(id)
  }

  /**
   * 获取项目的物品类型配置
   */
  async getItemTypeConfigs(projectId: string): Promise<ProjectItemTypeConfig[]> {
    if (!this.db.lwTypeConfig) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwTypeConfig.getItemTypeConfigs(projectId)
  }

  /**
   * 创建物品类型配置
   */
  async createItemTypeConfig(data: CreateItemTypeConfigRequest): Promise<ProjectItemTypeConfig> {
    if (!this.db.lwTypeConfig) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwTypeConfig.createItemTypeConfig(data)
  }

  /**
   * 更新物品类型配置
   */
  async updateItemTypeConfig(id: string, data: UpdateItemTypeConfigRequest): Promise<ProjectItemTypeConfig | null> {
    if (!this.db.lwTypeConfig) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwTypeConfig.updateItemTypeConfig(id, data)
  }

  /**
   * 删除物品类型配置
   * @returns 删除是否成功
   */
  async deleteItemTypeConfig(id: string): Promise<boolean> {
    if (!this.db.lwTypeConfig) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwTypeConfig.deleteItemTypeConfig(id)
  }

  /**
   * 初始化项目的默认类型配置
   */
  async initDefaultTypeConfigs(projectId: string): Promise<void> {
    if (!this.db.lwTypeConfig) {
      throw new Error('数据库未初始化')
    }
    await this.db.lwTypeConfig.initializeDefaultSkillTypes(projectId)
    await this.db.lwTypeConfig.initializeDefaultItemTypes(projectId)
  }

  // ==================== 技能等级配置 ====================

  /**
   * 获取技能类型的等级列表
   */
  async getSkillLevels(projectId: string, skillTypeCode: string): Promise<SkillLevelConfig[]> {
    if (!this.db.lwTypeConfig) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwTypeConfig.getSkillLevels(projectId, skillTypeCode)
  }

  /**
   * 创建技能等级
   */
  async createSkillLevel(data: CreateSkillLevelRequest): Promise<SkillLevelConfig> {
    if (!this.db.lwTypeConfig) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwTypeConfig.createSkillLevel(data)
  }

  /**
   * 更新技能等级
   */
  async updateSkillLevel(id: string, data: UpdateSkillLevelRequest): Promise<SkillLevelConfig | null> {
    if (!this.db.lwTypeConfig) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwTypeConfig.updateSkillLevel(id, data)
  }

  /**
   * 删除技能等级
   */
  async deleteSkillLevel(id: string): Promise<void> {
    if (!this.db.lwTypeConfig) {
      throw new Error('数据库未初始化')
    }
    await this.db.lwTypeConfig.deleteSkillLevel(id)
  }

  /**
   * 重排序技能等级
   */
  async reorderSkillLevels(projectId: string, skillTypeCode: string, orderedIds: string[]): Promise<void> {
    if (!this.db.lwTypeConfig) {
      throw new Error('数据库未初始化')
    }
    await this.db.lwTypeConfig.reorderSkillLevels(projectId, skillTypeCode, orderedIds)
  }

  // ==================== 物品等级配置 ====================

  /**
   * 获取物品类型的等级列表
   */
  async getItemLevels(projectId: string, itemTypeCode: string): Promise<ItemLevelConfig[]> {
    if (!this.db.lwTypeConfig) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwTypeConfig.getItemLevels(projectId, itemTypeCode)
  }

  /**
   * 创建物品等级
   */
  async createItemLevel(data: CreateItemLevelRequest): Promise<ItemLevelConfig> {
    if (!this.db.lwTypeConfig) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwTypeConfig.createItemLevel(data)
  }

  /**
   * 更新物品等级
   */
  async updateItemLevel(id: string, data: UpdateItemLevelRequest): Promise<ItemLevelConfig | null> {
    if (!this.db.lwTypeConfig) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwTypeConfig.updateItemLevel(id, data)
  }

  /**
   * 删除物品等级
   */
  async deleteItemLevel(id: string): Promise<void> {
    if (!this.db.lwTypeConfig) {
      throw new Error('数据库未初始化')
    }
    await this.db.lwTypeConfig.deleteItemLevel(id)
  }

  /**
   * 重排序物品等级
   */
  async reorderItemLevels(projectId: string, itemTypeCode: string, orderedIds: string[]): Promise<void> {
    if (!this.db.lwTypeConfig) {
      throw new Error('数据库未初始化')
    }
    await this.db.lwTypeConfig.reorderItemLevels(projectId, itemTypeCode, orderedIds)
  }

  // ==================== 地图管理 ====================

  /**
   * 获取项目的所有地图
   */
  async getMaps(projectId: string): Promise<StoryMap[]> {
    if (!this.db.lwMaps) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwMaps.getByProjectId(projectId)
  }

  /**
   * 获取地图详情
   */
  async getMap(id: string): Promise<StoryMap | null> {
    if (!this.db.lwMaps) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwMaps.getById(id)
  }

  /**
   * 创建地图
   */
  async createMap(data: CreateMapRequest): Promise<StoryMap> {
    if (!this.db.lwMaps) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwMaps.create({
      projectId: data.projectId,
      name: data.name,
      orientation: data.orientation,
      characteristics: data.characteristics
    })
  }

  /**
   * 更新地图
   */
  async updateMap(id: string, data: UpdateMapRequest): Promise<StoryMap | null> {
    if (!this.db.lwMaps) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwMaps.update(id, data as Partial<StoryMap>)
  }

  /**
   * 删除地图
   */
  async deleteMap(id: string): Promise<boolean> {
    if (!this.db.lwMaps) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwMaps.delete(id)
  }

  /**
   * 更新地图图片路径
   */
  async updateMapImage(id: string, imagePath: string | null): Promise<boolean> {
    if (!this.db.lwMaps) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwMaps.updateImagePath(id, imagePath)
  }

  /**
   * 更新 AI 生成的地图数据
   */
  async updateMapAIData(id: string, data: MapGeneratedData | null): Promise<boolean> {
    if (!this.db.lwMaps) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwMaps.updateAIGeneratedData(id, data)
  }

  /**
   * 重排序地图
   */
  async reorderMaps(orderList: { id: string; order: number }[]): Promise<boolean> {
    if (!this.db.lwMaps) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwMaps.updateSortOrder(orderList)
  }

  // ==================== 章节预写管理 ====================

  /**
   * 获取预写
   */
  async getPrewrite(outlineId: string): Promise<ChapterPrewrite | null> {
    if (!this.db.lwPrewrites) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwPrewrites.getByOutlineId(outlineId)
  }

  /**
   * 保存预写（创建或更新）
   */
  async savePrewrite(data: CreatePrewriteRequest): Promise<ChapterPrewrite> {
    if (!this.db.lwPrewrites) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwPrewrites.save(data)
  }

  /**
   * 54 号章法：章节设计卡落库（未确认 prewrite upsert）+ 出场实体名→id 绑定大纲。
   * IPC handler 与研讨室 agent 工具（lw_design_chapter_card）共用——绑定规则单一事实源。
   */
  async applyChapterCard(projectId: string, outlineId: string, card: any, markdown: string): Promise<{ prewrite: ChapterPrewrite; unresolvedNames: string[] }> {
    const prewrite = await this.savePrewrite({ outlineId, content: markdown })
    const [chars, locs, items] = await Promise.all([
      this.db.lwCharacters?.getByProjectId(projectId) ?? Promise.resolve([]),
      this.db.lwLocations?.getByProjectId(projectId) ?? Promise.resolve([]),
      this.db.lwItems?.getByProjectId(projectId) ?? Promise.resolve([]),
    ])
    const outline = await this.db.lwOutlines?.getById(outlineId)
    const unresolvedNames: string[] = []
    const charIds = ((card?.involvedCharacters || []) as Array<{ name: string }>)
      .map((c) => {
        const hit = chars.find((x: any) => x.name === c.name)
        if (!hit) unresolvedNames.push(c.name)
        return hit?.id
      })
      .filter(Boolean) as string[]
    const locIds = ((card?.involvedLocations || []) as string[])
      .map((n) => locs.find((x: any) => x.name === n)?.id)
      .filter(Boolean) as string[]
    const itemIds = ((card?.involvedItems || []) as string[])
      .map((n) => items.find((x: any) => x.name === n)?.id)
      .filter(Boolean) as string[]
    if (outline) {
      const union = (a?: string[], b?: string[]) => Array.from(new Set([...(a || []), ...(b || [])]))
      await this.updateOutline(outlineId, {
        involvedCharacters: union(outline.involvedCharacters, charIds),
        involvedLocations: union(outline.involvedLocations, locIds),
        involvedItems: union(outline.involvedItems, itemIds),
      } as any)
    }
    return { prewrite, unresolvedNames }
  }

  /**
   * 确认预写
   */
  async confirmPrewrite(outlineId: string): Promise<ChapterPrewrite | null> {
    if (!this.db.lwPrewrites) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwPrewrites.confirm(outlineId)
  }

  /**
   * 取消确认预写
   */
  async unconfirmPrewrite(outlineId: string): Promise<ChapterPrewrite | null> {
    if (!this.db.lwPrewrites) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwPrewrites.unconfirm(outlineId)
  }

  /**
   * 删除预写
   */
  async deletePrewrite(outlineId: string): Promise<boolean> {
    if (!this.db.lwPrewrites) {
      throw new Error('数据库未初始化')
    }
    // 同时删除关联的记忆
    if (this.db.lwMemories) {
      await this.db.lwMemories.deleteBySourceOutlineId(outlineId)
    }
    return await this.db.lwPrewrites.delete(outlineId)
  }

  // ==================== 故事记忆管理 ====================

  /**
   * 获取项目的所有记忆
   */
  async getMemories(projectId: string): Promise<StoryMemory[]> {
    if (!this.db.lwMemories) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwMemories.getByProjectId(projectId)
  }

  /**
   * 获取章节之前的记忆
   */
  async getMemoriesBeforeChapter(projectId: string, chapterNumber: number): Promise<StoryMemory[]> {
    if (!this.db.lwMemories) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwMemories.getMemoriesBeforeChapter(projectId, chapterNumber)
  }

  /**
   * 获取单个记忆
   */
  async getMemory(id: string): Promise<StoryMemory | null> {
    if (!this.db.lwMemories) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwMemories.getById(id)
  }

  /**
   * 创建记忆
   */
  async createMemory(data: CreateMemoryRequest): Promise<StoryMemory> {
    if (!this.db.lwMemories) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwMemories.create(data)
  }

  /**
   * 批量创建记忆
   */
  async batchCreateMemories(dataList: CreateMemoryRequest[]): Promise<StoryMemory[]> {
    if (!this.db.lwMemories) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwMemories.batchCreate(dataList)
  }

  /**
   * 更新记忆
   */
  async updateMemory(id: string, data: UpdateMemoryRequest): Promise<StoryMemory | null> {
    if (!this.db.lwMemories) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwMemories.update(id, data)
  }

  /**
   * 删除记忆
   */
  async deleteMemory(id: string): Promise<boolean> {
    if (!this.db.lwMemories) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwMemories.delete(id)
  }

  /**
   * 切换记忆生效状态
   */
  async toggleMemoryActive(id: string): Promise<StoryMemory | null> {
    if (!this.db.lwMemories) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwMemories.toggleActive(id)
  }

  /**
   * 获取记忆统计
   */
  async getMemoryStats(projectId: string): Promise<{
    total: number
    active: number
    byType: Record<string, number>
    byImportance: Record<string, number>
  }> {
    if (!this.db.lwMemories) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwMemories.getMemoryStats(projectId)
  }

  // ==================== 实体状态快照管理 ====================

  /**
   * 获取项目的所有状态快照
   */
  async getEntityStateSnapshots(projectId: string): Promise<EntityStateSnapshot[]> {
    if (!this.db.lwEntityStates) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwEntityStates.getByProjectId(projectId)
  }

  /**
   * 获取实体在指定章节的状态快照
   */
  async getEntityStateAtChapter(
    projectId: string,
    entityType: EntityType,
    entityId: string,
    chapterNumber: number
  ): Promise<EntityStateSnapshot | null> {
    if (!this.db.lwEntityStates) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwEntityStates.getEntityStateAtChapter(
      projectId,
      entityType,
      entityId,
      chapterNumber
    )
  }

  /**
   * 批量获取多个实体在指定章节的状态快照
   */
  async getEntitiesStatesForChapter(
    projectId: string,
    chapterNumber: number,
    entities: Array<{ entityType: EntityType; entityId: string }>
  ): Promise<EntityStateSnapshot[]> {
    if (!this.db.lwEntityStates) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwEntityStates.getEntitiesStatesForChapter(projectId, chapterNumber, entities)
  }

  /**
   * 获取指定章节的所有状态快照
   */
  async getEntityStatesByChapter(projectId: string, chapterNumber: number): Promise<EntityStateSnapshot[]> {
    if (!this.db.lwEntityStates) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwEntityStates.getByChapterNumber(projectId, chapterNumber)
  }

  /**
   * 获取单个状态快照
   */
  async getEntityStateSnapshot(id: string): Promise<EntityStateSnapshot | null> {
    if (!this.db.lwEntityStates) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwEntityStates.getById(id)
  }

  /**
   * 创建状态快照
   */
  async createEntityStateSnapshot(data: CreateEntityStateSnapshotRequest): Promise<EntityStateSnapshot> {
    if (!this.db.lwEntityStates) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwEntityStates.create(data)
  }

  /**
   * 批量创建状态快照
   */
  async batchCreateEntityStateSnapshots(dataList: CreateEntityStateSnapshotRequest[]): Promise<EntityStateSnapshot[]> {
    if (!this.db.lwEntityStates) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwEntityStates.batchCreate(dataList)
  }

  /**
   * 更新或创建状态快照（如果已存在则更新，否则创建）
   */
  async upsertEntityStateSnapshot(data: CreateEntityStateSnapshotRequest): Promise<EntityStateSnapshot> {
    if (!this.db.lwEntityStates) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwEntityStates.upsert(data)
  }

  /**
   * 更新状态快照
   */
  async updateEntityStateSnapshot(id: string, data: UpdateEntityStateSnapshotRequest): Promise<EntityStateSnapshot | null> {
    if (!this.db.lwEntityStates) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwEntityStates.update(id, data)
  }

  /**
   * 删除状态快照
   */
  async deleteEntityStateSnapshot(id: string): Promise<boolean> {
    if (!this.db.lwEntityStates) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwEntityStates.delete(id)
  }

  /**
   * 删除指定章节的所有状态快照
   */
  async deleteEntityStatesByChapter(projectId: string, chapterNumber: number): Promise<number> {
    if (!this.db.lwEntityStates) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwEntityStates.deleteByChapterNumber(projectId, chapterNumber)
  }

  /**
   * 获取状态快照统计
   */
  async getSnapshotStats(projectId: string): Promise<SnapshotStats> {
    if (!this.db.lwEntityStates) {
      throw new Error('数据库未初始化')
    }
    return await this.db.lwEntityStates.getSnapshotStats(projectId)
  }
}

// 导出单例获取函数
export const getLongWritingService = (): LongWritingService => LongWritingService.getInstance()