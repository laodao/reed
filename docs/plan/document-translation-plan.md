# 文档翻译模块开发计划

## 1. 概述

本文档基于 PRD `docs/prd/06-document-translation.md`，详细规划文档翻译模块的实现步骤。

## 2. 功能模块

根据 PRD，主要功能模块如下：

| 模块 | 功能编号 | 功能名称 | 优先级 |
|------|---------|---------|--------|
| 文本翻译 | FR-TR-001 | 文本翻译 | P0 |
| 文本翻译 | FR-TR-002 | 语言选择 | P0 |
| 文本翻译 | FR-TR-003 | 实时翻译 | P1 |
| 文件翻译 | FR-TR-004 | 上传文件翻译 | P0 |
| 文件翻译 | FR-TR-005 | 文件翻译进度 | P0 |
| 文件翻译 | FR-TR-006 | 下载翻译结果 | P0 |
| 文件翻译 | FR-TR-007 | 文件大小限制 | P0 |
| 翻译历史 | FR-TR-008 | 查看翻译历史 | P1 |
| 翻译历史 | FR-TR-009 | 收藏翻译 | P2 |
| 翻译历史 | FR-TR-010 | 删除历史记录 | P1 |
| 提供商配置 | FR-TR-011 | 翻译提供商复用 | P0 |

---

## 3. 类型定义

### 3.1 翻译相关类型

**文件**：`src/shared/types/translation.types.ts`

```typescript
/**
 * 支持的语言
 */
export type LanguageCode =
  | 'auto'  // 自动检测
  | 'zh'    // 中文
  | 'en'    // 英语
  | 'ja'    // 日语
  | 'ko'    // 韩语
  | 'fr'    // 法语
  | 'de'    // 德语
  | 'es'    // 西班牙语
  | 'ru'    // 俄语
  | 'pt'    // 葡萄牙语
  | 'it'    // 意大利语
  | 'ar'    // 阿拉伯语
  | 'th'    // 泰语
  | 'vi'    // 越南语

/**
 * 语言配置
 */
export interface Language {
  code: LanguageCode
  name: string
}

/**
 * 翻译类型
 */
export type TranslationType = 'text' | 'file'

/**
 * 翻译状态
 */
export type TranslationStatus = 'pending' | 'processing' | 'completed' | 'failed'

/**
 * 翻译记录
 */
export interface TranslationRecord {
  id: string
  type: TranslationType
  sourceLanguage: LanguageCode
  targetLanguage: LanguageCode
  sourceText?: string
  targetText?: string
  sourceFile?: string
  targetFile?: string
  status: TranslationStatus
  favorite: boolean
  wordCount: number
  providerId?: string
  modelId?: string
  errorMessage?: string
  createdAt: Date
}

/**
 * 文本翻译请求
 */
export interface TextTranslationRequest {
  text: string
  sourceLanguage: LanguageCode
  targetLanguage: LanguageCode
  providerId?: string
  modelId?: string
}

/**
 * 文本翻译响应
 */
export interface TextTranslationResponse {
  success: boolean
  data?: {
    translatedText: string
    detectedLanguage?: LanguageCode
  }
  error?: string
}

/**
 * 文件翻译请求
 */
export interface FileTranslationRequest {
  filePath: string
  sourceLanguage: LanguageCode
  targetLanguage: LanguageCode
  providerId?: string
  modelId?: string
}

/**
 * 文件翻译响应
 */
export interface FileTranslationResponse {
  success: boolean
  data?: {
    translationId: string
  }
  error?: string
}

/**
 * 翻译历史查询参数
 */
export interface TranslationHistoryQuery {
  page: number
  pageSize: number
  type?: TranslationType
  favorite?: boolean
}
```

---

## 4. 数据库设计

### 4.1 翻译历史表

**文件**：`src/main/database/schemas/translation.sql`

```sql
CREATE TABLE IF NOT EXISTS translations (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  source_language TEXT NOT NULL,
  target_language TEXT NOT NULL,
  source_text TEXT,
  target_text TEXT,
  source_file TEXT,
  target_file TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  favorite INTEGER NOT NULL DEFAULT 0,
  word_count INTEGER NOT NULL DEFAULT 0,
  provider_id TEXT,
  model_id TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_translations_created_at ON translations(created_at DESC);
CREATE INDEX idx_translations_type ON translations(type);
CREATE INDEX idx_translations_favorite ON translations(favorite);
```

