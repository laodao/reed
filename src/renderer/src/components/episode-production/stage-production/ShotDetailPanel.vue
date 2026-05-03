<template>
  <!-- 右侧：操作面板 -->
  <div class="operation-panel">
    <!-- 固定标题栏 -->
    <div class="panel-header-fixed" v-if="selectedStoryboard">
      <h3>镜头 {{ selectedStoryboard.shotNumber }} 详情</h3>
    </div>

    <!-- 可滚动内容区域 -->
    <div class="panel-content">
      <!-- 选中的分镜详情 -->
      <div class="detail-section" v-if="selectedStoryboard">
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="景别">{{ getShotTypeLabel(selectedStoryboard.shotType) }}</el-descriptions-item>
          <el-descriptions-item label="角度">{{ getCameraAngleLabel(selectedStoryboard.cameraAngle) }}</el-descriptions-item>
          <el-descriptions-item label="运镜">{{ getCameraMovementLabel(selectedStoryboard.cameraMovement) }}</el-descriptions-item>
          <el-descriptions-item label="时长">{{ selectedStoryboard.duration }}秒</el-descriptions-item>
          <el-descriptions-item label="画面描述">
            <div class="description-text">{{ selectedStoryboard.frameDescription }}</div>
          </el-descriptions-item>
        </el-descriptions>

        <!-- 预览大图 -->
        <div v-if="selectedStoryboard.frameImage" class="detail-preview" @click="emit('open-image-preview', selectedStoryboard)">
          <img :src="selectedStoryboard.frameImage.filePath || selectedStoryboard.frameImage.url" alt="预览" />
          <div class="preview-overlay">
            <el-icon size="24"><ZoomIn /></el-icon>
            <span>点击查看大图</span>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="detail-actions">
          <el-button type="primary" size="small" @click="emit('open-regenerate-dialog', selectedStoryboard)" :loading="generatingSingle">
            <el-icon><RefreshRight /></el-icon>
            {{ selectedStoryboard.frameImage ? '重新生成' : '生成画面' }}
          </el-button>
          <el-button v-if="selectedStoryboard.frameImage" type="warning" size="small" @click="emit('generate-audio')" :loading="generatingAudio">
            <el-icon><Headset /></el-icon>
            生成音频
          </el-button>
          <el-button v-if="hasCurrentScene" size="small" @click="emit('open-script-dialog')">
            <el-icon><Document /></el-icon>
            查看剧本
          </el-button>
        </div>
      </div>

      <el-empty v-else description="请选择一个分镜" :image-size="80" />

      <!-- 音频播放区域 -->
      <div class="audio-section" v-if="selectedStoryboard">
        <h4>本镜头音频</h4>
        <div v-if="dialoguesWithAudio.length > 0" class="audio-list">
          <div
            v-for="dialogue in dialoguesWithAudio"
            :key="dialogue.id"
            class="audio-item"
          >
            <div class="audio-info">
              <span class="audio-character">{{ dialogue.characterName }}</span>
              <span class="audio-text">{{ dialogue.text }}</span>
            </div>
            <div class="audio-controls">
              <el-button
                circle
                size="small"
                :type="currentPlayingId === dialogue.id ? 'primary' : 'default'"
                @click="emit('toggle-audio', dialogue)"
              >
                <el-icon>
                  <VideoPause v-if="currentPlayingId === dialogue.id && isPlaying" />
                  <VideoPlay v-else />
                </el-icon>
              </el-button>
            </div>
          </div>
        </div>
        <div v-else class="audio-empty">暂无音频</div>
      </div>
    </div>

    <!-- 固定底部操作栏 -->
    <div class="bottom-actions-fixed" v-if="hasStoryboards">
      <div class="action-buttons">
        <el-button
          v-if="selectedStoryboard?.frameImage"
          :type="selectedStoryboard?.videoPath ? 'primary' : 'warning'"
          @click="emit('synthesize-single')"
          :loading="synthesizingSingle"
          :disabled="synthesizingSingle"
        >
          <el-icon><VideoPlay /></el-icon>
          {{ selectedStoryboard?.videoPath ? '重新合成' : '合成当前镜头' }}
        </el-button>
        <el-button
          v-if="selectedStoryboard?.videoPath"
          type="success"
          @click="emit('play-video', selectedStoryboard)"
        >
          <el-icon><VideoPlay /></el-icon>
          播放视频
        </el-button>
      </div>
      <div class="action-hint" v-if="!selectedStoryboard?.frameImage">
        <el-icon><InfoFilled /></el-icon>
        请先选择一个有画面的分镜
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ZoomIn, RefreshRight, Headset, VideoPlay, VideoPause, InfoFilled, Document } from '@element-plus/icons-vue'
import type { Storyboard, Dialogue } from '../../../../../shared/types/story-to-video.types'

