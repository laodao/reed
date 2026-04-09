<template>
  <div class="chat-sidebar">
    <!-- 选项卡 -->
    <div class="sidebar-tabs">
      <div
        class="tab-item"
        :class="{ active: currentTab === 'assistants' }"
        @click="$emit('update:currentTab', 'assistants')"
      >
        <el-icon><User /></el-icon>
        <span>助手</span>
      </div>
      <div
        class="tab-item"
        :class="{ active: currentTab === 'topics' }"
        @click="$emit('update:currentTab', 'topics')"
      >
        <el-icon><ChatLineSquare /></el-icon>
        <span>话题</span>
      </div>
    </div>

    <!-- 助手列表 -->
    <div v-if="currentTab === 'assistants'" class="sidebar-content-wrapper">
      <!-- 固定的添加助手按钮 -->
      <div class="add-assistant-fixed" @click="showLibraryPicker = true">
        <el-icon><Plus /></el-icon>
        <span>添加助手</span>
      </div>
      <!-- 可滚动的助手列表 -->
      <div class="sidebar-content">
        <!-- 只显示用户的助手（包含默认助手和自定义助手） -->
        <AssistantCard
          v-for="role in userRoles"
          :key="role.id"
          :role="role"
          :selected="isRoleSelected(role)"
          :deletable="!isDefaultAssistant(role)"
          :editable="true"
          @click="$emit('selectRole', role)"
          @edit="handleEditRole(role)"
          @delete="handleDeleteRole(role)"
        />
      </div>
    </div>

    <!-- 话题列表 -->
    <div v-else class="sidebar-content">
      <div class="sidebar-header">
        <div class="header-info">
          <span class="role-avatar">{{ selectedRole?.avatar || '💬' }}</span>
          <span class="role-name">{{ selectedRole?.name || '默认助手' }}</span>
        </div>
        <el-button type="primary" size="small" round @click="$emit('createDialog')">
          <el-icon><Plus /></el-icon>
          新建
        </el-button>
      </div>

      <div class="topic-list">
        <TopicCard
          v-for="dialog in dialogs"
          :key="dialog.id"
          :dialog="dialog"
          :selected="currentDialog?.id === dialog.id"
          @click="$emit('selectDialog', dialog)"
          @delete="$emit('deleteDialog', dialog.id)"
          @rename="(newTitle) => $emit('renameDialog', dialog.id, newTitle)"
        />

        <el-empty v-if="dialogs.length === 0" description="暂无对话" :image-size="60">
          <el-button type="primary" size="small" @click="$emit('createDialog')">
            创建对话
          </el-button>
        </el-empty>
      </div>
    </div>

    <!-- 助手库选择器 -->
    <AssistantLibraryPicker
      v-model="showLibraryPicker"
      @select="handleSelectTemplate"
      @custom="handleCustomCreate"
    />

    <!-- 助手编辑器对话框 -->
    <AssistantEditor
      v-model="showEditorDialog"
      :role="roleToEdit"
      :template="selectedTemplate"
      @saved="handleRoleSaved"
    />

    <!-- 删除确认对话框 -->
    <el-dialog
      v-model="showDeleteDialog"
      title="删除助手"
      width="400px"
      :close-on-click-modal="false"
    >
      <div class="delete-confirm">
        <el-icon class="warning-icon"><WarningFilled /></el-icon>
        <p class="confirm-text">确定要删除助手「{{ roleToDelete?.name }}」吗？</p>
        <p v-if="deleteDialogCount > 0" class="warning-text">
          该助手关联了 <strong>{{ deleteDialogCount }}</strong> 个话题，删除后话题将一并删除，此操作不可恢复。
        </p>
      </div>
      <template #footer>
        <el-button @click="showDeleteDialog = false">取消</el-button>
        <el-button type="danger" @click="confirmDeleteRole" :loading="deleting">
          确认删除
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Plus, User, ChatLineSquare, WarningFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import AssistantCard from './AssistantCard.vue'
import AssistantEditor from './AssistantEditor.vue'
import AssistantLibraryPicker from './AssistantLibraryPicker.vue'
import TopicCard from './TopicCard.vue'
import type { Role, Dialog, SidebarTab } from '../../../shared/types'
import type { AssistantLibraryTemplate } from '../../../shared/types/assistant-library.types'

// Props
const props = defineProps<{
  currentTab: SidebarTab
  selectedRole: Role | null
  customRoles: Role[]
  dialogs: Dialog[]
  currentDialog: Dialog | null
  getDialogCount: (roleId: string) => Promise<number>
  deleteRole: (roleId: string) => Promise<{ success: boolean; dialogCount: number }>
}>()

// Emits
const emit = defineEmits<{
  (e: 'update:currentTab', tab: SidebarTab): void
  (e: 'selectRole', role: Role): void
  (e: 'selectDialog', dialog: Dialog): void
  (e: 'createDialog', options?: { roleId?: string }): void
  (e: 'deleteDialog', dialogId: string): void
  (e: 'renameDialog', dialogId: string, newTitle: string): void
  (e: 'createRole', request: { name: string; description?: string; systemPrompt?: string; avatar?: string }): void
  (e: 'updateRole', role: Role): void
  (e: 'roleCreated', role: Role): void
}>()

