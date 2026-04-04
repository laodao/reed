/**
 * 日记核心服务
 * @module services/diary.service
 * @description 处理日记的核心业务逻辑，包括文件系统操作
 */

import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { getDatabaseManager } from '../database'
import type {
  DiaryFolder,
  DiaryEntry,
  DiaryEntryListItem,
  DiaryLink,
  BacklinkInfo,
  CreateDiaryFolderRequest,
  UpdateDiaryFolderRequest,
  CreateDiaryEntryRequest,
  UpdateDiaryEntryRequest,
  DiaryIpcResponse
} from '../../shared/types/diary.types'

/**
 * 日记服务
 */
export class DiaryService {
  private diaryRootPath: string

  constructor() {
    // 日记根目录位于 userData 下
    this.diaryRootPath = path.join(app.getPath('userData'), 'diary')
    this.ensureRootDirectory()
  }

  /**
   * 确保根目录存在
   */
  private ensureRootDirectory(): void {
    if (!fs.existsSync(this.diaryRootPath)) {
      fs.mkdirSync(this.diaryRootPath, { recursive: true })
    }
  }

  // ==================== 目录管理 ====================

  /**
   * 获取目录树
   */
  async getFolders(parentId?: string): Promise<DiaryIpcResponse<DiaryFolder[]>> {
    try {
      const db = getDatabaseManager()
      const folders = parentId
        ? db.diaryFolders!.findChildren(parentId)
        : db.diaryFolders!.findRootFolders()
      return { success: true, data: folders }
    } catch (error) {
      console.error('[DiaryService] getFolders error:', error)
      return { success: false, error: String(error) }
    }
  }

  /**
   * 获取所有目录（扁平列表）
   */
  async getAllFolders(): Promise<DiaryIpcResponse<DiaryFolder[]>> {
    try {
      const db = getDatabaseManager()
      const folders = db.diaryFolders!.findAll()
      return { success: true, data: folders }
    } catch (error) {
      console.error('[DiaryService] getAllFolders error:', error)
      return { success: false, error: String(error) }
    }
  }

  /**
   * 创建目录
   */
  async createFolder(request: CreateDiaryFolderRequest): Promise<DiaryIpcResponse<DiaryFolder>> {
    try {
      const db = getDatabaseManager()

      // 检查同名目录是否存在
      if (db.diaryFolders!.existsByName(request.name, request.parentId)) {
        return { success: false, error: '同名目录已存在' }
      }

      // 计算完整路径
      let fullPath: string
      if (request.parentId) {
        const parent = db.diaryFolders!.findById(request.parentId)
        if (!parent) {
          return { success: false, error: '父目录不存在' }
        }
        fullPath = path.join(this.diaryRootPath, parent.path, request.name)
      } else {
        fullPath = path.join(this.diaryRootPath, request.name)
      }

      // 创建文件系统目录
      fs.mkdirSync(fullPath, { recursive: true })

      // 创建 .assets 目录
      const assetsPath = path.join(fullPath, '.assets')
      if (!fs.existsSync(assetsPath)) {
        fs.mkdirSync(assetsPath)
      }

      // 计算相对路径
      const relativePath = path.relative(this.diaryRootPath, fullPath)

      // 创建数据库记录
      const folder = db.diaryFolders!.create(request, relativePath)

      return { success: true, data: folder }
    } catch (error) {
      console.error('[DiaryService] createFolder error:', error)
      return { success: false, error: String(error) }
    }
  }

  /**
   * 更新目录
   */
  async updateFolder(id: string, request: UpdateDiaryFolderRequest): Promise<DiaryIpcResponse<void>> {
    try {
      const db = getDatabaseManager()
      const folder = db.diaryFolders!.findById(id)
      if (!folder) {
        return { success: false, error: '目录不存在' }
      }

      // 检查新名称是否冲突
      if (request.name && request.name !== folder.name) {
        if (db.diaryFolders!.existsByName(request.name, folder.parentId)) {
          return { success: false, error: '同名目录已存在' }
        }

        // 重命名文件系统目录
        const oldPath = path.join(this.diaryRootPath, folder.path)
        const parentPath = path.dirname(oldPath)
        const newPath = path.join(parentPath, request.name)

        fs.renameSync(oldPath, newPath)

        // 更新数据库
        const newRelativePath = path.relative(this.diaryRootPath, newPath)
        db.diaryFolders!.update(id, request, newRelativePath)
      } else {
        db.diaryFolders!.update(id, request)
      }

      return { success: true }
    } catch (error) {
      console.error('[DiaryService] updateFolder error:', error)
      return { success: false, error: String(error) }
    }
  }

