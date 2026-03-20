/**
 * 对话功能 Composable
 * @module composables/useChat
 * @description 封装对话相关的状态和逻辑
 */

import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useDialogStore } from '../stores/dialog'
import { useRoleStore } from '../stores/role'
import type { Dialog, Role, Message, ContextConfig, WebSearchEngine } from '../../../shared/types'

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
   * 当前角色的对话列表
   */
  const currentRoleDialogs = computed(() => {
    if (!selectedRole.value) {
      return dialogStore.dialogs.filter(d => !d.roleId)
    }
    return dialogStore.dialogs.filter(d => d.roleId === selectedRole.value?.id)
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
   */
  async function selectLastDialog(): Promise<void> {
    // 直接从数据库加载所有对话（按 updated_at DESC 排序）
    const response = await window.electronAPI.dialog.list()
    if (!response.success || !response.dialogs || response.dialogs.length === 0) {
      // 没有对话，保持默认状态
      return
    }

    // 列表已经是按 updated_at DESC 排序的，第一个就是最近的对话
    const lastDialog = response.dialogs[0]

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

    // 加载该角色的对话列表（会更新 dialogStore.dialogs）
    await dialogStore.loadDialogsByRole(lastDialog.roleId || null)

    // 切换到话题 tab
    currentTab.value = 'topics'

    // 从更新后的列表中找到该对话（使用 id 匹配，因为对象引用可能不同）
    const dialogToSelect = dialogStore.dialogs.find(d => d.id === lastDialog.id) || lastDialog
    await dialogStore.selectDialog(dialogToSelect)
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
  function selectRole(role: Role): void {
    // 如果选择的是默认助手，设置 selectedRole 为 null（表示没有选择自定义助手）
    // 注意：默认助手的对话在数据库中 roleId 为 null
    if (role.id === 'default-assistant') {
      selectedRole.value = null
      // 切换到话题列表
      currentTab.value = 'topics'
      // 加载没有 roleId 的对话（即默认助手的对话）
      dialogStore.loadDialogsByRole(null)
    } else {
      selectedRole.value = role
      roleStore.selectRole(role)
      // 切换到话题列表
      currentTab.value = 'topics'
      // 加载该角色的对话
      dialogStore.loadDialogsByRole(role.id)
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
        if (response.success && response.configs) {
          const enabledConfigs = response.configs.filter((c: any) => c.isEnabled)
          if (enabledConfigs.length > 0) {
            // 优先使用默认提供商
            const defaultConfig = enabledConfigs.find((c: any) => c.isDefault) || enabledConfigs[0]
            providerConfigId = defaultConfig.id

            // 如果没有指定模型，尝试从提供商配置中获取
            if (!modelId) {
              // 优先使用自定义模型
              if (defaultConfig.customModels && defaultConfig.customModels.length > 0) {
                modelId = defaultConfig.customModels[0].id
              }
              // 然后尝试启用的模型
              else if (defaultConfig.enabledModels && defaultConfig.enabledModels.length > 0) {
                modelId = defaultConfig.enabledModels[0]
              }
              // 最后尝试从模板获取（需要查询模板信息）
              else if (defaultConfig.templateId) {
                // 获取模板列表来查找默认模型
                const templatesResponse = await window.electronAPI.providerTemplate.list()
                if (templatesResponse.success && templatesResponse.templates) {
                  const template = templatesResponse.templates.find((t: any) => t.id === defaultConfig.templateId)
                  if (template && template.models && template.models.length > 0) {
                    modelId = template.models[0].id
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
        engine: WebSearchEngine
      }
      enableThinkingChain?: boolean
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
  async function deleteRole(roleId: string): Promise<{ success: boolean; dialogCount: number }> {
    // 先获取关联的对话数量
    const dialogCount = await roleStore.getDialogCount(roleId)
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

  onUnmounted(() => {
    dialogStore.cleanup()
  })

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