// 默认助手（固定的）
const defaultAssistant: Role = {
  id: 'default-assistant',
  name: '默认助手',
  description: '通用的智能助手，适合日常对话和问答',
  systemPrompt: '你是一个智能助手，能够帮助用户解答各种问题，提供专业、准确、有建设性的回答。',
  avatar: '💬',
  isBuiltin: true,
  createdAt: new Date(),
  updatedAt: new Date()
}

// 用户的助手列表（默认助手 + 自定义助手）
const userRoles = computed(() => {
  return [defaultAssistant, ...props.customRoles]
})

// 判断助手是否被选中（处理默认助手的情况）
function isRoleSelected(role: Role): boolean {
  // 如果选中的是默认助手（id 为 'default-assistant'）或者 selectedRole 为 null 且当前是默认助手
  if (role.id === 'default-assistant') {
    return props.selectedRole?.id === 'default-assistant' || props.selectedRole === null
  }
  return props.selectedRole?.id === role.id
}

// 助手库选择器
const showLibraryPicker = ref(false)
const selectedTemplate = ref<AssistantLibraryTemplate | undefined>(undefined)

// 编辑相关
const showEditorDialog = ref(false)
const roleToEdit = ref<Role | undefined>(undefined)

// 删除相关
const showDeleteDialog = ref(false)
const roleToDelete = ref<Role | null>(null)
const deleteDialogCount = ref(0)
const deleting = ref(false)

// 检查是否是默认助手
function isDefaultAssistant(role: Role): boolean {
  return role.id === 'default-assistant'
}

// 从助手库选择模板
function handleSelectTemplate(template: AssistantLibraryTemplate): void {
  selectedTemplate.value = template
  roleToEdit.value = undefined
  showEditorDialog.value = true
}

// 自定义创建（不选择模板）
function handleCustomCreate(): void {
  selectedTemplate.value = undefined
  roleToEdit.value = undefined
  showEditorDialog.value = true
}

// 编辑角色
function handleEditRole(role: Role): void {
  roleToEdit.value = role
  selectedTemplate.value = undefined
  showEditorDialog.value = true
}

// 角色保存成功
function handleRoleSaved(role: Role): void {
  // 检查是否是新建的角色（不在当前列表中）
  const isNewRole = !userRoles.value.some(r => r.id === role.id)
  if (isNewRole) {
    emit('roleCreated', role)
  } else {
    emit('updateRole', role)
  }
  roleToEdit.value = undefined
  selectedTemplate.value = undefined
}

// 删除角色 - 显示确认对话框
async function handleDeleteRole(role: Role): Promise<void> {
  roleToDelete.value = role
  // 获取关联的对话数量
  deleteDialogCount.value = await props.getDialogCount(role.id)
  showDeleteDialog.value = true
}

// 确认删除 - 实际执行删除操作
async function confirmDeleteRole(): Promise<void> {
  if (!roleToDelete.value) return

  deleting.value = true
  try {
    const result = await props.deleteRole(roleToDelete.value.id)
    if (result?.success) {
      ElMessage.success('助手已删除')
      showDeleteDialog.value = false
      roleToDelete.value = null
    } else {
      ElMessage.error('删除失败')
    }
  } finally {
    deleting.value = false
  }
}
</script>

<style lang="scss" scoped>
.chat-sidebar {
  width: 260px;
  background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
}

.sidebar-tabs {
  display: flex;
  padding: 8px;
  gap: 4px;
  background: #fff;
  border-bottom: 1px solid #e2e8f0;
}

.tab-item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 12px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: #64748b;
  border-radius: 8px;
  transition: all 0.2s ease;

  &:hover {
    background: #f1f5f9;
    color: #475569;
  }

  &.active {
    background: var(--el-color-primary);
    color: #fff;
    box-shadow: 0 2px 8px var(--el-color-primary-light-5);
  }
}

.sidebar-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sidebar-content-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.add-assistant-fixed {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px;
  margin: 12px 12px 0;
  border: 2px dashed #cbd5e1;
  border-radius: 10px;
  cursor: pointer;
  color: #64748b;
  font-size: 13px;
  font-weight: 500;
  background: #fff;
  transition: all 0.2s ease;

  &:hover {
    border-color: var(--el-color-primary);
    color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
  }
}

.add-assistant {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px;
  margin-top: 12px;
  border: 2px dashed #cbd5e1;
  border-radius: 10px;
  cursor: pointer;
  color: #64748b;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s ease;

  &:hover {
    border-color: var(--el-color-primary);
    color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
  }
}

.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding: 8px;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.header-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.role-avatar {
  font-size: 20px;
}

.role-name {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
}

.topic-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.delete-confirm {
  text-align: center;
  padding: 12px 0;

  .warning-icon {
    font-size: 48px;
    color: #f59e0b;
    margin-bottom: 12px;
  }

  .confirm-text {
    font-size: 15px;
    color: #334155;
    margin: 0 0 8px;
  }

  .warning-text {
    font-size: 13px;
    color: #64748b;
    margin: 0;
    background: #fef3c7;
    padding: 10px;
    border-radius: 8px;

    strong {
      color: #d97706;
    }
  }
}
</style>
