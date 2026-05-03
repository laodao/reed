<template>
  <!-- 左侧：分镜列表 -->
  <div class="storyboard-panel">
    <div class="panel-header">
      <h3>分镜列表</h3>
      <div class="panel-actions">
        <el-button
          size="small"
          @click="emit('generate-all')"
          :loading="generatingAll"
          :disabled="completedCount === storyboards.length"
        >
          <el-icon><Picture /></el-icon>
          {{ generatingAll ? '批量生成中...' : '批量生成画面' }}
        </el-button>
        <el-button
          size="small"
          type="success"
          @click="emit('open-synthesis-dialog')"
          :disabled="!hasAllImages"
        >
          <el-icon><VideoPlay /></el-icon>
          合成全部视频
        </el-button>
      </div>
    </div>

    <div class="storyboard-grid">
      <div
        v-for="storyboard in storyboards"
        :key="storyboard.id"
        class="storyboard-card"
        :class="{ 'has-image': storyboard.frameImage, 'selected': selectedId === storyboard.id }"
        @click="emit('select', storyboard)"
      >
        <!-- 画面预览 -->
        <div class="card-preview">
          <div v-if="storyboard.frameImage" class="preview-image" @click.stop="emit('open-image-preview', storyboard)">
            <img :src="storyboard.frameImage.filePath || storyboard.frameImage.url" :alt="`镜头${storyboard.shotNumber}`" />
            <div class="preview-overlay">
              <el-icon size="24"><ZoomIn /></el-icon>
            </div>
          </div>
          <div v-else class="preview-placeholder">
            <el-icon size="32"><Picture /></el-icon>
            <span>待生成</span>
          </div>

          <!-- 操作按钮 -->
          <div class="card-actions">
            <el-tooltip content="播放视频" placement="top" v-if="storyboard.videoPath">
              <el-button circle size="small" type="primary" @click.stop="emit('play-video', storyboard)">
                <el-icon><VideoPlay /></el-icon>
              </el-button>
            </el-tooltip>
            <el-tooltip content="重新生成" placement="top" v-if="storyboard.frameImage">
              <el-button circle size="small" @click.stop="emit('open-regenerate-dialog', storyboard)">
                <el-icon><RefreshRight /></el-icon>
              </el-button>
            </el-tooltip>
            <el-tooltip content="删除画面" placement="top" v-if="storyboard.frameImage">
              <el-button circle size="small" type="danger" @click.stop="emit('delete-image', storyboard)">
                <el-icon><Delete /></el-icon>
              </el-button>
            </el-tooltip>
          </div>

          <!-- 状态标签 -->
          <div class="card-status">
            <el-tag size="small" :type="storyboard.frameImage ? 'success' : 'info'">
              镜头 {{ storyboard.shotNumber }}
            </el-tag>
          </div>
        </div>

        <!-- 分镜信息 -->
        <div class="card-info">
          <div class="card-meta">
            <span>{{ getShotTypeLabel(storyboard.shotType) }}</span>
            <span>{{ storyboard.duration }}s</span>
          </div>
          <div class="card-description">
            {{ storyboard.frameDescription || '暂无描述' }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Picture, ZoomIn, RefreshRight, Delete, VideoPlay } from '@element-plus/icons-vue'
import type { Storyboard } from '../../../../../shared/types/story-to-video.types'

// ==================== Props ====================
const props = defineProps<{
  /** 分镜列表 */
  storyboards: Storyboard[]
  /** 当前选中的分镜 ID */
  selectedId: string | null
  /** 批量生成中标志 */
  generatingAll: boolean
}>()

// ==================== Emits ====================
const emit = defineEmits<{
  /** 选中某个分镜 */
  (e: 'select', storyboard: Storyboard): void
  /** 打开图片预览 */
  (e: 'open-image-preview', storyboard: Storyboard): void
  /** 打开重新生成对话框 */
  (e: 'open-regenerate-dialog', storyboard: Storyboard): void
  /** 删除画面 */
  (e: 'delete-image', storyboard: Storyboard): void
  /** 播放视频 */
  (e: 'play-video', storyboard: Storyboard): void
  /** 批量生成所有画面 */
  (e: 'generate-all'): void
  /** 打开合成对话框 */
  (e: 'open-synthesis-dialog'): void
}>()

// ==================== 计算属性 ====================
const completedCount = computed(() => props.storyboards.filter(s => s.frameImage).length)
const hasAllImages = computed(
  () => props.storyboards.length > 0 && props.storyboards.every(s => s.frameImage)
)

// ==================== 景别/摄像标签映射 ====================
const shotTypeLabels: Record<string, string> = {
  extreme_long: '大远景',
  long: '远景',
  full: '全景',
  medium: '中景',
  medium_close: '中近景',
  close: '近景',
  extreme_close: '特写',
  detail: '细节特写'
}

function getShotTypeLabel(type: string): string {
  return shotTypeLabels[type] || type
}
</script>

<style scoped lang="scss">
.storyboard-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color);
  border-right: 1px solid var(--el-border-color-light);

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid var(--el-border-color-light);

    h3 {
      margin: 0;
      font-size: 16px;
    }
  }

  .storyboard-grid {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 16px;
    align-content: start;
  }
}

.storyboard-card {
  background: var(--el-fill-color-blank);
  border-radius: 8px;
  overflow: hidden;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: var(--el-color-primary-light-5);
  }

  &.selected {
    border-color: var(--el-color-primary);
  }

  &.has-image {
    .card-preview {
      background: #000;
    }
  }

  .card-preview {
    position: relative;
    aspect-ratio: 16/9;
    background: var(--el-fill-color);

    .preview-image {
      width: 100%;
      height: 100%;

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .preview-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        opacity: 0;
        transition: opacity 0.2s;
      }

      &:hover .preview-overlay {
        opacity: 1;
      }
    }

    .preview-placeholder {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      color: var(--el-text-color-placeholder);
    }

    .card-actions {
      position: absolute;
      top: 8px;
      right: 8px;
      display: flex;
      gap: 4px;
      opacity: 0;
      transition: opacity 0.2s;
    }

    &:hover .card-actions {
      opacity: 1;
    }

    .card-status {
      position: absolute;
      bottom: 8px;
      left: 8px;
    }
  }

  .card-info {
    padding: 12px;

    .card-meta {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: var(--el-text-color-secondary);
      margin-bottom: 8px;
    }

    .card-description {
      font-size: 13px;
      line-height: 1.4;
      color: var(--el-text-color-regular);
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
  }
}
</style>
