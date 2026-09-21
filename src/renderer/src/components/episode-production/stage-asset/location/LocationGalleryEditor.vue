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
                <div class="tip-title">💡 主图与变体如何被分镜使用？</div>
                <p class="tip-body">
                  关键帧生成时按场景维度（angle/time/weather）评分，命中分最高的图作为参考；
                  评分都不命中时，回退到 ★ 默认主图。
                </p>
                <ol class="tip-list">
                  <li>主图：按用途自由命名（"平面图" / "正面外景" / 自定义），可填 metadata 让其参与维度评分</li>
                  <li>变体：从某张主图派生，单次出 1 张，自由 label + metadata</li>
                  <li>360 全景：截视角作为分镜背景 ref（3D 一致）</li>
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
      <!-- 主图列表（spec 2026-05-09 多张主图） -->
      <el-card class="category-card" shadow="never">
        <template #header>
          <div class="section-header">
            <span class="section-title">
              主图
              <span class="progress-meta">{{ mainImages.length }} 张</span>
            </span>
            <span class="header-actions">
              <el-button
                type="primary"
                plain
                size="small"
                :disabled="busy"
                @click="onOpenAddMainDialog"
              >
                <el-icon><Plus /></el-icon>
                添加主图
              </el-button>
            </span>
          </div>
        </template>

        <div v-if="mainImages.length === 0" class="empty-hint">
          尚未添加主图。点击 "+ 添加主图" 创建第一张主图（自动设为默认）。
        </div>
        <div v-else class="thumb-grid">
          <div
            v-for="img in mainImages"
            :key="img.id"
            class="thumb-cell main-cell"
            :class="{ 'is-default': img.isMain === 1 }"
          >
            <div class="thumb-frame main-thumb">
              <img
                :src="toImageUrl(img.thumbnailPath || img.imagePath)"
                :alt="img.label || '主图'"
                @dblclick="openPreview(mainImages, mainImages.indexOf(img))"
              />
              <span v-if="img.isMain === 1" class="default-tag">★ 默认</span>
              <div class="thumb-tools" @click.stop>
                <el-tooltip content="详情" placement="top">
                  <el-icon class="thumb-tool-icon" :size="14" @click="openDetailDialog(img)">
                    <InfoFilled />
                  </el-icon>
                </el-tooltip>
                <el-tooltip v-if="img.isMain !== 1" content="设为默认主图" placement="top">
                  <el-icon class="thumb-tool-icon" :size="14" @click="onSwitchMain(img)">
                    <Star />
                  </el-icon>
                </el-tooltip>
                <el-tooltip content="编辑 metadata" placement="top">
                  <el-icon class="thumb-tool-icon" :size="14" @click="onEditMeta(img)">
                    <EditPen />
                  </el-icon>
                </el-tooltip>
                <el-tooltip content="下载" placement="top">
                  <el-icon class="thumb-tool-icon" :size="14" @click="downloadImage(img)">
                    <Download />
                  </el-icon>
                </el-tooltip>
                <el-tooltip content="删除" placement="top">
                  <el-icon class="thumb-tool-icon danger" :size="14" @click="onDeleteImage(img)">
                    <Delete />
                  </el-icon>
                </el-tooltip>
              </div>
            </div>
            <div class="thumb-label">
              {{ img.label || '默认主图' }}
              <span v-if="hasMetadata(img)" class="meta-chip" :title="metadataText(img)">
                🏷 {{ metadataText(img) }}
              </span>
            </div>
          </div>
        </div>
      </el-card>

      <!-- 平面布局图（2026-09-21 平面图先行：根地点主图生成前自动出的布局参考图） -->
      <el-card v-if="floorPlanImages.length > 0" class="category-card" shadow="never">
        <template #header>
          <div class="section-header">
            <span class="section-title">
              平面布局图
              <span class="progress-meta">{{ floorPlanImages.length }} 张</span>
            </span>
            <span class="header-actions">
              <el-button
                type="warning"
                plain
                size="small"
                :disabled="busy"
                :loading="busyKey === 'floor-plan-regen'"
                title="删除现有平面布局图并重新生成主图（generateMain 会先自动补平面图再出主图）"
                @click="onRegenerateFloorPlan"
              >
                <el-icon><Refresh /></el-icon>
                重新生成
              </el-button>
              <el-tooltip
                content="主图生成前自动生成的俯视布局参考图；主图以其为参考还原建筑布局。删除后下次生成主图会重新生成"
                placement="top"
              >
                <el-icon class="hint-icon"><InfoFilled /></el-icon>
              </el-tooltip>
            </span>
          </div>
        </template>
        <div class="thumb-grid">
          <div v-for="img in floorPlanImages" :key="img.id" class="thumb-cell">
            <div class="thumb-frame main-thumb">
              <img
                :src="toImageUrl(img.thumbnailPath || img.imagePath)"
                :alt="img.label || '平面布局图'"
                @dblclick="openPreview(floorPlanImages, floorPlanImages.indexOf(img))"
              />
              <div class="thumb-tools" @click.stop>
                <el-tooltip content="下载" placement="top">
                  <el-icon class="thumb-tool-icon" :size="14" @click="downloadImage(img)">
                    <Download />
                  </el-icon>
                </el-tooltip>
                <el-tooltip content="删除" placement="top">
                  <el-icon class="thumb-tool-icon danger" :size="14" @click="onDeleteImage(img)">
                    <Delete />
                  </el-icon>
                </el-tooltip>
              </div>
            </div>
            <div class="thumb-label">{{ img.label || '平面布局图' }}</div>
          </div>
        </div>
      </el-card>

      <!-- 变体图列表（合并的 'variant' category） -->
      <el-card class="category-card" shadow="never">
        <template #header>
          <div class="section-header">
            <span class="section-title">
              变体图
              <span class="progress-meta">{{ variantImages.length }} 张</span>
            </span>
            <span class="header-actions">
              <el-button
                type="primary"
                plain
                size="small"
                :disabled="busy || mainImages.length === 0"
                :title="mainImages.length === 0 ? '请先添加至少一张主图' : '基于已有主图派生变体'"
                @click="onOpenDeriveDialog"
              >
                <el-icon><Plus /></el-icon>
                派生变体
              </el-button>
            </span>
          </div>
        </template>

        <div v-if="variantImages.length === 0" class="empty-hint">
          {{ mainImages.length === 0 ? '请先添加主图，再派生变体' : '尚未派生变体；点 "+ 派生变体" 单次生成一张' }}
        </div>
        <div v-else class="thumb-grid">
          <div
            v-for="img in variantImages"
            :key="img.id"
            class="thumb-cell"
          >
            <div class="thumb-frame">
              <img
                :src="toImageUrl(img.thumbnailPath || img.imagePath)"
                :alt="img.label || '变体'"
                @dblclick="openPreview(variantImages, variantImages.indexOf(img))"
              />
              <div class="thumb-tools" @click.stop>
                <el-tooltip content="详情" placement="top">
                  <el-icon class="thumb-tool-icon" :size="14" @click="openDetailDialog(img)">
                    <InfoFilled />
                  </el-icon>
                </el-tooltip>
                <el-tooltip content="编辑 metadata" placement="top">
                  <el-icon class="thumb-tool-icon" :size="14" @click="onEditMeta(img)">
                    <EditPen />
                  </el-icon>
                </el-tooltip>
                <el-tooltip content="下载" placement="top">
                  <el-icon class="thumb-tool-icon" :size="14" @click="downloadImage(img)">
                    <Download />
                  </el-icon>
                </el-tooltip>
                <el-tooltip content="删除" placement="top">
                  <el-icon class="thumb-tool-icon danger" :size="14" @click="onDeleteImage(img)">
                    <Delete />
                  </el-icon>
                </el-tooltip>
              </div>
            </div>
            <div class="thumb-label">
              {{ img.label || '(未命名)' }}
              <span v-if="hasMetadata(img)" class="meta-chip" :title="metadataText(img)">
                🏷 {{ metadataText(img) }}
              </span>
              <span v-if="getDerivedFromName(img)" class="derived-from" :title="`派生自：${getDerivedFromName(img)}`">
                ← {{ getDerivedFromName(img) }}
              </span>
            </div>
          </div>
        </div>
      </el-card>

      <!-- 360 全景区（保持不动） -->
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
                      屏风等元素位置在 3D 空间里完全一致 → AI 生成的关键帧背景结构稳定。
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

    <!-- 添加主图 / 派生变体 dialog -->
    <AddMainImageDialog
      v-model="showAddMainDialog"
      :asset-type="props.assetType"
      :binding-id="props.bindingId"
      :is-first-main="mainImages.length === 0"
      @submitted="reload"
    />
    <DeriveVariantDialog
      v-model="showDeriveDialog"
      :asset-type="props.assetType"
      :binding-id="props.bindingId"
      :all-images="allImages"
      @submitted="reload"
    />

    <!-- 编辑 metadata dialog（共享给主图 + 变体） -->
    <el-dialog
      v-model="showMetaDialog"
      title="编辑评分维度 metadata"
      width="480px"
      destroy-on-close
      append-to-body
    >
      <el-form label-position="top">
        <el-form-item label="视角 (angle)">
          <el-input v-model="metaForm.angle" placeholder="entrance / wide_shot / interior_a ..." />
        </el-form-item>
        <el-form-item label="时间 (time)">
          <el-input v-model="metaForm.time" placeholder="morning / night / dusk ..." />
        </el-form-item>
        <el-form-item label="天气 (weather)">
          <el-input v-model="metaForm.weather" placeholder="rainy / sunny / snowy ..." />
        </el-form-item>
        <div class="meta-tip">
          填好维度后，关键帧生成会按场景命中：angle +4 / time +2 / weather +1
        </div>
      </el-form>
      <template #footer>
        <el-button @click="showMetaDialog = false">取消</el-button>
        <el-button type="primary" :loading="savingMeta" @click="onSaveMetadata">保存</el-button>
      </template>
    </el-dialog>

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

    <!-- 生成详情透明度面板（spec 2026-05-09 ep-redesign §3.2 A1） -->
    <GenerationDetailDialog
      v-model="detailDialog.open"
      :image="detailDialog.image"
      :all-images="allImages"
    />
  </el-card>
