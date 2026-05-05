<template>
  <!--
    StageProductionTabContent · ⑤ 制作 stage（P5-T22 简化版 + P5-T23 接入）

    作为 EpisodeWorkbench 第 5 个 tab 的内容，承载分镜的多关键帧生成 + 重生成。

    布局：
    ┌─────────────────────────────────────────────────┐
    │ 上：分镜选择器（从当前 episode 全部 storyboards） │
    ├─────────────────────────────────────────────────┤
    │ 中：KeyframeGrid（选中分镜的关键帧网格）         │
    ├─────────────────────────────────────────────────┤
    │ 下：状态摘要（待 P5-T20 接入 VideoSegmentPanel） │
    └─────────────────────────────────────────────────┘

    重生成弹框（KeyframeRegenerateDialog）通过事件接入；
    视频片段 / 音频面板待后续 task 接入。
  -->
  <div class="stage-production-tab">
    <div class="storyboard-picker">
      <h4>分镜选择</h4>
      <div v-if="storyboards.length === 0" class="empty-hint">
        当前剧集还没有分镜。请先在分镜阶段生成分镜。
      </div>
      <div v-else class="storyboard-list-h">
        <div
          v-for="sb in storyboards"
          :key="sb.id"
          class="storyboard-pill"
          :class="{ active: selectedStoryboardId === sb.id }"
          @click="selectedStoryboardId = sb.id"
        >
          <span class="shot-number">镜 {{ sb.shotNumber }}</span>
          <span class="shot-meta">{{ sb.frameDescription?.slice(0, 20) ?? '' }}</span>
        </div>
      </div>
    </div>

    <div class="grid-container">
      <KeyframeGrid
        v-if="selectedStoryboardId"
        ref="gridRef"
        :storyboard-id="selectedStoryboardId"
        :keyframe-count="selectedKeyframeCount"
        @regenerate-request="onRegenerateRequest"
        @generate-all="onGenerateAll"
      />
      <el-empty
        v-else
        description="请先选择上方一个分镜"
        :image-size="120"
      />
    </div>

    <!-- P5-T20 视频片段生成面板（关键帧后接） -->
    <div v-if="selectedStoryboard" class="video-section">
      <VideoSegmentPanel
        :storyboard="selectedStoryboard"
        @generated="onVideoGenerated"
      />
    </div>

    <KeyframeRegenerateDialog
      v-if="regenDialogProps && selectedStoryboardId"
      v-model="regenDialogVisible"
      :storyboard-id="selectedStoryboardId"
      :keyframes="currentKeyframes"
      :keyframe-count="selectedKeyframeCount"
      :frame-index="regenDialogProps.frameIndex"
      :keyframe-id="regenDialogProps.keyframeId"
      :frame-role="regenDialogProps.frameRole"
      @regenerated="onRegenerated"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * StageProductionTabContent（P5-T22 简化版 + P5-T23 接入）
 *
 * Props：
 *   - storyboards：当前剧集所有分镜（从父组件 storyboardStore 传入）
 *
 * 内部状态：
 *   - selectedStoryboardId：当前展示的分镜 ID
 *   - currentKeyframes：当前分镜的全部关键帧（regenDialog 用映射 frameIndex → keyframeId）
 *   - regenDialogVisible / regenDialogProps：弹框状态
 */
import { computed, ref, watch } from 'vue'
import KeyframeGrid from './KeyframeGrid.vue'
import KeyframeRegenerateDialog from './KeyframeRegenerateDialog.vue'
import VideoSegmentPanel from './VideoSegmentPanel.vue'

interface StoryboardLite {
  id: string
  shotNumber: number
  frameDescription?: string
  keyframeCount?: number
}

interface KeyframeLite {
  id: string
  frameIndex: number
  frameRole: 'start' | 'middle' | 'end' | 'extra'
}

const props = defineProps<{
  storyboards: StoryboardLite[]
}>()

const selectedStoryboardId = ref<string | null>(null)
const gridRef = ref<{ reload: () => Promise<void> } | null>(null)
const currentKeyframes = ref<KeyframeLite[]>([])

const regenDialogVisible = ref(false)
const regenDialogProps = ref<{
  frameIndex: number
  keyframeId: string
  frameRole: 'start' | 'middle' | 'end' | 'extra'
} | null>(null)

const selectedStoryboard = computed(() =>
  props.storyboards.find((s) => s.id === selectedStoryboardId.value) ?? null,
)

const selectedKeyframeCount = computed(
  () => selectedStoryboard.value?.keyframeCount ?? 3,
)

// 默认选中第一个分镜
watch(
  () => props.storyboards,
  (sbs) => {
    if (
      sbs.length > 0 &&
      (!selectedStoryboardId.value ||
        !sbs.some((s) => s.id === selectedStoryboardId.value))
    ) {
      selectedStoryboardId.value = sbs[0].id
    }
    if (sbs.length === 0) selectedStoryboardId.value = null
  },
  { immediate: true },
)

async function onRegenerateRequest(payload: {
  keyframeId: string
  frameIndex: number
}): Promise<void> {
  // 重新读 keyframes 拿到 frameRole + 同步 currentKeyframes 给弹框
  await refreshKeyframes()
  const kf = currentKeyframes.value.find((k) => k.id === payload.keyframeId)
  if (!kf) return
  regenDialogProps.value = {
    keyframeId: payload.keyframeId,
    frameIndex: payload.frameIndex,
    frameRole: kf.frameRole,
  }
  regenDialogVisible.value = true
}

async function onGenerateAll(): Promise<void> {
  await refreshKeyframes()
}

async function onRegenerated(): Promise<void> {
  // 弹框完成 → grid reload
  await gridRef.value?.reload()
  await refreshKeyframes()
}

function onVideoGenerated(_videoPath: string): void {
  // 视频片段生成完成；后续 follow-up 可触发父组件 storyboardStore 刷新
  void _videoPath
}

async function refreshKeyframes(): Promise<void> {
  if (!selectedStoryboardId.value) {
    currentKeyframes.value = []
    return
  }
  try {
    const api = (window as any).electronAPI?.episodeProduction
    if (!api?.listKeyframes) return
    const resp = await api.listKeyframes(selectedStoryboardId.value)
    if (resp?.success && Array.isArray(resp.data)) {
      currentKeyframes.value = resp.data as KeyframeLite[]
    }
  } catch {
    // 静默
  }
}

watch(selectedStoryboardId, () => refreshKeyframes())
</script>

<style scoped>
.stage-production-tab {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  height: 100%;
  overflow-y: auto;
}

.storyboard-picker h4 {
  margin: 0 0 8px 0;
  font-size: 14px;
  color: var(--el-text-color-primary);
}

.empty-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  padding: 12px 0;
}

.storyboard-list-h {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.storyboard-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  font-size: 12px;
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.15s;
}

.storyboard-pill:hover {
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary-light-5);
}

.storyboard-pill.active {
  background: var(--el-color-primary);
  border-color: var(--el-color-primary);
  color: #fff;
}

.shot-number {
  font-weight: 500;
}

.shot-meta {
  color: var(--el-text-color-secondary);
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.storyboard-pill.active .shot-meta {
  color: rgba(255, 255, 255, 0.85);
}

.grid-container {
  flex: 1;
}

.video-section {
  margin-top: 12px;
}
</style>
