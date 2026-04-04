# 日记模块实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现一个完整的本地日记系统，支持 Markdown 编辑、目录管理、双向链接、附件管理和多格式导出。

**Architecture:** 采用 Electron IPC 分层架构：主进程负责文件系统操作和数据库管理，渲染进程负责 UI 展示，通过 preload 脚本安全暴露 API。使用 SQLite 存储元数据，Markdown 文件存储实际内容，支持双向链接解析和反向链接索引。

**Tech Stack:** Electron + Vue3 + TypeScript + SQLite (better-sqlite3) + ByteMD + KaTeX + Mermaid + docx

---

## Phase 1: 基础框架

### Task 1: 创建类型定义

**Files:**
- Create: `src/shared/types/diary.types.ts`
- Modify: `src/shared/types/index.ts`

**Step 1: 创建 diary.types.ts**

```typescript
/**
 * 日记模块类型定义
 * @module shared/types/diary.types
 */

// ==================== 目录 ====================

/**
 * 日记目录实体
 */
export interface DiaryFolder {
  /** 目录 ID */
  id: string
  /** 目录名称 */
  name: string
  /** 父目录 ID（NULL 表示根目录） */
  parentId?: string
  /** 文件系统路径（相对路径） */
  path: string
  /** 排序 */
  sortOrder: number
  /** 子目录数量 */
  childCount?: number
  /** 日记数量 */
  entryCount?: number
  /** 创建时间 */
  createdAt: Date | string
  /** 更新时间 */
  updatedAt: Date | string
}

/**
 * 创建目录请求
 */
export interface CreateDiaryFolderRequest {
  name: string
  parentId?: string
}

/**
 * 更新目录请求
 */
export interface UpdateDiaryFolderRequest {
  name?: string
  sortOrder?: number
}

// ==================== 日记条目 ====================

/**
 * 日记条目实体
 */
export interface DiaryEntry {
  /** 日记 ID */
  id: string
  /** 所属目录 ID */
  folderId: string
  /** 标题 */
  title: string
  /** Markdown 内容 */
  content?: string
  /** 文件路径（相对路径） */
  filePath: string
  /** 字数 */
  wordCount: number
  /** 标签（JSON 数组字符串） */
  tags?: string[]
  /** YAML frontmatter */
  frontmatter?: string
  /** 创建时间 */
  createdAt: Date | string
  /** 更新时间 */
  updatedAt: Date | string
}

/**
 * 创建日记请求
 */
export interface CreateDiaryEntryRequest {
  folderId: string
  title?: string
  content?: string
}

/**
 * 更新日记请求
 */
export interface UpdateDiaryEntryRequest {
  title?: string
  content?: string
  tags?: string[]
}

/**
 * 日记列表项（简化版）
 */
export interface DiaryEntryListItem {
  id: string
  folderId: string
  title: string
  preview?: string
  wordCount: number
  tags?: string[]
  createdAt: Date | string
  updatedAt: Date | string
}

// ==================== 双向链接 ====================

/**
 * 日记链接实体
 */
export interface DiaryLink {
  /** 链接 ID */
  id: string
  /** 源日记 ID */
  sourceEntryId: string
  /** 目标日记 ID（NULL 表示未解析的外部链接） */
  targetEntryId?: string
  /** 链接标题 */
  targetTitle: string
  /** 链接文本（显示文本） */
  linkText?: string
  /** 锚点 */
  anchor?: string
  /** 创建时间 */
  createdAt: Date | string
}

/**
 * 反向链接信息
 */
export interface BacklinkInfo {
  /** 源日记 ID */
  sourceEntryId: string
  /** 源日记标题 */
  sourceEntryTitle: string
  /** 链接文本 */
  linkText?: string
  /** 链接在源日记中的上下文 */
  context?: string
}

// ==================== 附件 ====================

/**
 * 日记附件实体
 */
export interface DiaryAttachment {
  /** 附件 ID */
  id: string
  /** 所属日记 ID */
  entryId: string
  /** 文件名 */
  fileName: string
  /** 文件路径（相对路径） */
  filePath: string
  /** 文件大小 */
  fileSize: number
  /** MIME 类型 */
  mimeType?: string
  /** 创建时间 */
  createdAt: Date | string
}

/**
 * 上传附件请求
 */
export interface UploadAttachmentRequest {
  entryId: string
  fileName: string
  fileData: ArrayBuffer
  mimeType?: string
}

// ==================== 导出 ====================

/**
 * 导出格式
 */
export type DiaryExportFormat = 'html' | 'pdf' | 'docx'

/**
 * 导出请求
 */
export interface DiaryExportRequest {
  entryId: string
  format: DiaryExportFormat
  outputPath?: string
}

/**
 * 导出到知识库请求
 */
export interface ExportToKnowledgeBaseRequest {
  entryId: string
  knowledgeBaseId: string
}

// ==================== 搜索 ====================

/**
 * 搜索请求
 */
export interface DiarySearchRequest {
  keyword: string
  folderId?: string
  limit?: number
}

/**
 * 搜索结果
 */
export interface DiarySearchResult {
  entry: DiaryEntryListItem
  matches: string[]
}

// ==================== IPC 响应 ====================

/**
 * 日记模块 IPC 响应类型
 */
export interface DiaryIpcResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}
```

**Step 2: 更新 index.ts 导出**

在 `src/shared/types/index.ts` 添加：

```typescript
export * from './diary.types'
```

**Step 3: 验证类型定义**

运行: `npm run typecheck`
预期: 通过，无类型错误

**Step 4: 提交**

```bash
git add src/shared/types/diary.types.ts src/shared/types/index.ts
git commit -m "feat(diary): add diary module type definitions"
```

---

### Task 2: 创建数据库表

**Files:**
- Modify: `src/main/database/index.ts`

**Step 1: 添加日记相关表 SQL**

在 `DatabaseManager` 类的 `createTables()` 方法中添加：

```typescript
// 日记目录表
this.db.exec(`
  CREATE TABLE IF NOT EXISTS diary_folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id TEXT,
    path TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES diary_folders(id) ON DELETE CASCADE
  )
`)

// 日记条目表
this.db.exec(`
  CREATE TABLE IF NOT EXISTS diary_entries (
    id TEXT PRIMARY KEY,
    folder_id TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    file_path TEXT NOT NULL,
    word_count INTEGER DEFAULT 0,
    tags TEXT,
    frontmatter TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (folder_id) REFERENCES diary_folders(id) ON DELETE CASCADE
  )
`)

// 日记链接表
this.db.exec(`
  CREATE TABLE IF NOT EXISTS diary_links (
    id TEXT PRIMARY KEY,
    source_entry_id TEXT NOT NULL,
    target_entry_id TEXT,
    target_title TEXT NOT NULL,
    link_text TEXT,
    anchor TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (source_entry_id) REFERENCES diary_entries(id) ON DELETE CASCADE,
    FOREIGN KEY (target_entry_id) REFERENCES diary_entries(id) ON DELETE CASCADE
  )
`)

// 日记附件表
this.db.exec(`
  CREATE TABLE IF NOT EXISTS diary_attachments (
    id TEXT PRIMARY KEY,
    entry_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER,
    mime_type TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (entry_id) REFERENCES diary_entries(id) ON DELETE CASCADE
  )
`)

// 创建索引
this.db.exec(`
  CREATE INDEX IF NOT EXISTS idx_diary_folders_parent ON diary_folders(parent_id)
`)
this.db.exec(`
  CREATE INDEX IF NOT EXISTS idx_diary_entries_folder ON diary_entries(folder_id)
`)
this.db.exec(`
  CREATE INDEX IF NOT EXISTS idx_diary_entries_created ON diary_entries(created_at DESC)
`)
this.db.exec(`
  CREATE INDEX IF NOT EXISTS idx_diary_links_source ON diary_links(source_entry_id)
