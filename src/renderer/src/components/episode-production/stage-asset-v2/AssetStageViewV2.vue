<template>
  <!--
    AssetStageViewV2 · ② 资产盘点（FU5-C1）

    严格按对照表 §3 cell 表 + 16 条差异修订实施：
    - StageMainHeader：标题 + 副标题（4 类资产摘要 + 已就绪进度）+ 一键生成 / 跳过空缺 / 完成本阶段
    - 整体进度卡：阶段进度（真实图谱完整度，解锁 §3.D-3 占位 0）
    - 4 节 asset-section：角色 / 地点 / 物品 / 语音
      每节 header：图标 + 标题 + count + 批操作按钮 + + 新建 按钮
    - 卡片：缩略图 + AssetSourceTag(badge) + 状态 tag + meta 按 4 类定制 + 双按钮 actions
    - StageGapBanner（FU4-3）顶部
    - 主题切换：全 var(--el-*)（G1）

    数据：FU5-C1 ep:asset:project-summary 一次性拉聚合视图。
    旧 AssetStageView.vue 暂保留作参考，下个 phase 删。
  -->
  <div class="asset-stage-v2">
    <StageGapBanner
      :episode-id="currentEpisode?.id ?? null"
      :current-status="(currentEpisode?.status as string) ?? null"
      target-status="asset_prep"
      @goto-prev-stage="emit('goto-prev-stage')"
    />

    <StageMainHeader title="② 资产盘点" :subtitle="headerSubtitle">
      <template #actions>
        <el-button
          v-if="missingMainCount > 0"
          :loading="generatingAll"
          @click="onSkipEmpty"
        >
          <el-icon><Right /></el-icon>
          <span>跳过空缺（{{ missingMainCount }}）</span>
        </el-button>
        <el-button
          v-if="missingMainCount > 0"
          type="primary"
          :loading="generatingAll"
          @click="onGenerateAllMissing"
        >
          <el-icon><MagicStick /></el-icon>
          <span>✨ 一键生成所有缺失主图（{{ missingMainCount }}）</span>
        </el-button>
        <el-button
          type="success"
          :disabled="!canComplete"
          @click="emit('complete')"
        >
          <span>完成本阶段 →</span>
        </el-button>
      </template>
    </StageMainHeader>

    <!-- 整体进度卡 -->
    <section class="overall-progress-card">
      <span class="card-label">阶段进度</span>
      <el-progress
        class="card-progress"
        :percentage="overallProgress"
        :stroke-width="10"
        :status="overallProgress >= 100 ? 'success' : ''"
      />
      <span class="card-meta">
        主图齐备 <strong>{{ readyCount }}/{{ totalCount }}</strong>
        <span class="meta-sep">·</span>
        图谱完整度 <strong>{{ galleryCompletion }}%</strong>
      </span>
    </section>

    <!-- 角色 -->
    <section class="asset-section">
      <header class="section-header">
        <span class="section-title">
          <span class="section-icon">👤</span>
          <span>角色</span>
          <el-tag size="small" round class="section-count">{{ summary.characters.length }}</el-tag>
        </span>
        <div class="section-actions">
          <el-button size="small" :disabled="summary.characters.length === 0" @click="onBatchDerive('character')">
            <el-icon><MagicStick /></el-icon>
            批量派生图谱
          </el-button>
          <el-button size="small" @click="emit('add-character')">
            <el-icon><Plus /></el-icon>
            新建角色
          </el-button>
        </div>
      </header>
      <div v-if="summary.characters.length === 0" class="empty-hint">
        <el-empty description="还没有角色 — 点 + 新建" :image-size="60" />
      </div>
      <div v-else class="asset-grid">
        <CharacterAssetCardV2
          v-for="c in summary.characters"
          :key="c.bindingId"
          :summary="c"
          @click="emit('open-character', c.bindingId)"
          @generate-main="emit('generate-main', { kind: 'character', id: c.bindingId })"
        />
      </div>
    </section>

    <!-- 地点 -->
    <section class="asset-section">
      <header class="section-header">
        <span class="section-title">
          <span class="section-icon">🏛</span>
          <span>地点</span>
          <el-tag size="small" round class="section-count">{{ summary.locations.length }}</el-tag>
        </span>
        <div class="section-actions">
          <el-button size="small" :disabled="summary.locations.length === 0" @click="onBatchDerive('location')">
            <el-icon><MagicStick /></el-icon>
            批量派生变体
          </el-button>
          <el-button size="small" @click="emit('add-location')">
            <el-icon><Plus /></el-icon>
            新建地点
          </el-button>
        </div>
      </header>
      <div v-if="summary.locations.length === 0" class="empty-hint">
        <el-empty description="还没有地点 — 点 + 新建" :image-size="60" />
      </div>
      <div v-else class="asset-grid">
        <LocationAssetCardV2
          v-for="l in summary.locations"
          :key="l.bindingId"
          :summary="l"
          @click="emit('open-location', l.bindingId)"
          @generate-main="emit('generate-main', { kind: 'location', id: l.bindingId })"
        />
      </div>
    </section>

    <!-- 物品 -->
    <section class="asset-section">
      <header class="section-header">
        <span class="section-title">
          <span class="section-icon">⚔️</span>
          <span>物品</span>
          <el-tag size="small" round class="section-count">{{ summary.items.length }}</el-tag>
        </span>
        <div class="section-actions">
          <el-button size="small" @click="emit('add-item')">
            <el-icon><Plus /></el-icon>
            新建物品
          </el-button>
        </div>
      </header>
      <div v-if="summary.items.length === 0" class="empty-hint">
        <el-empty description="还没有物品 — 点 + 新建" :image-size="60" />
      </div>
      <div v-else class="asset-grid">
        <ItemAssetCardV2
          v-for="it in summary.items"
          :key="it.bindingId"
          :summary="it"
          @click="emit('open-item', it.bindingId)"
          @generate-main="emit('generate-main', { kind: 'item', id: it.bindingId })"
        />
      </div>
    </section>

    <!-- 语音 -->
    <section class="asset-section">
      <header class="section-header">
        <span class="section-title">
          <span class="section-icon">🎙</span>
          <span>语音</span>
          <el-tag size="small" round class="section-count">{{ summary.voices.length }}</el-tag>
        </span>
        <div class="section-actions">
          <el-button size="small" @click="emit('add-voice')">
            <el-icon><Plus /></el-icon>
            复刻新音色
          </el-button>
        </div>
      </header>
      <div v-if="summary.voices.length === 0" class="empty-hint">
        <el-empty description="还没有语音 — 点 + 复刻" :image-size="60" />
      </div>
      <div v-else class="asset-grid">
        <VoiceAssetCardV2
          v-for="v in summary.voices"
          :key="v.voiceId"
          :summary="v"
          @click="emit('open-voice', v.voiceId)"
        />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { MagicStick, Plus, Right } from '@element-plus/icons-vue'
