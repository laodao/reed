/**
 * 对话功能 Composable
 * @module composables/useChat
 * @description 封装对话相关的状态和逻辑
 */

import { ref, computed, onMounted } from 'vue'
import { useDialogStore } from '../stores/dialog'
import { useRoleStore } from '../stores/role'
import type { Dialog, Role, Message, ContextConfig } from '../../../shared/types'

/**
 * 侧边栏选项卡类型
 */
export type SidebarTab = 'assistants' | 'topics'

/**
 * 对话功能 Composable
 */
export function useChat() {
  const dialogStore = useDialogStore()
  const roleStore = useRoleStore()

  // ==================== 侧边栏状态 ====================

  /**
   * 当前选项卡
   */
  const currentTab = ref<SidebarTab>('assistants')

  /**
   * 选中的角色（用于创建新对话）
   */
  const selectedRole = ref<Role | null>(null)

  // ==================== 计算属性 ====================

  /**
   * 是否有选中的对话
   */
  const hasCurrentDialog = computed(() => !!dialogStore.currentDialog)

  /**
   * 是否正在生成
   */
  const isGenerating = computed(() => dialogStore.streamState.isStreaming)

  /**
   * 内置角色列表
   */
  const builtinRoles = computed(() => roleStore.builtinRoles)

  /**
   * 自定义角色列表
   */
  const customRoles = computed(() => roleStore.customRoles)

  /**
   * 当前对话的消息列表
   */
  const messages = computed(() => dialogStore.messages)

  /**
   * 当前对话
   */
  const currentDialog = computed(() => dialogStore.currentDialog)

  /**
   * 当前角色的对话列表（Agent 会话是独立功能，始终排除）
   */
  const currentRoleDialogs = computed(() => {
    if (!selectedRole.value) {
      return dialogStore.dialogs.filter(d => !d.roleId && !d.agentEnabled)
    }
    return dialogStore.dialogs.filter(d => d.roleId === selectedRole.value?.id && !d.agentEnabled)
  })

  /**
   * 流式状态
   */
  const streamState = computed(() => dialogStore.streamState)

  /**
   * 加载状态
   */
  const loading = computed(() => dialogStore.loading || roleStore.loading)

  // ==================== 方法 ====================

  /**
   * 初始化
   */
  async function initialize(): Promise<void> {
    await Promise.all([
      roleStore.loadRoles(),
      dialogStore.loadDialogs()
    ])

    // 初始化完成后，自动选择最后一个对话
    await selectLastDialog()
  }

  /**
   * 选择最后一个对话
   * 注意：不再重复调用 dialog.list() / loadDialogsByRole()——initialize() 已通过
   * dialogStore.loadDialogs() 拿到全量列表（按 updated_at DESC），直接复用即可；
   * 侧边栏话题列表由 currentRoleDialogs computed 按选中角色客户端过滤，无需再按角色回源。
   */
  async function selectLastDialog(): Promise<void> {
    // 全量列表第一个即最近对话（loadDialogs 已按 updated_at DESC 排序）
    const lastDialog = dialogStore.dialogs[0]
    if (!lastDialog) {
      // 没有对话，保持默认状态
      return
    }

    // 根据对话的 roleId 找到对应的助手并设置 selectedRole
    if (lastDialog.roleId) {
      const allRoles = [...roleStore.builtinRoles, ...roleStore.customRoles]
      const role = allRoles.find(r => r.id === lastDialog.roleId)
      if (role) {
        selectedRole.value = role
        roleStore.selectRole(role)
      } else {
        // 找不到对应的角色，保持 selectedRole 为 null
        selectedRole.value = null
      }
    } else {
      // 没有roleId，表示是默认助手的对话
      selectedRole.value = null
    }

    // 切换到话题 tab
    currentTab.value = 'topics'

    // 选中最近对话（消息按需从数据库加载）
    await dialogStore.selectDialog(lastDialog)
  }

  /**
   * 切换选项卡
   */
  function switchTab(tab: SidebarTab): void {
    currentTab.value = tab
  }

  /**
   * 选择角色
   */
  async function selectRole(role: Role): Promise<void> {
    // 如果选择的是默认助手，设置 selectedRole 为 null（表示没有选择自定义助手）
    // 注意：默认助手的对话在数据库中 roleId 为 null
    if (role.id === 'default-assistant') {
      selectedRole.value = null
      // 切换到话题列表
      currentTab.value = 'topics'
      // 加载没有 roleId 的对话（即默认助手的对话）
      await dialogStore.loadDialogsByRole(null)
    } else {
      selectedRole.value = role
      roleStore.selectRole(role)
      // 切换到话题列表
      currentTab.value = 'topics'
      // 加载该角色的对话
      await dialogStore.loadDialogsByRole(role.id)
    }

    // 自动选中该助手的最后一个对话（列表已按 updated_at DESC 排序）
    if (dialogStore.dialogs.length > 0) {
      const lastDialog = dialogStore.dialogs[0]
      await dialogStore.selectDialog(lastDialog)
    } else {
      // 没有对话，清空当前对话
      dialogStore.clearCurrentDialog()
    }
  }

  /**
   * 创建新对话
   */
  async function createNewDialog(options?: {
    roleId?: string
    modelId?: string
    providerConfigId?: string
    systemPrompt?: string
  }): Promise<Dialog | null> {
    try {
      // 获取默认提供商配置
      let providerConfigId = options?.providerConfigId
      let modelId = options?.modelId

      if (!providerConfigId) {
        // 获取提供商配置列表
        const response = await window.electronAPI.providerConfig.list()
        if (response.success && response.data) {
          const enabledConfigs = response.data.filter((c: any) => c.runtimeUsable ?? c.isEnabled)
          if (enabledConfigs.length > 0) {
            // 优先使用默认提供商
            const defaultConfig = enabledConfigs.find((c: any) => c.isDefault) || enabledConfigs[0]
            providerConfigId = defaultConfig.id

            // 如果没有指定模型，尝试从提供商配置中获取
            if (!modelId) {
              // 辅助函数：判断模型类型是否为文本类型
              const isTextModelType = (type: string | undefined): boolean => {
                return type === undefined || type === 'text' || type === 'multimodal'
              }

              // 使用 models 字段
              if (defaultConfig.models && defaultConfig.models.length > 0) {
                const textModel = defaultConfig.models.find((m: any) => isTextModelType(m.type))
                if (textModel) {
                  modelId = textModel.id
                }
              }
              // 如果 models 为空，从模板获取
              else if (defaultConfig.templateId) {
                const templatesResponse = await window.electronAPI.providerTemplate.list()
                if (templatesResponse.success && templatesResponse.templates) {
                  const template = templatesResponse.templates.find((t: any) => t.id === defaultConfig.templateId)
                  if (template && template.models && template.models.length > 0) {
                    const textModel = template.models.find((m: any) => isTextModelType(m.type))
                    if (textModel) {
                      modelId = textModel.id
                    }
                  }
                }
              }
            }
          }
        }
      }

      // 如果还是没有模型，使用通用默认值（但这可能导致错误，需要用户配置提供商）
      if (!modelId) {
        console.warn('创建对话时未找到可用模型，请检查提供商配置')
        modelId = 'deepseek-chat' // 使用一个更通用的默认值
      }

      // 确定 roleId：如果 selectedRole 是自定义助手，使用其 id；否则为 undefined（默认助手）
      // 注意：不要使用 options?.roleId，因为新建按钮不会传递这个参数
      const roleId = selectedRole.value?.id || undefined

      const dialog = await dialogStore.createDialog({
        title: '新对话',
        modelId,
        providerConfigId,
        roleId,
        systemPrompt: options?.systemPrompt || selectedRole.value?.systemPrompt
      })

      if (dialog) {
        currentTab.value = 'topics'
        // 创建对话后，重新加载当前角色的对话列表以确保新对话显示
        // 使用 dialog.roleId 而不是 selectedRole.value?.id，因为数据库可能返回 null
        await dialogStore.loadDialogsByRole(dialog.roleId || null)
      }

      return dialog
    } catch (error) {
      console.error('创建对话失败:', error)
      return null
    }
  }

  /**
   * 选择对话
   */
  async function selectDialog(dialog: Dialog): Promise<void> {
    await dialogStore.selectDialog(dialog)
  }

  /**
   * 删除对话
   */
  async function deleteDialog(dialogId: string): Promise<boolean> {
    return await dialogStore.deleteDialog(dialogId)
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
        engine: string
        configId?: string
      }
      enableThinkingChain?: boolean
      knowledgeBaseIds?: string[]
    }
  ): Promise<boolean> {
    return await dialogStore.sendMessage(content, options)
  }

  /**
   * 停止生成
   */
  async function stopGeneration(): Promise<void> {
    await dialogStore.stopGeneration()
  }

  /**
   * 清空当前对话
   */
  async function clearMessages(): Promise<boolean> {
    return await dialogStore.clearMessages()
  }

  /**
   * 创建自定义角色
   */
  async function createCustomRole(request: {
    name: string
    description?: string
    systemPrompt?: string
    avatar?: string
  }): Promise<Role | null> {
    return await roleStore.createRole(request)
  }

  /**
   * 更新角色
   */
  async function updateRole(role: Role): Promise<void> {
    await roleStore.updateRoleInList(role)
  }

  /**
   * 添加新角色到列表
   */
  function addRoleToList(role: Role): void {
    roleStore.addRoleToList(role)
  }

  /**
   * 删除角色
   */
  async function deleteRole(roleId: string): Promise<{ success: boolean }> {
    // 执行删除
    const result = await roleStore.deleteRole(roleId)

    if (result.success) {
      // 刷新对话列表
      await dialogStore.loadDialogs()
    }

    return result
  }

  /**
   * 获取角色关联的对话数量
   */
  async function getRoleDialogCount(roleId: string): Promise<number> {
    return await roleStore.getDialogCount(roleId)
  }

  /**
   * 更新对话配置
   */
  async function updateDialogConfig(
    dialogId: string,
    config: {
      modelId?: string
      providerConfigId?: string
      systemPrompt?: string
      contextConfig?: ContextConfig
      knowledgeBaseIds?: string[]
    }
  ): Promise<boolean> {
    console.log('[useChat.updateDialogConfig] 开始更新:', { dialogId, config })
    const result = await dialogStore.updateDialog(dialogId, config)
    console.log('[useChat.updateDialogConfig] 更新结果:', result)
    return result
  }

  // ==================== 生命周期 ====================

  onMounted(() => {
    initialize()
  })

  // 注意：不在这里调用 cleanup()，因为使用了 keep-alive
  // 流式响应需要在后台继续进行，切换页面不应该中断

  return {
    // 状态
    currentTab,
    selectedRole,
    hasCurrentDialog,
    isGenerating,
    builtinRoles,
    customRoles,
    messages,
    currentDialog,
    currentRoleDialogs,
    streamState,
    loading,

    // 方法
    initialize,
    switchTab,
    selectRole,
    createNewDialog,
    selectDialog,
    deleteDialog,
    sendMessage,
    stopGeneration,
    clearMessages,
    createCustomRole,
    updateRole,
    addRoleToList,
    deleteRole,
    getRoleDialogCount,
    updateDialogConfig,

    // Store 引用
    dialogStore,
    roleStore
  }
}
