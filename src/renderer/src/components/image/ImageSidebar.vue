<template>
  <div class="image-sidebar">
    <!-- 顶部标题区域 -->
    <div class="sidebar-header">
      <h3>生成历史</h3>
      <el-tooltip content="仅显示收藏" placement="bottom">
        <el-button
          :type="favoriteOnly ? 'primary' : 'default'"
          :icon="Star"
          circle
          size="small"
          @click="handleToggleFavoriteFilter"
        />
      </el-tooltip>
    </div>

    <!-- 图像列表区域 -->
    <div class="sidebar-content" v-loading="loading">
      <template v-if="images.length > 0">
        <!-- 今天 -->
        <div v-if="groupedImages.today.length > 0" class="image-group">
          <div class="group-title" @click="toggleGroup('today')">
            <el-icon class="collapse-icon" :class="{ collapsed: collapsedGroups.today }">
              <ArrowRight />
            </el-icon>
            <span>今天</span>
            <span class="group-count">{{ groupedImages.today.length }}</span>
          </div>
          <div class="group-content" :class="{ collapsed: collapsedGroups.today }">
            <div
              v-for="image in groupedImages.today"
              :key="image.id"
              class="image-card"
              :class="{ selected: selectedImageId === image.id }"
              @click="handleSelectImage(image)"
            >
              <!-- 图像缩略图 -->
              <div class="image-thumbnail">
                <el-image
                  :src="getImageUrl(image)"
                  :alt="image.prompt"
                  fit="cover"
                  lazy
                >
                  <template #error>
                    <div class="image-error">
                      <el-icon><Picture /></el-icon>
                    </div>
                  </template>
                  <template #placeholder>
                    <div class="image-loading">
                      <el-icon class="is-loading"><Loading /></el-icon>
                    </div>
                  </template>
                </el-image>
                <!-- 收藏标记 -->
                <div v-if="image.favorite" class="favorite-badge">
                  <el-icon><StarFilled /></el-icon>
                </div>
              </div>

              <!-- 图像信息 -->
              <div class="image-info">
                <div class="image-prompt" :title="image.prompt">
                  {{ truncatePrompt(image.prompt) }}
                </div>
                <div class="image-meta">
                  <span class="image-time">{{ formatTime(image.createdAt) }}</span>
                  <span class="image-size">{{ image.width }}x{{ image.height }}</span>
                </div>
              </div>

              <!-- 操作按钮 -->
              <div class="image-actions">
                <el-button
                  :type="image.favorite ? 'warning' : 'primary'"
                  :icon="image.favorite ? StarFilled : Star"
                  circle
                  size="small"
                  plain
                  @click.stop="handleToggleFavorite(image)"
                />
                <el-button
                  type="danger"
                  :icon="Delete"
                  circle
                  size="small"
                  plain
                  @click.stop="handleDeleteImage(image)"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- 昨天 -->
        <div v-if="groupedImages.yesterday.length > 0" class="image-group">
          <div class="group-title" @click="toggleGroup('yesterday')">
            <el-icon class="collapse-icon" :class="{ collapsed: collapsedGroups.yesterday }">
              <ArrowRight />
            </el-icon>
            <span>昨天</span>
            <span class="group-count">{{ groupedImages.yesterday.length }}</span>
          </div>
          <div class="group-content" :class="{ collapsed: collapsedGroups.yesterday }">
            <div
              v-for="image in groupedImages.yesterday"
              :key="image.id"
              class="image-card"
              :class="{ selected: selectedImageId === image.id }"
              @click="handleSelectImage(image)"
            >
              <!-- 图像缩略图 -->
              <div class="image-thumbnail">
                <el-image
                  :src="getImageUrl(image)"
                  :alt="image.prompt"
                  fit="cover"
                  lazy
                >
                  <template #error>
                    <div class="image-error">
                      <el-icon><Picture /></el-icon>
                    </div>
                  </template>
                  <template #placeholder>
                    <div class="image-loading">
                      <el-icon class="is-loading"><Loading /></el-icon>
                    </div>
                  </template>
                </el-image>
                <div v-if="image.favorite" class="favorite-badge">
                  <el-icon><StarFilled /></el-icon>
                </div>
              </div>

              <div class="image-info">
                <div class="image-prompt" :title="image.prompt">
                  {{ truncatePrompt(image.prompt) }}
                </div>
                <div class="image-meta">
                  <span class="image-time">{{ formatTime(image.createdAt) }}</span>
                  <span class="image-size">{{ image.width }}x{{ image.height }}</span>
                </div>
              </div>

              <div class="image-actions">
                <el-button
                  :type="image.favorite ? 'warning' : 'primary'"
                  :icon="image.favorite ? StarFilled : Star"
                  circle
                  size="small"
                  plain
                  @click.stop="handleToggleFavorite(image)"
                />
                <el-button
                  type="danger"
                  :icon="Delete"
                  circle
                  size="small"
                  plain
                  @click.stop="handleDeleteImage(image)"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- 更早 -->
        <div v-if="groupedImages.earlier.length > 0" class="image-group">
          <div class="group-title" @click="toggleGroup('earlier')">
            <el-icon class="collapse-icon" :class="{ collapsed: collapsedGroups.earlier }">
              <ArrowRight />
            </el-icon>
            <span>更早</span>
            <span class="group-count">{{ groupedImages.earlier.length }}</span>
          </div>
          <div class="group-content" :class="{ collapsed: collapsedGroups.earlier }">
            <div
              v-for="image in groupedImages.earlier"
              :key="image.id"
              class="image-card"
              :class="{ selected: selectedImageId === image.id }"
              @click="handleSelectImage(image)"
            >
              <!-- 图像缩略图 -->
              <div class="image-thumbnail">
                <el-image
                  :src="getImageUrl(image)"
                  :alt="image.prompt"
                  fit="cover"
                  lazy
                >
                  <template #error>
                    <div class="image-error">
                      <el-icon><Picture /></el-icon>
                    </div>
                  </template>
                  <template #placeholder>
                    <div class="image-loading">
                      <el-icon class="is-loading"><Loading /></el-icon>
                    </div>
                  </template>
                </el-image>
                <div v-if="image.favorite" class="favorite-badge">
                  <el-icon><StarFilled /></el-icon>
                </div>
              </div>

              <div class="image-info">
                <div class="image-prompt" :title="image.prompt">
                  {{ truncatePrompt(image.prompt) }}
                </div>
                <div class="image-meta">
                  <span class="image-time">{{ formatTime(image.createdAt) }}</span>
                  <span class="image-size">{{ image.width }}x{{ image.height }}</span>
                </div>
              </div>

              <div class="image-actions">
                <el-button
                  :type="image.favorite ? 'warning' : 'primary'"
                  :icon="image.favorite ? StarFilled : Star"
                  circle
                  size="small"
                  plain
                  @click.stop="handleToggleFavorite(image)"
                />
                <el-button
                  type="danger"
                  :icon="Delete"
                  circle
                  size="small"
                  plain
                  @click.stop="handleDeleteImage(image)"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- 加载更多 -->
        <div v-if="hasMore" class="load-more">
          <el-button
            :loading="loading"
            type="primary"
            text
            @click="handleLoadMore"
          >
            加载更多
          </el-button>
        </div>
      </template>

      <!-- 空状态 -->
      <template v-else>
        <div class="empty-state">
          <el-empty description="暂无生成记录">
            <template #image>
              <el-icon :size="48"><Picture /></el-icon>
            </template>
          </el-empty>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from 'vue'
