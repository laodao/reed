<template>
  <div class="asset-gallery">
    <!-- 顶部：定妆标题 + 视图 pills + 按需提货 -->
    <div class="gallery-top">
      <div class="top-left">
        <span class="top-title">{{ kindLabel }}定妆：{{ assetName }}</span>
        <span class="top-view-pills">
          <span v-for="p in viewPills" :key="p" class="pill" :class="{ active: selectedLabel === p }" @click="selectByPill(p)">{{ p }}</span>
        </span>
      </div>
      <el-button text size="small" @click="onDeriveAll" :disabled="!hasMain">
        <el-icon><Upload /></el-icon>
        按需提货
      </el-button>
    </div>

    <!-- 主体：左图集导航 + 右大图预览 -->
    <div class="gallery-body">
      <!-- 左：图集导航（竖排缩略） -->
      <aside class="gallery-nav">
        <div
          v-for="item in navItems"
          :key="item.label"
          class="nav-item"
          :class="{ active: selectedLabel === item.label }"
          @click="selectLabel(item.label)"
        >
          <div class="nav-thumb">
            <el-image v-if="imageByLabel(item.label)?.imagePath" :src="toUrl(imageByLabel(item.label)!.imagePath)" fit="cover" class="thumb-img" />
            <div v-else class="thumb-empty"><el-icon :size="16"><Picture /></el-icon></div>
          </div>
          <div class="nav-info">
            <div class="nav-name">{{ item.title }}</div>
            <div class="nav-status" :class="imageByLabel(item.label) ? 'done' : 'pending'">
              {{ imageByLabel(item.label) ? '已定妆' : '待生成' }}
            </div>
          </div>
          <el-button v-if="!imageByLabel(item.label)" text circle size="small" class="nav-add" @click.stop="onGenerate(item)">
            <el-icon><Plus /></el-icon>
          </el-button>
        </div>
      </aside>

      <!-- 右：大图预览 + 底部 prompt/生成 -->
      <main class="gallery-preview">
        <div class="preview-area">
          <el-image v-if="selectedImage?.imagePath" :src="toUrl(selectedImage.imagePath)" fit="contain" class="preview-img" />
          <div v-else class="preview-empty">
            <el-icon :size="44"><Picture /></el-icon>
            <span class="pe-text">{{ selectedItem?.title }} · 待生成</span>
          </div>
          <div v-if="generating" class="gen-overlay">
            <el-icon class="is-loading" :size="28"><Loading /></el-icon>
          </div>
        </div>
        <div class="preview-bottom">
          <el-input v-model="localPrompt" type="textarea" :rows="2" resize="none" placeholder="镜头提示词…" class="prompt-input" @blur="onSavePrompt" />
          <el-button type="primary" :loading="generating" @click="onGenerateCurrent">
            <el-icon><MagicStick /></el-icon>
            生成图片
          </el-button>
        </div>
      </main>
    </div>

    <!-- 空态：无选中资产 -->
    <div v-if="!assetId" class="empty">
      <el-empty description="左侧选择资产，或让右侧助手生成定妆图" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * M3 资产页 · 中央图集（参照项目资产页.png）。
 * 结构：顶部分类 pills + 左「图集导航(竖排缩略+状态+加号)」+ 右「大图预览 + 底部 prompt/生成」。
 * "已定妆"判定：该 label 的图存在（listByAsset）；无则"待生成"+可点加号。
 * 生成主图用 generateMainFor；派生用 derive.single（有主图才可用）。
 */
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Picture, MagicStick, Plus, Upload, Loading } from '@element-plus/icons-vue'
import { toImageUrl } from '@/utils/asset-url'
import { generateMainFor } from '@/api/main-image-generator'
import { useAssetImageActions } from '@/composables/use-asset-image-actions'

const props = defineProps<{
  assetId: string | null
  kind: 'character' | 'location' | 'item'
  assetName: string
  projectId: string
  initialThumb?: string | null
}>()

