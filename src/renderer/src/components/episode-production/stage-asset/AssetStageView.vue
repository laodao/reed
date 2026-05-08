<template>
  <div class="ep-asset-stage">
    <!-- FU4-3 前置阶段未完成提示（spec §2.3 软引导门控可视化） -->
    <StageGapBanner
      :episode-id="currentEpisode?.id ?? null"
      :current-status="(currentEpisode?.status as string) ?? null"
      target-status="asset_prep"
      @goto-prev-stage="emit('goto-prev-stage')"
    />

    <!-- 整体进度条 -->
    <el-card class="progress-card" shadow="never">
      <div class="progress-row">
        <span class="progress-label">阶段进度</span>
        <el-progress :percentage="overallProgress" :stroke-width="10" class="progress-bar" />
        <span class="progress-meta">
          主图齐备 {{ readyCount }}/{{ totalCount }} · 图谱完整度 {{ galleryCompletion }}%
        </span>
        <el-button
          type="success"
          :disabled="readyCount < totalCount || totalCount === 0"
          @click="onComplete"
        >
          完成本阶段 →
        </el-button>
      </div>
    </el-card>

    <!-- 角色 -->
    <el-card class="asset-section" shadow="never">
      <template #header>
        <div class="section-header">
          <span class="section-title">
            <el-icon><User /></el-icon>
            <span>角色</span>
            <el-tag round>{{ characters.length }}</el-tag>
          </span>
          <el-button size="small" @click="onAddCharacter">+ 新建角色</el-button>
        </div>
      </template>
      <div v-if="characters.length === 0" class="empty-hint">
        <el-empty description="还没有角色，点击 + 新建" :image-size="80" />
      </div>
      <div v-else class="asset-grid">
        <CharacterAssetCard
          v-for="c in characters"
          :key="c.id"
          :binding="c"
          @click="emit('open-character', c.id)"
          @generate-main="onGenerateMain('character', c.id)"
        />
      </div>
    </el-card>

    <!-- 地点 -->
    <el-card class="asset-section" shadow="never">
      <template #header>
        <div class="section-header">
          <span class="section-title">
            <el-icon><Location /></el-icon>
            <span>地点</span>
            <el-tag round>{{ locations.length }}</el-tag>
          </span>
          <el-button size="small" @click="onAddLocation">+ 新建地点</el-button>
        </div>
      </template>
      <div v-if="locations.length === 0" class="empty-hint">
        <el-empty description="还没有地点，点击 + 新建" :image-size="80" />
      </div>
      <div v-else class="asset-grid">
        <LocationAssetCard
          v-for="l in locations"
          :key="l.id"
          :binding="l"
          @click="emit('open-location', l.id)"
          @generate-main="onGenerateMain('location', l.id)"
        />
      </div>
    </el-card>

    <!-- 物品 -->
    <el-card class="asset-section" shadow="never">
      <template #header>
        <div class="section-header">
          <span class="section-title">
            <el-icon><Box /></el-icon>
            <span>物品</span>
            <el-tag round>{{ items.length }}</el-tag>
          </span>
          <el-button size="small" @click="onAddItem">+ 新建物品</el-button>
        </div>
      </template>
      <div v-if="items.length === 0" class="empty-hint">
        <el-empty description="还没有物品，点击 + 新建" :image-size="80" />
      </div>
      <div v-else class="asset-grid">
        <ItemAssetCard
          v-for="it in items"
          :key="it.id"
          :binding="it"
          @click="emit('open-item', it.id)"
          @generate-main="onGenerateMain('item', it.id)"
        />
      </div>
    </el-card>

    <!-- 语音 -->
    <el-card class="asset-section" shadow="never">
      <template #header>
        <div class="section-header">
          <span class="section-title">
            <el-icon><Microphone /></el-icon>
            <span>语音</span>
            <el-tag round>{{ voices.length }}</el-tag>
          </span>
          <el-button size="small" @click="onAddVoice">+ 复刻新声音</el-button>
        </div>
      </template>
      <div v-if="voices.length === 0" class="empty-hint">
        <el-empty description="还没有语音，点击 + 复刻" :image-size="80" />
      </div>
      <div v-else class="asset-grid">
        <VoiceAssetCard
          v-for="v in voices"
          :key="v.id"
          :binding="v"
          @click="emit('open-voice', v.id)"
        />
      </div>
    </el-card>

    <!-- 声音复刻对话框（V1 stage 也接通，2026-05-08 T12） -->
    <VoiceCloneDialog
      v-model="voiceCloneDialogVisible"
      use-case="asset-stage"
      @completed="onVoiceCloneCompleted"
      @failed="onVoiceCloneFailed"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * 资产盘点页（P3a Task 11）
 * @module renderer/components/episode-production/stage-asset/AssetStageView
 * @description 4 类资产（角色 / 地点 / 物品 / 语音）的"② 资产"阶段总览。
 *              数据源走新版 useEpAssetStore.epAsset* 字段，不污染 V2 老页面。
 *              进度统计目前为占位（readyCount/galleryCompletion 留 P3a-final 阶段
 *              通过 asset_image 异步聚合接入）。生成主图按钮目前 toast 提示，
 *              真正的渲染域 API 将在 P5 阶段实现。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Box, Location, Microphone, User } from '@element-plus/icons-vue'