---

## 5. 实现步骤

### 5.1 步骤一：创建类型定义

**文件**：`src/shared/types/translation.types.ts`

创建翻译相关的所有类型定义。

---

### 5.2 步骤二：创建数据库仓库

**文件**：`src/main/database/repositories/translation.repository.ts`

```typescript
import { Database } from 'better-sqlite3'
import type { TranslationRecord, TranslationHistoryQuery } from '../../shared/types/translation.types'

export class TranslationRepository {
  constructor(private db: Database) {}

  create(record: TranslationRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO translations (
        id, type, source_language, target_language,
        source_text, target_text, source_file, target_file,
        status, favorite, word_count, provider_id, model_id,
        error_message, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      record.id, record.type, record.sourceLanguage, record.targetLanguage,
      record.sourceText || null, record.targetText || null,
      record.sourceFile || null, record.targetFile || null,
      record.status, record.favorite ? 1 : 0, record.wordCount,
      record.providerId || null, record.modelId || null,
      record.errorMessage || null, record.createdAt.toISOString()
    )
  }

  getById(id: string): TranslationRecord | null {
    const stmt = this.db.prepare('SELECT * FROM translations WHERE id = ?')
    const row = stmt.get(id) as any
    return row ? this.rowToRecord(row) : null
  }

  getList(query: TranslationHistoryQuery): { list: TranslationRecord[]; total: number } {
    // 实现分页查询
  }

  update(id: string, data: Partial<TranslationRecord>): void {
    // 实现更新
  }

  delete(id: string): void {
    const stmt = this.db.prepare('DELETE FROM translations WHERE id = ?')
    stmt.run(id)
  }

  private rowToRecord(row: any): TranslationRecord {
    return {
      id: row.id,
      type: row.type,
      sourceLanguage: row.source_language,
      targetLanguage: row.target_language,
      sourceText: row.source_text,
      targetText: row.target_text,
      sourceFile: row.source_file,
      targetFile: row.target_file,
      status: row.status,
      favorite: row.favorite === 1,
      wordCount: row.word_count,
      providerId: row.provider_id,
      modelId: row.model_id,
      errorMessage: row.error_message,
      createdAt: new Date(row.created_at)
    }
  }
}
```

---

### 5.3 步骤三：创建翻译服务

**文件**：`src/main/services/translation.service.ts`