</template>

<script setup lang="ts">
/**
 * 地点（资产）图谱编辑器（spec 2026-05-09 重设计）
 *
 * 多张主图 + 自由变体派生模型：
 *   - 主图列表卡：用户按需添加多张主图，自由 label（"平面图" / "正面外景" / 自定义），
 *     可填 metadata 让其参与场景维度评分；★ 默认主图作为评分都不命中时的兜底
 *   - 变体图列表卡：从已有主图派生（dialog 选基图 + 自由 label + 描述 + metadata），
 *     单次出 1 张
 *   - 360 全景区：保留不动（PanoramaSnapshotEditor 复用）
 *
 * 评分系统（reference-image-selector.ts）已升级：location 路径所有图（含主图）按
 * metadata 维度评分，让带 metadata 的主图被对应分镜直接命中，省一次派生。
 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { UploadFile } from 'element-plus'
import {
  ArrowLeft,
  ArrowRight,
  Delete,
  Download,
  EditPen,
  InfoFilled,
  Plus,
  QuestionFilled,
  Refresh,
  Star,
} from '@element-plus/icons-vue'
import { useAssetImageActions } from '@/composables/use-asset-image-actions'
import PanoramaSnapshotEditor from './PanoramaSnapshotEditor.vue'
import AddMainImageDialog from './AddMainImageDialog.vue'
import DeriveVariantDialog from './DeriveVariantDialog.vue'
import GenerationDetailDialog from '../shared/GenerationDetailDialog.vue'
import { uploadPanoramaFile } from '@/api/panorama-upload'
import { toImageUrl } from '@/utils/asset-url'
import { generateMainFor } from '@/api/main-image-generator'

const props = defineProps<{
  bindingId: string
  assetType: 'character' | 'location' | 'item'
}>()

interface AssetImageRow {
  id: string
  category: string
  label: string | null
  imagePath: string
  thumbnailPath?: string | null
  isMain: number
  metadata?: string | Record<string, unknown> | null
  derivedFromImageId?: string | null
  // spec 2026-05-09 透明度面板：以下字段后端已落 asset_image 表
  prompt?: string | null
  negativePrompt?: string | null
  width?: number | null
  height?: number | null
  createdAt?: string | number | Date | null
}

const loading = ref(false)
const allImages = ref<AssetImageRow[]>([])

/**
 * 全局忙状态 key：
 *   - null              所有按钮可用
 *   - 'panorama'        AI 生成全景
 *   - 'panorama-upload' 上传现成全景
 *   - 'switch-main:<id>'  切换默认主图中
 *   - 'floor-plan-regen'  平面图删除+重生中
 */
