/**
 * 人像设计 IPC 处理器
 * @module core/packs/portrait/handlers/portrait
 * @description 处理渲染进程与主进程之间的人像设计相关通信
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { PortraitService } from '../services/portrait.service'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { IpcResponse } from '@shared/types/ipc.types'
import type {
  CreatePortraitProjectRequest,
  UpdatePortraitProjectRequest,
  CreatePortraitCharacterRequest,
  UpdatePortraitCharacterRequest,
  GeneratePortraitRequest,
  ChangeClothesRequest,
  ChangeBackgroundRequest,
  ExportPortraitRequest,
  GenerateAnglesRequest,
  EditImageRequest,
  GenerateFullBodyRequest,
  EditFaceRequest,
  PromptTemplateCategory,
  PortraitGenerationScene
} from '@shared/types/portrait.types'

/**
 * 注册人像设计相关 IPC 处理器
 */
export function registerPortraitHandlers(): void {
  // 项目管理
  ipcBridge.handle('portrait:create-project', handleCreateProject)
  ipcBridge.handle('portrait:list-projects', handleListProjects)
  ipcBridge.handle('portrait:get-project', handleGetProject)
  ipcBridge.handle('portrait:update-project', handleUpdateProject)
  ipcBridge.handle('portrait:delete-project', handleDeleteProject)

  // 角色管理
  ipcBridge.handle('portrait:create-character', handleCreateCharacter)
  ipcBridge.handle('portrait:list-characters', handleListCharacters)
  ipcBridge.handle('portrait:get-character', handleGetCharacter)
  ipcBridge.handle('portrait:update-character', handleUpdateCharacter)
  ipcBridge.handle('portrait:delete-character', handleDeleteCharacter)

  // 图像生成
  ipcBridge.handle('portrait:generate', handleGeneratePortrait)
  ipcBridge.handle('portrait:change-clothes', handleChangeClothes)
  ipcBridge.handle('portrait:change-background', handleChangeBackground)

  // 变体管理
  ipcBridge.handle('portrait:get-variant', handleGetVariant)
  ipcBridge.handle('portrait:list-variants', handleListVariants)
  ipcBridge.handle('portrait:delete-variant', handleDeleteVariant)
  ipcBridge.handle('portrait:edit-image', handleEditImage)

  // 生成多角度（第二步）
  ipcBridge.handle('portrait:generate-angles', handleGenerateAngles)

  // 新版人像设计（spec 2026-07-24）：生成全身 / 修改面部 / 提示词模板
  ipcBridge.handle('portrait:generate-full-body', handleGenerateFullBody)
  ipcBridge.handle('portrait:edit-face', handleEditFace)
  ipcBridge.handle('portrait:prompt-template:list', handlePromptTemplateList)
  ipcBridge.handle('portrait:prompt-template:apply', handlePromptTemplateApply)
  ipcBridge.handle('portrait:prompt-template:save', handlePromptTemplateSave)
  ipcBridge.handle('portrait:prompt-template:delete', handlePromptTemplateDelete)
  ipcBridge.handle('portrait:save-face-variant', handleSaveFaceVariant)

  // 导出
  ipcBridge.handle('portrait:export', handleExportPortraits)
}

/**
 * 取消注册人像设计相关 IPC 处理器
 */
export function unregisterPortraitHandlers(): void {
  // 项目管理
  ipcBridge.removeHandler('portrait:create-project')
  ipcBridge.removeHandler('portrait:list-projects')
  ipcBridge.removeHandler('portrait:get-project')
  ipcBridge.removeHandler('portrait:update-project')
  ipcBridge.removeHandler('portrait:delete-project')

  // 角色管理
  ipcBridge.removeHandler('portrait:create-character')
  ipcBridge.removeHandler('portrait:list-characters')
  ipcBridge.removeHandler('portrait:get-character')
  ipcBridge.removeHandler('portrait:update-character')
  ipcBridge.removeHandler('portrait:delete-character')

  // 图像生成
  ipcBridge.removeHandler('portrait:generate')
  ipcBridge.removeHandler('portrait:change-clothes')
  ipcBridge.removeHandler('portrait:change-background')

  // 变体管理
  ipcBridge.removeHandler('portrait:get-variant')
  ipcBridge.removeHandler('portrait:list-variants')
  ipcBridge.removeHandler('portrait:delete-variant')
  ipcBridge.removeHandler('portrait:edit-image')

  // 多角度
  ipcBridge.removeHandler('portrait:generate-angles')

  // 新版人像设计
  ipcBridge.removeHandler('portrait:generate-full-body')
  ipcBridge.removeHandler('portrait:edit-face')
  ipcBridge.removeHandler('portrait:prompt-template:list')
  ipcBridge.removeHandler('portrait:prompt-template:apply')
  ipcBridge.removeHandler('portrait:prompt-template:save')
  ipcBridge.removeHandler('portrait:prompt-template:delete')
  ipcBridge.removeHandler('portrait:save-face-variant')

  // 导出
  ipcBridge.removeHandler('portrait:export')
}

// ==================== 项目管理处理器 ====================

/**
 * 处理创建项目请求
 */
