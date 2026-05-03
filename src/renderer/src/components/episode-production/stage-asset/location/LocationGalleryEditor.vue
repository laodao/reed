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
import { Plus, Refresh } from '@element-plus/icons-vue'

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

// 时间标签（与 LocationCardForm.TIME_OPTIONS 保持一致）
const TIME_LABELS = ['morning', 'noon', 'afternoon', 'evening', 'night', 'dawn', 'dusk']
// 天气标签（与 LocationCardForm.WEATHER_OPTIONS 保持一致）
const WEATHER_LABELS = ['sunny', 'cloudy', 'rainy', 'snowy', 'foggy', 'stormy']
// 角度标签（地点取景）
const ANGLE_LABELS = ['wide_shot', 'entrance', 'interior_a', 'interior_b']

const categories: CategoryConfig[] = [
  {
    key: 'time_variant',
    label: '时间变体',
    labels: TIME_LABELS,
  },
  {
    key: 'weather_variant',
    label: '天气变体',
    labels: WEATHER_LABELS,
  },
  {
    key: 'angle_variant',
    label: '角度变体',
    labels: ANGLE_LABELS,
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

onMounted(reload)
watch(() => props.bindingId, reload)
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
</style>
