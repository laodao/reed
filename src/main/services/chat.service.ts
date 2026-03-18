/**
 * 对话服务
 * @module services/chat-service
 * @description 处理 AI 对话的核心服务
 */

import { BrowserWindow } from 'electron'
import { getDatabaseManager } from '../database'
import { OpenAICompatibleProvider } from '../providers/openai-compatible-provider'
import { PROVIDER_TEMPLATES } from './provider-template.service'
import { SecureStorageService } from './secure-storage.service'
import type {
  Dialog,
  Message,
  ChatContext,
  SendMessageRequest,
  StreamEvent,
  ProviderTemplate,
  UserProviderConfig
} from '../../shared/types'

/**
 * 正在进行的流式请求
 */
const activeStreams = new Map<string, AbortController>()

/**
 * 对话服务
 */
export class ChatService {
  /**
   * 发送消息并获取流式响应
   */
  static async sendMessage(
    window: BrowserWindow,
    request: SendMessageRequest
  ): Promise<{ success: boolean; error?: string }> {
    console.log('[ChatService.sendMessage] 开始处理请求')
    console.log('[ChatService.sendMessage] request:', request)

    const dbManager = getDatabaseManager()

    if (!dbManager.dialogs || !dbManager.messages || !dbManager.providerConfigs) {
      console.error('[ChatService.sendMessage] 错误: 数据库未初始化')
      return { success: false, error: '数据库未初始化' }
    }

    try {
      // 获取对话信息
      console.log('[ChatService.sendMessage] 获取对话信息, dialogId:', request.dialogId)
      const dialog = await dbManager.dialogs.getById(request.dialogId)
      console.log('[ChatService.sendMessage] dialog:', dialog)
      if (!dialog) {
        console.error('[ChatService.sendMessage] 错误: 对话不存在')
        return { success: false, error: '对话不存在' }
      }

      // 获取提供商配置
      let providerConfig = null

      // 优先使用对话中指定的提供商配置
      console.log('[ChatService.sendMessage] dialog.providerConfigId:', dialog.providerConfigId)
      if (dialog.providerConfigId) {
        console.log('[ChatService.sendMessage] 尝试获取指定的提供商配置')
        providerConfig = await dbManager.providerConfigs.getById(dialog.providerConfigId)
        console.log('[ChatService.sendMessage] 指定的提供商配置:', providerConfig ? providerConfig.name : null)
      }

      // 如果没有指定或找不到，尝试获取默认提供商
      if (!providerConfig) {
        console.log('[ChatService.sendMessage] 尝试获取默认提供商')
        providerConfig = await dbManager.providerConfigs.getDefault()
        console.log('[ChatService.sendMessage] 默认提供商配置:', providerConfig ? providerConfig.name : null)
      }

      // 如果还是没有，尝试获取第一个启用的提供商
      if (!providerConfig) {
        console.log('[ChatService.sendMessage] 尝试获取第一个启用的提供商')
        const enabledConfigs = await dbManager.providerConfigs.getEnabled()
        console.log('[ChatService.sendMessage] 启用的提供商数量:', enabledConfigs.length)
        if (enabledConfigs.length > 0) {
          providerConfig = enabledConfigs[0]
          console.log('[ChatService.sendMessage] 第一个启用的提供商:', providerConfig.name)
        }
      }

      if (!providerConfig) {
        console.error('[ChatService.sendMessage] 错误: 未配置 AI 提供商')
        return { success: false, error: '未配置 AI 提供商，请先在设置中添加提供商配置' }
      }

      console.log('[ChatService.sendMessage] 最终使用的提供商:', providerConfig.name)
      console.log('[ChatService.sendMessage] 提供商是否有 apiKey:', !!providerConfig.apiKey)

      if (!providerConfig.apiKey) {
        console.error('[ChatService.sendMessage] 错误: 提供商未配置 API 密钥')
        return { success: false, error: `提供商 "${providerConfig.name}" 未配置 API 密钥` }
      }

      // 解密 API 密钥
      console.log('[ChatService.sendMessage] 开始解密 API 密钥')
      let decryptedApiKey: string
      try {
        const secureStorage = SecureStorageService.getInstance()
        if (!secureStorage.isInitialized()) {
          await secureStorage.initialize()
        }
        decryptedApiKey = secureStorage.decrypt(providerConfig.apiKey)
        console.log('[ChatService.sendMessage] API 密钥解密成功, 长度:', decryptedApiKey.length)
      } catch (decryptError) {
        console.error('[ChatService.sendMessage] API 密钥解密失败:', decryptError)
        return { success: false, error: 'API 密钥解密失败，请重新配置提供商' }
      }

      // 获取模板
      console.log('[ChatService.sendMessage] 获取模板, templateId:', providerConfig.templateId)
      const template = PROVIDER_TEMPLATES.find(t => t.id === providerConfig.templateId)
      console.log('[ChatService.sendMessage] 模板:', template ? template.name : null)

      if (!template) {
        console.error('[ChatService.sendMessage] 错误: 提供商模板不存在')
        return { success: false, error: '提供商模板不存在' }
      }

      // 创建 Provider 实例
      console.log('[ChatService.sendMessage] 创建 Provider 实例')
      console.log('[ChatService.sendMessage] dialog.modelId:', dialog.modelId)
      console.log('[ChatService.sendMessage] dialog.providerConfigId:', dialog.providerConfigId)
      const provider = new OpenAICompatibleProvider(
        {
          apiKey: decryptedApiKey,
          baseUrl: providerConfig.baseUrl,
          defaultModel: dialog.modelId
        },
        template.id,
        template.name,
        template.apiConfig.baseUrl,
        template,
        providerConfig
      )

      // 保存用户消息
      console.log('[ChatService.sendMessage] 保存用户消息')
      const userMessage = await dbManager.messages.create({
        dialogId: request.dialogId,
        role: 'user',
        content: request.content,
        attachments: request.attachments
      })
      console.log('[ChatService.sendMessage] 用户消息已保存, id:', userMessage.id)

      // 构建上下文
      console.log('[ChatService.sendMessage] 构建对话上下文')
      const context = await this.buildContext(dialog, request.dialogId, dbManager)
      console.log('[ChatService.sendMessage] 上下文消息数量:', context.messages.length)

      // 创建 AbortController
      const abortController = new AbortController()
      activeStreams.set(request.dialogId, abortController)

      // 发送流式开始事件
      this.sendStreamEvent(window, {
        type: 'start',
        messageId: undefined
      })

      // 创建 AI 消息（先创建空消息）
      console.log('[ChatService.sendMessage] 创建 AI 消息')
      const aiMessage = await dbManager.messages.create({
        dialogId: request.dialogId,
        role: 'assistant',
        content: '',
        modelId: dialog.modelId
      })
      console.log('[ChatService.sendMessage] AI 消息已创建, id:', aiMessage.id)

      // 流式调用 AI
      console.log('[ChatService.sendMessage] 开始流式调用 AI, model:', dialog.modelId)
      let fullContent = ''
      try {
        fullContent = await provider.chatStream(
          context,
          (event: StreamEvent) => {
            // 转发事件到渲染进程
            this.sendStreamEvent(window, {
              ...event,
              messageId: aiMessage.id
            })
          },
          abortController.signal
        )
        console.log('[ChatService.sendMessage] AI 调用完成, 内容长度:', fullContent.length)
      } catch (error: any) {
        console.error('[ChatService.sendMessage] AI 调用异常:', error)
        // 更新 AI 消息内容（即使是错误也保存已获取的内容）
        if (fullContent) {
          await dbManager.messages.updateContent(aiMessage.id, fullContent)
        }

        // 发送错误事件
        this.sendStreamEvent(window, {
          type: 'error',
          messageId: aiMessage.id,
          error: error.message || 'AI 响应失败'
        })

        return { success: false, error: error.message }
      }

      // 更新 AI 消息内容
      console.log('[ChatService.sendMessage] 更新 AI 消息内容')
      await dbManager.messages.updateContent(aiMessage.id, fullContent)

      // 发送完成事件
      this.sendStreamEvent(window, {
        type: 'done',
        messageId: aiMessage.id
      })

      // 清理
      activeStreams.delete(request.dialogId)

      console.log('[ChatService.sendMessage] 处理完成, 返回成功')
      return { success: true }
    } catch (error: any) {
      console.error('[ChatService.sendMessage] 捕获异常:', error)
      console.error('[ChatService.sendMessage] 异常消息:', error.message)
      console.error('[ChatService.sendMessage] 异常堆栈:', error.stack)
      return { success: false, error: error.message || '发送失败' }
    }
  }

  /**
   * 停止流式响应
   */
  static stopStream(dialogId: string): boolean {
    const controller = activeStreams.get(dialogId)
    if (controller) {
      controller.abort()
      activeStreams.delete(dialogId)
      return true
    }
    return false
  }

  /**
   * 构建对话上下文
   */
  private static async buildContext(
    dialog: Dialog,
    dialogId: string,
    dbManager: any
  ): Promise<ChatContext> {
    // 获取上下文配置
    const maxMessages = dialog.contextConfig?.maxMessages || 20

    // 获取最近的消息
    const messages = await dbManager.messages.getRecent(dialogId, maxMessages + 1)

    // 过滤掉最后一条（即将创建的 AI 消息）
    const historyMessages = messages
      .filter((m: Message) => m.role !== 'assistant' || m.content)
      .slice(-maxMessages)
      .map((m: Message) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      }))

    return {
      systemPrompt: dialog.systemPrompt,
      messages: historyMessages
    }
  }

  /**
   * 发送流式事件到渲染进程
   */
  private static sendStreamEvent(window: BrowserWindow, event: StreamEvent): void {
    window.webContents.send('chat:stream', event)
  }
}
