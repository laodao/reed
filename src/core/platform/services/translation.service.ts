/**
 * 翻译服务
 * @module platform/services/translation-service
 * @description 处理文本和文件翻译的核心服务
 */

import fs from 'fs'
import path from 'path'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { TranslationRepository } from '@core/database/repositories/translation.repository'
import { createProvider } from '@core/platform/providers/llm'
import { PROVIDER_TEMPLATES, isApiKeyOptional } from '@core/platform/services/provider-template.service'
import { getSecureStorage } from '@core/interfaces/storage.interface'
import { getEventEmitter } from '@core/interfaces/event.interface'
import type {
  TextTranslationRequest,
  TextTranslationResponse,
  FileTranslationRequest,
  FileTranslationResponse,
  LanguageCode
} from '@shared/types/translation.types'
import type { ChatContext } from '@shared/types'
import { publishDomainEvent } from '@core/platform/workflow/trigger/domain-event-bus'
import { WORKFLOW_EVENT_NAMES } from '@shared/types/workflow.types'

/**
 * 翻译提供商
 */
export interface TranslationProvider {
  id: string
  name: string
  models: Array<{
    id: string
    name: string
  }>
  configured: boolean
}

/**
 * 翻译服务
 */
export class TranslationService {
  private static repo: TranslationRepository

  /**
   * 获取翻译仓库
   */
  private static getRepository(): TranslationRepository {
    // 复用 DatabaseManager 集中管理的实例（已切到 TypeORM DataSource）
    const dbManager = getCoreDatabaseManager()
    if (!dbManager.translations) {
      throw new Error('TranslationRepository not initialized')
    }
    return dbManager.translations
  }

  /**
   * 获取可用的翻译提供商列表
   */
  static async getProviders(): Promise<{ success: boolean; data?: TranslationProvider[]; error?: string }> {
    try {
      const dbManager = getCoreDatabaseManager()
      if (!dbManager.providerConfigs) {
        return { success: false, error: '数据库未初始化' }
      }

      const configs = await dbManager.providerConfigs.getEnabled()
      const providers: TranslationProvider[] = []

      for (const config of configs) {
        // 获取模板（免密钥判定与缺省模型都要用）
        const template = PROVIDER_TEMPLATES.find(t => t.id === config.templateId)

        // 检查是否有 API 密钥（免密钥提供商如 llama.cpp 无密钥也算已配置）
        const configured = !!config.apiKey || isApiKeyOptional(template)

        // 获取模型列表
        const models: Array<{ id: string; name: string }> = []

        // 从配置中获取模型
        if (config.models && Array.isArray(config.models)) {
          for (const model of config.models) {
            // 筛选文本类型的模型（包括 chat 和 text 类型）
            if (model.type === 'text' || model.type === 'chat' || !model.type) {
              models.push({
                id: model.id,
                name: model.name || model.id
              })
            }
          }
        }

        // ProviderTemplate 无 defaultModel 字段（模板不预置默认模型）：
        // 配置未启用任何文本模型时该提供商不进翻译列表，与模型选择器行为一致

        if (models.length > 0) {
          providers.push({
            id: config.id,
            name: config.name,
            models,
            configured
          })
        }
      }

      return { success: true, data: providers }
    } catch (error: any) {
      console.error('[TranslationService.getProviders] 错误:', error)
      return { success: false, error: error.message || '获取提供商列表失败' }
    }
  }