`)
this.db.exec(`
  CREATE INDEX IF NOT EXISTS idx_diary_links_target ON diary_links(target_entry_id)
`)
```

**Step 2: 验证数据库初始化**

运行: `npm run dev`
预期: 应用启动成功，数据库表创建无误

**Step 3: 提交**

```bash
git add src/main/database/index.ts
git commit -m "feat(diary): add diary database tables and indexes"
```

---

### Task 3: 创建 DiaryFolderRepository

**Files:**
- Create: `src/main/database/repositories/diary-folder.repository.ts`

**Step 1: 创建 Repository 文件**

```typescript
/**
 * 日记目录数据访问层
 * @module database/repositories/diary-folder.repository
 */

import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import type {
  DiaryFolder,
  CreateDiaryFolderRequest,
  UpdateDiaryFolderRequest
} from '../../../shared/types/diary.types'

export class DiaryFolderRepository {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  /**
   * 将数据库行转换为 DiaryFolder 对象
   */
  private rowToEntity(row: any): DiaryFolder {
    return {
      id: row.id,
      name: row.name,
      parentId: row.parent_id || undefined,
      path: row.path,
      sortOrder: row.sort_order,
      childCount: row.child_count || 0,
      entryCount: row.entry_count || 0,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }
  }

  /**
   * 获取所有根目录
   */
  findRootFolders(): DiaryFolder[] {
    const rows = this.db.prepare(`
      SELECT f.*,
        (SELECT COUNT(*) FROM diary_folders WHERE parent_id = f.id) as child_count,
        (SELECT COUNT(*) FROM diary_entries WHERE folder_id = f.id) as entry_count
      FROM diary_folders f
      WHERE f.parent_id IS NULL
      ORDER BY f.sort_order, f.created_at DESC
    `).all() as any[]
    return rows.map(row => this.rowToEntity(row))
  }

  /**
   * 获取指定父目录下的子目录
   */
  findChildren(parentId: string): DiaryFolder[] {
    const rows = this.db.prepare(`
      SELECT f.*,
        (SELECT COUNT(*) FROM diary_folders WHERE parent_id = f.id) as child_count,
        (SELECT COUNT(*) FROM diary_entries WHERE folder_id = f.id) as entry_count
      FROM diary_folders f
      WHERE f.parent_id = ?
      ORDER BY f.sort_order, f.created_at DESC
    `).all(parentId) as any[]
    return rows.map(row => this.rowToEntity(row))
  }

  /**
   * 获取目录树（递归获取所有目录）
   */
  findAll(): DiaryFolder[] {
    const rows = this.db.prepare(`
      SELECT f.*,
        (SELECT COUNT(*) FROM diary_folders WHERE parent_id = f.id) as child_count,
        (SELECT COUNT(*) FROM diary_entries WHERE folder_id = f.id) as entry_count
      FROM diary_folders f
      ORDER BY f.sort_order, f.created_at DESC
    `).all() as any[]
    return rows.map(row => this.rowToEntity(row))
  }

  /**
   * 根据 ID 获取目录
   */
  findById(id: string): DiaryFolder | null {
    const row = this.db.prepare(`
      SELECT f.*,
        (SELECT COUNT(*) FROM diary_folders WHERE parent_id = f.id) as child_count,
        (SELECT COUNT(*) FROM diary_entries WHERE folder_id = f.id) as entry_count
      FROM diary_folders f
      WHERE f.id = ?
    `).get(id) as any
    if (!row) return null
    return this.rowToEntity(row)
  }

  /**
   * 根据路径获取目录
   */
  findByPath(path: string): DiaryFolder | null {
    const row = this.db.prepare(`
      SELECT f.*,
        (SELECT COUNT(*) FROM diary_folders WHERE parent_id = f.id) as child_count,
        (SELECT COUNT(*) FROM diary_entries WHERE folder_id = f.id) as entry_count
      FROM diary_folders f
      WHERE f.path = ?
    `).get(path) as any
    if (!row) return null
    return this.rowToEntity(row)
  }

  /**
   * 检查同名目录是否存在
   */
  existsByName(name: string, parentId?: string): boolean {
    const sql = parentId
      ? 'SELECT id FROM diary_folders WHERE name = ? AND parent_id = ?'
      : 'SELECT id FROM diary_folders WHERE name = ? AND parent_id IS NULL'
    const params = parentId ? [name, parentId] : [name]
    const row = this.db.prepare(sql).get(...params) as any
    return !!row
  }

  /**
   * 创建目录
   */
  create(request: CreateDiaryFolderRequest, fullPath: string): DiaryFolder {
    const id = randomUUID()
    const now = new Date().toISOString()

    this.db.prepare(`
      INSERT INTO diary_folders (id, name, parent_id, path, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, 0, ?, ?)
    `).run(
      id,
      request.name,
      request.parentId || null,
      fullPath,
      now,
      now
    )

    return {
      id,
      name: request.name,
      parentId: request.parentId,
      path: fullPath,
      sortOrder: 0,
      childCount: 0,
      entryCount: 0,
      createdAt: new Date(now),
      updatedAt: new Date(now)
    }
  }

  /**
   * 更新目录
   */
  update(id: string, request: UpdateDiaryFolderRequest, newPath?: string): boolean {
    const fields: string[] = []
    const values: any[] = []

    if (request.name !== undefined) {
      fields.push('name = ?')
      values.push(request.name)
    }
    if (request.sortOrder !== undefined) {
      fields.push('sort_order = ?')
      values.push(request.sortOrder)
    }
    if (newPath !== undefined) {
      fields.push('path = ?')
      values.push(newPath)
    }

    if (fields.length === 0) return false

    fields.push('updated_at = ?')
    values.push(new Date().toISOString())
    values.push(id)

    const result = this.db.prepare(
      `UPDATE diary_folders SET ${fields.join(', ')} WHERE id = ?`
    ).run(...values)

    return result.changes > 0
  }

  /**
   * 删除目录（级联删除子目录和日记）
   */
  delete(id: string): boolean {
    const result = this.db.prepare(
      'DELETE FROM diary_folders WHERE id = ?'
    ).run(id)
    return result.changes > 0
  }

  /**
   * 统计目录数量
   */
  count(): number {
    const row = this.db.prepare(
      'SELECT COUNT(*) as count FROM diary_folders'
    ).get() as { count: number }
    return row?.count || 0
  }
}
```

**Step 2: 提交**

```bash
git add src/main/database/repositories/diary-folder.repository.ts
git commit -m "feat(diary): add DiaryFolderRepository"
```

---

### Task 4: 创建 DiaryEntryRepository

**Files:**
- Create: `src/main/database/repositories/diary-entry.repository.ts`

**Step 1: 创建 Repository 文件**