async function handleCreateProject(
  _event: any,
  request: CreatePortraitProjectRequest
): Promise<IpcResponse<any>> {
  try {
    const result = await PortraitService.createProject(request)
    return result as IpcResponse<any>
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return { success: false, error: errorMessage }
  }
}

/**
 * 处理获取项目列表请求
 */
async function handleListProjects(
  _event: any,
  page?: number,
  pageSize?: number
): Promise<IpcResponse<{ projects: any[]; total: number }>> {
  try {
    const result = await PortraitService.listProjects(page, pageSize)
    return result as IpcResponse<{ projects: any[]; total: number }>
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return { success: false, error: errorMessage }
  }
}

/**
 * 处理获取项目详情请求
 */
async function handleGetProject(
  _event: any,
  id: string
): Promise<IpcResponse<any>> {
  try {
    const result = await PortraitService.getProject(id)
    return result as IpcResponse<any>
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return { success: false, error: errorMessage }
  }
}

/**
 * 处理删除项目请求
 */
async function handleDeleteProject(
  _event: any,
  id: string
): Promise<IpcResponse<void>> {
  try {
    const result = await PortraitService.deleteProject(id)
    return result as IpcResponse<void>
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return { success: false, error: errorMessage }
  }
}

/**
 * 处理更新项目请求
 */
async function handleUpdateProject(
  _event: any,
  request: UpdatePortraitProjectRequest
): Promise<IpcResponse<any>> {
  try {
    const result = await PortraitService.updateProject(request)
    return result as IpcResponse<any>
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return { success: false, error: errorMessage }
  }
}

// ==================== 角色管理处理器 ====================

/**
 * 处理创建角色请求
 */
async function handleCreateCharacter(
  _event: any,
  request: CreatePortraitCharacterRequest
): Promise<IpcResponse<any>> {
  try {
    const result = await PortraitService.createCharacter(request)
    return result as IpcResponse<any>
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return { success: false, error: errorMessage }
  }
}

/**
 * 处理获取角色列表请求
 */
async function handleListCharacters(
  _event: any,
  projectId: string
): Promise<IpcResponse<any[]>> {
  try {
    const result = await PortraitService.listCharacters(projectId)
    return result as IpcResponse<any[]>
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return { success: false, error: errorMessage }
  }
}

/**
 * 处理获取角色详情请求
 */
async function handleGetCharacter(
  _event: any,
  id: string
): Promise<IpcResponse<any>> {
  try {
    const result = await PortraitService.getCharacter(id)
    return result as IpcResponse<any>
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return { success: false, error: errorMessage }
  }
}

/**
 * 处理更新角色请求
 */
async function handleUpdateCharacter(
  _event: any,
  request: UpdatePortraitCharacterRequest
): Promise<IpcResponse<any>> {
  try {
    const result = await PortraitService.updateCharacter(request)
    return result as IpcResponse<any>
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return { success: false, error: errorMessage }
  }
}

/**
 * 处理删除角色请求
 */
async function handleDeleteCharacter(
  _event: any,
  id: string
): Promise<IpcResponse<void>> {
  try {
    const result = await PortraitService.deleteCharacter(id)
    return result as IpcResponse<void>
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return { success: false, error: errorMessage }
  }
}

// ==================== 图像生成处理器 ====================

/**
 * 处理生成人物请求
 */
async function handleGeneratePortrait(
  _event: any,
  request: GeneratePortraitRequest
): Promise<IpcResponse<any>> {
  try {
    const result = await PortraitService.generatePortrait(request)
    if (result.success) {
      return {
        success: true,
        data: {
          characterId: result.characterId,
          variants: result.variants
        }
      }
    }
    return { success: false, error: result.error }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return { success: false, error: errorMessage }
  }
}

/**
 * 处理换衣请求
 */
async function handleChangeClothes(
  _event: any,
  request: ChangeClothesRequest
): Promise<IpcResponse<any>> {
  try {
    const result = await PortraitService.changeClothes(request)
    if (result.success) {
      return {
        success: true,
        data: {
          variants: result.variants
        }
      }
    }
    return { success: false, error: result.error }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return { success: false, error: errorMessage }
  }
}

/**
 * 处理换背景请求
 */
async function handleChangeBackground(
  _event: any,
  request: ChangeBackgroundRequest
): Promise<IpcResponse<any>> {
  try {
    const result = await PortraitService.changeBackground(request)
    if (result.success) {
      return {
        success: true,
        data: {
          variants: result.variants
        }
      }
    }
    return { success: false, error: result.error }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return { success: false, error: errorMessage }
  }
}

// ==================== 变体管理处理器 ====================

/**
 * 处理获取单个变体请求
 */
async function handleGetVariant(
  _event: any,
  variantId: string
): Promise<IpcResponse<any>> {
  try {
    const dbManager = getCoreDatabaseManager()
    if (!dbManager.portraitVariants) {
      return { success: false, error: '数据库未初始化' }
    }
    const variant = await dbManager.portraitVariants.getById(variantId)
    if (!variant) {
      return { success: false, error: '变体不存在' }
    }
    return { success: true, data: variant }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return { success: false, error: errorMessage }
  }
}

