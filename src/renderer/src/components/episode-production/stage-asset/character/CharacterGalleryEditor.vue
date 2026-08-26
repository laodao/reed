<template>
  <el-card class="character-gallery-editor" shadow="never">
    <template #header>
      <div class="card-header">
        <span class="header-title">🖼️ 图谱</span>
        <el-button size="small" text :disabled="busy" @click="reload">
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
      </div>
    </template>

    <div v-loading="loading" class="gallery-body">
      <!--
        顶部并排（spec 2026-05-08 v5）：
          左：主图（撑满整个 top-row 高度）
          右：right-stack（服装卡 + 视角卡 上下叠放）
        服装卡限高约 200px（避免空态时撑得过大），视角卡占 right-stack 剩余高度。
        下方循环只渲染 表情 / 姿势（视角已上移到 right-stack）。
      -->
      <div class="top-row">
        <el-card class="main-card" shadow="never">
          <template #header>
            <div class="section-header">
              <span class="section-title">主图 (main)</span>
              <span class="header-actions">
                <template v-if="mainImage">
                  <el-button
                    size="small"
                    :loading="busyKey === 'main'"
                    :disabled="busy && busyKey !== 'main'"
                    @click="onRegenerateMain"
                  >
                    ↺ 重生成
                  </el-button>
                  <el-upload
                    :auto-upload="false"
                    :show-file-list="false"
                    :on-change="onPickMainFile"
                    accept="image/jpeg,image/png,image/webp"
                    :disabled="busy"
                  >
                    <el-button
                      size="small"
                      :loading="busyKey === 'main-upload'"
                      :disabled="busy && busyKey !== 'main-upload'"
                    >
                      ⬆ 上传替换
                    </el-button>
                  </el-upload>
                </template>
                <template v-else>
                  <el-button
                    type="primary"
                    plain
                    size="small"
                    :loading="busyKey === 'main'"
                    :disabled="busy && busyKey !== 'main'"
                    @click="onGenerateMain"
                  >
                    ✨ 生成主图
                  </el-button>
                  <el-upload
                    :auto-upload="false"
                    :show-file-list="false"
                    :on-change="onPickMainFile"
                    accept="image/jpeg,image/png,image/webp"
                    :disabled="busy"
                  >
                    <el-button
                      size="small"
                      :loading="busyKey === 'main-upload'"
                      :disabled="busy && busyKey !== 'main-upload'"
                    >
                      ⬆ 上传主图
                    </el-button>
                  </el-upload>
                </template>
              </span>
            </div>
          </template>

          <div class="main-thumb">
            <template v-if="mainImageSrc && mainImage">
              <img
                :src="mainImageSrc"
                alt="主图"
                @dblclick="openPreview('main', [mainImage], 0)"
              />
              <div class="thumb-tools" @click.stop>
                <el-tooltip content="详情" placement="top">
                  <el-icon class="thumb-tool-icon" :size="14" @click="openDetailDialog(mainImage)"><InfoFilled /></el-icon>
                </el-tooltip>
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

        <!-- 右侧栈：服装卡（高度受限）+ 视角卡（占剩余空间）。仅角色资产渲染。 -->
        <div v-if="assetType === 'character'" class="right-stack">
          <!-- 服装卡：紧凑高度，避免空态撑大；多张时内部 grid 横向滚动 -->
          <el-card class="outfit-card" shadow="never">
            <template #header>
              <div class="section-header">
                <span class="section-title">
                  服装
                  <span class="progress-meta">{{ outfitImages.length }}</span>
                </span>
                <el-button
                  size="small"
                  type="primary"
                  plain
                  :loading="busyKey === 'outfit-generate'"
                  :disabled="busy && busyKey !== 'outfit-generate'"
                  @click="openOutfitDialog"
                >
                  ✨ 生成服饰图
                </el-button>
              </div>
            </template>

            <div class="thumb-grid outfit-grid">
              <div
                v-for="img in outfitImages"
                :key="img.id"
                class="thumb-cell"
              >
                <div class="thumb-frame outfit-frame">
                  <img
                    v-if="img.imagePath"
                    :src="toImageUrl(img.imagePath)"
                    :alt="img.label || ''"
                    @dblclick="openPreview('outfit', outfitImages, outfitImages.indexOf(img))"
                  />
                  <div class="thumb-tools" @click.stop>
                    <el-tooltip content="详情" placement="top">
                      <el-icon class="thumb-tool-icon" :size="14" @click="openDetailDialog(img)"><InfoFilled /></el-icon>
                    </el-tooltip>
                    <el-tooltip content="下载" placement="top">
                      <el-icon class="thumb-tool-icon" :size="14" @click="downloadImage(img)"><Download /></el-icon>
                    </el-tooltip>
                    <el-tooltip content="删除" placement="top">
                      <el-icon class="thumb-tool-icon danger" :size="14" @click="onDeleteImage(img)"><Delete /></el-icon>
                    </el-tooltip>
                  </div>
                </div>
                <div class="thumb-label">{{ img.label || '(未命名)' }}</div>
              </div>
              <div
                v-if="busyKey === 'outfit-generate'"
                class="thumb-cell outfit-loading-cell"
              >
                <div class="thumb-frame outfit-frame thumb-loading-frame">
                  <el-icon class="is-loading" :size="20"><Loading /></el-icon>
                </div>
                <div class="thumb-label">生成中…</div>
              </div>
              <div v-if="outfitImages.length === 0 && busyKey !== 'outfit-generate'" class="empty-cell">
                <el-empty description="暂无服饰图" :image-size="40" />
              </div>
            </div>
          </el-card>

          <!--
            视角卡：从下方循环上移到 right-stack 末尾（spec 2026-05-08 v5 需求）。
            仍走 categories 数组里 view 的那条配置，只是位置变了；下方循环 filter 出 view。
          -->
          <el-card
            v-if="viewCategory"
            class="category-card view-card"
            shadow="never"
          >
            <template #header>
              <div class="section-header">
                <span class="section-title">
                  {{ viewCategory.label }}
                  <span class="progress-meta">
                    {{ getCategoryDoneCount(viewCategory) }}/{{ viewCategory.labels.length || '∞' }}
                  </span>
                </span>
                <el-button
                  v-if="viewCategory.labels.length > 0"
                  size="small"
                  type="primary"
                  plain
                  :loading="busyKey === `derive:${viewCategory.key}`"
                  :disabled="(busy && busyKey !== `derive:${viewCategory.key}`) || getMissingLabels(viewCategory).length === 0"
                  @click="onBatchDerive(viewCategory)"
                >
                  ✨ 派生剩余
                </el-button>
              </div>
            </template>
            <div class="thumb-grid">
              <div
                v-for="label in viewCategory.labels"
                :key="`${viewCategory.key}-${label}`"
                class="thumb-cell"
              >
                <div class="thumb-frame">
                  <template v-if="getImageByLabel(viewCategory.key, label)">
                    <img
                      :src="toImageUrl(getImageByLabel(viewCategory.key, label)!.imagePath)"
                      :alt="labelText(viewCategory.key, label)"
                      @dblclick="openPreview(viewCategory.key, getCategoryPreviewList(viewCategory), getCategoryPreviewIndex(viewCategory, label))"
                    />
                    <div class="thumb-tools" @click.stop>
                      <el-tooltip content="详情" placement="top">
                        <el-icon
                          class="thumb-tool-icon"
                          :size="14"
                          @click="openDetailDialog(getImageByLabel(viewCategory.key, label)!)"
                        ><InfoFilled /></el-icon>
                      </el-tooltip>
                      <el-tooltip content="下载" placement="top">
                        <el-icon
                          class="thumb-tool-icon"
                          :size="14"
                          @click="downloadImage(getImageByLabel(viewCategory.key, label)!)"
                        ><Download /></el-icon>
                      </el-tooltip>
                      <el-tooltip content="删除" placement="top">
                        <el-icon
                          class="thumb-tool-icon danger"
                          :size="14"
                          @click="onDeleteImage(getImageByLabel(viewCategory.key, label)!)"
                        ><Delete /></el-icon>
                      </el-tooltip>
                    </div>
                  </template>
                  <el-icon
                    v-else-if="busyKey === `derive:${viewCategory.key}`"
                    class="thumb-loading-icon is-loading"
                    :size="20"
                  ><Loading /></el-icon>
                  <el-icon v-else size="24" class="thumb-empty-icon"><Plus /></el-icon>
                </div>
                <div class="thumb-label">{{ labelText(viewCategory.key, label) }}</div>
              </div>
            </div>
          </el-card>
        </div>
      </div>

      <!-- 下方：表情 / 姿势 网格（视角已上移到 right-stack；服装也在 top-row） -->
      <el-card
        v-for="cat in bottomCategories"
        :key="cat.key"
        class="category-card"
        shadow="never"
      >
        <template #header>
          <div class="section-header">
            <span class="section-title">
              {{ cat.label }}
              <span class="progress-meta">
                {{ getCategoryDoneCount(cat) }}/{{ cat.labels.length || '∞' }}
              </span>
            </span>
            <el-button
              v-if="cat.labels.length > 0"
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

        <div v-if="cat.labels.length > 0" class="thumb-grid">
          <div
            v-for="label in cat.labels"
            :key="`${cat.key}-${label}`"
            class="thumb-cell"
          >
            <div class="thumb-frame">
              <template v-if="getImageByLabel(cat.key, label)">
                <img
                  :src="toImageUrl(getImageByLabel(cat.key, label)!.imagePath)"
                  :alt="labelText(cat.key, label)"
                  @dblclick="openPreview(cat.key, getCategoryPreviewList(cat), getCategoryPreviewIndex(cat, label))"
                />
                <div class="thumb-tools" @click.stop>
                  <el-tooltip content="详情" placement="top">
                    <el-icon
                      class="thumb-tool-icon"
                      :size="14"
                      @click="openDetailDialog(getImageByLabel(cat.key, label)!)"
                    ><InfoFilled /></el-icon>
                  </el-tooltip>
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

        <!-- outfit 是自由 label，显示已存在的 outfit 列表 -->
        <div v-else class="thumb-grid">
          <div
            v-for="img in getImagesByCategory(cat.key)"
            :key="img.id"
            class="thumb-cell"
          >
            <div class="thumb-frame">
              <img
                v-if="img.imagePath"
                :src="toImageUrl(img.imagePath)"
                :alt="img.label || ''"
                @dblclick="openPreview(cat.key, getImagesByCategory(cat.key), getImagesByCategory(cat.key).indexOf(img))"
              />
              <div class="thumb-tools" @click.stop>
                <el-tooltip content="详情" placement="top">
                  <el-icon class="thumb-tool-icon" :size="14" @click="openDetailDialog(img)"><InfoFilled /></el-icon>
                </el-tooltip>
                <el-tooltip content="下载" placement="top">
                  <el-icon class="thumb-tool-icon" :size="14" @click="downloadImage(img)"><Download /></el-icon>
                </el-tooltip>
                <el-tooltip content="删除" placement="top">
                  <el-icon class="thumb-tool-icon danger" :size="14" @click="onDeleteImage(img)"><Delete /></el-icon>
                </el-tooltip>
              </div>
            </div>
            <div class="thumb-label">{{ img.label || '(未标注)' }}</div>
          </div>
          <div v-if="getImagesByCategory(cat.key).length === 0" class="empty-cell">
            <el-empty :description="`暂无 ${cat.label}`" :image-size="40" />
          </div>
        </div>
      </el-card>
    </div>

    <!-- 服饰图生成对话框：输入名称（label）+ 提示词（prompt），调 derive.single -->
    <el-dialog
      v-model="showOutfitDialog"
      title="生成服饰图"
      width="540px"
      append-to-body
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-form label-width="64px" size="default">
        <el-form-item label="名称">
          <el-input
            v-model="outfitDraft.label"
            placeholder="如：玄色长袍"
            maxlength="40"
            clearable
          />
        </el-form-item>
        <el-form-item label="提示词">
          <el-input
            v-model="outfitDraft.prompt"
            type="textarea"
            :rows="4"
            placeholder="如：玄色长袍 + 玉冠 + 腰佩长剑（描述新服饰即可，无需重复角色长相）"
          />
        </el-form-item>
        <p class="outfit-dialog-note">
          系统将自动追加：直立全身、纯色背景、光照均匀等约束，并以"主图"作为参考图保持人物形象一致。
        </p>
      </el-form>
      <template #footer>
        <el-button @click="showOutfitDialog = false">取消</el-button>
        <el-button
          type="primary"
          :loading="busyKey === 'outfit-generate'"
          :disabled="!outfitDraftValid"
          @click="confirmOutfitGenerate"
        >
          确定
        </el-button>
      </template>
    </el-dialog>

    <!-- 图片大图预览（双击打开 / 左右翻页 / 下载） -->
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
        <div class="preview-tool" @click.stop="downloadImage(previewImage)">
          <el-icon :size="22"><Download /></el-icon>
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
 * 角色（资产）图谱编辑器（P3a Task 12）
 * @module renderer/components/episode-production/stage-asset/character/CharacterGalleryEditor
 * @description 通用资产图谱网格：
 *   - 主图（main）独立卡片，支持生成 / 重生成 / 上传；
 *   - view / expression / pose 用固定 label 列表呈现进度网格；
 *   - outfit 是自由 label，仅显示已有 outfit 列表；
 *   - 派生按钮调 api.derive.batch，目前是 stub（返回失败提示）；
 *   - 生成主图按钮 toast 占位（IPC 已注册但 image gen adapter 是 stub）。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { UploadFile } from 'element-plus'