```typescript
import { BrowserWindow, dialog } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import fs from 'fs'
import path from 'path'
import mammoth from 'mammoth' // 用于解析 Word 文档
import type {
  TextTranslationRequest,
  TextTranslationResponse,
  FileTranslationRequest,
  FileTranslationResponse,
  TranslationRecord,
  LanguageCode
} from '../../shared/types/translation.types'
import { getDatabaseManager } from '../database'
import { TranslationRepository } from '../database/repositories/translation.repository'
import { createProvider } from '../providers'

export class TranslationService {
  private static repo: TranslationRepository

  private static getRepository(): TranslationRepository {
    if (!this.repo) {
      const db = getDatabaseManager().db
      this.repo = new TranslationRepository(db)
    }
    return this.repo
  }

  /**
   * 文本翻译
   */
  static async translateText(
    request: TextTranslationRequest
  ): Promise<TextTranslationResponse> {
    try {
      // 1. 获取提供商配置
      const dbManager = getDatabaseManager()
      const providers = await dbManager.providerConfigs.getEnabled()

      if (providers.length === 0) {
        return { success: false, error: '暂无可用的翻译服务，请先配置 AI 提供商' }
      }

      // 2. 选择提供商（指定的或第一个可用的）
      let providerConfig = request.providerId
        ? providers.find(p => p.id === request.providerId)
        : providers[0]

      if (!providerConfig) {
        return { success: false, error: '指定的提供商不可用' }
      }

      // 3. 获取模型
      const model = request.modelId
        ? providerConfig.models.find(m => m.id === request.modelId)
        : providerConfig.models.find(m => m.type === 'text' || m.type === 'chat')

      if (!model) {
        return { success: false, error: '没有可用的文本模型' }
      }

      // 4. 构建翻译提示词
      const prompt = this.buildTranslationPrompt(
        request.text,
        request.sourceLanguage,
        request.targetLanguage
      )

      // 5. 调用 AI API
      const provider = createProvider(providerConfig.templateId, {
        apiKey: providerConfig.apiKey,
        baseUrl: providerConfig.baseUrl,
        model: model.id
      })

      const result = await provider.chat({
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 4096
      })

      const translatedText = result.choices[0]?.message?.content || ''

      // 6. 保存翻译记录
      const record: TranslationRecord = {
        id: uuidv4(),
        type: 'text',
        sourceLanguage: request.sourceLanguage,
        targetLanguage: request.targetLanguage,
        sourceText: request.text,
        targetText: translatedText,
        status: 'completed',
        favorite: false,
        wordCount: request.text.length,
        providerId: providerConfig.id,
        modelId: model.id,
        createdAt: new Date()
      }

      this.getRepository().create(record)

      return {
        success: true,
        data: {
          translatedText,
          detectedLanguage: request.sourceLanguage === 'auto'
            ? this.detectLanguage(request.text)
            : undefined
        }
      }
    } catch (error: any) {
      console.error('[TranslationService.translateText] 错误:', error)
      return { success: false, error: error.message || '翻译失败' }
    }
  }

  /**
   * 文件翻译
   */
  static async translateFile(
    window: BrowserWindow,
    request: FileTranslationRequest
  ): Promise<FileTranslationResponse> {
    try {
      // 1. 读取文件内容
      const content = await this.readFileContent(request.filePath)
      if (!content) {
        return { success: false, error: '无法读取文件内容' }
      }

      // 2. 创建翻译记录
      const recordId = uuidv4()
      const record: TranslationRecord = {
        id: recordId,
        type: 'file',
        sourceLanguage: request.sourceLanguage,
        targetLanguage: request.targetLanguage,
        sourceFile: request.filePath,
        status: 'processing',
        favorite: false,
        wordCount: content.length,
        providerId: request.providerId,
        modelId: request.modelId,
        createdAt: new Date()
      }

      this.getRepository().create(record)

      // 3. 异步处理翻译
      this.processFileTranslation(window, recordId, content, request)

      return {
        success: true,
        data: { translationId: recordId }
      }
    } catch (error: any) {
      console.error('[TranslationService.translateFile] 错误:', error)
      return { success: false, error: error.message || '文件翻译失败' }
    }
  }

  /**
   * 处理文件翻译
   */
  private static async processFileTranslation(
    window: BrowserWindow,
    recordId: string,
    content: string,
    request: FileTranslationRequest
  ): Promise<void> {
    try {
      // 分段翻译长文本
      const chunks = this.splitTextIntoChunks(content, 4000)
      const translatedChunks: string[] = []

      for (let i = 0; i < chunks.length; i++) {
        // 发送进度
        window.webContents.send('translation:progress', {
          translationId: recordId,
          progress: Math.round((i / chunks.length) * 100)
        })

        const response = await this.translateText({
          text: chunks[i],
          sourceLanguage: request.sourceLanguage,
          targetLanguage: request.targetLanguage,
          providerId: request.providerId,
          modelId: request.modelId
        })

        if (response.success && response.data) {
          translatedChunks.push(response.data.translatedText)
        } else {
          throw new Error(response.error || '翻译失败')
        }
      }

      // 保存翻译后的文件
      const ext = path.extname(request.filePath)
      const targetLanguage = request.targetLanguage
      const targetFileName = `${path.basename(request.filePath, ext)}_${targetLanguage}${ext}`
      const targetDir = path.dirname(request.filePath)
      const targetPath = path.join(targetDir, targetFileName)

      fs.writeFileSync(targetPath, translatedChunks.join('\n\n'))

      // 更新记录
      this.getRepository().update(recordId, {
        targetFile: targetPath,
        status: 'completed'
      })

      // 通知完成
      window.webContents.send('translation:completed', {
        translationId: recordId,
        targetFile: targetPath
      })
    } catch (error: any) {
      // 更新失败状态
      this.getRepository().update(recordId, {
        status: 'failed',
        errorMessage: error.message
      })

      window.webContents.send('translation:failed', {
        translationId: recordId,
        error: error.message
      })
    }
  }

  /**
   * 读取文件内容
   */
  private static async readFileContent(filePath: string): Promise<string | null> {
    const ext = path.extname(filePath).toLowerCase()

    try {
      if (ext === '.docx') {
        const result = await mammoth.extractRawText({ path: filePath })
        return result.value
      } else {
        return fs.readFileSync(filePath, 'utf-8')
      }
    } catch (error) {
      console.error('[TranslationService.readFileContent] 错误:', error)
      return null
    }
  }

  /**
   * 构建翻译提示词
   */
  private static buildTranslationPrompt(
    text: string,
    sourceLanguage: LanguageCode,
    targetLanguage: LanguageCode
  ): string {
    const sourceLangName = this.getLanguageName(sourceLanguage)
    const targetLangName = this.getLanguageName(targetLanguage)

    return `你是一个专业的翻译助手。请将以下文本从${sourceLangName}翻译成${targetLangName}。

