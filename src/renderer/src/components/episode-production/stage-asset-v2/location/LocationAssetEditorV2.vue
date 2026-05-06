<template>
  <!--
    LocationAssetEditorV2 · 地点资产编辑（FU5-C3 / 原型 §5）

    严格按对照表 §5 + §11 修订实施 11 条差异：
    - 顶部 header：返回 / 名称 / linked_lw·standalone tag / 主图齐备 tag / 拉取最新 / 显式保存
    - LwSyncReminderBanner（spec §3.7）
    - 双栏 grid 360px / 1fr：
      左 LocationCardFormV2 6 节（基础 / 视觉特征 / 氛围 / 变体维度 / 风格锚点 / 360 升级提示）
      右 gallery wrapper：
        ✓ 主图 + 元信息（生成时间 / provider / 分辨率）
        ✓ 时间 / 天气 / 视角 维度网格（复用 LocationGalleryEditor 已有数据）
        ✓ 360 全景图 panel + 视角截图（PanoramaSnapshotEditor 复用）
        ✓ 3D 一致性 success-banner（教育性文案）
        ✓ 一致性优先级提示 banner（spec §4.5.10 P0：panorama_snapshot → angle → 主图）
        ✓ 3D 摆位 Phase 8 占位 panel
  -->
  <div v-loading="loading" class="location-editor-v2">
    <header class="editor-header">
      <el-button text class="back-btn" @click="emit('close')">
        <el-icon><ArrowLeft /></el-icon>
        <span>返回盘点</span>
      </el-button>
      <h2 class="loc-name">{{ displayName }}</h2>
      <AssetSourceTag
        v-if="binding"
        :source="binding.sourceType ?? 'standalone'"
        :custom-label="
          binding.sourceType === 'linked_lw'
            ? `linked_lw · 来自长文`
            : 'standalone · 本剧独立'
        "
      />
      <el-tag
        v-if="hasMain"
        type="success"
        size="small"
        effect="light"
        class="status-tag"
      >主图齐备</el-tag>
      <el-tag v-else type="warning" size="small" effect="light" class="status-tag">缺主图</el-tag>
      <AssetSourceTag
        v-if="hasPanorama"
        source="3d"
        custom-label="3D 已升级"
        size="small"
        class="status-tag"
      />

      <div class="header-spacer" />
      <el-button
        v-if="binding?.sourceType === 'linked_lw'"
        :loading="pulling"
        @click="onPullLatest"
      >
        <el-icon><Refresh /></el-icon>
        <span>↺ 拉取最新基础值</span>
      </el-button>
      <el-button
        type="success"
        :loading="saving"
        :disabled="!hasDirty"
        @click="onSave"
      >
        <el-icon><DocumentChecked /></el-icon>
        <span>保存{{ hasDirty ? `（${dirtyCount} 处）` : '' }}</span>
      </el-button>
    </header>

    <LwSyncReminderBanner
      v-if="binding?.sourceType === 'linked_lw'"
      entity-kind="location"
      :entity-name="displayName"
      :lw-updated-at="lwUpdatedAt"
      :binding-synced-at="bindingSyncedAt"
      :syncing="pulling"
      @view-changes="onViewChanges"
      @sync="onPullLatest"
    />

    <div class="body-grid">
      <LocationCardFormV2
        v-if="binding"
        :binding="binding"
        @change="onFormChange"
      />
      <div class="gallery-wrapper">
        <!-- 提示文案已迁到右侧"图谱"标题 / 360 全景标题旁的 ❓ icon hover -->
        <LocationGalleryEditor
          ref="galleryRef"
          :binding-id="bindingId"
          asset-type="location"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  ArrowLeft,
  DocumentChecked,
  Refresh,
} from '@element-plus/icons-vue'
import AssetSourceTag from '../../shared/AssetSourceTag.vue'
import LwSyncReminderBanner from '../../shared/LwSyncReminderBanner.vue'
import LocationCardFormV2, { type FormChangePayload } from './LocationCardFormV2.vue'
import LocationGalleryEditor from '../../stage-asset/location/LocationGalleryEditor.vue'

const props = defineProps<{ bindingId: string }>()
const emit = defineEmits<{
  close: []
  saved: []
}>()

const binding = ref<any>(null)
const loading = ref(false)
const saving = ref(false)
const pulling = ref(false)
const galleryRef = ref<any>(null)
const hasMain = ref(false)
const hasPanorama = ref(false)

