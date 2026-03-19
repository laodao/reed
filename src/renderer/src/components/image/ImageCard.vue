<template>
  <div
    class="image-card"
    :class="{ selected, 'is-loading': loading }"
    @click="handleClick"
  >
    <!-- 图像缩略图 -->
    <div class="card-thumbnail">
      <el-image
        :src="imageUrl"
        :alt="image?.prompt || '生成的图像'"
        fit="cover"
        lazy
        class="thumbnail-image"
      >
        <template #error>
          <div class="thumbnail-error">
            <el-icon><Picture /></el-icon>
            <span>加载失败</span>
          </div>
        </template>
        <template #placeholder>
          <div class="thumbnail-loading">
            <el-icon class="is-loading"><Loading /></el-icon>
          </div>
        </template>
      </el-image>

      <!-- 状态标记 -->
      <div v-if="statusBadge" class="status-indicator" :class="statusBadge.type">
        <el-icon v-if="statusBadge.icon"><component :is="statusBadge.icon" /></el-icon>
        <span>{{ statusBadge.text }}</span>
      </div>

      <!-- 收藏标记 -->
      <div v-if="image?.favorite" class="favorite-indicator">
        <el-icon><StarFilled /></el-icon>
      </div>

      <!-- 悬停遮罩 -->
      <div v-if="showOverlay" class="card-overlay">
        <el-button
          v-if="showActions"
          type="primary"
          :icon="View"
          circle
          size="small"
          @click.stop="handleView"
        />
        <el-button
          v-if="showActions && image?.status === 'completed'"
          :type="image.favorite ? 'warning' : 'default'"
          :icon="image.favorite ? StarFilled : Star"
          circle
          size="small"
          @click.stop="handleToggleFavorite"
        />
        <el-button
          v-if="showActions && showDelete"
          type="danger"
          :icon="Delete"
          circle
          size="small"
          @click.stop="handleDelete"
        />
      </div>
    </div>

    <!-- 图像信息 -->
    <div v-if="showInfo" class="card-info">
      <!-- 提示词预览 -->
      <div v-if="image?.prompt" class="info-prompt" :title="image.prompt">
        {{ truncateText(image.prompt, maxPromptLength) }}
      </div>

      <!-- 元信息 -->
      <div class="info-meta">
        <span v-if="image?.width && image?.height" class="meta-item">
          <el-icon><Grid /></el-icon>
          {{ image.width }}×{{ image.height }}
        </span>
        <span v-if="image?.createdAt" class="meta-item">
          <el-icon><Clock /></el-icon>
          {{ formatTime(image.createdAt) }}
        </span>
      </div>

      <!-- 风格和质量标签 -->
      <div v-if="showTags" class="info-tags">
        <el-tag v-if="image?.style" size="small" type="info">
          {{ getStyleLabel(image.style) }}
        </el-tag>
        <el-tag v-if="image?.quality" size="small" type="success">
          {{ getQualityLabel(image.quality) }}
        </el-tag>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  Picture,
  Loading,
  Star,
  StarFilled,
  Delete,
  View,
  Grid,
  Clock,
  WarningFilled,
  CircleCheckFilled
} from '@element-plus/icons-vue'
import type { ImageRecord } from '../../../shared/types/image.types'

/**
 * Props 定义
 */
interface Props {
  /** 图像记录 */
  image?: ImageRecord | null
  /** 是否选中 */
  selected?: boolean
  /** 是否显示信息区域 */
  showInfo?: boolean
  /** 是否显示操作按钮 */
  showActions?: boolean
  /** 是否显示删除按钮 */
  showDelete?: boolean
  /** 是否显示标签 */
  showTags?: boolean
  /** 最大提示词长度 */
  maxPromptLength?: number
  /** 自定义图像 URL */
  customImageUrl?: string
  /** 加载状态 */
  loading?: boolean
}

/**
 * Emits 定义
 */
interface Emits {
  /** 点击事件 */
  (e: 'click', image: ImageRecord): void
  /** 查看事件 */
  (e: 'view', image: ImageRecord): void
  /** 收藏切换事件 */
  (e: 'favorite', image: ImageRecord): void
  /** 删除事件 */
  (e: 'delete', image: ImageRecord): void
}

const props = withDefaults(defineProps<Props>(), {
  selected: false,
  showInfo: true,
  showActions: true,
  showDelete: true,
  showTags: false,
  maxPromptLength: 50,
  loading: false
})

