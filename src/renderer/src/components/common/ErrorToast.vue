<template>
  <Transition name="error-toast">
    <div v-if="visible" class="error-toast" :class="severityClass">
      <div class="error-icon">
        <el-icon v-if="severity === 'error' || severity === 'fatal'"><CircleCloseFilled /></el-icon>
        <el-icon v-else-if="severity === 'warning'"><WarningFilled /></el-icon>
        <el-icon v-else><InfoFilled /></el-icon>
      </div>

      <div class="error-content">
        <div class="error-message">{{ message }}</div>
        <div v-if="details" class="error-details">{{ truncatedDetails }}</div>
      </div>

      <div class="error-actions">
        <el-button
          v-if="recoverable"
          size="small"
          type="primary"
          text
          @click="handleRetry"
        >
          重试
        </el-button>
        <el-button size="small" text @click="handleClose">
          关闭
        </el-button>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { CircleCloseFilled, WarningFilled, InfoFilled } from '@element-plus/icons-vue'

const visible = ref(false)
const message = ref('')
const details = ref('')
const severity = ref<'info' | 'warning' | 'error' | 'fatal'>('error')
const recoverable = ref(false)
const errorCode = ref('')

// 截断的详情
const truncatedDetails = computed(() => {
  if (!details.value) return ''
  return details.value.length > 100
    ? details.value.slice(0, 100) + '...'
    : details.value
})

// 样式类
const severityClass = computed(() => {
  return `severity-${severity.value}`
})

/**
 * 显示错误
 */
function showError(data: any, _event?: any) {
  message.value = data.message || '操作失败'
  details.value = data.details || ''
  severity.value = data.severity || 'error'
  recoverable.value = data.recoverable || false
  errorCode.value = data.code || ''
  visible.value = true

  // 自动关闭
  if (severity.value === 'info' || severity.value === 'warning') {
    setTimeout(() => {
      visible.value = false
    }, 5000)
  }
}

/**
 * 处理重试
 */
function handleRetry() {
  window.electronAPI?.invoke('error:retry', { code: errorCode.value })
  visible.value = false
}

/**
 * 处理关闭
 */
function handleClose() {
  visible.value = false
}

// 监听错误事件
let unsubscribe: (() => void) | null = null

onMounted(() => {
  if (window.electronAPI?.onError) {
    unsubscribe = window.electronAPI.onError(showError)
  }
})

onUnmounted(() => {
  if (unsubscribe) {
    unsubscribe()
  }
})
</script>

<style scoped lang="scss">
.error-toast {
  position: fixed;
  top: 20px;
  right: 20px;
  max-width: 400px;
  padding: 16px;
  border-radius: 8px;
  background: var(--el-bg-color);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  display: flex;
  align-items: flex-start;
  gap: 12px;
  z-index: 10000;

  &.severity-info {
    border-left: 4px solid var(--el-color-info);
  }

  &.severity-warning {
    border-left: 4px solid var(--el-color-warning);
  }

  &.severity-error {
    border-left: 4px solid var(--el-color-error);
  }

  &.severity-fatal {
    border-left: 4px solid var(--el-color-danger);
  }
}

.error-icon {
  flex-shrink: 0;
  font-size: 24px;

  .severity-info & {
    color: var(--el-color-info);
  }

  .severity-warning & {
    color: var(--el-color-warning);
  }

  .severity-error &,
  .severity-fatal & {
    color: var(--el-color-error);
  }
}

.error-content {
  flex: 1;
  min-width: 0;
}

.error-message {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  margin-bottom: 4px;
}

.error-details {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  word-break: break-all;
}

.error-actions {
  flex-shrink: 0;
  display: flex;
  gap: 8px;
}

// 过渡动画
.error-toast-enter-active,
.error-toast-leave-active {
  transition: all 0.3s ease;
}

.error-toast-enter-from {
  opacity: 0;
  transform: translateX(100%);
}

.error-toast-leave-to {
  opacity: 0;
  transform: translateX(100%);
}
</style>