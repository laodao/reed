<template>
  <el-card class="location-gallery-editor" shadow="never">
    <template #header>
      <div class="card-header">
        <span class="header-title">🖼️ 图谱</span>
        <el-button size="small" text @click="reload">
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
      </div>
    </template>

    <div v-loading="loading" class="gallery-body">
      <!-- 主图 -->
      <el-card class="main-card" shadow="never">
        <template #header>
          <div class="section-header">
            <span class="section-title">主图 (main)</span>
            <el-tag size="small" :type="mainImage ? 'success' : 'info'">
              {{ mainImage ? '已就绪' : '缺主图' }}
            </el-tag>
          </div>
        </template>

        <div class="main-thumb">
          <img v-if="mainImage?.imagePath" :src="mainImage.imagePath" alt="主图" />
          <el-empty v-else description="尚未生成主图" :image-size="60" />
        </div>

        <div class="main-actions">
          <el-button v-if="!mainImage" type="primary" plain size="small" @click="onGenerateMain">
            ✨ 生成主图
          </el-button>
          <el-button v-else size="small" @click="onRegenerateMain">
            ↺ 重生成
          </el-button>
          <el-button size="small" @click="onUploadMain">
            ⬆ 上传替换
          </el-button>
        </div>
      </el-card>

      <!-- 3 个 category 网格：time_variant / weather_variant / angle_variant -->
      <el-card
        v-for="cat in categories"
        :key="cat.key"
        class="category-card"
        shadow="never"
      >
        <template #header>
          <div class="section-header">
            <span class="section-title">
              {{ cat.label }}
              <span class="progress-meta">
                {{ getCategoryDoneCount(cat) }}/{{ cat.labels.length }}
              </span>
            </span>
            <el-button
              size="small"
              type="primary"
              plain
              :disabled="getMissingLabels(cat).length === 0"
              @click="onBatchDerive(cat)"
            >
              ✨ 派生剩余
            </el-button>
          </div>
        </template>

        <div class="thumb-grid">
          <div
            v-for="label in cat.labels"
            :key="`${cat.key}-${label}`"
            class="thumb-cell"
          >
            <div class="thumb-frame">
              <img
                v-if="getImageByLabel(cat.key, label)?.imagePath"
                :src="getImageByLabel(cat.key, label)!.imagePath"
                :alt="label"
              />
              <el-icon v-else size="24" class="thumb-empty-icon"><Plus /></el-icon>
            </div>
            <div class="thumb-label">{{ label }}</div>
          </div>
        </div>
      </el-card>

      <!-- 360 全景区（P3c Task 8） -->
      <el-card class="category-card panorama-section" shadow="never">
        <template #header>
          <div class="section-header">
            <span class="section-title">
              🌐 360 全景图（panorama_360）
              <el-tag v-if="panoramas.length > 0" type="success" size="small">
                已生成 {{ panoramas.length }}
              </el-tag>
              <el-tag v-else type="info" size="small">未生成</el-tag>
            </span>
          </div>
        </template>

        <div class="panorama-actions">
          <el-button type="primary" :loading="generating" @click="onGeneratePanorama">
            ✨ AI 生成 360 全景
          </el-button>
          <el-upload
            :auto-upload="false"
            :show-file-list="false"
            :on-change="onPickPanoramaFile"
            accept="image/jpeg,image/png,image/webp"
          >
            <el-button :loading="uploading">⬆ 上传现成 360 图</el-button>
          </el-upload>
          <span class="panorama-hint">
            支持 jpg/png/webp，比例需≈2:1（equirectangular），≤50MB
          </span>
        </div>

        <div v-if="panoramas.length > 0" class="panorama-list">
          <el-radio-group v-model="activePanoramaId" class="panorama-tabs">
            <el-radio-button v-for="p in panoramas" :key="p.id" :label="p.id">
              {{ p.label ?? p.id.slice(0, 12) }}
            </el-radio-button>
          </el-radio-group>

          <PanoramaSnapshotEditor
            v-if="activePanorama"
            :panorama="{
              id: activePanorama.id,
              imagePath: activePanorama.imagePath,
              label: activePanorama.label,
            }"
            :location-binding-id="props.bindingId"
            @snapshot-created="onSnapshotCreated"
          />
        </div>
      </el-card>
    </div>
  </el-card>
</template>

