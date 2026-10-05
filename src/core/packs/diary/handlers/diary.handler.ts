/**
 * 日记模块 IPC 处理器
 * @module core/packs/diary/handlers/diary.handler
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { DiaryService } from '@core/platform/services/diary.service'
import { DiaryExportService } from '../services/diary-export.service'
import { DiaryInspirationService } from '../services/diary-inspiration.service'
import { getDiaryBrainSyncService } from '@core/platform/services/diary-brain-sync.service'
import { DiaryAttachmentService } from '../services/diary-attachment.service'
import type {
  CreateDiaryFolderRequest,
  UpdateDiaryFolderRequest,
  CreateDiaryEntryRequest,
  UpdateDiaryEntryRequest
} from '@shared/types/diary.types'

let diaryService: DiaryService | null = null
let diaryExportService: DiaryExportService | null = null
let diaryInspirationService: DiaryInspirationService | null = null
let diaryAttachmentService: DiaryAttachmentService | null = null

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

function getDiaryInspirationService(): DiaryInspirationService {
  if (!diaryInspirationService) {
    diaryInspirationService = new DiaryInspirationService()
  }
  return diaryInspirationService
}

function getDiaryAttachmentService(): DiaryAttachmentService {
  if (!diaryAttachmentService) {
    diaryAttachmentService = new DiaryAttachmentService()
  }
  return diaryAttachmentService
}

export function registerDiaryHandlers(): void {
  // 目录管理
  ipcBridge.handle('diary:list-folders', handleListFolders)
  ipcBridge.handle('diary:get-all-folders', handleGetAllFolders)
  ipcBridge.handle('diary:create-folder', handleCreateFolder)
  ipcBridge.handle('diary:update-folder', handleUpdateFolder)
  ipcBridge.handle('diary:delete-folder', handleDeleteFolder)

  // 日记管理
  ipcBridge.handle('diary:list-entries', handleListEntries)
  ipcBridge.handle('diary:get-entry', handleGetEntry)
  ipcBridge.handle('diary:create-entry', handleCreateEntry)
  ipcBridge.handle('diary:update-entry', handleUpdateEntry)
  ipcBridge.handle('diary:delete-entry', handleDeleteEntry)
  ipcBridge.handle('diary:move-entry', handleMoveEntry)

  // 搜索
  ipcBridge.handle('diary:search', handleSearch)

  // 链接
  ipcBridge.handle('diary:get-backlinks', handleGetBacklinks)

  // 回收站（软删除）
  ipcBridge.handle('diary:list-deleted', handleListDeleted)
  ipcBridge.handle('diary:restore-entry', handleRestoreEntry)
  ipcBridge.handle('diary:purge-entry', handlePurgeEntry)
  ipcBridge.handle('diary:empty-trash', handleEmptyTrash)

  // 日期范围 / 全部条目（日历视图、链接插入）
  ipcBridge.handle('diary:list-by-date-range', handleListByDateRange)
  ipcBridge.handle('diary:list-all-entries', handleListAllEntries)

  // 那年今日 / 灵感条（P1：复盘与重现）
  ipcBridge.handle('diary:get-on-this-day', handleGetOnThisDay)
  ipcBridge.handle('diary:get-inspiration', handleGetInspiration)

  // 日记消化开关（P2：opt-in 红线——开启回填存量，关闭出库清理）
  ipcBridge.handle('diary:set-folder-brain-opt-in', handleSetFolderBrainOptIn)

  // 附件（P3：内嵌贴图 + 写作引子）
  ipcBridge.handle('diary:upload-attachment', handleUploadAttachment)
  ipcBridge.handle('diary:delete-attachment', handleDeleteAttachment)
  ipcBridge.handle('diary:describe-attachment', handleDescribeAttachment)
  ipcBridge.handle('diary:get-writing-prompt', handleGetWritingPrompt)

  // F2 反思流（复习面板接线用）
  ipcBridge.handle('diary:create-reflection', handleCreateReflection)

  // 导出
  ipcBridge.handle('diary:export-html', handleExportHtml)
  ipcBridge.handle('diary:export-pdf', handleExportPdf)
  ipcBridge.handle('diary:export-docx', handleExportDocx)

  // 启动清理：物理删除回收站中超期（30 天）的条目
  void getDiaryService().purgeExpired()

  console.log('[DiaryHandlers] 日记 IPC 处理器已注册')
}

// ==================== 目录管理 ====================

async function handleListFolders(_event: any, parentId?: string) {
  return await getDiaryService().getFolders(parentId)
}

async function handleGetAllFolders(_event: any) {
  return await getDiaryService().getAllFolders()
}

async function handleCreateFolder(_event: any, request: CreateDiaryFolderRequest) {
  return await getDiaryService().createFolder(request)
}

async function handleUpdateFolder(
  _event: any,
  data: { id: string; request: UpdateDiaryFolderRequest }
) {
  return await getDiaryService().updateFolder(data.id, data.request)
}

async function handleDeleteFolder(_event: any, id: string) {
  return await getDiaryService().deleteFolder(id)
}

// ==================== 日记管理 ====================

async function handleListEntries(_event: any, folderId: string) {
  return await getDiaryService().getEntries(folderId)
}

async function handleGetEntry(_event: any, id: string) {
  return await getDiaryService().getEntry(id)
}

async function handleCreateEntry(_event: any, request: CreateDiaryEntryRequest) {
  return await getDiaryService().createEntry(request)
}

async function handleUpdateEntry(
  _event: any,
  data: { id: string; request: UpdateDiaryEntryRequest }
) {
  return await getDiaryService().updateEntry(data.id, data.request)
}

async function handleDeleteEntry(_event: any, id: string) {
  return await getDiaryService().deleteEntry(id)
}

async function handleMoveEntry(
  _event: any,
  data: { id: string; targetFolderId: string }
) {
  return await getDiaryService().moveEntry(data.id, data.targetFolderId)
}

// ==================== 搜索 ====================

async function handleSearch(_event: any, data: { keyword: string; folderId?: string }) {
  return await getDiaryService().search(data.keyword, data.folderId)
}

// ==================== 链接 ====================

async function handleGetBacklinks(_event: any, entryId: string) {
  return await getDiaryService().getBacklinks(entryId)
}

// ==================== 回收站 ====================

async function handleListDeleted(_event: any) {
  return await getDiaryService().getDeletedEntries()
}

async function handleRestoreEntry(_event: any, id: string) {
  return await getDiaryService().restoreEntry(id)
}

async function handlePurgeEntry(_event: any, id: string) {
  return await getDiaryService().purgeEntry(id)
}

async function handleEmptyTrash(_event: any) {
  return await getDiaryService().emptyTrash()
}

// ==================== 日期范围 / 全部条目 ====================

async function handleListByDateRange(
  _event: any,
  data: { from: string; to: string; folderId?: string }
) {
  return await getDiaryService().getEntriesByDateRange(data.from, data.to, data.folderId)
}

async function handleListAllEntries(_event: any, limit?: number) {
  return await getDiaryService().listAllEntries(limit)
}

// ==================== 那年今日 / 灵感条 ====================

async function handleGetOnThisDay(_event: any, limit?: number) {
  return await getDiaryService().getOnThisDay(limit)
}

async function handleGetInspiration(_event: any, entryId: string) {
  return await getDiaryInspirationService().getInspiration(entryId)
}

async function handleSetFolderBrainOptIn(
  _event: any,
  data: { folderId: string; enabled: boolean }
) {
  return await getDiaryBrainSyncService().setFolderBrainOptIn(data.folderId, data.enabled)
}

async function handleUploadAttachment(
  _event: any,
  data: { entryId: string; fileName: string; base64: string; mimeType?: string }
) {
  return await getDiaryAttachmentService().uploadAttachment(
    data.entryId,
    data.fileName,
    data.base64,
    data.mimeType
  )
}

async function handleDeleteAttachment(_event: any, attachmentId: string) {
  return await getDiaryAttachmentService().deleteAttachment(attachmentId)
}

async function handleDescribeAttachment(_event: any, attachmentId: string) {
  return await getDiaryAttachmentService().describeAttachment(attachmentId)
}

async function handleGetWritingPrompt(_event: any) {
  return await getDiaryAttachmentService().getWritingPrompt()
}

async function handleCreateReflection(
  _event: any,
  data: { cardTitle: string; reflectionText: string; kbName?: string }
) {
  return await getDiaryService().createReflectionEntry(data.cardTitle, data.reflectionText, data.kbName)
}

// ==================== 导出 ====================

async function handleExportHtml(
  _event: any,
  data: { entryId: string; outputPath?: string }
) {
  return await getDiaryExportService().exportToHtml(data.entryId, data.outputPath)
}

async function handleExportPdf(
  _event: any,
  data: { entryId: string; outputPath?: string }
) {
  const isElectron = !!(process.versions as Record<string, string | undefined>)?.electron
  if (!isElectron) {
    return { success: false, error: 'PDF 导出仅在桌面端可用' }
  }
  return await getDiaryExportService().exportToPdf(data.entryId, data.outputPath)
}

async function handleExportDocx(
  _event: any,
  data: { entryId: string; outputPath?: string }
) {
  return await getDiaryExportService().exportToDocx(data.entryId, data.outputPath)
}