要求：
1. 保持原文的语气和风格
2. 准确传达原文含义
3. 使用地道的表达方式
4. 如果原文有专业术语，保持术语准确性

原文：
${text}

请直接输出翻译结果，不要添加任何解释。`
  }

  /**
   * 获取语言名称
   */
  private static getLanguageName(code: LanguageCode): string {
    const names: Record<string, string> = {
      auto: '自动检测',
      zh: '中文',
      en: '英语',
      ja: '日语',
      ko: '韩语',
      fr: '法语',
      de: '德语',
      es: '西班牙语',
      ru: '俄语',
      pt: '葡萄牙语',
      it: '意大利语',
      ar: '阿拉伯语',
      th: '泰语',
      vi: '越南语'
    }
    return names[code] || code
  }

  /**
   * 检测语言
   */
  private static detectLanguage(text: string): LanguageCode {
    // 简单的语言检测逻辑
    const chinesePattern = /[\u4e00-\u9fa5]/
    const japanesePattern = /[\u3040-\u309f\u30a0-\u30ff]/
    const koreanPattern = /[\uac00-\ud7af]/

    if (chinesePattern.test(text)) return 'zh'
    if (japanesePattern.test(text)) return 'ja'
    if (koreanPattern.test(text)) return 'ko'
    return 'en'
  }

  /**
   * 分割文本为块
   */
  private static splitTextIntoChunks(text: string, maxChunkSize: number): string[] {
    const chunks: string[] = []
    const paragraphs = text.split(/\n\n+/)
    let currentChunk = ''

    for (const paragraph of paragraphs) {
      if (currentChunk.length + paragraph.length + 2 <= maxChunkSize) {
        currentChunk += (currentChunk ? '\n\n' : '') + paragraph
      } else {
        if (currentChunk) chunks.push(currentChunk)
        currentChunk = paragraph
      }
    }

    if (currentChunk) chunks.push(currentChunk)
    return chunks
  }
}
```

---

### 5.4 步骤四：创建 IPC 处理器

**文件**：`src/main/ipc/handlers/translation.handler.ts`

