<template>
  <div v-if="currentStep >= 0 && visible" class="guide-overlay">
    <!-- 遮罩层 -->
    <div class="guide-mask" @click="skipGuide"></div>

    <!-- 引导提示框 -->
    <div
      v-if="currentGuide"
      class="guide-tooltip"
      :style="tooltipStyle"
    >
      <div class="guide-header">
        <span class="guide-step">{{ currentStep + 1 }}/{{ guides.length }}</span>
        <el-button text size="small" @click="skipGuide">跳过</el-button>
      </div>

      <div class="guide-content">
        <div class="guide-title">{{ currentGuide.title }}</div>
        <div class="guide-description">{{ currentGuide.description }}</div>
      </div>

      <div class="guide-footer">
        <el-button v-if="currentStep > 0" size="small" @click="prevStep">
          上一步
        </el-button>
        <el-button
          v-if="currentStep < guides.length - 1"
          type="primary"
          size="small"
          @click="nextStep"
        >
          下一步
        </el-button>
        <el-button
          v-else
          type="primary"
          size="small"
          @click="finishGuide"
        >
          完成
        </el-button>
      </div>

      <!-- 箭头指示 -->
      <div v-if="currentGuide.position" class="guide-arrow" :class="currentGuide.position"></div>
    </div>

    <!-- 高亮目标元素 -->
    <div
      v-if="currentGuide?.target"
      class="guide-highlight"
      :style="highlightStyle"
    ></div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useGuideStore } from '@/stores/guide'

/**
 * 引导步骤定义
 */
export interface GuideStep {
  target: string       // 目标元素选择器
  title: string        // 标题
  description: string  // 描述
  position?: 'top' | 'bottom' | 'left' | 'right'  // 提示框位置
}

const props = defineProps<{
  guideKey: string      // 引导标识
  guides: GuideStep[]   // 引导步骤
}>()

const emit = defineEmits<{
  finish: []
  skip: []
}>()

const guideStore = useGuideStore()

const visible = ref(true)
const currentStep = ref(-1)
const targetRect = ref<DOMRect | null>(null)

// 当前引导步骤
const currentGuide = computed(() => {
  if (currentStep.value < 0 || currentStep.value >= props.guides.length) {
    return null
  }
  return props.guides[currentStep.value]
})

// 提示框样式
const tooltipStyle = computed(() => {
  if (!currentGuide.value || !targetRect.value) {
    return {}
  }

  const rect = targetRect.value
  const position = currentGuide.value.position || 'bottom'
  const offset = 16

  let top = 0
  let left = 0

  switch (position) {
    case 'top':
      top = rect.top - offset - 150
      left = rect.left + rect.width / 2 - 150
      break
    case 'bottom':
      top = rect.bottom + offset
      left = rect.left + rect.width / 2 - 150
      break
    case 'left':
      top = rect.top + rect.height / 2 - 75
      left = rect.left - offset - 300
      break
    case 'right':
      top = rect.top + rect.height / 2 - 75
      left = rect.right + offset
      break
  }

  // 确保不超出屏幕
  left = Math.max(16, Math.min(left, window.innerWidth - 316))
  top = Math.max(16, Math.min(top, window.innerHeight - 166))

  return {
    top: `${top}px`,
    left: `${left}px`
  }
})

// 高亮样式
const highlightStyle = computed(() => {
  if (!targetRect.value) return {}

  const rect = targetRect.value
  const padding = 4

  return {
    top: `${rect.top - padding}px`,
    left: `${rect.left - padding}px`,
    width: `${rect.width + padding * 2}px`,
    height: `${rect.height + padding * 2}px`
  }
})

/**
 * 开始引导
 */
function startGuide() {
  // 检查是否已完成过此引导
  if (guideStore.isCompleted(props.guideKey)) {
    visible.value = false
    return
  }

  currentStep.value = 0
  updateTargetRect()
}

/**
 * 更新目标元素位置
 */
function updateTargetRect() {
  if (!currentGuide.value) return

  const target = document.querySelector(currentGuide.value.target)
  if (target) {
    targetRect.value = target.getBoundingClientRect()
  }
}

/**
 * 下一步
 */
function nextStep() {
  if (currentStep.value < props.guides.length - 1) {
    currentStep.value++
    updateTargetRect()
  }
}

/**
 * 上一步
 */
function prevStep() {
  if (currentStep.value > 0) {
    currentStep.value--
    updateTargetRect()
  }
}

/**
 * 跳过引导
 */
function skipGuide() {
  guideStore.markCompleted(props.guideKey)
  visible.value = false
  currentStep.value = -1
  emit('skip')
}

/**
 * 完成引导
 */
function finishGuide() {
  guideStore.markCompleted(props.guideKey)
  visible.value = false
  currentStep.value = -1
  emit('finish')
}

// 监听窗口大小变化
function handleResize() {
  updateTargetRect()
}

onMounted(() => {
  startGuide()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
})

// 暴露方法
defineExpose({
  start: startGuide,
  skip: skipGuide
})
</script>

<style scoped lang="scss">
.guide-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 9999;
}

.guide-mask {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
}

.guide-tooltip {
  position: absolute;
  width: 300px;
  background: var(--el-bg-color);
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
  z-index: 10001;
  animation: guide-fade-in 0.3s ease;
}

@keyframes guide-fade-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.guide-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-light);
}

.guide-step {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.guide-content {
  padding: 16px;
}

.guide-title {
  font-size: 16px;
  font-weight: 500;
  margin-bottom: 8px;
}

.guide-description {
  font-size: 14px;
  color: var(--el-text-color-regular);
  line-height: 1.6;
}

.guide-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--el-border-color-light);
}

.guide-highlight {
  position: absolute;
  border: 2px solid var(--el-color-primary);
  border-radius: 4px;
  background: transparent;
  z-index: 10000;
  pointer-events: none;
  animation: highlight-pulse 2s infinite;
}

@keyframes highlight-pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(var(--el-color-primary-rgb), 0.4);
  }
  50% {
    box-shadow: 0 0 0 8px rgba(var(--el-color-primary-rgb), 0);
  }
}

.guide-arrow {
  position: absolute;
  width: 12px;
  height: 12px;
  background: var(--el-bg-color);
  transform: rotate(45deg);

  &.top {
    bottom: -6px;
    left: 50%;
    margin-left: -6px;
  }

  &.bottom {
    top: -6px;
    left: 50%;
    margin-left: -6px;
  }

  &.left {
    right: -6px;
    top: 50%;
    margin-top: -6px;
  }

  &.right {
    left: -6px;
    top: 50%;
    margin-top: -6px;
  }
}
</style>