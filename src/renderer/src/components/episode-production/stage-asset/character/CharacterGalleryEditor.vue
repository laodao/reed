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
      <!-- 主图 -->
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
                <el-button size="small" :disabled="busy" @click="onUploadMain">
                  ⬆ 上传替换
                </el-button>
              </template>
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

      <!-- 4 个 category 网格 -->
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
import {
  ArrowLeft,
  ArrowRight,
  Delete,
  Download,
  Loading,
  Plus,
  Refresh,
} from '@element-plus/icons-vue'
import { generateMainFor } from '@/api/main-image-generator'
import { toImageUrl } from '@/utils/asset-url'
import { useAssetImageActions } from '@/composables/use-asset-image-actions'

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
}

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
    key: 'outfit',
    label: '服装',
    labels: [],
  },
  {
    key: 'pose',
    label: '姿势',
    labels: ['standing', 'walking', 'sitting', 'pointing'],
  },
]

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
 *   - null    = 无生成任务，所有按钮可用
 *   - 'main'  = 主图正在生成 / 重生成
 *   - 'derive:<category>' = 该分类正在派生剩余
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

function onUploadMain() {
  if (busy.value) return
  // 主图上传留 follow-up（与 panorama 上传同模式：ElUpload + multipart endpoint）
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
.character-gallery-editor :deep(.category-card .el-card__body) {
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

.empty-cell {
  grid-column: 1 / -1;
  padding: 8px;
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
