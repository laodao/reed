<template>
  <div class="chat-page">
    <!-- 左侧边栏 -->
    <ChatSidebar
      v-model:current-tab="currentTab"
      :selected-role="selectedRole"
      :custom-roles="customRoles"
      :dialogs="currentRoleDialogs"
      :current-dialog="currentDialog"
      :get-dialog-count="getRoleDialogCount"
      :delete-role="deleteRole"
      @select-role="handleSelectRole"
      @select-dialog="handleSelectDialog"
      @create-dialog="handleCreateDialog"
      @delete-dialog="handleDeleteDialog"
      @create-role="handleCreateRole"
      @update-role="handleUpdateRole"
      @role-created="handleRoleCreated"
    />

    <!-- 右侧主区域 -->
    <ChatMain
      v-if="currentDialog"
      :dialog="currentDialog"
      :messages="messages"
      :stream-state="streamState"
      :is-generating="isGenerating"
      @send-message="handleSendMessage"
      @stop-generation="handleStopGeneration"
      @clear-messages="handleClearMessages"
      @update-config="handleUpdateConfig"
    />

    <!-- 空状态 -->
    <div v-else class="empty-state">
      <div class="empty-content">
        <div class="empty-icon">💬</div>
        <h3>开始对话</h3>
        <p>选择一个助手开始新对话，或者从话题列表中选择已有的对话</p>
        <el-button type="primary" round @click="handleCreateDialog">
          <el-icon><Plus /></el-icon>
          新建对话
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import ChatSidebar from '../components/chat/ChatSidebar.vue'
import ChatMain from '../components/chat/ChatMain.vue'
import { useChat } from '../composables/useChat'
import type { Role, Dialog, Message, ContextConfig } from '../../../shared/types'

// 使用 composable
const {
  currentTab,
  selectedRole,
  hasCurrentDialog,
  isGenerating,
  customRoles,
  messages,
  currentDialog,
  currentRoleDialogs,
  streamState,
  loading,
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
  dialogStore,
  roleStore
} = useChat()

// 处理选择角色
function handleSelectRole(role: Role): void {
  selectRole(role)
}

// 处理创建对话
async function handleCreateDialog(options?: { roleId?: string }): Promise<void> {
  const dialog = await createNewDialog(options)
  if (!dialog) {
    ElMessage.error('创建对话失败')
  }
}

// 处理选择对话
async function handleSelectDialog(dialog: Dialog): Promise<void> {
  await selectDialog(dialog)
}

// 处理删除对话
async function handleDeleteDialog(dialogId: string): Promise<void> {
  try {
    await ElMessageBox.confirm('确定要删除这个对话吗？此操作不可恢复。', '删除对话', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    })
    const success = await deleteDialog(dialogId)
    if (success) {
      ElMessage.success('对话已删除')
    } else {
      ElMessage.error('删除失败')
    }
  } catch {
    // 用户取消
  }
}

// 处理发送消息
async function handleSendMessage(
  content: string,
  options?: {
    attachments?: Message['attachments']
    enableWebSearch?: boolean
    enableThinkingChain?: boolean
  }
): Promise<void> {
  const success = await sendMessage(content, options)
  if (!success) {
    ElMessage.error('发送消息失败')
  }
}

// 处理停止生成
async function handleStopGeneration(): Promise<void> {
  await stopGeneration()
}

// 处理清空消息
async function handleClearMessages(): Promise<void> {
  try {
    await ElMessageBox.confirm('确定要清空所有消息吗？此操作不可恢复。', '清空消息', {
      confirmButtonText: '清空',
      cancelButtonText: '取消',
      type: 'warning'
    })
    const success = await clearMessages()
    if (success) {
      ElMessage.success('消息已清空')
    } else {
      ElMessage.error('清空失败')
    }
  } catch {
    // 用户取消
  }
}

// 处理创建角色
async function handleCreateRole(request: {
  name: string
  description?: string
  systemPrompt?: string
  avatar?: string
}): Promise<void> {
  const role = await createCustomRole(request)
  if (role) {
    ElMessage.success('助手创建成功')
  } else {
    ElMessage.error('创建助手失败')
  }
}

// 处理更新角色
async function handleUpdateRole(role: Role): Promise<void> {
  await updateRole(role)
  ElMessage.success('助手已更新')
}

// 处理新建角色完成
function handleRoleCreated(role: Role): void {
  addRoleToList(role)
  // 不显示成功消息，因为 AssistantEditor 已经显示了
}

// 处理更新配置
async function handleUpdateConfig(
  dialogId: string,
  config: {
    modelId?: string
    providerConfigId?: string
    systemPrompt?: string
    contextConfig?: ContextConfig
  }
): Promise<void> {
  console.log('[Chat.handleUpdateConfig] 收到更新请求:', {
    dialogId,
    config,
    currentDialogId: currentDialog.value?.id
  })

  const success = await updateDialogConfig(dialogId, config)
  console.log('[Chat.handleUpdateConfig] 更新结果:', success)
  console.log('[Chat.handleUpdateConfig] 更新后的 currentDialog:', currentDialog.value)

  // 只有非模型选择的配置更新才显示提示
  if (!config.modelId && !config.providerConfigId) {
    if (success) {
      ElMessage.success('配置已更新')
    } else {
      ElMessage.error('更新失败')
    }
  }
}
</script>

<style lang="scss" scoped>
.chat-page {
  height: 100%;
  display: flex;
  background: #f8fafc;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
}

.empty-content {
  text-align: center;
  padding: 40px;

  .empty-icon {
    font-size: 64px;
    margin-bottom: 16px;
  }

  h3 {
    margin: 0 0 8px;
    font-size: 20px;
    font-weight: 600;
    color: #1e293b;
  }

  p {
    margin: 0 0 24px;
    font-size: 14px;
    color: #64748b;
    max-width: 280px;
  }
}
</style>
