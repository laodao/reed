<template>
  <!--
    StageProgressBar · 顶部 6 段阶段进度条（spec §2.1 + §2.2 · P6-T13）

    spec §2.1 形态 D 顶部：
      ① 内容 ── ② 资产 ── ③ 剧本 ── ④ 分镜 ── ⑤ 画面+音频 ── ⑥ 合成
        ✓        ✓        ●         ○         ○            ○

    每段视觉标记（spec §2.2）：
      ✓ = 已完成（status order < current）
      ● = 当前阶段（status order == current）
      ○ = 未到（status order > current）

    交互（spec §2.3 软引导）：
      - 点击任一段 → emit('navigate-stage', stageStatus)
      - 父组件用 stage-gate 决定能否跳；本组件不做门控
  -->
  <div class="stage-progress-bar" :class="{ loading: loading }">
    <div v-if="loading" class="loading-state">
      <el-icon class="is-loading"><Loading /></el-icon>
      加载阶段进度...
    </div>

    <div v-else-if="errorMessage" class="error-state">
      <el-icon><Warning /></el-icon>
      {{ errorMessage }}
    </div>

    <div v-else-if="progress" class="bar-track">
      <div
        v-for="(stage, idx) in progress.stages"
        :key="stage.stage"
        class="stage-segment"
        :class="[
          `mark-${markCssClass(stage.mark)}`,
          { current: stage.mark === '●', complete: stage.mark === '✓' },
        ]"
        @click="onStageClick(stage)"
        :title="stageTooltip(stage)"
      >
        <div class="segment-circle">
          <span class="mark-icon">{{ stage.mark }}</span>
        </div>
        <div class="segment-label">{{ stage.label }}</div>
        <div class="segment-meta">
          <span v-if="stage.complete" class="meta-complete">已完成</span>
          <span v-else-if="stage.gapCount > 0" class="meta-gaps">
            缺 {{ stage.gapCount }} 项
          </span>
          <span v-else-if="stage.mark === '●'" class="meta-current">进行中</span>
          <span v-else class="meta-pending">未开始</span>
        </div>
        <!-- 阶段间连接线（最后一段不画） -->
        <div
          v-if="idx < progress.stages.length - 1"
          class="segment-connector"
          :class="{ 'connector-active': stage.mark === '✓' }"
        />
      </div>

      <!-- 整剧总进度 -->
      <div class="overall-progress">
        <span class="overall-label">总进度</span>
        <el-progress
          :percentage="Math.round(progress.overallProgress * 100)"
          :stroke-width="8"
          :show-text="true"
          :status="progressStatus"
          class="overall-bar"
        />
      </div>
    </div>

    <div v-else class="empty-state">请选择剧集</div>
  </div>
</template>

