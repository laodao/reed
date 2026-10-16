<template>
  <el-card class="item-gallery-editor" shadow="never">
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
      <!--
        spec 2026-05-08：双栏布局，参考 CharacterGalleryEditor
          左：主图卡固定 505×505
          右：right-stack 装 视角 + 场景化（grid 1fr 1fr 平分）
      -->
      <div class="top-row">
      <!-- 主图 -->
      <el-card class="main-card" shadow="never">
        <template #header>
          <div class="section-header">
            <span class="section-title">主图 (main)</span>
            <span class="header-actions">
              <!-- T01 · 主图历史折叠区：本分类全部行（createdAt desc），当前主图加徽标 -->
              <el-button size="small" text :disabled="busy" @click="toggleHistory('main')">
                历史 ({{ getCategoryHistory('main').length }})
              </el-button>
              <el-tag size="small" :type="mainImage ? 'success' : 'info'">
                {{ mainImage ? '已就绪' : '缺主图' }}
              </el-tag>
            </span>
          </div>
        </template>

        <div class="main-thumb">
          <template v-if="mainImage?.imagePath || mainImage?.id">
            <img :src="toImageUrl(mainImage!.imagePath)" alt="主图" />
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
          <el-empty v-else description="尚未生成主图" :image-size="60" />
        </div>

        <div class="main-actions">
          <el-button v-if="!mainImage" type="primary" plain size="small" :disabled="busy" @click="onGenerateMain">
            ✨ 生成主图
          </el-button>
          <el-button v-else size="small" :disabled="busy" @click="onRegenerateMain">
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
        </div>

        <!-- T01 · 主图历史区：本分类全部行（createdAt desc），当前主图加徽标；历史图可一键恢复为主图 -->
        <div v-if="openHistory['main']" class="history-strip">
          <div
            v-for="img in getCategoryHistory('main')"
            :key="img.id"
            class="thumb-cell"
          >
            <div class="thumb-frame history-frame" :class="{ 'is-history-main': img.isMain === 1 }">
              <img
                v-if="img.imagePath"
                :src="toImageUrl(img.thumbnailPath || img.imagePath)"
                :alt="historyLabel(img)"
                @dblclick="openHistoryPreview(img)"
              />
              <span v-if="img.isMain === 1" class="history-main-badge">主图</span>
              <div class="thumb-tools" @click.stop>
                <el-tooltip v-if="img.isMain !== 1" content="设为主图" placement="top">
                  <el-icon class="thumb-tool-icon" :size="14" @click="onHistorySetMain(img)"><Star /></el-icon>
                </el-tooltip>
                <el-tooltip content="预览" placement="top">
                  <el-icon class="thumb-tool-icon" :size="14" @click="openHistoryPreview(img)"><ZoomIn /></el-icon>
                </el-tooltip>
              </div>
            </div>
            <div class="thumb-label">{{ historyLabel(img) }}</div>
          </div>
          <div v-if="getCategoryHistory('main').length === 0" class="history-empty">暂无历史</div>
        </div>
      </el-card>

      <!-- 右侧栈：视角 + 场景化（spec 2026-05-08） -->
      <div class="right-stack">
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
            <span class="header-actions">
              <!-- T01 · 分类历史折叠区（视角/场景化） -->
              <el-button size="small" text :disabled="busy" @click="toggleHistory(cat.key)">
                历史 ({{ getCategoryHistory(cat.key).length }})
              </el-button>
              <el-button
                size="small"
                type="primary"
                plain
                :disabled="getMissingLabels(cat).length === 0"
                @click="onBatchDerive(cat)"
              >
                ✨ 派生剩余
              </el-button>
            </span>
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
                  :alt="label"
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
              <el-icon v-else size="24" class="thumb-empty-icon"><Plus /></el-icon>
            </div>
            <div class="thumb-label">{{ label }}</div>
          </div>
        </div>

        <!-- T01 · 分类历史区（同 label 多行累积的历史行，createdAt desc） -->
        <div v-if="openHistory[cat.key]" class="history-strip">
          <div
            v-for="img in getCategoryHistory(cat.key)"
            :key="img.id"
            class="thumb-cell"
          >
            <div class="thumb-frame history-frame" :class="{ 'is-history-main': img.isMain === 1 }">
              <img
                v-if="img.imagePath"
                :src="toImageUrl(img.thumbnailPath || img.imagePath)"
                :alt="historyLabel(img)"
                @dblclick="openHistoryPreview(img)"
              />
              <span v-if="img.isMain === 1" class="history-main-badge">主图</span>
              <div class="thumb-tools" @click.stop>
                <el-tooltip v-if="img.isMain !== 1" content="设为主图" placement="top">
                  <el-icon class="thumb-tool-icon" :size="14" @click="onHistorySetMain(img)"><Star /></el-icon>
                </el-tooltip>
                <el-tooltip content="预览" placement="top">
                  <el-icon class="thumb-tool-icon" :size="14" @click="openHistoryPreview(img)"><ZoomIn /></el-icon>
                </el-tooltip>
              </div>
            </div>
            <div class="thumb-label">{{ historyLabel(img) }}</div>
          </div>
          <div v-if="getCategoryHistory(cat.key).length === 0" class="history-empty">暂无历史</div>
        </div>
      </el-card>
      </div><!-- /right-stack -->
      </div><!-- /top-row -->
    </div>

    <!-- 生成详情透明度面板（spec 2026-05-09 ep-redesign §3.2 A1） -->
    <GenerationDetailDialog
      v-model="detailDialog.open"
      :image="detailDialog.image"
      :all-images="allImages"
    />

    <!-- 方案A：主图重新生成后新旧对比，用户确认保留哪张 -->
    <MainRegenerateCompareDialog
      v-model="mainCompareVisible"
      :old-image="mainOldImg"
      :new-image="mainNewImg"
      @choose="chooseMainCompare"
    />

    <!-- T01：覆盖被引用主图前的写回影响确认（storyboardCount>0 才弹） -->
    <AssetWriteImpactDialog
      v-model="impactDialogOpen"
      :asset-type="props.assetType"
      :asset-id="props.bindingId"
      :action="impactAction"
      @confirm="onImpactConfirm"
      @cancel="onImpactCancel"
    />

    <!-- T01 · 历史行预览大图（本编辑器原无预览 dialog，为历史区补最小实现） -->
    <el-dialog
      v-model="historyPreviewVisible"
      :title="historyPreviewImg ? historyLabel(historyPreviewImg) : '预览'"
      width="60%"
      append-to-body
      destroy-on-close
    >
      <img
        v-if="historyPreviewImg?.imagePath"
        :src="toImageUrl(historyPreviewImg.imagePath)"
        :alt="historyLabel(historyPreviewImg)"
        class="history-preview-img"
      />
    </el-dialog>
  </el-card>
