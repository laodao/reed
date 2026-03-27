/**
 * 人像设计 IPC 处理器
 * @module ipc/handlers/portrait
 * @description 处理渲染进程与主进程之间的人像设计相关通信
 */

import { ipcMain, IpcMainInvokeEvent, BrowserWindow } from 'electron'
import { PortraitService } from '../../services/portrait.service'
import type { IpcResponse } from '../../../shared/types/ipc.types'
import type {
  CreatePortraitProjectRequest,
  UpdatePortraitProjectRequest,
  CreatePortraitCharacterRequest,
  UpdatePortraitCharacterRequest,
  GeneratePortraitRequest,
  ChangeClothesRequest,
  ChangeBackgroundRequest,
  ExportPortraitRequest,
  GenerateAnglesRequest
} from '../../../shared/types/portrait.types'

/**
 * 注册人像设计相关 IPC 处理器
 */
export function registerPortraitHandlers(): void {
  // 项目管理
  ipcMain.handle('portrait:create-project', handleCreateProject)
  ipcMain.handle('portrait:list-projects', handleListProjects)
  ipcMain.handle('portrait:get-project', handleGetProject)
  ipcMain.handle('portrait:update-project', handleUpdateProject)
  ipcMain.handle('portrait:delete-project', handleDeleteProject)

  // 角色管理
  ipcMain.handle('portrait:create-character', handleCreateCharacter)
  ipcMain.handle('portrait:list-characters', handleListCharacters)
  ipcMain.handle('portrait:get-character', handleGetCharacter)
  ipcMain.handle('portrait:update-character', handleUpdateCharacter)
  ipcMain.handle('portrait:delete-character', handleDeleteCharacter)

  // 图像生成
  ipcMain.handle('portrait:generate', handleGeneratePortrait)
  ipcMain.handle('portrait:change-clothes', handleChangeClothes)
  ipcMain.handle('portrait:change-background', handleChangeBackground)

  // 变体管理
  ipcMain.handle('portrait:list-variants', handleListVariants)
  ipcMain.handle('portrait:delete-variant', handleDeleteVariant)
  ipcMain.handle('portrait:edit-image', handleEditImage)

  // 生成多角度（第二步）
  ipcMain.handle('portrait:generate-angles', handleGenerateAngles)

  // 导出
  ipcMain.handle('portrait:export', handleExportPortraits)
}

/**
 * 取消注册人像设计相关 IPC 处理器
 */
export function unregisterPortraitHandlers(): void {
  // 项目管理
  ipcMain.removeHandler('portrait:create-project')
  ipcMain.removeHandler('portrait:list-projects')
  ipcMain.removeHandler('portrait:get-project')
  ipcMain.removeHandler('portrait:update-project')
  ipcMain.removeHandler('portrait:delete-project')

  // 角色管理
  ipcMain.removeHandler('portrait:create-character')
  ipcMain.removeHandler('portrait:list-characters')
  ipcMain.removeHandler('portrait:get-character')
  ipcMain.removeHandler('portrait:update-character')
  ipcMain.removeHandler('portrait:delete-character')

  // 图像生成
  ipcMain.removeHandler('portrait:generate')
  ipcMain.removeHandler('portrait:change-clothes')
  ipcMain.removeHandler('portrait:change-background')

  // 变体管理
  ipcMain.removeHandler('portrait:list-variants')
  ipcMain.removeHandler('portrait:delete-variant')
  ipcMain.removeHandler('portrait:edit-image')

  // 多角度
  ipcMain.removeHandler('portrait:generate-angles')

  // 导出
  ipcMain.removeHandler('portrait:export')
}

// ==================== 项目管理处理器 ====================

/**
 * 处理创建项目请求
 */
async function handleCreateProject(
  _event: IpcMainInvokeEvent,
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
  _event: IpcMainInvokeEvent,
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
  _event: IpcMainInvokeEvent,
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
  _event: IpcMainInvokeEvent,
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
  _event: IpcMainInvokeEvent,
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
  _event: IpcMainInvokeEvent,
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
  _event: IpcMainInvokeEvent,
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
  _event: IpcMainInvokeEvent,
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
  _event: IpcMainInvokeEvent,
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
  _event: IpcMainInvokeEvent,
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
  event: IpcMainInvokeEvent,
  request: GeneratePortraitRequest
): Promise<IpcResponse<any>> {
  try {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) {
      return { success: false, error: '窗口不存在' }
    }

    const result = await PortraitService.generatePortrait(window, request)
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
  event: IpcMainInvokeEvent,
  request: ChangeClothesRequest
): Promise<IpcResponse<any>> {
  try {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) {
      return { success: false, error: '窗口不存在' }
    }

    const result = await PortraitService.changeClothes(window, request)
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
  event: IpcMainInvokeEvent,
  request: ChangeBackgroundRequest
): Promise<IpcResponse<any>> {
  try {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) {
      return { success: false, error: '窗口不存在' }
    }

    const result = await PortraitService.changeBackground(window, request)
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
 * 处理获取变体列表请求
 */
async function handleListVariants(
  _event: IpcMainInvokeEvent,
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
  _event: IpcMainInvokeEvent,
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
  event: IpcMainInvokeEvent,
  request: {
    characterId: string
    variantId: string
    editPrompt: string
  }
): Promise<IpcResponse<any>> {
  try {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) {
      return { success: false, error: '窗口不存在' }
    }

    const result = await PortraitService.editImage(window, request)
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

/**
 * 处理生成多角度请求（第二步）
 */
async function handleGenerateAngles(
  event: IpcMainInvokeEvent,
  request: GenerateAnglesRequest
): Promise<IpcResponse<any>> {
  try {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) {
      return { success: false, error: '窗口不存在' }
    }

    const result = await PortraitService.generateAngles(window, request)
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
  _event: IpcMainInvokeEvent,
  request: ExportPortraitRequest
): Promise<IpcResponse<string>> {
  try {
    const result = await PortraitService.exportPortraits(request)
    return result as IpcResponse<string>
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return { success: false, error: errorMessage }
  }
}