// ==================== Props ====================
const props = defineProps<{
  /** 当前选中的分镜（null 表示未选中） */
  selectedStoryboard: Storyboard | null
  /** 是否有场景（用于"查看剧本"按钮显示） */
  hasCurrentScene: boolean
  /** 是否有分镜（用于底部操作栏显示） */
  hasStoryboards: boolean
  /** 当前选中分镜对应的有音频对白列表 */
  dialoguesWithAudio: Dialogue[]
  /** 当前正在播放的对白 ID */
  currentPlayingId: string | null
  /** 是否正在播放 */
  isPlaying: boolean
  /** 单个生成中标志 */
  generatingSingle: boolean
  /** 音频生成中标志 */
  generatingAudio: boolean
  /** 单镜合成中标志 */
  synthesizingSingle: boolean
}>()

// ==================== Emits ====================
const emit = defineEmits<{
  /** 打开图片预览 */
  (e: 'open-image-preview', storyboard: Storyboard): void
  /** 打开重新生成对话框 */
  (e: 'open-regenerate-dialog', storyboard: Storyboard): void
  /** 生成当前分镜音频 */
  (e: 'generate-audio'): void
  /** 打开剧本查看对话框 */
  (e: 'open-script-dialog'): void
  /** 切换音频播放/暂停 */
  (e: 'toggle-audio', dialogue: Dialogue): void
  /** 合成当前分镜视频 */
  (e: 'synthesize-single'): void
  /** 播放视频 */
  (e: 'play-video', storyboard: Storyboard): void
}>()

// ==================== 标签映射 ====================
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

const cameraAngleLabels: Record<string, string> = {
  eye_level: '平视',
  high: '俯视',
  low: '仰视',
  dutch: '倾斜',
  birds_eye: '鸟瞰',
  worms_eye: '虫视'
}

const cameraMovementLabels: Record<string, string> = {
  static: '固定',
  pan_left: '左摇',
  pan_right: '右摇',
  tilt_up: '上仰',
  tilt_down: '下俯',
  dolly_in: '推近',
  dolly_out: '拉远',
  zoom_in: '放大',
  zoom_out: '缩小',
  tracking: '跟拍',
  crane: '升降'
}

function getShotTypeLabel(type: string): string {
  return shotTypeLabels[type] || type
}

function getCameraAngleLabel(angle: string): string {
  return cameraAngleLabels[angle] || angle
}

function getCameraMovementLabel(movement: string): string {
  return cameraMovementLabels[movement] || movement
}
</script>

<style scoped lang="scss">
.operation-panel {
  width: 360px;
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color);

  .panel-header-fixed {
    padding: 12px 16px;
    border-bottom: 1px solid var(--el-border-color-light);
    flex-shrink: 0;

    h3 {
      margin: 0;
      font-size: 16px;
    }
  }

  .panel-content {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }

  .detail-section {
    padding: 12px;

    .description-text {
      max-height: 80px;
      overflow-y: auto;
      font-size: 13px;
      line-height: 1.5;
    }

    .detail-preview {
      margin-top: 12px;
      border-radius: 8px;
      overflow: hidden;
      background: #000;
      position: relative;
      cursor: pointer;

      img {
        width: 100%;
        display: block;
      }

      .preview-overlay {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        color: white;
        opacity: 0;
        transition: opacity 0.2s;
      }

      &:hover .preview-overlay {
        opacity: 1;
      }
    }

    .detail-actions {
      margin-top: 12px;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: center;
    }
  }

  .bottom-actions-fixed {
    padding: 12px 16px;
    border-top: 1px solid var(--el-border-color-light);
    background: var(--el-bg-color);
    flex-shrink: 0;

    .action-buttons {
      display: flex;
      gap: 12px;
    }

    .action-hint {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-top: 8px;
      font-size: 12px;
      color: var(--el-text-color-secondary);
    }
  }
}

.audio-section {
  padding: 8px 12px;

  h4 {
    margin: 0 0 8px 0;
    font-size: 14px;
    color: var(--el-text-color-secondary);
  }

  .audio-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 150px;
    overflow-y: auto;
  }

  .audio-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 8px;
    background: var(--el-fill-color-light);
    border-radius: 6px;
    transition: background 0.2s;

    &:hover {
      background: var(--el-fill-color);
    }

    .audio-info {
      flex: 1;
      min-width: 0;

      .audio-character {
        display: block;
        font-weight: 500;
        font-size: 12px;
        color: var(--el-text-color-primary);
      }

      .audio-text {
        display: block;
        font-size: 11px;
        color: var(--el-text-color-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    }

    .audio-controls {
      flex-shrink: 0;
      margin-left: 8px;
    }
  }

  .audio-empty {
    font-size: 12px;
    color: var(--el-text-color-placeholder);
    text-align: center;
    padding: 8px;
  }
}
</style>
