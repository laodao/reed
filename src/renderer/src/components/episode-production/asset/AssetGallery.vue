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
          <el-input v-model="localPrompt" type="textarea" :rows="5" resize="vertical" placeholder="镜头提示词…" class="prompt-input" @blur="onSavePrompt" />
          <el-button type="primary" plain circle :loading="saving" title="保存提示词" @click="onSaveNow">
            <el-icon><Check /></el-icon>
          </el-button>
          <el-button type="primary" circle :loading="generating" title="生成图片" @click="onGenerateCurrent">
            <el-icon><MagicStick /></el-icon>
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
import { ref, computed, watch, onMounted, onActivated } from 'vue'
import { ElMessage } from 'element-plus'
import { Picture, MagicStick, Plus, Upload, Loading, Check } from '@element-plus/icons-vue'
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
const saving = ref(false)
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
    // 先落盘当前编辑的提示词（待生成 slot 会建占位行；已有图则更新），
    // 保证生成时使用用户最新编辑的提示词，且生成后输入框内容不丢。
    await onSavePrompt()
    if (item.label === 'main') {
      // 生成主图：用户编辑过（占位行无图 / 文本有改动）时用用户提示词，否则用系统拼接
      const sel = imageByLabel('main')
      const override =
        sel && !sel.imagePath && localPrompt.value.trim()
          ? localPrompt.value
          : localPrompt.value !== (sel?.prompt || '')
            ? localPrompt.value
            : undefined
      const img = await generateMainFor(
        props.kind,
        props.assetId,
        override ? { promptOverride: override } : undefined,
      )
      void img
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
        additionalPrompt: localPrompt.value.trim() || item.title,
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
  // 先保存当前编辑的提示词，避免按需提货漏掉最新编辑
  await onSavePrompt()
  const items = navItems.value.filter(i => i.label !== 'main' && !imageByLabel(i.label)?.imagePath)
  try {
    const root = (window as any).electronAPI?.episodeProduction?.asset
    for (const item of items) {
      // 该 slot 已编辑过提示词（占位行）→ 用占位行 prompt；否则用 slot 标题作补充提示
      const existing = images.value.find(i => i.label === item.label)
      const addPrompt = existing?.prompt?.trim() || item.title
      const r = await root.derive.single({
        assetType: props.kind,
        assetId: props.assetId,
        category: item.category,
        label: item.label,
        baseImageId: imageByLabel('main')?.id || null,
        additionalPrompt: addPrompt,
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
  const text = localPrompt.value
  const root = (window as any).electronAPI?.episodeProduction?.asset
  const sel = selectedImage.value

  // 已有图：更新该行
  if (sel?.id) {
    if (text === (sel.prompt || '')) return
    const r = await root.image.update(sel.id, { prompt: text })
    if (r?.success) {
      ElMessage.success('提示词已保存')
      // 同步内存图集数据，避免后续判定（sel.prompt）与 DB 不一致
      const cur = images.value.find(i => i.id === sel.id)
      if (cur) cur.prompt = text
    } else if (r?.error && /不存在/.test(r.error)) {
      // 行已被删除/替换（占位行被清理、生成复用等）：重建承载提示词，不丢用户输入
      ElMessage.warning('原记录已不存在，已为你重新保存')
      await saveAsPlaceholder(text)
    } else {
      ElMessage.error(r?.error || '保存失败')
    }
    return
  }

  // 待生成 slot（尚无 asset_image 行）：内容为空无需保存；非空则创建占位行承载提示词
  if (!text.trim()) return
  await saveAsPlaceholder(text)
}

/** 保存到图集 slot 的占位行（无行时创建 imagePath='' 的占位行；有则更新） */
async function saveAsPlaceholder(text: string): Promise<void> {
  const item = selectedItem.value
  if (!item) return
  const root = (window as any).electronAPI?.episodeProduction?.asset
  const r = await root.image.savePrompt({
    assetType: props.kind,
    assetId: props.assetId,
    category: item.category,
    label: item.label === 'main' ? null : item.label,
    prompt: text,
  })
  if (r?.success && r.data) {
    // 清理同 slot 的失效占位行（imagePath='' 且 id 不同）：占位行被外部删除/替换后
    // 前端残留行会遮蔽新行（selectedImage 兜底取到旧行），这里一并移除。
    const saved = r.data
    images.value = images.value.filter(i =>
      !(i.label === saved.label && i.imagePath === '' && i.id !== saved.id),
    )
    // 把占位行并入 images（不整表刷新，避免 selectedLabel 跳回 main）
    const idx = images.value.findIndex(i => i.id === saved.id)
    if (idx >= 0) images.value[idx] = saved
    else images.value.push(saved)
    ElMessage.success('提示词已保存')
  } else {
    ElMessage.error(r?.error || '保存失败')
  }
}

/** 保存按钮：显式触发一次保存（与失焦自动保存同一逻辑） */
async function onSaveNow(): Promise<void> {
  saving.value = true
  try {
    await onSavePrompt()
  } finally {
    saving.value = false
  }
}

watch(() => [props.assetId, props.kind], () => void load())
onMounted(() => void load())
// keep-alive 缓存组件被重新激活时（从其它 tab/路由切回）重新拉取，保证显示最新提示词
onActivated(() => void load())
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
  .preview-img {
    width: 100%;
    height: 100%;
    display: block;
    :deep(.el-image__inner) { object-fit: contain; }
  }
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
    :deep(.el-textarea__inner) { font-size: 13px; line-height: 1.6; }
  }
}

.empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