import {
  ArrowLeft,
  ArrowRight,
  Delete,
  Download,
  InfoFilled,
  Loading,
  Plus,
  Refresh,
} from '@element-plus/icons-vue'
import { generateMainFor } from '@/api/main-image-generator'
import { uploadMainImageFile } from '@/api/main-image-upload'
import { toImageUrl } from '@/utils/asset-url'
import { useAssetImageActions } from '@/composables/use-asset-image-actions'
import GenerationDetailDialog from '../shared/GenerationDetailDialog.vue'

const props = defineProps<{
  bindingId: string
  assetType: 'character' | 'location' | 'item'
}>()

interface CategoryConfig {
  key: 'view' | 'expression' | 'outfit' | 'pose'
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
  // spec 2026-05-09 透明度面板：以下字段后端已落 asset_image 表，前端透传到 GenerationDetailDialog
  prompt?: string | null
  negativePrompt?: string | null
  metadata?: string | Record<string, unknown> | null
  derivedFromImageId?: string | null
  width?: number | null
  height?: number | null
  createdAt?: string | number | Date | null
}

/**
 * 下方网格的固定 label 类目。
 *
 * 注意：character 资产的 'outfit'（服装）已上移到顶部"主图 | 服装"并排区，
 * 不再作为下方的 row 列出；下方仅保留 view / expression / pose 三组固定 label 类。
 *
 * location / item 资产复用本组件时，这里的 categories 仍可适用 —
 * outfit 顶部卡通过 `v-if="assetType === 'character'"` 控制只在角色编辑器显示。
 */
