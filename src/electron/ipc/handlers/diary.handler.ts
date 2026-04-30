/**
 * 日记模块 IPC 处理器
 * @module ipc/handlers/diary.handler
 */

import { ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { DiaryService } from '@core/services/diary.service'
import { DiaryExportService } from '../../services/diary-export.service'
import type {
  CreateDiaryFolderRequest,
  UpdateDiaryFolderRequest,
  CreateDiaryEntryRequest,
  UpdateDiaryEntryRequest
} from '@shared/types/diary.types'

let diaryService: DiaryService | null = null
let diaryExportService: DiaryExportService | null = null

function getDiaryService(): DiaryService {
  if (!diaryService) {
    diaryService = new DiaryService()
  }
  return diaryService
}

function getDiaryExportService(): DiaryExportService {
  if (!diaryExportService) {
    diaryExportService = new DiaryExportService(getDiaryService())
  }
  return diaryExportService
}

export function registerDiaryHandlers(): void {
  // 目录管理
  ipcMain.handle('diary:list-folders', handleListFolders)
  ipcMain.handle('diary:get-all-folders', handleGetAllFolders)
  ipcMain.handle('diary:create-folder', handleCreateFolder)
  ipcMain.handle('diary:update-folder', handleUpdateFolder)
  ipcMain.handle('diary:delete-folder', handleDeleteFolder)

  // 日记管理
  ipcMain.handle('diary:list-entries', handleListEntries)
  ipcMain.handle('diary:get-entry', handleGetEntry)
  ipcMain.handle('diary:create-entry', handleCreateEntry)
  ipcMain.handle('diary:update-entry', handleUpdateEntry)
  ipcMain.handle('diary:delete-entry', handleDeleteEntry)
  ipcMain.handle('diary:move-entry', handleMoveEntry)

  // 搜索
  ipcMain.handle('diary:search', handleSearch)

  // 链接
  ipcMain.handle('diary:get-backlinks', handleGetBacklinks)

  // 导出
  ipcMain.handle('diary:export-html', handleExportHtml)
  ipcMain.handle('diary:export-pdf', handleExportPdf)
  ipcMain.handle('diary:export-docx', handleExportDocx)

  console.log('[DiaryHandlers] 日记 IPC 处理器已注册')
}

// ==================== 目录管理 ====================

async function handleListFolders(
  _event: IpcMainInvokeEvent,
  parentId?: string
) {
  return await getDiaryService().getFolders(parentId)
}

async function handleGetAllFolders(_event: IpcMainInvokeEvent) {
  return await getDiaryService().getAllFolders()
}

async function handleCreateFolder(
  _event: IpcMainInvokeEvent,
  request: CreateDiaryFolderRequest
) {
  return await getDiaryService().createFolder(request)
}

async function handleUpdateFolder(
  _event: IpcMainInvokeEvent,
  data: { id: string; request: UpdateDiaryFolderRequest }
) {
  return await getDiaryService().updateFolder(data.id, data.request)
}

async function handleDeleteFolder(
  _event: IpcMainInvokeEvent,
  id: string
) {
  return await getDiaryService().deleteFolder(id)
}

// ==================== 日记管理 ====================

async function handleListEntries(
  _event: IpcMainInvokeEvent,
  folderId: string
) {
  return await getDiaryService().getEntries(folderId)
}

async function handleGetEntry(
  _event: IpcMainInvokeEvent,
  id: string
) {
  return await getDiaryService().getEntry(id)
}

async function handleCreateEntry(
  _event: IpcMainInvokeEvent,
  request: CreateDiaryEntryRequest
) {
  return await getDiaryService().createEntry(request)
}

async function handleUpdateEntry(
  _event: IpcMainInvokeEvent,
  data: { id: string; request: UpdateDiaryEntryRequest }
) {
  return await getDiaryService().updateEntry(data.id, data.request)
}

async function handleDeleteEntry(
  _event: IpcMainInvokeEvent,
  id: string
) {
  return await getDiaryService().deleteEntry(id)
}

async function handleMoveEntry(
  _event: IpcMainInvokeEvent,
  data: { id: string; targetFolderId: string }
) {
  return await getDiaryService().moveEntry(data.id, data.targetFolderId)
}

// ==================== 搜索 ====================

async function handleSearch(
  _event: IpcMainInvokeEvent,
  data: { keyword: string; folderId?: string }
) {
  return await getDiaryService().search(data.keyword, data.folderId)
}

// ==================== 链接 ====================

async function handleGetBacklinks(
  _event: IpcMainInvokeEvent,
  entryId: string
) {
  return await getDiaryService().getBacklinks(entryId)
}

// ==================== 导出 ====================

async function handleExportHtml(
  _event: IpcMainInvokeEvent,
  data: { entryId: string; outputPath?: string }
) {
  return await getDiaryExportService().exportToHtml(data.entryId, data.outputPath)
}

async function handleExportPdf(
  _event: IpcMainInvokeEvent,
  data: { entryId: string; outputPath?: string }
) {
  return await getDiaryExportService().exportToPdf(data.entryId, data.outputPath)
}

async function handleExportDocx(
  _event: IpcMainInvokeEvent,
  data: { entryId: string; outputPath?: string }
) {
  return await getDiaryExportService().exportToDocx(data.entryId, data.outputPath)
}