```typescript
/**
 * 日记条目数据访问层
 * @module database/repositories/diary-entry.repository
 */

import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import type {
  DiaryEntry,
  DiaryEntryListItem,
  CreateDiaryEntryRequest,
  UpdateDiaryEntryRequest
} from '../../../shared/types/diary.types'

export class DiaryEntryRepository {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  /**
   * 将数据库行转换为 DiaryEntry 对象
   */
  private rowToEntity(row: any): DiaryEntry {
    return {
      id: row.id,
      folderId: row.folder_id,
      title: row.title,
      content: row.content || undefined,
      filePath: row.file_path,
      wordCount: row.word_count || 0,
      tags: row.tags ? JSON.parse(row.tags) : undefined,
      frontmatter: row.frontmatter || undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }
  }

  /**
   * 将数据库行转换为 DiaryEntryListItem 对象
   */
  private rowToListItem(row: any): DiaryEntryListItem {
    const content = row.content || ''
    return {
      id: row.id,
      folderId: row.folder_id,
      title: row.title,
      preview: content.slice(0, 200),
      wordCount: row.word_count || 0,
      tags: row.tags ? JSON.parse(row.tags) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }
  }

  /**
   * 获取目录下的日记列表
   */
  findByFolder(folderId: string): DiaryEntryListItem[] {
    const rows = this.db.prepare(`
      SELECT id, folder_id, title, content, file_path, word_count, tags, created_at, updated_at
      FROM diary_entries
      WHERE folder_id = ?
      ORDER BY created_at DESC
    `).all(folderId) as any[]
    return rows.map(row => this.rowToListItem(row))
  }

  /**
   * 获取所有日记列表（按时间倒序）
   */
  findAll(limit?: number): DiaryEntryListItem[] {
    const sql = limit
      ? `SELECT id, folder_id, title, content, file_path, word_count, tags, created_at, updated_at
         FROM diary_entries ORDER BY created_at DESC LIMIT ?`
      : `SELECT id, folder_id, title, content, file_path, word_count, tags, created_at, updated_at
         FROM diary_entries ORDER BY created_at DESC`
    const rows = this.db.prepare(sql).all(...(limit ? [limit] : [])) as any[]
    return rows.map(row => this.rowToListItem(row))
  }

  /**
   * 根据 ID 获取日记详情
   */
  findById(id: string): DiaryEntry | null {
    const row = this.db.prepare(`
      SELECT * FROM diary_entries WHERE id = ?
    `).get(id) as any
    if (!row) return null
    return this.rowToEntity(row)
  }

  /**
   * 根据标题搜索日记
   */
  findByTitle(title: string): DiaryEntry | null {
    const row = this.db.prepare(`
      SELECT * FROM diary_entries WHERE title = ?
    `).get(title) as any
    if (!row) return null
    return this.rowToEntity(row)
  }

  /**
   * 模糊搜索日记
   */
  search(keyword: string, folderId?: string): DiaryEntryListItem[] {
    const pattern = `%${keyword}%`
    let sql: string
    let params: any[]

    if (folderId) {
      sql = `
        SELECT id, folder_id, title, content, file_path, word_count, tags, created_at, updated_at
        FROM diary_entries
        WHERE folder_id = ? AND (title LIKE ? OR content LIKE ?)
        ORDER BY created_at DESC
      `
      params = [folderId, pattern, pattern]
    } else {
      sql = `
        SELECT id, folder_id, title, content, file_path, word_count, tags, created_at, updated_at
        FROM diary_entries
        WHERE title LIKE ? OR content LIKE ?
        ORDER BY created_at DESC
      `
      params = [pattern, pattern]
    }

    const rows = this.db.prepare(sql).all(...params) as any[]
    return rows.map(row => this.rowToListItem(row))
  }

  /**
   * 创建日记
   */
  create(request: CreateDiaryEntryRequest, filePath: string): DiaryEntry {
    const id = randomUUID()
    const now = new Date().toISOString()
    const title = request.title || this.generateDefaultTitle()

    this.db.prepare(`
      INSERT INTO diary_entries (id, folder_id, title, content, file_path, word_count, tags, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, NULL, ?, ?)
    `).run(
      id,
      request.folderId,
      title,
      request.content || '',
      filePath,
      now,
      now
    )

    return {
      id,
      folderId: request.folderId,
      title,
      content: request.content,
      filePath,
      wordCount: 0,
      createdAt: new Date(now),
      updatedAt: new Date(now)
    }
  }

  /**
   * 更新日记
   */
  update(id: string, request: UpdateDiaryEntryRequest): boolean {
    const fields: string[] = []
    const values: any[] = []

    if (request.title !== undefined) {
      fields.push('title = ?')
      values.push(request.title)
    }
    if (request.content !== undefined) {
      fields.push('content = ?')
      values.push(request.content)
      // 更新字数
      fields.push('word_count = ?')
      values.push(this.countWords(request.content))
    }
    if (request.tags !== undefined) {
      fields.push('tags = ?')
      values.push(JSON.stringify(request.tags))
    }

    if (fields.length === 0) return false

    fields.push('updated_at = ?')
    values.push(new Date().toISOString())
    values.push(id)

    const result = this.db.prepare(
      `UPDATE diary_entries SET ${fields.join(', ')} WHERE id = ?`
    ).run(...values)

    return result.changes > 0
  }

  /**
   * 移动日记到其他目录
   */
  move(id: string, targetFolderId: string, newFilePath: string): boolean {
    const result = this.db.prepare(`
      UPDATE diary_entries
      SET folder_id = ?, file_path = ?, updated_at = ?
      WHERE id = ?
    `).run(targetFolderId, newFilePath, new Date().toISOString(), id)

    return result.changes > 0
  }

  /**
   * 删除日记
   */
  delete(id: string): boolean {
    const result = this.db.prepare(
      'DELETE FROM diary_entries WHERE id = ?'
    ).run(id)
    return result.changes > 0
  }

  /**
   * 统计日记数量
   */
  count(folderId?: string): number {
    const sql = folderId
      ? 'SELECT COUNT(*) as count FROM diary_entries WHERE folder_id = ?'
      : 'SELECT COUNT(*) as count FROM diary_entries'
    const row = this.db.prepare(sql).get(...(folderId ? [folderId] : [])) as { count: number }
    return row?.count || 0
  }

  /**
   * 生成默认标题（使用日期）
   */
  private generateDefaultTitle(): string {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  /**
   * 计算字数
   */
  private countWords(content: string): number {
    // 移除 Markdown 标记并计算字数
    const text = content
      .replace(/```[\s\S]*?```/g, '') // 移除代码块
      .replace(/`[^`]+`/g, '') // 移除行内代码
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // 链接只保留文本
      .replace(/[#*_~>|]/g, '') // 移除 Markdown 标记
      .replace(/\s+/g, ' ') // 合并空白
      .trim()
    return text.length
  }
}
```

**Step 2: 提交**

```bash
git add src/main/database/repositories/diary-entry.repository.ts
git commit -m "feat(diary): add DiaryEntryRepository"
```

---

### Task 5: 创建 DiaryLinkRepository

**Files:**
- Create: `src/main/database/repositories/diary-link.repository.ts`

**Step 1: 创建 Repository 文件**

```typescript
/**
 * 日记链接数据访问层
 * @module database/repositories/diary-link.repository
 */

import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import type {
  DiaryLink,
  BacklinkInfo
} from '../../../shared/types/diary.types'

export class DiaryLinkRepository {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  /**
   * 获取日记的所有出链（该日记引用的其他日记）
   */
  findOutgoingLinks(sourceEntryId: string): DiaryLink[] {
    const rows = this.db.prepare(`
      SELECT * FROM diary_links WHERE source_entry_id = ?
    `).all(sourceEntryId) as any[]
    return rows.map(row => this.rowToEntity(row))
  }

  /**
   * 获取日记的所有反向链接（引用该日记的其他日记）
   */
  findIncomingLinks(targetEntryId: string): BacklinkInfo[] {
    const rows = this.db.prepare(`
      SELECT l.*, e.title as source_entry_title
      FROM diary_links l
      JOIN diary_entries e ON l.source_entry_id = e.id
      WHERE l.target_entry_id = ?
    `).all(targetEntryId) as any[]
    return rows.map(row => ({
      sourceEntryId: row.source_entry_id,
      sourceEntryTitle: row.source_entry_title,
      linkText: row.link_text || undefined,
      context: undefined // TODO: 提取上下文
    }))
  }

  /**
   * 获取未解析的链接（目标日记不存在）
   */
  findUnresolvedLinks(sourceEntryId: string): DiaryLink[] {
    const rows = this.db.prepare(`
      SELECT * FROM diary_links
      WHERE source_entry_id = ? AND target_entry_id IS NULL
    `).all(sourceEntryId) as any[]
    return rows.map(row => this.rowToEntity(row))
  }