  /**
   * 删除目录
   */
  async deleteFolder(id: string): Promise<DiaryIpcResponse<void>> {
    try {
      const db = getDatabaseManager()
      const folder = db.diaryFolders!.findById(id)
      if (!folder) {
        return { success: false, error: '目录不存在' }
      }

      // 删除文件系统目录
      const fullPath = path.join(this.diaryRootPath, folder.path)
      fs.rmSync(fullPath, { recursive: true, force: true })

      // 删除数据库记录（级联删除子目录和日记）
      db.diaryFolders!.delete(id)

      return { success: true }
    } catch (error) {
      console.error('[DiaryService] deleteFolder error:', error)
      return { success: false, error: String(error) }
    }
  }

  // ==================== 日记管理 ====================

  /**
   * 获取日记列表
   */
  async getEntries(folderId: string): Promise<DiaryIpcResponse<DiaryEntryListItem[]>> {
    try {
      const db = getDatabaseManager()
      const entries = db.diaryEntries!.findByFolder(folderId)
      return { success: true, data: entries }
    } catch (error) {
      console.error('[DiaryService] getEntries error:', error)
      return { success: false, error: String(error) }
    }
  }

  /**
   * 获取日记详情
   */
  async getEntry(id: string): Promise<DiaryIpcResponse<DiaryEntry>> {
    try {
      const db = getDatabaseManager()
      const entry = db.diaryEntries!.findById(id)
      if (!entry) {
        return { success: false, error: '日记不存在' }
      }

      // 从文件读取内容
      const filePath = path.join(this.diaryRootPath, entry.filePath)
      if (fs.existsSync(filePath)) {
        entry.content = fs.readFileSync(filePath, 'utf-8')
      }

      return { success: true, data: entry }
    } catch (error) {
      console.error('[DiaryService] getEntry error:', error)
      return { success: false, error: String(error) }
    }
  }

  /**
   * 创建日记
   */
  async createEntry(request: CreateDiaryEntryRequest): Promise<DiaryIpcResponse<DiaryEntry>> {
    try {
      const db = getDatabaseManager()

      // 验证目录存在
      const folder = db.diaryFolders!.findById(request.folderId)
      if (!folder) {
        return { success: false, error: '目录不存在' }
      }

      // 生成文件名
      const title = request.title || this.generateDefaultTitle()
      const fileName = `${title}.md`
      const relativePath = path.join(folder.path, fileName)
      const fullPath = path.join(this.diaryRootPath, relativePath)

      // 创建 Markdown 文件
      const content = request.content || `# ${title}\n\n`
      fs.writeFileSync(fullPath, content, 'utf-8')

      // 创建数据库记录
      const entry = db.diaryEntries!.create(request, relativePath)

      // 解析并存储链接
      if (content) {
        this.parseAndStoreLinks(entry.id, content)
      }

      return { success: true, data: entry }
    } catch (error) {
      console.error('[DiaryService] createEntry error:', error)
      return { success: false, error: String(error) }
    }
  }

  /**
   * 更新日记
   */
  async updateEntry(id: string, request: UpdateDiaryEntryRequest): Promise<DiaryIpcResponse<void>> {
    try {
      const db = getDatabaseManager()
      const entry = db.diaryEntries!.findById(id)
      if (!entry) {
        return { success: false, error: '日记不存在' }
      }

      // 更新文件内容
      if (request.content !== undefined) {
        const filePath = path.join(this.diaryRootPath, entry.filePath)
        fs.writeFileSync(filePath, request.content, 'utf-8')

        // 更新链接
        db.diaryLinks!.deleteBySource(id)
        this.parseAndStoreLinks(id, request.content)
      }

      // 更新标题时重命名文件
      if (request.title && request.title !== entry.title) {
        const oldPath = path.join(this.diaryRootPath, entry.filePath)
        const dirPath = path.dirname(oldPath)
        const newFileName = `${request.title}.md`
        const newPath = path.join(dirPath, newFileName)

        if (fs.existsSync(oldPath)) {
          fs.renameSync(oldPath, newPath)
        }

        const newRelativePath = path.relative(this.diaryRootPath, newPath)
        db.diaryEntries!.update(id, { ...request, content: undefined })
        db.diaryEntries!.move(id, entry.folderId, newRelativePath)
      } else {
        db.diaryEntries!.update(id, request)
      }

      return { success: true }
    } catch (error) {
      console.error('[DiaryService] updateEntry error:', error)
      return { success: false, error: String(error) }
    }
  }

