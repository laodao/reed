<template>
  <!--
    PrototypeStoryboardEditor · 分镜编辑界面（原型中间输出 · storyboard 模式）

    顶部：视频预览卡片（标题=分镜名，只显示视频/占位，无生成按钮/最终提示词/调整方向）
    中部：关键帧缩略图行（点击插入 @关键帧N 到提示词）
    下部：PromptEditor（参数 chip + 自由文本）+ 提交按钮（点击=保存+生成视频）
    取消"关键帧"独立概念：关键帧 = AI 对话生成的图片，在此引用进提示词。
  -->
  <div class="proto-storyboard-editor">
    <!-- 视频预览卡片（标题=分镜名 + 右侧关闭图标回列表） -->
    <div class="video-card">
      <header class="card-title-bar">
        <span class="card-title">分镜 {{ shotId }}</span>
        <el-icon class="card-close" @click="$emit('back')"><Close /></el-icon>
      </header>
      <div class="video-stage">
        <video
          v-if="storyboard?.videoPath"
          :src="toImageUrl(storyboard.videoPath)"
          controls
          class="video-player"
        />
        <div v-else class="video-placeholder">
          <el-icon class="ph-icon"><VideoCamera /></el-icon>
          <span class="ph-text">视频待生成</span>
          <span class="ph-hint">编辑下方提示词后点「提交」生成</span>
        </div>
      </div>
    </div>

    <!-- 关键帧引用行（仅缩略图，无提示文字） -->
    <div v-if="keyframeImages.length > 0" class="keyframe-row">
      <div
        v-for="(kf, idx) in keyframeImages"
        :key="kf.id"
        class="kf-chip"
        :title="kf.prompt ?? `关键帧 ${idx + 1}`"
        @click="onRefKeyframe(kf, idx)"
      >
        <img :src="toImageUrl(kf.filePath)" :alt="`关键帧 ${idx + 1}`" />
        <span class="kf-name">{{ idx + 1 }}</span>
      </div>
    </div>

    <!-- 提示词编辑器（参数 chip + 自由文本） -->
    <div class="prompt-section">
      <PromptEditor
        :model-value="editDraft.frameDescription"
        :entities="entityList"
        :shot-type="editDraft.shotType"
        :camera-angle="editDraft.cameraAngle"
        :camera-movement="editDraft.cameraMovement"
        :transition-type="editDraft.transitionType"
        :transition-duration="editDraft.transitionDuration"
        :transition-direction="editDraft.transitionDirection"
        @update:model-value="onField('frameDescription', $event)"
        @update:shot-type="onField('shotType', $event)"
        @update:camera-angle="onField('cameraAngle', $event)"
        @update:camera-movement="onField('cameraMovement', $event)"
        @update:transition-type="onField('transitionType', $event)"
        @update:transition-duration="onField('transitionDuration', $event)"
        @update:transition-direction="onField('transitionDirection', $event)"
      />
    </div>

    <!-- 提交按钮（保存 + 生成视频） -->
    <div class="submit-row">
      <el-button
        type="primary"
        :loading="submitting"
        :disabled="!storyboard"
        @click="$emit('submit')"
      >
        提交
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Close, VideoCamera } from '@element-plus/icons-vue'
import PromptEditor from './PromptEditor.vue'
import { toImageUrl } from '@/utils/asset-url'
import type { EntityRefMeta } from '../shared/entity-ref-parser'
import type { ImageRecord } from '../../../../../shared/types/image.types'

const props = defineProps<{
  storyboard: any
  editDraft: any
  entityList: EntityRefMeta[]
  /** 可引用的关键帧图片（AI 对话生成的图片） */
  keyframeImages: ImageRecord[]
  /** 提交（生成视频）中 */
  submitting?: boolean
  selectedSceneIndex?: number
}>()

const emit = defineEmits<{
  back: []
  'edit-change': [key: string, value: any]
  submit: []
}>()

const shotId = computed(() => {
  if (!props.storyboard) return ''
  const sceneIdx = (props.selectedSceneIndex ?? 0) + 1
  return `${sceneIdx}.${props.storyboard.shotNumber}`
})

function onField(key: string, value: any): void {
  emit('edit-change', key, value)
}

/** 点击关键帧 -> 在 frameDescription 末尾追加 @关键帧:N 引用标记 */
function onRefKeyframe(_kf: ImageRecord, idx: number): void {
  const ref = `@关键帧${idx + 1} `
  const cur = props.editDraft.frameDescription ?? ''
  emit('edit-change', 'frameDescription', cur + ref)
}
</script>

<style scoped lang="scss">
.proto-storyboard-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 12px;
  overflow: hidden;
}

.video-card {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  overflow: hidden;
}

.card-title-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--el-fill-color-light);
  border-bottom: 1px solid var(--el-border-color-lighter);

  .card-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  .card-close {
    cursor: pointer;
    font-size: 16px;
    color: var(--el-text-color-secondary);
    transition: color 0.15s;

    &:hover {
      color: var(--el-color-danger);
    }
  }
}

.video-stage {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--el-fill-color);
  overflow: hidden;

  .video-player {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
}

.video-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: var(--el-text-color-placeholder);

  .ph-icon {
    font-size: 40px;
  }

  .ph-text {
    font-size: 14px;
  }

  .ph-hint {
    font-size: 12px;
    color: var(--el-text-color-placeholder);
  }
}

.keyframe-row {
  flex-shrink: 0;
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding: 2px 0;
}

.kf-chip {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  overflow: hidden;
  background: var(--el-bg-color);
  transition: border-color 0.15s;

  &:hover {
    border-color: var(--el-color-warning);
  }

  img {
    width: 56px;
    height: 56px;
    object-fit: cover;
  }

  .kf-name {
    font-size: 11px;
    color: var(--el-text-color-regular);
    padding: 1px 0;
  }
}

.prompt-section {
  flex-shrink: 0;
  height: 240px;
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 10px;
  overflow: hidden;
}

.submit-row {
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
}
</style>
