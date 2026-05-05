<template>
  <!--
    BottomTimeline · 底部迷你时间线（spec §2.1 第 420-421 行 · P6-T15）

    spec 原型：
      ┌─────────────────────────────────────────────────────────────────┐
      │ 底部：迷你时间线（始终可见，预览当前已生产内容）                │
      │ ▰▰▰▰▱▱▱▱▱▱▱▱  3/12 分镜已出片  ⏵ 试播                     │
      └─────────────────────────────────────────────────────────────────┘

    - 横向进度块：每个分镜 = 一个 cell（已出片填充色 / 未出片描边）
    - 文字：「X/N 分镜已出片」
    - ⏵ 试播按钮：跳到 ⑥ 合成 stage（让用户导出 / 播放上次 export）
    - 每个 cell hover 显示 tooltip（镜头 N · 已出片 / 未出片）
    - 点 cell → emit('select-storyboard', id)，父组件可跳到 ⑤ 制作 tab + 选中
  -->
  <div class="bottom-timeline">
    <div v-if="loading" class="timeline-loading">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>加载分镜进度...</span>
    </div>

    <div v-else-if="errorMessage" class="timeline-error">
      <el-icon><Warning /></el-icon>
      {{ errorMessage }}
    </div>

    <div v-else-if="!episodeScriptId" class="timeline-empty">
      请先选择剧集
    </div>

    <div v-else-if="totalShots === 0" class="timeline-empty">
      尚无分镜（请先在 ④ 分镜 stage 生成）
    </div>

    <template v-else>
      <div class="timeline-cells" :title="cellGroupTooltip">
        <div
          v-for="cell in cells"
          :key="cell.id"
          class="timeline-cell"
          :class="{ filled: cell.hasVideo }"
          :title="cellTitle(cell)"
          @click="onCellClick(cell)"
        />
      </div>
      <div class="timeline-status">
        <strong>{{ generatedCount }}</strong>
        <span class="slash">/</span>
        <span>{{ totalShots }}</span>
        <span class="status-label">分镜已出片</span>
      </div>
      <el-button
        size="small"
        type="primary"
        :icon="VideoPlay"
        @click="$emit('preview')"
        :disabled="generatedCount === 0"
        :title="generatedCount === 0 ? '尚无已出片分镜' : '跳到 ⑥ 合成 stage 试播'"
      >
        试播
      </el-button>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * BottomTimeline（P6-T15）
 *
 * Props：
 *   - episodeScriptId：当前剧集的 episode_script.id（null 时显示 empty）
 *
 * Emits：
 *   - preview：用户点试播 → 父组件应跳 ⑥ 合成 tab（让用户 export / 播放）
 *   - select-storyboard(id)：用户点单个 cell → 父组件可跳 ⑤ 制作 tab 选中
 *
 * 内部：调 ep:build-timeline IPC 拉分镜 + missingVideo 列表，
 * 计算 X/N 进度。当 episodeScriptId 变化时刷新。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { ElButton, ElIcon } from 'element-plus'
import { Loading, VideoPlay, Warning } from '@element-plus/icons-vue'

interface TimelineShot {
  storyboardId: string
  shotNumber: number
  videoPath: string | null
  durationSec: number
}

interface TimelineScene {
  sceneScriptId: string
  shots: TimelineShot[]
}

interface BuildTimelineResult {
  episodeScriptId: string
  scenes: TimelineScene[]
  totalDurationSec: number
  missingVideoStoryboardIds: string[]
}

interface CellInfo {
  id: string
  shotNumber: number
  hasVideo: boolean
}

const props = defineProps<{
  episodeScriptId: string | null
}>()

const emit = defineEmits<{
  (e: 'preview'): void
  (e: 'select-storyboard', id: string): void
}>()

const loading = ref(false)
const errorMessage = ref<string | null>(null)
const timeline = ref<BuildTimelineResult | null>(null)

const cells = computed<CellInfo[]>(() => {
  if (!timeline.value) return []
  const list: CellInfo[] = []
  for (const scene of timeline.value.scenes) {
    for (const shot of scene.shots) {
      list.push({
        id: shot.storyboardId,
        shotNumber: shot.shotNumber,
        hasVideo: !!shot.videoPath,
      })
    }
  }
  return list
})

const totalShots = computed(() => cells.value.length)
const generatedCount = computed(() =>
  cells.value.filter((c) => c.hasVideo).length,
)

const cellGroupTooltip = computed(
  () => `分镜进度：${generatedCount.value} / ${totalShots.value} 已出片`,
)

function cellTitle(c: CellInfo): string {
  return `镜头 ${c.shotNumber} · ${c.hasVideo ? '已出片' : '未出片'}`
}

function onCellClick(c: CellInfo): void {
  emit('select-storyboard', c.id)
}

async function loadTimeline(): Promise<void> {
  if (!props.episodeScriptId) {
    timeline.value = null
    return
  }
  loading.value = true
  errorMessage.value = null
  try {
    const api = (window as any).electronAPI?.episodeProduction
    if (!api?.buildTimeline) {
      throw new Error('IPC buildTimeline 未暴露')
    }
    const resp = await api.buildTimeline(props.episodeScriptId)
    if (!resp?.success) {
      throw new Error(resp?.error || '加载时间线失败')
    }
    timeline.value = resp.data as BuildTimelineResult
  } catch (e: any) {
    errorMessage.value = e?.message ?? String(e)
  } finally {
    loading.value = false
  }
}

watch(() => props.episodeScriptId, () => loadTimeline())
onMounted(loadTimeline)

defineExpose({ reload: loadTimeline })
</script>

<style scoped>
.bottom-timeline {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background: var(--el-bg-color);
  border-top: 1px solid var(--el-border-color-light);
  min-height: 48px;
  flex-shrink: 0;
}

.timeline-loading,
.timeline-error,
.timeline-empty {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.timeline-error {
  color: var(--el-color-danger);
}

.timeline-cells {
  display: flex;
  flex: 1;
  gap: 2px;
  align-items: center;
  overflow-x: auto;
  min-width: 0;
}

.timeline-cell {
  flex: 1;
  min-width: 8px;
  max-width: 32px;
  height: 20px;
  background: var(--el-fill-color);
  border: 1px solid var(--el-border-color);
  border-radius: 2px;
  cursor: pointer;
  transition: background 0.15s, transform 0.1s;
}

.timeline-cell.filled {
  background: var(--el-color-success);
  border-color: var(--el-color-success);
}

.timeline-cell:hover {
  transform: scaleY(1.2);
  border-color: var(--el-color-primary);
}

.timeline-status {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  flex-shrink: 0;
}

.timeline-status strong {
  font-size: 16px;
  color: var(--el-color-success);
  font-weight: 600;
}

.timeline-status .slash {
  color: var(--el-text-color-secondary);
}

.timeline-status .status-label {
  margin-left: 4px;
  color: var(--el-text-color-regular);
}
</style>
