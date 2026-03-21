/**
 * 对话状态管理
 * @module stores/dialog
 * @description 管理AI对话的状态，包括对话列表、消息、流式输出等
 */

import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type {
  Dialog,
  Message,
  CreateDialogRequest,
  StreamEvent,
  ContextConfig,
  WebSearchEngine
} from '../../../shared/types'

/**
 * 流式状态接口
 */
interface StreamState {
  isStreaming: boolean
  messageId: string | null
  content: string
  error: string | null
}

/**
 * 使用对话 Store
 */
export const useDialogStore = defineStore('dialog', () => {
  // ==================== 状态 ====================

  /**
   * 对话列表
   */
  const dialogs = ref<Dialog[]>([])

  /**
   * 当前选中的对话
   */
  const currentDialog = ref<Dialog | null>(null)

  /**
   * 每个对话的消息缓存 Map<dialogId, Message[]>
   * 用于在切换对话时保留每个对话的消息状态
   */
  const messagesCache = ref(new Map<string, Message[]>())

  /**
   * 每个对话的流式状态缓存 Map<dialogId, StreamState>
   * 用于在切换对话时保留每个对话的流式状态
   */
  const streamStateCache = ref(new Map<string, StreamState>())

  /**
   * 当前对话的消息列表（计算属性，从缓存中获取）
   */
  const messages = computed({
    get: () => {
      if (!currentDialog.value) return []
      return messagesCache.value.get(currentDialog.value.id) || []
    },
    set: (value) => {
      if (currentDialog.value) {
        messagesCache.value.set(currentDialog.value.id, value)
      }
    }
  })

  /**
   * 当前对话的流式状态（计算属性，从缓存中获取）
   */
  const streamState = computed({
    get: () => {
      if (!currentDialog.value) {
        return { isStreaming: false, messageId: null, content: '', error: null }
      }
      return streamStateCache.value.get(currentDialog.value.id) || {
        isStreaming: false,
        messageId: null,
        content: '',
        error: null
      }
    },
    set: (value) => {
      if (currentDialog.value) {
        streamStateCache.value.set(currentDialog.value.id, value)
      }
    }
  })

  /**
   * 加载中状态
   */
  const loading = ref(false)

  /**
   * 按角色分组的对话
   */
  const dialogsByRole = computed(() => {
    const groups = new Map<string | null, Dialog[]>()
    for (const dialog of dialogs.value) {
      const roleId = dialog.roleId || null
      if (!groups.has(roleId)) {
        groups.set(roleId, [])
      }
      groups.get(roleId)!.push(dialog)
    }
    return groups
  })

  // 流式事件取消订阅函数
  let unsubscribeStream: (() => void) | null = null

  // ==================== 对话管理 ====================

  /**
   * 加载对话列表
   */
  async function loadDialogs(): Promise<void> {
    loading.value = true
    try {
      const response = await window.electronAPI.dialog.list()
      if (response.success && response.dialogs) {
        dialogs.value = response.dialogs
      }
    } catch (error) {
      console.error('加载对话列表失败:', error)
    } finally {
      loading.value = false
    }
  }

  /**
   * 按角色加载对话列表
   */
  async function loadDialogsByRole(roleId: string | null): Promise<void> {
    loading.value = true
    try {
      const response = await window.electronAPI.dialog.listByRole(roleId)
      if (response.success && response.dialogs) {
        dialogs.value = response.dialogs
      }
    } catch (error) {
      console.error('加载对话列表失败:', error)
    } finally {
      loading.value = false
    }
  }

  /**
   * 创建新对话
   */
  async function createDialog(request: CreateDialogRequest): Promise<Dialog | null> {
    try {
      const response = await window.electronAPI.dialog.create(request)
      if (response.success && response.dialog) {
        dialogs.value.unshift(response.dialog)
        currentDialog.value = response.dialog
        // 初始化新对话的消息缓存
        messagesCache.value.set(response.dialog.id, [])
        streamStateCache.value.set(response.dialog.id, {
          isStreaming: false,
          messageId: null,
          content: '',
          error: null
        })
        return response.dialog
      }
      return null
    } catch (error) {
      console.error('创建对话失败:', error)
      return null
    }
  }

  /**
   * 更新对话
   */
  async function updateDialog(id: string, data: Partial<Dialog>): Promise<boolean> {
    try {
      // 1. 先立即更新内存中的数据（不等数据库）
      if (currentDialog.value?.id === id) {
        currentDialog.value = {
          ...currentDialog.value,
          modelId: data.modelId ?? currentDialog.value.modelId,
          providerConfigId: data.providerConfigId ?? currentDialog.value.providerConfigId,
          systemPrompt: data.systemPrompt ?? currentDialog.value.systemPrompt,
          contextConfig: data.contextConfig ?? currentDialog.value.contextConfig,
          title: data.title ?? currentDialog.value.title
        }
      }

      // 2. 更新 dialogs 列表
      const index = dialogs.value.findIndex(d => d.id === id)
      if (index !== -1) {
        dialogs.value[index] = { ...dialogs.value[index], ...data }
      }

      // 3. 写入数据库
      const plainData = JSON.parse(JSON.stringify(data))
      const response = await window.electronAPI.dialog.update(id, plainData)

      return response.success
    } catch (error) {
      console.error('更新对话失败:', error)
      return false
    }
  }

  /**
   * 删除对话
   */
  async function deleteDialog(dialogId: string): Promise<boolean> {
    try {
      const response = await window.electronAPI.dialog.delete(dialogId)
      if (response.success) {
        dialogs.value = dialogs.value.filter(d => d.id !== dialogId)
        // 清理该对话的缓存
        messagesCache.value.delete(dialogId)
        streamStateCache.value.delete(dialogId)
        if (currentDialog.value?.id === dialogId) {
          currentDialog.value = null
        }
        return true
      }
      return false
    } catch (error) {
      console.error('删除对话失败:', error)
      return false
    }
  }

  /**
   * 选择对话
   */
  async function selectDialog(dialog: Dialog): Promise<void> {
    currentDialog.value = dialog
    // 如果该对话还没有缓存，从数据库加载
    if (!messagesCache.value.has(dialog.id)) {
      await loadMessages(dialog.id)
    }
  }

  // ==================== 消息管理 ====================

  /**
   * 加载消息列表
   */
  async function loadMessages(dialogId: string): Promise<void> {
    try {
      const response = await window.electronAPI.message.list(dialogId)
      if (response.success && response.messages) {
        messagesCache.value.set(dialogId, response.messages)
      }
    } catch (error) {
      console.error('加载消息列表失败:', error)
      messagesCache.value.set(dialogId, [])
    }
  }

  /**
   * 发送消息
   */
  async function sendMessage(
    content: string,
    options?: {
      attachments?: Message['attachments']
      webSearch?: {
        enabled: boolean
        engine: WebSearchEngine
      }
      enableThinkingChain?: boolean
      // 可选的模型和提供商配置（用于重新生成）
      modelId?: string
      providerConfigId?: string
    }
  ): Promise<boolean> {
    if (!currentDialog.value) {
      console.error('[sendMessage] 错误: 没有选中的对话')
      return false
    }

    const dialogId = currentDialog.value.id
    // 优先使用传入的模型和提供商配置，否则使用当前对话的配置
    const effectiveModelId = options?.modelId || currentDialog.value.modelId
    const effectiveProviderConfigId = options?.providerConfigId || currentDialog.value.providerConfigId

    // 初始化该对话的流式状态
    streamStateCache.value.set(dialogId, {
      isStreaming: true,
      messageId: null,
      content: '',
      error: null
    })

    // 获取当前对话的消息列表并添加用户消息
    const currentMessages = messagesCache.value.get(dialogId) || []
    const tempUserMessageId = `temp-user-${Date.now()}`
    const userMessage: Message = {
      id: tempUserMessageId,
      dialogId,
      role: 'user',
      content,
      attachments: options?.attachments,
      createdAt: new Date()
    }
    messagesCache.value.set(dialogId, [...currentMessages, userMessage])

    // 订阅流式事件
    if (unsubscribeStream) {
      unsubscribeStream()
    }
    unsubscribeStream = window.electronAPI.chat.onStream(handleStreamEvent)

    try {
      const requestData = JSON.parse(JSON.stringify({
        dialogId,
        content,
        attachments: options?.attachments,
        webSearch: options?.webSearch,
        enableThinkingChain: options?.enableThinkingChain,
        modelId: effectiveModelId,
        providerConfigId: effectiveProviderConfigId
      }))

      const response = await window.electronAPI.chat.send(requestData)

      if (!response.success) {
        // 更新流式状态
        streamStateCache.value.set(dialogId, {
          isStreaming: false,
          messageId: null,
          content: '',
          error: response.error || '发送失败'
        })
        // 移除临时用户消息
        const msgs = messagesCache.value.get(dialogId) || []
        messagesCache.value.set(dialogId, msgs.filter(m => m.id !== tempUserMessageId))
        return false
      }

      // 重新加载消息列表以获取真实的消息 ID
      await loadMessages(dialogId)
      return true
    } catch (error: any) {
      console.error('[sendMessage] 捕获异常:', error)
      streamStateCache.value.set(dialogId, {
        isStreaming: false,
        messageId: null,
        content: '',
        error: error.message || '发送失败'
      })
      // 移除临时用户消息
      const msgs = messagesCache.value.get(dialogId) || []
      messagesCache.value.set(dialogId, msgs.filter(m => m.id !== tempUserMessageId))
      return false
    }
  }

  /**
   * 处理流式事件
   */
  function handleStreamEvent(event: any, data: StreamEvent): void {
    const messageDialogId = data.dialogId
    if (!messageDialogId) return

    // 获取该对话的流式状态
    const dialogStreamState = streamStateCache.value.get(messageDialogId)
    if (!dialogStreamState) return

    // 获取该对话的消息列表
    const dialogMessages = messagesCache.value.get(messageDialogId) || []

    switch (data.type) {
      case 'start':
        streamStateCache.value.set(messageDialogId, {
          ...dialogStreamState,
          messageId: data.messageId || null,
          content: '',
          isStreaming: true
        })
        // 如果有 messageId，确保 AI 消息存在于列表中
        if (data.messageId) {
          const msgIndex = dialogMessages.findIndex(m => m.id === data.messageId)
          if (msgIndex === -1) {
            dialogMessages.push({
              id: data.messageId,
              dialogId: messageDialogId,
              role: 'assistant',
              content: '',
              createdAt: new Date()
            })
            messagesCache.value.set(messageDialogId, [...dialogMessages])
          }
        }
        break
      case 'thinking':
        if (data.messageId) {
          const msgIndex = dialogMessages.findIndex(m => m.id === data.messageId)
          if (msgIndex !== -1) {
            const existingThinking = dialogMessages[msgIndex].metadata?.thinkingChain || ''
            dialogMessages[msgIndex] = {
              ...dialogMessages[msgIndex],
              metadata: {
                ...dialogMessages[msgIndex].metadata,
                thinkingChain: existingThinking + (data.thinkingContent || '')
              }
            }
            messagesCache.value.set(messageDialogId, [...dialogMessages])
          }
        }
        break
      case 'delta':
        const currentContent = dialogStreamState.content + (data.content || '')
        streamStateCache.value.set(messageDialogId, {
          ...dialogStreamState,
          content: currentContent
        })
        // 更新消息列表中的 AI 消息
        if (data.messageId) {
          const msgIndex = dialogMessages.findIndex(m => m.id === data.messageId)
          if (msgIndex !== -1) {
            dialogMessages[msgIndex] = {
              ...dialogMessages[msgIndex],
              content: currentContent
            }
            messagesCache.value.set(messageDialogId, [...dialogMessages])
          }
        }
        break
      case 'done':
        streamStateCache.value.set(messageDialogId, {
          ...dialogStreamState,
          isStreaming: false
        })
        // 流式完成后重新加载消息以获取完整的 metadata
        loadMessages(messageDialogId)
        break
      case 'error':
        streamStateCache.value.set(messageDialogId, {
          ...dialogStreamState,
          error: data.error || '未知错误',
          isStreaming: false
        })
        break
    }
  }

  /**
   * 停止生成
   */
  async function stopGeneration(): Promise<void> {
    if (!currentDialog.value) return

    const dialogId = currentDialog.value.id
    const dialogStreamState = streamStateCache.value.get(dialogId)
    if (!dialogStreamState?.isStreaming) return

    try {
      await window.electronAPI.chat.stop(dialogId)
      streamStateCache.value.set(dialogId, {
        ...dialogStreamState,
        isStreaming: false
      })
    } catch (error) {
      console.error('停止生成失败:', error)
    }
  }

  /**
   * 清空当前对话的消息
   */
  async function clearMessages(): Promise<boolean> {
    if (!currentDialog.value) return false

    try {
      const response = await window.electronAPI.message.delete(currentDialog.value.id)
      if (response.success) {
        messagesCache.value.set(currentDialog.value.id, [])
        // 更新对话的消息计数
        const index = dialogs.value.findIndex(d => d.id === currentDialog.value!.id)
        if (index !== -1) {
          dialogs.value[index].messageCount = 0
        }
        return true
      }
      return false
    } catch (error) {
      console.error('清空消息失败:', error)
      return false
    }
  }

  /**
   * 清空当前对话
   */
  function clearCurrentDialog(): void {
    if (currentDialog.value) {
      messagesCache.value.delete(currentDialog.value.id)
      streamStateCache.value.delete(currentDialog.value.id)
    }
    currentDialog.value = null
  }

  /**
   * 更新对话标题
   */
  async function updateDialogTitle(dialogId: string, title: string): Promise<boolean> {
    return updateDialog(dialogId, { title })
  }

  /**
   * 清理资源
   */
  function cleanup(): void {
    if (unsubscribeStream) {
      unsubscribeStream()
      unsubscribeStream = null
    }
  }

  /**
   * 更新消息内容
   */
  async function updateMessage(messageId: string, newContent: string): Promise<boolean> {
    try {
      const response = await window.electronAPI.message.update(messageId, newContent)
      if (response.success) {
        // 更新缓存中的消息
        if (currentDialog.value) {
          const dialogMessages = messagesCache.value.get(currentDialog.value.id) || []
          const index = dialogMessages.findIndex(m => m.id === messageId)
          if (index !== -1) {
            dialogMessages[index] = {
              ...dialogMessages[index],
              content: newContent
            }
            messagesCache.value.set(currentDialog.value.id, [...dialogMessages])
          }
        }
        return true
      }
      return false
    } catch (error) {
      console.error('更新消息失败:', error)
      return false
    }
  }

  /**
   * 删除单条消息
   */
  async function deleteMessage(messageId: string): Promise<boolean> {
    try {
      const response = await window.electronAPI.message.deleteSingle(messageId)
      if (response.success) {
        // 从缓存中移除消息
        if (currentDialog.value) {
          const dialogMessages = messagesCache.value.get(currentDialog.value.id) || []
          const filtered = dialogMessages.filter(m => m.id !== messageId)
          messagesCache.value.set(currentDialog.value.id, filtered)

          // 更新对话的消息计数
          const index = dialogs.value.findIndex(d => d.id === currentDialog.value!.id)
          if (index !== -1) {
            dialogs.value[index].messageCount = filtered.length
          }
        }
        return true
      }
      return false
    } catch (error) {
      console.error('删除消息失败:', error)
      return false
    }
  }

  /**
   * 重新生成回答
   * @param userMessageId 用户消息ID
   * @param modelId 可选的新模型ID（格式：providerConfigId::modelId）
   */
  async function regenerateResponse(userMessageId: string, modelId?: string): Promise<boolean> {
    if (!currentDialog.value) return false

    const dialogId = currentDialog.value.id
    const dialogMessages = messagesCache.value.get(dialogId) || []

    // 找到用户消息
    const userMessage = dialogMessages.find(m => m.id === userMessageId)
    if (!userMessage || userMessage.role !== 'user') {
      console.error('未找到用户消息')
      return false
    }

    // 找到该用户消息后面的 AI 回答并删除
    const userMessageIndex = dialogMessages.findIndex(m => m.id === userMessageId)
    let aiMessageId: string | null = null

    // 查找紧随其后的 AI 消息
    for (let i = userMessageIndex + 1; i < dialogMessages.length; i++) {
      if (dialogMessages[i].role === 'assistant') {
        aiMessageId = dialogMessages[i].id
        break
      }
    }

    // 删除旧的 AI 回答
    if (aiMessageId) {
      await deleteMessage(aiMessageId)
    }

    // 解析模型ID
    let newModelId: string | undefined
    let newProviderConfigId: string | undefined
    if (modelId && modelId.includes('::')) {
      const [providerId, mid] = modelId.split('::')
      newProviderConfigId = providerId
      newModelId = mid
    }

    // 重新发送消息
    return sendMessage(userMessage.content, {
      attachments: userMessage.attachments,
      modelId: newModelId,
      providerConfigId: newProviderConfigId
    } as any)
  }

  return {
    // 状态
    dialogs,
    currentDialog,
    messages,
    streamState,
    loading,
    dialogsByRole,
    // 对话管理
    loadDialogs,
    loadDialogsByRole,
    createDialog,
    updateDialog,
    updateDialogTitle,
    deleteDialog,
    selectDialog,
    clearCurrentDialog,
    // 消息管理
    loadMessages,
    sendMessage,
    stopGeneration,
    clearMessages,
    updateMessage,
    deleteMessage,
    regenerateResponse,
    // 工具
    cleanup
  }
})
