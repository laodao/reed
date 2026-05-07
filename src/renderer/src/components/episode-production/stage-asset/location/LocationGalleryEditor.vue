<template>
  <el-card class="location-gallery-editor" shadow="never">
    <template #header>
      <div class="card-header">
        <span class="header-title">
          🖼️ 图谱
          <el-tooltip placement="bottom-start" effect="light" :show-arrow="false">
            <el-icon class="help-icon"><QuestionFilled /></el-icon>
            <template #content>
              <div class="tip-block">
                <div class="tip-title">💡 分镜如何用这些图？</div>
                <p class="tip-body">
                  ⑤ 画面+音频阶段每生成一张关键帧时，参考图按以下优先级注入：
                </p>
                <ol class="tip-list">
                  <li>★ 该分镜的全景截图（背景 ref，3D 一致）</li>
                  <li>没有截图 → 退回到地点 角度变体（按 时间 + 天气 + 视角 匹配）</li>
                  <li>都没有 → 退回到主图</li>
                </ol>
              </div>
            </template>
          </el-tooltip>
        </span>
        <el-button size="small" text :disabled="busy" @click="reload">
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
            <span class="section-title">主图</span>
            <span class="header-actions">
              <el-button
                v-if="mainImage"
                size="small"
                :loading="busyKey === 'main'"
                :disabled="busy && busyKey !== 'main'"
                @click="onRegenerateMain"
              >
                ↺ 重生成
              </el-button>
              <el-button
                v-else
                type="primary"
                plain
                size="small"
                :loading="busyKey === 'main'"
                :disabled="busy && busyKey !== 'main'"
                @click="onGenerateMain"
              >
                ✨ 生成主图
              </el-button>
              <el-button size="small" :disabled="busy" @click="onUploadMain">
                {{ mainImage ? '⬆ 上传替换' : '⬆ 上传' }}
              </el-button>
            </span>
          </div>
        </template>

        <div class="main-thumb">
          <template v-if="mainImageSrc && mainImage">
            <img
              :src="mainImageSrc"
              alt="主图"
              @dblclick="openPreview([mainImage], 0)"
            />
            <div class="thumb-tools" @click.stop>
              <el-tooltip content="下载" placement="top">
                <el-icon class="thumb-tool-icon" :size="14" @click="downloadImage(mainImage)"><Download /></el-icon>
              </el-tooltip>
              <el-tooltip content="删除" placement="top">
                <el-icon class="thumb-tool-icon danger" :size="14" @click="onDeleteImage(mainImage)"><Delete /></el-icon>
              </el-tooltip>
            </div>
          </template>
          <div v-else-if="busyKey === 'main'" class="thumb-loading">
            <el-icon class="is-loading" :size="32"><Loading /></el-icon>
            <span>生成中…</span>
          </div>
          <el-empty v-else description="尚未生成主图" :image-size="60" />
        </div>
      </el-card>

      <!-- 3 个 category 网格：时间 / 天气 / 角度变体 -->
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
              :loading="busyKey === `derive:${cat.key}`"
              :disabled="(busy && busyKey !== `derive:${cat.key}`) || getMissingLabels(cat).length === 0"
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
              <template v-if="getImageByLabel(cat.key, label)?.imagePath">
                <img
                  :src="toImageUrl(getImageByLabel(cat.key, label)!.imagePath)"
                  :alt="labelText(cat.key, label)"
                  @dblclick="openPreview(getCategoryPreviewList(cat), getCategoryPreviewIndex(cat, label))"
                />
                <div class="thumb-tools" @click.stop>
                  <el-tooltip content="下载" placement="top">
                    <el-icon
                      class="thumb-tool-icon"
                      :size="14"
                      @click="downloadImage(getImageByLabel(cat.key, label)!)"
                    ><Download /></el-icon>
                  </el-tooltip>
                  <el-tooltip content="删除" placement="top">
                    <el-icon
                      class="thumb-tool-icon danger"
                      :size="14"
                      @click="onDeleteImage(getImageByLabel(cat.key, label)!)"
                    ><Delete /></el-icon>
                  </el-tooltip>
                </div>
              </template>
              <el-icon
                v-else-if="busyKey === `derive:${cat.key}`"
                class="thumb-loading-icon is-loading"
                :size="20"
              ><Loading /></el-icon>
              <el-icon v-else size="24" class="thumb-empty-icon"><Plus /></el-icon>
            </div>
            <div class="thumb-label">{{ labelText(cat.key, label) }}</div>
          </div>
        </div>
      </el-card>

      <!-- 360 全景区 -->
      <el-card class="category-card panorama-section" shadow="never">
        <template #header>
          <div class="section-header">
            <span class="section-title">
              🌐 360 全景图
              <el-tooltip placement="bottom-start" effect="light" :show-arrow="false">
                <el-icon class="help-icon"><QuestionFilled /></el-icon>
                <template #content>
                  <div class="tip-block">
                    <div class="tip-title">💡 360 全景的作用</div>
                    <p class="tip-body">
                      从同一全景图截出的视角作为不同分镜的背景参考，木梁 / 灯笼 /
                      屏风等元素位置在 3D 空间里完全一致 → AI 生成的关键帧背景结构稳定，
                      跨分镜剪辑不会"穿帮"。
                    </p>
                  </div>
                </template>
              </el-tooltip>
              <el-tag v-if="panoramas.length > 0" type="success" size="small">
                已生成 {{ panoramas.length }}
              </el-tag>
              <el-tag v-else type="info" size="small">未生成</el-tag>
            </span>
            <span class="header-actions">
              <el-button
                type="primary"
                size="small"
                :loading="busyKey === 'panorama'"
                :disabled="busy && busyKey !== 'panorama'"
                @click="onGeneratePanorama"
              >
                ✨ AI 生成 360 全景
              </el-button>
              <el-upload
                :auto-upload="false"
                :show-file-list="false"
                :on-change="onPickPanoramaFile"
                accept="image/jpeg,image/png,image/webp"
                :disabled="busy"
              >
                <el-button
                  size="small"
                  :loading="busyKey === 'panorama-upload'"
                  :disabled="busy && busyKey !== 'panorama-upload'"
                >
                  ⬆ 上传现成 360 图
                </el-button>
              </el-upload>
            </span>
          </div>
        </template>

        <div class="panorama-hint">
          支持 jpg / png / webp，比例需≈2:1（equirectangular），≤50MB
        </div>

        <div v-if="panoramas.length > 0" class="panorama-list">
          <el-radio-group v-model="activePanoramaId" class="panorama-tabs" :disabled="busy">
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
            @main-replaced="reload"
          />
        </div>
      </el-card>
    </div>

    <!-- 图片大图预览（双击打开 / 左右翻页） -->
    <el-dialog
      v-model="showPreviewDialog"
      :title="previewDialogTitle"
      width="90%"
      class="asset-preview-dialog"
      append-to-body
      destroy-on-close
      @keydown.left="prevPreview"
      @keydown.right="nextPreview"
    >
      <div v-if="previewImage" class="preview-container">
        <div
          class="preview-nav prev"
          :class="{ disabled: previewIndex === 0 }"
          @click.stop="prevPreview"
        >
          <el-icon :size="32"><ArrowLeft /></el-icon>
        </div>
        <img
          :src="previewImageSrc"
          :alt="previewDialogTitle"
          draggable="false"
          @click.stop="nextPreview"
        />
        <div
          class="preview-nav next"
          :class="{ disabled: previewIndex >= previewList.length - 1 }"
          @click.stop="nextPreview"
        >
          <el-icon :size="32"><ArrowRight /></el-icon>
        </div>
      </div>
      <div v-if="previewList.length > 1" class="preview-counter">
        {{ previewIndex + 1 }} / {{ previewList.length }}
      </div>
    </el-dialog>
  </el-card>
