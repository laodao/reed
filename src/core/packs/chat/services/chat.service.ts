/**
 * 对话服务
 * @module core/packs/chat/services/chat.service
 * @description 处理 AI 对话的核心服务
 */

import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { getEventEmitter } from '@core/interfaces/event.interface'
import { createProvider } from '@core/platform/providers/llm'
import { PROVIDER_TEMPLATES } from '@core/platform/services/provider-template.service'
import { getSecureStorage } from '@core/interfaces/storage.interface'
import { FileService } from '@core/platform/services/file.service'
import { KnowledgeBaseService } from '@core/platform/services/knowledge-base.service'
import { getSearchEngineService } from '@core/platform/services/search-engine.service'
import type {
  Dialog,
  ChatContext,
  SendMessageRequest,
  StreamEvent,
  WebSearchResult,
  MessageMetadata,
  Attachment,
  AttachmentContent,
  SearchResult
} from '@shared/types'

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
        request: SendMessageRequest
  ): Promise<{ success: boolean; error?: string }> {
    const dbManager = getCoreDatabaseManager()

    if (!dbManager.dialogs || !dbManager.messages || !dbManager.providerConfigs) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      // 获取对话信息
      const dialog = await dbManager.dialogs.getById(request.dialogId)
      if (!dialog) {
        return { success: false, error: '对话不存在' }
      }

      // Agent 模式（28 号 M5）：分流到系统 agent 循环（工具调用/工作流/技能/任务树）
      if (dialog.agentEnabled) {
        const { SystemAgentChatService } = await import('./system-agent/system-agent.service')
        return await SystemAgentChatService.sendMessage(request)
      }

      // 关键：优先使用前端传来的 modelId 和 providerConfigId（内存中的值）
      // 只有前端没传时才从数据库读取
      const effectiveModelId = request.modelId || dialog.modelId
      const effectiveProviderConfigId = request.providerConfigId || dialog.providerConfigId

      // 获取提供商配置
      let providerConfig = null

      // 优先使用前端传来的提供商配置
      if (effectiveProviderConfigId) {
        providerConfig = await dbManager.providerConfigs.getById(effectiveProviderConfigId)
      }

      // 如果没有指定或找不到，尝试获取默认提供商
      if (!providerConfig) {
        providerConfig = await dbManager.providerConfigs.getDefault()
      }

      // 如果还是没有，尝试获取第一个启用的提供商
      if (!providerConfig) {
        const enabledConfigs = await dbManager.providerConfigs.getEnabled()
        if (enabledConfigs.length > 0) {
          providerConfig = enabledConfigs[0]
        }
      }

      if (!providerConfig) {
        return { success: false, error: '未配置 AI 提供商，请先在设置中添加提供商配置' }
      }

      if (!providerConfig.apiKey) {
        console.error('[ChatService.sendMessage] 错误: 提供商未配置 API 密钥')
        return { success: false, error: `提供商 "${providerConfig.name}" 未配置 API 密钥` }
      }

      // 解密 API 密钥
      let decryptedApiKey: string
      try {
        const secureStorage = getSecureStorage()
        if (!secureStorage.isInitialized()) {
          await secureStorage.initialize()
        }
        decryptedApiKey = secureStorage.decrypt(providerConfig.apiKey)
      } catch (decryptError) {
        return { success: false, error: 'API 密钥解密失败，请重新配置提供商' }
      }

      // 获取模板
      const template = PROVIDER_TEMPLATES.find(t => t.id === providerConfig.templateId)

      if (!template) {
        return { success: false, error: '提供商模板不存在' }
      }

      console.log('[ChatService.sendMessage] 提供商信息:')
      console.log('  - providerConfig.id:', providerConfig.id)
      console.log('  - providerConfig.name:', providerConfig.name)
      console.log('  - providerConfig.templateId:', providerConfig.templateId)
      console.log('  - effectiveModelId:', effectiveModelId)
      console.log('  - template.id:', template.id)

      // 创建 Provider 实例
      const provider = createProvider(
        template.id,
        {
          apiKey: decryptedApiKey,
          baseUrl: providerConfig.baseUrl,
          defaultModel: effectiveModelId
        },
        template,
        providerConfig
      )

      // 构建上下文（先构建，再保存用户消息，避免重复）
      // 这样 buildContext 会处理附件，然后传入 Provider
      const context = await this.buildContext(
        dialog,
        request.dialogId,
        dbManager,
        { content: request.content, attachments: request.attachments },
        effectiveModelId
      )

      // 保存用户消息到数据库
      const userMessage = await dbManager.messages.create({
        dialogId: request.dialogId,
        role: 'user',
        content: request.content,
        attachments: request.attachments
      })

      // 处理联网搜索
      let webSearchResults: WebSearchResult[] = []
      let webSearchContext = ''

      if (request.webSearch?.enabled && request.webSearch.engine !== 'model') {
        console.log('[ChatService.sendMessage] 执行联网搜索, engine:', request.webSearch.engine, 'configId:', request.webSearch.configId)
        const searchEngineService = getSearchEngineService()
        const searchResponse = await searchEngineService.search(
          request.content,
          request.webSearch.engine,
          request.webSearch.configId,
          request.webSearch.topK ?? 5
        )

        if (searchResponse.success && searchResponse.results.length > 0) {
          webSearchResults = searchResponse.results.map(r => ({
            title: r.title,
            url: r.url,
            snippet: r.snippet,
            source: r.source
          }))
          webSearchContext = ChatService.formatSearchResults(webSearchResults)
          console.log('[ChatService.sendMessage] 联网搜索成功, 结果数量:', webSearchResults.length)
        } else if (searchResponse.error) {
          console.log('[ChatService.sendMessage] 联网搜索失败:', searchResponse.error)
          // 搜索失败不影响主流程，继续调用 AI
        }
      }

      // 处理知识库检索
      let knowledgeResults: SearchResult[] = []
      let knowledgeContext = ''

      // 优先使用请求中传入的知识库配置，否则从角色获取
      let kbIds = request.knowledgeBaseIds
      let kbTopK = request.knowledgeRetrieveCount
      let kbThreshold = request.knowledgeThreshold

      // 如果请求中没有知识库配置，从角色获取
      if (!kbIds && dialog.roleId && dbManager.roles) {
        const role = await dbManager.roles.getById(dialog.roleId)
        if (role?.knowledgeBaseIds?.length) {
          kbIds = role.knowledgeBaseIds
          kbTopK = kbTopK ?? role.knowledgeRetrieveCount
          kbThreshold = kbThreshold ?? role.knowledgeThreshold
        }
      }

      // 执行知识库检索
      if (kbIds && kbIds.length > 0) {
        console.log('[ChatService.sendMessage] 执行知识库检索, 知识库数量:', kbIds.length)
        const kbService = new KnowledgeBaseService()
        const allResults: SearchResult[] = []

        for (const kbId of kbIds) {
          try {
            const searchResponse = await kbService.search({
              knowledgeBaseId: kbId,
              query: request.content,
              topK: kbTopK || 5,
              threshold: kbThreshold || 0.5
            })

            if (searchResponse.success && searchResponse.data) {
              allResults.push(...searchResponse.data)
              console.log('[ChatService.sendMessage] 知识库', kbId, '检索成功, 结果数量:', searchResponse.data.length)
            }
          } catch (kbError) {
            console.error('[ChatService.sendMessage] 知识库检索失败:', kbError)
            // 单个知识库检索失败不影响其他知识库
          }
        }

        // 按相似度排序，取 top N
        allResults.sort((a, b) => b.score - a.score)
        knowledgeResults = allResults.slice(0, kbTopK || 5)

        // 构建知识库上下文
        if (knowledgeResults.length > 0) {
          knowledgeContext = this.formatKnowledgeContext(knowledgeResults)
          console.log('[ChatService.sendMessage] 知识库检索完成, 总结果数量:', knowledgeResults.length)
        }
      }

      // 创建 AbortController
      const abortController = new AbortController()
      activeStreams.set(request.dialogId, abortController)

      // 创建 AI 消息（先创建空消息，在发送 start 事件之前）
      const aiMessageMetadata: MessageMetadata = {}
      if (webSearchResults.length > 0) {
        aiMessageMetadata.webSearch = webSearchResults
      }
      if (knowledgeResults.length > 0) {
        aiMessageMetadata.knowledgeBase = knowledgeResults.map(r => ({
          documentId: r.documentId,
          documentName: r.documentName,
          score: r.score,
          snippet: r.content
        }))
      }

      const aiMessage = await dbManager.messages.create({
        dialogId: request.dialogId,
        role: 'assistant',
        content: '',
        modelId: effectiveModelId,
        metadata: Object.keys(aiMessageMetadata).length > 0 ? aiMessageMetadata : undefined
      })

      // 发送流式开始事件（包含 messageId 和 dialogId）
      this.sendStreamEvent({
        type: 'start',
        messageId: aiMessage.id,
        dialogId: request.dialogId
      })

      // 构建聊天选项
      // temperature 从角色配置注入（role.temperature，DB 默认 0.7），
      // 让 provider 层不再写死 0.7，用户可在角色里调节生成随机性。
      let roleTemperature: number | undefined
      if (dialog.roleId && dbManager.roles) {
        const roleForTemp = await dbManager.roles.getById(dialog.roleId)
        if (roleForTemp?.temperature != null) {
          roleTemperature = roleForTemp.temperature
        }
      }
      const chatOptions = {
        enableThinking: request.enableThinkingChain,
        webSearchContext: webSearchContext || undefined,
        knowledgeContext: knowledgeContext || undefined,
        temperature: roleTemperature
      }

      // 流式调用 AI
      let fullContent = ''
      let fullThinkingContent = ''
      let tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined

      try {
        fullContent = await provider.chatStream(
          context,
          (event: StreamEvent) => {
            // 收集思维链内容
            if (event.type === 'thinking' && event.thinkingContent) {
              fullThinkingContent += event.thinkingContent
            }

            // 收集 token 使用信息
            if (event.type === 'done' && event.usage) {
              tokenUsage = event.usage
            }

            // 转发事件到渲染进程
            this.sendStreamEvent({
              ...event,
              messageId: aiMessage.id,
              dialogId: request.dialogId
            })
          },
          abortController.signal,
          chatOptions
        )
        console.log('[ChatService.sendMessage] AI 调用完成, 内容长度:', fullContent.length, ', 思维链长度:', fullThinkingContent.length)
      } catch (error: any) {
        console.error('[ChatService.sendMessage] AI 调用异常:', error)
        // 更新 AI 消息内容（即使是错误也保存已获取的内容）
        if (fullContent) {
          const metadata: MessageMetadata = {}
          if (fullThinkingContent) {
            metadata.thinkingChain = fullThinkingContent
          }
          if (webSearchResults.length > 0) {
            metadata.webSearch = webSearchResults
          }
          if (knowledgeResults.length > 0) {
            metadata.knowledgeBase = knowledgeResults.map(r => ({
              documentId: r.documentId,
              documentName: r.documentName,
              score: r.score,
              snippet: r.content
            }))
          }
          await dbManager.messages.updateContent(aiMessage.id, fullContent)
          if (Object.keys(metadata).length > 0) {
            await dbManager.messages.updateMetadata(aiMessage.id, metadata)
          }
        }

        // 发送错误事件
        this.sendStreamEvent({
          type: 'error',
          messageId: aiMessage.id,
          dialogId: request.dialogId,
          error: error.message || 'AI 响应失败'
        })

        return { success: false, error: error.message }
      }

      // 更新 AI 消息内容和元数据
      await dbManager.messages.updateContent(aiMessage.id, fullContent)

      // 更新 token 使用量
      if (tokenUsage) {
        await dbManager.messages.updateTokensUsed(aiMessage.id, tokenUsage.completionTokens)
        await dbManager.messages.updateTokensUsed(userMessage.id, tokenUsage.promptTokens)
      }

      // 更新元数据（思维链和搜索结果）
      const metadata: MessageMetadata = {}
      if (fullThinkingContent) {
        metadata.thinkingChain = fullThinkingContent
      }
      if (webSearchResults.length > 0) {
        metadata.webSearch = webSearchResults
      }
      if (knowledgeResults.length > 0) {
        metadata.knowledgeBase = knowledgeResults.map(r => ({
          documentId: r.documentId,
          documentName: r.documentName,
          score: r.score,
          snippet: r.content
        }))
      }
      if (Object.keys(metadata).length > 0) {
        await dbManager.messages.updateMetadata(aiMessage.id, metadata)
      }

      // 发送完成事件（包含 token 使用信息）
      this.sendStreamEvent({
        type: 'done',
        messageId: aiMessage.id,
        dialogId: request.dialogId,
        usage: tokenUsage
      })

      // 清理
      activeStreams.delete(request.dialogId)

      return { success: true }
    } catch (error: any) {
      console.error('[ChatService.sendMessage] 错误:', error.message)
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
   * 格式化知识库检索结果为上下文
   * @param results 检索结果列表
   * @returns 格式化后的上下文字符串
   */
  private static formatKnowledgeContext(results: SearchResult[]): string {
    if (results.length === 0) return ''

    const sections = results.map((r, i) =>
      `【${i + 1}】来源: ${r.documentName}\n相关度: ${(r.score * 100).toFixed(1)}%\n\n${r.content}`
    )

    return sections.join('\n\n---\n\n')
  }

  /**
   * 格式化联网搜索结果为上下文
   * @param results 搜索结果列表
   * @returns 格式化后的上下文字符串
   */
  private static formatSearchResults(results: WebSearchResult[]): string {
    if (results.length === 0) return ''

    const sections = results.map((r, i) =>
      `【${i + 1}】标题: ${r.title}\n来源: ${r.sourceName || r.source}\n链接: ${r.url}\n\n${r.snippet}`
    )

    return sections.join('\n\n---\n\n')
  }

  /**
   * 构建对话上下文
   * @param dialog 对话信息
   * @param dialogId 对话 ID
   * @param dbManager 数据库管理器
   * @param currentMessage 当前消息（可选，用于处理当前发送的附件）
   * @param modelId 当前模型 ID（多模态能力校验：图片附件需 vision 模型）
   */
  private static async buildContext(
    dialog: Dialog,
    dialogId: string,
    dbManager: any,
    currentMessage?: { content: string; attachments?: Attachment[] },
    modelId?: string
  ): Promise<ChatContext> {
    // 获取上下文配置
    const maxMessages = dialog.contextConfig?.maxMessages || 20

    // 获取最近的消息
    const messages = await dbManager.messages.getRecent(dialogId, maxMessages + 1)

    // 过滤并构建历史消息
    // 1. 确保消息有内容
    // 2. 确保内容是字符串
    // 3. 确保角色是 'user' 或 'assistant'
    const historyMessages: Array<{
      role: 'user' | 'assistant'
      content: string | any[]
      attachments?: AttachmentContent[]
    }> = []

    for (const m of messages) {
      // 过滤掉没有内容的消息
      if (!m.content || typeof m.content !== 'string' || m.content.trim() === '') {
        continue
      }
      // 过滤掉角色不正确的消息
      if (m.role !== 'user' && m.role !== 'assistant') {
        continue
      }

      // 处理附件
      let attachmentContents: AttachmentContent[] | undefined
      if (m.attachments && m.attachments.length > 0) {
        console.log(`[ChatService.buildContext] 处理消息 ${m.id} 的附件, 数量:`, m.attachments.length)
        try {
          attachmentContents = await FileService.readAttachments(m.attachments)
        } catch (error) {
          console.error(`[ChatService.buildContext] 读取附件失败:`, error)
        }
      }

      // 构建消息内容
      let messageContent: string | any[]
      if (attachmentContents && attachmentContents.length > 0) {
        // 有附件时构建多模态内容
        messageContent = FileService.buildMultimodalContent(m.content.trim(), attachmentContents)
      } else {
        // 无附件时使用纯文本
        messageContent = m.content.trim()
      }

      historyMessages.push({
        role: m.role as 'user' | 'assistant',
        content: messageContent,
        attachments: attachmentContents
      })
    }

    // 取最近的 N 条消息
    const limitedHistory = historyMessages.slice(-maxMessages)

    // 如果有当前消息（用户正在发送的消息），添加到历史末尾
    if (currentMessage) {
      let currentAttachmentContents: AttachmentContent[] | undefined
      if (currentMessage.attachments && currentMessage.attachments.length > 0) {
        console.log('[ChatService.buildContext] 处理当前消息的附件, 数量:', currentMessage.attachments.length)
        try {
          currentAttachmentContents = await FileService.readAttachments(currentMessage.attachments)
        } catch (error) {
          console.error('[ChatService.buildContext] 读取当前消息附件失败:', error)
        }
      }

      // 多模态能力校验：图片附件（含 @ 图片资产）要求模型支持 vision
      if (currentAttachmentContents?.some(a => a.type === 'image')) {
        const { detectVisionSupport } = await import('@core/packs/chat/services/model-detector.service')
        if (modelId && !detectVisionSupport(modelId)) {
          throw new Error(
            '当前模型不支持图片输入，无法引用图片资产——请切换到支持多模态的模型（如 qwen-vl / gpt-4o），或移除图片附件'
          )
        }
      }

      let currentContent: string | any[]
      if (currentAttachmentContents && currentAttachmentContents.length > 0) {
        currentContent = FileService.buildMultimodalContent(
          currentMessage.content.trim(),
          currentAttachmentContents
        )
      } else {
        currentContent = currentMessage.content.trim()
      }

      limitedHistory.push({
        role: 'user',
        content: currentContent,
        attachments: currentAttachmentContents
      })
    }

    console.log('[ChatService.buildContext] 历史消息数量:', limitedHistory.length)
    console.log('[ChatService.buildContext] 消息详情:', limitedHistory.map(m => ({
      role: m.role,
      contentType: typeof m.content === 'string' ? 'string' : 'array',
      hasAttachments: !!m.attachments?.length
    })))

    return {
      systemPrompt: dialog.systemPrompt,
      messages: limitedHistory
    }
  }

  /**
   * 发送流式事件到渲染进程
   */
  private static sendStreamEvent(event: StreamEvent): void {
    getEventEmitter().emit('chat:stream', event)
  }
}