const busyKey = ref<string | null>(null)
const busy = computed(() => busyKey.value !== null)

/** 主图列表（category='main'，按 isMain=1 优先排序） */
const mainImages = computed<AssetImageRow[]>(() => {
  const mains = allImages.value.filter((i) => i.category === 'main')
  // 默认主图（isMain=1）排第一
  return [...mains].sort((a, b) => (b.isMain ?? 0) - (a.isMain ?? 0))
})

/** 变体列表（category='variant'，新模型） */
const variantImages = computed<AssetImageRow[]>(() =>
  allImages.value.filter((i) => i.category === 'variant'),
)

/** 平面布局图（category='floor_plan'，2026-09-21 平面图先行） */
const floorPlanImages = computed<AssetImageRow[]>(() =>
  allImages.value.filter((i) => i.category === 'floor_plan'),
)

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

// ===== 主图：添加 / 切换默认 =====
const showAddMainDialog = ref(false)
function onOpenAddMainDialog(): void {
  showAddMainDialog.value = true
}

async function onSwitchMain(img: AssetImageRow): Promise<void> {
  if (busy.value) return
  busyKey.value = `switch-main:${img.id}`
  try {
    const api = getApi()
    if (!api?.image?.switchMain) {
      ElMessage.error('image.switchMain IPC 未暴露')
      return
    }
    const resp = await api.image.switchMain(img.id)
    if (!resp?.success) {
      ElMessage.error(resp?.error || '切换默认主图失败')
      return
    }
    ElMessage.success(`已切换默认主图：${img.label || '默认主图'}`)
    await reload()
  } finally {
    busyKey.value = null
  }
}