const categories: CategoryConfig[] = [
  {
    key: 'view',
    label: '视角',
    labels: ['front', '3q_left', '3q_right', 'side_l', 'side_r', 'back'],
  },
  {
    key: 'expression',
    label: '表情',
    labels: ['neutral', 'smile', 'sad', 'angry', 'surprised', 'thinking'],
  },
  {
    key: 'pose',
    label: '姿势',
    labels: ['standing', 'walking', 'sitting', 'pointing'],
  },
]

/**
 * 视角单独提取（spec 2026-05-08 v5 — 上移到 top-row 右侧栈，与服装并列）。
 * 下方 v-for 用 bottomCategories 跳过 view，避免重复渲染。
 */
const viewCategory = computed<CategoryConfig | null>(
  () => categories.find((c) => c.key === 'view') ?? null,
)
const bottomCategories = computed<CategoryConfig[]>(
  () => categories.filter((c) => c.key !== 'view'),
)

/**
 * 各 category 下 label 的中文显示。
 * key 仍以英文存到 DB（与底层 prompt / 派生服务对齐），UI 显示中文。
 */
const LABEL_LABELS: Record<string, Record<string, string>> = {
  view: {
    front: '正面',
    '3q_left': '左 3/4',
    '3q_right': '右 3/4',
    side_l: '左侧',
    side_r: '右侧',
    back: '背面',
  },
  expression: {
    neutral: '中性',
    smile: '微笑',
    sad: '难过',
    angry: '愤怒',
    surprised: '惊讶',
    thinking: '思考',
  },
  pose: {
    standing: '站姿',
    walking: '行走',
    sitting: '坐姿',
    pointing: '指向',
  },
  outfit: {},
  main: { main: '主图' },
}