</template>

<script setup lang="ts">
/**
 * 物品（资产）图谱编辑器（P3a Task 14）
 * @module renderer/components/episode-production/stage-asset/item/ItemGalleryEditor
 * @description 物品图谱网格：
 *   - 主图（main）独立卡片，支持生成 / 重生成 / 上传；
 *   - view：front / side / top / detail（4 视角）；
 *   - context：held / in_scene（2 场景化变体）；
 *   - 派生按钮调 api.derive.batch（P5 渲染域接入前为 stub，会返回失败提示）；
 *   - 生成主图按钮 toast 占位（同 character / location，等 P5 渲染域接入）。
 *
 * 与 character 的区别：物品没有 expression / pose / outfit；
 * 与 location 的区别：物品没有 time / weather / angle，只有 view + context。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { UploadFile } from 'element-plus'
import {
  Delete,
  Download,
  InfoFilled,
  Plus,
  Refresh,
  Star,
  ZoomIn,
} from '@element-plus/icons-vue'
import { uploadMainImageFile } from '@/api/main-image-upload'
import { toImageUrl } from '@/utils/asset-url'
import { useAssetImageActions } from '@/composables/use-asset-image-actions'
import { useMainRegenerateCompare } from '@/composables/use-main-regenerate-compare'
import { useEpAssetStore } from '@/stores/episode-production/asset.store'
import GenerationDetailDialog from '../shared/GenerationDetailDialog.vue'
import MainRegenerateCompareDialog from '../shared/MainRegenerateCompareDialog.vue'
import AssetWriteImpactDialog from '../../shared/AssetWriteImpactDialog.vue'

const props = defineProps<{
  bindingId: string
  assetType: 'character' | 'location' | 'item'
}>()

interface CategoryConfig {
  key: 'view' | 'context'
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
  // spec 2026-05-09 透明度面板：以下字段后端已落 asset_image 表
  prompt?: string | null
  negativePrompt?: string | null
  metadata?: string | Record<string, unknown> | null
  derivedFromImageId?: string | null
  width?: number | null
  height?: number | null
  createdAt?: string | number | Date | null
}

// 视角标签：物品 4 视角
const VIEW_LABELS = ['front', 'side', 'top', 'detail']
// 场景化变体标签：手持 / 入景
const CONTEXT_LABELS = ['held', 'in_scene']

const categories: CategoryConfig[] = [
  {
    key: 'view',
    label: '视角',
    labels: VIEW_LABELS,
  },
  {
    key: 'context',
    label: '场景化',
    labels: CONTEXT_LABELS,
  },
]

const loading = ref(false)
const allImages = ref<AssetImageRow[]>([])

/**
 * 全局忙状态 key（与 character/location 保持一致）：
 *   - null           所有按钮可用
 *   - 'main-upload'  主图上传中
 */
