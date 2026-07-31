<template>
  <!--
    PrototypeOutputPanel · 原型中间输出面板（三模式切换）

    mode=list：上方图片网格（AI 生成）+ 下方分镜规划列表（按 videoPath 判断已生成/待生成占位）
    mode=image：PrototypeImageEditor（图片编辑）
    mode=storyboard：PrototypeStoryboardEditor（分镜编辑）
  -->
  <section class="proto-output-panel">
    <!-- list 模式：输出列表 -->
    <template v-if="mode === 'list'">
      <header class="panel-header">
        <span class="panel-title">输出</span>
        <span class="panel-meta">{{ images.length }} 张图片 · {{ storyboards.length }} 个分镜</span>
      </header>

      <div class="panel-body">
        <!-- 图片区 -->
        <section class="out-section">
          <div class="section-header">
            <span>🖼️ 图片</span>
          </div>
          <div v-if="images.length === 0" class="section-empty">
            暂无图片
          </div>
          <div v-else class="image-grid">
            <div
              v-for="img in images"
              :key="img.id"
              class="image-card"
              @click="$emit('select-image', img)"
            >
              <img :src="toImageUrl(img.filePath)" :alt="img.prompt ?? '图片'" @error="onImgError" />
              <div class="image-meta">{{ img.width }}×{{ img.height }}</div>
            </div>
          </div>
        </section>

        <!-- 分镜规划区 -->
        <section class="out-section">
          <div class="section-header">
            <span>🎬 分镜规划</span>
          </div>
          <div v-if="storyboards.length === 0" class="section-empty">
            暂无分镜
          </div>
          <div v-else class="storyboard-list">
            <div
              v-for="sb in storyboards"
              :key="sb.id"
              class="storyboard-card"
              :class="{ 'is-generated': !!sb.videoPath, 'is-selected': sb.id === selectedStoryboardId }"
              @click="$emit('select-storyboard', sb.id)"
            >
              <div class="sb-thumb">
                <video
                  v-if="sb.videoPath"
                  :src="toImageUrl(sb.videoPath)"
                  muted
                  preload="metadata"
                />
                <div v-else class="sb-placeholder">
                  <el-icon><VideoCamera /></el-icon>
                  <span>视频待生成</span>
                </div>
              </div>
              <div class="sb-info">
                <div class="sb-title">分镜 {{ shotLabel(sb) }}</div>
                <div class="sb-desc">{{ (sb.frameDescription || '').slice(0, 60) || '（无描述）' }}</div>
                <div class="sb-tags">
                  <span class="tag">{{ sb.duration ?? 3 }}s</span>
                  <span v-if="sb.videoPath" class="tag tag-done">已生成</span>
                  <span v-else class="tag tag-todo">待生成</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </template>

    <!-- image 模式：图片编辑 -->
    <PrototypeImageEditor
      v-else-if="mode === 'image' && selectedImage"
      :image="selectedImage"
      @back="$emit('back')"
      @regenerated="$emit('image-regenerated', $event)"
    />

    <!-- storyboard 模式：分镜编辑 -->
    <PrototypeStoryboardEditor
      v-else-if="mode === 'storyboard'"
      :storyboard="selectedStoryboard"
      :edit-draft="editDraft"
      :entity-list="entityList"
      :keyframe-images="keyframeImages"
      :provider-config-id="providerConfigId"
      :model-id="modelId"
      :selected-scene-index="selectedSceneIndex"
      :submitting="submitting"
      @back="$emit('back')"
      @edit-change="(k, v) => $emit('edit-change', k, v)"
      @save="$emit('save')"
      @submit="$emit('submit')"
    />
  </section>
</template>

<script setup lang="ts">
import { VideoCamera } from '@element-plus/icons-vue'
import PrototypeImageEditor from './PrototypeImageEditor.vue'
import PrototypeStoryboardEditor from './PrototypeStoryboardEditor.vue'
import { toImageUrl } from '@/utils/asset-url'
import type { EntityRefMeta } from '../shared/entity-ref-parser'
import type { ImageRecord } from '../../../../../shared/types/image.types'

defineProps<{
  mode: 'list' | 'image' | 'storyboard'
  images: ImageRecord[]
  storyboards: any[]
  selectedImage: ImageRecord | null
  selectedStoryboard: any
  selectedStoryboardId?: string | null
  editDraft: any
  entityList: EntityRefMeta[]
  keyframeImages: ImageRecord[]
  providerConfigId?: string | null
  modelId?: string | null
  selectedScene?: any
  selectedSceneIndex?: number
  submitting?: boolean
}>()

defineEmits<{
  'select-image': [image: ImageRecord]
  'select-storyboard': [id: string]
  back: []
  'edit-change': [key: string, value: any]
  save: []
  submit: []
  'image-regenerated': [image: ImageRecord]
}>()

function onImgError(e: Event): void {
  const img = e.target as HTMLImageElement
  img.style.display = 'none'
}

function shotLabel(sb: any): string {
  return String(sb.shotNumber ?? '?')
}
</script>

<style scoped lang="scss">
.proto-output-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--el-bg-color-page);
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  padding: 10px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);

  .panel-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--el-text-color-primary);
    flex: 1;
  }

  .panel-meta {
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
}

.panel-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.out-section {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  overflow: hidden;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  background: var(--el-fill-color-light);
  border-bottom: 1px solid var(--el-border-color-lighter);

  .section-hint {
    font-size: 11px;
    font-weight: 400;
    color: var(--el-text-color-secondary);
  }
}

.section-empty {
  padding: 20px 12px;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  text-align: center;
}

.image-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 8px;
  padding: 10px;
}

.image-card {
  cursor: pointer;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  overflow: hidden;
  background: var(--el-fill-color-light);
  transition: border-color 0.15s, transform 0.15s;

  &:hover {
    border-color: var(--el-color-primary-light-5);
    transform: translateY(-1px);
  }

  img {
    width: 100%;
    aspect-ratio: 1;
    object-fit: cover;
    display: block;
  }

  .image-meta {
    font-size: 11px;
    color: var(--el-text-color-secondary);
    padding: 3px 6px;
    text-align: center;
    background: var(--el-bg-color);
  }
}

.storyboard-list {
  display: flex;
  flex-direction: column;
  padding: 8px;
  gap: 6px;
}

.storyboard-card {
  display: flex;
  gap: 10px;
  padding: 8px;
  cursor: pointer;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  background: var(--el-bg-color);
  transition: border-color 0.15s;

  &:hover {
    border-color: var(--el-color-primary-light-5);
  }

  &.is-selected {
    border-color: var(--el-color-primary);
    box-shadow: 0 0 0 2px var(--el-color-primary-light-8);
  }

  .sb-thumb {
    width: 96px;
    height: 64px;
    flex-shrink: 0;
    background: var(--el-fill-color);
    border-radius: 4px;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;

    video {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }

  .sb-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    color: var(--el-text-color-placeholder);
    font-size: 11px;

    .el-icon {
      font-size: 20px;
    }
  }

  .sb-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .sb-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  .sb-desc {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .sb-tags {
    display: flex;
    gap: 4px;
    margin-top: 2px;
  }

  .tag {
    font-size: 11px;
    padding: 1px 6px;
    border-radius: 999px;
    background: var(--el-fill-color);
    color: var(--el-text-color-secondary);

    &.tag-done {
      background: var(--el-color-success-light-9);
      color: var(--el-color-success);
    }

    &.tag-todo {
      background: var(--el-color-warning-light-9);
      color: var(--el-color-warning);
    }
  }
}
</style>