import StageMainHeader from '../shared/StageMainHeader.vue'
import StageGapBanner from '../workbench/StageGapBanner.vue'
import CharacterAssetCardV2 from './CharacterAssetCardV2.vue'
import LocationAssetCardV2 from './LocationAssetCardV2.vue'
import ItemAssetCardV2 from './ItemAssetCardV2.vue'
import VoiceAssetCardV2 from './VoiceAssetCardV2.vue'
import { useEpEpisodeStore } from '@/stores/episode-production'

const props = defineProps<{
  projectId: string
}>()

const emit = defineEmits<{
  (e: 'open-character', id: string): void
  (e: 'open-location', id: string): void
  (e: 'open-item', id: string): void
  (e: 'open-voice', id: string): void
  (e: 'add-character'): void
  (e: 'add-location'): void
  (e: 'add-item'): void
  (e: 'add-voice'): void
  (e: 'generate-main', payload: { kind: 'character' | 'location' | 'item'; id: string }): void
  (e: 'goto-prev-stage'): void
  (e: 'complete'): void
}>()

const episodeStore = useEpEpisodeStore()
const currentEpisode = computed(() => episodeStore.currentEpisode)

const summary = ref<{
  characters: any[]
  locations: any[]
  items: any[]
  voices: any[]
  totals: {
    bindingTotal: number
    bindingWithMain: number
    galleryTotal: number
    galleryCompletionPct: number
  }
}>({
  characters: [],
  locations: [],
  items: [],
  voices: [],
  totals: {
    bindingTotal: 0,
    bindingWithMain: 0,
    galleryTotal: 0,
    galleryCompletionPct: 0,
  },
})