<script setup lang="ts">
/**
 * 地点（资产）图谱编辑器（P3a Task 13）
 * @module renderer/components/episode-production/stage-asset/location/LocationGalleryEditor
 * @description 地点图谱网格：
 *   - 主图（main）独立卡片，支持生成 / 重生成 / 上传；
 *   - time_variant：morning / noon / afternoon / evening / night / dawn / dusk；
 *   - weather_variant：sunny / cloudy / rainy / snowy / foggy / stormy；
 *   - angle_variant：wide_shot / entrance / interior_a / interior_b；
 *   - 派生按钮调 api.derive.batch，目前是 stub（返回失败提示）；
 *   - 生成主图按钮 toast 占位（IPC 已注册但 image gen adapter 是 stub）；
 *   - 全景 / 场景布局接入留 P3c task 8。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { UploadFile } from 'element-plus'
import { Plus, Refresh } from '@element-plus/icons-vue'
import PanoramaSnapshotEditor from './PanoramaSnapshotEditor.vue'
import { uploadPanoramaFile } from '@/api/panorama-upload'
import {
  LOCATION_TIME_VALUES,
  LOCATION_WEATHER_VALUES,
  LOCATION_ANGLE_VALUES,
} from '@core/modules/episode-production/assets/constants/location-variants'

const props = defineProps<{
  bindingId: string
  assetType: 'character' | 'location' | 'item'
}>()

interface CategoryConfig {
  key: 'time_variant' | 'weather_variant' | 'angle_variant'
  label: string
  labels: string[]
}

interface AssetImageRow {
  id: string
  category: string
  label: string | null
  imagePath: string
  isMain: number
}

const categories: CategoryConfig[] = [
  {
    key: 'time_variant',
    label: '时间变体',
    labels: [...LOCATION_TIME_VALUES],
  },
  {
    key: 'weather_variant',
    label: '天气变体',
    labels: [...LOCATION_WEATHER_VALUES],
  },
  {
    key: 'angle_variant',
    label: '角度变体',
    labels: [...LOCATION_ANGLE_VALUES],
  },
]

const loading = ref(false)
const allImages = ref<AssetImageRow[]>([])

const mainImage = computed(() => allImages.value.find((i) => i.category === 'main') || null)

function getApi() {
  return (window as any).electronAPI?.episodeProduction?.asset
}

async function reload() {
  const api = getApi()
  if (!api) return
  if (!props.bindingId) return
  loading.value = true
  try {
    const resp = await api.image.listByAsset(props.assetType, props.bindingId)
    if (resp && resp.success && Array.isArray(resp.data)) {
      allImages.value = resp.data as AssetImageRow[]
    } else {
      allImages.value = []
      if (resp && !resp.success) {
        ElMessage.error(resp.error || '加载图谱失败')
      }
    }
  } catch (e: any) {
    console.error('[LocationGalleryEditor] reload 失败', e)
    ElMessage.error(e?.message || '加载图谱失败')
  } finally {
    loading.value = false
  }
}

function getImageByLabel(category: string, label: string): AssetImageRow | undefined {
  return allImages.value.find((i) => i.category === category && i.label === label)
}

function getCategoryDoneCount(cat: CategoryConfig): number {
  return cat.labels.filter((label) => !!getImageByLabel(cat.key, label)).length
}

function getMissingLabels(cat: CategoryConfig): string[] {
  return cat.labels.filter((label) => !getImageByLabel(cat.key, label))
}

function onGenerateMain() {
  ElMessage.info('生成主图 API 待 P5 渲染域接入')
}

function onRegenerateMain() {
  ElMessage.info('生成主图 API 待 P5 渲染域接入')
}

function onUploadMain() {
  ElMessage.info('生成主图 API 待 P5 渲染域接入')
}

async function onBatchDerive(cat: CategoryConfig) {
  const api = getApi()
  if (!api) {
    ElMessage.error('IPC 桥未就绪')
    return
  }

  const missing = getMissingLabels(cat)
  if (missing.length === 0) {
    ElMessage.info('该分类已全部派生完成')
    return
  }

  if (!mainImage.value) {
    ElMessage.warning('请先生成主图，再派生其他变体')
    return
  }

  try {
    const resp = await api.derive.batch({
      assetType: props.assetType,
      assetId: props.bindingId,
      category: cat.key,
      labels: missing,
    })
    if (!resp || !resp.success) {
      ElMessage.error(resp?.error || '派生 API 暂未实现（P5 渲染域接入）')
      return
    }
    ElMessage.success(`已派生 ${missing.length} 张 ${cat.label}`)
    await reload()
  } catch (e: any) {
    console.error('[LocationGalleryEditor] batch derive 失败', e)
    ElMessage.error(e?.message || '派生失败')
  }
}

// ─── 360 全景区（P3c Task 8） ───────────────────────────────────────────
interface PanoramaImageRow {
  id: string
  imagePath: string
  label?: string | null
  [key: string]: unknown
}

const panoramas = ref<PanoramaImageRow[]>([])
const activePanoramaId = ref<string | null>(null)
const generating = ref(false)
const uploading = ref(false)

const activePanorama = computed<PanoramaImageRow | undefined>(() =>
  panoramas.value.find((p) => p.id === activePanoramaId.value),
)

function getPanoramaApi() {
  return (window as unknown as {
    electronAPI?: {
      episodeProduction?: { asset?: { panorama?: any } }
    }
  }).electronAPI?.episodeProduction?.asset?.panorama
}

async function loadPanoramas() {
  const api = getPanoramaApi()
  if (!api) return
  if (!props.bindingId) return
  try {
    const resp = await api.list(props.bindingId)
    if (resp?.success && Array.isArray(resp.data)) {
      panoramas.value = resp.data as PanoramaImageRow[]
      if (
        (!activePanoramaId.value ||
          !panoramas.value.find((p) => p.id === activePanoramaId.value)) &&
        panoramas.value.length > 0
      ) {
        activePanoramaId.value = panoramas.value[0].id
      }
      if (panoramas.value.length === 0) {
        activePanoramaId.value = null
      }
    } else {
      panoramas.value = []
      activePanoramaId.value = null
    }
  } catch (e: any) {
    console.error('[LocationGalleryEditor] loadPanoramas 失败', e)
    panoramas.value = []
  }
}

/**
 * 拼接 360 全景生成的 stylePrompt：从 location effective data 拉名字 + 描述，
 * 拼成 "<name>: <description>"。无任何描述时不发请求（强制用户先填）。
 */
