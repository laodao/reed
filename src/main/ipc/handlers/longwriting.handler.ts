/**
 * 长文写作 IPC 处理器
 * @module ipc/handlers/longwriting.handler
 */

import { ipcMain, BrowserWindow, dialog, shell } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { LongWritingService } from '../../services/longwriting.service'
import { LongWritingAIService } from '../../services/longwriting-ai.service'
import { MaterialProcessorService } from '../../services/material-processor.service'
import { markdownToDocx } from '../../utils/markdown-to-docx'
import {
  CreateProjectRequest,
  UpdateProjectRequest,
  CreateCharacterRequest,
  UpdateCharacterRequest,
  CreateOutlineRequest,
  UpdateOutlineRequest,
  CreatePlotRequest,
  UpdatePlotRequest
} from '../../shared/types/longwriting.types'

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
  GENERATE_OUTLINE_STORY: 'longwriting:generateOutlineStory',
  GENERATE_OUTLINE_COMMENT: 'longwriting:generateOutlineComment',
  GENERATE_CHAPTER: 'longwriting:generateChapter',
  GENERATE_SECTION: 'longwriting:generateSection',

  // 导出
  EXPORT_MARKDOWN: 'longwriting:exportMarkdown',
  EXPORT_WORD: 'longwriting:exportWord',
  GET_EXPORT_DATA: 'longwriting:getExportData'
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

  ipcMain.handle(CHANNELS.GET_PROJECTS, async () => {
    try {
      const projects = await service.getProjects()
      // 序列化所有项目
      const serializedProjects = projects.map(serializeProject)
      return { success: true, data: serializedProjects }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(CHANNELS.GET_PROJECT, async (_event, id: string) => {
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

  ipcMain.handle(CHANNELS.CREATE_PROJECT, async (_event, data: CreateProjectRequest) => {
    try {
      const project = await service.createProject(data)
      return { success: true, data: serializeProject(project) }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(CHANNELS.UPDATE_PROJECT, async (_event, id: string, data: UpdateProjectRequest) => {
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

  ipcMain.handle(CHANNELS.DELETE_PROJECT, async (_event, id: string) => {
    try {
      const result = await service.deleteProject(id)
      return { success: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ==================== 故事概要 ====================

  ipcMain.handle(CHANNELS.GET_STORY_OVERVIEW, async (_event, projectId: string) => {
    try {
      const overview = await service.getStoryOverview(projectId)
      return { success: true, data: overview }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(CHANNELS.UPDATE_STORY_OVERVIEW, async (_event, projectId: string, data: any) => {
    try {
      const overview = await service.updateStoryOverview(projectId, data)
      return { success: true, data: overview }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(CHANNELS.LOCK_STORY_OVERVIEW, async (_event, projectId: string, locked: boolean) => {
    try {
      const result = await service.lockStoryOverview(projectId, locked)
      return { success: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ==================== 角色管理 ====================

  ipcMain.handle(CHANNELS.GET_CHARACTERS, async (_event, projectId: string) => {
    try {
      const characters = await service.getCharacters(projectId)
      return { success: true, data: characters }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(CHANNELS.GET_CHARACTER, async (_event, id: string) => {
    try {
      const character = await service.getCharacter(id)
      return { success: true, data: character }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(CHANNELS.CREATE_CHARACTER, async (_event, data: CreateCharacterRequest) => {
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

  ipcMain.handle(CHANNELS.UPDATE_CHARACTER, async (_event, id: string, data: UpdateCharacterRequest) => {
    try {
      const character = await service.updateCharacter(id, data)
      return { success: true, data: character }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(CHANNELS.DELETE_CHARACTER, async (_event, id: string) => {
    try {
      const result = await service.deleteCharacter(id)
      return { success: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(CHANNELS.LINK_PORTRAIT, async (_event, characterId: string, portraitId: string) => {
    try {
      const character = await service.linkPortrait(characterId, portraitId)
      return { success: true, data: character }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(CHANNELS.UNLINK_PORTRAIT, async (_event, characterId: string) => {
    try {
      const character = await service.unlinkPortrait(characterId)
      return { success: true, data: character }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ==================== 背景设定 ====================

  ipcMain.handle(CHANNELS.GET_BACKGROUND, async (_event, projectId: string) => {
    try {
      const background = await service.getBackground(projectId)
      return { success: true, data: background }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(CHANNELS.UPDATE_BACKGROUND, async (_event, projectId: string, data: any) => {
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

  ipcMain.handle(CHANNELS.GET_LOCATIONS, async (_event, projectId: string) => {
    try {
      const locations = await service.getLocations(projectId)
      return { success: true, data: locations }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(CHANNELS.GET_LOCATION, async (_event, id: string) => {
    try {
      const location = await service.getLocation(id)
      return { success: true, data: location }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(CHANNELS.CREATE_LOCATION, async (_event, data: any) => {
    try {
      const location = await service.createLocation(data)
      return { success: true, data: location }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(CHANNELS.UPDATE_LOCATION, async (_event, id: string, data: any) => {
    try {
      const location = await service.updateLocation(id, data)
      return { success: true, data: location }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(CHANNELS.DELETE_LOCATION, async (_event, id: string) => {
    try {
      const result = await service.deleteLocation(id)
      return { success: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ==================== 情节管理 ====================

  ipcMain.handle(CHANNELS.GET_PLOTS, async (_event, projectId: string) => {
    try {
      const plots = await service.getPlots(projectId)
      return { success: true, data: plots }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(CHANNELS.GET_PLOT, async (_event, id: string) => {
    try {
      const plot = await service.getPlot(id)
      return { success: true, data: plot }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(CHANNELS.CREATE_PLOT, async (_event, data: CreatePlotRequest) => {
    try {
      const plot = await service.createPlot(data)
      return { success: true, data: plot }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(CHANNELS.BATCH_CREATE_PLOTS, async (_event, projectId: string, plots: { title: string; summary: string; involvedCharacters?: string[] }[]) => {
    try {
      const result = await service.batchCreatePlots(projectId, plots)
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(CHANNELS.UPDATE_PLOT, async (_event, id: string, data: UpdatePlotRequest) => {
    try {
      const plot = await service.updatePlot(id, data)
      return { success: true, data: plot }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(CHANNELS.REORDER_PLOTS, async (_event, projectId: string, orderList: { id: string; order: number }[]) => {
    try {
      const result = await service.reorderPlots(projectId, orderList)
      return { success: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(CHANNELS.DELETE_PLOT, async (_event, id: string) => {
    try {
      const result = await service.deletePlot(id)
      return { success: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(CHANNELS.GET_PLOT_COUNT, async (_event, projectId: string) => {
    try {
      const count = await service.getPlotCount(projectId)
      return { success: true, data: count }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ==================== 角色关系 ====================

  ipcMain.handle(CHANNELS.GET_CHARACTER_RELATIONS, async (_event, characterId: string) => {
    try {
      const relations = await service.getCharacterRelations(characterId)
      return { success: true, data: relations }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(CHANNELS.CREATE_CHARACTER_RELATION, async (_event, data: any) => {
    try {
      const relation = await service.createCharacterRelation(data)
      return { success: true, data: relation }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(CHANNELS.DELETE_CHARACTER_RELATION, async (_event, id: string) => {
    try {
      const result = await service.deleteCharacterRelation(id)
      return { success: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ==================== 技能管理 ====================

  ipcMain.handle(CHANNELS.GET_SKILLS, async (_event, projectId: string) => {
    try {
      const skills = await service.getSkills(projectId)
      return { success: true, data: skills }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(CHANNELS.GET_SKILL, async (_event, id: string) => {
    try {
      const skill = await service.getSkill(id)
      return { success: true, data: skill }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(CHANNELS.CREATE_SKILL, async (_event, data: any) => {
    try {
      const skill = await service.createSkill(data)
      return { success: true, data: skill }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(CHANNELS.UPDATE_SKILL, async (_event, id: string, data: any) => {
    try {
      const skill = await service.updateSkill(id, data)
      return { success: true, data: skill }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(CHANNELS.DELETE_SKILL, async (_event, id: string) => {
    try {
      const result = await service.deleteSkill(id)
      return { success: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ==================== 物品管理 ====================

  ipcMain.handle(CHANNELS.GET_ITEMS, async (_event, projectId: string) => {
    try {
      const items = await service.getItems(projectId)
      return { success: true, data: items }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(CHANNELS.GET_ITEM, async (_event, id: string) => {
    try {
      const item = await service.getItem(id)
      return { success: true, data: item }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(CHANNELS.CREATE_ITEM, async (_event, data: any) => {
    try {
      const item = await service.createItem(data)
      return { success: true, data: item }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(CHANNELS.UPDATE_ITEM, async (_event, id: string, data: any) => {
    try {
      const item = await service.updateItem(id, data)
      return { success: true, data: item }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(CHANNELS.DELETE_ITEM, async (_event, id: string) => {
    try {
      const result = await service.deleteItem(id)
      return { success: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ==================== 素材管理 ====================

  ipcMain.handle(CHANNELS.GET_MATERIALS, async (_event, projectId: string) => {
    try {
      const materials = await service.getMaterials(projectId)
      return { success: true, data: materials }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(CHANNELS.GET_MATERIAL, async (_event, id: string) => {
    try {
      const material = await service.getMaterial(id)
      return { success: true, data: material }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(CHANNELS.CREATE_MATERIAL, async (_event, data: any) => {
    try {
      const material = await service.createMaterial(data)
      return { success: true, data: material }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(CHANNELS.UPDATE_MATERIAL, async (_event, id: string, data: any) => {
    try {
      const material = await service.updateMaterial(id, data)
      return { success: true, data: material }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(CHANNELS.UPDATE_MATERIAL_STATUS, async (_event, id: string, status: string, errorMessage?: string) => {
    try {
      const result = await service.updateMaterialStatus(id, status, errorMessage)
      return { success: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(CHANNELS.DELETE_MATERIAL, async (_event, id: string) => {
    try {
      const result = await service.deleteMaterial(id)
      return { success: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(CHANNELS.PROCESS_MATERIAL, async (_event, id: string) => {
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

  ipcMain.handle(CHANNELS.GET_OUTLINE_TREE, async (_event, projectId: string) => {
    try {
      const outlines = await service.getOutlineTree(projectId)
      return { success: true, data: outlines }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(CHANNELS.GET_OUTLINE, async (_event, id: string) => {
    try {
      const outline = await service.getOutline(id)
      return { success: true, data: outline }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(CHANNELS.CREATE_OUTLINE, async (_event, data: CreateOutlineRequest) => {
    try {
      const outline = await service.createOutline(data)
      return { success: true, data: outline }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(CHANNELS.UPDATE_OUTLINE, async (_event, id: string, data: UpdateOutlineRequest) => {
    try {
      const outline = await service.updateOutline(id, data)
      return { success: true, data: outline }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(CHANNELS.DELETE_OUTLINE, async (_event, id: string) => {
    try {
      const result = await service.deleteOutline(id)
      return { success: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(CHANNELS.MOVE_OUTLINE, async (_event, id: string, newParentId: string | null) => {
    try {
      const result = await service.moveOutline(id, newParentId)
      return { success: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ==================== 章节管理 ====================

  ipcMain.handle(CHANNELS.GET_CHAPTER, async (_event, outlineId: string) => {
    try {
      const chapter = await service.getChapter(outlineId)
      return { success: true, data: chapter }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(CHANNELS.SAVE_CHAPTER, async (_event, outlineId: string, content: string) => {
    try {
      const chapter = await service.saveChapter(outlineId, content)
      return { success: true, data: chapter }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(CHANNELS.GET_CHAPTER_VERSIONS, async (_event, chapterId: string) => {
    try {
      const versions = await service.getChapterVersions(chapterId)
      return { success: true, data: versions }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(CHANNELS.RESTORE_CHAPTER_VERSION, async (_event, chapterId: string, versionId: string) => {
    try {
      const chapter = await service.restoreChapterVersion(chapterId, versionId)
      return { success: true, data: chapter }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(CHANNELS.LOCK_CHAPTER_VERSION, async (_event, versionId: string) => {
    try {
      const result = await service.lockChapterVersion(versionId)
      return { success: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ==================== AI 生成 ====================

  const aiService = LongWritingAIService.getInstance()

  ipcMain.handle(
    CHANNELS.GENERATE_STORY_OVERVIEW,
    async (event, eventId: string, projectId: string, input: string, providerConfigId?: string, modelId?: string) => {
      console.log(`[LongWritingHandler] generateStoryOverview 被调用, eventId: ${eventId}, projectId: ${projectId}`)
      console.log(`[LongWritingHandler] providerConfigId: ${providerConfigId}, modelId: ${modelId}`)
      try {
        const window = BrowserWindow.fromWebContents(event.sender)
        if (!window) {
          return { success: false, error: '窗口不存在' }
        }
        const result = await aiService.generateStoryOverview(window, eventId, projectId, input, providerConfigId, modelId)
        console.log(`[LongWritingHandler] generateStoryOverview 完成, success: ${result.success}`)
        return { ...result, eventId }
      } catch (error: any) {
        console.error(`[LongWritingHandler] generateStoryOverview 错误:`, error)
        return { success: false, error: error.message }
      }
    }
  )

  ipcMain.handle(
    CHANNELS.GENERATE_PLOTS,
    async (event, eventId: string, projectId: string, providerConfigId?: string, modelId?: string) => {
      try {
        const window = BrowserWindow.fromWebContents(event.sender)
        if (!window) {
          return { success: false, error: '窗口不存在' }
        }
        const result = await aiService.generatePlots(window, eventId, projectId, providerConfigId, modelId)
        return { ...result, eventId }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    }
  )

  ipcMain.handle(
    CHANNELS.POLISH_BACKGROUND,
    async (event, eventId: string, projectId: string, field: 'eraDescription' | 'socialStructure' | 'techLevel', eraType: string, content: string, providerConfigId?: string, modelId?: string) => {
      try {
        const window = BrowserWindow.fromWebContents(event.sender)
        if (!window) {
          return { success: false, error: '窗口不存在' }
        }
        const result = await aiService.polishBackground(window, eventId, projectId, field, eraType, content, providerConfigId, modelId)
        return { ...result, eventId }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    }
  )

  ipcMain.handle(
    CHANNELS.GENERATE_CHARACTERS,
    async (event, eventId: string, projectId: string, providerConfigId?: string, modelId?: string) => {
      try {
        console.log(`[LongWritingHandler] generateCharacters 被调用, eventId: ${eventId}, projectId: ${projectId}`)
        const window = BrowserWindow.fromWebContents(event.sender)
        if (!window) {
          return { success: false, error: '窗口不存在' }
        }
        const result = await aiService.generateCharacters(window, eventId, projectId, providerConfigId, modelId)
        console.log(`[LongWritingHandler] generateCharacters 完成, success: ${result.success}, error: ${result.error || 'none'}`)
        return { ...result, eventId }
      } catch (error: any) {
        console.error(`[LongWritingHandler] generateCharacters 错误:`, error)
        return { success: false, error: error.message }
      }
    }
  )

  ipcMain.handle(
    CHANNELS.GENERATE_SKILLS_ITEMS,
    async (event, eventId: string, projectId: string, providerConfigId?: string, modelId?: string) => {
      try {
        const window = BrowserWindow.fromWebContents(event.sender)
        if (!window) {
          return { success: false, error: '窗口不存在' }
        }
        const result = await aiService.generateSkillsItems(window, eventId, projectId, providerConfigId, modelId)
        return { ...result, eventId }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    }
  )

  ipcMain.handle(
    CHANNELS.GENERATE_OUTLINE_STORY,
    async (event, eventId: string, projectId: string, providerConfigId?: string, modelId?: string) => {
      try {
        const window = BrowserWindow.fromWebContents(event.sender)
        if (!window) {
          return { success: false, error: '窗口不存在' }
        }
        const result = await aiService.generateOutlineStory(window, eventId, projectId, providerConfigId, modelId)
        return { ...result, eventId }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    }
  )

  ipcMain.handle(
    CHANNELS.GENERATE_OUTLINE_COMMENT,
    async (event, eventId: string, projectId: string, providerConfigId?: string, modelId?: string) => {
      try {
        const window = BrowserWindow.fromWebContents(event.sender)
        if (!window) {
          return { success: false, error: '窗口不存在' }
        }
        const result = await aiService.generateOutlineComment(window, eventId, projectId, providerConfigId, modelId)
        return { ...result, eventId }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    }
  )

  ipcMain.handle(
    CHANNELS.GENERATE_CHAPTER,
    async (event, eventId: string, projectId: string, outlineId: string, targetWords?: number, providerConfigId?: string, modelId?: string) => {
      try {
        const window = BrowserWindow.fromWebContents(event.sender)
        if (!window) {
          return { success: false, error: '窗口不存在' }
        }
        const result = await aiService.generateChapter(window, eventId, projectId, outlineId, targetWords, providerConfigId, modelId)
        return { ...result, eventId }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    }
  )

  ipcMain.handle(
    CHANNELS.GENERATE_SECTION,
    async (event, eventId: string, projectId: string, outlineId: string, targetWords?: number, providerConfigId?: string, modelId?: string) => {
      try {
        const window = BrowserWindow.fromWebContents(event.sender)
        if (!window) {
          return { success: false, error: '窗口不存在' }
        }
        const result = await aiService.generateSection(window, eventId, projectId, outlineId, targetWords, providerConfigId, modelId)
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
  ipcMain.handle(CHANNELS.GET_EXPORT_DATA, async (_event, projectId: string) => {
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
  ipcMain.handle(CHANNELS.EXPORT_MARKDOWN, async (event, projectId: string) => {
    try {
      const window = BrowserWindow.fromWebContents(event.sender)
      if (!window) {
        return { success: false, error: '窗口不存在' }
      }

      // 获取导出数据
      const dataResult = await service.getProject(projectId)
      if (!dataResult) {
        return { success: false, error: '项目不存在' }
      }

      const exportDataResult = await new Promise<any>((resolve) => {
        ipcMain.emit(CHANNELS.GET_EXPORT_DATA, event, projectId, (result: any) => resolve(result))
      })

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
  ipcMain.handle(CHANNELS.EXPORT_WORD, async (event, projectId: string) => {
    try {
      const window = BrowserWindow.fromWebContents(event.sender)
      if (!window) {
        return { success: false, error: '窗口不存在' }
      }

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

  console.log('[IPC] 长文写作处理器已注册')
}