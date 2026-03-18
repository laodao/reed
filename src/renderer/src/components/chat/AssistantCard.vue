<template>
  <div class="assistant-card" :class="{ selected }" @click="$emit('click')">
    <div class="avatar">{{ role.avatar || '🤖' }}</div>
    <div class="info">
      <div class="name">{{ role.name }}</div>
      <div class="description">{{ role.description || '暂无描述' }}</div>
    </div>
    <el-button
      v-if="deletable && !role.isBuiltin"
      class="delete-btn"
      type="danger"
      size="small"
      circle
      text
      @click.stop="$emit('delete')"
    >
      <el-icon><Delete /></el-icon>
    </el-button>
  </div>
</template>

<script setup lang="ts">
import { Delete } from '@element-plus/icons-vue'
import type { Role } from '../../../shared/types'

defineProps<{
  role: Role
  selected: boolean
  deletable?: boolean
}>()

defineEmits<{
  (e: 'click'): void
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

    .delete-btn {
      opacity: 1;
    }
  }

  &.selected {
    background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
    border-color: #3b82f6;
    box-shadow: 0 2px 8px rgba(59, 130, 246, 0.15);
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

.delete-btn {
  opacity: 0;
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  transition: opacity 0.2s ease;
}
</style>