  /**
   * 文本翻译
   */
  static async translateText(
    request: TextTranslationRequest,
    saveRecord: boolean = true
  ): Promise<TextTranslationResponse> {
    try {
      // 文本长度检查
      if (request.text.length > 5000) {
        return { success: false, error: '文本超过 5000 字符限制' }
      }

      const dbManager = getCoreDatabaseManager()
      if (!dbManager.providerConfigs) {
        return { success: false, error: '数据库未初始化' }
      }

      // 获取提供商配置
      let providerConfig = null
      if (request.providerId) {
        providerConfig = await dbManager.providerConfigs.getById(request.providerId)
      }
      if (!providerConfig) {
        providerConfig = await dbManager.providerConfigs.getDefault()
      }
      if (!providerConfig) {
        const enabledConfigs = await dbManager.providerConfigs.getEnabled()
        if (enabledConfigs.length > 0) {
          providerConfig = enabledConfigs[0]
        }
      }

      if (!providerConfig) {
        return { success: false, error: '暂无可用的翻译服务，请先配置 AI 提供商' }
      }

      // 获取模板（空密钥挡板需要模板判定免密钥提供商，故先于挡板解析）
      const template = PROVIDER_TEMPLATES.find(t => t.id === providerConfig.templateId)
      if (!template) {
        return { success: false, error: '提供商模板不存在' }
      }

      // 空密钥挡板：免密钥提供商（如 llama.cpp 本地推理）允许不配置密钥
      if (!providerConfig.apiKey && !isApiKeyOptional(template)) {
        return { success: false, error: `提供商 "${providerConfig.name}" 未配置 API 密钥` }
      }

      // 解密 API 密钥（免密钥提供商可无密钥，置空串）
      let decryptedApiKey: string
      try {
        const secureStorage = getSecureStorage()
        if (!secureStorage.isInitialized()) {
          await secureStorage.initialize()
        }
        decryptedApiKey = providerConfig.apiKey ? secureStorage.decrypt(providerConfig.apiKey) : ''
      } catch (decryptError) {
        return { success: false, error: 'API 密钥解密失败，请重新配置提供商' }
      }

      // 获取模型（ProviderTemplate 无 defaultModel 字段——显式指定或配置的默认模型）
      const modelId = request.modelId || providerConfig.defaultModelId
      if (!modelId) {
        return { success: false, error: '没有可用的文本模型' }
      }

      // 创建 Provider 实例
      const provider = createProvider(
        template.id,
        {
          apiKey: decryptedApiKey,
          baseUrl: providerConfig.baseUrl,
          defaultModel: modelId
        },
        template,
        providerConfig
      )

      // 构建翻译提示词
      const prompt = this.buildTranslationPrompt(
        request.text,
        request.sourceLanguage,
        request.targetLanguage
      )

      // 构建上下文
      const context: ChatContext = {
        systemPrompt: undefined,
        messages: [{ role: 'user', content: prompt }]
      }

      // 调用 AI（使用非流式聊天）
      const result = await provider.chatSync(context)

      // 检查调用结果
      if (!result.success) {
        return { success: false, error: result.error || '翻译请求失败' }
      }

      const translatedText = result.content || ''

      if (!translatedText) {
        return { success: false, error: '翻译结果为空' }
      }

      // 检测语言
      let detectedLanguage: LanguageCode | undefined
      if (request.sourceLanguage === 'auto') {
        detectedLanguage = this.detectLanguage(request.text)
      }

      // 保存翻译记录
      if (saveRecord) {
        try {
          const repo = this.getRepository()
          if (repo) {
            await repo.create({
              type: 'text',
              sourceLanguage: request.sourceLanguage,
              targetLanguage: request.targetLanguage,
              sourceText: request.text,
              targetText: translatedText,
              status: 'completed',
              favorite: false,
              wordCount: request.text.length,
              providerId: providerConfig.id,
              modelId: modelId
            })
          }
        } catch (saveError) {
          console.error('[TranslationService.translateText] 保存记录失败:', saveError)
          // 保存失败不影响翻译结果
        }
      }

      return {
        success: true,
        data: {
          translatedText,
          detectedLanguage
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
    request: FileTranslationRequest
  ): Promise<FileTranslationResponse> {
    try {
      // 检查文件大小
      const stats = fs.statSync(request.filePath)
      if (stats.size > 5 * 1024 * 1024) {
        return { success: false, error: '文件大小超过限制（最大 5MB）' }
      }

      // 读取文件内容
      const content = await this.readFileContent(request.filePath)
      if (!content) {
        return { success: false, error: '无法读取文件内容' }
      }

      // 创建翻译记录
      const repo = this.getRepository()
      let recordId: string
      if (repo) {
        const record = await repo.create({
          type: 'file',
          sourceLanguage: request.sourceLanguage,
          targetLanguage: request.targetLanguage,
          sourceFile: request.filePath,
          sourceFileName: path.basename(request.filePath),
          status: 'processing',
          favorite: false,
          wordCount: content.length,
          providerId: request.providerId,
          modelId: request.modelId
        })
        recordId = record.id
      } else {
        return { success: false, error: '数据库未初始化' }
      }

      // 异步处理翻译
      this.processFileTranslation(recordId, content, request)

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
    recordId: string,
    content: string,
    request: FileTranslationRequest
  ): Promise<void> {
    const repo = this.getRepository()
    try {
      // 分段翻译长文本
      const chunks = this.splitTextIntoChunks(content, 4000)
      const translatedChunks: string[] = []

      for (let i = 0; i < chunks.length; i++) {
        // 发送进度
        getEventEmitter().emit('translation:progress', {
          translationId: recordId,
          progress: Math.round((i / chunks.length) * 100)
        })

        const response = await this.translateText({
          text: chunks[i],
          sourceLanguage: request.sourceLanguage,
          targetLanguage: request.targetLanguage,
          providerId: request.providerId,
          modelId: request.modelId
        }, false) // 文件翻译不单独保存每个 chunk 的记录

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

      fs.writeFileSync(targetPath, translatedChunks.join('\n\n'), 'utf-8')

      // 更新记录
      if (repo) {
        await repo.update(recordId, {
          targetFile: targetPath,
          status: 'completed'
        })
      }

      // 通知完成
      getEventEmitter().emit('translation:completed', {
        translationId: recordId,
        targetFile: targetPath
      })
      // 工作流事件触发埋点（不影响主流程）
      publishDomainEvent(WORKFLOW_EVENT_NAMES.translationCompleted, { translationId: recordId })
    } catch (error: any) {
      // 更新失败状态
      if (repo) {
        await repo.update(recordId, {
          status: 'failed',
          errorMessage: error.message
        })
      }

      getEventEmitter().emit('translation:failed', {
        translationId: recordId,
        error: error.message
      })
      // 工作流事件触发埋点（不影响主流程）
      publishDomainEvent(WORKFLOW_EVENT_NAMES.translationFailed, { translationId: recordId })
    }
  }

  /**
   * 读取文件内容
   */
  private static async readFileContent(filePath: string): Promise<string | null> {
    try {
      // 读取 txt 和 md 文件
      return fs.readFileSync(filePath, 'utf-8')
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