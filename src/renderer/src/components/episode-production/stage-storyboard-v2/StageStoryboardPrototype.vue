<template>
  <!--
    StageStoryboardPrototype · 分镜简化原型 v2（三栏布局）

    左侧：资产（角色/物品/场景，点击可引用）
    中间：输出窗口（list 模式：图片网格 + 分镜规划；点击图片→图片编辑；点击分镜→分镜编辑）
    右侧：AI 对话（文字对话 + 🎨生成图片，生成的图片进中间输出区，可在分镜提示词中引用为关键帧）

    取消"关键帧"独立概念：关键帧 = AI 对话生成的图片，在分镜编辑界面的提示词中 @引用。
    复用父组件 editDraft/entityList/selectedStoryboard，通过 @edit-change 标 dirty（不走 syncFrameDescriptionFromForm）。
  -->
  <div class="stage-storyboard-prototype">
    <!-- 紧凑顶部栏 -->
    <header class="proto-header">
      <span class="proto-title">④ 分镜（原型）</span>
      <span class="proto-subtitle">{{ headerSubtitle }}</span>
      <div class="proto-actions">
        <el-button type="primary" size="small" :disabled="!selectedStoryboard" @click="$emit('save')">
          保存分镜
        </el-button>
      </div>
    </header>

    <!-- 三栏主体 -->
    <div class="proto-columns">
      <!-- 左：资产 -->
      <div class="col col-asset">
        <PrototypeAssetPanel
          :project-id="projectId"
          :selected-id="selectedAssetId"
          @select-asset="onSelectAsset"
        />
      </div>

      <!-- 中：输出 -->
      <div class="col col-output">
        <PrototypeOutputPanel
          :mode="centerMode"
          :images="sessionImages"
          :storyboards="storyboards"
          :selected-image="selectedImage"
          :selected-storyboard="selectedStoryboard"
          :selected-storyboard-id="selectedStoryboard?.id ?? null"
          :edit-draft="editDraft"
          :entity-list="entityList"
          :keyframe-images="sessionImages"
          :provider-config-id="providerConfigId"
          :model-id="modelId"
          :selected-scene="selectedScene"
          :selected-scene-index="selectedSceneIndex"
          :submitting="submittingVideo"
          @select-image="onSelectImage"
          @select-storyboard="onSelectStoryboard"
          @back="onBackToList"
          @edit-change="(k, v) => $emit('edit-change', k, v)"
          @save="$emit('save')"
          @image-regenerated="onImageRegenerated"
          @submit="$emit('submit')"
        />
      </div>

      <!-- 右：AI 对话 -->
      <div class="col col-chat">
        <PrototypeChatPanel @image-generated="onImageGenerated" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import PrototypeAssetPanel from './PrototypeAssetPanel.vue'
import PrototypeOutputPanel from './PrototypeOutputPanel.vue'
import PrototypeChatPanel from './PrototypeChatPanel.vue'
import { useEpProjectStore, useEpStoryboardStore } from '@/stores/episode-production'
import type { EntityRefMeta } from '../shared/entity-ref-parser'
import type { ImageRecord } from '../../../../../shared/types/image.types'

const props = defineProps<{
  /** 父组件 StageStoryboardViewV2 的 editDraft（reactive 对象，按引用共享） */
  editDraft: any
  entityList: EntityRefMeta[]
  selectedStoryboard: any
  selectedScene: any
  selectedSceneIndex?: number
  providerConfigId?: string | null
  modelId?: string | null
  /** 提交（生成视频）中，透传给分镜编辑器按钮 loading */
  submittingVideo?: boolean
}>()

const emit = defineEmits<{
  /** 字段变更：父组件据此 mutate editDraft + 标 dirty（不触发 syncFrameDescriptionFromForm） */
  'edit-change': [key: string, value: any]
  save: []
  /** 切换选中的分镜（父组件据此切换 selectedStoryboardId + 重建 editDraft） */
  'select-storyboard': [id: string]
  /** 提交分镜（保存 + 生成视频） */
  submit: []
}>()

const projectStore = useEpProjectStore()
const storyboardStore = useEpStoryboardStore()

const projectId = computed<string | null>(() => projectStore.currentProject?.id ?? null)
const storyboards = computed<any[]>(() => storyboardStore.storyboards ?? [])

/** 中间输出区模式：list=输出列表，image=图片编辑，storyboard=分镜编辑 */
const centerMode = ref<'list' | 'image' | 'storyboard'>('list')
/** 当前选中的图片（image 模式） */
const selectedImage = ref<ImageRecord | null>(null)
/** 本次会话生成的图片（既是输出图片，也是可引用的关键帧池） */
const sessionImages = ref<ImageRecord[]>([])
/** 当前选中资产 ID（左侧高亮） */
const selectedAssetId = ref<string | null>(null)

const headerSubtitle = computed(() => {
  const sceneIdx = (props.selectedSceneIndex ?? 0) + 1
  const sceneLoc = props.selectedScene?.location ?? '?'
  const sbCount = storyboards.value.length
  return `场景 ${sceneIdx} · @${sceneLoc} · ${sbCount} 个分镜 · ${sessionImages.value.length} 张图`
})

function onSelectAsset(payload: { kind: string; asset: { bindingId: string; name: string; mainImagePath?: string | null } }): void {
  selectedAssetId.value = payload.asset.bindingId
  const imgPath = payload.asset.mainImagePath
  if (!imgPath) {
    ElMessage.warning('该资产暂无主图，无法预览')
    return
  }
  // 点击资产图片 -> 中间切换为图片编辑界面（结构与视频编辑类似：上预览 + 下提示词）
  selectedImage.value = {
    id: `asset-${payload.asset.bindingId}`,
    filePath: imgPath,
    fileName: payload.asset.name,
    prompt: '',
    favorite: false,
    createdAt: new Date(),
    status: 'completed',
  } as ImageRecord
  centerMode.value = 'image'
}

function onSelectImage(img: ImageRecord): void {
  selectedImage.value = img
  centerMode.value = 'image'
}

function onSelectStoryboard(id: string): void {
  emit('select-storyboard', id)
  centerMode.value = 'storyboard'
}

function onBackToList(): void {
  centerMode.value = 'list'
}

function onImageGenerated(img: ImageRecord): void {
  sessionImages.value.unshift(img)
}

function onImageRegenerated(img: ImageRecord): void {
  sessionImages.value.unshift(img)
  selectedImage.value = img
}
</script>

<style scoped lang="scss">
.stage-storyboard-prototype {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--el-bg-color-page);
}

.proto-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-lighter);

  .proto-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  .proto-subtitle {
    flex: 1;
    font-size: 12px;
    color: var(--el-text-color-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.proto-columns {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 240px 1fr 380px;
  gap: 12px;
  padding: 12px;
  overflow: hidden;
  background: var(--el-bg-color-page);
}

.col {
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}
</style>