```typescript
import { ipcMain, BrowserWindow, dialog } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { TranslationService } from '../../services/translation.service'
import { getDatabaseManager } from '../../database'
import { TranslationRepository } from '../../database/repositories/translation.repository'
import type {
  TextTranslationRequest,
  FileTranslationRequest,
  TranslationHistoryQuery
} from '../../../shared/types/translation.types'
import type { IpcResponse } from '../../../shared/types/ipc.types'

/**
 * 注册翻译相关 IPC 处理器
 */
export function registerTranslationHandlers(): void {
  // 文本翻译
  ipcMain.handle('translation:text', handleTextTranslation)

  // 文件翻译
  ipcMain.handle('translation:file', handleFileTranslation)

  // 选择文件
  ipcMain.handle('translation:select-file', handleSelectFile)

  // 获取翻译历史
  ipcMain.handle('translation:history', handleGetHistory)

  // 获取翻译详情
  ipcMain.handle('translation:get', handleGetTranslation)

  // 切换收藏
  ipcMain.handle('translation:toggle-favorite', handleToggleFavorite)

  // 删除翻译记录
  ipcMain.handle('translation:delete', handleDeleteTranslation)

  // 下载翻译结果
  ipcMain.handle('translation:download', handleDownloadTranslation)
}

async function handleTextTranslation(
  event: IpcMainInvokeEvent,
  request: TextTranslationRequest
): Promise<IpcResponse<TextTranslationResponse['data']>> {
  const response = await TranslationService.translateText(request)
  return response
}

async function handleFileTranslation(
  event: IpcMainInvokeEvent,
  request: FileTranslationRequest
): Promise<IpcResponse<FileTranslationResponse['data']>> {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window) {
    return { success: false, error: '窗口不存在' }
  }

  const response = await TranslationService.translateFile(window, request)
  return response
}

async function handleSelectFile(
  event: IpcMainInvokeEvent
): Promise<IpcResponse<{ path: string; name: string; size: number }>> {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window) {
    return { success: false, error: '窗口不存在' }
  }

  const result = await dialog.showOpenDialog(window, {
    title: '选择要翻译的文件',
    filters: [
      { name: '支持的文件', extensions: ['md', 'txt', 'docx'] }
    ],
    properties: ['openFile']
  })

  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, error: '未选择文件' }
  }

  const filePath = result.filePaths[0]
  const fs = require('fs')
  const stats = fs.statSync(filePath)

  // 检查文件大小（5MB 限制）
  if (stats.size > 5 * 1024 * 1024) {
    return { success: false, error: '文件大小超过限制（最大 5MB）' }
  }

  return {
    success: true,
    data: {
      path: filePath,
      name: require('path').basename(filePath),
      size: stats.size
    }
  }
}

async function handleGetHistory(
  event: IpcMainInvokeEvent,
  query: TranslationHistoryQuery
): Promise<IpcResponse<{ list: any[]; total: number }>> {
  const db = getDatabaseManager().db
  const repo = new TranslationRepository(db)
  const result = repo.getList(query)
  return { success: true, data: result }
}

async function handleGetTranslation(
  event: IpcMainInvokeEvent,
  id: string
): Promise<IpcResponse<any>> {
  const db = getDatabaseManager().db
  const repo = new TranslationRepository(db)
  const record = repo.getById(id)
  return { success: true, data: record }
}

async function handleToggleFavorite(
  event: IpcMainInvokeEvent,
  id: string
): Promise<IpcResponse<boolean>> {
  const db = getDatabaseManager().db
  const repo = new TranslationRepository(db)
  const record = repo.getById(id)
  if (record) {
    repo.update(id, { favorite: !record.favorite })
    return { success: true, data: true }
  }
  return { success: false, error: '记录不存在' }
}

async function handleDeleteTranslation(
  event: IpcMainInvokeEvent,
  id: string
): Promise<IpcResponse<boolean>> {
  const db = getDatabaseManager().db
  const repo = new TranslationRepository(db)
  repo.delete(id)
  return { success: true, data: true }
}

async function handleDownloadTranslation(
  event: IpcMainInvokeEvent,
  id: string
): Promise<IpcResponse<string>> {
  const db = getDatabaseManager().db
  const repo = new TranslationRepository(db)
  const record = repo.getById(id)

  if (!record || !record.targetFile) {
    return { success: false, error: '翻译结果不存在' }
  }

  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window) {
    return { success: false, error: '窗口不存在' }
  }

  const result = await dialog.showSaveDialog(window, {
    title: '保存翻译结果',
    defaultPath: record.targetFile,
    filters: [
      { name: '文本文件', extensions: ['txt', 'md', 'docx'] }
    ]
  })

  if (result.canceled || !result.filePath) {
    return { success: false, error: '取消保存' }
  }

  const fs = require('fs')
  fs.copyFileSync(record.targetFile, result.filePath)

  return { success: true, data: result.filePath }
}
```

---

### 5.5 步骤五：注册 IPC 和数据库

**文件**：`src/main/ipc/index.ts`

添加翻译处理器注册：