  /**
   * 创建链接
   */
  create(
    sourceEntryId: string,
    targetTitle: string,
    options?: { targetEntryId?: string; linkText?: string; anchor?: string }
  ): DiaryLink {
    const id = randomUUID()
    const now = new Date().toISOString()

    this.db.prepare(`
      INSERT INTO diary_links (id, source_entry_id, target_entry_id, target_title, link_text, anchor, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      sourceEntryId,
      options?.targetEntryId || null,
      targetTitle,
      options?.linkText || null,
      options?.anchor || null,
      now
    )

    return {
      id,
      sourceEntryId,
      targetEntryId: options?.targetEntryId,
      targetTitle,
      linkText: options?.linkText,
      anchor: options?.anchor,
      createdAt: new Date(now)
    }
  }

  /**
   * 批量创建链接
   */
  createMany(links: Array<{
    sourceEntryId: string
    targetTitle: string
    targetEntryId?: string
    linkText?: string
    anchor?: string
  }>): void {
    const stmt = this.db.prepare(`
      INSERT INTO diary_links (id, source_entry_id, target_entry_id, target_title, link_text, anchor, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)

    const now = new Date().toISOString()
    const insertMany = this.db.transaction((items: typeof links) => {
      for (const link of items) {
        stmt.run(
          randomUUID(),
          link.sourceEntryId,
          link.targetEntryId || null,
          link.targetTitle,
          link.linkText || null,
          link.anchor || null,
          now
        )
      }
    })

    insertMany(links)
  }

  /**
   * 删除日记的所有出链
   */
  deleteBySource(sourceEntryId: string): void {
    this.db.prepare(
      'DELETE FROM diary_links WHERE source_entry_id = ?'
    ).run(sourceEntryId)
  }

  /**
   * 更新链接的目标（用于解析未创建的链接）
   */
  updateTarget(targetTitle: string, targetEntryId: string): void {
    this.db.prepare(`
      UPDATE diary_links
      SET target_entry_id = ?
      WHERE target_title = ? AND target_entry_id IS NULL
    `).run(targetEntryId, targetTitle)
  }

  /**
   * 将数据库行转换为 DiaryLink 对象
   */
  private rowToEntity(row: any): DiaryLink {
    return {
      id: row.id,
      sourceEntryId: row.source_entry_id,
      targetEntryId: row.target_entry_id || undefined,
      targetTitle: row.target_title,
      linkText: row.link_text || undefined,
      anchor: row.anchor || undefined,
      createdAt: new Date(row.created_at)
    }
  }
}
```

**Step 2: 提交**

```bash
git add src/main/database/repositories/diary-link.repository.ts
git commit -m "feat(diary): add DiaryLinkRepository for bidirectional links"
```

---

### Task 6: 创建 DiaryAttachmentRepository

**Files:**
- Create: `src/main/database/repositories/diary-attachment.repository.ts`

**Step 1: 创建 Repository 文件**

```typescript
/**
 * 日记附件数据访问层
 * @module database/repositories/diary-attachment.repository
 */

import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import type { DiaryAttachment } from '../../../shared/types/diary.types'

export class DiaryAttachmentRepository {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  /**
   * 获取日记的所有附件
   */
  findByEntry(entryId: string): DiaryAttachment[] {
    const rows = this.db.prepare(`
      SELECT * FROM diary_attachments WHERE entry_id = ?
      ORDER BY created_at DESC
    `).all(entryId) as any[]
    return rows.map(row => this.rowToEntity(row))
  }

  /**
   * 根据 ID 获取附件
   */
  findById(id: string): DiaryAttachment | null {
    const row = this.db.prepare(`
      SELECT * FROM diary_attachments WHERE id = ?
    `).get(id) as any
    if (!row) return null
    return this.rowToEntity(row)
  }

