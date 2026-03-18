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
    <div v-if="currentTab === 'assistants'" class="sidebar-content">
      <div class="section-header">
        <span class="section-title">内置助手</span>
      </div>
      <AssistantCard
        v-for="role in builtinRoles"
        :key="role.id"
        :role="role"
        :selected="selectedRole?.id === role.id"
        @click="$emit('selectRole', role)"
      />

      <div v-if="customRoles.length > 0" class="section-header" style="margin-top: 16px;">
        <span class="section-title">自定义助手</span>
      </div>
      <AssistantCard
        v-for="role in customRoles"
        :key="role.id"
        :role="role"
        :selected="selectedRole?.id === role.id"
        :deletable="true"
        @click="$emit('selectRole', role)"
        @delete="handleDeleteRole(role)"
      />

      <div class="add-assistant" @click="showAddDialog = true">
        <el-icon><Plus /></el-icon>
        <span>添加自定义助手</span>
      </div>
    </div>

    <!-- 话题列表 -->
    <div v-else class="sidebar-content">
      <div class="sidebar-header">
        <div class="header-info">
          <span class="role-avatar">{{ selectedRole?.avatar || '💬' }}</span>
          <span class="role-name">{{ selectedRole?.name || '所有话题' }}</span>
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
        />

        <el-empty v-if="dialogs.length === 0" description="暂无对话" :image-size="60">
          <el-button type="primary" size="small" @click="$emit('createDialog')">
            创建对话
          </el-button>
        </el-empty>
      </div>
    </div>

    <!-- 添加助手对话框 -->
    <el-dialog
      v-model="showAddDialog"
      title="添加自定义助手"
      width="440px"
      :close-on-click-modal="false"
    >
      <el-form :model="newRoleForm" label-width="80px" size="default">
        <el-form-item label="名称" required>
          <el-input v-model="newRoleForm.name" placeholder="请输入助手名称" maxlength="20" show-word-limit />
        </el-form-item>
        <el-form-item label="描述">
          <el-input
            v-model="newRoleForm.description"
            type="textarea"
            :rows="2"
            placeholder="请输入助手描述"
            maxlength="100"
            show-word-limit
          />
        </el-form-item>
        <el-form-item label="系统提示">
          <el-input
            v-model="newRoleForm.systemPrompt"
            type="textarea"
            :rows="4"
            placeholder="请输入系统提示词，定义助手的角色和行为"
          />
        </el-form-item>
        <el-form-item label="图标">
          <div class="avatar-picker">
            <div
              v-for="emoji in avatarOptions"
              :key="emoji"
              class="avatar-option"
              :class="{ selected: newRoleForm.avatar === emoji }"
              @click="newRoleForm.avatar = emoji"
            >
              {{ emoji }}
            </div>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddDialog = false">取消</el-button>
        <el-button type="primary" @click="handleCreateRole" :disabled="!newRoleForm.name.trim()">
          创建
        </el-button>
      </template>
    </el-dialog>

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
import { ref } from 'vue'
import { Plus, User, ChatLineSquare, WarningFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import AssistantCard from './AssistantCard.vue'
import TopicCard from './TopicCard.vue'
import type { Role, Dialog, SidebarTab } from '../../../shared/types'

// Props
defineProps<{
  currentTab: SidebarTab
  selectedRole: Role | null
  builtinRoles: Role[]
  customRoles: Role[]
  dialogs: Dialog[]
  currentDialog: Dialog | null
}>()

// Emits
const emit = defineEmits<{
  (e: 'update:currentTab', tab: SidebarTab): void
  (e: 'selectRole', role: Role): void
  (e: 'selectDialog', dialog: Dialog): void
  (e: 'createDialog', options?: { roleId?: string }): void
  (e: 'deleteDialog', dialogId: string): void
  (e: 'createRole', request: { name: string; description?: string; systemPrompt?: string; avatar?: string }): void
  (e: 'deleteRole', roleId: string): Promise<{ success: boolean; dialogCount: number }>
}>()

// 新角色表单
const showAddDialog = ref(false)
const newRoleForm = ref({
  name: '',
  description: '',
  systemPrompt: '',
  avatar: '🤖'
})

// 头像选项
const avatarOptions = ['🤖', '🌐', '💻', '✍️', '📚', '🎨', '🎵', '🔬', '💼', '🎮', '🏥', '⚖️']

// 删除相关
const showDeleteDialog = ref(false)
const roleToDelete = ref<Role | null>(null)
const deleteDialogCount = ref(0)
const deleting = ref(false)

// 创建角色
function handleCreateRole(): void {
  if (!newRoleForm.value.name.trim()) {
    ElMessage.warning('请输入助手名称')
    return
  }
  emit('createRole', { ...newRoleForm.value })
  showAddDialog.value = false
  newRoleForm.value = {
    name: '',
    description: '',
    systemPrompt: '',
    avatar: '🤖'
  }
}

// 删除角色
async function handleDeleteRole(role: Role): Promise<void> {
  roleToDelete.value = role
  // 先获取关联的对话数量
  const result = await emit('deleteRole', role.id)
  deleteDialogCount.value = result?.dialogCount || 0
  showDeleteDialog.value = true
}

// 确认删除
async function confirmDeleteRole(): Promise<void> {
  if (!roleToDelete.value) return

  deleting.value = true
  try {
    const result = await emit('deleteRole', roleToDelete.value.id)
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
    background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
    color: #fff;
    box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
  }
}

.sidebar-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.section-header {
  margin-bottom: 8px;
  padding: 0 4px;
}

.section-title {
  font-size: 11px;
  font-weight: 600;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.5px;
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
    border-color: #3b82f6;
    color: #3b82f6;
    background: rgba(59, 130, 246, 0.05);
  }
}

.avatar-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.avatar-option {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    border-color: #3b82f6;
    transform: scale(1.1);
  }

  &.selected {
    border-color: #3b82f6;
    background: rgba(59, 130, 246, 0.1);
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
  }
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