</template>

<script setup lang="ts">
/**
 * 地点（资产）图谱编辑器
 * @description 主图 + 时间/天气/角度变体 + 360 全景图。
 *   - 主图卡 header 右侧直接放生成 / 重生成 / 上传按钮（紧凑布局）
 *   - 任意"生成"动作开始后，busyKey 全局封锁所有按钮，并在待生成位置显示 loading icon
 *   - 中英 key/label 分离：DB 仍存英文 key（time/weather/angle 与派生 service 对齐），
 *     UI 通过 LABEL_LABELS 显示中文
 *   - 提示文案改放在标题栏 ❓ icon hover，避免横版 banner 占空间
 */
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { UploadFile } from 'element-plus'
import {
  ArrowLeft,
  ArrowRight,
  Delete,
  Download,
  Loading,
  Plus,
  QuestionFilled,
  Refresh,
} from '@element-plus/icons-vue'
import { useAssetImageActions } from '@/composables/use-asset-image-actions'
import PanoramaSnapshotEditor from './PanoramaSnapshotEditor.vue'
import { uploadPanoramaFile } from '@/api/panorama-upload'
import {
  LOCATION_TIME_VALUES,
  LOCATION_WEATHER_VALUES,
  LOCATION_ANGLE_VALUES,
} from '@core/modules/episode-production/assets/constants/location-variants'
import { generateMainFor } from '@/api/main-image-generator'
import { toImageUrl } from '@/utils/asset-url'

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
  thumbnailPath?: string | null
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