async function buildPanoramaStylePrompt(): Promise<string> {
  const locationApi = (window as unknown as {
    electronAPI?: { episodeProduction?: { asset?: { location?: any } } }
  }).electronAPI?.episodeProduction?.asset?.location
  if (!locationApi?.effective) {
    throw new Error('location.effective IPC 未暴露')
  }
  const resp = await locationApi.effective(props.bindingId)
  if (!resp?.success || !resp.data) {
    throw new Error(resp?.error || '加载地点信息失败')
  }
  const eff = resp.data as { name?: string | null; description?: string | null }
  const name = (eff.name ?? '').trim()
  const desc = (eff.description ?? '').trim()
  const parts = [name, desc].filter(Boolean)
  if (parts.length === 0) {
    throw new Error('请先在设定卡填写地点名称或描述，AI 全景才有可生成内容')
  }
  return parts.join('：')
}

async function onGeneratePanorama() {
  generating.value = true
  try {
    const stylePrompt = await buildPanoramaStylePrompt()
    const api = getPanoramaApi()
    if (!api) throw new Error('panorama API 未暴露')
    const resp = await api.generate({
      locationBindingId: props.bindingId,
      stylePrompt,
    })
    if (resp?.success && resp.data) {
      ElMessage.success('360 全景已生成')
      await loadPanoramas()
    } else {
      ElMessage.warning(
        resp?.error || '生成失败（待 P3c 后续接入真实 AI 全景 provider）',
      )
    }
  } catch (err: any) {
    ElMessage.error('生成失败: ' + (err?.message ?? '未知错误'))
  } finally {
    generating.value = false
  }
}

/**
 * ElUpload 在 :auto-upload="false" 模式下，每次选文件都会触发 on-change，
 * 我们手动接管：调 client 上传 → 后端校验 + 落盘 + 落表 → 刷新列表。
 */
async function onPickPanoramaFile(file: UploadFile) {
  const raw = file.raw
  if (!raw) return
  uploading.value = true
  try {
    await uploadPanoramaFile({
      file: raw,
      locationBindingId: props.bindingId,
    })
    ElMessage.success('已上传 360 全景')
    await loadPanoramas()
  } catch (err: any) {
    ElMessage.error('上传失败：' + (err?.message ?? '未知错误'))
  } finally {
    uploading.value = false
  }
}

function onSnapshotCreated() {
  // PanoramaSnapshotEditor 自管理 snapshots 列表，本组件无需响应
}

onMounted(() => {
  reload()
  loadPanoramas()
})
watch(() => props.bindingId, () => {
  reload()
  loadPanoramas()
})
watch(() => props.assetType, reload)

defineExpose({ reload })
</script>

<style scoped>
.location-gallery-editor {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.location-gallery-editor :deep(.el-card__body) {
  flex: 1;
  overflow: auto;
  min-height: 0;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: var(--el-text-color-primary);
}

.header-title {
  font-weight: 600;
  font-size: 14px;
}

.gallery-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.main-card,
.category-card {
  background: var(--el-bg-color);
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.progress-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-weight: 400;
}

.main-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 160px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
  overflow: hidden;
  margin-bottom: 8px;
}

.main-thumb img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.main-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.thumb-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  gap: 8px;
}

.thumb-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.thumb-frame {
  width: 100%;
  aspect-ratio: 1 / 1;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  color: var(--el-text-color-secondary);
}

.thumb-frame img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.thumb-empty-icon {
  color: var(--el-text-color-placeholder);
}

.thumb-label {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  text-align: center;
  width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 360 全景区（P3c Task 8） */
.panorama-section {
  background: var(--el-bg-color);
}

.panorama-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  margin-bottom: 12px;
}

.panorama-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.panorama-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.panorama-tabs {
  margin-bottom: 4px;
}
</style>