  /**
   * 创建附件记录
   */
  create(
    entryId: string,
    fileName: string,
    filePath: string,
    fileSize: number,
    mimeType?: string
  ): DiaryAttachment {
    const id = randomUUID()
    const now = new Date().toISOString()

    this.db.prepare(`
      INSERT INTO diary_attachments (id, entry_id, file_name, file_path, file_size, mime_type, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      entryId,
      fileName,
      filePath,
      fileSize,
      mimeType || null,
      now
    )

    return {
      id,
      entryId,
      fileName,
      filePath,
      fileSize,
      mimeType,
      createdAt: new Date(now)
    }
  }

  /**
   * 删除附件
   */
  delete(id: string): boolean {
    const result = this.db.prepare(
      'DELETE FROM diary_attachments WHERE id = ?'
    ).run(id)
    return result.changes > 0
  }

  /**
   * 删除日记的所有附件
   */
  deleteByEntry(entryId: string): void {
    this.db.prepare(
      'DELETE FROM diary_attachments WHERE entry_id = ?'
    ).run(entryId)
  }

  /**
   * 统计附件数量
   */
  count(entryId?: string): number {
    const sql = entryId
      ? 'SELECT COUNT(*) as count FROM diary_attachments WHERE entry_id = ?'
      : 'SELECT COUNT(*) as count FROM diary_attachments'
    const row = this.db.prepare(sql).get(...(entryId ? [entryId] : [])) as { count: number }
    return row?.count || 0
  }

  /**
   * 将数据库行转换为 DiaryAttachment 对象
   */
  private rowToEntity(row: any): DiaryAttachment {
    return {
      id: row.id,
      entryId: row.entry_id,
      fileName: row.file_name,
      filePath: row.file_path,
      fileSize: row.file_size,
      mimeType: row.mime_type || undefined,
      createdAt: new Date(row.created_at)
    }
  }
}
```

**Step 2: 提交**

```bash
git add src/main/database/repositories/diary-attachment.repository.ts
git commit -m "feat(diary): add DiaryAttachmentRepository"
```

---

### Task 7: 注册 Repository 到 DatabaseManager

**Files:**
- Modify: `src/main/database/index.ts`

**Step 1: 导入并注册 Repository**

在 `DatabaseManager` 类中添加：

```typescript
import { DiaryFolderRepository } from './repositories/diary-folder.repository'
import { DiaryEntryRepository } from './repositories/diary-entry.repository'
import { DiaryLinkRepository } from './repositories/diary-link.repository'
import { DiaryAttachmentRepository } from './repositories/diary-attachment.repository'

// 在类属性中添加
private diaryFolderRepository?: DiaryFolderRepository
private diaryEntryRepository?: DiaryEntryRepository
private diaryLinkRepository?: DiaryLinkRepository
private diaryAttachmentRepository?: DiaryAttachmentRepository

// 添加 getter 方法
get diaryFolders(): DiaryFolderRepository {
  if (!this.diaryFolderRepository) {
    this.diaryFolderRepository = new DiaryFolderRepository(this.db!)
  }
  return this.diaryFolderRepository
}

get diaryEntries(): DiaryEntryRepository {
  if (!this.diaryEntryRepository) {
    this.diaryEntryRepository = new DiaryEntryRepository(this.db!)
  }
  return this.diaryEntryRepository
}

get diaryLinks(): DiaryLinkRepository {
  if (!this.diaryLinkRepository) {
    this.diaryLinkRepository = new DiaryLinkRepository(this.db!)
  }
  return this.diaryLinkRepository
}

get diaryAttachments(): DiaryAttachmentRepository {
  if (!this.diaryAttachmentRepository) {
    this.diaryAttachmentRepository = new DiaryAttachmentRepository(this.db!)
  }
  return this.diaryAttachmentRepository
}
```

**Step 2: 验证编译**

运行: `npm run typecheck`
预期: 通过

**Step 3: 提交**

```bash
git add src/main/database/index.ts
git commit -m "feat(diary): register diary repositories in DatabaseManager"
```

---

## Phase 2: 核心服务

### Task 8: 创建 DiaryService

**Files:**
- Create: `src/main/services/diary.service.ts`

**Step 1: 创建服务文件**

```typescript
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
        ? db.diaryFolders.findChildren(parentId)
        : db.diaryFolders.findRootFolders()
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
      const folders = db.diaryFolders.findAll()
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
      if (db.diaryFolders.existsByName(request.name, request.parentId)) {
        return { success: false, error: '同名目录已存在' }
      }

      // 计算完整路径
      let fullPath: string
      if (request.parentId) {
        const parent = db.diaryFolders.findById(request.parentId)
        if (!parent) {
          return { success: false, error: '父目录不存在' }
        }
        fullPath = path.join(parent.path, request.name)
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
      const folder = db.diaryFolders.create(request, relativePath)

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
      const folder = db.diaryFolders.findById(id)
      if (!folder) {
        return { success: false, error: '目录不存在' }
      }

      // 检查新名称是否冲突
      if (request.name && request.name !== folder.name) {
        if (db.diaryFolders.existsByName(request.name, folder.parentId)) {
          return { success: false, error: '同名目录已存在' }
        }

        // 重命名文件系统目录
        const oldPath = path.join(this.diaryRootPath, folder.path)
        const parentPath = path.dirname(oldPath)
        const newPath = path.join(parentPath, request.name)

        fs.renameSync(oldPath, newPath)

        // 更新数据库
        const newRelativePath = path.relative(this.diaryRootPath, newPath)
        db.diaryFolders.update(id, request, newRelativePath)
      } else {
        db.diaryFolders.update(id, request)
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
      const folder = db.diaryFolders.findById(id)
      if (!folder) {
        return { success: false, error: '目录不存在' }
      }

      // 删除文件系统目录
      const fullPath = path.join(this.diaryRootPath, folder.path)
      fs.rmSync(fullPath, { recursive: true, force: true })

      // 删除数据库记录（级联删除子目录和日记）
      db.diaryFolders.delete(id)

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
      const entries = db.diaryEntries.findByFolder(folderId)
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
      const entry = db.diaryEntries.findById(id)
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
      const folder = db.diaryFolders.findById(request.folderId)
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
      const entry = db.diaryEntries.create(request, relativePath)

      // 解析并存储链接
      if (content) {
        await this.parseAndStoreLinks(entry.id, content)
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
      const entry = db.diaryEntries.findById(id)
      if (!entry) {
        return { success: false, error: '日记不存在' }
      }

      // 更新文件内容
      if (request.content !== undefined) {
        const filePath = path.join(this.diaryRootPath, entry.filePath)
        fs.writeFileSync(filePath, request.content, 'utf-8')

        // 更新链接
        db.diaryLinks.deleteBySource(id)
        await this.parseAndStoreLinks(id, request.content)
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
        db.diaryEntries.update(id, { ...request, content: undefined })
        // 更新文件路径
        db.diaryEntries.move(id, entry.folderId, newRelativePath)
      } else {
        db.diaryEntries.update(id, request)
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
      const entry = db.diaryEntries.findById(id)
      if (!entry) {
        return { success: false, error: '日记不存在' }
      }

      // 删除文件
      const filePath = path.join(this.diaryRootPath, entry.filePath)
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }

      // 删除数据库记录（级联删除链接和附件记录）
      db.diaryEntries.delete(id)

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
      const entry = db.diaryEntries.findById(id)
      if (!entry) {
        return { success: false, error: '日记不存在' }
      }

      const targetFolder = db.diaryFolders.findById(targetFolderId)
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
      db.diaryEntries.move(id, targetFolderId, newRelativePath)

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
      const entries = db.diaryEntries.search(keyword, folderId)
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
      const backlinks = db.diaryLinks.findIncomingLinks(entryId)
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
      const targetEntry = db.diaryEntries.findByTitle(link.targetTitle)
      return {
        sourceEntryId: entryId,
        targetTitle: link.targetTitle,
        targetEntryId: targetEntry?.id,
        linkText: link.linkText,
        anchor: link.anchor
      }
    })

    db.diaryLinks.createMany(linkData)
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
```

**Step 2: 提交**

```bash
git add src/main/services/diary.service.ts
git commit -m "feat(diary): add DiaryService with folder and entry management"
```

---

### Task 9: 创建 DiaryExportService

**Files:**
- Create: `src/main/services/diary-export.service.ts`

**Step 1: 创建导出服务文件**

```typescript
/**
 * 日记导出服务
 * @module services/diary-export.service
 */

import { BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { marked } from 'marked'
import { DiaryService } from './diary.service'
import { markdownToDocx } from '../utils/markdown-to-docx'
import type { DiaryIpcResponse } from '../../shared/types/diary.types'

export class DiaryExportService {
  private diaryService: DiaryService

  constructor(diaryService: DiaryService) {
    this.diaryService = diaryService
  }

  /**
   * 导出为 HTML
   */
  async exportToHtml(entryId: string, outputPath?: string): Promise<DiaryIpcResponse<string>> {
    try {
      const result = await this.diaryService.getEntry(entryId)
      if (!result.success || !result.data) {
        return { success: false, error: result.error }
      }

      const entry = result.data
      const htmlContent = await marked(entry.content || '')
      const fullHtml = this.wrapHtml(entry.title, htmlContent)

      const filePath = outputPath || this.getDefaultExportPath(entry.title, 'html')
      fs.writeFileSync(filePath, fullHtml, 'utf-8')

      return { success: true, data: filePath }
    } catch (error) {
      console.error('[DiaryExportService] exportToHtml error:', error)
      return { success: false, error: String(error) }
    }
  }

  /**
   * 导出为 PDF
   */
  async exportToPdf(entryId: string, window: BrowserWindow): Promise<DiaryIpcResponse<string>> {
    try {
      const result = await this.diaryService.getEntry(entryId)
      if (!result.success || !result.data) {
        return { success: false, error: result.error }
      }

      const entry = result.data
      const htmlContent = await marked(entry.content || '')
      const fullHtml = this.wrapHtml(entry.title, htmlContent, true)

      // 创建临时 HTML 文件
      const tempPath = path.join(this.diaryService.getRootPath(), '.temp-export.html')
      fs.writeFileSync(tempPath, fullHtml, 'utf-8')

      // 加载 HTML 并打印
      await window.loadFile(tempPath)

      const pdfData = await window.webContents.printToPDF({
        pageSize: 'A4',
        printBackground: true,
        margins: {
          top: 1,
          bottom: 1,
          left: 1,
          right: 1
        }
      })

      // 清理临时文件
      fs.unlinkSync(tempPath)

      // 保存 PDF
      const outputPath = this.getDefaultExportPath(entry.title, 'pdf')
      fs.writeFileSync(outputPath, pdfData)

      return { success: true, data: outputPath }
    } catch (error) {
      console.error('[DiaryExportService] exportToPdf error:', error)
      return { success: false, error: String(error) }
    }
  }

  /**
   * 导出为 Word
   */
  async exportToDocx(entryId: string, outputPath?: string): Promise<DiaryIpcResponse<string>> {
    try {
      const result = await this.diaryService.getEntry(entryId)
      if (!result.success || !result.data) {
        return { success: false, error: result.error }
      }

      const entry = result.data
      const buffer = await markdownToDocx(entry.content || '', {
        title: entry.title
      })

      const filePath = outputPath || this.getDefaultExportPath(entry.title, 'docx')
      fs.writeFileSync(filePath, buffer)

      return { success: true, data: filePath }
    } catch (error) {
      console.error('[DiaryExportService] exportToDocx error:', error)
      return { success: false, error: String(error) }
    }
  }

  /**
   * 包装 HTML 内容
   */
  private wrapHtml(title: string, content: string, forPrint: boolean = false): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      line-height: 1.8;
      color: #333;
    }
    h1, h2, h3, h4, h5, h6 {
      margin-top: 24px;
      margin-bottom: 16px;
    }
    pre {
      background: #f6f8fa;
      padding: 16px;
      border-radius: 6px;
      overflow-x: auto;
    }
    code {
      background: #f6f8fa;
      padding: 0.2em 0.4em;
      border-radius: 3px;
    }
    blockquote {
      border-left: 4px solid #ddd;
      padding-left: 16px;
      color: #666;
    }
    img {
      max-width: 100%;
    }
    ${forPrint ? '@media print { body { padding: 0; } }' : ''}
  </style>
</head>
<body>
  <h1>${title}</h1>
  ${content}
</body>
</html>`
  }

  /**
   * 获取默认导出路径
   */
  private getDefaultExportPath(title: string, ext: string): string {
    const downloadsPath = path.join(require('os').homedir(), 'Downloads')
    const safeName = title.replace(/[<>:"/\\|?*]/g, '_')
    return path.join(downloadsPath, `${safeName}.${ext}`)
  }
}
```

**Step 2: 提交**

```bash
git add src/main/services/diary-export.service.ts
git commit -m "feat(diary): add DiaryExportService for HTML/PDF/DOCX export"
```

---

### Task 10: 创建 IPC Handler

**Files:**
- Create: `src/main/ipc/handlers/diary.handler.ts`
- Modify: `src/main/index.ts`

**Step 1: 创建 IPC Handler**

```typescript
/**
 * 日记模块 IPC 处理器
 * @module ipc/handlers/diary.handler
 */

import { ipcMain, BrowserWindow } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { DiaryService } from '../../services/diary.service'
import { DiaryExportService } from '../../services/diary-export.service'
import type {
  CreateDiaryFolderRequest,
  UpdateDiaryFolderRequest,
  CreateDiaryEntryRequest,
  UpdateDiaryEntryRequest
} from '../../../shared/types/diary.types'

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
  event: IpcMainInvokeEvent,
  data: { entryId: string }
) {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window) {
    return { success: false, error: '窗口不存在' }
  }
  return await getDiaryExportService().exportToPdf(data.entryId, window)
}

async function handleExportDocx(
  _event: IpcMainInvokeEvent,
  data: { entryId: string; outputPath?: string }
) {
  return await getDiaryExportService().exportToDocx(data.entryId, data.outputPath)
}
```

**Step 2: 注册 Handler 到主进程**

在 `src/main/index.ts` 中添加：

```typescript
import { registerDiaryHandlers } from './ipc/handlers/diary.handler'

// 在 initIpcHandlers 函数中添加
registerDiaryHandlers()
```

**Step 3: 提交**

```bash
git add src/main/ipc/handlers/diary.handler.ts src/main/index.ts
git commit -m "feat(diary): add diary IPC handlers"
```

---

### Task 11: 添加 Preload API

**Files:**
- Modify: `src/preload/index.ts`

**Step 1: 添加 IPC 通道常量**

在 `IPC_CHANNELS` 对象中添加：

```typescript
// 日记相关
DIARY_LIST_FOLDERS: 'diary:list-folders',
DIARY_GET_ALL_FOLDERS: 'diary:get-all-folders',
DIARY_CREATE_FOLDER: 'diary:create-folder',
DIARY_UPDATE_FOLDER: 'diary:update-folder',
DIARY_DELETE_FOLDER: 'diary:delete-folder',
DIARY_LIST_ENTRIES: 'diary:list-entries',
DIARY_GET_ENTRY: 'diary:get-entry',
DIARY_CREATE_ENTRY: 'diary:create-entry',
DIARY_UPDATE_ENTRY: 'diary:update-entry',
DIARY_DELETE_ENTRY: 'diary:delete-entry',
DIARY_MOVE_ENTRY: 'diary:move-entry',
DIARY_SEARCH: 'diary:search',
DIARY_GET_BACKLINKS: 'diary:get-backlinks',
DIARY_EXPORT_HTML: 'diary:export-html',
DIARY_EXPORT_PDF: 'diary:export-pdf',
DIARY_EXPORT_DOCX: 'diary:export-docx',
```

**Step 2: 添加 diary API 对象**

在 `electronAPI` 对象中添加：

```typescript
// 日记相关
diary: {
  listFolders: (parentId?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.DIARY_LIST_FOLDERS, parentId),
  getAllFolders: () =>
    ipcRenderer.invoke(IPC_CHANNELS.DIARY_GET_ALL_FOLDERS),
  createFolder: (data: { name: string; parentId?: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.DIARY_CREATE_FOLDER, data),
  updateFolder: (id: string, data: { name?: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.DIARY_UPDATE_FOLDER, { id, request: data }),
  deleteFolder: (id: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.DIARY_DELETE_FOLDER, id),

  listEntries: (folderId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.DIARY_LIST_ENTRIES, folderId),
  getEntry: (id: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.DIARY_GET_ENTRY, id),
  createEntry: (data: { folderId: string; title?: string; content?: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.DIARY_CREATE_ENTRY, data),
  updateEntry: (id: string, data: { title?: string; content?: string; tags?: string[] }) =>
    ipcRenderer.invoke(IPC_CHANNELS.DIARY_UPDATE_ENTRY, { id, request: data }),
  deleteEntry: (id: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.DIARY_DELETE_ENTRY, id),
  moveEntry: (id: string, targetFolderId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.DIARY_MOVE_ENTRY, { id, targetFolderId }),

  search: (keyword: string, folderId?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.DIARY_SEARCH, { keyword, folderId }),

  getBacklinks: (entryId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.DIARY_GET_BACKLINKS, entryId),

  exportHtml: (entryId: string, outputPath?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.DIARY_EXPORT_HTML, { entryId, outputPath }),
  exportPdf: (entryId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.DIARY_EXPORT_PDF, { entryId }),
  exportDocx: (entryId: string, outputPath?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.DIARY_EXPORT_DOCX, { entryId, outputPath })
},
```

**Step 3: 提交**

```bash
git add src/preload/index.ts
git commit -m "feat(diary): expose diary API to renderer process"
```

---

## Phase 3: 前端实现

### Task 12: 添加路由

**Files:**
- Modify: `src/renderer/src/router/index.ts`

**Step 1: 添加日记路由**

```typescript
{
  path: '/diary',
  name: 'Diary',
  component: () => import('@/views/Diary.vue'),
  meta: {
    title: '日记'
  }
},
```

**Step 2: 提交**

```bash
git add src/renderer/src/router/index.ts
git commit -m "feat(diary): add diary route"
```

---

### Task 13: 创建 Diary.vue 主页面

**Files:**
- Create: `src/renderer/src/views/Diary.vue`

**Step 1: 创建主页面组件**

```vue
<template>
  <div class="diary-page">
    <!-- 左侧边栏 - 目录树 -->
    <div class="page-sidebar">
      <div class="sidebar-header">
        <h3>日记目录</h3>
        <el-button type="primary" size="small" @click="showCreateFolderDialog = true">
          <el-icon><Plus /></el-icon>
          新建
        </el-button>
      </div>

      <div class="sidebar-content">
        <el-scrollbar>
          <div v-if="isLoadingFolders" class="loading-state">
            <el-icon class="is-loading"><Loading /></el-icon>
            <span>加载中...</span>
          </div>

          <div v-else-if="folders.length === 0" class="empty-state">
            <el-icon><FolderOpened /></el-icon>
            <span>暂无目录</span>
            <el-button type="primary" text @click="showCreateFolderDialog = true">
              创建第一个目录
            </el-button>
          </div>

          <div v-else class="folder-tree">
            <div
              v-for="folder in folders"
              :key="folder.id"
              class="folder-item"
              :class="{ active: currentFolder?.id === folder.id }"
              @click="selectFolder(folder)"
            >
              <div class="folder-icon">
                <el-icon><Folder /></el-icon>
              </div>
              <div class="folder-info">
                <div class="folder-name">{{ folder.name }}</div>
                <div class="folder-stats">{{ folder.entryCount }} 篇日记</div>
              </div>
              <div class="folder-actions" @click.stop>
                <el-dropdown trigger="click" @command="handleFolderAction($event, folder)">
                  <el-button text size="small">
                    <el-icon><MoreFilled /></el-icon>
                  </el-button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="create">新建子目录</el-dropdown-item>
                      <el-dropdown-item command="rename">重命名</el-dropdown-item>
                      <el-dropdown-item command="delete" divided>删除</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </div>
            </div>
          </div>
        </el-scrollbar>
      </div>
    </div>

    <!-- 主内容区域 -->
    <div class="page-main">
      <!-- 未选择目录 -->
      <div v-if="!currentFolder" class="empty-main">
        <el-icon :size="64" color="#c0c4cc"><FolderOpened /></el-icon>
        <h3>选择或创建目录</h3>
        <p>从左侧选择一个目录，或创建新的目录开始写日记</p>
        <el-button type="primary" @click="showCreateFolderDialog = true">
          <el-icon><Plus /></el-icon>
          新建目录
        </el-button>
      </div>

      <!-- 已选择目录，未选择日记 -->
      <template v-else-if="!currentEntry">
        <div class="main-header">
          <div class="header-left">
            <h2>{{ currentFolder.name }}</h2>
          </div>
          <div class="header-right">
            <el-input
              v-model="searchKeyword"
              placeholder="搜索日记..."
              prefix-icon="Search"
              clearable
              style="width: 200px"
              @keyup.enter="handleSearch"
            />
            <el-button type="primary" @click="createNewEntry">
              <el-icon><Plus /></el-icon>
              新建日记
            </el-button>
          </div>
        </div>

        <div class="main-content">
          <el-scrollbar>
            <div v-if="isLoadingEntries" class="loading-state">
              <el-icon class="is-loading"><Loading /></el-icon>
            </div>

            <div v-else-if="entries.length === 0" class="empty-entries">
              <el-icon :size="48" color="#c0c4cc"><Document /></el-icon>
              <p>暂无日记</p>
              <el-button type="primary" @click="createNewEntry">写第一篇日记</el-button>
            </div>

            <div v-else class="entry-list">
              <div
                v-for="entry in entries"
                :key="entry.id"
                class="entry-item"
                @click="selectEntry(entry)"
              >
                <div class="entry-date">{{ formatDate(entry.createdAt) }}</div>
                <div class="entry-title">{{ entry.title }}</div>
                <div class="entry-preview">{{ entry.preview }}</div>
                <div class="entry-meta">
                  <span>{{ entry.wordCount }} 字</span>
                </div>
              </div>
            </div>
          </el-scrollbar>
        </div>
      </template>

      <!-- 已选择日记 - 编辑器 -->
      <template v-else>
        <DiaryEditor
          :entry="currentEntry"
          @back="currentEntry = null"
          @updated="handleEntryUpdated"
        />
      </template>
    </div>

    <!-- 创建目录对话框 -->
    <el-dialog
      v-model="showCreateFolderDialog"
      title="新建目录"
      width="400px"
    >
      <el-form :model="newFolderForm" label-width="80px">
        <el-form-item label="目录名称">
          <el-input v-model="newFolderForm.name" placeholder="请输入目录名称" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateFolderDialog = false">取消</el-button>
        <el-button type="primary" @click="handleCreateFolder">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Folder, FolderOpened, Document, Loading, MoreFilled } from '@element-plus/icons-vue'
import DiaryEditor from '@/components/diary/DiaryEditor.vue'
import type { DiaryFolder, DiaryEntryListItem, DiaryEntry } from '@/types/diary'

// 目录相关
const folders = ref<DiaryFolder[]>([])
const currentFolder = ref<DiaryFolder | null>(null)
const isLoadingFolders = ref(false)
const showCreateFolderDialog = ref(false)
const newFolderForm = ref({ name: '' })

// 日记相关
const entries = ref<DiaryEntryListItem[]>([])
const currentEntry = ref<DiaryEntry | null>(null)
const isLoadingEntries = ref(false)
const searchKeyword = ref('')

// 加载目录列表
async function loadFolders() {
  isLoadingFolders.value = true
  try {
    const result = await window.electronAPI.diary.getAllFolders()
    if (result.success) {
      folders.value = result.data || []
    } else {
      ElMessage.error(result.error || '加载目录失败')
    }
  } catch (error) {
    console.error('加载目录失败:', error)
    ElMessage.error('加载目录失败')
  } finally {
    isLoadingFolders.value = false
  }
}

// 选择目录
async function selectFolder(folder: DiaryFolder) {
  currentFolder.value = folder
  currentEntry.value = null
  await loadEntries()
}

// 加载日记列表
async function loadEntries() {
  if (!currentFolder.value) return
  isLoadingEntries.value = true
  try {
    const result = await window.electronAPI.diary.listEntries(currentFolder.value.id)
    if (result.success) {
      entries.value = result.data || []
    }
  } catch (error) {
    console.error('加载日记列表失败:', error)
  } finally {
    isLoadingEntries.value = false
  }
}

// 创建新日记
async function createNewEntry() {
  if (!currentFolder.value) return
  try {
    const result = await window.electronAPI.diary.createEntry({
      folderId: currentFolder.value.id
    })
    if (result.success && result.data) {
      currentEntry.value = result.data
      await loadEntries()
    } else {
      ElMessage.error(result.error || '创建日记失败')
    }
  } catch (error) {
    console.error('创建日记失败:', error)
    ElMessage.error('创建日记失败')
  }
}

// 选择日记
async function selectEntry(entry: DiaryEntryListItem) {
  try {
    const result = await window.electronAPI.diary.getEntry(entry.id)
    if (result.success && result.data) {
      currentEntry.value = result.data
    }
  } catch (error) {
    console.error('获取日记详情失败:', error)
  }
}

// 创建目录
async function handleCreateFolder() {
  if (!newFolderForm.value.name.trim()) {
    ElMessage.warning('请输入目录名称')
    return
  }
  try {
    const result = await window.electronAPI.diary.createFolder({
      name: newFolderForm.value.name.trim()
    })
    if (result.success) {
      showCreateFolderDialog.value = false
      newFolderForm.value.name = ''
      await loadFolders()
      ElMessage.success('目录创建成功')
    } else {
      ElMessage.error(result.error || '创建失败')
    }
  } catch (error) {
    console.error('创建目录失败:', error)
    ElMessage.error('创建目录失败')
  }
}

// 目录操作
async function handleFolderAction(command: string, folder: DiaryFolder) {
  switch (command) {
    case 'rename':
      const { value } = await ElMessageBox.prompt('请输入新名称', '重命名', {
        inputValue: folder.name
      })
      if (value) {
        const result = await window.electronAPI.diary.updateFolder(folder.id, { name: value })
        if (result.success) {
          await loadFolders()
          ElMessage.success('重命名成功')
        }
      }
      break
    case 'delete':
      await ElMessageBox.confirm('确定删除该目录及其所有日记吗？', '删除确认', { type: 'warning' })
      const result = await window.electronAPI.diary.deleteFolder(folder.id)
      if (result.success) {
        if (currentFolder.value?.id === folder.id) {
          currentFolder.value = null
        }
        await loadFolders()
        ElMessage.success('删除成功')
      }
      break
  }
}

// 搜索
async function handleSearch() {
  if (!searchKeyword.value.trim()) {
    await loadEntries()
    return
  }
  // TODO: 实现搜索
}

// 日记更新后刷新列表
async function handleEntryUpdated() {
  await loadEntries()
}

// 格式化日期
function formatDate(date: Date | string): string {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

onMounted(() => {
  loadFolders()
})
</script>

<style lang="scss" scoped>
.diary-page {
  display: flex;
  height: 100%;
  background: var(--bg-color-page);
}

.page-sidebar {
  width: 280px;
  background: var(--bg-color);
  border-right: 1px solid var(--border-color-lighter);
  display: flex;
  flex-direction: column;

  .sidebar-header {
    padding: 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--border-color-lighter);

    h3 {
      margin: 0;
      font-size: 16px;
    }
  }

  .sidebar-content {
    flex: 1;
    overflow: hidden;
  }
}

.folder-item {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: var(--fill-color-light);
  }

  &.active {
    background: var(--color-primary-light-9);
  }

  .folder-icon {
    margin-right: 12px;
    color: var(--color-primary);
  }

  .folder-info {
    flex: 1;

    .folder-name {
      font-size: 14px;
    }

    .folder-stats {
      font-size: 12px;
      color: var(--text-color-secondary);
    }
  }
}

.page-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.empty-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-color-secondary);