/**
 * 各 category 下英文 key → 中文显示。
 * key 仍存到 DB 与派生 service 对齐，UI 显示中文。
 */
const LABEL_LABELS: Record<string, Record<string, string>> = {
  time_variant: {
    morning: '早晨',
    noon: '中午',
    afternoon: '午后',
    evening: '傍晚',
    night: '夜间',
    dawn: '拂晓',
    dusk: '黄昏',
  },
  weather_variant: {
    sunny: '晴',
    cloudy: '阴',
    rainy: '雨',
    snowy: '雪',
    foggy: '雾',
    stormy: '暴风',
  },
  angle_variant: {
    wide_shot: '远景',
    entrance: '入口',
    interior_a: '内景 A',
    interior_b: '内景 B',
  },
}

function labelText(catKey: string, label: string | null | undefined): string {
  if (!label) return ''
  return LABEL_LABELS[catKey]?.[label] ?? label
}

const loading = ref(false)
const allImages = ref<AssetImageRow[]>([])

/**
 * 全局忙状态 key：
 *   - null              所有按钮可用
 *   - 'main'            主图生成 / 重生成
 *   - 'derive:<cat>'    某一变体派生中
 *   - 'panorama'        AI 生成全景
 *   - 'panorama-upload' 上传现成全景
 */
const busyKey = ref<string | null>(null)
const busy = computed(() => busyKey.value !== null)

/** 当前生效主图：以 isMain=1 为准（同一 asset 下可能堆积多条 category='main' 的历史记录） */
const mainImage = computed(() => allImages.value.find((i) => i.isMain === 1) || null)

/** 主图 src：thumbnail 优先（旧数据可能存空字符串），回退 imagePath */
const mainImageSrc = computed(() => {
  const img = mainImage.value
  if (!img) return ''
  const thumb = (img.thumbnailPath ?? '').trim()
  const main = (img.imagePath ?? '').trim()
  return toImageUrl(thumb || main || '')
})

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

async function doGenerateMain() {
  if (busy.value) return
  busyKey.value = 'main'
  try {
    await generateMainFor(props.assetType, props.bindingId)
    ElMessage.success('主图已生成')
    await reload()
  } catch (e: any) {
    ElMessage.error('生成失败：' + (e?.message ?? '未知错误'))
  } finally {
    busyKey.value = null
  }
}

function onGenerateMain() {
  void doGenerateMain()
}

function onRegenerateMain() {
  void doGenerateMain()
}

function onUploadMain() {
  if (busy.value) return
  ElMessage.info('主图上传走 follow-up，当前请用「生成主图」AI 出图')
}

async function onBatchDerive(cat: CategoryConfig) {
  if (busy.value) return
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

  busyKey.value = `derive:${cat.key}`
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
  } finally {
    busyKey.value = null
  }
}

// ─── 360 全景区 ───────────────────────────────────────────
interface PanoramaImageRow {
  id: string
  imagePath: string
  label?: string | null
  [key: string]: unknown
}

const panoramas = ref<PanoramaImageRow[]>([])
const activePanoramaId = ref<string | null>(null)

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
  if (busy.value) return
  busyKey.value = 'panorama'
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
    busyKey.value = null
  }
}

async function onPickPanoramaFile(file: UploadFile) {
  if (busy.value) return
  const raw = file.raw
  if (!raw) return
  busyKey.value = 'panorama-upload'
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
    busyKey.value = null
  }
}

function onSnapshotCreated() {
  // PanoramaSnapshotEditor 自管理 snapshots 列表，本组件无需响应
}

// ===== 双击大图预览 =====
const showPreviewDialog = ref(false)
const previewList = ref<AssetImageRow[]>([])
const previewIndex = ref(0)

const previewImage = computed<AssetImageRow | null>(
  () => previewList.value[previewIndex.value] ?? null,
)

const previewImageSrc = computed(() => {
  const img = previewImage.value
  if (!img) return ''
  return toImageUrl((img.imagePath ?? '').trim() || '')
})

const previewDialogTitle = computed(() => {
  const img = previewImage.value
  if (!img) return ''
  if (img.category === 'main') return '主图'
  return labelText(img.category, img.label) || img.category
})

function openPreview(list: AssetImageRow[], startIdx: number): void {
  if (list.length === 0) return
  previewList.value = list
  previewIndex.value = Math.max(0, Math.min(startIdx, list.length - 1))
  showPreviewDialog.value = true
}

function prevPreview(): void {
  if (previewIndex.value > 0) previewIndex.value--
}