<script setup lang="ts">
/**
 * StageProgressBar（P6-T13）
 *
 * Props：
 *   - episodeId：当前剧集 ID（null 时显示 empty 状态）
 *
 * Emits：
 *   - navigate-stage(status)：用户点击某段；父组件决定如何跳转
 *
 * 内部：调 ep:calculate-episode-progress IPC 获取 6 阶段进度。
 * 当 episodeId 变化或父组件触发 reload() 时刷新。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElProgress } from 'element-plus'
import { Loading, Warning } from '@element-plus/icons-vue'
import type {
  EpisodeProgress,
  StageProgress,
  EpisodeStatus,
} from '../../../../../shared/types/episode-production'

const props = defineProps<{
  episodeId: string | null
}>()

const emit = defineEmits<{
  (e: 'navigate-stage', status: EpisodeStatus): void
}>()

const progress = ref<EpisodeProgress | null>(null)
const loading = ref(false)
const errorMessage = ref<string | null>(null)

const progressStatus = computed<'success' | 'warning' | undefined>(() => {
  const p = progress.value?.overallProgress ?? 0
  if (p >= 1) return 'success'
  if (p > 0) return 'warning'
  return undefined
})

function markCssClass(mark: '✓' | '●' | '○'): 'done' | 'current' | 'pending' {
  if (mark === '✓') return 'done'
  if (mark === '●') return 'current'
  return 'pending'
}

function stageTooltip(s: StageProgress): string {
  if (s.complete) return `${s.label} · 已完成`
  if (s.mark === '●') return `${s.label} · 进行中（缺 ${s.gapCount} 项）`
  if (s.gapCount > 0) return `${s.label} · 缺 ${s.gapCount} 项`
  return `${s.label} · 未开始`
}

function onStageClick(s: StageProgress): void {
  emit('navigate-stage', s.stage)
}

async function loadProgress(): Promise<void> {
  if (!props.episodeId) {
    progress.value = null
    return
  }
  loading.value = true
  errorMessage.value = null
  try {
    const api = (window as any).electronAPI?.episodeProduction
    if (!api?.calculateEpisodeProgress) {
      throw new Error('IPC calculateEpisodeProgress 未暴露')
    }
    const resp = await api.calculateEpisodeProgress(props.episodeId)
    if (!resp?.success) {
      throw new Error(resp?.error || '获取阶段进度失败')
    }
    progress.value = resp.data as EpisodeProgress
  } catch (e: any) {
    errorMessage.value = e?.message ?? String(e)
    ElMessage.error(`加载阶段进度失败：${errorMessage.value}`)
  } finally {
    loading.value = false
  }
}

watch(() => props.episodeId, () => loadProgress())
onMounted(loadProgress)

// 让父组件能在剧集状态变化后主动 reload
defineExpose({ reload: loadProgress })
</script>

<style scoped lang="scss">
/*
 * FU6-T1 紧凑顶部 stepper：
 *   原版 64px 高 + 圆 32px + 三行（圆/label/meta），占据屏幕过多。
 *   改成单行 stepper：32px 高 + 圆 22px + label/meta 同行排列。
 *   节省 ~32px 垂直空间，让主区视野更大。
 */
.stage-progress-bar {
  display: flex;
  align-items: center;
  padding: 4px 16px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-light);
  gap: 12px;
  min-height: 36px;
}

.loading-state,
.error-state,
.empty-state {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  padding: 8px 0;
}

.error-state {
  color: var(--el-color-danger);
}

.bar-track {
  display: flex;
  align-items: center;
  flex: 1;
  gap: 0;
}

.stage-segment {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  position: relative;
  cursor: pointer;
  padding: 2px 8px;
  min-width: 0;
  flex: 1;
  transition: opacity 0.15s;

  &:hover {
    opacity: 0.85;
  }
}

.segment-circle {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  background: var(--el-fill-color);
  color: var(--el-text-color-secondary);
  border: 2px solid var(--el-border-color);
  transition: all 0.2s;
}

.stage-segment.complete .segment-circle {
  background: var(--el-color-success);
  color: #fff;
  border-color: var(--el-color-success);
}

.stage-segment.current .segment-circle {
  background: var(--el-color-primary);
  color: #fff;
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 2px var(--el-color-primary-light-7);
}

.segment-label {
  margin-top: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  white-space: nowrap;
}

.stage-segment.complete .segment-label,
.stage-segment.current .segment-label {
  color: var(--el-text-color-primary);
  font-weight: 600;
}

.segment-meta {
  margin-top: 0;
  font-size: 10px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

.meta-complete {
  color: var(--el-color-success);
}

.meta-current {
  color: var(--el-color-primary);
  font-weight: 500;
}

.meta-gaps {
  color: var(--el-color-warning);
}

.segment-connector {
  flex: 1;
  height: 2px;
  min-width: 12px;
  background: var(--el-border-color);
  align-self: center;
  transition: background 0.3s;
}

.segment-connector.connector-active {
  background: var(--el-color-success);
}

.overall-progress {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  margin-left: 8px;
  padding-left: 8px;
  border-left: 1px solid var(--el-border-color-light);
  min-width: 0;
  flex-shrink: 0;
}

.overall-label {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

.overall-bar {
  width: 80px;
}

@media (max-width: 1280px) {
  .overall-progress {
    display: none;
  }
}
</style>