const busyKey = ref<string | null>(null)
const busy = computed(() => busyKey.value !== null)

const mainImage = computed(() => allImages.value.find((i) => i.isMain === 1) || null)

/**
 * 方案A · 主图重生成 + 新旧对比保留。
 * getCurrentMain 用 getter（而非快照）：生成前实时取当前 isMain=1 主图作对比基准。
 */
const {
  compareVisible: mainCompareVisible,
  oldImg: mainOldImg,
  newImg: mainNewImg,
  regenerateMain,
  choose: chooseMainCompare,
} = useMainRegenerateCompare({
  getAssetRef: () => ({ assetType: props.assetType, assetId: props.bindingId }),
  getCurrentMain: () => mainImage.value,
  onAfterRegenerate: reload,
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
    console.error('[ItemGalleryEditor] reload 失败', e)
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

// ===== T01 · 分类历史折叠区（createdAt desc 列出该分类全部行） =====

/** 各分类历史区展开状态（key = category） */
const openHistory = ref<Record<string, boolean>>({})

function toggleHistory(category: string): void {
  openHistory.value[category] = !openHistory.value[category]
}

function toTimestamp(v: AssetImageRow['createdAt']): number {
  if (v == null) return 0
  if (v instanceof Date) return v.getTime()
  const t = typeof v === 'number' ? v : Date.parse(String(v))
  return Number.isFinite(t) ? t : 0
}

/** 该分类全部行，按 createdAt 降序（最新在前） */
function getCategoryHistory(category: string): AssetImageRow[] {
  return allImages.value
    .filter((i) => i.category === category)
    .sort((a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt))
}

/** 历史行显示名：view/context 的英文 label 原样展示；main 无 label 显示"主图" */
function historyLabel(img: AssetImageRow): string {
  if (img.label) return img.label
  return img.category === 'main' ? '主图' : '(未标注)'
}

// ===== T01 · 历史行预览（本编辑器原无预览 dialog，补最小实现） =====
const historyPreviewImg = ref<AssetImageRow | null>(null)
const historyPreviewVisible = ref(false)

function openHistoryPreview(img: AssetImageRow): void {
  if (!img.imagePath) return
  historyPreviewImg.value = img
  historyPreviewVisible.value = true
}

// ===== T01 · 写回影响确认（设为主图 / 重新生成 主图前） =====

const assetStore = useEpAssetStore()
const impactDialogOpen = ref(false)
const impactAction = ref<'set-main' | 'regenerate'>('set-main')
/** 弹窗确认后要执行的原操作（闭包持有，取消即丢弃） */
let pendingWrite: (() => Promise<void> | void) | null = null

/**
 * T01 交互流（task-01 §3）：先查影响面 → storyboardCount === 0（或查询失败）
 * 直接执行；> 0 弹 AssetWriteImpactDialog，确认后才执行原操作。
 */
async function guardWriteImpact(
  action: 'set-main' | 'regenerate',
  exec: () => Promise<void> | void,
): Promise<void> {
  const impact = await assetStore.getWriteImpact(props.assetType, props.bindingId)
  if (impact && impact.storyboardCount > 0) {
    impactAction.value = action
    pendingWrite = exec
    impactDialogOpen.value = true
    return
  }
  await exec()
}

function onImpactConfirm(): void {
  const exec = pendingWrite
  pendingWrite = null
  void exec?.()
}

function onImpactCancel(): void {
  pendingWrite = null
}

/** 历史行"设为主图"：恢复旧版本（item 走 setAsMain，会自动降级旧主图） */
async function onHistorySetMain(img: AssetImageRow): Promise<void> {
  if (busy.value || img.isMain === 1) return
  const api = getApi()
  if (!api?.image?.setAsMain) {
    ElMessage.error('image.setAsMain IPC 未暴露')
    return
  }
  await guardWriteImpact('set-main', async () => {
    const resp = await api.image.setAsMain(img.id)
    if (!resp?.success) {
      ElMessage.error(resp?.error || '设为主图失败')
      return
    }
    ElMessage.success(`已设为主图：${historyLabel(img)}`)
    await reload()
  })
}

async function doGenerateMain() {
  try {
    // 方案A：生成新主图后弹新旧对比，用户确认保留哪张，被舍弃的图（含磁盘文件）删除
    await regenerateMain()
  } catch (e: any) {
    ElMessage.error('生成失败：' + (e?.message ?? '未知错误'))
  }
}

function onGenerateMain() {
  // 首张生成（无主图可覆盖）：不弹影响确认
  void doGenerateMain()
}

/** T01：重生成主图属高危覆盖，被引用时先弹影响确认 */
function onRegenerateMain() {
  void guardWriteImpact('regenerate', doGenerateMain)
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
    console.error('[ItemGalleryEditor] batch derive 失败', e)
    ElMessage.error(e?.message || '派生失败')
  }
}

// ===== 下载 / 删除（共享 composable，双端兼容） =====
const { downloadImage, onDeleteImage } = useAssetImageActions({
  onAfterDelete: reload,
  mainDeleteWarning: () =>
    `当前要删除的是"主图"。删除后该物品将进入"缺主图"状态，是否继续？`,
  itemDeleteConfirm: (img) =>
    `确认删除"${img.label || img.category}"这张图？`,
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

onMounted(reload)
watch(() => props.bindingId, reload)
watch(() => props.assetType, reload)

defineExpose({ reload })
</script>

<style scoped>
.item-gallery-editor {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.item-gallery-editor :deep(.el-card__body) {
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

/* spec 2026-05-08：双栏布局（参考 CharacterGalleryEditor） */
.top-row {
  display: grid;
  grid-template-columns: 505px minmax(0, 1fr);
  gap: 8px;
  align-items: stretch;
  /* 显式锁定 row 高度 = 505，让 main-card / right-stack 都跟随，
   * 否则当 right-stack 内容自然高度（视角 4 张缩略图 + 场景化 2 张）反过来主导，
   * 两侧底部会对不齐。 */
  height: 505px;
}

@media (max-width: 1024px) {
  .top-row {
    grid-template-columns: 1fr;
  }
}

.main-card {
  display: flex;
  flex-direction: column;
  width: 505px;
  height: 505px;
  min-height: 0;
}

.item-gallery-editor :deep(.main-card .el-card__body) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.right-stack {
  display: grid;
  grid-template-rows: 1fr 1fr;
  gap: 8px;
  min-width: 0;
  height: 100%;
  min-height: 0;
}

.right-stack .category-card {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.item-gallery-editor :deep(.right-stack .category-card .el-card__body) {
  flex: 1;
  min-height: 0;
  overflow: auto;
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
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  /* 撑满 main-card body 剩余空间 */
  flex: 1;
  min-height: 0;
  background: var(--el-fill-color-light);
  border-radius: 6px;
  overflow: hidden;
  margin-bottom: 8px;
}

.main-thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.main-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
  flex-shrink: 0;
}

/* spec 2026-05-08：单行横滚 + 缩略图 160×160 */
.thumb-grid {
  display: flex;
  flex-wrap: nowrap;
  gap: 8px;
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 4px;
}

.thumb-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.thumb-frame {
  position: relative;
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

/* 图片工具条：右上角 详情 / 下载 / 删除 icon（常驻可见，方便在资产界面直接删除图片） */
.thumb-tools {
  position: absolute;
  top: 4px;
  right: 4px;
  display: flex;
  gap: 4px;
  opacity: 1;
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

.thumb-tool-icon.danger {
  background: var(--el-color-danger);
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

.thumb-label {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  text-align: center;
  width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ===== T01 · 分类历史折叠区 ===== */

/* 历史条：横向滚动小格（位于分类网格下方） */
.history-strip {
  display: flex;
  flex-wrap: nowrap;
  gap: 8px;
  margin-top: 8px;
  padding: 8px;
  overflow-x: auto;
  overflow-y: hidden;
  background: var(--el-fill-color-lighter);
  border: 1px dashed var(--el-border-color);
  border-radius: 6px;
  flex-shrink: 0;
}

/* 主图卡内的历史条限高，避免挤压主图预览 */
.main-card .history-strip {
  max-height: 196px;
  overflow-y: auto;
}

.history-frame {
  width: 96px;
  height: 96px;
}

/* 当前主图行徽标（isMain=1） */
.history-main-badge {
  position: absolute;
  top: 4px;
  left: 4px;
  padding: 1px 6px;
  background: var(--el-color-warning);
  color: #fff;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 600;
  z-index: 1;
}

.history-frame.is-history-main {
  border-color: var(--el-color-warning);
  box-shadow: 0 0 0 1px var(--el-color-warning-light-7);
}

.history-empty {
  align-self: center;
  min-width: 120px;
  text-align: center;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

/* 历史行预览大图 */
.history-preview-img {
  display: block;
  width: 100%;
  max-height: 70vh;
  object-fit: contain;
}
</style>
