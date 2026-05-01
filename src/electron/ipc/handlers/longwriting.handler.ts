/**
 * 长文写作 IPC 处理器
 * @module ipc/handlers/longwriting.handler
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { isElectron, loadElectronModules, getBrowserWindowFromEvent } from './_platform'
import * as fs from 'fs'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { LongWritingService } from '@core/services/longwriting.service'
import { LongWritingAIService } from '@core/services/longwriting-ai.service'
import { MaterialProcessorService } from '@core/services/material-processor.service'
import { markdownToDocx } from '@core/utils/markdown-to-docx'
import {
  CreateProjectRequest,
  UpdateProjectRequest,
  CreateCharacterRequest,
  UpdateCharacterRequest,
  CreateOutlineRequest,
  UpdateOutlineRequest,
  CreatePlotRequest,
  UpdatePlotRequest,
  CreateSkillTypeConfigRequest,
  UpdateSkillTypeConfigRequest,
  CreateItemTypeConfigRequest,
  UpdateItemTypeConfigRequest,
  CreateSkillLevelRequest,
  UpdateSkillLevelRequest,
  CreateItemLevelRequest,
  UpdateItemLevelRequest,
  CreateFactionRequest,
  UpdateFactionRequest,
  FactionType,
  CreateMapRequest,
  UpdateMapRequest,
  CreatePrewriteRequest,
  UpdatePrewriteRequest,
  CreateMemoryRequest,
  UpdateMemoryRequest
} from '@shared/types/longwriting.types'

/**
 * IPC 通道名称
 */
const CHANNELS = {
  // 项目管理
  GET_PROJECTS: 'longwriting:getProjects',
  GET_PROJECT: 'longwriting:getProject',
  CREATE_PROJECT: 'longwriting:createProject',
  UPDATE_PROJECT: 'longwriting:updateProject',
  DELETE_PROJECT: 'longwriting:deleteProject',

  // 故事概要
  GET_STORY_OVERVIEW: 'longwriting:getStoryOverview',
  UPDATE_STORY_OVERVIEW: 'longwriting:updateStoryOverview',
  LOCK_STORY_OVERVIEW: 'longwriting:lockStoryOverview',

  // 背景设定
  GET_BACKGROUND: 'longwriting:getBackground',
  UPDATE_BACKGROUND: 'longwriting:updateBackground',

  // 地点管理
  GET_LOCATIONS: 'longwriting:getLocations',
  GET_LOCATION: 'longwriting:getLocation',
  CREATE_LOCATION: 'longwriting:createLocation',
  UPDATE_LOCATION: 'longwriting:updateLocation',
  DELETE_LOCATION: 'longwriting:deleteLocation',

  // 势力管理
  GET_FACTIONS: 'longwriting:getFactions',
  GET_FACTIONS_BY_TYPE: 'longwriting:getFactionsByType',
  GET_FACTION: 'longwriting:getFaction',
  CREATE_FACTION: 'longwriting:createFaction',
  UPDATE_FACTION: 'longwriting:updateFaction',
  DELETE_FACTION: 'longwriting:deleteFaction',
  REORDER_FACTIONS: 'longwriting:reorderFactions',

  // 地图管理
  GET_MAPS: 'longwriting:getMaps',
  GET_MAP: 'longwriting:getMap',
  CREATE_MAP: 'longwriting:createMap',
  UPDATE_MAP: 'longwriting:updateMap',
  DELETE_MAP: 'longwriting:deleteMap',
  GENERATE_MAP_DATA: 'longwriting:generateMapData',
  GENERATE_MAP_IMAGE: 'longwriting:generateMapImage',

  // AI 生成地点和势力
  GENERATE_LOCATIONS: 'longwriting:generateLocations',
  GENERATE_FACTIONS: 'longwriting:generateFactions',

  // 情节管理
  GET_PLOTS: 'longwriting:getPlots',
  GET_PLOT: 'longwriting:getPlot',
  CREATE_PLOT: 'longwriting:createPlot',
  BATCH_CREATE_PLOTS: 'longwriting:batchCreatePlots',
  UPDATE_PLOT: 'longwriting:updatePlot',
  REORDER_PLOTS: 'longwriting:reorderPlots',
  DELETE_PLOT: 'longwriting:deletePlot',
  GET_PLOT_COUNT: 'longwriting:getPlotCount',

  // 角色管理
  GET_CHARACTERS: 'longwriting:getCharacters',
  GET_CHARACTER: 'longwriting:getCharacter',
  CREATE_CHARACTER: 'longwriting:createCharacter',
  UPDATE_CHARACTER: 'longwriting:updateCharacter',
  DELETE_CHARACTER: 'longwriting:deleteCharacter',
  LINK_PORTRAIT: 'longwriting:linkPortrait',
  UNLINK_PORTRAIT: 'longwriting:unlinkPortrait',

  // 角色关系
  GET_CHARACTER_RELATIONS: 'longwriting:getCharacterRelations',
  CREATE_CHARACTER_RELATION: 'longwriting:createCharacterRelation',
  DELETE_CHARACTER_RELATION: 'longwriting:deleteCharacterRelation',

  // 角色与人像同步
  GET_CHARACTER_BY_PORTRAIT_ID: 'longwriting:getCharacterByPortraitId',
  SYNC_CHARACTER_TO_PORTRAIT: 'longwriting:syncCharacterToPortrait',

  // 技能管理
  GET_SKILLS: 'longwriting:getSkills',
  GET_SKILL: 'longwriting:getSkill',
  CREATE_SKILL: 'longwriting:createSkill',
  UPDATE_SKILL: 'longwriting:updateSkill',
  DELETE_SKILL: 'longwriting:deleteSkill',

  // 物品管理
  GET_ITEMS: 'longwriting:getItems',
  GET_ITEM: 'longwriting:getItem',
  CREATE_ITEM: 'longwriting:createItem',
  UPDATE_ITEM: 'longwriting:updateItem',
  DELETE_ITEM: 'longwriting:deleteItem',

  // 素材管理
  GET_MATERIALS: 'longwriting:getMaterials',
  GET_MATERIAL: 'longwriting:getMaterial',
  CREATE_MATERIAL: 'longwriting:createMaterial',
  UPDATE_MATERIAL: 'longwriting:updateMaterial',
  UPDATE_MATERIAL_STATUS: 'longwriting:updateMaterialStatus',
  DELETE_MATERIAL: 'longwriting:deleteMaterial',
  PROCESS_MATERIAL: 'longwriting:processMaterial',

  // 大纲管理
  GET_OUTLINE_TREE: 'longwriting:getOutlineTree',
  GET_OUTLINE: 'longwriting:getOutline',
  CREATE_OUTLINE: 'longwriting:createOutline',
  UPDATE_OUTLINE: 'longwriting:updateOutline',
  DELETE_OUTLINE: 'longwriting:deleteOutline',
  MOVE_OUTLINE: 'longwriting:moveOutline',

  // 章节管理
  GET_CHAPTER: 'longwriting:getChapter',
  GET_CHAPTERS_BY_OUTLINE_IDS: 'longwriting:getChaptersByOutlineIds',
  SAVE_CHAPTER: 'longwriting:saveChapter',
  GET_CHAPTER_VERSIONS: 'longwriting:getChapterVersions',
  RESTORE_CHAPTER_VERSION: 'longwriting:restoreChapterVersion',
  LOCK_CHAPTER_VERSION: 'longwriting:lockChapterVersion',

  // AI 生成
  GENERATE_STORY_OVERVIEW: 'longwriting:generateStoryOverview',
  GENERATE_PLOTS: 'longwriting:generatePlots',
  POLISH_BACKGROUND: 'longwriting:polishBackground',
  GENERATE_CHARACTERS: 'longwriting:generateCharacters',
  GENERATE_SKILLS_ITEMS: 'longwriting:generateSkillsItems',
  GENERATE_SKILL_ITEM_TYPES: 'longwriting:generateSkillItemTypes',
  GENERATE_SKILLS_ONLY: 'longwriting:generateSkillsOnly',
  GENERATE_ITEMS_ONLY: 'longwriting:generateItemsOnly',
  GENERATE_OUTLINE_STORY: 'longwriting:generateOutlineStory',
  GENERATE_OUTLINE_COMMENT: 'longwriting:generateOutlineComment',
  GENERATE_CHAPTER: 'longwriting:generateChapter',
  GENERATE_CHAPTER_PREWRITE: 'longwriting:generateChapterPrewrite',
  GENERATE_SECTION: 'longwriting:generateSection',

  // 导出
  EXPORT_MARKDOWN: 'longwriting:exportMarkdown',
  EXPORT_WORD: 'longwriting:exportWord',
  EXPORT_CHAPTER: 'longwriting:exportChapter',
  GET_EXPORT_DATA: 'longwriting:getExportData',

  // 全局配置
  GET_GLOBAL_SETTINGS: 'longwriting:getGlobalSettings',
  UPDATE_GLOBAL_SETTINGS: 'longwriting:updateGlobalSettings',

  // 字典分类管理
  GET_DICTIONARY_CATEGORIES: 'longwriting:getDictionaryCategories',
  CREATE_DICTIONARY_CATEGORY: 'longwriting:createDictionaryCategory',
  UPDATE_DICTIONARY_CATEGORY: 'longwriting:updateDictionaryCategory',
  DELETE_DICTIONARY_CATEGORY: 'longwriting:deleteDictionaryCategory',

  // 字典项管理
  GET_DICTIONARY_ALL: 'longwriting:getDictionaryAll',
  GET_DICTIONARY_BY_CATEGORY: 'longwriting:getDictionaryByCategory',
  CREATE_DICTIONARY_ITEM: 'longwriting:createDictionaryItem',
  UPDATE_DICTIONARY_ITEM: 'longwriting:updateDictionaryItem',
  DELETE_DICTIONARY_ITEM: 'longwriting:deleteDictionaryItem',
  REORDER_DICTIONARY: 'longwriting:reorderDictionary',

  // 项目级别类型配置
  GET_SKILL_TYPE_CONFIGS: 'longwriting:getSkillTypeConfigs',
  CREATE_SKILL_TYPE_CONFIG: 'longwriting:createSkillTypeConfig',
  UPDATE_SKILL_TYPE_CONFIG: 'longwriting:updateSkillTypeConfig',
  DELETE_SKILL_TYPE_CONFIG: 'longwriting:deleteSkillTypeConfig',

  GET_ITEM_TYPE_CONFIGS: 'longwriting:getItemTypeConfigs',
  CREATE_ITEM_TYPE_CONFIG: 'longwriting:createItemTypeConfig',
  UPDATE_ITEM_TYPE_CONFIG: 'longwriting:updateItemTypeConfig',
  DELETE_ITEM_TYPE_CONFIG: 'longwriting:deleteItemTypeConfig',

  INIT_DEFAULT_TYPE_CONFIGS: 'longwriting:initDefaultTypeConfigs',

  // 技能等级配置
  GET_SKILL_LEVELS: 'longwriting:getSkillLevels',
  CREATE_SKILL_LEVEL: 'longwriting:createSkillLevel',
  UPDATE_SKILL_LEVEL: 'longwriting:updateSkillLevel',
  DELETE_SKILL_LEVEL: 'longwriting:deleteSkillLevel',
  REORDER_SKILL_LEVELS: 'longwriting:reorderSkillLevels',

  // 物品等级配置
  GET_ITEM_LEVELS: 'longwriting:getItemLevels',
  CREATE_ITEM_LEVEL: 'longwriting:createItemLevel',
  UPDATE_ITEM_LEVEL: 'longwriting:updateItemLevel',
  DELETE_ITEM_LEVEL: 'longwriting:deleteItemLevel',
  REORDER_ITEM_LEVELS: 'longwriting:reorderItemLevels',

  // 章节预写
  GET_PREWRITE: 'longwriting:getPrewrite',
  SAVE_PREWRITE: 'longwriting:savePrewrite',
  CONFIRM_PREWRITE: 'longwriting:confirmPrewrite',
  DELETE_PREWRITE: 'longwriting:deletePrewrite',

  // 故事记忆
  GET_MEMORIES: 'longwriting:getMemories',
  GET_MEMORIES_BEFORE_CHAPTER: 'longwriting:getMemoriesBeforeChapter',
  GET_MEMORY: 'longwriting:getMemory',
  CREATE_MEMORY: 'longwriting:createMemory',
  BATCH_CREATE_MEMORIES: 'longwriting:batchCreateMemories',
  UPDATE_MEMORY: 'longwriting:updateMemory',
  DELETE_MEMORY: 'longwriting:deleteMemory',
  TOGGLE_MEMORY_ACTIVE: 'longwriting:toggleMemoryActive',
  GET_MEMORY_STATS: 'longwriting:getMemoryStats',

  // AI 记忆提取
  EXTRACT_MEMORIES: 'longwriting:extractMemories',

  // 实体状态快照
  GET_ENTITY_STATE_SNAPSHOTS: 'longwriting:getEntityStateSnapshots',
  GET_ENTITY_STATE_AT_CHAPTER: 'longwriting:getEntityStateAtChapter',
  GET_ENTITIES_STATES_FOR_CHAPTER: 'longwriting:getEntitiesStatesForChapter',
  GET_ENTITY_STATES_BY_CHAPTER: 'longwriting:getEntityStatesByChapter',
  GET_ENTITY_STATE_SNAPSHOT: 'longwriting:getEntityStateSnapshot',
  CREATE_ENTITY_STATE_SNAPSHOT: 'longwriting:createEntityStateSnapshot',
  BATCH_CREATE_ENTITY_STATE_SNAPSHOTS: 'longwriting:batchCreateEntityStateSnapshots',
  UPSERT_ENTITY_STATE_SNAPSHOT: 'longwriting:upsertEntityStateSnapshot',
  UPDATE_ENTITY_STATE_SNAPSHOT: 'longwriting:updateEntityStateSnapshot',
  DELETE_ENTITY_STATE_SNAPSHOT: 'longwriting:deleteEntityStateSnapshot',
  DELETE_ENTITY_STATES_BY_CHAPTER: 'longwriting:deleteEntityStatesByChapter',
  GET_SNAPSHOT_STATS: 'longwriting:getSnapshotStats',

  // AI 实体状态提取
  EXTRACT_ENTITY_STATES: 'longwriting:extractEntityStates',

  // AI 章节实体识别
  RECOGNIZE_CHAPTER_ENTITIES: 'longwriting:recognizeChapterEntities',

  // 数据迁移
  BACKUP_DATABASE: 'longwriting:backupDatabase',
  MIGRATE_PROJECT: 'longwriting:migrateProject',
  MIGRATE_ALL_PROJECTS: 'longwriting:migrateAllProjects',
  CHECK_NEEDS_MIGRATION: 'longwriting:checkNeedsMigration',
  GET_MIGRATION_STATS: 'longwriting:getMigrationStats',

  // 新实体检测
  DETECT_NEW_ENTITIES: 'longwriting:detectNewEntities',
  AUTO_ADD_ENTITIES: 'longwriting:autoAddEntities',

  // 项目步骤模型配置
  GET_STAGE_MODEL_CONFIGS: 'longwriting:getStageModelConfigs',
  GET_STAGE_MODEL_CONFIG: 'longwriting:getStageModelConfig',
  SET_STAGE_MODEL_CONFIG: 'longwriting:setStageModelConfig',
  SET_STAGE_MODEL_CONFIGS: 'longwriting:setStageModelConfigs',

  // 章节状态摘要
  GET_CHAPTER_STATE_SUMMARIES: 'longwriting:getChapterStateSummaries',
  GET_CHAPTER_STATE_SUMMARY: 'longwriting:getChapterStateSummary',
  GET_CHAPTER_STATE_SUMMARY_BY_OUTLINE: 'longwriting:getChapterStateSummaryByOutline',
  GET_LATEST_CHAPTER_STATE_SUMMARY: 'longwriting:getLatestChapterStateSummary',
  EXTRACT_CHAPTER_STATE_SUMMARY: 'longwriting:extractChapterStateSummary',
  SAVE_CHAPTER_STATE_SUMMARY: 'longwriting:saveChapterStateSummary'
}

