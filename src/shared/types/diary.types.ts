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
  /** 日记消化 opt-in（开启后条目自动同步「日记」知识库进消化管线，默认 false） */
  brainOptIn?: boolean
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
  /** 日记消化开关（spec 2026-09-24 P2；开关与出库清理配套走 diary:set-folder-brain-opt-in） */
  brainOptIn?: boolean
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
  /** 标签 */
  tags?: string[]
  /** YAML frontmatter */
  frontmatter?: string
  /** 软删除时间（NULL 表示未删除；回收站 = 该字段非空） */
  deletedAt?: Date | string | null
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
  /** 软删除时间（回收站列表项非空） */
  deletedAt?: Date | string | null
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