```typescript
import { registerTranslationHandlers } from './handlers/translation.handler'

// 在注册函数中添加
export function registerIpcHandlers(): void {
  // ...existing handlers
  registerTranslationHandlers()
}
```

**文件**：`src/main/database/index.ts`

添加翻译表初始化：

```typescript
// 在数据库初始化中添加
db.exec(`
  CREATE TABLE IF NOT EXISTS translations (
    -- 表结构
  )
`)
```

---

### 5.6 步骤六：更新 Preload API

**文件**：`src/preload/index.ts`

```typescript
translation: {
  // 文本翻译
  text: (request: TextTranslationRequest) =>
    ipcRenderer.invoke('translation:text', request),

  // 文件翻译
  file: (request: FileTranslationRequest) =>
    ipcRenderer.invoke('translation:file', request),

  // 选择文件
  selectFile: () =>
    ipcRenderer.invoke('translation:select-file'),

  // 获取历史
  history: (query: TranslationHistoryQuery) =>
    ipcRenderer.invoke('translation:history', query),

  // 获取详情
  get: (id: string) =>
    ipcRenderer.invoke('translation:get', id),

  // 切换收藏
  toggleFavorite: (id: string) =>
    ipcRenderer.invoke('translation:toggle-favorite', id),

  // 删除
  delete: (id: string) =>
    ipcRenderer.invoke('translation:delete', id),

  // 下载
  download: (id: string) =>
    ipcRenderer.invoke('translation:download', id),

  // 进度监听
  onProgress: (callback: (data: { translationId: string; progress: number }) => void) =>
    ipcRenderer.on('translation:progress', (_event, data) => callback(data)),

  // 完成监听
  onCompleted: (callback: (data: { translationId: string; targetFile: string }) => void) =>
    ipcRenderer.on('translation:completed', (_event, data) => callback(data)),

  // 失败监听
  onFailed: (callback: (data: { translationId: string; error: string }) => void) =>
    ipcRenderer.on('translation:failed', (_event, data) => callback(data))
}
```

---

### 5.7 步骤七：创建前端 Composable

**文件**：`src/renderer/src/composables/useTranslation.ts`