import {
  Star,
  StarFilled,
  Picture,
  Delete,
  Loading,
  ArrowRight
} from '@element-plus/icons-vue'
import { ElMessageBox, ElMessage } from 'element-plus'
import { useImage } from '@/composables'
import type { ImageRecord } from '../../../shared/types/image.types'

/**
 * Props 定义
 */
interface Props {
  /** 当前选中的图像 ID */
  modelValue?: string
}

/**
 * Emits 定义
 */
interface Emits {
  /** 更新选中图像 */
  (e: 'update:modelValue', id: string): void
  /** 图像选中事件 */
  (e: 'select', image: ImageRecord): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

// 使用 useImage composable
const {
  images,
  loading,
  favoriteOnly,
  hasMore,
  loadMoreImages,
  toggleFavoriteFilter,
  toggleFavorite,
  deleteImage
} = useImage()

// 当前选中的图像 ID
const selectedImageId = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

// 折叠状态
const collapsedGroups = reactive({
  today: false,
  yesterday: false,
  earlier: false
})

// 分组后的图像列表
const groupedImages = computed(() => {
  const today: ImageRecord[] = []
  const yesterday: ImageRecord[] = []
  const earlier: ImageRecord[] = []

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterdayStart = new Date(todayStart)
  yesterdayStart.setDate(yesterdayStart.getDate() - 1)

  for (const image of images.value) {
    const date = typeof image.createdAt === 'string' ? new Date(image.createdAt) : image.createdAt

    if (date >= todayStart) {
      today.push(image)
    } else if (date >= yesterdayStart) {
      yesterday.push(image)
    } else {
      earlier.push(image)
    }
  }

  return { today, yesterday, earlier }
})

/**
 * 切换分组折叠状态
 */
function toggleGroup(group: 'today' | 'yesterday' | 'earlier'): void {
  collapsedGroups[group] = !collapsedGroups[group]
}

/**
 * 获取图像 URL
 */
function getImageUrl(image: ImageRecord): string {
  // 检查 filePath 是否已有协议前缀
  if (image.filePath) {
    if (image.filePath.startsWith('local-image://') ||
        image.filePath.startsWith('http://') ||
        image.filePath.startsWith('https://') ||
        image.filePath.startsWith('data:')) {
      return image.filePath
    }
    // 使用 local-image:// 协议
    return `local-image://${encodeURIComponent(image.filePath)}`
  }
  return ''
}

/**
 * 处理图像选择
 */
function handleSelectImage(image: ImageRecord): void {
  selectedImageId.value = image.id
  emit('select', image)
}

/**
 * 切换收藏筛选
 */
async function handleToggleFavoriteFilter(): Promise<void> {
  await toggleFavoriteFilter()
}

/**
 * 切换图像收藏状态
 */
async function handleToggleFavorite(image: ImageRecord): Promise<void> {
  const success = await toggleFavorite(image.id)
  if (success) {
    ElMessage.success(image.favorite ? '已取消收藏' : '已添加收藏')
  }
}

/**
 * 删除图像
 */
async function handleDeleteImage(image: ImageRecord): Promise<void> {
  try {
    await ElMessageBox.confirm(
      '确定要删除这张图像吗？删除后无法恢复。',
      '确认删除',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    const success = await deleteImage(image.id)
    if (success) {
      ElMessage.success('删除成功')
      // 如果删除的是当前选中的图像，清除选中状态
      if (selectedImageId.value === image.id) {
        selectedImageId.value = ''
      }
    }
  } catch {
    // 用户取消删除
  }
}

/**
 * 加载更多图像
 */
async function handleLoadMore(): Promise<void> {
  await loadMoreImages()
}

/**
 * 截断提示词
 */
function truncatePrompt(prompt: string, maxLength = 30): string {
  if (prompt.length <= maxLength) return prompt
  return prompt.substring(0, maxLength) + '...'
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
    return `昨天 ${d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
  }

  // 更早
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}
</script>

<style lang="scss" scoped>
.image-sidebar {
  display: flex;
  flex-direction: column;
  width: 280px;
  height: 100%;
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
  border-right: 1px solid var(--el-border-color-lighter);
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.05);
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);

  h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }
}

.sidebar-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--el-border-color);
    border-radius: 3px;

    &:hover {
      background: var(--el-border-color-dark);
    }
  }
}

.image-group {
  margin-bottom: 16px;
}

.group-title {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 4px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  cursor: pointer;
  user-select: none;
  border-radius: 6px;
  transition: all 0.2s ease;

  &:hover {
    background: var(--el-fill-color-light);
  }

  .collapse-icon {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    transition: transform 0.2s ease;

    &.collapsed {
      transform: rotate(90deg);
    }
  }

  .group-count {
    margin-left: auto;
    font-size: 11px;
    color: var(--el-text-color-secondary);
    background: var(--el-fill-color);
    padding: 2px 8px;
    border-radius: 10px;
  }
}

.group-content {
  overflow: hidden;
  transition: max-height 0.3s ease, opacity 0.2s ease;
  max-height: 2000px;
  opacity: 1;

  &.collapsed {
    max-height: 0;
    opacity: 0;
  }
}

.image-card {
  position: relative;
  margin-bottom: 12px;
  padding: 12px;
  background: #ffffff;
  border-radius: 12px;
  border: 1px solid var(--el-border-color-lighter);
  cursor: pointer;
  transition: all 0.3s ease;

  &:hover {
    border-color: var(--el-color-primary-light-5);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    transform: translateY(-2px);

    .image-actions {
      opacity: 1;
    }
  }

  &.selected {
    border-color: var(--el-color-primary);
    background: linear-gradient(
      135deg,
      var(--el-color-primary-light-9) 0%,
      #ffffff 100%
    );
    box-shadow: 0 4px 16px rgba(64, 158, 255, 0.15);
  }
}

.image-thumbnail {
  position: relative;
  width: 100%;
  height: 120px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--el-fill-color-light);

  :deep(.el-image) {
    width: 100%;
    height: 100%;
  }

  .image-error,
  .image-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: var(--el-text-color-placeholder);
    font-size: 24px;
  }
}

.favorite-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 50%;
  color: var(--el-color-warning);
  font-size: 14px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.image-info {
  margin-top: 10px;
}

.image-prompt {
  font-size: 13px;
  color: var(--el-text-color-regular);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.image-meta {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.image-actions {
  position: absolute;
  top: 8px;
  left: 8px;
  display: flex;
  gap: 6px;
  opacity: 0;
  transition: opacity 0.2s ease;

  .el-button {
    background: rgba(255, 255, 255, 0.95);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);

    &:hover {
      background: #ffffff;
      transform: scale(1.1);
    }

    // 收藏按钮 - 使用主题色
    &.el-button--primary {
      color: var(--el-color-primary);
      border-color: var(--el-color-primary-light-5);

      &:hover {
        color: #ffffff;
        background: var(--el-color-primary);
        border-color: var(--el-color-primary);
      }
    }

    // 已收藏状态 - 黄色
    &.el-button--warning {
      color: #ffffff;
      background: var(--el-color-warning);
      border-color: var(--el-color-warning);

      &:hover {
        background: var(--el-color-warning-dark-2);
        border-color: var(--el-color-warning-dark-2);
      }
    }

    // 删除按钮 - 危险色
    &.el-button--danger {
      color: var(--el-color-danger);
      border-color: var(--el-color-danger-light-5);

      &:hover {
        color: #ffffff;
        background: var(--el-color-danger);
        border-color: var(--el-color-danger);
      }
    }
  }
}

.load-more {
  display: flex;
  justify-content: center;
  padding: 12px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: var(--el-text-color-placeholder);

  .el-icon {
    color: var(--el-text-color-placeholder);
  }
}
</style>