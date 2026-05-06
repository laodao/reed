<template>
  <!--
    StageGapBanner · stage 顶部门控提示（FU4-3 / spec §2.3 软引导门控）

    用途：在每个 stage 主区域顶部展示"前置阶段未完成"的具体 gap，
         让用户在 stage 内就看清缺什么、能直接跳回去补，不只在
         跳转门控弹框里看到一次。

    Props：
      - episodeId: string         当前剧集 id
      - currentStatus: string     当前剧集 status
      - targetStatus: string      本 stage 对应的 status（asset_prep / scripting / ...）

    Emits：
      - goto-prev-stage: void     用户点"返回上一步" 时通知父组件切 tab
  -->
  <div v-if="visible" class="stage-gap-banner" :class="{ 'is-blocking': blocking }">
    <div class="banner-row">
      <el-icon class="icon">
        <WarningFilled v-if="blocking" />
        <InfoFilled v-else />
      </el-icon>
      <div class="content">
        <div class="title">
          {{ blocking ? '前置阶段未完成 · 请先补齐再继续' : '提示' }}
        </div>
        <ul class="gap-list">
          <li v-for="(g, i) in gaps" :key="i">
            <code class="gap-code">{{ g.code }}</code>
            <span class="gap-msg">{{ g.message }}</span>
          </li>
        </ul>
      </div>
      <div class="actions">
        <el-button
          v-if="prevStageLabel"
          size="small"
          type="primary"
          plain
          @click="emit('goto-prev-stage')"
        >
          <el-icon><Back /></el-icon>
          返回 {{ prevStageLabel }}
        </el-button>
        <el-button size="small" link @click="onRefresh">
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Back, InfoFilled, Refresh, WarningFilled } from '@element-plus/icons-vue'

interface Gap {
  code: string
  message: string
}

const props = defineProps<{
  episodeId: string | null
  currentStatus: string | null
  targetStatus: string
}>()

const emit = defineEmits<{
  (e: 'goto-prev-stage'): void
}>()

const gaps = ref<Gap[]>([])
const blocking = ref(false)

const STAGE_LABELS: Record<string, string> = {
  pending: '① 内容',
  asset_prep: '② 资产',
  scripting: '③ 剧本',
  storyboarding: '④ 分镜',
  producing: '⑤ 渲染',
  composing: '⑥ 合成',
}

const STAGE_ORDER = [
  'pending',
  'asset_prep',
  'scripting',
  'storyboarding',
  'producing',
  'composing',
] as const

const prevStageLabel = computed(() => {
  const idx = STAGE_ORDER.indexOf(props.targetStatus as any)
  if (idx <= 0) return ''
  return STAGE_LABELS[STAGE_ORDER[idx - 1]] || ''
})

const visible = computed(() => gaps.value.length > 0)

async function refresh(): Promise<void> {
  if (!props.episodeId || !props.currentStatus) {
    gaps.value = []
    blocking.value = false
    return
  }
  // 同状态或回退 → 不需要 banner
  if (props.currentStatus === props.targetStatus) {
    gaps.value = []
    blocking.value = false
    return
  }
  const api = (window as any).electronAPI?.episodeProduction
  if (!api?.canEnterStage) return
  try {
    const resp = await api.canEnterStage(
      props.episodeId,
      props.currentStatus,
      props.targetStatus,
    )
    if (!resp?.success) return
    const data = resp.data || {}
    gaps.value = Array.isArray(data.gaps) ? data.gaps : []
    blocking.value = !data.allowed
  } catch (e) {
    console.warn('[StageGapBanner] canEnterStage 失败:', e)
  }
}

function onRefresh(): void {
  void refresh()
}

watch(
  () => [props.episodeId, props.currentStatus, props.targetStatus],
  () => {
    void refresh()
  },
  { immediate: true },
)
</script>

<style scoped>
.stage-gap-banner {
  margin: 0 0 12px 0;
  padding: 10px 14px;
  background: var(--el-color-info-light-9);
  border: 1px solid var(--el-color-info-light-7);
  border-left: 4px solid var(--el-color-info);
  border-radius: 6px;
}

.stage-gap-banner.is-blocking {
  background: var(--el-color-warning-light-9);
  border-color: var(--el-color-warning-light-7);
  border-left-color: var(--el-color-warning);
}

.banner-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.icon {
  font-size: 18px;
  color: var(--el-color-info);
  margin-top: 2px;
  flex-shrink: 0;
}

.is-blocking .icon {
  color: var(--el-color-warning);
}

.content {
  flex: 1;
  min-width: 0;
}

.title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 6px;
}

.gap-list {
  margin: 0;
  padding-left: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.gap-list li {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 12px;
}

.gap-code {
  font-family: monospace;
  font-size: 11px;
  background: var(--el-fill-color);
  padding: 1px 6px;
  border-radius: 3px;
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}

.gap-msg {
  color: var(--el-text-color-regular);
}

.actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
</style>
