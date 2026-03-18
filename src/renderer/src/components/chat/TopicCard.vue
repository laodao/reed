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
    <el-button
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
import { Delete, ChatDotRound } from '@element-plus/icons-vue'
import type { Dialog } from '../../../shared/types'

defineProps<{
  dialog: Dialog
  selected: boolean
}>()

defineEmits<{
  (e: 'click'): void
  (e: 'delete'): void
}>()

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

    .delete-btn {
      opacity: 1;
    }
  }

  &.selected {
    background: var(--el-color-primary-light-9);
    border-color: var(--el-color-primary);
    box-shadow: 0 2px 8px var(--el-color-primary-light-7);
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

.delete-btn {
  opacity: 0;
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  transition: opacity 0.2s ease;
}
</style>
