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
   * 当前对话的消息列表
   */
  const messages = ref<Message[]>([])

  /**
   * 流式状态
   */
  const streamState = ref({
    isStreaming: false,
    messageId: null as string | null,
    content: '',
    error: null as string | null
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
        messages.value = []
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
    console.log('[dialogStore.updateDialog] ========== 开始更新对话 ==========')
    console.log('[dialogStore.updateDialog] 参数 id:', id)
    console.log('[dialogStore.updateDialog] 参数 data:', JSON.stringify(data, null, 2))
    console.log('[dialogStore.updateDialog] data.modelId:', data.modelId)
    console.log('[dialogStore.updateDialog] data.providerConfigId:', data.providerConfigId)
    try {
      // 重要：将响应式对象转换为普通对象，避免 IPC 序列化失败
      // IPC 无法序列化 Vue 响应式对象（Proxy）
      const plainData = JSON.parse(JSON.stringify(data))
      console.log('[dialogStore.updateDialog] 转换后的普通对象:', JSON.stringify(plainData, null, 2))
      console.log('[dialogStore.updateDialog] plainData.modelId:', plainData.modelId)
      console.log('[dialogStore.updateDialog] plainData.providerConfigId:', plainData.providerConfigId)

      console.log('[dialogStore.updateDialog] 准备调用 IPC dialog.update')
      const response = await window.electronAPI.dialog.update(id, plainData)
      console.log('[dialogStore.updateDialog] IPC 响应:', response)
      if (response.success) {
        const index = dialogs.value.findIndex(d => d.id === id)
        if (index !== -1) {
          dialogs.value[index] = { ...dialogs.value[index], ...data }
          console.log('[dialogStore.updateDialog] 更新后的 dialogs[' + index + ']:', dialogs.value[index])
        }
        if (currentDialog.value?.id === id) {
          // 强制创建新对象以触发响应式更新
          // 直接使用传入的值更新，不需要 ?? 运算符
          const updatedDialog = { ...currentDialog.value }
          if (plainData.modelId !== undefined) {
            updatedDialog.modelId = plainData.modelId
          }
          if (plainData.providerConfigId !== undefined) {
            updatedDialog.providerConfigId = plainData.providerConfigId
          }
          if (plainData.systemPrompt !== undefined) {
            updatedDialog.systemPrompt = plainData.systemPrompt
          }
          if (plainData.contextConfig !== undefined) {
            updatedDialog.contextConfig = plainData.contextConfig
          }
          if (plainData.title !== undefined) {
            updatedDialog.title = plainData.title
          }
          currentDialog.value = updatedDialog
          console.log('[dialogStore.updateDialog] 更新后的 currentDialog:', currentDialog.value)
          console.log('[dialogStore.updateDialog] currentDialog.modelId:', currentDialog.value.modelId)
          console.log('[dialogStore.updateDialog] currentDialog.providerConfigId:', currentDialog.value.providerConfigId)
        }
        return true
      }
      return false
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
        if (currentDialog.value?.id === dialogId) {
          currentDialog.value = null
          messages.value = []
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
    await loadMessages(dialog.id)
  }

  // ==================== 消息管理 ====================

  /**
   * 加载消息列表
   */
  async function loadMessages(dialogId: string): Promise<void> {
    try {
      const response = await window.electronAPI.message.list(dialogId)
      if (response.success && response.messages) {
        messages.value = response.messages
      }
    } catch (error) {
      console.error('加载消息列表失败:', error)
      messages.value = []
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
    }
  ): Promise<boolean> {
    console.log('[sendMessage] ========== 开始发送消息 ==========')
    console.log('[sendMessage] 时间戳:', new Date().toISOString())
    console.log('[sendMessage] currentDialog:', currentDialog.value ? {
      id: currentDialog.value.id,
      title: currentDialog.value.title,
      modelId: currentDialog.value.modelId,
      providerConfigId: currentDialog.value.providerConfigId
    } : null)

    if (!currentDialog.value) {
      console.error('[sendMessage] 错误: 没有选中的对话')
      return false
    }

    const dialogId = currentDialog.value.id
    const modelId = currentDialog.value.modelId
    const providerConfigId = currentDialog.value.providerConfigId
    console.log('[sendMessage] 发送参数:', { dialogId, modelId, providerConfigId, content: content.substring(0, 50) })

    // 重置流式状态
    streamState.value = {
      isStreaming: true,
      messageId: null,
      content: '',
      error: null
    }

    // 立即在本地添加用户消息（乐观更新）
    const tempUserMessageId = `temp-user-${Date.now()}`
    const userMessage: Message = {
      id: tempUserMessageId,
      dialogId: currentDialog.value.id,
      role: 'user',
      content,
      attachments: options?.attachments,
      createdAt: new Date()
    }
    messages.value.push(userMessage)

    // 订阅流式事件
    if (unsubscribeStream) {
      unsubscribeStream()
    }
    unsubscribeStream = window.electronAPI.chat.onStream(handleStreamEvent)

    try {
      // 重要：将响应式对象转换为普通对象，避免 IPC 序列化失败
      // 关键：传递内存中的 modelId 和 providerConfigId，不从数据库读取
      const requestData = JSON.parse(JSON.stringify({
        dialogId: currentDialog.value.id,
        content,
        attachments: options?.attachments,
        webSearch: options?.webSearch,
        enableThinkingChain: options?.enableThinkingChain,
        modelId: currentDialog.value.modelId,
        providerConfigId: currentDialog.value.providerConfigId
      }))
      console.log('[sendMessage] 发送请求数据:', requestData)

      // 发送消息请求
      const response = await window.electronAPI.chat.send(requestData)
      console.log('[sendMessage] 收到响应:', response)

      if (!response.success) {
        console.error('[sendMessage] 响应失败:', response.error)
        streamState.value.error = response.error || '发送失败'
        streamState.value.isStreaming = false
        // 移除临时用户消息
        messages.value = messages.value.filter(m => m.id !== tempUserMessageId)
        return false
      }

      // 重新加载消息列表以获取真实的消息 ID
      await loadMessages(currentDialog.value.id)
      return true
    } catch (error: any) {
      console.error('[sendMessage] 捕获异常:', error)
      console.error('[sendMessage] 异常消息:', error.message)
      console.error('[sendMessage] 异常堆栈:', error.stack)
      streamState.value.error = error.message || '发送失败'
      streamState.value.isStreaming = false
      // 移除临时用户消息
      messages.value = messages.value.filter(m => m.id !== tempUserMessageId)
      return false
    }
  }

  /**
   * 处理流式事件
   */
  function handleStreamEvent(event: any, data: StreamEvent): void {
    switch (data.type) {
      case 'start':
        streamState.value.messageId = data.messageId || null
        streamState.value.content = ''
        // 如果有 messageId，确保 AI 消息存在于列表中
        if (data.messageId) {
          const msgIndex = messages.value.findIndex(m => m.id === data.messageId)
          if (msgIndex === -1) {
            // 消息不存在，创建占位消息
            messages.value.push({
              id: data.messageId,
              dialogId: currentDialog.value?.id || '',
              role: 'assistant',
              content: '',
              createdAt: new Date()
            })
          }
        }
        break
      case 'thinking':
        // 思维链事件 - 存储到消息的 metadata 中
        console.log('[handleStreamEvent] 收到思维链事件, messageId:', data.messageId)
        console.log('[handleStreamEvent] 思维链内容长度:', data.thinkingContent?.length || 0)
        console.log('[handleStreamEvent] 思维链内容预览:', data.thinkingContent?.substring(0, 100))
        if (data.messageId) {
          const msgIndex = messages.value.findIndex(m => m.id === data.messageId)
          console.log('[handleStreamEvent] 消息索引:', msgIndex)
          if (msgIndex !== -1) {
            // 更新现有消息的思维链内容
            const existingThinking = messages.value[msgIndex].metadata?.thinkingChain || ''
            console.log('[handleStreamEvent] 已有思维链长度:', existingThinking.length)
            messages.value[msgIndex] = {
              ...messages.value[msgIndex],
              metadata: {
                ...messages.value[msgIndex].metadata,
                thinkingChain: existingThinking + (data.thinkingContent || '')
              }
            }
            console.log('[handleStreamEvent] 更新后思维链长度:', messages.value[msgIndex].metadata?.thinkingChain?.length)
          } else {
            console.warn('[handleStreamEvent] 未找到消息, messageId:', data.messageId)
          }
        }
        break
      case 'delta':
        streamState.value.content += data.content || ''
        // 实时更新消息列表中的 AI 消息
        if (data.messageId) {
          const msgIndex = messages.value.findIndex(m => m.id === data.messageId)
          if (msgIndex !== -1) {
            messages.value[msgIndex].content = streamState.value.content
          }
          // 注意：不再在这里创建新消息，因为在 'start' 事件中已经创建了
        }
        break
      case 'done':
        streamState.value.isStreaming = false
        // 流式完成后重新加载消息以获取完整的 metadata
        if (currentDialog.value) {
          loadMessages(currentDialog.value.id)
        }
        break
      case 'error':
        streamState.value.error = data.error || '未知错误'
        streamState.value.isStreaming = false
        break
    }
  }

  /**
   * 停止生成
   */
  async function stopGeneration(): Promise<void> {
    if (!currentDialog.value || !streamState.value.isStreaming) {
      return
    }

    try {
      await window.electronAPI.chat.stop(currentDialog.value.id)
      streamState.value.isStreaming = false
    } catch (error) {
      console.error('停止生成失败:', error)
    }
  }

  /**
   * 清空当前对话的消息
   */
  async function clearMessages(): Promise<boolean> {
    if (!currentDialog.value) {
      return false
    }

    try {
      const response = await window.electronAPI.message.delete(currentDialog.value.id)
      if (response.success) {
        messages.value = []
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
    currentDialog.value = null
    messages.value = []
    streamState.value = {
      isStreaming: false,
      messageId: null,
      content: '',
      error: null
    }
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
    // 工具
    cleanup
  }
})