```typescript
import { ref, computed, onMounted, onUnmounted } from 'vue'
import type {
  LanguageCode,
  Language,
  TranslationRecord,
  TextTranslationRequest,
  FileTranslationRequest,
  TranslationHistoryQuery
} from '../../../shared/types/translation.types'

// 支持的语言列表
export const LANGUAGES: Language[] = [
  { code: 'auto', name: '自动检测' },
  { code: 'zh', name: '中文' },
  { code: 'en', name: '英语' },
  { code: 'ja', name: '日语' },
  { code: 'ko', name: '韩语' },
  { code: 'fr', name: '法语' },
  { code: 'de', name: '德语' },
  { code: 'es', name: '西班牙语' },
  { code: 'ru', name: '俄语' },
  { code: 'pt', name: '葡萄牙语' },
  { code: 'it', name: '意大利语' },
  { code: 'ar', name: '阿拉伯语' },
  { code: 'th', name: '泰语' },
  { code: 'vi', name: '越南语' }
]

export function useTranslation() {
  // 状态
  const loading = ref(false)
  const error = ref<string | null>(null)
  const translating = ref(false)
  const histories = ref<TranslationRecord[]>([])
  const totalHistories = ref(0)
  const favoriteOnly = ref(false)

  // 当前翻译状态
  const sourceLanguage = ref<LanguageCode>('auto')
  const targetLanguage = ref<LanguageCode>('en')
  const sourceText = ref('')
  const targetText = ref('')
  const fileProgress = ref(0)

  // 实时翻译定时器
  let realtimeTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * 加载翻译历史
   */
  async function loadHistories(page = 1, pageSize = 20): Promise<void> {
    try {
      loading.value = true
      error.value = null

      const query: TranslationHistoryQuery = {
        page,
        pageSize,
        favorite: favoriteOnly.value || undefined
      }

      const response = await window.electronAPI.translation.history(query)

      if (response.success && response.data) {
        histories.value = response.data.list
        totalHistories.value = response.data.total
      } else {
        error.value = response.error || '加载历史失败'
      }
    } finally {
      loading.value = false
    }
  }

  /**
   * 文本翻译
   */
  async function translateText(request?: Partial<TextTranslationRequest>): Promise<string | null> {
    try {
      translating.value = true
      error.value = null

      const response = await window.electronAPI.translation.text({
        text: request?.text || sourceText.value,
        sourceLanguage: request?.sourceLanguage || sourceLanguage.value,
        targetLanguage: request?.targetLanguage || targetLanguage.value
      })

      if (response.success && response.data) {
        targetText.value = response.data.translatedText
        if (response.data.detectedLanguage) {
          sourceLanguage.value = response.data.detectedLanguage
        }
        // 刷新历史
        await loadHistories()
        return response.data.translatedText
      } else {
        error.value = response.error || '翻译失败'
        return null
      }
    } finally {
      translating.value = false
    }
  }

  /**
   * 文件翻译
   */
  async function translateFile(filePath: string): Promise<string | null> {
    try {
      translating.value = true
      error.value = null
      fileProgress.value = 0

      const response = await window.electronAPI.translation.file({
        filePath,
        sourceLanguage: sourceLanguage.value,
        targetLanguage: targetLanguage.value
      })

      if (response.success && response.data) {
        return response.data.translationId
      } else {
        error.value = response.error || '文件翻译失败'
        return null
      }
    } finally {
      translating.value = false
    }
  }

  /**
   * 选择文件
   */
  async function selectFile(): Promise<{ path: string; name: string; size: number } | null> {
    const response = await window.electronAPI.translation.selectFile()
    if (response.success && response.data) {
      return response.data
    }
    error.value = response.error || '选择文件失败'
    return null
  }

  /**
   * 切换收藏
   */
  async function toggleFavorite(id: string): Promise<boolean> {
    const response = await window.electronAPI.translation.toggleFavorite(id)
    if (response.success) {
      await loadHistories()
      return true
    }
    return false
  }

  /**
   * 删除记录
   */
  async function deleteHistory(id: string): Promise<boolean> {
    const response = await window.electronAPI.translation.delete(id)
    if (response.success) {
      await loadHistories()
      return true
    }
    return false
  }

  /**
   * 下载翻译结果
   */
  async function downloadResult(id: string): Promise<string | null> {
    const response = await window.electronAPI.translation.download(id)
    if (response.success && response.data) {
      return response.data
    }
    error.value = response.error || '下载失败'
    return null
  }

  /**
   * 切换收藏筛选
   */
  async function toggleFavoriteFilter(): Promise<void> {
    favoriteOnly.value = !favoriteOnly.value
    await loadHistories()
  }

  /**
   * 交换语言
   */
  function swapLanguages(): void {
    if (sourceLanguage.value === 'auto') return
    const temp = sourceLanguage.value
    sourceLanguage.value = targetLanguage.value
    targetLanguage.value = temp
  }

  /**
   * 实时翻译
   */
  function startRealtimeTranslation(): void {
    if (realtimeTimer) {
      clearTimeout(realtimeTimer)
    }
    realtimeTimer = setTimeout(() => {
      if (sourceText.value.trim()) {
        translateText()
      }
    }, 500)
  }

  /**
   * 停止实时翻译
   */
  function stopRealtimeTranslation(): void {
    if (realtimeTimer) {
      clearTimeout(realtimeTimer)
      realtimeTimer = null
    }
  }

  // 监听翻译进度
  onMounted(() => {
    window.electronAPI.translation.onProgress((data) => {
      fileProgress.value = data.progress
    })

    window.electronAPI.translation.onCompleted(async () => {
      await loadHistories()
    })
  })

  onUnmounted(() => {
    stopRealtimeTranslation()
  })

  return {
    // 状态
    loading,
    error,
    translating,
    histories,
    totalHistories,
    favoriteOnly,
    sourceLanguage,
    targetLanguage,
    sourceText,
    targetText,
    fileProgress,

    // 方法
    loadHistories,
    translateText,
    translateFile,
    selectFile,
    toggleFavorite,
    deleteHistory,
    downloadResult,
    toggleFavoriteFilter,
    swapLanguages,
    startRealtimeTranslation,
    stopRealtimeTranslation
  }
}
```

