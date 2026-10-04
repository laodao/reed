/**
 * 日记核心服务
 * @module platform/services/diary.service
 * @description 处理日记的核心业务逻辑，包括文件系统操作
 */

import * as fs from 'fs'
import * as path from 'path'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { getPathProvider } from '@core/interfaces/path.interface'
import type {
  DiaryFolder,
  DiaryEntry,
  DiaryEntryListItem,
  BacklinkInfo,
  CreateDiaryFolderRequest,
  UpdateDiaryFolderRequest,
  CreateDiaryEntryRequest,
  UpdateDiaryEntryRequest,
  DiaryIpcResponse
} from '@shared/types/diary.types'

/**
 * 日记服务
 */
export class DiaryService {
  private diaryRootPath: string

  constructor() {
    // 日记根目录位于 userData 下
    this.diaryRootPath = path.join(getPathProvider().getUserDataPath(), 'diary')
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
   * 目录名合法性（多租户复核修复：路径穿越封堵）：
   * name 直接拼进 diaryRootPath 且 mkdir/rename，含分隔符或 '..' 即可越出
   * 用户数据目录（Web 端 users/<uid>），在服务器任意位置建目录/改名。
   */
  private assertSafeFolderName(name: string): void {
    const trimmed = (name ?? '').trim()
    if (!trimmed) throw new Error('目录名不能为空')
    if (trimmed !== name) throw new Error('目录名不能包含首尾空白')
    if (trimmed === '.' || trimmed === '..') throw new Error('目录名非法')
    if (/[/\\]/.test(trimmed)) throw new Error('目录名不能包含路径分隔符')
    if (Array.from(trimmed).some(ch => ch.charCodeAt(0) < 32)) throw new Error('目录名包含非法字符')
  }

  /** 双保险：最终落盘路径必须仍在日记根目录内 */
  private ensureWithinDiaryRoot(fullPath: string): void {
    const resolvedRoot = path.resolve(this.diaryRootPath)
    const resolved = path.resolve(fullPath)
    if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + path.sep)) {
      throw new Error('目录路径越界（已拒绝）')
    }
  }

  /**
   * 获取目录树
   */
  async getFolders(parentId?: string): Promise<DiaryIpcResponse<DiaryFolder[]>> {
    try {
      const db = getCoreDatabaseManager()
      const folders = parentId
        ? await db.diaryFolders!.findChildren(parentId)
        : await db.diaryFolders!.findRootFolders()
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
      const db = getCoreDatabaseManager()
      const folders = await db.diaryFolders!.findAll()
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
      const db = getCoreDatabaseManager()

      this.assertSafeFolderName(request.name)

      // 检查同名目录是否存在
      if (await db.diaryFolders!.existsByName(request.name, request.parentId)) {
        return { success: false, error: '同名目录已存在' }
      }

      // 计算完整路径
      let fullPath: string
      if (request.parentId) {
        const parent = await db.diaryFolders!.findById(request.parentId)
        if (!parent) {
          return { success: false, error: '父目录不存在' }
        }
        fullPath = path.join(this.diaryRootPath, parent.path, request.name)
      } else {
        fullPath = path.join(this.diaryRootPath, request.name)
      }
      this.ensureWithinDiaryRoot(fullPath)

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
      const folder = await db.diaryFolders!.create(request, relativePath)

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
      const db = getCoreDatabaseManager()
      const folder = await db.diaryFolders!.findById(id)
      if (!folder) {
        return { success: false, error: '目录不存在' }
      }

      // 检查新名称是否冲突
      if (request.name && request.name !== folder.name) {
        this.assertSafeFolderName(request.name)
        if (await db.diaryFolders!.existsByName(request.name, folder.parentId)) {
          return { success: false, error: '同名目录已存在' }
        }

        // 重命名文件系统目录（越界双保险：old/new 路径都必须在日记根内）
        const oldPath = path.join(this.diaryRootPath, folder.path)
        this.ensureWithinDiaryRoot(oldPath)
        const parentPath = path.dirname(oldPath)
        const newPath = path.join(parentPath, request.name)
        this.ensureWithinDiaryRoot(newPath)

        fs.renameSync(oldPath, newPath)

        // 更新数据库
        const newRelativePath = path.relative(this.diaryRootPath, newPath)
        await db.diaryFolders!.update(id, request, newRelativePath)
      } else {
        await db.diaryFolders!.update(id, request)
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
      const db = getCoreDatabaseManager()
      const folder = await db.diaryFolders!.findById(id)
      if (!folder) {
        return { success: false, error: '目录不存在' }
      }

      // 级联前收集条目 id：出库清理「日记」库文档（目录删除=彻底删除，不留 KB 残留）
      const entryIds = (
        await db.diaryEntries!.findByFolder(id).catch(() => [] as never[])
      ).map(e => e.id)
      const deletedEntries = ((await this.getDeletedEntries().catch(() => ({ data: [] }))).data ?? [])
        .filter(e => e.folderId === id)
        .map(e => e.id)
      await import('./diary-brain-sync.service').then(({ getDiaryBrainSyncService }) =>
        getDiaryBrainSyncService().purgeEntryIds([...entryIds, ...deletedEntries])
      )

      // 删除文件系统目录
      const fullPath = path.join(this.diaryRootPath, folder.path)
      fs.rmSync(fullPath, { recursive: true, force: true })

      // 删除数据库记录（级联删除子目录和日记）
      await db.diaryFolders!.delete(id)

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
      const db = getCoreDatabaseManager()
      const entries = await db.diaryEntries!.findByFolder(folderId)
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
      const db = getCoreDatabaseManager()
      const entry = await db.diaryEntries!.findById(id)
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
      const db = getCoreDatabaseManager()

      // 验证目录存在
      const folder = await db.diaryFolders!.findById(request.folderId)
      if (!folder) {
        return { success: false, error: '目录不存在' }
      }

      // 生成文件名
      const title = request.title || this.generateDefaultTitle()
      const fileName = `${title}.md`
      const relativePath = path.join(folder.path, fileName)
      const fullPath = path.join(this.diaryRootPath, relativePath)

      // 确保目录存在
      const dirPath = path.dirname(fullPath)
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true })
      }

      // 创建 Markdown 文件
      const content = request.content || `# ${title}\n\n`
      fs.writeFileSync(fullPath, content, 'utf-8')

      // 创建数据库记录
      const entry = await db.diaryEntries!.create(request, relativePath)

      // 解析并存储链接
      if (content) {
        await this.parseAndStoreLinks(entry.id, content)
      }

      // 延迟解析回填：本条目标题可能正好命中历史日记里的未解析 [[链接]]
      await db.diaryLinks!.updateTarget(title, entry.id)

      // 日记消化（P2）：opt-in 目录的新条目进入防抖同步队列（守卫在到期时校验）
      void import('./diary-brain-sync.service').then(({ getDiaryBrainSyncService }) =>
        getDiaryBrainSyncService().scheduleEntrySync(entry.id)
      )

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
      const db = getCoreDatabaseManager()
      const entry = await db.diaryEntries!.findById(id)
      if (!entry) {
        return { success: false, error: '日记不存在' }
      }

      // 更新文件内容
      if (request.content !== undefined) {
        const filePath = path.join(this.diaryRootPath, entry.filePath)
        fs.writeFileSync(filePath, request.content, 'utf-8')

        // 更新链接
        await db.diaryLinks!.deleteBySource(id)
        await this.parseAndStoreLinks(id, request.content)

        // 日记消化（P2）：内容变更重置 5 分钟防抖（连续自动保存只同步最后一次）
        void import('./diary-brain-sync.service').then(({ getDiaryBrainSyncService }) =>
          getDiaryBrainSyncService().scheduleEntrySync(id)
        )
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
        await db.diaryEntries!.update(id, { ...request, content: undefined })
        await db.diaryEntries!.move(id, entry.folderId, newRelativePath)

        // 反链显示快照同步 + 命中新标题的未解析链接回填
        await db.diaryLinks!.updateTitleReferences(id, entry.title, request.title)
        await db.diaryLinks!.updateTarget(request.title, id)
      } else {
        await db.diaryEntries!.update(id, request)
      }

      return { success: true }
    } catch (error) {
      console.error('[DiaryService] updateEntry error:', error)
      return { success: false, error: String(error) }
    }
  }

  /**
   * 删除日记（软删除：置 deleted_at 进回收站，文件保留原位，可恢复）
   */
  async deleteEntry(id: string): Promise<DiaryIpcResponse<void>> {
    try {
      const db = getCoreDatabaseManager()
      const entry = await db.diaryEntries!.findById(id)
      if (!entry) {
        return { success: false, error: '日记不存在' }
      }

      await db.diaryEntries!.softDelete(id)
      return { success: true }
    } catch (error) {
      console.error('[DiaryService] deleteEntry error:', error)
      return { success: false, error: String(error) }
    }
  }

  /**
   * 回收站列表
   */
  async getDeletedEntries(): Promise<DiaryIpcResponse<DiaryEntryListItem[]>> {
    try {
      const db = getCoreDatabaseManager()
      const entries = await db.diaryEntries!.findDeleted()
      return { success: true, data: entries }
    } catch (error) {
      console.error('[DiaryService] getDeletedEntries error:', error)
      return { success: false, error: String(error) }
    }
  }

  /**
   * 从回收站恢复
   */
  async restoreEntry(id: string): Promise<DiaryIpcResponse<void>> {
    try {
      const db = getCoreDatabaseManager()
      const ok = await db.diaryEntries!.restore(id)
      if (!ok) {
        return { success: false, error: '日记不存在' }
      }
      return { success: true }
    } catch (error) {
      console.error('[DiaryService] restoreEntry error:', error)
      return { success: false, error: String(error) }
    }
  }

  /**
   * 彻底删除（物理删除文件与记录，不可恢复）
   */
  async purgeEntry(id: string): Promise<DiaryIpcResponse<void>> {
    try {
      const db = getCoreDatabaseManager()
      const entry = await db.diaryEntries!.findById(id)
      if (!entry) {
        return { success: false, error: '日记不存在' }
      }

      const filePath = path.join(this.diaryRootPath, entry.filePath)
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }

      await db.diaryEntries!.delete(id)

      // 彻底删除 → 「日记」库文档同步出库（best-effort）
      void import('./diary-brain-sync.service').then(({ getDiaryBrainSyncService }) =>
        getDiaryBrainSyncService().purgeEntryIds([id])
      )

      return { success: true }
    } catch (error) {
      console.error('[DiaryService] purgeEntry error:', error)
      return { success: false, error: String(error) }
    }
  }

  /**
   * 清空回收站
   */
  async emptyTrash(): Promise<DiaryIpcResponse<void>> {
    try {
      const db = getCoreDatabaseManager()
      const deleted = await db.diaryEntries!.findDeleted()
      for (const item of deleted) {
        await this.purgeEntry(item.id)
      }
      return { success: true }
    } catch (error) {
      console.error('[DiaryService] emptyTrash error:', error)
      return { success: false, error: String(error) }
    }
  }

  /**
   * 物理清理过期软删除条目（默认 30 天）。应用启动时调用，积压量小，逐条处理即可。
   */
  async purgeExpired(retentionDays = 30): Promise<void> {
    try {
      const db = getCoreDatabaseManager()
      const deleted = await db.diaryEntries!.findDeleted()
      const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
      for (const item of deleted) {
        const deletedAt = new Date(item.deletedAt as unknown as string).getTime()
        if (!Number.isNaN(deletedAt) && deletedAt < cutoff) {
          await this.purgeEntry(item.id)
        }
      }
    } catch (error) {
      console.error('[DiaryService] purgeExpired error:', error)
    }
  }

  /**
   * 移动日记
   */
  async moveEntry(id: string, targetFolderId: string): Promise<DiaryIpcResponse<void>> {
    try {
      const db = getCoreDatabaseManager()
      const entry = await db.diaryEntries!.findById(id)
      if (!entry) {
        return { success: false, error: '日记不存在' }
      }

      const targetFolder = await db.diaryFolders!.findById(targetFolderId)
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
      await db.diaryEntries!.move(id, targetFolderId, newRelativePath)

      return { success: true }
    } catch (error) {
      console.error('[DiaryService] moveEntry error:', error)
      return { success: false, error: String(error) }
    }
  }

  // ==================== 搜索 ====================

  /**
   * 搜索日记（排除已删除）
   */
  async search(keyword: string, folderId?: string): Promise<DiaryIpcResponse<DiaryEntryListItem[]>> {
    try {
      const db = getCoreDatabaseManager()
      const entries = await db.diaryEntries!.search(keyword, folderId)
      return { success: true, data: entries }
    } catch (error) {
      console.error('[DiaryService] search error:', error)
      return { success: false, error: String(error) }
    }
  }

  /**
   * 按创建时间范围查询（日历视图 / 那年今日）
   */
  async getEntriesByDateRange(
    from: string,
    to: string,
    folderId?: string
  ): Promise<DiaryIpcResponse<DiaryEntryListItem[]>> {
    try {
      const db = getCoreDatabaseManager()
      const entries = await db.diaryEntries!.findByDateRange(new Date(from), new Date(to), folderId)
      return { success: true, data: entries }
    } catch (error) {
      console.error('[DiaryService] getEntriesByDateRange error:', error)
      return { success: false, error: String(error) }
    }
  }

  /**
   * 全部日记（跨目录，供链接插入对话框选择目标）
   */
  async listAllEntries(limit?: number): Promise<DiaryIpcResponse<DiaryEntryListItem[]>> {
    try {
      const db = getCoreDatabaseManager()
      const entries = await db.diaryEntries!.findAll(limit)
      return { success: true, data: entries }
    } catch (error) {
      console.error('[DiaryService] listAllEntries error:', error)
      return { success: false, error: String(error) }
    }
  }

  /**
   * F2 精细化加工反思流（spec 2026-09-24 §7）：复习卡揭示后写"联想到什么"，
   * 落为「学习反思」目录下的日记条目。复习面板接线用（FSRS 复习 UI 待建）。
   */
  async createReflectionEntry(
    cardTitle: string,
    reflectionText: string,
    kbName?: string
  ): Promise<DiaryIpcResponse<DiaryEntry>> {
    try {
      // 确保「学习反思」根目录（复用 save-diary 节点的按需创建模式）
      const foldersResp = await this.getAllFolders()
      const folders = foldersResp.success ? foldersResp.data ?? [] : []
      let folder = folders.find(f => f.name === '学习反思' && !f.parentId)
      if (!folder) {
        const created = await this.createFolder({ name: '学习反思' })
        if (!created.success || !created.data) {
          return { success: false, error: created.error ?? '创建学习反思目录失败' }
        }
        folder = created.data
      }

      const title = `反思：${cardTitle.slice(0, 50)}`
      const content = [
        `> 复习卡片：${cardTitle}${kbName ? `（${kbName}）` : ''}`,
        '',
        reflectionText.trim() || '（未填写联想内容）',
        '',
        '---',
        '_本文由复习后的精细化加工反思生成（spec 2026-09-24 F2）_',
      ].join('\n')

      return await this.createEntry({ folderId: folder.id, title, content })
    } catch (error) {
      console.error('[DiaryService] createReflectionEntry error:', error)
      return { success: false, error: String(error) }
    }
  }

  /**
   * 那年今日：历史同月同日的日记（不含今年），最多 limit 篇
   */
  async getOnThisDay(limit = 3): Promise<DiaryIpcResponse<DiaryEntryListItem[]>> {
    try {
      const db = getCoreDatabaseManager()
      const now = new Date()
      const entries = await db.diaryEntries!.findOnThisDay(now.getMonth() + 1, now.getDate(), now.getFullYear(), limit)
      return { success: true, data: entries }
    } catch (error) {
      console.error('[DiaryService] getOnThisDay error:', error)
      return { success: false, error: String(error) }
    }
  }

  // ==================== 链接管理 ====================

  /**
   * 获取反向链接
   */
  async getBacklinks(entryId: string): Promise<DiaryIpcResponse<BacklinkInfo[]>> {
    try {
      const db = getCoreDatabaseManager()
      const backlinks = await db.diaryLinks!.findIncomingLinks(entryId)
      return { success: true, data: backlinks }
    } catch (error) {
      console.error('[DiaryService] getBacklinks error:', error)
      return { success: false, error: String(error) }
    }
  }

  /**
   * 解析内容中的双向链接
   */
  private async parseAndStoreLinks(entryId: string, content: string): Promise<void> {
    const db = getCoreDatabaseManager()

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
    const linkData = await Promise.all(links.map(async link => {
      const targetEntry = await db.diaryEntries!.findByTitle(link.targetTitle)
      return {
        sourceEntryId: entryId,
        targetTitle: link.targetTitle,
        targetEntryId: targetEntry?.id,
        linkText: link.linkText,
        anchor: link.anchor
      }
    }))

    await db.diaryLinks!.createMany(linkData)
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