// ===== 变体：派生 dialog =====
const showDeriveDialog = ref(false)
function onOpenDeriveDialog(): void {
  showDeriveDialog.value = true
}

// ===== Metadata 编辑（主图 + 变体共用） =====
const showMetaDialog = ref(false)
const editingMetaImage = ref<AssetImageRow | null>(null)
const metaForm = reactive({ angle: '', time: '', weather: '' })
const savingMeta = ref(false)

function parseMetadata(raw: any): Record<string, any> {
  if (!raw) return {}
  if (typeof raw === 'string') {
    try {
      const obj = JSON.parse(raw)
      return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {}
    } catch {
      return {}
    }
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, any>
  return {}
}

function hasMetadata(img: AssetImageRow): boolean {
  const m = parseMetadata(img.metadata)
  return Boolean(m.angle || m.time || m.weather)
}

function metadataText(img: AssetImageRow): string {
  const m = parseMetadata(img.metadata)
  const parts: string[] = []
  if (m.angle) parts.push(String(m.angle))
  if (m.time) parts.push(String(m.time))
  if (m.weather) parts.push(String(m.weather))
  return parts.join(' · ')
}

function onEditMeta(img: AssetImageRow): void {
  editingMetaImage.value = img
  const m = parseMetadata(img.metadata)
  metaForm.angle = (m.angle ?? '') as string
  metaForm.time = (m.time ?? '') as string
  metaForm.weather = (m.weather ?? '') as string
  showMetaDialog.value = true
}

async function onSaveMetadata(): Promise<void> {
  if (!editingMetaImage.value) return
  savingMeta.value = true
  try {
    const api = getApi()
    if (!api?.image?.updateMetadata) {
      ElMessage.error('image.updateMetadata IPC 未暴露')
      return
    }
    const meta: Record<string, string> = {}
    if (metaForm.angle.trim()) meta.angle = metaForm.angle.trim()
    if (metaForm.time.trim()) meta.time = metaForm.time.trim()
    if (metaForm.weather.trim()) meta.weather = metaForm.weather.trim()
    const resp = await api.image.updateMetadata(
      editingMetaImage.value.id,
      Object.keys(meta).length > 0 ? meta : null,
    )
    if (!resp?.success) {
      ElMessage.error(resp?.error || '保存 metadata 失败')
      return
    }
    ElMessage.success('已保存')
    showMetaDialog.value = false
    await reload()
  } finally {
    savingMeta.value = false
  }
}

/** 变体派生自的主图 label（缩略显示） */
function getDerivedFromName(img: AssetImageRow): string | null {
  if (!img.derivedFromImageId) return null
  const base = allImages.value.find((i) => i.id === img.derivedFromImageId)
  return base?.label || (base ? '默认主图' : null)
}

// ─── 360 全景区（保留原逻辑） ───────────────────────────────────────────
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
  if (img.category === 'main') return img.label || '主图'
  return img.label || '变体'
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

// ===== 下载 / 删除（共享 composable，双端兼容） =====
const { downloadImage, onDeleteImage } = useAssetImageActions({
  onAfterDelete: reload,
  mainDeleteWarning: () =>
    `当前要删除的是 ★ 默认主图。删除后需手动指定其他主图为默认，或重新添加，是否继续？`,
  itemDeleteConfirm: (img) =>
    `确认删除「${(img as any).label || (img.category === 'main' ? '默认主图' : '变体')}」？`,
})

/**
 * 平面图重新生成（2026-09-21 实测修复）：删掉全部 floor_plan 图后调 generateMain
 * ——后端主图生成流程会先自动补平面图再出主图（location-constraints 平面图先行）。
 */
async function onRegenerateFloorPlan(): Promise<void> {
  if (busy.value || props.assetType !== 'location') return
  try {
    await ElMessageBox.confirm(
      '将删除现有平面布局图，并重新生成主图（会先自动补一张新平面图再出主图）。是否继续？',
      '重新生成平面布局图',
      { type: 'warning', confirmButtonText: '重新生成', cancelButtonText: '取消' },
    )
  } catch {
    return // 用户取消
  }
  busyKey.value = 'floor-plan-regen'
  try {
    const api = getApi()
    if (!api?.image?.delete) {
      ElMessage.error('image.delete IPC 未暴露')
      return
    }
    for (const img of floorPlanImages.value) {
      const resp = await api.image.delete(img.id)
      if (!resp?.success) {
        ElMessage.error(resp?.error || '删除旧平面图失败')
        return
      }
    }
    await generateMainFor('location', props.bindingId)
    ElMessage.success('平面布局图与主图已重新生成')
    await reload()
  } catch (e: any) {
    ElMessage.error(e?.message || '重新生成失败')
  } finally {
    busyKey.value = null
  }
}

// ===== 生成详情透明度面板（spec 2026-05-09 ep-redesign §3.2 A1） =====
const detailDialog = ref<{ open: boolean; image: AssetImageRow | null }>({
  open: false,
  image: null,
})

function openDetailDialog(img: AssetImageRow | null | undefined): void {
  if (!img) return
  detailDialog.value = { open: true, image: img }
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

.location-gallery-editor :deep(.el-card__header) {
  padding: 6px 12px;
}

.location-gallery-editor :deep(.el-card__body) {
  flex: 1;
  overflow: auto;
  min-height: 0;
  padding: 10px 12px;
}

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

.tip-block {
  max-width: 380px;
}

.tip-title {
  font-weight: 600;
  margin-bottom: 6px;
}

.tip-body {
  font-size: 12px;
  margin: 0 0 6px;
  line-height: 1.6;
}

.tip-list {
  font-size: 12px;
  margin: 0;
  padding-left: 18px;
  line-height: 1.6;
}

.gallery-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.section-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: 13px;
  color: var(--el-text-color-primary);
}

.progress-meta {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  font-weight: 400;
}

.header-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.empty-hint {
  text-align: center;
  padding: 24px 0;
  color: var(--el-text-color-placeholder);
  font-size: 12px;
  font-style: italic;
}

.thumb-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
}