const formDraft = ref<Record<string, any>>({})
const dirtyKeys = ref<Set<string>>(new Set())
const hasDirty = computed(() => dirtyKeys.value.size > 0)
const dirtyCount = computed(() => dirtyKeys.value.size)

const displayName = computed(() => {
  const b = binding.value
  if (!b) return '加载中...'
  if (b.sourceType === 'standalone') return b.standaloneName || b.locationName || '(未命名)'
  return b.overrideName || b.standaloneName || b.locationName || '(未命名 lw)'
})

const lwUpdatedAt = computed(() => null)
const bindingSyncedAt = computed(() => binding.value?.updatedAt ?? null)

async function load(): Promise<void> {
  if (!props.bindingId) return
  loading.value = true
  try {
    const api = (window as any).electronAPI?.episodeProduction?.asset
    if (!api) {
      ElMessage.error('资产 API 不可用')
      return
    }
    const resp = await api.location.get(props.bindingId)
    if (!resp?.success) {
      ElMessage.error(resp?.error ?? '加载地点失败')
      return
    }
    binding.value = resp.data
    formDraft.value = {}
    dirtyKeys.value = new Set()

    const imgList = await api.image
      ?.listByAsset?.('location', props.bindingId)
      .catch(() => null)
    if (imgList?.success && Array.isArray(imgList.data)) {
      hasMain.value = imgList.data.some((i: any) => i.isMain === 1)
      hasPanorama.value = imgList.data.some((i: any) => i.category === 'panorama_360')
    }
  } finally {
    loading.value = false
  }
}

function onFormChange(payload: FormChangePayload): void {
  formDraft.value[payload.key] = payload.value
  if (payload.dirty) dirtyKeys.value.add(payload.key)
  else dirtyKeys.value.delete(payload.key)
  dirtyKeys.value = new Set(dirtyKeys.value)
}

async function onSave(): Promise<void> {
  if (!binding.value) return
  saving.value = true
  try {
    const api = (window as any).electronAPI?.episodeProduction?.asset?.location
    if (!api) {
      ElMessage.error('location API 不可用')
      return
    }
    const draft = formDraft.value
    const isLw = binding.value.sourceType === 'linked_lw'

    const namePart: any = {}
    if ('name' in draft) namePart.name = draft.name
    if ('description' in draft) namePart.description = draft.description
    if (Object.keys(namePart).length > 0) {
      if (isLw) await api.updateOverride(binding.value.id, namePart)
      else
        await api.updateStandalone(binding.value.id, {
          name: namePart.name,
          description: namePart.description,
        })
    }

    const extra: any = {}
    for (const k of [
      'locationType',
      'scale',
      'baseDescription',
      'moodTags',
      'styleAnchors',
      'timeOfDay',
      'weather',
    ]) {
      if (k in draft) extra[k] = draft[k]
    }
    if (Object.keys(extra).length > 0) {
      await api.updateExtra(binding.value.id, extra)
    }

    ElMessage.success('已保存')
    await load()
    emit('saved')
  } catch (e: any) {
    ElMessage.error(e?.message ?? '保存失败')
  } finally {
    saving.value = false
  }
}

async function onPullLatest(): Promise<void> {
  pulling.value = true
  try {
    ElMessage.info('拉取最新长文基础值 — IPC 待 phase F 接入（StoryToVideoAIService.syncLwBinding）')
  } finally {
    pulling.value = false
  }
}

function onViewChanges(): void {
  ElMessage.info('查看长文变更对照 — 留 follow-up')
}

onMounted(load)
watch(() => props.bindingId, load)
</script>

<style scoped lang="scss">
.location-editor-v2 {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--el-bg-color-page);
  overflow: hidden;
}

.editor-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-light);
  flex-shrink: 0;
  min-height: 36px;
}

.back-btn {
  flex-shrink: 0;
  padding: 4px 6px;
}

.loc-name {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.status-tag {
  margin-left: 4px;
}

.header-spacer {
  flex: 1;
}

.body-grid {
  flex: 1;
  display: grid;
  grid-template-columns: 360px 1fr;
  gap: 12px;
  padding: 12px;
  overflow: hidden;
  min-height: 0;
}

.gallery-wrapper {
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: auto;
  min-height: 0;
}

@media (max-width: 1024px) {
  .body-grid {
    grid-template-columns: 1fr;
  }
}
</style>