function nextPreview(): void {
  if (previewIndex.value < previewList.value.length - 1) previewIndex.value++
}

/** 该 category 下"已存在的图"作为预览翻页 list */
function getCategoryPreviewList(cat: CategoryConfig): AssetImageRow[] {
  return cat.labels
    .map((l) => getImageByLabel(cat.key, l))
    .filter((x): x is AssetImageRow => !!x)
}

function getCategoryPreviewIndex(cat: CategoryConfig, label: string): number {
  const list = getCategoryPreviewList(cat)
  return Math.max(0, list.findIndex((i) => i.category === cat.key && i.label === label))
}

// ===== 下载 / 删除（共享 composable，双端兼容） =====
const { downloadImage, onDeleteImage } = useAssetImageActions({
  onAfterDelete: reload,
  mainDeleteWarning: () =>
    `当前要删除的是"主图"。删除后该地点将进入"缺主图"状态，是否继续？`,
  itemDeleteConfirm: (img) =>
    `确认删除"${labelText(img.category, img.label) || img.category}"这张图？`,
})

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

/* 紧凑：图谱外卡和内卡 header padding 调矮 */
.location-gallery-editor :deep(.el-card__header) {
  padding: 6px 12px;
}

.location-gallery-editor :deep(.el-card__body) {
  flex: 1;
  overflow: auto;
  min-height: 0;
  padding: 10px 12px;
}

.location-gallery-editor :deep(.main-card .el-card__body),
.location-gallery-editor :deep(.category-card .el-card__body) {
  padding: 8px 10px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: var(--el-text-color-primary);
  min-height: 22px;
}

.header-title {
  font-weight: 600;
  font-size: 14px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.help-icon {
  color: var(--el-text-color-placeholder);
  cursor: help;
  font-size: 14px;
  transition: color 0.15s;
}

.help-icon:hover {
  color: var(--el-color-primary);
}

.gallery-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.main-card,
.category-card {
  background: var(--el-bg-color);
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 24px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  flex-wrap: wrap;
}

.header-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.progress-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-weight: 400;
}

.main-thumb {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 160px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
  overflow: hidden;
}

.main-thumb img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.thumb-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.thumb-loading .el-icon {
  color: var(--el-color-primary);
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
  position: relative;
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

/* hover 工具条：右上角下载 / 删除 icon（仅在格子有图时显示） */
.thumb-tools {
  position: absolute;
  top: 4px;
  right: 4px;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s;
}

.thumb-frame:hover .thumb-tools,
.main-thumb:hover .thumb-tools {
  opacity: 1;
}

.thumb-tool-icon {
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  padding: 4px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s;
}

.thumb-tool-icon:hover {
  background: var(--el-color-primary);
}

.thumb-tool-icon.danger:hover {
  background: var(--el-color-danger);
}

.thumb-frame img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.thumb-empty-icon {
  color: var(--el-text-color-placeholder);
}

.thumb-loading-icon {
  color: var(--el-color-primary);
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

/* 360 全景区 */
.panorama-section {
  background: var(--el-bg-color);
}

.panorama-hint {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  margin-bottom: 8px;
}

.panorama-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.panorama-tabs {
  margin-bottom: 4px;
}

/* tooltip 内的 tip 排版 */
.tip-block {
  max-width: 320px;
  font-size: 12px;
  color: var(--el-text-color-regular);
}

.tip-title {
  font-weight: 600;
  font-size: 13px;
  color: var(--el-text-color-primary);
  margin-bottom: 4px;
}

.tip-body {
  margin: 0 0 4px;
  line-height: 1.6;
}

.tip-list {
  margin: 0;
  padding-left: 18px;
  line-height: 1.7;
}
</style>

<style lang="scss">
/* 预览大图 dialog —— 非 scoped，因为 el-dialog 渲染到 body 外 */
.asset-preview-dialog {
  .el-dialog__body {
    padding: 0;
  }

  .preview-container {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 70vh;
    background: var(--el-fill-color-darker);

    img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      cursor: pointer;
      user-select: none;
    }
  }

  .preview-nav {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 56px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.85);
    background: rgba(0, 0, 0, 0.25);
    cursor: pointer;
    transition: background 0.15s;
    user-select: none;

    &:hover {
      background: rgba(0, 0, 0, 0.45);
    }

    &.disabled {
      opacity: 0.3;
      cursor: not-allowed;
      pointer-events: none;
    }

    &.prev {
      left: 0;
    }

    &.next {
      right: 0;
    }
  }

  .preview-counter {
    text-align: center;
    padding: 8px 0;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
}
</style>