import { useEpAssetStore } from '@/stores/episode-production/asset.store'
import { useEpEpisodeStore } from '@/stores/episode-production'
import VoiceCloneDialog from '@/components/voice/VoiceCloneDialog.vue'

import CharacterAssetCard from './CharacterAssetCard.vue'
import LocationAssetCard from './LocationAssetCard.vue'
import ItemAssetCard from './ItemAssetCard.vue'
import VoiceAssetCard from './VoiceAssetCard.vue'
import StageGapBanner from '../workbench/StageGapBanner.vue'

const props = defineProps<{ projectId: string }>()

const emit = defineEmits<{
  'open-character': [id: string]
  'open-location': [id: string]
  'open-item': [id: string]
  'open-voice': [id: string]
  'add-character': []
  'add-location': []
  'add-item': []
  'add-voice': []
  'goto-prev-stage': []
  complete: []
}>()

const assetStore = useEpAssetStore()
const episodeStore = useEpEpisodeStore()
const currentEpisode = computed(() => episodeStore.currentEpisode)

const characters = computed(() => assetStore.epAssetCharacters)
const locations = computed(() => assetStore.epAssetLocations)
const items = computed(() => assetStore.epAssetItems)
const voices = computed(() => assetStore.epAssetVoices)

// 进度统计（占位）：
// 语音不算"主图齐备"维度（语音域无图概念），仅角色 + 地点 + 物品计入。
// readyCount / overallProgress / galleryCompletion 真实完整度需要异步聚合
// asset_image 表，留 P3a-final / P5 接入；这里先全部占位为 0，UI 不阻塞用户。
// TODO[P3a-final]: 通过 image.listByAsset 聚合真实主图齐备 / 图谱完整度。
const totalCount = computed(
  () => characters.value.length + locations.value.length + items.value.length
)
const readyCount = computed(() => 0)
const overallProgress = computed(() => 0)
const galleryCompletion = computed(() => 0)

async function reload() {
  if (!props.projectId) return
  await assetStore.loadAssetsByProject(props.projectId)
}

/**
 * 通用 standalone 资产创建：弹 prompt 输名字 → 调 IPC → reload → emit open-*。
 * linked_lw（绑定到长文角色 / 地点 / 物品）入口暂留 P3b 实现（需要选择 lw 实体的 picker）。
 */
async function promptCreateStandalone(
  type: 'character' | 'location' | 'item',
): Promise<void> {
  const labelMap = { character: '角色', location: '地点', item: '物品' } as const
  const label = labelMap[type]
  let name: string
  try {
    const result = await ElMessageBox.prompt(`请输入${label}名称`, `新建${label}`, {
      confirmButtonText: '创建',
      cancelButtonText: '取消',
      inputPattern: /^.{1,80}$/,
      inputErrorMessage: '名称必填，最多 80 字符',
    })
    name = String(result.value ?? '').trim()
  } catch {
    return
  }
  if (!name) return

  const api = (window as any).electronAPI?.episodeProduction?.asset
  if (!api) {
    ElMessage.error('资产 API 不可用')
    return
  }
  try {
    const resp = await api[type].createStandalone({ projectId: props.projectId, name })
    if (!resp?.success) {
      ElMessage.error(resp?.error || `新建${label}失败`)
      return
    }
    ElMessage.success(`已创建${label}：${name}`)
    await reload()
    const id = resp.data?.id
    if (id) emit(`open-${type}` as 'open-character' | 'open-location' | 'open-item', id)
  } catch (e: any) {
    ElMessage.error(e?.message || `新建${label}失败`)
  }
}

function onAddCharacter() {
  void promptCreateStandalone('character')
}

function onAddLocation() {
  void promptCreateStandalone('location')
}

function onAddItem() {
  void promptCreateStandalone('item')
}

// 2026-05-08 T12：V1 stage 也接通真复刻链路（与 V2 共用 VoiceCloneDialog）
const voiceCloneDialogVisible = ref(false)

function onAddVoice() {
  voiceCloneDialogVisible.value = true
}

async function onVoiceCloneCompleted(): Promise<void> {
  ElMessage.success('音色复刻完成')
  await reload()
}

async function onVoiceCloneFailed(payload: { errorMessage?: string }): Promise<void> {
  ElMessage.error(`复刻失败：${payload.errorMessage ?? '未知错误'}`)
  await reload()
}

function onGenerateMain(_type: 'character' | 'location' | 'item', _id: string) {
  ElMessage.info('生成主图 API 待 P5 渲染域接入')
}

function onComplete() {
  emit('complete')
}

onMounted(() => {
  void reload()
})

watch(
  () => props.projectId,
  (next, prev) => {
    if (next && next !== prev) {
      void reload()
    }
  }
)
</script>

<style scoped>
.ep-asset-stage {
  padding: 16px;
  background: var(--el-bg-color-page);
  height: 100%;
  overflow: auto;
  box-sizing: border-box;
}

.progress-card,
.asset-section {
  margin-bottom: 16px;
}

.progress-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.progress-label {
  color: var(--el-text-color-primary);
  font-weight: 500;
  flex-shrink: 0;
}

.progress-bar {
  flex: 1;
  min-width: 120px;
}

.progress-meta {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  flex-shrink: 0;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--el-text-color-primary);
}

.section-title .el-icon {
  color: var(--el-color-primary);
}

.empty-hint {
  padding: 20px 0;
}

.asset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
}
</style>
