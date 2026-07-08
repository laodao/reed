<template>
  <div class="stage-header-bar">
    <div v-if="loading" class="loading">加载中…</div>
    <div v-else-if="errorMessage" class="error">{{ errorMessage }}</div>
    <template v-else-if="progress">
      <div
        v-for="(seg, idx) in mergedSegments"
        :key="seg.label"
        class="stage-segment"
        :class="seg.cssClass"
        :title="seg.label"
        @click="onClick(seg.clickStatus)"
      >
        <span class="stage-label">{{ seg.label }}</span>
        <span v-if="idx + 1 !== mergedSegments.length" class="stage-sep">│</span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'
import type {
  EpisodeProgress,
  EpisodeStatus,
} from '../../../../../shared/types/episode-production'

const props = defineProps<{ episodeId: string | null }>()

const emit = defineEmits<{
  (e: 'navigate-stage', status: EpisodeStatus): void
}>()

const progress = ref<EpisodeProgress | null>(null)
const loading = ref(false)
const errorMessage = ref<string | null>(null)

/**
 * 合并段定义（spec 2026-05-08-content-script-merged §2.1）
 *
 * 6 个生产 status + 1 个 completed 终态映射到 5 个 UI 段：
 *   { pending, scripting }   → 内容+剧本
 *   { asset_prep }           → 资产
 *   { storyboarding }        → 分镜
 *   { producing }            → 制作
 *   { composing, completed } → 合成
 *
 * clickStatus 是该段被点击时 emit 的 status（取段集合中的代表元，
 * 选 min order 让 stage-gate 走"回到该段第一个 sub-state"）
 */
interface MergedSegment {
  label: string
  statuses: EpisodeStatus[]
  clickStatus: EpisodeStatus
}

const STAGE_ORDER: Record<string, number> = {
  draft: 0,       // 兼容旧数据（早期版本可能创建 draft 状态）
  pending: 0,
  asset_prep: 1,
  scripting: 2,
  storyboarding: 3,
  producing: 4,
  composing: 5,
  completed: 6,
}

const SEGMENTS: MergedSegment[] = [
  { label: '内容+剧本', statuses: ['draft' as EpisodeStatus, 'pending', 'scripting'], clickStatus: 'pending' },
  { label: '资产', statuses: ['asset_prep'], clickStatus: 'asset_prep' },
  { label: '分镜', statuses: ['storyboarding'], clickStatus: 'storyboarding' },
  { label: '制作', statuses: ['producing'], clickStatus: 'producing' },
  { label: '合成', statuses: ['composing', 'completed'], clickStatus: 'composing' },
]

type SegmentCssClass = 'stage-current' | 'stage-complete' | 'stage-pending'

interface ResolvedSegment extends MergedSegment {
  cssClass: SegmentCssClass
}

const mergedSegments = computed((): ResolvedSegment[] => {
  const cur = progress.value?.currentStatus
  if (!cur) return []
  const curOrd = STAGE_ORDER[cur]
  return SEGMENTS.map((seg) => {
    const ords = seg.statuses.map((s) => STAGE_ORDER[s])
    const minOrd = Math.min(...ords)
    const inSet = seg.statuses.includes(cur)
    let cssClass: SegmentCssClass
    if (inSet) cssClass = 'stage-current'
    else if (curOrd > minOrd) cssClass = 'stage-complete'
    else cssClass = 'stage-pending'
    return { ...seg, cssClass }
  })
})

function onClick(status: EpisodeStatus): void {
  emit('navigate-stage', status)
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