  h3 {
    margin: 16px 0 8px;
    color: var(--text-color-primary);
  }

  p {
    margin-bottom: 24px;
  }
}

.main-header {
  padding: 16px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border-color-lighter);
  background: var(--bg-color);

  .header-right {
    display: flex;
    gap: 12px;
  }
}

.main-content {
  flex: 1;
  overflow: hidden;
}

.entry-list {
  padding: 16px;
}

.entry-item {
  background: var(--bg-color);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 12px;
  cursor: pointer;
  border: 1px solid var(--border-color-lighter);
  transition: all 0.2s;

  &:hover {
    border-color: var(--color-primary-light-5);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  }

  .entry-date {
    font-size: 12px;
    color: var(--text-color-secondary);
    margin-bottom: 4px;
  }

  .entry-title {
    font-size: 16px;
    font-weight: 500;
    margin-bottom: 8px;
  }

  .entry-preview {
    font-size: 14px;
    color: var(--text-color-regular);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    margin-bottom: 8px;
  }

  .entry-meta {
    font-size: 12px;
    color: var(--text-color-secondary);
  }
}

.loading-state, .empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  color: var(--text-color-secondary);
}
</style>
```

**Step 2: 提交**

```bash
git add src/renderer/src/views/Diary.vue
git commit -m "feat(diary): add Diary main page component"
```

---

### Task 14: 创建 DiaryEditor 组件

**Files:**
- Create: `src/renderer/src/components/diary/DiaryEditor.vue`

**Step 1: 创建编辑器组件**

```vue
<template>
  <div class="diary-editor">
    <div class="editor-header">
      <el-button text @click="$emit('back')">
        <el-icon><ArrowLeft /></el-icon>
        返回列表
      </el-button>
      <div class="header-actions">
        <el-dropdown @command="handleExport">
          <el-button>
            <el-icon><Download /></el-icon>
            导出
            <el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="html">导出 HTML</el-dropdown-item>
              <el-dropdown-item command="pdf">导出 PDF</el-dropdown-item>
              <el-dropdown-item command="docx">导出 Word</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <div class="editor-title">
      <input
        v-model="title"
        type="text"
        placeholder="日记标题"
        class="title-input"
        @blur="handleTitleChange"
      />
    </div>

    <div class="editor-content">
      <MarkdownEditor
        v-model="content"
        placeholder="开始写日记..."
        @change="handleContentChange"
      />
    </div>

    <div class="editor-footer">
      <span class="word-count">{{ wordCount }} 字</span>
      <span class="last-saved">最后保存: {{ lastSavedTime }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowLeft, Download, ArrowDown } from '@element-plus/icons-vue'