/**
 * 注册长文写作 IPC 处理器
 */
export function registerLongWritingHandlers(): void {
  console.log('[LongWritingHandlers] 长文写作 IPC 处理器注册开始')
  const service = LongWritingService.getInstance()

  // ==================== 项目管理 ====================

  // 序列化项目对象，确保可以被 IPC 传输
  const serializeProject = (project: any) => ({
    id: project.id,
    name: project.name,
    type: project.type,
    stage: project.stage,
    progress: project.progress,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt
  })

  ipcBridge.handle(CHANNELS.GET_PROJECTS, async () => {
    try {
      const projects = await service.getProjects()
      // 序列化所有项目
      const serializedProjects = projects.map(serializeProject)
      return { success: true, data: serializedProjects }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.GET_PROJECT, async (_event, id: string) => {
    try {
      const project = await service.getProject(id)
      if (!project) {
        return { success: true, data: null }
      }
      return { success: true, data: serializeProject(project) }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.CREATE_PROJECT, async (_event, data: CreateProjectRequest) => {
    try {
      const project = await service.createProject(data)
      return { success: true, data: serializeProject(project) }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.UPDATE_PROJECT, async (_event, id: string, data: UpdateProjectRequest) => {
    try {
      const project = await service.updateProject(id, data)
      if (!project) {
        return { success: true, data: null }
      }
      return { success: true, data: serializeProject(project) }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.DELETE_PROJECT, async (_event, id: string) => {
    try {
      const result = await service.deleteProject(id)
      return { success: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ==================== 故事概要 ====================

  ipcBridge.handle(CHANNELS.GET_STORY_OVERVIEW, async (_event, projectId: string) => {
    try {
      const overview = await service.getStoryOverview(projectId)
      return { success: true, data: overview }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.UPDATE_STORY_OVERVIEW, async (_event, projectId: string, data: any) => {
    try {
      const overview = await service.updateStoryOverview(projectId, data)
      return { success: true, data: overview }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.LOCK_STORY_OVERVIEW, async (_event, projectId: string, locked: boolean) => {
    try {
      const result = await service.lockStoryOverview(projectId, locked)
      return { success: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ==================== 角色管理 ====================

  ipcBridge.handle(CHANNELS.GET_CHARACTERS, async (_event, projectId: string) => {
    try {
      const characters = await service.getCharacters(projectId)
      return { success: true, data: characters }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.GET_CHARACTER, async (_event, id: string) => {
    try {
      const character = await service.getCharacter(id)
      return { success: true, data: character }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.CREATE_CHARACTER, async (_event, data: CreateCharacterRequest) => {
    try {
      console.log(`[LongWritingHandler] createCharacter 被调用, data:`, JSON.stringify(data).substring(0, 200))
      const character = await service.createCharacter(data)
      console.log(`[LongWritingHandler] createCharacter 成功, id: ${character.id}`)
      return { success: true, data: character }
    } catch (error: any) {
      console.error(`[LongWritingHandler] createCharacter 错误:`, error)
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.UPDATE_CHARACTER, async (_event, id: string, data: UpdateCharacterRequest) => {
    try {
      const character = await service.updateCharacter(id, data)
      return { success: true, data: character }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.DELETE_CHARACTER, async (_event, id: string) => {
    try {
      const result = await service.deleteCharacter(id)
      return { success: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.LINK_PORTRAIT, async (_event, characterId: string, portraitId: string) => {
    try {
      const character = await service.linkPortrait(characterId, portraitId)
      return { success: true, data: character }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.UNLINK_PORTRAIT, async (_event, characterId: string) => {
    try {
      const character = await service.unlinkPortrait(characterId)
      return { success: true, data: character }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ==================== 背景设定 ====================

  ipcBridge.handle(CHANNELS.GET_BACKGROUND, async (_event, projectId: string) => {
    try {
      const background = await service.getBackground(projectId)
      return { success: true, data: background }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.UPDATE_BACKGROUND, async (_event, projectId: string, data: any) => {
    console.log('[LongWriting] UPDATE_BACKGROUND 被调用, projectId:', projectId, 'data:', data)
    try {
      const background = await service.updateBackground(projectId, data)
      console.log('[LongWriting] UPDATE_BACKGROUND 成功, result:', background)
      return { success: true, data: background }
    } catch (error: any) {
      console.error('[LongWriting] UPDATE_BACKGROUND 失败:', error)
      return { success: false, error: error.message }
    }
  })

  // ==================== 地点管理 ====================

  ipcBridge.handle(CHANNELS.GET_LOCATIONS, async (_event, projectId: string) => {
    try {
      const locations = await service.getLocations(projectId)
      return { success: true, data: locations }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.GET_LOCATION, async (_event, id: string) => {
    try {
      const location = await service.getLocation(id)
      return { success: true, data: location }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.CREATE_LOCATION, async (_event, data: any) => {
    try {
      const location = await service.createLocation(data)
      return { success: true, data: location }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.UPDATE_LOCATION, async (_event, id: string, data: any) => {
    try {
      const location = await service.updateLocation(id, data)
      return { success: true, data: location }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.DELETE_LOCATION, async (_event, id: string) => {
    try {
      const result = await service.deleteLocation(id)
      return { success: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ==================== 势力管理 ====================

  ipcBridge.handle(CHANNELS.GET_FACTIONS, async (_event, projectId: string) => {
    try {
      const factions = await service.getFactions(projectId)
      return { success: true, data: factions }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.GET_FACTIONS_BY_TYPE, async (_event, projectId: string, factionType: FactionType) => {
    try {
      const factions = await service.getFactionsByType(projectId, factionType)
      return { success: true, data: factions }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.GET_FACTION, async (_event, id: string) => {
    try {
      const faction = await service.getFaction(id)
      return { success: true, data: faction }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.CREATE_FACTION, async (_event, data: CreateFactionRequest) => {
    try {
      const faction = await service.createFaction(data)
      return { success: true, data: faction }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.UPDATE_FACTION, async (_event, id: string, data: UpdateFactionRequest) => {
    try {
      const faction = await service.updateFaction(id, data)
      return { success: true, data: faction }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.DELETE_FACTION, async (_event, id: string) => {
    try {
      const result = await service.deleteFaction(id)
      return { success: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.REORDER_FACTIONS, async (_event, orderList: { id: string; order: number }[]) => {
    try {
      const result = await service.reorderFactions(orderList)
      return { success: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ==================== 地图管理 ====================

  ipcBridge.handle(CHANNELS.GET_MAPS, async (_event, projectId: string) => {
    try {
      const maps = await service.getMaps(projectId)
      return { success: true, data: maps }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.GET_MAP, async (_event, id: string) => {
    try {
      const map = await service.getMap(id)
      return { success: true, data: map }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.CREATE_MAP, async (_event, data: CreateMapRequest) => {
    try {
      const map = await service.createMap(data)
      return { success: true, data: map }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.UPDATE_MAP, async (_event, id: string, data: UpdateMapRequest) => {
    try {
      const map = await service.updateMap(id, data)
      return { success: true, data: map }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.DELETE_MAP, async (_event, id: string) => {
    try {
      const result = await service.deleteMap(id)
      return { success: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.GENERATE_MAP_DATA, async (_event, eventId: string, projectId: string, mapId: string, prompt: string, providerConfigId?: string, modelId?: string) => {
    try {
      const result = await aiService.generateMapData(
        eventId,
        projectId,
        mapId,
        prompt,
        providerConfigId,
        modelId
      )
      return result
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.GENERATE_MAP_IMAGE, async (event, projectId: string, mapId: string, providerConfigId?: string, modelId?: string) => {
    try {
      // 获取地图信息
      const map = await service.getMap(mapId)
      if (!map) {
        return { success: false, error: '地图不存在' }
      }

      // 获取故事概要
      const overview = await service.getStoryOverview(projectId)

      // 构建图片生成提示词
      const prompt = `为小说故事生成地图图片。
地图名称：${map.name}
地图方位：${map.orientation || '未指定'}
地图特点：${map.characteristics || '未指定'}
故事标题：${overview?.title || '未命名'}
${map.aiGeneratedData ? `详细信息：${JSON.stringify(map.aiGeneratedData).slice(0, 500)}` : ''}

请生成一张符合以上描述的地图风格插图。`

      // 获取 BrowserWindow
      const window = getBrowserWindowFromEvent(event)
      if (!window) {
        return { success: false, error: '窗口不存在' }
      }

      // 获取 ImageService
      const { ImageService } = await import('@core/services/image.service')

      // 生成图片
      const result = await ImageService.generateImage({
        providerConfigId,
        model: modelId || '',
        prompt,
        width: 1024,
        height: 1024,
        skipHistory: true
      })

      if (result.success && result.images?.length) {
        // saveImagesWithoutHistory 已经返回相对路径，直接落库
        await service.updateMapImage(mapId, result.images[0].filePath)
      }

      return { success: result.success, error: result.error }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ==================== 情节管理 ====================

  ipcBridge.handle(CHANNELS.GET_PLOTS, async (_event, projectId: string) => {
    try {
      const plots = await service.getPlots(projectId)
      return { success: true, data: plots }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.GET_PLOT, async (_event, id: string) => {
    try {
      const plot = await service.getPlot(id)
      return { success: true, data: plot }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.CREATE_PLOT, async (_event, data: CreatePlotRequest) => {
    try {
      const plot = await service.createPlot(data)
      return { success: true, data: plot }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.BATCH_CREATE_PLOTS, async (_event, projectId: string, plots: { title: string; summary: string; involvedCharacters?: string[] }[]) => {
    try {
      const result = await service.batchCreatePlots(projectId, plots)
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.UPDATE_PLOT, async (_event, id: string, data: UpdatePlotRequest) => {
    try {
      const plot = await service.updatePlot(id, data)
      return { success: true, data: plot }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.REORDER_PLOTS, async (_event, projectId: string, orderList: { id: string; order: number }[]) => {
    try {
      const result = await service.reorderPlots(projectId, orderList)
      return { success: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.DELETE_PLOT, async (_event, id: string) => {
    try {
      const result = await service.deletePlot(id)
      return { success: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.GET_PLOT_COUNT, async (_event, projectId: string) => {
    try {
      const count = await service.getPlotCount(projectId)
      return { success: true, data: count }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ==================== 角色关系 ====================

  ipcBridge.handle(CHANNELS.GET_CHARACTER_RELATIONS, async (_event, characterId: string) => {
    try {
      const relations = await service.getCharacterRelations(characterId)
      return { success: true, data: relations }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.CREATE_CHARACTER_RELATION, async (_event, data: any) => {
    try {
      const relation = await service.createCharacterRelation(data)
      return { success: true, data: relation }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.DELETE_CHARACTER_RELATION, async (_event, id: string) => {
    try {
      const result = await service.deleteCharacterRelation(id)
      return { success: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ==================== 角色与人像同步 ====================

  // 根据人像ID获取关联的长文角色
  ipcBridge.handle(CHANNELS.GET_CHARACTER_BY_PORTRAIT_ID, async (_event, portraitId: string) => {
    try {
      const dbManager = getCoreDatabaseManager()
      const characters = await dbManager.lwCharacters?.getByPortraitId(portraitId)
      return { success: true, data: characters?.[0] || null }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // 同步角色信息到人像
  ipcBridge.handle(CHANNELS.SYNC_CHARACTER_TO_PORTRAIT, async (_event, portraitId: string, characterData: any) => {
    try {
      const dbManager = getCoreDatabaseManager()

      // 获取人像角色信息
      const portrait = dbManager.portraitCharacters?.getById(portraitId)
      if (!portrait) {
        return { success: false, error: '人像不存在' }
      }

      // 准备更新数据
      const updateData: any = {
        id: portraitId
      }

      // 同步性别（注意：人像只有 male/female，角色有 other）
      if (characterData.gender && characterData.gender !== 'other') {
        updateData.gender = characterData.gender
      }

      // 同步年龄
      if (characterData.age) {
        updateData.age = characterData.age
      }

      // 同步身高
      if (characterData.height) {
        updateData.height = characterData.height
      }

      // 同步体重
      if (characterData.weight) {
        updateData.weight = characterData.weight
      }

      // 同步人种（注意：若角色 race 为 'other' 则不同步）
      if (characterData.race && characterData.race !== 'other') {
        updateData.race = characterData.race
      }

      // 合并描述：外貌描述 + 性格特点 + 能力特长
      const descriptionParts: string[] = []
      if (characterData.appearance) {
        descriptionParts.push(characterData.appearance)
      }
      if (characterData.personality) {
        descriptionParts.push('性格：' + characterData.personality)
      }
      if (characterData.abilities) {
        descriptionParts.push('能力：' + characterData.abilities)
      }
      if (descriptionParts.length > 0) {
        updateData.description = descriptionParts.join('。')
      }

      // 更新人像
      dbManager.portraitCharacters?.update(updateData)

      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ==================== 技能管理 ====================

  ipcBridge.handle(CHANNELS.GET_SKILLS, async (_event, projectId: string) => {
    try {
      const skills = await service.getSkills(projectId)
      return { success: true, data: skills }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.GET_SKILL, async (_event, id: string) => {
    try {
      const skill = await service.getSkill(id)
      return { success: true, data: skill }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.CREATE_SKILL, async (_event, data: any) => {
    try {
      const skill = await service.createSkill(data)
      return { success: true, data: skill }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.UPDATE_SKILL, async (_event, id: string, data: any) => {
    try {
      const skill = await service.updateSkill(id, data)
      return { success: true, data: skill }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.DELETE_SKILL, async (_event, id: string) => {
    try {
      const result = await service.deleteSkill(id)
      return { success: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ==================== 物品管理 ====================

  ipcBridge.handle(CHANNELS.GET_ITEMS, async (_event, projectId: string) => {
    try {
      const items = await service.getItems(projectId)
      return { success: true, data: items }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.GET_ITEM, async (_event, id: string) => {
    try {
      const item = await service.getItem(id)
      return { success: true, data: item }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.CREATE_ITEM, async (_event, data: any) => {
    try {
      const item = await service.createItem(data)
      return { success: true, data: item }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.UPDATE_ITEM, async (_event, id: string, data: any) => {
    try {
      const item = await service.updateItem(id, data)
      return { success: true, data: item }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.DELETE_ITEM, async (_event, id: string) => {
    try {
      const result = await service.deleteItem(id)
      return { success: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ==================== 素材管理 ====================

  ipcBridge.handle(CHANNELS.GET_MATERIALS, async (_event, projectId: string) => {
    try {
      const materials = await service.getMaterials(projectId)
      return { success: true, data: materials }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.GET_MATERIAL, async (_event, id: string) => {
    try {
      const material = await service.getMaterial(id)
      return { success: true, data: material }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.CREATE_MATERIAL, async (_event, data: any) => {
    try {
      const material = await service.createMaterial(data)
      return { success: true, data: material }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.UPDATE_MATERIAL, async (_event, id: string, data: any) => {
    try {
      const material = await service.updateMaterial(id, data)
      return { success: true, data: material }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.UPDATE_MATERIAL_STATUS, async (_event, id: string, status: string, errorMessage?: string) => {
    try {
      const result = await service.updateMaterialStatus(id, status, errorMessage)
      return { success: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.DELETE_MATERIAL, async (_event, id: string) => {
    try {
      const result = await service.deleteMaterial(id)
      return { success: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.PROCESS_MATERIAL, async (_event, id: string) => {
    try {
      const material = await service.getMaterial(id)
      if (!material) {
        return { success: false, error: '素材不存在' }
      }

      const processor = MaterialProcessorService.getInstance()
      let content = ''
      let error: string | undefined

      if (material.type === 'file' && material.source) {
        const result = await processor.extractFromFile(material.source)
        content = result.content
        error = result.error
      } else if (material.type === 'url' && material.source) {
        const result = await processor.fetchFromUrl(material.source)
        content = result.content
        if (result.title && !material.name) {
          await service.updateMaterial(id, { name: result.title })
        }
        error = result.error
      }

      // 更新素材状态和内容
      if (content) {
        await service.updateMaterial(id, { content })
        await service.updateMaterialStatus(id, 'success')
        return { success: true, data: { content } }
      } else {
        await service.updateMaterialStatus(id, 'failed', error)
        return { success: false, error }
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ==================== 大纲管理 ====================

  ipcBridge.handle(CHANNELS.GET_OUTLINE_TREE, async (_event, projectId: string) => {
    try {
      const outlines = await service.getOutlineTree(projectId)
      return { success: true, data: outlines }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.GET_OUTLINE, async (_event, id: string) => {
    try {
      const outline = await service.getOutline(id)
      return { success: true, data: outline }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.CREATE_OUTLINE, async (_event, data: CreateOutlineRequest) => {
    try {
      const outline = await service.createOutline(data)
      return { success: true, data: outline }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.UPDATE_OUTLINE, async (_event, id: string, data: UpdateOutlineRequest) => {
    try {
      const outline = await service.updateOutline(id, data)
      return { success: true, data: outline }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.DELETE_OUTLINE, async (_event, id: string) => {
    try {
      const result = await service.deleteOutline(id)
      return { success: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.MOVE_OUTLINE, async (_event, id: string, newParentId: string | null) => {
    try {
      const result = await service.moveOutline(id, newParentId)
      return { success: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ==================== 章节管理 ====================

  ipcBridge.handle(CHANNELS.GET_CHAPTER, async (_event, outlineId: string) => {
    try {
      const chapter = await service.getChapter(outlineId)
      return { success: true, data: chapter }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.GET_CHAPTERS_BY_OUTLINE_IDS, async (_event, outlineIds: string[]) => {
    try {
      const chaptersMap = await service.getChaptersByOutlineIds(outlineIds)
      // 将 Map 转换为普通对象以便 IPC 传输
      const chaptersObj: Record<string, any> = {}
      chaptersMap.forEach((chapter, outlineId) => {
        chaptersObj[outlineId] = chapter
      })
      return { success: true, data: chaptersObj }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.SAVE_CHAPTER, async (_event, outlineId: string, content: string) => {
    try {
      const chapter = await service.saveChapter(outlineId, content)
      return { success: true, data: chapter }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.GET_CHAPTER_VERSIONS, async (_event, chapterId: string) => {
    try {
      const versions = await service.getChapterVersions(chapterId)
      return { success: true, data: versions }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.RESTORE_CHAPTER_VERSION, async (_event, chapterId: string, versionId: string) => {
    try {
      const chapter = await service.restoreChapterVersion(chapterId, versionId)
      return { success: true, data: chapter }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.LOCK_CHAPTER_VERSION, async (_event, versionId: string) => {
    try {
      const result = await service.lockChapterVersion(versionId)
      return { success: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ==================== AI 生成 ====================

  const aiService = LongWritingAIService.getInstance()

  ipcBridge.handle(
    CHANNELS.GENERATE_STORY_OVERVIEW,
    async (event, eventId: string, projectId: string, input: string, providerConfigId?: string, modelId?: string) => {
      console.log(`[LongWritingHandler] generateStoryOverview 被调用, eventId: ${eventId}, projectId: ${projectId}`)
      console.log(`[LongWritingHandler] providerConfigId: ${providerConfigId}, modelId: ${modelId}`)
      try {
        const window = getBrowserWindowFromEvent(event)
        if (!window) {
          return { success: false, error: '窗口不存在' }
        }
        const result = await aiService.generateStoryOverview(eventId, projectId, input, providerConfigId, modelId)
        console.log(`[LongWritingHandler] generateStoryOverview 完成, success: ${result.success}`)
        return { ...result, eventId }
      } catch (error: any) {
        console.error(`[LongWritingHandler] generateStoryOverview 错误:`, error)
        return { success: false, error: error.message }
      }
    }
  )

  ipcBridge.handle(
    CHANNELS.GENERATE_PLOTS,
    async (event, eventId: string, projectId: string, providerConfigId?: string, modelId?: string) => {
      try {
        const window = getBrowserWindowFromEvent(event)
        if (!window) {
          return { success: false, error: '窗口不存在' }
        }
        const result = await aiService.generatePlots(eventId, projectId, providerConfigId, modelId)
        return { ...result, eventId }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    }
  )

  ipcBridge.handle(
    CHANNELS.POLISH_BACKGROUND,
    async (event, eventId: string, projectId: string, field: 'eraDescription' | 'socialStructure' | 'techLevel' | 'specialRules' | 'factionDistribution' | 'geographicOrientation', eraType: string, content: string, providerConfigId?: string, modelId?: string) => {
      try {
        const window = getBrowserWindowFromEvent(event)
        if (!window) {
          return { success: false, error: '窗口不存在' }
        }
        const result = await aiService.polishBackground(eventId, projectId, field, eraType, content, providerConfigId, modelId)
        return { ...result, eventId }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    }
  )

  ipcBridge.handle(
    CHANNELS.GENERATE_LOCATIONS,
    async (event, eventId: string, projectId: string, providerConfigId?: string, modelId?: string) => {
      try {
        const window = getBrowserWindowFromEvent(event)
        if (!window) {
          return { success: false, error: '窗口不存在' }
        }
        const result = await aiService.generateLocations(eventId, projectId, providerConfigId, modelId)
        return { ...result, eventId }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    }
  )

  ipcBridge.handle(
    CHANNELS.GENERATE_FACTIONS,
    async (event, eventId: string, projectId: string, providerConfigId?: string, modelId?: string) => {
      try {
        const window = getBrowserWindowFromEvent(event)
        if (!window) {
          return { success: false, error: '窗口不存在' }
        }
        const result = await aiService.generateFactions(eventId, projectId, providerConfigId, modelId)
        return { ...result, eventId }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    }
  )

  ipcBridge.handle(
    CHANNELS.GENERATE_CHARACTERS,
    async (event, eventId: string, projectId: string, providerConfigId?: string, modelId?: string, requirements?: string) => {
      try {
        console.log(`[LongWritingHandler] generateCharacters 被调用, eventId: ${eventId}, projectId: ${projectId}`)
        const window = getBrowserWindowFromEvent(event)
        if (!window) {
          return { success: false, error: '窗口不存在' }
        }
        const result = await aiService.generateCharacters(eventId, projectId, providerConfigId, modelId, requirements)
        console.log(`[LongWritingHandler] generateCharacters 完成, success: ${result.success}, error: ${result.error || 'none'}`)
        return { ...result, eventId }
      } catch (error: any) {
        console.error(`[LongWritingHandler] generateCharacters 错误:`, error)
        return { success: false, error: error.message }
      }
    }
  )

  ipcBridge.handle(
    CHANNELS.GENERATE_SKILLS_ITEMS,
    async (event, eventId: string, projectId: string, providerConfigId?: string, modelId?: string) => {
      try {
        const window = getBrowserWindowFromEvent(event)
        if (!window) {
          return { success: false, error: '窗口不存在' }
        }
        const result = await aiService.generateSkillsItems(eventId, projectId, providerConfigId, modelId)
        return { ...result, eventId }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    }
  )

  ipcBridge.handle(
    CHANNELS.GENERATE_SKILL_ITEM_TYPES,
    async (event, eventId: string, projectId: string, providerConfigId?: string, modelId?: string) => {
      try {
        const window = getBrowserWindowFromEvent(event)
        if (!window) {
          return { success: false, error: '窗口不存在' }
        }
        const result = await aiService.generateSkillItemTypes(eventId, projectId, providerConfigId, modelId)
        return { ...result, eventId }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    }
  )

  ipcBridge.handle(
    CHANNELS.GENERATE_SKILLS_ONLY,
    async (event, eventId: string, projectId: string, providerConfigId?: string, modelId?: string) => {
      try {
        const window = getBrowserWindowFromEvent(event)
        if (!window) {
          return { success: false, error: '窗口不存在' }
        }
        const result = await aiService.generateSkillsOnly(eventId, projectId, providerConfigId, modelId)
        return { ...result, eventId }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    }
  )

  ipcBridge.handle(
    CHANNELS.GENERATE_ITEMS_ONLY,
    async (event, eventId: string, projectId: string, providerConfigId?: string, modelId?: string) => {
      try {
        const window = getBrowserWindowFromEvent(event)
        if (!window) {
          return { success: false, error: '窗口不存在' }
        }
        const result = await aiService.generateItemsOnly(eventId, projectId, providerConfigId, modelId)
        return { ...result, eventId }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    }
  )

  ipcBridge.handle(
    CHANNELS.GENERATE_OUTLINE_STORY,
    async (event, eventId: string, projectId: string, providerConfigId?: string, modelId?: string, structureLevel?: number) => {
      try {
        const window = getBrowserWindowFromEvent(event)
        if (!window) {
          return { success: false, error: '窗口不存在' }
        }
        const result = await aiService.generateOutlineStory(eventId, projectId, providerConfigId, modelId, structureLevel)
        return { ...result, eventId }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    }
  )

  ipcBridge.handle(
    CHANNELS.GENERATE_OUTLINE_COMMENT,
    async (event, eventId: string, projectId: string, providerConfigId?: string, modelId?: string) => {
      try {
        const window = getBrowserWindowFromEvent(event)
        if (!window) {
          return { success: false, error: '窗口不存在' }
        }
        const result = await aiService.generateOutlineComment(eventId, projectId, providerConfigId, modelId)
        return { ...result, eventId }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    }
  )

  ipcBridge.handle(
    CHANNELS.GENERATE_CHAPTER,
    async (event, eventId: string, projectId: string, outlineId: string, targetWords?: number, providerConfigId?: string, modelId?: string) => {
      try {
        const window = getBrowserWindowFromEvent(event)
        if (!window) {
          return { success: false, error: '窗口不存在' }
        }
        const result = await aiService.generateChapter(eventId, projectId, outlineId, targetWords, providerConfigId, modelId)
        return { ...result, eventId }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    }
  )

  ipcBridge.handle(
    CHANNELS.GENERATE_CHAPTER_PREWRITE,
    async (event, eventId: string, projectId: string, outlineId: string, providerConfigId?: string, modelId?: string) => {
      try {
        const window = getBrowserWindowFromEvent(event)
        if (!window) {
          return { success: false, error: '窗口不存在' }
        }
        const result = await aiService.generateChapterPrewrite(eventId, projectId, outlineId, providerConfigId, modelId)
        return { ...result, eventId }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    }
  )

  ipcBridge.handle(
    CHANNELS.GENERATE_SECTION,
    async (event, eventId: string, projectId: string, outlineId: string, targetWords?: number, providerConfigId?: string, modelId?: string) => {
      try {
        const window = getBrowserWindowFromEvent(event)
        if (!window) {
          return { success: false, error: '窗口不存在' }
        }
        const result = await aiService.generateSection(eventId, projectId, outlineId, targetWords, providerConfigId, modelId)
        return { ...result, eventId }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    }
  )

  // ==================== 导出功能 ====================

  /**
   * 获取导出数据
   */
  ipcBridge.handle(CHANNELS.GET_EXPORT_DATA, async (_event, projectId: string) => {
    try {
      const project = await service.getProject(projectId)
      if (!project) {
        return { success: false, error: '项目不存在' }
      }

      const exportData: any = {
        project,
        overview: null,
        background: null,
        characters: [],
        locations: [],
        skills: [],
        items: [],
        outline: [],
        chapters: []
      }

      // 根据项目类型获取数据
      if (project.type === 'story') {
        exportData.overview = await service.getStoryOverview(projectId)
        exportData.background = await service.getBackground(projectId)
        exportData.characters = await service.getCharacters(projectId)
        exportData.locations = await service.getLocations(projectId)
        exportData.skills = await service.getSkills(projectId)
        exportData.items = await service.getItems(projectId)
      }

      // 获取大纲树
      exportData.outline = await service.getOutlineTree(projectId)

      // 获取所有章节内容
      const outlineTree = exportData.outline
      const chapterContents: Record<string, string> = {}

      const fetchChapterContent = async (nodes: any[]) => {
        for (const node of nodes) {
          if (node.nodeType === 'chapter' || node.nodeType === 'section') {
            const chapter = await service.getChapter(node.id)
            if (chapter?.content) {
              chapterContents[node.id] = chapter.content
            }
          }
          if (node.children?.length) {
            await fetchChapterContent(node.children)
          }
        }
      }

      await fetchChapterContent(outlineTree)
      exportData.chapters = chapterContents

      return { success: true, data: exportData }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * 格式化导出数据为 Markdown
   */
  function formatExportMarkdown(data: any): string {
    const lines: string[] = []
    const project = data.project

    // 标题
    lines.push(`# ${project.name}`)
    lines.push('')
    lines.push(`> 类型：${project.type === 'story' ? '小说' : '评论'}`)
    lines.push('')

    if (project.type === 'story' && data.overview) {
      // 故事概要
      lines.push('## 故事概要')
      lines.push('')
      if (data.overview.title) {
        lines.push(`**标题**：${data.overview.title}`)
      }
      if (data.overview.coreTheme) {
        lines.push(`**核心主题**：${data.overview.coreTheme}`)
      }
      if (data.overview.storyIdea) {
        lines.push('')
        lines.push('**故事构思**')
        lines.push(data.overview.storyIdea)
      }
      if (data.overview.endingType) {
        lines.push('')
        lines.push(`**结局类型**：${data.overview.endingType}`)
      }
      lines.push('')

      // 背景设定
      if (data.background) {
        lines.push('## 背景设定')
        lines.push('')
        if (data.background.worldView) {
          lines.push('### 世界观')
          lines.push(data.background.worldView)
          lines.push('')
        }
        if (data.background.timeBackground) {
          lines.push('### 时代背景')
          lines.push(data.background.timeBackground)
          lines.push('')
        }
        if (data.background.magicSystem) {
          lines.push('### 力量体系')
          lines.push(data.background.magicSystem)
          lines.push('')
        }
      }

      // 地点
      if (data.locations?.length) {
        lines.push('## 地点设定')
        lines.push('')
        for (const loc of data.locations) {
          lines.push(`### ${loc.name}`)
          if (loc.description) {
            lines.push(loc.description)
          }
          lines.push('')
        }
      }

      // 角色
      if (data.characters?.length) {
        lines.push('## 角色设定')
        lines.push('')
        for (const char of data.characters) {
          lines.push(`### ${char.name}`)
          if (char.role) {
            lines.push(`**角色定位**：${char.role}`)
          }
          if (char.description) {
            lines.push(`**描述**：${char.description}`)
          }
          if (char.personality) {
            lines.push(`**性格**：${char.personality}`)
          }
          if (char.appearance) {
            lines.push(`**外貌**：${char.appearance}`)
          }
          if (char.background) {
            lines.push(`**背景**：${char.background}`)
          }
          lines.push('')
        }
      }

      // 技能
      if (data.skills?.length) {
        lines.push('## 技能设定')
        lines.push('')
        for (const skill of data.skills) {
          lines.push(`### ${skill.name}`)
          if (skill.description) {
            lines.push(skill.description)
          }
          lines.push('')
        }
      }

      // 物品
      if (data.items?.length) {
        lines.push('## 物品设定')
        lines.push('')
        for (const item of data.items) {
          lines.push(`### ${item.name}`)
          if (item.description) {
            lines.push(item.description)
          }
          lines.push('')
        }
      }
    }

    // 大纲和章节内容
    if (data.outline?.length) {
      lines.push('---')
      lines.push('')
      lines.push('## 正文')
      lines.push('')

      const processOutline = (nodes: any[], level: number = 1) => {
        for (const node of nodes) {
          const prefix = '#'.repeat(Math.min(level + 1, 6))
          lines.push(`${prefix} ${node.name}`)
          lines.push('')

          // 如果有章节内容
          if (data.chapters[node.id]) {
            lines.push(data.chapters[node.id])
            lines.push('')
          }

          // 递归处理子节点
          if (node.children?.length) {
            processOutline(node.children, level + 1)
          }
        }
      }

      processOutline(data.outline)
    }

    return lines.join('\n')
  }

  /**
   * 导出为 Markdown
   */
  ipcBridge.handle(CHANNELS.EXPORT_MARKDOWN, async (event, projectId: string) => {
    try {
      if (!isElectron) {
        return { success: false, error: '该功能仅在桌面端可用' }
      }
      const window = getBrowserWindowFromEvent(event)
      if (!window) {
        return { success: false, error: '窗口不存在' }
      }
      const { dialog, shell } = loadElectronModules()

      // 获取导出数据
      const dataResult = await service.getProject(projectId)
      if (!dataResult) {
        return { success: false, error: '项目不存在' }
      }

      // 直接调用获取数据
      const exportData: any = { project: dataResult }
      if (dataResult.type === 'story') {
        exportData.overview = await service.getStoryOverview(projectId)
        exportData.background = await service.getBackground(projectId)
        exportData.characters = await service.getCharacters(projectId)
        exportData.locations = await service.getLocations(projectId)
        exportData.skills = await service.getSkills(projectId)
        exportData.items = await service.getItems(projectId)
      }
      exportData.outline = await service.getOutlineTree(projectId)

      // 获取章节内容
      const chapterContents: Record<string, string> = {}
      const fetchChapterContent = async (nodes: any[]) => {
        for (const node of nodes) {
          if (node.nodeType === 'chapter' || node.nodeType === 'section') {
            const chapter = await service.getChapter(node.id)
            if (chapter?.content) {
              chapterContents[node.id] = chapter.content
            }
          }
          if (node.children?.length) {
            await fetchChapterContent(node.children)
          }
        }
      }
      await fetchChapterContent(exportData.outline)
      exportData.chapters = chapterContents

      // 格式化为 Markdown
      const markdown = formatExportMarkdown(exportData)

      // 选择保存路径
      const safeName = dataResult.name.replace(/[\\/:*?"<>|]/g, '_')
      const result = await dialog.showSaveDialog(window, {
        defaultPath: `${safeName}.md`,
        filters: [{ name: 'Markdown 文件', extensions: ['md'] }]
      })

      if (result.canceled || !result.filePath) {
        return { success: true, message: '用户取消' }
      }

      // 写入文件
      fs.writeFileSync(result.filePath, markdown, 'utf-8')

      // 打开文件所在目录
      shell.showItemInFolder(result.filePath)

      return { success: true, filePath: result.filePath }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * 导出为 Word 文档
   */
  ipcBridge.handle(CHANNELS.EXPORT_WORD, async (event, projectId: string) => {
    try {
      if (!isElectron) {
        return { success: false, error: '该功能仅在桌面端可用' }
      }
      const window = getBrowserWindowFromEvent(event)
      if (!window) {
        return { success: false, error: '窗口不存在' }
      }
      const { dialog, shell } = loadElectronModules()

      // 获取项目数据
      const dataResult = await service.getProject(projectId)
      if (!dataResult) {
        return { success: false, error: '项目不存在' }
      }

      // 获取导出数据
      const exportData: any = { project: dataResult }
      if (dataResult.type === 'story') {
        exportData.overview = await service.getStoryOverview(projectId)
        exportData.background = await service.getBackground(projectId)
        exportData.characters = await service.getCharacters(projectId)
        exportData.locations = await service.getLocations(projectId)
        exportData.skills = await service.getSkills(projectId)
        exportData.items = await service.getItems(projectId)
      }
      exportData.outline = await service.getOutlineTree(projectId)

      // 获取章节内容
      const chapterContents: Record<string, string> = {}
      const fetchChapterContent = async (nodes: any[]) => {
        for (const node of nodes) {
          if (node.nodeType === 'chapter' || node.nodeType === 'section') {
            const chapter = await service.getChapter(node.id)
            if (chapter?.content) {
              chapterContents[node.id] = chapter.content
            }
          }
          if (node.children?.length) {
            await fetchChapterContent(node.children)
          }
        }
      }
      await fetchChapterContent(exportData.outline)
      exportData.chapters = chapterContents

      // 格式化为 Markdown
      const markdown = formatExportMarkdown(exportData)

      // 选择保存路径
      const safeName = dataResult.name.replace(/[\\/:*?"<>|]/g, '_')
      const result = await dialog.showSaveDialog(window, {
        defaultPath: `${safeName}.docx`,
        filters: [{ name: 'Word 文档', extensions: ['docx'] }]
      })

      if (result.canceled || !result.filePath) {
        return { success: true, message: '用户取消' }
      }

      // 生成 Word 文档
      const buffer = await markdownToDocx(markdown, {
        title: dataResult.name
      })

      // 写入文件
      fs.writeFileSync(result.filePath, buffer)

      // 打开文件所在目录
      shell.showItemInFolder(result.filePath)

      return { success: true, filePath: result.filePath }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * 导出单个章节
   */
  ipcBridge.handle(CHANNELS.EXPORT_CHAPTER, async (event, data: { outlineId: string; content: string; fileName: string; format: string }) => {
    try {
      if (!isElectron) {
        return { success: false, error: '该功能仅在桌面端可用' }
      }
      const window = getBrowserWindowFromEvent(event)
      if (!window) {
        return { success: false, error: '窗口不存在' }
      }
      const { dialog, shell } = loadElectronModules()

      const { content, fileName, format } = data

      // 选择保存路径
      const safeName = fileName.replace(/[\\/:*?"<>|]/g, '_')
      const extension = format === 'txt' ? 'txt' : 'md'
      const filterName = format === 'txt' ? '文本文件' : 'Markdown 文件'

      const result = await dialog.showSaveDialog(window, {
        defaultPath: `${safeName}.${extension}`,
        filters: [{ name: filterName, extensions: [extension] }]
      })

      if (result.canceled || !result.filePath) {
        return { success: true, message: '用户取消' }
      }

      // 写入文件
      fs.writeFileSync(result.filePath, content, 'utf-8')

      // 打开文件所在目录
      shell.showItemInFolder(result.filePath)

      return { success: true, data: result.filePath }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ==================== 全局配置 ====================

  /**
   * 获取全局配置
   */
  ipcBridge.handle(CHANNELS.GET_GLOBAL_SETTINGS, async () => {
    try {
      const settings = await service.getGlobalSettings()
      return { success: true, data: settings }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * 更新全局配置
   */
  ipcBridge.handle(CHANNELS.UPDATE_GLOBAL_SETTINGS, async (_event, data: any) => {
    try {
      const settings = await service.updateGlobalSettings(data)
      return { success: true, data: settings }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ==================== 字典分类管理 ====================

  /**
   * 获取所有字典分类
   */
  ipcBridge.handle(CHANNELS.GET_DICTIONARY_CATEGORIES, async () => {
    try {
      const categories = await service.getDictionaryCategories()
      return { success: true, data: categories }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * 创建字典分类
   */
  ipcBridge.handle(CHANNELS.CREATE_DICTIONARY_CATEGORY, async (_event, code: string, name: string) => {
    try {
      const category = await service.createDictionaryCategory(code, name)
      return { success: true, data: category }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * 更新字典分类
   */
  ipcBridge.handle(CHANNELS.UPDATE_DICTIONARY_CATEGORY, async (_event, code: string, name: string) => {
    try {
      const category = await service.updateDictionaryCategory(code, name)
      return { success: true, data: category }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * 删除字典分类
   */
  ipcBridge.handle(CHANNELS.DELETE_DICTIONARY_CATEGORY, async (_event, code: string) => {
    try {
      const result = await service.deleteDictionaryCategory(code)
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ==================== 字典项管理 ====================

  /**
   * 获取所有字典项
   */
  ipcBridge.handle(CHANNELS.GET_DICTIONARY_ALL, async () => {
    try {
      const dictionary = await service.getDictionaryAll()
      return { success: true, data: dictionary }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * 获取指定分类的字典项
   */
  ipcBridge.handle(CHANNELS.GET_DICTIONARY_BY_CATEGORY, async (_event, categoryCode: string) => {
    try {
      const items = await service.getDictionaryByCategory(categoryCode)
      return { success: true, data: items }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * 创建字典项
   */
  ipcBridge.handle(CHANNELS.CREATE_DICTIONARY_ITEM, async (_event, categoryCode: string, code: string, name: string) => {
    try {
      const item = await service.createDictionaryItem(categoryCode, code, name)
      return { success: true, data: item }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * 更新字典项
   */
  ipcBridge.handle(CHANNELS.UPDATE_DICTIONARY_ITEM, async (_event, id: string, data: { code?: string; name?: string }) => {
    try {
      const item = await service.updateDictionaryItem(id, data)
      return { success: true, data: item }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * 删除字典项
   */
  ipcBridge.handle(CHANNELS.DELETE_DICTIONARY_ITEM, async (_event, id: string) => {
    try {
      const result = await service.deleteDictionaryItem(id)
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * 重排序字典项
   */
  ipcBridge.handle(CHANNELS.REORDER_DICTIONARY, async (_event, categoryCode: string, orderedIds: string[]) => {
    try {
      await service.reorderDictionary(categoryCode, orderedIds)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ==================== 项目级别类型配置 ====================

  /**
   * 获取项目的技能类型配置
   */
  ipcBridge.handle(CHANNELS.GET_SKILL_TYPE_CONFIGS, async (_event, projectId: string) => {
    try {
      const configs = await service.getSkillTypeConfigs(projectId)
      return { success: true, data: configs }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * 创建技能类型配置
   */
  ipcBridge.handle(CHANNELS.CREATE_SKILL_TYPE_CONFIG, async (_event, data: CreateSkillTypeConfigRequest) => {
    try {
      const config = await service.createSkillTypeConfig(data)
      return { success: true, data: config }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * 更新技能类型配置
   */
  ipcBridge.handle(CHANNELS.UPDATE_SKILL_TYPE_CONFIG, async (_event, id: string, data: UpdateSkillTypeConfigRequest) => {
    try {
      const config = await service.updateSkillTypeConfig(id, data)
      return { success: true, data: config }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * 删除技能类型配置
   */
  ipcBridge.handle(CHANNELS.DELETE_SKILL_TYPE_CONFIG, async (_event, id: string) => {
    try {
      const result = await service.deleteSkillTypeConfig(id)
      return { success: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * 获取项目的物品类型配置
   */
  ipcBridge.handle(CHANNELS.GET_ITEM_TYPE_CONFIGS, async (_event, projectId: string) => {
    try {
      const configs = await service.getItemTypeConfigs(projectId)
      return { success: true, data: configs }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * 创建物品类型配置
   */
  ipcBridge.handle(CHANNELS.CREATE_ITEM_TYPE_CONFIG, async (_event, data: CreateItemTypeConfigRequest) => {
    try {
      const config = await service.createItemTypeConfig(data)
      return { success: true, data: config }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * 更新物品类型配置
   */
  ipcBridge.handle(CHANNELS.UPDATE_ITEM_TYPE_CONFIG, async (_event, id: string, data: UpdateItemTypeConfigRequest) => {
    try {
      const config = await service.updateItemTypeConfig(id, data)
      return { success: true, data: config }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * 删除物品类型配置
   */
  ipcBridge.handle(CHANNELS.DELETE_ITEM_TYPE_CONFIG, async (_event, id: string) => {
    try {
      const result = await service.deleteItemTypeConfig(id)
      return { success: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * 初始化项目的默认类型配置
   */
  ipcBridge.handle(CHANNELS.INIT_DEFAULT_TYPE_CONFIGS, async (_event, projectId: string) => {
    try {
      await service.initDefaultTypeConfigs(projectId)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ==================== 技能等级配置 ====================

  /**
   * 获取技能类型的等级列表
   */
  ipcBridge.handle(CHANNELS.GET_SKILL_LEVELS, async (_event, projectId: string, skillTypeCode: string) => {
    try {
      const levels = await service.getSkillLevels(projectId, skillTypeCode)
      return { success: true, data: levels }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * 创建技能等级
   */
  ipcBridge.handle(CHANNELS.CREATE_SKILL_LEVEL, async (_event, data: CreateSkillLevelRequest) => {
    try {
      const level = await service.createSkillLevel(data)
      return { success: true, data: level }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * 更新技能等级
   */
  ipcBridge.handle(CHANNELS.UPDATE_SKILL_LEVEL, async (_event, id: string, data: UpdateSkillLevelRequest) => {
    try {
      const level = await service.updateSkillLevel(id, data)
      return { success: true, data: level }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * 删除技能等级
   */
  ipcBridge.handle(CHANNELS.DELETE_SKILL_LEVEL, async (_event, id: string) => {
    try {
      await service.deleteSkillLevel(id)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * 重排序技能等级
   */
  ipcBridge.handle(CHANNELS.REORDER_SKILL_LEVELS, async (_event, projectId: string, skillTypeCode: string, orderedIds: string[]) => {
    try {
      await service.reorderSkillLevels(projectId, skillTypeCode, orderedIds)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ==================== 物品等级配置 ====================

  /**
   * 获取物品类型的等级列表
   */
  ipcBridge.handle(CHANNELS.GET_ITEM_LEVELS, async (_event, projectId: string, itemTypeCode: string) => {
    try {
      const levels = await service.getItemLevels(projectId, itemTypeCode)
      return { success: true, data: levels }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * 创建物品等级
   */
  ipcBridge.handle(CHANNELS.CREATE_ITEM_LEVEL, async (_event, data: CreateItemLevelRequest) => {
    try {
      const level = await service.createItemLevel(data)
      return { success: true, data: level }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * 更新物品等级
   */
  ipcBridge.handle(CHANNELS.UPDATE_ITEM_LEVEL, async (_event, id: string, data: UpdateItemLevelRequest) => {
    try {
      const level = await service.updateItemLevel(id, data)
      return { success: true, data: level }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * 删除物品等级
   */
  ipcBridge.handle(CHANNELS.DELETE_ITEM_LEVEL, async (_event, id: string) => {
    try {
      await service.deleteItemLevel(id)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * 重排序物品等级
   */
  ipcBridge.handle(CHANNELS.REORDER_ITEM_LEVELS, async (_event, projectId: string, itemTypeCode: string, orderedIds: string[]) => {
    try {
      await service.reorderItemLevels(projectId, itemTypeCode, orderedIds)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ==================== 章节预写 ====================

  /**
   * 获取预写
   */
  ipcBridge.handle(CHANNELS.GET_PREWRITE, async (_event, outlineId: string) => {
    try {
      const prewrite = await service.getPrewrite(outlineId)
      return { success: true, data: prewrite }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * 保存预写
   */
  ipcBridge.handle(CHANNELS.SAVE_PREWRITE, async (_event, data: CreatePrewriteRequest) => {
    try {
      const prewrite = await service.savePrewrite(data)
      return { success: true, data: prewrite }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * 确认预写
   */
  ipcBridge.handle(CHANNELS.CONFIRM_PREWRITE, async (_event, outlineId: string) => {
    try {
      const prewrite = await service.confirmPrewrite(outlineId)
      return { success: true, data: prewrite }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * 删除预写
   */
  ipcBridge.handle(CHANNELS.DELETE_PREWRITE, async (_event, outlineId: string) => {
    try {
      await service.deletePrewrite(outlineId)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ==================== 故事记忆 ====================

  /**
   * 获取项目的所有记忆
   */
  ipcBridge.handle(CHANNELS.GET_MEMORIES, async (_event, projectId: string) => {
    try {
      const memories = await service.getMemories(projectId)
      return { success: true, data: memories }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * 获取章节之前的记忆
   */
  ipcBridge.handle(CHANNELS.GET_MEMORIES_BEFORE_CHAPTER, async (_event, projectId: string, chapterNumber: number) => {
    try {
      const memories = await service.getMemoriesBeforeChapter(projectId, chapterNumber)
      return { success: true, data: memories }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * 获取单个记忆
   */
  ipcBridge.handle(CHANNELS.GET_MEMORY, async (_event, id: string) => {
    try {
      const memory = await service.getMemory(id)
      return { success: true, data: memory }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * 创建记忆
   */
  ipcBridge.handle(CHANNELS.CREATE_MEMORY, async (_event, data: CreateMemoryRequest) => {
    try {
      const memory = await service.createMemory(data)
      return { success: true, data: memory }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * 批量创建记忆
   */
  ipcBridge.handle(CHANNELS.BATCH_CREATE_MEMORIES, async (_event, dataList: CreateMemoryRequest[]) => {
    try {
      const memories = await service.batchCreateMemories(dataList)
      return { success: true, data: memories }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * 更新记忆
   */
  ipcBridge.handle(CHANNELS.UPDATE_MEMORY, async (_event, id: string, data: UpdateMemoryRequest) => {
    try {
      const memory = await service.updateMemory(id, data)
      return { success: true, data: memory }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * 删除记忆
   */
  ipcBridge.handle(CHANNELS.DELETE_MEMORY, async (_event, id: string) => {
    try {
      await service.deleteMemory(id)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * 切换记忆生效状态
   */
  ipcBridge.handle(CHANNELS.TOGGLE_MEMORY_ACTIVE, async (_event, id: string) => {
    try {
      const memory = await service.toggleMemoryActive(id)
      return { success: true, data: memory }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * 获取记忆统计
   */
  ipcBridge.handle(CHANNELS.GET_MEMORY_STATS, async (_event, projectId: string) => {
    try {
      const stats = await service.getMemoryStats(projectId)
      return { success: true, data: stats }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ==================== AI 记忆提取 ====================

  /**
   * AI 提取记忆
   */
  ipcBridge.handle(CHANNELS.EXTRACT_MEMORIES, async (_event, projectId: string, outlineId: string, prewriteContent: string, chapterNumber: number, providerConfigId?: string, modelId?: string) => {
    try {
      const eventId = `extract-memories-${outlineId}-${Date.now()}`
      const aiService = LongWritingAIService.getInstance()
      const result = await aiService.extractMemories(
        eventId,
        projectId,
        outlineId,
        prewriteContent,
        chapterNumber,
        providerConfigId,
        modelId
      )
      return result
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ==================== 实体状态快照 ====================

  /**
   * 获取项目的所有状态快照
   */
  ipcBridge.handle(CHANNELS.GET_ENTITY_STATE_SNAPSHOTS, async (_event, projectId: string) => {
    try {
      const snapshots = await service.getEntityStateSnapshots(projectId)
      return { success: true, data: snapshots }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * 获取实体在指定章节的状态快照
   */
  ipcBridge.handle(CHANNELS.GET_ENTITY_STATE_AT_CHAPTER, async (_event, projectId: string, entityType: string, entityId: string, chapterNumber: number) => {
    try {
      const snapshot = await service.getEntityStateAtChapter(projectId, entityType as any, entityId, chapterNumber)
      return { success: true, data: snapshot }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * 批量获取多个实体在指定章节的状态快照
   */
  ipcBridge.handle(CHANNELS.GET_ENTITIES_STATES_FOR_CHAPTER, async (_event, projectId: string, chapterNumber: number, entities: Array<{ entityType: string; entityId: string }>) => {
    try {
      const snapshots = await service.getEntitiesStatesForChapter(projectId, chapterNumber, entities as any)
      return { success: true, data: snapshots }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * 获取指定章节的所有状态快照
   */
  ipcBridge.handle(CHANNELS.GET_ENTITY_STATES_BY_CHAPTER, async (_event, projectId: string, chapterNumber: number) => {
    try {
      const snapshots = await service.getEntityStatesByChapter(projectId, chapterNumber)
      return { success: true, data: snapshots }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * 获取单个状态快照
   */
  ipcBridge.handle(CHANNELS.GET_ENTITY_STATE_SNAPSHOT, async (_event, id: string) => {
    try {
      const snapshot = await service.getEntityStateSnapshot(id)
      return { success: true, data: snapshot }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * 创建状态快照
   */
  ipcBridge.handle(CHANNELS.CREATE_ENTITY_STATE_SNAPSHOT, async (_event, data: any) => {
    try {
      const snapshot = await service.createEntityStateSnapshot(data)
      return { success: true, data: snapshot }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * 批量创建状态快照
   */
  ipcBridge.handle(CHANNELS.BATCH_CREATE_ENTITY_STATE_SNAPSHOTS, async (_event, dataList: any[]) => {
    try {
      const snapshots = await service.batchCreateEntityStateSnapshots(dataList)
      return { success: true, data: snapshots }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * 更新或创建状态快照
   */
  ipcBridge.handle(CHANNELS.UPSERT_ENTITY_STATE_SNAPSHOT, async (_event, data: any) => {
    try {
      const snapshot = await service.upsertEntityStateSnapshot(data)
      return { success: true, data: snapshot }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * 更新状态快照
   */
  ipcBridge.handle(CHANNELS.UPDATE_ENTITY_STATE_SNAPSHOT, async (_event, id: string, data: any) => {
    try {
      const snapshot = await service.updateEntityStateSnapshot(id, data)
      return { success: true, data: snapshot }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * 删除状态快照
   */
  ipcBridge.handle(CHANNELS.DELETE_ENTITY_STATE_SNAPSHOT, async (_event, id: string) => {
    try {
      await service.deleteEntityStateSnapshot(id)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * 删除指定章节的所有状态快照
   */
  ipcBridge.handle(CHANNELS.DELETE_ENTITY_STATES_BY_CHAPTER, async (_event, projectId: string, chapterNumber: number) => {
    try {
      const count = await service.deleteEntityStatesByChapter(projectId, chapterNumber)
      return { success: true, data: count }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * 获取状态快照统计
   */
  ipcBridge.handle(CHANNELS.GET_SNAPSHOT_STATS, async (_event, projectId: string) => {
    try {
      const stats = await service.getSnapshotStats(projectId)
      return { success: true, data: stats }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ==================== AI 实体状态提取 ====================

  /**
   * AI 提取实体状态
   */
  ipcBridge.handle(CHANNELS.EXTRACT_ENTITY_STATES, async (_event, projectId: string, outlineId: string, chapterContent: string, chapterNumber: number, involvedEntities: Array<{ type: string; id: string; name: string }>, providerConfigId?: string, modelId?: string) => {
    try {
      const eventId = `extract-entity-states-${outlineId}-${Date.now()}`
      const aiService = LongWritingAIService.getInstance()
      const result = await aiService.extractEntityStates(
        eventId,
        projectId,
        outlineId,
        chapterContent,
        chapterNumber,
        involvedEntities,
        providerConfigId,
        modelId
      )
      return result
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * AI 识别章节涉及的实体（角色、地点等）
   */
  ipcBridge.handle(CHANNELS.RECOGNIZE_CHAPTER_ENTITIES, async (_event, projectId: string, chapterContent: string, providerConfigId?: string, modelId?: string) => {
    try {
      const eventId = `recognize-chapter-entities-${projectId}-${Date.now()}`
      const aiService = LongWritingAIService.getInstance()
      const result = await aiService.recognizeChapterEntities(
        eventId,
        projectId,
        chapterContent,
        providerConfigId,
        modelId
      )
      return result
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ==================== 数据迁移 ====================
  ipcBridge.handle(CHANNELS.BACKUP_DATABASE, async () => {
    try {
      const { LwMigrationService } = await import('../../services/lw-migration.service')
      const backupPath = LwMigrationService.backupDatabase()
      return { success: !!backupPath, data: backupPath }
    } catch (error: any) {
      console.error('[IPC] 备份数据库失败:', error)
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.MIGRATE_PROJECT, async (_event, projectId: string, autoBackup: boolean = true) => {
    try {
      const { LwMigrationService } = await import('../../services/lw-migration.service')
      const result = await LwMigrationService.migrateProject(projectId, autoBackup)
      return { success: result.success, data: result }
    } catch (error: any) {
      console.error('[IPC] 迁移项目失败:', error)
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.MIGRATE_ALL_PROJECTS, async (_event, autoBackup: boolean = true) => {
    try {
      const { LwMigrationService } = await import('../../services/lw-migration.service')
      const results = await LwMigrationService.migrateAllProjects(autoBackup)
      return { success: true, data: results }
    } catch (error: any) {
      console.error('[IPC] 迁移所有项目失败:', error)
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.CHECK_NEEDS_MIGRATION, async (_event, projectId: string) => {
    try {
      const { LwMigrationService } = await import('../../services/lw-migration.service')
      const needsMigration = LwMigrationService.checkNeedsMigration(projectId)
      return { success: true, data: needsMigration }
    } catch (error: any) {
      console.error('[IPC] 检查迁移需求失败:', error)
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(CHANNELS.GET_MIGRATION_STATS, async (_event, projectId: string) => {
    try {
      const { LwMigrationService } = await import('../../services/lw-migration.service')
      const stats = LwMigrationService.getMigrationStats(projectId)
      return { success: true, data: stats }
    } catch (error: any) {
      console.error('[IPC] 获取迁移统计失败:', error)
      return { success: false, error: error.message }
    }
  })

  // ==================== 新实体检测 ====================

  // 检测文本中的新实体
  ipcBridge.handle(CHANNELS.DETECT_NEW_ENTITIES, async (
    _event,
    projectId: string,
    text: string,
    sourceOutlineId?: string,
    chapterNumber?: number
  ) => {
    try {
      const { LwEntityDetectionService } = await import('@core/services/lw-entity-detection.service')
      const result = await LwEntityDetectionService.detectNewEntities(
        projectId,
        text,
        sourceOutlineId,
        chapterNumber
      )
      return { success: true, data: result }
    } catch (error: any) {
      console.error('[IPC] 检测新实体失败:', error)
      return { success: false, error: error.message }
    }
  })

  // 自动添加实体
  ipcBridge.handle(CHANNELS.AUTO_ADD_ENTITIES, async (
    _event,
    projectId: string,
    characters?: any[],
    locations?: any[],
    items?: any[]
  ) => {
    try {
      const { LwEntityDetectionService } = await import('@core/services/lw-entity-detection.service')
      const result = await LwEntityDetectionService.autoAddEntities(
        projectId,
        characters,
        locations,
        items
      )
      return { success: true, data: result }
    } catch (error: any) {
      console.error('[IPC] 自动添加实体失败:', error)
      return { success: false, error: error.message }
    }
  })

  // ==================== 项目步骤模型配置 ====================

  // 获取项目的所有步骤模型配置
  ipcBridge.handle(CHANNELS.GET_STAGE_MODEL_CONFIGS, async (_event, projectId: string) => {
    try {
      const dbManager = getCoreDatabaseManager()
      if (!dbManager.lwProjectModelConfigs) {
        return { success: false, error: '数据库未初始化' }
      }
      const configs = await dbManager.lwProjectModelConfigs.getByProjectId(projectId)
      return { success: true, data: configs }
    } catch (error: any) {
      console.error('[IPC] 获取步骤模型配置失败:', error)
      return { success: false, error: error.message }
    }
  })

  // 获取单个步骤的模型配置
  ipcBridge.handle(CHANNELS.GET_STAGE_MODEL_CONFIG, async (_event, projectId: string, stage: string) => {
    try {
      const dbManager = getCoreDatabaseManager()
      if (!dbManager.lwProjectModelConfigs) {
        return { success: false, error: '数据库未初始化' }
      }
      const config = await dbManager.lwProjectModelConfigs.getByProjectAndStage(projectId, stage as any)
      return { success: true, data: config }
    } catch (error: any) {
      console.error('[IPC] 获取步骤模型配置失败:', error)
      return { success: false, error: error.message }
    }
  })

  // 设置单个步骤的模型配置
  ipcBridge.handle(CHANNELS.SET_STAGE_MODEL_CONFIG, async (
    _event,
    projectId: string,
    stage: string,
    providerConfigId: string,
    modelId: string
  ) => {
    try {
      const dbManager = getCoreDatabaseManager()
      if (!dbManager.lwProjectModelConfigs) {
        return { success: false, error: '数据库未初始化' }
      }
      const config = await dbManager.lwProjectModelConfigs.upsert(projectId, stage as any, providerConfigId, modelId)
      return { success: true, data: config }
    } catch (error: any) {
      console.error('[IPC] 设置步骤模型配置失败:', error)
      return { success: false, error: error.message }
    }
  })

  // 批量设置步骤模型配置
  ipcBridge.handle(CHANNELS.SET_STAGE_MODEL_CONFIGS, async (
    _event,
    projectId: string,
    configs: Array<{ stage: string; providerConfigId: string; modelId: string }>
  ) => {
    try {
      const dbManager = getCoreDatabaseManager()
      if (!dbManager.lwProjectModelConfigs) {
        return { success: false, error: '数据库未初始化' }
      }
      await dbManager.lwProjectModelConfigs.upsertMany(configs.map(c => ({
        projectId,
        stage: c.stage as any,
        providerConfigId: c.providerConfigId,
        modelId: c.modelId
      })))
      const result = await dbManager.lwProjectModelConfigs.getByProjectId(projectId)
      return { success: true, data: result }
    } catch (error: any) {
      console.error('[IPC] 批量设置步骤模型配置失败:', error)
      return { success: false, error: error.message }
    }
  })

  // ==================== 章节状态摘要 ====================

  // 获取项目的所有章节状态摘要
  ipcBridge.handle(CHANNELS.GET_CHAPTER_STATE_SUMMARIES, async (_event, projectId: string) => {
    try {
      const dbManager = getCoreDatabaseManager()
      if (!dbManager.lwChapterStateSummaries) {
        return { success: false, error: '数据库未初始化' }
      }
      const summaries = await dbManager.lwChapterStateSummaries.getByProjectId(projectId)
      return { success: true, data: summaries }
    } catch (error: any) {
      console.error('[IPC] 获取章节状态摘要列表失败:', error)
      return { success: false, error: error.message }
    }
  })

  // 获取单个章节状态摘要
  ipcBridge.handle(CHANNELS.GET_CHAPTER_STATE_SUMMARY, async (_event, id: string) => {
    try {
      const dbManager = getCoreDatabaseManager()
      if (!dbManager.lwChapterStateSummaries) {
        return { success: false, error: '数据库未初始化' }
      }
      const summary = await dbManager.lwChapterStateSummaries.getById(id)
      return { success: true, data: summary }
    } catch (error: any) {
      console.error('[IPC] 获取章节状态摘要失败:', error)
      return { success: false, error: error.message }
    }
  })

  // 根据大纲 ID 获取章节状态摘要
  ipcBridge.handle(CHANNELS.GET_CHAPTER_STATE_SUMMARY_BY_OUTLINE, async (_event, outlineId: string) => {
    try {
      const dbManager = getCoreDatabaseManager()
      if (!dbManager.lwChapterStateSummaries) {
        return { success: false, error: '数据库未初始化' }
      }
      const summary = await dbManager.lwChapterStateSummaries.getByOutlineId(outlineId)
      return { success: true, data: summary }
    } catch (error: any) {
      console.error('[IPC] 根据大纲获取章节状态摘要失败:', error)
      return { success: false, error: error.message }
    }
  })

  // 获取项目的最新章节状态摘要
  ipcBridge.handle(CHANNELS.GET_LATEST_CHAPTER_STATE_SUMMARY, async (_event, projectId: string) => {
    try {
      const dbManager = getCoreDatabaseManager()
      if (!dbManager.lwChapterStateSummaries) {
        return { success: false, error: '数据库未初始化' }
      }
      const summary = await dbManager.lwChapterStateSummaries.getLatest(projectId)
      return { success: true, data: summary }
    } catch (error: any) {
      console.error('[IPC] 获取最新章节状态摘要失败:', error)
      return { success: false, error: error.message }
    }
  })

  // AI 提取章节状态摘要
  ipcBridge.handle(CHANNELS.EXTRACT_CHAPTER_STATE_SUMMARY, async (
    _event,
    projectId: string,
    outlineId: string,
    chapterNumber: number,
    chapterContent: string,
    providerConfigId?: string,
    modelId?: string
  ) => {
    try {
      const dbManager = getCoreDatabaseManager()
      if (!dbManager.lwChapterStateSummaries) {
        return { success: false, error: '数据库未初始化' }
      }

      // 获取上一章的状态摘要（用于传递给 AI）
      const previousSummary = await dbManager.lwChapterStateSummaries.getLatestBeforeChapter(projectId, chapterNumber)

      const aiService = LongWritingAIService.getInstance()
      const result = await aiService.extractChapterStateSummary(
        `extract-state-${Date.now()}`,
        projectId,
        outlineId,
        chapterContent,
        chapterNumber,
        previousSummary ? {
          storyTime: previousSummary.storyTime,
          currentLocation: previousSummary.currentLocation,
          characterStates: previousSummary.characterStates,
          pendingEvents: previousSummary.pendingEvents
        } : undefined,
        providerConfigId,
        modelId
      )
      return result
    } catch (error: any) {
      console.error('[IPC] AI 提取章节状态摘要失败:', error)
      return { success: false, error: error.message }
    }
  })

  // 保存章节状态摘要
  ipcBridge.handle(CHANNELS.SAVE_CHAPTER_STATE_SUMMARY, async (
    _event,
    data: {
      projectId: string
      outlineId: string
      chapterNumber: number
      storyTime: string
      currentLocation: string
      characterStates: string
      pendingEvents: string
      keyChanges: string
    }
  ) => {
    try {
      const dbManager = getCoreDatabaseManager()
      if (!dbManager.lwChapterStateSummaries) {
        return { success: false, error: '数据库未初始化' }
      }
      const summary = await dbManager.lwChapterStateSummaries.upsert(data)
      return { success: true, data: summary }
    } catch (error: any) {
      console.error('[IPC] 保存章节状态摘要失败:', error)
      return { success: false, error: error.message }
    }
  })

  console.log('[IPC] 长文写作处理器已注册')
}