  /**
   * 删除日记
   */
  async deleteEntry(id: string): Promise<DiaryIpcResponse<void>> {
    try {
      const db = getDatabaseManager()
      const entry = db.diaryEntries!.findById(id)
      if (!entry) {
        return { success: false, error: '日记不存在' }
      }

      // 删除文件
      const filePath = path.join(this.diaryRootPath, entry.filePath)
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }

      // 删除数据库记录（级联删除链接和附件记录）
      db.diaryEntries!.delete(id)

      return { success: true }
    } catch (error) {
      console.error('[DiaryService] deleteEntry error:', error)
      return { success: false, error: String(error) }
    }
  }

  /**
   * 移动日记
   */
  async moveEntry(id: string, targetFolderId: string): Promise<DiaryIpcResponse<void>> {
    try {
      const db = getDatabaseManager()
      const entry = db.diaryEntries!.findById(id)
      if (!entry) {
        return { success: false, error: '日记不存在' }
      }

      const targetFolder = db.diaryFolders!.findById(targetFolderId)
      if (!targetFolder) {
        return { success: false, error: '目标目录不存在' }
      }

      // 移动文件
      const oldPath = path.join(this.diaryRootPath, entry.filePath)
      const newPath = path.join(this.diaryRootPath, targetFolder.path, path.basename(entry.filePath))

      if (fs.existsSync(oldPath)) {
        fs.renameSync(oldPath, newPath)
      }

      // 更新数据库
      const newRelativePath = path.relative(this.diaryRootPath, newPath)
      db.diaryEntries!.move(id, targetFolderId, newRelativePath)

      return { success: true }
    } catch (error) {
      console.error('[DiaryService] moveEntry error:', error)
      return { success: false, error: String(error) }
    }
  }

  // ==================== 搜索 ====================

  /**
   * 搜索日记
   */
  async search(keyword: string, folderId?: string): Promise<DiaryIpcResponse<DiaryEntryListItem[]>> {
    try {
      const db = getDatabaseManager()
      const entries = db.diaryEntries!.search(keyword, folderId)
      return { success: true, data: entries }
    } catch (error) {
      console.error('[DiaryService] search error:', error)
      return { success: false, error: String(error) }
    }
  }

  // ==================== 链接管理 ====================

  /**
   * 获取反向链接
   */
  async getBacklinks(entryId: string): Promise<DiaryIpcResponse<BacklinkInfo[]>> {
    try {
      const db = getDatabaseManager()
      const backlinks = db.diaryLinks!.findIncomingLinks(entryId)
      return { success: true, data: backlinks }
    } catch (error) {
      console.error('[DiaryService] getBacklinks error:', error)
      return { success: false, error: String(error) }
    }
  }

  /**
   * 解析内容中的双向链接
   */
  private parseAndStoreLinks(entryId: string, content: string): void {
    const db = getDatabaseManager()

    // 匹配 [[标题]] 或 [[标题#锚点]] 或 [[标题|显示文本]]
    const linkRegex = /\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g
    const links: Array<{
      targetTitle: string
      anchor?: string
      linkText?: string
    }> = []

    let match
    while ((match = linkRegex.exec(content)) !== null) {
      const targetTitle = match[1].trim()
      const anchor = match[2]?.trim()
      const linkText = match[3]?.trim()

      links.push({ targetTitle, anchor, linkText })
    }

    if (links.length === 0) return

    // 查找目标日记是否存在
    const linkData = links.map(link => {
      const targetEntry = db.diaryEntries!.findByTitle(link.targetTitle)
      return {
        sourceEntryId: entryId,
        targetTitle: link.targetTitle,
        targetEntryId: targetEntry?.id,
        linkText: link.linkText,
        anchor: link.anchor
      }
    })

    db.diaryLinks!.createMany(linkData)
  }

  /**
   * 生成默认标题
   */
  private generateDefaultTitle(): string {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  /**
   * 获取日记根路径
   */
  getRootPath(): string {
    return this.diaryRootPath
  }
}