.thumb-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.thumb-frame {
  position: relative;
  aspect-ratio: 1 / 1;
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 默认主图加金边突显 */
.main-cell.is-default .thumb-frame {
  border-color: var(--el-color-warning);
  box-shadow: 0 0 0 1px var(--el-color-warning-light-7);
}

.main-thumb {
  /* 主图比变体略大 */
  aspect-ratio: 1 / 1;
}

.thumb-frame img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  cursor: zoom-in;
}

.default-tag {
  position: absolute;
  top: 4px;
  left: 4px;
  padding: 1px 6px;
  background: var(--el-color-warning);
  color: #fff;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 600;
}

.thumb-tools {
  position: absolute;
  top: 4px;
  right: 4px;
  display: flex;
  gap: 4px;
  background: rgba(0, 0, 0, 0.5);
  padding: 2px 4px;
  border-radius: 3px;
  opacity: 1;
  transition: opacity 0.15s;
}

.thumb-frame:hover .thumb-tools {
  opacity: 1;
}

.thumb-tool-icon {
  color: #fff;
  cursor: pointer;
  transition: color 0.15s;
}

.thumb-tool-icon:hover {
  color: var(--el-color-primary);
}

.thumb-tool-icon.danger {
  background: var(--el-color-danger);
  color: #fff;
  padding: 3px;
  border-radius: 50%;
}

.thumb-tool-icon.danger:hover {
  background: var(--el-color-danger);
  color: #fff;
}

.thumb-label {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--el-text-color-primary);
}

.meta-chip {
  font-size: 10px;
  padding: 0 4px;
  border-radius: 2px;
  background: var(--el-color-success-light-9);
  color: var(--el-color-success);
}

.derived-from {
  font-size: 10px;
  color: var(--el-text-color-placeholder);
}

.panorama-section .panorama-hint {
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
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.meta-tip {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  margin-top: 4px;
}

/* 大图预览 */
.preview-container {
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  min-height: 60vh;
}

.preview-container img {
  max-width: 100%;
  max-height: 75vh;
  object-fit: contain;
  cursor: pointer;
}

.preview-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 60px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.3);
  color: #fff;
  border-radius: 50%;
  cursor: pointer;
  transition: background 0.15s;
}

.preview-nav:hover {
  background: rgba(0, 0, 0, 0.6);
}

.preview-nav.disabled {
  opacity: 0.3;
  pointer-events: none;
}

.preview-nav.prev {
  left: 16px;
}

.preview-nav.next {
  right: 16px;
}

.preview-counter {
  text-align: center;
  margin-top: 8px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
