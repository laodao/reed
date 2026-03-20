<template>
  <div class="topic-card" :class="{ selected }" @click="$emit('click')">
    <div class="topic-icon">💬</div>
    <div class="topic-info">
      <div class="topic-title">{{ dialog.title }}</div>
      <div class="topic-meta">
        <span class="meta-item">
          <el-icon><ChatDotRound /></el-icon>
          {{ dialog.messageCount }}
        </span>
        <span class="meta-divider">·</span>
        <span class="meta-item">{{ formatTime(dialog.updatedAt) }}</span>
      </div>
    </div>
    <!-- 操作按钮 -->
    <el-dropdown trigger="click" @command="handleCommand" @click.stop>
      <el-button
        class="action-btn"
        type="info"
        size="small"
        circle
        text
        @click.stop
      >
        <el-icon><More /></el-icon>
      </el-button>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item command="rename">
            <el-icon><Edit /></el-icon>
            重命名
          </el-dropdown-item>
          <el-dropdown-item command="delete" divided>
            <el-icon><Delete /></el-icon>
            删除
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>

    <!-- 重命名对话框 -->
    <el-dialog
      v-model="showRenameDialog"
      title="重命名话题"
      width="400px"
      :close-on-click-modal="false"
      append-to-body
    >
      <el-input
        v-model="newTitle"
        placeholder="请输入新的话题名称"
        maxlength="50"
        show-word-limit
        @keyup.enter="confirmRename"
      />
      <template #footer>
        <el-button @click="showRenameDialog = false">取消</el-button>
        <el-button type="primary" @click="confirmRename">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Delete, ChatDotRound, More, Edit } from '@element-plus/icons-vue'
import type { Dialog } from '../../../shared/types'

const props = defineProps<{
  dialog: Dialog
  selected: boolean
}>()

const emit = defineEmits<{
  (e: 'click'): void
  (e: 'delete'): void
  (e: 'rename', newTitle: string): void
}>()

// 重命名对话框
const showRenameDialog = ref(false)
const newTitle = ref('')

// 格式化时间
function formatTime(date: Date | string): string {
  const d = new Date(date)
  const now = new Date()
  const diff = now.getTime() - d.getTime()

  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`

  return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

// 处理下拉菜单命令
function handleCommand(command: string): void {
  if (command === 'delete') {
    emit('delete')
  } else if (command === 'rename') {
    newTitle.value = props.dialog.title
    showRenameDialog.value = true
  }
}

// 确认重命名
function confirmRename(): void {
  if (newTitle.value.trim()) {
    emit('rename', newTitle.value.trim())
    showRenameDialog.value = false
  }
}
</script>

<style lang="scss" scoped>
.topic-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  background: #fff;
  border: 1px solid transparent;

  &:hover {
    background: #f8fafc;
    border-color: #e2e8f0;

    .delete-btn,
    .action-btn {
      opacity: 1;
    }
  }

  &.selected {
    background: var(--el-color-primary-light-9);
    border-color: var(--el-color-primary);
    box-shadow: 0 2px 8px var(--el-color-primary-light-7);

    .delete-btn,
    .action-btn {
      opacity: 1;
    }
  }
}

.topic-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
  border-radius: 8px;
  flex-shrink: 0;
}

.topic-info {
  flex: 1;
  min-width: 0;
}

.topic-title {
  font-size: 13px;
  font-weight: 500;
  color: #1e293b;
  margin-bottom: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.topic-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #94a3b8;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 2px;

  .el-icon {
    font-size: 12px;
  }
}

.meta-divider {
  color: #cbd5e1;
}

.delete-btn,
.action-btn {
  opacity: 0;
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  transition: opacity 0.2s ease;
}
</style>