function labelText(catKey: string, label: string | null | undefined): string {
  if (!label) return ''
  return LABEL_LABELS[catKey]?.[label] ?? label
}

const loading = ref(false)
const allImages = ref<AssetImageRow[]>([])

/**
 * 全局忙状态 key：
 *   - null               = 无生成任务，所有按钮可用
 *   - 'main'             = 主图正在生成 / 重生成
 *   - 'main-upload'      = 主图正在上传替换
 *   - 'outfit-generate'  = 服饰图正在生成（顶部并排服装卡）
 *   - 'derive:<category>' = 下方该分类正在派生剩余
 *
 * 任意非 null 时所有生成按钮统一 disable，仅匹配 key 的按钮显示 loading。
 */
const busyKey = ref<string | null>(null)
const busy = computed(() => busyKey.value !== null)

/**
 * 当前生效的主图：以 is_main=1 为准。
 * 同一 asset 下可能堆积多条 category='main' 的历史记录（每次重生成都新增一行，
 * 旧的 is_main 置 0）；按 category 过滤会拿到最早那条而非当前主图。
 */
const mainImage = computed(() => allImages.value.find((i) => i.isMain === 1) || null)

/** 顶部并排区域的服装图列表（仅 character 资产用；其他资产时空数组也无害） */
const outfitImages = computed(() =>
  allImages.value.filter((i) => i.category === 'outfit'),
)