import MarkdownEditor from '@/components/common/MarkdownEditor.vue'
import type { DiaryEntry } from '@/types/diary'

const props = defineProps<{
  entry: DiaryEntry
}>()

const emit = defineEmits<{
  back: []
  updated: []
}>()

const title = ref(props.entry.title)
const content = ref(props.entry.content || '')
const lastSavedTime = ref(new Date().toLocaleTimeString())
const saveTimeout = ref<number | null>(null)

const wordCount = computed(() => {
  return content.value.replace(/\s/g, '').length
})

// 自动保存
watch(content, () => {
  if (saveTimeout.value) {
    clearTimeout(saveTimeout.value)
  }
  saveTimeout.value = window.setTimeout(() => {
    saveEntry()
  }, 1000)
})

async function saveEntry() {
  try {
    const result = await window.electronAPI.diary.updateEntry(props.entry.id, {
      title: title.value,
      content: content.value
    })
    if (result.success) {
      lastSavedTime.value = new Date().toLocaleTimeString()
      emit('updated')
    }
  } catch (error) {
    console.error('保存失败:', error)
  }
}

async function handleTitleChange() {
  if (title.value !== props.entry.title) {
    await saveEntry()
  }
}

function handleContentChange() {
  // 内容变化由 watch 处理
}

