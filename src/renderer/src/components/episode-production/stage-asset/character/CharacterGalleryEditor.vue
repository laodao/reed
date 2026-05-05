<template>
  <el-card class="character-gallery-editor" shadow="never">
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
          <img v-if="mainImage?.imagePath" :src="toImageUrl(mainImage.imagePath)" alt="主图" />
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
              :disabled="getMissingLabels(cat).length === 0"
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

        <!-- outfit 是自由 label，显示已存在的 outfit 列表 -->
        <div v-else class="thumb-grid">
          <div
            v-for="img in getImagesByCategory(cat.key)"
            :key="img.id"
            class="thumb-cell"
          >
            <div class="thumb-frame">
              <img v-if="img.imagePath" :src="toImageUrl(img.imagePath)" :alt="img.label || ''" />
            </div>
            <div class="thumb-label">{{ img.label || '(未标注)' }}</div>
          </div>
          <div v-if="getImagesByCategory(cat.key).length === 0" class="empty-cell">
            <el-empty :description="`暂无 ${cat.label}`" :image-size="40" />
          </div>
        </div>
      </el-card>
    </div>
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
import { Plus, Refresh } from '@element-plus/icons-vue'
import { generateMainFor } from '@/api/main-image-generator'
import { toImageUrl } from '@/utils/asset-url'

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

function onUploadMain() {
  // 主图上传留 follow-up（与 panorama 上传同模式：ElUpload + multipart endpoint）
  ElMessage.info('主图上传走 follow-up，当前请用「生成主图」AI 出图')
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
    console.error('[CharacterGalleryEditor] batch derive 失败', e)
    ElMessage.error(e?.message || '派生失败')
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

.character-gallery-editor :deep(.el-card__body) {
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

.empty-cell {
  grid-column: 1 / -1;
  padding: 8px;
}
</style>