/** 主图渲染 URL：thumbnail 优先（旧数据可能存空字符串），回退 imagePath */
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
    console.error('[CharacterGalleryEditor] reload 失败', e)
    ElMessage.error(e?.message || '加载图谱失败')
  } finally {
    loading.value = false
  }
}

function getImageByLabel(category: string, label: string): AssetImageRow | undefined {
  return allImages.value.find((i) => i.category === category && i.label === label)
}

function getImagesByCategory(category: string): AssetImageRow[] {
  return allImages.value.filter((i) => i.category === category)
}

function getCategoryDoneCount(cat: CategoryConfig): number {
  if (cat.labels.length === 0) {
    return getImagesByCategory(cat.key).length
  }
  return cat.labels.filter((label) => !!getImageByLabel(cat.key, label)).length
}

function getMissingLabels(cat: CategoryConfig): string[] {
  if (cat.labels.length === 0) return []
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

async function onPickMainFile(uploadFile: UploadFile) {
  const file = uploadFile.raw as File | undefined
  if (!file) return
  if (busy.value) return
  busyKey.value = 'main-upload'
  try {
    await uploadMainImageFile({ file, assetType: props.assetType, assetId: props.bindingId })
    ElMessage.success('主图已上传替换')
    await reload()
  } catch (e: any) {
    ElMessage.error(e?.message || '主图上传失败')
  } finally {
    busyKey.value = null
  }
}

// ===== 服饰图生成（character 专用） =====
const showOutfitDialog = ref(false)
const outfitDraft = ref<{ label: string; prompt: string }>({ label: '', prompt: '' })

const outfitDraftValid = computed(
  () => outfitDraft.value.label.trim().length > 0 && outfitDraft.value.prompt.trim().length > 0,
)

function openOutfitDialog(): void {
  if (busy.value) return
  if (props.assetType !== 'character') return
  if (!mainImage.value) {
    ElMessage.warning('请先生成主图，再以主图为参考生成服饰图')
    return
  }
  outfitDraft.value = { label: '', prompt: '' }
  showOutfitDialog.value = true
}

async function confirmOutfitGenerate(): Promise<void> {
  if (!outfitDraftValid.value) return
  if (busy.value) return
  const api = getApi()
  if (!api?.derive?.single) {
    ElMessage.error('派生 IPC 未就绪')
    return
  }

  // 同 label 已存在则告知用户并阻止生成（避免和现有服饰图冲突，由用户改名后重试）
  const labelTrim = outfitDraft.value.label.trim()
  if (outfitImages.value.some((i) => (i.label ?? '') === labelTrim)) {
    ElMessage.warning(`已存在名为 "${labelTrim}" 的服饰图，请换一个名称`)
    return
  }

  busyKey.value = 'outfit-generate'
  try {
    const resp = await api.derive.single({
      assetType: props.assetType,
      assetId: props.bindingId,
      category: 'outfit',
      label: labelTrim,
      additionalPrompt: outfitDraft.value.prompt.trim(),
    })
    if (!resp || !resp.success) {
      ElMessage.error(resp?.error || '服饰图生成失败')
      return
    }
    ElMessage.success(`已生成服饰图：${labelTrim}`)
    showOutfitDialog.value = false
    await reload()
  } catch (e: any) {
    console.error('[CharacterGalleryEditor] 服饰图生成失败', e)
    ElMessage.error(e?.message || '服饰图生成失败')
  } finally {
    busyKey.value = null
  }
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
    console.error('[CharacterGalleryEditor] batch derive 失败', e)
    ElMessage.error(e?.message || '派生失败')
  } finally {
    busyKey.value = null
  }
}