const images = ref<any[]>([])
const loading = ref(false)
const generating = ref(false)
const selectedLabel = ref('main')
const localPrompt = ref('')

// 图集导航项（角色/地点/物品通用模板）
const navItems = computed(() => {
  if (props.kind === 'character') {
    return [
      { label: 'main', title: '正面全身', category: 'main' },
      { label: 'front_half', title: '正面半身', category: 'view' },
      { label: 'left_3q', title: '左侧半身', category: 'view' },
      { label: 'right_3q', title: '右侧半身', category: 'view' },
      { label: 'full_left', title: '全景左侧', category: 'view' },
      { label: 'full_right', title: '全景右侧', category: 'view' },
    ]
  }
  return [
    { label: 'main', title: '主图', category: 'main' },
    { label: 'variant_1', title: '变体 A', category: 'variant' },
    { label: 'variant_2', title: '变体 B', category: 'variant' },
    { label: 'variant_3', title: '变体 C', category: 'variant' },
  ]
})

const viewPills = computed(() => navItems.value.map(i => i.title))

const kindLabel = computed(() => props.kind === 'character' ? '角色' : props.kind === 'location' ? '地点' : '物品')

function imageByLabel(label: string): any | null {
  return images.value.find(i => i.label === label) || (label === 'main' ? (images.value.find(i => i.isMain === 1) || images.value.find(i => i.category === 'main') || null) : null)
}

const selectedItem = computed(() => navItems.value.find(i => i.label === selectedLabel.value) || navItems.value[0])
const selectedImage = computed(() => imageByLabel(selectedLabel.value))

const hasMain = computed(() => !!imageByLabel('main'))

function toUrl(path?: string): string {
  return path ? toImageUrl(path) : ''
}

async function load(): Promise<void> {
  if (!props.assetId) { images.value = []; return }
  loading.value = true
  try {
    const root = (window as any).electronAPI?.episodeProduction?.asset
    const r = await root.image.listByAsset(props.kind, props.assetId)
    images.value = r?.success ? r.data : []
    // 默认选中：已有图的第一个，否则 main
    const firstWithImg = navItems.value.find(i => imageByLabel(i.label)?.imagePath)
    selectedLabel.value = firstWithImg?.label || 'main'
    const sel = imageByLabel(selectedLabel.value)
    localPrompt.value = sel?.prompt || ''
  } catch (e: any) {
    console.error('[AssetGallery] 加载失败', e)
    images.value = []
  } finally {
    loading.value = false
  }
}

function selectLabel(label: string): void {
  selectedLabel.value = label
  const sel = imageByLabel(label)
  localPrompt.value = sel?.prompt || ''
}

function selectByPill(title: string): void {
  const item = navItems.value.find(i => i.title === title)
  if (item) selectLabel(item.label)
}

async function onGenerate(item: { label: string; category: string }): Promise<void> {
  if (!props.assetId || generating.value) return
  generating.value = true
  try {
    if (item.label === 'main') {
      const img = await generateMainFor(props.kind, props.assetId)
      ElMessage.success('主图已生成')
    } else {
      const root = (window as any).electronAPI?.episodeProduction?.asset
      const main = imageByLabel('main')
      const r = await root.derive.single({
        assetType: props.kind,
        assetId: props.assetId,
        category: item.category,
        label: item.label,
        baseImageId: main?.id || null,
        additionalPrompt: item.title,
      })
      if (!r?.success) { ElMessage.error(r?.error || '生成失败'); generating.value = false; return }
      ElMessage.success(`${item.title} 已生成`)
    }
    await load()
  } catch (e: any) {
    ElMessage.error(e?.message || '生成失败')
  } finally {
    generating.value = false
  }
}

async function onGenerateCurrent(): Promise<void> {
  const item = selectedItem.value
  if (!item) return
  await onGenerate(item)
}