const emit = defineEmits<Emits>()

// 悬停状态
const isHovered = ref(false)

// ==================== 计算属性 ====================

/** 图像 URL */
const imageUrl = computed(() => {
  if (props.customImageUrl) return props.customImageUrl
  if (props.image?.imageUrl) return props.image.imageUrl
  if (props.image?.filePath) return `file://${props.image.filePath}`
  return ''
})

/** 是否显示悬停遮罩 */
const showOverlay = computed(() => {
  return isHovered.value && props.showActions && props.image
})

/** 状态标记 */
const statusBadge = computed(() => {
  if (!props.image) return null

  switch (props.image.status) {
    case 'pending':
      return {
        type: 'pending',
        icon: Loading,
        text: '生成中'
      }
    case 'failed':
      return {
        type: 'failed',
        icon: WarningFilled,
        text: '失败'
      }
    case 'completed':
      return null
    default:
      return null
  }
})

// ==================== 方法 ====================

/**
 * 处理点击
 */
function handleClick(): void {
  if (props.image) {
    emit('click', props.image)
  }
}

/**
 * 处理查看
 */
function handleView(): void {
  if (props.image) {
    emit('view', props.image)
  }
}

/**
 * 处理收藏切换
 */
function handleToggleFavorite(): void {
  if (props.image) {
    emit('favorite', props.image)
  }
}

/**
 * 处理删除
 */
function handleDelete(): void {
  if (props.image) {
    emit('delete', props.image)
  }
}

/**
 * 截断文本
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength) + '...'
}

/**
 * 格式化时间
 */
function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diff = now.getTime() - d.getTime()

  // 一小时内
  if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000)
    return minutes <= 1 ? '刚刚' : `${minutes}分钟前`
  }

  // 今天
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }

  // 昨天
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) {
    return '昨天'
  }

  // 一周内
  if (diff < 7 * 24 * 3600000) {
    const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    return days[d.getDay()]
  }

  // 更早
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

/**
 * 获取风格标签
 */
function getStyleLabel(style: string): string {
  const styleMap: Record<string, string> = {
    realistic: '写实',
    anime: '动漫',
    oil_painting: '油画',
    watercolor: '水彩',
    sketch: '素描',
    '3d_render': '3D渲染'
  }
  return styleMap[style] || style
}

/**
 * 获取质量标签
 */
function getQualityLabel(quality: string): string {
  const qualityMap: Record<string, string> = {
    standard: '标准',
    hd: '高清'
  }
  return qualityMap[quality] || quality
}
</script>

<style lang="scss" scoped>
.image-card {
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  background: #ffffff;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.3s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  }

  &.selected {
    border-color: var(--el-color-primary);
    box-shadow: 0 4px 16px rgba(64, 158, 255, 0.25);
  }

  &.is-loading {
    opacity: 0.6;
    pointer-events: none;
  }
}

.card-thumbnail {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  overflow: hidden;
  background: linear-gradient(135deg, #f5f7fa 0%, #e4e7ed 100%);
}

.thumbnail-image {
  width: 100%;
  height: 100%;
}

.thumbnail-error,
.thumbnail-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: var(--el-text-color-placeholder);

  .el-icon {
    font-size: 32px;
  }

  span {
    margin-top: 8px;
    font-size: 12px;
  }
}

.status-indicator {
  position: absolute;
  top: 8px;
  left: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;

  &.pending {
    background: rgba(230, 162, 60, 0.9);
    color: #ffffff;

    .el-icon {
      animation: spin 1s linear infinite;
    }
  }

  &.failed {
    background: rgba(245, 108, 108, 0.9);
    color: #ffffff;
  }
}

.favorite-indicator {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 50%;
  color: var(--el-color-warning);
  font-size: 14px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.card-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: rgba(0, 0, 0, 0.5);
  opacity: 0;
  animation: fadeIn 0.2s ease forwards;

  .el-button {
    background: rgba(255, 255, 255, 0.95);
    border: none;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);

    &:hover {
      background: #ffffff;
      transform: scale(1.1);
    }
  }
}

.card-info {
  padding: 10px 12px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.info-prompt {
  font-size: 13px;
  line-height: 1.4;
  color: var(--el-text-color-regular);
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  margin-bottom: 6px;
}

.info-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;

  .el-icon {
    font-size: 12px;
  }
}

.info-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;

  .el-tag {
    font-size: 11px;
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>