/**
 * 处理获取变体列表请求
 */
async function handleListVariants(
  _event: any,
  characterId: string
): Promise<IpcResponse<any[]>> {
  try {
    const result = await PortraitService.listVariants(characterId)
    return result as IpcResponse<any[]>
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return { success: false, error: errorMessage }
  }
}

/**
 * 处理删除变体请求
 */
async function handleDeleteVariant(
  _event: any,
  id: string
): Promise<IpcResponse<void>> {
  try {
    const result = await PortraitService.deleteVariant(id)
    return result as IpcResponse<void>
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return { success: false, error: errorMessage }
  }
}

/**
 * 处理编辑图像请求
 */
async function handleEditImage(
  _event: any,
  request: EditImageRequest
): Promise<IpcResponse<any>> {
  try {
    const result = await PortraitService.editImage(request)
    if (result.success) {
      return {
        success: true,
        data: result.variant
      }
    }
    return { success: false, error: result.error }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return { success: false, error: errorMessage }
  }
}

// ==================== 新版人像设计（spec 2026-07-24） ====================

/**
 * 处理基于半身扩展全身请求
 */
async function handleGenerateFullBody(
  _event: any,
  request: GenerateFullBodyRequest
): Promise<IpcResponse<any>> {
  try {
    const result = await PortraitService.generateFullBody(request)
    if (result.success) {
      return { success: true, data: result.variant }
    }
    return { success: false, error: result.error }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return { success: false, error: errorMessage }
  }
}

/**
 * 处理只修改面部请求
 */
async function handleEditFace(
  _event: any,
  request: EditFaceRequest
): Promise<IpcResponse<any>> {
  try {
    const result = await PortraitService.editFace(request)
    if (result.success) {
      return { success: true, data: result.variant }
    }
    return { success: false, error: result.error }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return { success: false, error: errorMessage }
  }
}

/**
 * 处理模板列表请求
 */
async function handlePromptTemplateList(
  _event: any,
  category?: PromptTemplateCategory
): Promise<IpcResponse<any>> {
  try {
    const result = await PortraitService.listPromptTemplates(category)
    if (result.success) {
      return { success: true, data: result.data }
    }
    return { success: false, error: result.error }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return { success: false, error: errorMessage }
  }
}

/**
 * 处理模板应用（占位符解析）请求
 */
async function handlePromptTemplateApply(
  _event: any,
  templateId: string,
  vars: Record<string, string | number>
): Promise<IpcResponse<any>> {
  try {
    const result = await PortraitService.applyTemplate(templateId, vars)
    if (result.success) {
      return { success: true, data: result.data }
    }
    return { success: false, error: result.error }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return { success: false, error: errorMessage }
  }
}

/**
 * 处理模板保存（新建/更新）请求
 */
async function handlePromptTemplateSave(
  _event: any,
  input: {
    id?: string
    name: string
    category: PromptTemplateCategory
    content: string
    applyTo: PortraitGenerationScene[]
    sortOrder?: number
  }
): Promise<IpcResponse<any>> {
  try {
    const result = await PortraitService.savePromptTemplate(input)
    if (result.success) {
      return { success: true, data: result.data }
    }
    return { success: false, error: result.error }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return { success: false, error: errorMessage }
  }
}

/**
 * 处理模板删除请求
 */
async function handlePromptTemplateDelete(
  _event: any,
  id: string
): Promise<IpcResponse<any>> {
  try {
    const result = await PortraitService.deletePromptTemplate(id)
    if (result.success) {
      return { success: true }
    }
    return { success: false, error: result.error }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return { success: false, error: errorMessage }
  }
}

/**
 * 处理算法变形结果保存（spec 2026-07-25 面容几何工作室）
 */
async function handleSaveFaceVariant(
  _event: any,
  request: {
    characterId: string
    sourceVariantId: string
    dataUrl: string
    faceParams?: Record<string, number>
  }
): Promise<IpcResponse<any>> {
  try {
    const result = await PortraitService.saveFaceVariantFromDataUrl(request)
    if (result.success) {
      return { success: true, data: result.variant }
    }
    return { success: false, error: result.error }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return { success: false, error: errorMessage }
  }
}

/**
 * 处理生成多角度请求（第二步）
 */
async function handleGenerateAngles(
  _event: any,
  request: GenerateAnglesRequest
): Promise<IpcResponse<any>> {
  try {
    const result = await PortraitService.generateAngles(request)
    if (result.success) {
      return {
        success: true,
        data: {
          variants: result.variants
        }
      }
    }
    return { success: false, error: result.error }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return { success: false, error: errorMessage }
  }
}

// ==================== 导出处理器 ====================

/**
 * 处理导出请求
 */
async function handleExportPortraits(
  _event: any,
  request: ExportPortraitRequest
): Promise<IpcResponse<string>> {
  try {
    const result = await PortraitService.exportPortraits(request)
    if (result.success && result.filePath) {
      return { success: true, data: result.filePath }
    }
    return { success: false, error: result.error || '导出失败' }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return { success: false, error: errorMessage }
  }
}