async function handleExport(format: string) {
  try {
    let result
    switch (format) {
      case 'html':
        result = await window.electronAPI.diary.exportHtml(props.entry.id)
        break
      case 'pdf':
        result = await window.electronAPI.diary.exportPdf(props.entry.id)
        break
      case 'docx':
        result = await window.electronAPI.diary.exportDocx(props.entry.id)
        break
    }
    if (result?.success) {
      ElMessage.success(`导出成功: ${result.data}`)
    } else {
      ElMessage.error(result?.error || '导出失败')
    }
  } catch (error) {
    console.error('导出失败:', error)
    ElMessage.error('导出失败')
  }
}

onUnmounted(() => {
  if (saveTimeout.value) {
    clearTimeout(saveTimeout.value)
  }
})
</script>

<style lang="scss" scoped>
.diary-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-color);
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 24px;
  border-bottom: 1px solid var(--border-color-lighter);
}

.editor-title {
  padding: 16px 24px;
  border-bottom: 1px solid var(--border-color-lighter);

  .title-input {
    width: 100%;
    font-size: 24px;
    font-weight: 600;
    border: none;
    outline: none;
    background: transparent;
    color: var(--text-color-primary);

    &::placeholder {
      color: var(--text-color-placeholder);
    }
  }
}

.editor-content {
  flex: 1;
  overflow: hidden;
  padding: 0 24px;
}

.editor-footer {
  display: flex;
  justify-content: space-between;
  padding: 8px 24px;
  font-size: 12px;
  color: var(--text-color-secondary);
  border-top: 1px solid var(--border-color-lighter);
}
</style>
```

**Step 2: 提交**

```bash
git add src/renderer/src/components/diary/DiaryEditor.vue
git commit -m "feat(diary): add DiaryEditor component with auto-save and export"
```

---

### Task 15: 安装 ByteMD 插件

**Files:**
- Modify: `package.json`

**Step 1: 安装依赖**

```bash
npm install @bytemd/plugin-math @bytemd/plugin-mermaid katex mermaid
```

**Step 2: 更新 MarkdownEditor 组件**

在 `src/renderer/src/components/common/MarkdownEditor.vue` 中添加插件：

```typescript
import math from '@bytemd/plugin-math'
import mermaid from '@bytemd/plugin-mermaid'
import 'katex/dist/katex.css'

const plugins = [
  gfm(),
  highlight(),
  frontmatter(),
  math(),
  mermaid()
]
```

**Step 3: 提交**

```bash
git add package.json package-lock.json src/renderer/src/components/common/MarkdownEditor.vue
git commit -m "feat(diary): add math and mermaid plugins to MarkdownEditor"
```

---

## Phase 4: 验证与测试

### Task 16: 功能验证

**Step 1: 启动开发服务器**

```bash
npm run dev
```

**Step 2: 验证功能清单**

- [ ] 创建目录成功
- [ ] 重命名目录成功
- [ ] 删除目录成功
- [ ] 创建日记成功
- [ ] 编辑日记内容成功
- [ ] 自动保存功能正常
- [ ] 导出 HTML 功能正常
- [ ] 导出 PDF 功能正常
- [ ] 导出 Word 功能正常

**Step 3: 提交验证**

```bash
git add .
git commit -m "test(diary): verify diary module functionality"
```

---

## 执行选项

**计划已保存到 `docs/plans/2026-04-04-diary-implementation.md`。**

**两种执行方式：**

**1. Subagent-Driven（当前会话）** - 我逐个派发子代理执行每个任务，任务间进行代码审查，快速迭代

**2. Parallel Session（单独会话）** - 在新会话中打开工作树，使用 executing-plans 批量执行并设置检查点

**请选择执行方式？**