async function onDeriveAll(): Promise<void> {
  if (!props.assetId || !hasMain.value || generating.value) return
  generating.value = true
  const items = navItems.value.filter(i => i.label !== 'main' && !imageByLabel(i.label)?.imagePath)
  try {
    const root = (window as any).electronAPI?.episodeProduction?.asset
    for (const item of items) {
      const r = await root.derive.single({
        assetType: props.kind,
        assetId: props.assetId,
        category: item.category,
        label: item.label,
        baseImageId: imageByLabel('main')?.id || null,
        additionalPrompt: item.title,
      })
      if (!r?.success) { ElMessage.warning(`${item.title} 失败：${r?.error}`) }
    }
    ElMessage.success('按需提货完成')
    await load()
  } catch (e: any) {
    ElMessage.error(e?.message || '批量生成失败')
  } finally {
    generating.value = false
  }
}

async function onSavePrompt(): Promise<void> {
  const sel = selectedImage.value
  if (!sel?.id) return
  if (localPrompt.value === (sel.prompt || '')) return
  const root = (window as any).electronAPI?.episodeProduction?.asset
  const r = await root.image.update(sel.id, { prompt: localPrompt.value })
  if (r?.success) ElMessage.success('提示词已保存')
  else ElMessage.error(r?.error || '保存失败')
}

watch(() => [props.assetId, props.kind], () => void load())
onMounted(() => void load())
</script>

<style lang="scss" scoped>
.asset-gallery {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--bg-color-page);
}

.gallery-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px;
  border-bottom: 1px solid var(--border-color-lighter);
  background: var(--bg-color);
  .top-left { display: flex; align-items: center; gap: 14px; }
  .top-title { font-size: 14px; font-weight: 600; color: var(--text-color-primary); }
  .top-view-pills { display: flex; gap: 6px; }
  .pill {
    font-size: 12px;
    color: var(--text-color-secondary);
    padding: 3px 10px;
    border-radius: var(--radius-full);
    border: 1px solid var(--border-color-light);
    cursor: pointer;
    &.active { background: var(--color-primary-light-9); color: var(--color-primary); border-color: var(--color-primary); }
  }
}

.gallery-body {
  flex: 1;
  min-height: 0;
  display: flex;
}

.gallery-nav {
  width: 200px;
  flex-shrink: 0;
  border-right: 1px solid var(--border-color-lighter);
  background: var(--bg-color);
  overflow-y: auto;
  padding: 8px;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: 10px;
  cursor: pointer;
  transition: all var(--transition-fast);
  &:hover { background: var(--fill-color-light); }
  &.active { background: var(--color-primary-light-9); }
  .nav-thumb {
    width: 46px; height: 46px; border-radius: 8px;
    background: var(--fill-color-lighter);
    overflow: hidden; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    .thumb-img { width: 100%; height: 100%; object-fit: cover; }
    .thumb-empty { color: var(--text-color-placeholder); }
  }
  .nav-info { flex: 1; min-width: 0; }
  .nav-name { font-size: 13px; color: var(--text-color-primary); font-weight: 500; }
  .nav-status { font-size: 11px; margin-top: 2px; &.done { color: var(--color-success); } &.pending { color: var(--text-color-placeholder); } }
  .nav-add { color: var(--color-primary); }
}

.gallery-preview {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.preview-area {
  flex: 1;
  min-height: 0;
  position: relative;
  background: #111;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 14px 20px 0;
  border-radius: var(--radius-lg);
  overflow: hidden;
  .preview-img { max-width: 100%; max-height: 100%; }
  .preview-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    color: var(--text-color-placeholder);
    .pe-text { font-size: 13px; }
  }
  .gen-overlay {
    position: absolute; inset: 0;
    background: rgba(0,0,0,0.4);
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-size: 28px;
  }
}
.preview-bottom {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  padding: 12px 20px 16px;
  .prompt-input {
    flex: 1;
    :deep(.el-textarea__inner) { font-size: 13px; }
  }
}

.empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