const generatingAll = ref(false)

const headerSubtitle = computed(() => {
  const s = summary.value
  return `${s.characters.length} 角色 · ${s.locations.length} 地点 · ${s.items.length} 物品 · ${s.voices.length} 语音 · 已就绪 ${s.totals.bindingWithMain}/${s.totals.bindingTotal}`
})

const totalCount = computed(() => summary.value.totals.bindingTotal)
const readyCount = computed(() => summary.value.totals.bindingWithMain)
const missingMainCount = computed(() => totalCount.value - readyCount.value)
const overallProgress = computed(() =>
  totalCount.value === 0
    ? 0
    : Math.floor((readyCount.value / totalCount.value) * 100),
)
const galleryCompletion = computed(
  () => summary.value.totals.galleryCompletionPct,
)
const canComplete = computed(() => missingMainCount.value === 0 && totalCount.value > 0)

async function reload(): Promise<void> {
  if (!props.projectId) return
  const api = (window as any).electronAPI?.episodeProduction?.asset
  if (!api?.projectSummary) {
    ElMessage.warning('当前环境不支持 projectSummary IPC')
    return
  }
  const resp = await api.projectSummary(props.projectId)
  if (!resp.success) {
    ElMessage.error(resp.error || '获取资产摘要失败')
    return
  }
  summary.value = resp.data
}

defineExpose({ reload })

watch(() => props.projectId, () => void reload(), { immediate: true })
onMounted(() => void reload())

function onGenerateAllMissing(): void {
  // 委托父组件 / store 实施异步队列；本组件只触发事件
  emit('generate-main', { kind: 'character', id: '__ALL__' } as any)
  ElMessage.info(`开始为 ${missingMainCount.value} 个 binding 生成主图（异步队列；进度可在每张卡片观察）`)
}

function onSkipEmpty(): void {
  ElMessage.info('已跳过空缺（缺图 binding 仍在 ② 阶段保留；进 ⑤ 渲染前会硬卡）')
}

function onBatchDerive(kind: 'character' | 'location'): void {
  ElMessage.info(`批量派生 ${kind === 'character' ? '角色图谱' : '地点变体'} — 留 follow-up 接入派生服务`)
}
</script>

<style scoped lang="scss">
.asset-stage-v2 {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  height: 100%;
  overflow: auto;
  background: var(--el-bg-color-page);
}

.overall-progress-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
}

.card-label {
  font-weight: 600;
  font-size: 13px;
  color: var(--el-text-color-primary);
  flex-shrink: 0;
}

.card-progress {
  flex: 1;
}

.card-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}

.meta-sep {
  color: var(--el-text-color-placeholder);
  margin: 0 4px;
}

.asset-section {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 12px 14px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.section-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
}

.section-icon {
  font-size: 18px;
}

.section-count {
  margin-left: 4px;
}

.section-actions {
  display: flex;
  gap: 8px;
}

.asset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}

.empty-hint {
  display: flex;
  justify-content: center;
  padding: 20px 0;
}
</style>
