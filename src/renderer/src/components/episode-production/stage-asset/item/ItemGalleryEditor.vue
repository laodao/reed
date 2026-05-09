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
            <el-tag size="small" :type="mainImage ? 'success' : 'info'">
              {{ mainImage ? '已就绪' : '缺主图' }}
            </el-tag>
          </div>
        </template>

        <div class="main-thumb">
          <template v-if="mainImage?.imagePath || mainImage?.id">
            <img :src="toImageUrl(mainImage!.imagePath)" alt="主图" />
            <div class="thumb-tools" @click.stop>
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
              <template v-if="getImageByLabel(cat.key, label)?.imagePath">
                <img
                  :src="toImageUrl(getImageByLabel(cat.key, label)!.imagePath)"
                  :alt="label"
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
              <el-icon v-else size="24" class="thumb-empty-icon"><Plus /></el-icon>
            </div>
            <div class="thumb-label">{{ label }}</div>
          </div>
        </div>
      </el-card>
      </div><!-- /right-stack -->
      </div><!-- /top-row -->
    </div>
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
import { Delete, Download, Plus, Refresh } from '@element-plus/icons-vue'
import { generateMainFor } from '@/api/main-image-generator'
import { uploadMainImageFile } from '@/api/main-image-upload'
import { toImageUrl } from '@/utils/asset-url'
import { useAssetImageActions } from '@/composables/use-asset-image-actions'

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
  isMain: number
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

async function doGenerateMain() {
  try {
    await generateMainFor(props.assetType, props.bindingId)
    ElMessage.success('主图已生成')
    await reload()
  } catch (e: any) {
    ElMessage.error('生成失败：' + (e?.message ?? '未知错误'))
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

.thumb-label {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  text-align: center;
  width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
