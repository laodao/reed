<template>
  <div class="assistant-card" :class="{ selected }" @click="$emit('click')">
    <div class="avatar">{{ role.avatar || '🤖' }}</div>
    <div class="info">
      <div class="name">{{ role.name }}</div>
      <div class="description">{{ role.description || '暂无描述' }}</div>
    </div>
    <!-- 操作菜单 -->
    <el-dropdown
      v-if="editable || (deletable && !role.isBuiltin)"
      trigger="click"
      placement="bottom-end"
      @click.stop
    >
      <el-button
        class="action-btn"
        type="primary"
        size="small"
        circle
        text
        @click.stop
      >
        <el-icon><MoreFilled /></el-icon>
      </el-button>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item v-if="editable" @click="$emit('edit')">
            <el-icon><Edit /></el-icon>
            <span>编辑</span>
          </el-dropdown-item>
          <el-dropdown-item
            v-if="deletable && !role.isBuiltin"
            divided
            @click="$emit('delete')"
          >
            <el-icon class="delete-icon"><Delete /></el-icon>
            <span class="delete-text">删除</span>
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>

<script setup lang="ts">
import { Delete, Edit, MoreFilled } from '@element-plus/icons-vue'
import type { Role } from '../../../shared/types'

defineProps<{
  role: Role
  selected: boolean
  deletable?: boolean
  editable?: boolean
}>()

defineEmits<{
  (e: 'click'): void
  (e: 'edit'): void
  (e: 'delete'): void
}>()
</script>

<style lang="scss" scoped>
.assistant-card {
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

    .action-btn {
      opacity: 1;
    }
  }

  &.selected {
    background: var(--el-color-primary-light-9);
    border-color: var(--el-color-primary);
    box-shadow: 0 2px 8px var(--el-color-primary-light-7);
  }
}

.avatar {
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
  border-radius: 10px;
  flex-shrink: 0;
}

.info {
  flex: 1;
  min-width: 0;
}

.name {
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.description {
  font-size: 11px;
  color: #64748b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.action-btn {
  opacity: 0;
  flex-shrink: 0;
  transition: opacity 0.2s ease;
}

.delete-icon {
  color: #f56c6c;
}

.delete-text {
  color: #f56c6c;
}
</style>