// ===== 预览大图 dialog =====
const showPreviewDialog = ref(false)
const previewList = ref<AssetImageRow[]>([])
const previewIndex = ref(0)
const previewCategory = ref<string>('main')

const previewImage = computed<AssetImageRow | null>(
  () => previewList.value[previewIndex.value] ?? null,
)

const previewImageSrc = computed(() => {
  const img = previewImage.value
  if (!img) return ''
  // 大图预览优先用原图（imagePath），缩略图（thumbnailPath）只用于网格
  return toImageUrl((img.imagePath ?? '').trim() || '')
})

const previewDialogTitle = computed(() => {
  const img = previewImage.value
  if (!img) return ''
  if (img.category === 'main') return '主图'
  return `${LABEL_LABELS[img.category]?.[img.label ?? ''] ?? img.label ?? img.category}`
})

/** 打开预览：传入当前 category、本次可翻页的图列表（已过滤）、起始下标 */
function openPreview(category: string, list: AssetImageRow[], startIdx: number): void {
  if (list.length === 0) return
  previewCategory.value = category
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

/** 固定 label 类目（view/expression/pose）：取该类下"已存在的图"作为预览翻页 list */
function getCategoryPreviewList(cat: CategoryConfig): AssetImageRow[] {
  if (cat.labels.length === 0) return getImagesByCategory(cat.key)
  return cat.labels
    .map((l) => getImageByLabel(cat.key, l))
    .filter((x): x is AssetImageRow => !!x)
}

function getCategoryPreviewIndex(cat: CategoryConfig, label: string): number {
  const list = getCategoryPreviewList(cat)
  return Math.max(
    0,
    list.findIndex((i) => i.category === cat.key && i.label === label),
  )
}

// ===== 下载 / 删除（共享 composable，双端兼容） =====
const { downloadImage, onDeleteImage: _onDeleteRaw } = useAssetImageActions({
  onAfterDelete: reload,
  mainDeleteWarning: () =>
    `当前要删除的是"主图"。删除后该角色将进入"缺主图"状态，是否继续？`,
  itemDeleteConfirm: (img) =>
    `确认删除"${labelText(img.category, img.label) || img.category}"这张图？`,
})

// ===== 生成详情透明度面板（spec 2026-05-09 ep-redesign §3.2 A1） =====
const detailDialog = ref<{ open: boolean; image: AssetImageRow | null }>({
  open: false,
  image: null,
})

function openDetailDialog(img: AssetImageRow | null | undefined): void {
  if (!img) return
  detailDialog.value = { open: true, image: img }
}

/**
 * 删除单张图，删除后若当前预览正是该图则关闭预览。
 * composable 的 onAfterDelete 负责 reload；本包装层额外处理"关闭预览"。
 */
async function onDeleteImage(img: AssetImageRow | null | undefined): Promise<void> {
  const targetId = img?.id
  await _onDeleteRaw(img)
  // reload 已在 onAfterDelete 里执行；若被删的图正好是预览中的图，关闭预览
  if (targetId && previewImage.value?.id === targetId) {
    showPreviewDialog.value = false
  }
}

onMounted(reload)
watch(() => props.bindingId, reload)
watch(() => props.assetType, reload)

defineExpose({ reload })
</script>

<style scoped>
.character-gallery-editor {
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* 紧凑：图谱外卡和内卡 header padding 调矮 */
.character-gallery-editor :deep(.el-card__header) {
  padding: 6px 12px;
}

.character-gallery-editor :deep(.el-card__body) {
  flex: 1;
  overflow: auto;
  min-height: 0;
  padding: 10px 12px;
}

.character-gallery-editor :deep(.main-card .el-card__body),
.character-gallery-editor :deep(.outfit-card .el-card__body),
.character-gallery-editor :deep(.category-card .el-card__body) {
  padding: 8px 10px;
}

/*
 * spec 2026-05-08 v11：main-card body — 让 main-thumb 撑满 body 宽度（width:100% +
 * aspect-ratio:1/1，正方形随 body 宽度自适应）；padding 收紧让 thumb 紧贴边框。
 */
.character-gallery-editor :deep(.main-card .el-card__body) {
  display: flex;
  flex-direction: column;
  padding: 4px;
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
}

.gallery-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/**
 * 顶部并排：左 主图（窄）/ 右 服装（宽，留出网格空间）。
 * 主图卡 minmax 220px → 主图缩到合适大小且不被压成像素糊；
 * 服装卡 1fr 自适应剩余宽度，最少 0 防止 grid item 撑破容器。
 * 窄屏（<= 1024px）整组折回单列，与外层 body-grid 折回行为对齐。
 */
.top-row {
  display: grid;
  /* 主图卡列宽固定 505 = right-stack 自然高度（实测：outfit 249 + gap 8 + view 249 - 1px 误差 = 505） */
  grid-template-columns: 505px minmax(0, 1fr);
  gap: 8px;
  align-items: stretch;
}

@media (max-width: 1024px) {
  .top-row {
    grid-template-columns: 1fr;
  }
}

.main-card,
.outfit-card,
.category-card {
  background: var(--el-bg-color);
}

/*
 * 主图卡严格 340×340 正方形（固定，不随窗口变）：
 *   - width 由 .top-row grid 列固定 340px
 *   - height 也固定 340px
 *   - main-card 主导 row 高度 → right-stack stretch 跟到 340 → 1fr 1fr 平分各 166
 *   - 主图卡底部 = 视角卡底部 ✓
 */
.main-card {
  display: flex;
  flex-direction: column;
  width: 505px;
  height: 505px;
  min-height: 0;
}

.character-gallery-editor :deep(.main-card .el-card__body) {
  flex: 1;
  min-height: 0;
}

/*
 * spec 2026-05-08 v8：右侧栈用 grid-template-rows: 1fr 1fr 让 outfit/view 等分高度，
 * 高度自身 100% 跟随 grid track（top-row）。
 *   - 两卡片高度严格相等（"服饰 + 视角 高度相等"）
 *   - 两卡片 + 间隙 = right-stack 高度 = main-card 高度（"加起来 = 主图高度"）
 *   - grid track 高度由 main-card 的 main-thumb min-height 起底（见 .main-thumb）
 */
.right-stack {
  display: grid;
  grid-template-rows: 1fr 1fr;
  gap: 8px;
  min-width: 0;
  height: 100%;
  min-height: 0;
}

.right-stack .outfit-card,
.right-stack .view-card {
  /* grid 子项 stretch（默认）→ 各自填满分配的 row track；内部 body 用 flex:1 撑满 */
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.right-stack :deep(.outfit-card .el-card__body),
.right-stack :deep(.view-card .el-card__body) {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

/* spec 2026-05-08 v10：服饰 frame 也保持正方形（与视角/表情/姿势 frame 一致）。
 * 服饰图片是 3:4 内容，但占位框统一 180×180 正方形 — 图本身由 .thumb-frame img
 * 的 object-fit:cover 在 frame 内适配。 */

.thumb-loading-frame {
  color: var(--el-color-primary);
}

.outfit-loading-cell .thumb-frame {
  border-style: dashed;
}

.outfit-dialog-note {
  margin: 4px 0 0 64px;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  line-height: 1.5;
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
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);
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
  /*
   * spec 2026-05-08 v10：
   *   - 主图固定正方形 252×252（v9 是 280 高，−10% = 252）
   *   - flex:none 不再撑满 body；main-card body 用 align-items:center 让 thumb 居中
   *   - main-card 自然总高 ≈ 252 + 50 (header + padding) = 302
   *   - grid track 302 → right-stack 1fr 1fr 平分 = (302-8)/2 = 147
   *   - outfit/view body ≈ 147-38(header)-12(padding) ≈ 97
   *   - thumb-frame 80×80 留出余量（80 + label 14 + gap = 98，≈ body 97），
   *     视觉上视角/表情/姿势/服饰缩略图统一 80×80 ✓
   *   - main-card 底部 = right-stack 底部（视角卡底部）对齐 ✓
   */
  flex: 1;
  width: 100%;
  min-height: 0;
  background: var(--el-fill-color-light);
  border-radius: 6px;
  overflow: hidden;
}

.main-thumb img {
  width: 100%;
  height: 100%;
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

/*
 * spec 2026-05-08 v5：缩略图改为单行 + 横向滚动（服装 / 视角 / 表情 / 姿势 共用）。
 * 容器从 grid 改为 flex 横排，子项 flex-shrink:0 固定宽度（160px 默认；服装在
 * .outfit-grid .thumb-cell 覆盖为 144px）；overflow-x:auto 出现横向滚动条。
 */
.thumb-grid {
  display: flex;
  flex-wrap: nowrap;
  gap: 8px;
  overflow-x: auto;
  overflow-y: hidden;
  /* 给滚动条留 4px 喘息空间，避免 hover 工具条 / label 与 scrollbar 重叠 */
  padding-bottom: 4px;
}

.thumb-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  /*
   * spec 2026-05-08 v9：cell 不再固定 width，由内部 thumb-frame 用 height + aspect-ratio
   * 反推 width。这样所有缩略图（视角/表情/姿势/服饰）高度统一，只是宽度按 aspect-ratio 不同。
   */
}

.thumb-frame {
  position: relative;
  /*
   * spec 2026-05-08 v10：四类缩略图（服饰/视角/表情/姿势）统一 80×80 正方形 frame，
   * 让视角卡 body 内一行能完整放下（body 高约 97，80+label 14 ≈ 94 < 97 ✓）。
   */
  width: 160px;
  height: 160px;
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

/*
 * 空态：横向滚动容器里需要让 el-empty 撑满（之前 grid-column:1/-1 跨列）。
 * flex-shrink:0 + flex:1 让它在窄空间也保持完整尺寸，超宽就横滚跟其它子项对齐。
 */
.empty-cell {
  flex: 1 0 auto;
  min-width: 200px;
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>

<style lang="scss">
/* 预览大图 dialog —— 非 scoped，因为 el-dialog 渲染到 body 外，scoped 选择器命中不到 */
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

  .preview-tool {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    background: rgba(0, 0, 0, 0.5);
    border-radius: 50%;
    cursor: pointer;
    transition: background 0.15s;

    &:hover {
      background: var(--el-color-primary);
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
