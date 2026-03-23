<template>
  <div class="image-result">
    <!-- 空状态 -->
    <div v-if="!currentImage && !generating" class="empty-state">
      <el-empty description="暂无图像">
        <template #image>
          <el-icon :size="64"><Picture /></el-icon>
        </template>
        <template #description>
          <p class="empty-tip">请选择图像或生成新图像</p>
        </template>
      </el-empty>
    </div>

    <!-- 生成中状态 -->
    <div v-else-if="generating && !currentImage" class="generating-state">
      <div class="generating-placeholder">
        <el-icon class="is-loading" :size="48"><Loading /></el-icon>
        <p class="generating-text">正在生成图像...</p>
        <el-progress
          :percentage="taskProgress"
          :stroke-width="6"
          :show-text="true"
          class="generating-progress"
        />
      </div>
    </div>

    <!-- 图像展示区域 -->
    <div v-else-if="currentImage" class="image-display">
      <!-- 图像容器 -->
      <div class="image-container">
        <el-image
          :src="getImageUrl(currentImage)"
          :alt="currentImage.prompt || '生成的图像'"
          fit="contain"
          class="main-image"
          @load="handleImageLoad"
          @error="handleImageError"
        >
          <template #error>
            <div class="image-error">
              <el-icon :size="48"><PictureFilled /></el-icon>
              <p>图像加载失败</p>
            </div>
          </template>
          <template #placeholder>
            <div class="image-loading">
              <el-icon class="is-loading" :size="32"><Loading /></el-icon>
            </div>
          </template>
        </el-image>

        <!-- 状态标记 -->
        <div v-if="currentImage.status === 'pending'" class="status-badge pending">
          <el-icon class="is-loading"><Loading /></el-icon>
          <span>生成中</span>
        </div>
        <div v-else-if="currentImage.status === 'failed'" class="status-badge failed">
          <el-icon><WarningFilled /></el-icon>
          <span>生成失败</span>
        </div>
      </div>

      <!-- 操作按钮区域 -->
      <div class="action-buttons">
        <!-- 下载按钮 -->
        <el-button
          type="primary"
          :icon="Download"
          :disabled="currentImage.status !== 'completed'"
          @click="handleDownload"
        >
          下载
        </el-button>

        <!-- 收藏按钮 -->
        <el-button
          :type="currentImage.favorite ? 'warning' : 'default'"
          :icon="currentImage.favorite ? StarFilled : Star"
          :disabled="currentImage.status !== 'completed'"
          @click="handleToggleFavorite"
        >
          {{ currentImage.favorite ? '已收藏' : '收藏' }}
        </el-button>

        <!-- 重新生成按钮 -->
        <el-button
          :icon="RefreshRight"
          :disabled="currentImage.status !== 'completed'"
          @click="handleRegenerate"
        >
          重新生成
        </el-button>

        <!-- 查看详情按钮 -->
        <el-button
          :icon="InfoFilled"
          @click="showDetailDialog = true"
        >
          详情
        </el-button>

        <!-- 删除按钮 -->
        <el-button
          type="danger"
          :icon="Delete"
          @click="handleDelete"
        >
          删除
        </el-button>
      </div>

      <!-- 提示词展示 -->
      <div v-if="currentImage.prompt" class="prompt-display">
        <div class="prompt-label">提示词</div>
        <div class="prompt-content">
          {{ currentImage.prompt }}
          <el-button
            type="primary"
            text
            size="small"
            :icon="CopyDocument"
            @click="handleCopyPrompt"
          >
            复制
          </el-button>
        </div>
      </div>

      <!-- 基本信息 -->
      <div class="info-bar">
        <div class="info-item" v-if="currentImage.width && currentImage.height">
          <el-icon><Grid /></el-icon>
          <span>{{ currentImage.width }} × {{ currentImage.height }}</span>
        </div>
        <div class="info-item" v-if="currentImage.style">
          <el-icon><Brush /></el-icon>
          <span>{{ getStyleLabel(currentImage.style) }}</span>
        </div>
        <div class="info-item" v-if="currentImage.quality">
          <el-icon><Medal /></el-icon>
          <span>{{ getQualityLabel(currentImage.quality) }}</span>
        </div>
        <div class="info-item" v-if="currentImage.seed && currentImage.seed > 0">
          <el-icon><Key /></el-icon>
          <span>种子: {{ currentImage.seed }}</span>
        </div>
      </div>
    </div>

    <!-- 详情对话框 -->
    <el-dialog
      v-model="showDetailDialog"
      title="图像详情"
      width="500px"
      :close-on-click-modal="false"
    >
      <div v-if="currentImage" class="detail-content">
        <!-- 缩略图 -->
        <div class="detail-thumbnail">
          <el-image
            :src="getImageUrl(currentImage)"
            fit="cover"
            class="thumbnail-image"
          />
        </div>

        <!-- 详情信息 -->
        <el-descriptions :column="1" border>
          <el-descriptions-item label="图像 ID">
            {{ currentImage.id }}
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="getStatusTagType(currentImage.status)">
              {{ getStatusLabel(currentImage.status) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="提示词" v-if="currentImage.prompt">
            {{ currentImage.prompt }}
          </el-descriptions-item>
          <el-descriptions-item label="负面提示词" v-if="currentImage.negativePrompt">
            {{ currentImage.negativePrompt }}
          </el-descriptions-item>
          <el-descriptions-item label="尺寸" v-if="currentImage.width && currentImage.height">
            {{ currentImage.width }} × {{ currentImage.height }}
          </el-descriptions-item>
          <el-descriptions-item label="风格" v-if="currentImage.style">
            {{ getStyleLabel(currentImage.style) }}
          </el-descriptions-item>
          <el-descriptions-item label="质量" v-if="currentImage.quality">
            {{ getQualityLabel(currentImage.quality) }}
          </el-descriptions-item>
          <el-descriptions-item label="种子值" v-if="currentImage.seed && currentImage.seed > 0">
            {{ currentImage.seed }}
          </el-descriptions-item>
          <el-descriptions-item label="提供商" v-if="currentImage.providerId">
            {{ currentImage.providerId }}
          </el-descriptions-item>
          <el-descriptions-item label="模型" v-if="currentImage.modelId">
            {{ currentImage.modelId }}
          </el-descriptions-item>
          <el-descriptions-item label="创建时间">
            {{ formatDateTime(currentImage.createdAt) }}
          </el-descriptions-item>
          <el-descriptions-item label="文件大小" v-if="currentImage.fileSize">
            {{ formatFileSize(currentImage.fileSize) }}
          </el-descriptions-item>
          <el-descriptions-item label="错误信息" v-if="currentImage.errorMessage">
            <el-text type="danger">{{ currentImage.errorMessage }}</el-text>
          </el-descriptions-item>
        </el-descriptions>
      </div>

      <template #footer>
        <el-button @click="showDetailDialog = false">关闭</el-button>
        <el-button type="primary" :icon="Download" @click="handleDownload">
          下载图像
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  Picture,
  PictureFilled,
  Loading,
  Download,
  Star,
  StarFilled,
  RefreshRight,
  InfoFilled,
  Delete,
  CopyDocument,
  Grid,
  Brush,
  Medal,
  Key,
  WarningFilled
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useImage } from '@/composables'
import type { ImageRecord } from '../../../shared/types/image.types'

/**
 * Props 定义
 */
interface Props {
  /** 当前选中的图像 */
  image?: ImageRecord | null
}

/**
 * Emits 定义
 */
interface Emits {
  /** 重新生成事件 */
  (e: 'regenerate', image: ImageRecord): void
  /** 图像更新事件 */
  (e: 'update', image: ImageRecord): void
  /** 图像删除事件 */
  (e: 'delete', image: ImageRecord): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

// 使用 useImage composable
const {
  generating,
  taskProgress,
  toggleFavorite,
  deleteImage,
  downloadImage: downloadImageFromApi
} = useImage()

// ==================== 状态 ====================

/** 是否显示详情对话框 */
const showDetailDialog = ref(false)

/** 图像加载状态 */
const imageLoaded = ref(false)

// ==================== 计算属性 ====================

/** 当前图像 */
const currentImage = computed(() => props.image)

// ==================== 方法 ====================

/**
 * 获取图像 URL
 */
function getImageUrl(image: ImageRecord): string {
  if (image.filePath) {
    // 检查是否已有协议前缀
    if (image.filePath.startsWith('local-image://') ||
        image.filePath.startsWith('http://') ||
        image.filePath.startsWith('https://') ||
        image.filePath.startsWith('data:')) {
      return image.filePath
    }
    // 使用 local-image:// 协议加载本地图像
    return `local-image://${encodeURIComponent(image.filePath)}`
  }
  return ''
}

/**
 * 处理图像加载完成
 */
function handleImageLoad(): void {
  imageLoaded.value = true
}

/**
 * 处理图像加载错误
 */
function handleImageError(): void {
  imageLoaded.value = false
  ElMessage.error('图像加载失败')
}

/**
 * 处理下载
 */
async function handleDownload(): Promise<void> {
  if (!currentImage.value) return

  try {
    const savedPath = await downloadImageFromApi(currentImage.value.id)
    if (savedPath) {
      ElMessage.success(`图像已保存到: ${savedPath}`)
    }
  } catch (err) {
    ElMessage.error('下载失败')
    console.error('下载图像失败:', err)
  }
}

/**
 * 切换收藏状态
 */
async function handleToggleFavorite(): Promise<void> {
  if (!currentImage.value) return

  const success = await toggleFavorite(currentImage.value.id)
  if (success) {
    ElMessage.success(currentImage.value.favorite ? '已取消收藏' : '已添加收藏')
    emit('update', currentImage.value)
  }
}

/**
 * 处理重新生成
 */
function handleRegenerate(): void {
  if (!currentImage.value) return
  emit('regenerate', currentImage.value)
}

/**
 * 处理删除
 */
async function handleDelete(): Promise<void> {
  if (!currentImage.value) return

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

    const success = await deleteImage(currentImage.value.id)
    if (success) {
      ElMessage.success('删除成功')
      emit('delete', currentImage.value)
    }
  } catch {
    // 用户取消删除
  }
}

/**
 * 复制提示词
 */
async function handleCopyPrompt(): Promise<void> {
  if (!currentImage.value?.prompt) return

  try {
    await navigator.clipboard.writeText(currentImage.value.prompt)
    ElMessage.success('提示词已复制到剪贴板')
  } catch {
    ElMessage.error('复制失败')
  }
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

/**
 * 获取状态标签类型
 */
function getStatusTagType(status: string): 'success' | 'warning' | 'danger' | 'info' {
  const statusMap: Record<string, 'success' | 'warning' | 'danger' | 'info'> = {
    pending: 'warning',
    completed: 'success',
    failed: 'danger'
  }
  return statusMap[status] || 'info'
}

/**
 * 获取状态标签
 */
function getStatusLabel(status: string): string {
  const statusMap: Record<string, string> = {
    pending: '生成中',
    completed: '已完成',
    failed: '失败'
  }
  return statusMap[status] || status
}

/**
 * 格式化日期时间
 */
function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

/**
 * 格式化文件大小
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}
</script>

<style lang="scss" scoped>
.image-result {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #ffffff;
  border-radius: 16px;
  overflow: hidden;
}

// 空状态
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 40px;

  .el-icon {
    color: var(--el-text-color-placeholder);
  }

  .empty-tip {
    margin-top: 16px;
    font-size: 14px;
    color: var(--el-text-color-secondary);
  }
}

// 生成中状态
.generating-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 40px;
}

.generating-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;

  .el-icon {
    color: var(--el-color-primary);
  }

  .generating-text {
    font-size: 16px;
    color: var(--el-text-color-regular);
  }

  .generating-progress {
    width: 300px;
  }
}

// 图像展示区域
.image-display {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.image-container {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f5f7fa 0%, #e4e7ed 100%);
  overflow: hidden;
  min-height: 300px;

  .main-image {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }

  .image-error,
  .image-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: var(--el-text-color-placeholder);

    p {
      margin-top: 12px;
      font-size: 14px;
    }
  }
}

.status-badge {
  position: absolute;
  top: 16px;
  right: 16px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;

  &.pending {
    background: rgba(230, 162, 60, 0.9);
    color: #ffffff;
  }

  &.failed {
    background: rgba(245, 108, 108, 0.9);
    color: #ffffff;
  }
}

// 操作按钮区域
.action-buttons {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 16px;
  border-top: 1px solid var(--el-border-color-lighter);
  background: #fafafa;

  .el-button {
    min-width: 80px;
  }
}

// 提示词展示
.prompt-display {
  padding: 16px;
  border-top: 1px solid var(--el-border-color-lighter);

  .prompt-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--el-text-color-secondary);
    margin-bottom: 8px;
  }

  .prompt-content {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-size: 14px;
    line-height: 1.6;
    color: var(--el-text-color-regular);
    word-break: break-word;

    .el-button {
      flex-shrink: 0;
    }
  }
}

// 信息栏
.info-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  background: var(--el-fill-color-light);
  border-top: 1px solid var(--el-border-color-lighter);
}

.info-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--el-text-color-secondary);

  .el-icon {
    font-size: 14px;
  }
}

// 详情对话框
.detail-content {
  .detail-thumbnail {
    display: flex;
    justify-content: center;
    margin-bottom: 20px;

    .thumbnail-image {
      max-width: 100%;
      max-height: 200px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }
  }

  :deep(.el-descriptions) {
    .el-descriptions__label {
      width: 100px;
      font-weight: 500;
    }
  }
}
</style>