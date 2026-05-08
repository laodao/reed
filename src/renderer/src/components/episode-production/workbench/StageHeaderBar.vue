<template>
  <div class="stage-header-bar">
    <div v-if="loading" class="loading">加载中…</div>
    <div v-else-if="errorMessage" class="error">{{ errorMessage }}</div>
    <template v-else-if="progress">
      <div
        v-for="(s, idx) in progress.stages"
        :key="s.stage"
        class="stage-segment"
        :class="segmentClass(s)"
        :title="s.label"
        @click="onClick(s.stage)"
      >
        <span class="stage-label">{{ stageLabel(idx, s.label) }}</span>
        <span v-if="idx + 1 !== progress.stages.length" class="stage-sep">│</span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import type {
  EpisodeProgress,
  StageProgress,
  EpisodeStatus,
} from '../../../../../shared/types/episode-production'

const props = defineProps<{ episodeId: string | null }>()

const emit = defineEmits<{
  (e: 'navigate-stage', status: EpisodeStatus): void
}>()

const progress = ref<EpisodeProgress | null>(null)
const loading = ref(false)
const errorMessage = ref<string | null>(null)

/** 6 阶段固定编号标签，与后端 label 字段无关，仅用于展示 */
const NUMBERED_LABELS = ['① 内容', '② 资产', '③ 剧本', '④ 分镜', '⑤ 制作', '⑥ 合成']

function stageLabel(idx: number, fallback: string): string {
  return NUMBERED_LABELS[idx] ?? fallback
}

function segmentClass(s: StageProgress): Record<string, boolean> {
  return {
    'stage-complete': s.mark === '✓',
    'stage-current': s.mark === '●',
    'stage-pending': s.mark === '○',
  }
}

function onClick(stage: EpisodeStatus): void {
  emit('navigate-stage', stage)
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
    if (!resp?.success) throw new Error(resp?.error || '获取阶段进度失败')
    progress.value = resp.data as EpisodeProgress
  } catch (e: any) {
    errorMessage.value = e?.message ?? String(e)
  } finally {
    loading.value = false
  }
}

watch(() => props.episodeId, () => loadProgress())
onMounted(loadProgress)

defineExpose({ reload: loadProgress })
</script>

<style scoped lang="scss">
.stage-header-bar {
  display: flex;
  align-items: center;
  gap: 0;
  flex: 1;
  min-width: 0;
  height: 100%;
  font-size: 13px;
}

.loading,
.error {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  padding: 0 8px;
}

.error {
  color: var(--el-color-danger);
}

.stage-segment {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  transition: opacity 0.15s;

  &:hover {
    opacity: 0.85;
  }
}

.stage-label {
  color: var(--el-text-color-secondary);
}

.stage-segment.stage-complete .stage-label {
  color: var(--el-color-success);
}

.stage-segment.stage-current .stage-label {
  color: var(--el-color-primary);
  font-weight: 600;
}

.stage-segment.stage-pending .stage-label {
  color: var(--el-text-color-secondary);
}

.stage-sep {
  color: var(--el-border-color-light);
  margin-left: 8px;
  cursor: default;
}
</style>