---

### 5.8 步骤八：创建前端组件

#### 5.8.1 翻译页面

**文件**：`src/renderer/src/views/Translation.vue`

```vue
<template>
  <div class="translation-page">
    <!-- 左侧边栏 -->
    <TranslationSidebar
      v-model="selectedHistoryId"
      @select="handleSelectHistory"
    />

    <!-- 主内容区域 -->
    <div class="page-main">
      <!-- 标签切换 -->
      <el-tabs v-model="activeTab" class="translation-tabs">
        <el-tab-pane label="文本翻译" name="text">
          <TextTranslation />
        </el-tab-pane>
        <el-tab-pane label="文件翻译" name="file">
          <FileTranslation />
        </el-tab-pane>
      </el-tabs>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import TranslationSidebar from '@/components/translation/TranslationSidebar.vue'
import TextTranslation from '@/components/translation/TextTranslation.vue'
import FileTranslation from '@/components/translation/FileTranslation.vue'
import { useTranslation } from '@/composables'

const {
  loadHistories
} = useTranslation()

const activeTab = ref('text')
const selectedHistoryId = ref('')

function handleSelectHistory(history: any): void {
  // 处理历史选择
}

onMounted(() => {
  loadHistories()
})
</script>
```

#### 5.8.2 文本翻译组件

**文件**：`src/renderer/src/components/translation/TextTranslation.vue`

#### 5.8.3 文件翻译组件

**文件**：`src/renderer/src/components/translation/FileTranslation.vue`

#### 5.8.4 翻译历史侧边栏

**文件**：`src/renderer/src/components/translation/TranslationSidebar.vue`

---

### 5.9 步骤九：添加路由

**文件**：`src/renderer/src/router/index.ts`

```typescript
{
  path: '/translation',
  name: 'Translation',
  component: () => import('@/views/Translation.vue'),
  meta: { title: '文档翻译' }
}
```

---

## 6. 实现顺序

按照依赖关系和优先级，建议按以下顺序实现：

1. **类型定义** - 基础，其他模块依赖
2. **数据库仓库** - 数据存储层
3. **翻译服务** - 核心业务逻辑
4. **IPC 处理器** - 进程通信
5. **Preload API** - 前端 API
6. **前端 Composable** - 状态管理
7. **前端组件** - UI 展示
8. **路由配置** - 页面入口

---

## 7. 测试要点

### 7.1 功能测试

- [ ] 文本翻译：正常翻译，结果正确
- [ ] 语言选择：切换语言正确
- [ ] 实时翻译：输入后自动翻译
- [ ] 文件翻译：上传、翻译、下载正常
- [ ] 翻译历史：正确显示和管理
- [ ] 收藏功能：收藏和取消收藏正常

### 7.2 边界测试

- [ ] 无提供商时的提示
- [ ] 文本过长限制
- [ ] 文件过大限制
- [ ] 不支持的文件格式
- [ ] 网络中断处理

---

## 8. 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/shared/types/translation.types.ts` | 新增 | 翻译类型定义 |
| `src/main/database/repositories/translation.repository.ts` | 新增 | 翻译数据仓库 |
| `src/main/services/translation.service.ts` | 新增 | 翻译服务 |
| `src/main/ipc/handlers/translation.handler.ts` | 新增 | IPC 处理器 |
| `src/main/ipc/index.ts` | 修改 | 注册处理器 |
| `src/main/database/index.ts` | 修改 | 添加表初始化 |
| `src/preload/index.ts` | 修改 | 添加 API |
| `src/renderer/src/composables/useTranslation.ts` | 新增 | 翻译 composable |
| `src/renderer/src/views/Translation.vue` | 新增 | 翻译页面 |
| `src/renderer/src/components/translation/TextTranslation.vue` | 新增 | 文本翻译组件 |
| `src/renderer/src/components/translation/FileTranslation.vue` | 新增 | 文件翻译组件 |
| `src/renderer/src/components/translation/TranslationSidebar.vue` | 新增 | 历史侧边栏 |
| `src/renderer/src/router/index.ts` | 修改 | 添加路由 |