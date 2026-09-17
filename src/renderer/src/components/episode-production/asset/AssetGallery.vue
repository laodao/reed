<template>
  <div class="asset-gallery">
    <!-- 顶部：定妆标题 + 视图 pills + 按需提货 -->
    <div class="gallery-top">
      <div class="top-left">
        <span class="top-title">{{ kindLabel }}定妆：{{ assetName }}</span>
        <span
          v-if="assetId && (impact.keyframes > 0 || impact.storyboards > 0)"
          class="impact-hint"
          title="统计口径：关键帧=用户挑图(referenceOverrides)显式引用该资产的关键帧数；分镜=分镜角色/地点/物品名单含该资产的分镜数"
        >被 {{ impact.keyframes }} 个关键帧引用 / {{ impact.storyboards }} 个分镜使用</span>
      </div>
      <div class="top-actions">
        <el-button text size="small" :disabled="!assetId" @click="showAddOutfit = true">
          <el-icon><Plus /></el-icon>
          新增正面全身
        </el-button>
        <el-button text size="small" @click="showBatchDerive = true" :disabled="!hasMain">
          <el-icon><MagicStick /></el-icon>
          一键生成
        </el-button>
        <el-button text size="small" :disabled="!assetId" @click="showLinkPortrait = true">
          <el-icon><Link /></el-icon>
          关联人像
        </el-button>
      </div>
    </div>

    <!-- 主体：左图集导航 + 右大图预览（仅在选中资产时渲染；
         否则 .empty 的 height:100% 会把本区挤成 0 高，提示词框/生成按钮漂浮在空态上方） -->
    <div v-if="assetId" class="gallery-body">
      <!-- 左：图集导航（竖排缩略） -->
      <aside class="gallery-nav">
        <div
          v-for="item in navItems"
          :key="item.label"
          class="nav-item"
          :class="{ active: selectedLabel === item.label }"
          @click="onNavClick(item)"
        >
          <div class="nav-thumb" :class="{ derived: !!navImage(item.label)?.derivedFromImageId }">
            <el-image v-if="navImage(item.label)?.imagePath" :src="toUrl(navImage(item.label)!.imagePath)" fit="cover" class="thumb-img" title="双击放大查看" @dblclick.stop="openPreviewer(navImage(item.label))" />
            <div v-else class="thumb-empty"><el-icon :size="16"><Picture /></el-icon></div>
            <span v-if="navImage(item.label)?.confirmed === 1" class="confirm-badge" title="已确认定妆">✓</span>
          </div>
          <div class="nav-info">
            <div class="nav-name">{{ item.title }}</div>
            <div class="nav-status" :class="imageByLabel(item.label)?.imagePath ? 'done' : 'pending'">
              {{ imageByLabel(item.label)?.imagePath ? '已定妆' : '待生成' }}
            </div>
          </div>
          <el-button v-if="!imageByLabel(item.label)?.imagePath" text circle size="small" class="nav-add" title="生成" @click.stop="onGenerate(item)">
            <el-icon><Plus /></el-icon>
          </el-button>
          <template v-else>
            <el-button
              v-if="imageByLabel(item.label)?.derivedFromImageId"
              text
              circle
              size="small"
              class="nav-regen"
              :loading="generating"
              title="重新生成"
              @click.stop="onRegenerate(item)"
            >
              <el-icon><Refresh /></el-icon>
            </el-button>
            <el-button
              text
              circle
              size="small"
              class="nav-del"
              :loading="deletingLabel === item.label"
              :disabled="deletingLabel !== ''"
              title="删除图片"
              @click.stop="onDeleteImage(item)"
            >
              <el-icon><Delete /></el-icon>
            </el-button>
          </template>
        </div>
      </aside>

      <!-- 右：大图预览 + 底部 prompt/生成 -->
      <main class="gallery-preview">
        <div class="preview-area">
          <el-image
            v-if="selectedImage?.imagePath"
            :src="toUrl(selectedImage.imagePath)"
            fit="contain"
            class="preview-img"
            title="双击放大查看"
            @dblclick="openPreviewer(selectedImage)"
          />
          <div v-else class="preview-empty">
            <el-icon :size="44"><Picture /></el-icon>
            <span class="pe-text">{{ selectedItem?.title }} · 待生成</span>
          </div>
          <div v-if="generating" class="gen-overlay">
            <el-icon class="is-loading" :size="28"><Loading /></el-icon>
          </div>
          <el-button
            v-if="selectedImage?.imagePath"
            class="preview-dl"
            :icon="Download"
            circle
            size="small"
            title="下载图片"
            @click.stop="onDownloadImage"
          />
          <el-button
            v-if="selectedImage?.imagePath"
            class="preview-del"
            type="danger"
            :icon="Delete"
            circle
            size="small"
            title="删除当前图片"
            :loading="deletingLabel === selectedItem?.label"
            :disabled="deletingLabel !== ''"
            @click.stop="onDeleteImage(selectedItem)"
          />
          <div v-if="selectedImage?.imagePath && selectedImage?.confirmed === 1" class="confirmed-chip">✓ 已确认定妆</div>
          <el-button
            v-if="isMainSlot && selectedImage?.imagePath"
            class="preview-confirm"
            :type="selectedImage?.confirmed === 1 ? 'success' : 'primary'"
            :plain="selectedImage?.confirmed === 1"
            size="small"
            :loading="confirmToggling"
            :title="selectedImage?.confirmed === 1 ? '撤销后关键帧不再选用该图' : '确认后关键帧选图只使用已确认的定妆图'"
            @click.stop="onToggleConfirm"
          >
            {{ selectedImage?.confirmed === 1 ? '撤销确认' : '确认定妆' }}
          </el-button>
        </div>
        <div class="preview-bottom">
          <el-input v-model="localPrompt" type="textarea" :rows="5" resize="vertical" placeholder="镜头提示词…" class="prompt-input" :disabled="!isMainSlot" :title="isMainSlot ? '' : '派生图提示词由系统固定，以主图为参考'" @blur="onSavePrompt" />
          <el-select
            v-model="selectedImageModel"
            size="small"
            class="model-select"
            :disabled="!isMainSlot"
            title="生成模型（P-B）：默认自动挑启用 provider 的第一个图像模型；物品图汉字渲染可选手动指定在线模型"
          >
            <el-option label="自动" value="" />
            <el-option
              v-for="opt in imageModelOptions"
              :key="`${opt.providerConfigId}/${opt.modelId}`"
              :label="opt.label"
              :value="`${opt.providerConfigId}/${opt.modelId}`"
            />
          </el-select>
          <el-button
            v-if="selectedImage?.imagePath"
            :icon="Download"
            circle
            title="下载图片"
            @click="onDownloadImage"
          />
          <el-button type="primary" circle :loading="generating" title="生成图片" :disabled="!isMainSlot" @click="onGenerateCurrent">
            <el-icon><MagicStick /></el-icon>
          </el-button>
        </div>
      </main>
    </div>

    <!-- 空态：无选中资产 -->
    <div v-if="!assetId" class="empty">
      <el-empty description="左侧选择资产，或让右侧助手生成定妆图" />
    </div>

    <!-- 新增正面全身（换装）对话框 -->
    <AddOutfitMainDialog
      v-model="showAddOutfit"
      :asset-type="kind"
      :asset-id="assetId || ''"
      :first-main-path="firstMainPath"
      :main-count="mainCount"
      @submitted="onAddOutfitSubmitted"
    />

    <!-- 一键生成对话框 -->
    <BatchDeriveDialog
      v-model="showBatchDerive"
      :items="pendingDeriveItems"
      :generating="generating"
      @confirm="onBatchDerive"
    />

    <!-- 关联人像对话框 -->
    <LinkPortraitDialog
      v-model="showLinkPortrait"
      :asset-type="kind"
      :asset-id="assetId || ''"
      @submitted="onAddOutfitSubmitted"
    />

    <!-- 双击放大：大图查看器（与分镜界面资产图展示同款 el-image-viewer） -->
    <el-image-viewer
      v-if="openViewer"
      :url-list="viewerUrlList"
      @close="closePreviewer"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * M3 资产页 · 中央图集（参照项目资产页.png）。
 * 结构：顶部分类 pills + 左「图集导航(竖排缩略+状态+加号)」+ 右「大图预览 + 底部 prompt/生成」。
 * "已定妆"判定：该 label 的图存在（listByAsset）；无则"待生成"+可点加号。
 * 生成主图用 generateMainFor；派生用 derive.single（有主图才可用）。
 */
import { summarizeBatchResults } from '@/utils/batch-summary'
import { ref, computed, watch, onMounted, onActivated } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Picture, MagicStick, Plus, Loading, Refresh, Link, Delete, Download } from '@element-plus/icons-vue'
import { toImageUrl } from '@/utils/asset-url'
import { stripSystemConstraints } from '@core/platform/episode-production/assets/prompts/asset-identity-prompt'
import { generateMainFor } from '@/api/main-image-generator'
import { useAssetImageActions } from '@/composables/use-asset-image-actions'
import AddOutfitMainDialog from '@/components/episode-production/asset/AddOutfitMainDialog.vue'
import BatchDeriveDialog from '@/components/episode-production/asset/BatchDeriveDialog.vue'
import LinkPortraitDialog from '@/components/episode-production/asset/LinkPortraitDialog.vue'

const props = defineProps<{
  assetId: string | null
  kind: 'character' | 'location' | 'item'
  assetName: string
  projectId: string
  initialThumb?: string | null
}>()

const images = ref<any[]>([])
/** 正在删除的槽位 label（避免并发/误触） */
const deletingLabel = ref('')
/** 双击放大查看器（与分镜界面资产图展示同款 el-image-viewer） */
const openViewer = ref(false)
const viewerUrlList = ref<string[]>([])

/**
 * S-05：当前资产被关键帧 / 分镜引用的影响面。
 * 统计口径（service countAssetReferences 同款注释）：
 *   关键帧 = storyboard_keyframe.referenceOverrides 显式引用该资产的关键帧数；
 *   分镜   = 分镜名单（characters[].characterId / location_binding_ids / item_binding_ids）含该资产的分镜数。
 */
const impact = ref<{ keyframes: number; storyboards: number; keyframeIds: string[] }>({
  keyframes: 0,
  storyboards: 0,
  keyframeIds: [],
})
/** 「确认定妆 / 撤销确认」切换中 */
const confirmToggling = ref(false)

/** 下载当前选中图（PC 保存对话框复制 / Web 浏览器下载，双端兼容） */
const { downloadImage } = useAssetImageActions()
const loading = ref(false)
const generating = ref(false)
const selectedLabel = ref('main')
const localPrompt = ref('')
/** 最近一次从 DB 加载/保存的输入框内容快照（onActivated 防覆盖未保存编辑用） */
let loadedPrompt = ''

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

const kindLabel = computed(() => props.kind === 'character' ? '角色' : props.kind === 'location' ? '地点' : '物品')

function imageByLabel(label: string): any | null {
  return images.value.find(i => i.label === label) || (label === 'main' ? (images.value.find(i => i.isMain === 1) || images.value.find(i => i.category === 'main') || null) : null)
}

const selectedItem = computed(() => navItems.value.find(i => i.label === selectedLabel.value) || navItems.value[0])

/** 全部有图主图（category=main 且有 imagePath） */
const mainImages = computed(() => images.value.filter(i => i.category === 'main' && i.imagePath))
/** 主图槽位当前查看的索引（多主图切换；不影响生成/派生用的默认主图） */
const selectedMainIndex = ref(0)

/** 导航/预览显示的图：main 槽位多主图时按 selectedMainIndex 取；其余按 label */
function navImage(label: string): any | null {
  if (label === 'main' && mainImages.value.length > 1) {
    return mainImages.value[Math.min(selectedMainIndex.value, mainImages.value.length - 1)] ?? imageByLabel('main')
  }
  return imageByLabel(label)
}

const selectedImage = computed(() => {
  if (selectedLabel.value === 'main') {
    const mains = mainImages.value
    if (mains.length > 1) {
      return mains[Math.min(selectedMainIndex.value, mains.length - 1)]
    }
  }
  return imageByLabel(selectedLabel.value)
})

/** 导航点击：main 槽位多主图时循环切换；其余正常选中 */
function onNavClick(item: { label: string; category: string }): void {
  if (item.label === 'main' && mainImages.value.length > 1) {
    selectedMainIndex.value = (selectedMainIndex.value + 1) % mainImages.value.length
  }
  selectLabel(item.label)
}

const hasMain = computed(() => !!imageByLabel('main')?.imagePath)

/** 当前是否主图槽位（主图可自定义提示词；派生图系统固定，提示词/生成禁用） */
const isMainSlot = computed(() => selectedLabel.value === 'main')

/** 新增正面全身（换装）对话框显隐 */
const showAddOutfit = ref(false)
/** 一键生成对话框显隐 */
const showBatchDerive = ref(false)
/** 关联人像对话框显隐 */
const showLinkPortrait = ref(false)

/** P-B：生成模型下拉。'' = 自动（后端 pickImageModel 挑启用 provider 的第一个 image 模型） */
const selectedImageModel = ref('')
const imageModelOptions = ref<Array<{ providerConfigId: string; modelId: string; label: string }>>([])

/** 启用 provider 的 image/multimodal 类型模型（数据加载同设置页 / EpisodeStudio） */
async function loadImageModelOptions(): Promise<void> {
  try {
    const response = await window.electronAPI.providerConfig.list()
    if (!response?.success || !response.data) return
    const opts: Array<{ providerConfigId: string; modelId: string; label: string }> = []
    for (const cfg of response.data.filter((c: any) => c.isEnabled)) {
      for (const m of (cfg.models ?? []) as Array<{ id?: string; type?: string }>) {
        if (m.id && (m.type === 'image' || m.type === 'multimodal')) {
          opts.push({ providerConfigId: cfg.id, modelId: m.id, label: `${cfg.name} / ${m.id}` })
        }
      }
    }
    imageModelOptions.value = opts
  } catch (e) {
    console.error('[AssetGallery] 加载图像模型列表失败:', e)
  }
}

/** 当前下拉选择解析为 { providerConfigId, modelId }；'' → undefined（自动） */
function currentModelSelection(): { providerConfigId?: string; modelId?: string } {
  const v = selectedImageModel.value
  if (!v) return {}
  const sep = v.indexOf('/')
  if (sep <= 0) return {}
  return { providerConfigId: v.slice(0, sep), modelId: v.slice(sep + 1) }
}

/** 待生成的衍生 slot（无图），供一键生成对话框勾选 */
const pendingDeriveItems = computed(() =>
  navItems.value
    .filter(i => i.label !== 'main' && !imageByLabel(i.label)?.imagePath)
    .map(i => ({ label: i.label, title: i.title, category: i.category })),
)

/** 第一张主图（created_at 最早且有图）——换装基准 */
const firstMainPath = computed<string | null>(() => {
  const mains = images.value.filter(i => i.category === 'main' && i.imagePath)
  const first = [...mains].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))[0]
  return first?.imagePath ?? null
})

/** 已有主图数量（换装标签用） */
const mainCount = computed(() => images.value.filter(i => i.category === 'main' && i.imagePath).length)

function onAddOutfitSubmitted(): void {
  void load()
}

function toUrl(path?: string): string {
  return path ? toImageUrl(path) : ''
}

async function load(): Promise<void> {
  if (!props.assetId) { images.value = []; impact.value = { keyframes: 0, storyboards: 0, keyframeIds: [] }; return }
  loading.value = true
  try {
    const root = (window as any).electronAPI?.episodeProduction?.asset
    const r = await root.image.listByAsset(props.kind, props.assetId)
    images.value = r?.success ? r.data : []
    void refreshImpact()
    // 切换资产后主图查看索引归零
    selectedMainIndex.value = 0
    // 仅当当前选中的 slot 无效时才重置为默认：
    // 保留用户在树切换 / 重新加载前选中的 slot（如"正面半身"），
    // 否则每次 load 都跳回 main，用户改过的非 main 提示词看起来像"没保存"。
    const currentLabel = selectedLabel.value
    const currentSlotValid = navItems.value.some(i => i.label === currentLabel)
    if (!currentSlotValid) {
      const firstWithImg = navItems.value.find(i => imageByLabel(i.label)?.imagePath)
      selectedLabel.value = firstWithImg?.label || 'main'
    }
    const sel = imageByLabel(selectedLabel.value)
    // 输入框只显示"用户内容"（剥离系统自动追加的约束段），
    // 避免用户基于完整拼接再次生成时约束重复追加 / 串 slot
    localPrompt.value = stripSystemConstraints(sel?.prompt || '')
    loadedPrompt = localPrompt.value
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
  localPrompt.value = stripSystemConstraints(sel?.prompt || '')
  loadedPrompt = localPrompt.value
}

async function onGenerate(item: { label: string; category: string }): Promise<void> {
  if (!props.assetId || generating.value) return
  generating.value = true
  try {
    // 先落盘当前编辑的提示词（待生成 slot 会建占位行；已有图则更新），
    // 保证生成时使用用户最新编辑的提示词，且生成后输入框内容不丢。
    await onSavePrompt()
    if (item.label === 'main') {
      // 已有主图 → 弹出"新增正面全身（换装）"对话框（输入提示词/上传参考图）；
      // 无主图 → 生成第一张基准主图（自定义提示词优先）。
      if (hasMain.value) {
        generating.value = false
        showAddOutfit.value = true
        return
      }
      const override = localPrompt.value.trim() ? localPrompt.value : undefined
      const img = await generateMainFor(
        props.kind,
        props.assetId,
        { ...(override ? { promptOverride: override } : {}), ...currentModelSelection() },
      )
      void img
      ElMessage.success('主图已生成')
    } else {
      const root = (window as any).electronAPI?.episodeProduction?.asset
      const main = imageByLabel('main')
      // 派生图系统固定：以主图为参考，提示词由服务端按 slot 语义拼
      // （身份锚点 + 该图角度/景别描述 + 固定约束），不传用户自定义提示词，
      // 保证同一资产各角度图的面容/发型/服饰/背景一致。
      const r = await root.derive.single({
        assetType: props.kind,
        assetId: props.assetId,
        category: item.category,
        label: item.label,
        baseImageId: main?.id || null,
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

/**
 * 重新生成衍生图：以主图为参考，系统固定提示词重新生成；
 * 生成成功后再删除旧衍生图，避免同 label 多行残留。
 */
async function onRegenerate(item: { label: string; category: string }): Promise<void> {
  if (!props.assetId || generating.value) return
  generating.value = true
  try {
    const root = (window as any).electronAPI?.episodeProduction?.asset
    const main = imageByLabel('main')
    const r = await root.derive.single({
      assetType: props.kind,
      assetId: props.assetId,
      category: item.category,
      label: item.label,
      baseImageId: main?.id || null,
    })
    if (!r?.success) { ElMessage.error(r?.error || '重新生成失败'); return }
    // 删除旧衍生图（保留新生成的）
    const old = images.value.find(i => i.label === item.label && i.id !== r.data?.id)
    if (old?.id) await root.image.delete(old.id)
    ElMessage.success(`${item.title} 已重新生成`)
    await load()
  } catch (e: any) {
    ElMessage.error(e?.message || '重新生成失败')
  } finally {
    generating.value = false
  }
}

/** 删除某槽位当前显示的图片（连带磁盘文件）。主图删除后进入"缺主图"状态。 */
async function onDeleteImage(item: { label: string; category: string }): Promise<void> {
  if (!props.assetId || generating.value || deletingLabel.value) return
  const img = navImage(item.label)
  if (!img?.id || !img.imagePath) return
  const isMain = img.category === 'main' || img.isMain === 1
  // S-05：删除主图前刷新影响面，确认文案带上引用数字
  if (isMain) await refreshImpact()
  const impactText =
    isMain && (impact.value.keyframes > 0 || impact.value.storyboards > 0)
      ? `该资产当前被 ${impact.value.keyframes} 个关键帧引用 / ${impact.value.storyboards} 个分镜使用。`
      : ''
  try {
    await ElMessageBox.confirm(
      isMain
        ? `${impactText}删除主图后该资产将进入"缺主图"状态。确认删除"${item.title}"？`
        : `确认删除"${item.title}"这张图？文件将一并删除，不可恢复。`,
      '删除图片',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return // 用户取消
  }
  const root = (window as any).electronAPI?.episodeProduction?.asset
  if (!root?.image?.delete) {
    ElMessage.error('image.delete IPC 未暴露')
    return
  }
  deletingLabel.value = item.label
  try {
    const r = await root.image.delete(img.id)
    if (r?.success) {
      ElMessage.success('已删除')
      await load()
    } else {
      ElMessage.error(r?.error || '删除失败')
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '删除失败')
  } finally {
    deletingLabel.value = ''
  }
}

/** S-05：拉取当前资产的关键帧 / 分镜引用影响面（失败静默，不阻塞图集） */
async function refreshImpact(): Promise<void> {
  if (!props.assetId) return
  try {
    const ep = (window as any).electronAPI?.episodeProduction
    const r = await ep?.getAssetReferenceImpact?.(props.kind, props.assetId)
    if (r?.success && r.data) {
      impact.value = {
        keyframes: r.data.keyframes ?? 0,
        storyboards: r.data.storyboards ?? 0,
        keyframeIds: r.data.keyframeIds ?? [],
      }
    }
  } catch { /* 统计失败不阻塞 */ }
}

/**
 * S-05：确认 / 撤销确认定妆图。
 * 确认后若该资产已被关键帧引用 → 弹窗询问是否级联重生这些关键帧。
 */
async function onToggleConfirm(): Promise<void> {
  const img = selectedImage.value
  if (!img?.id || confirmToggling.value) return
  const root = (window as any).electronAPI?.episodeProduction
  if (!root?.asset?.image?.setConfirmed) {
    ElMessage.error('image.setConfirmed IPC 未暴露')
    return
  }
  const next = img.confirmed === 1 ? 0 : 1
  confirmToggling.value = true
  try {
    const r = await root.asset.image.setConfirmed(img.id, next === 1)
    if (!r?.success) {
      ElMessage.error(r?.error || '操作失败')
      return
    }
    img.confirmed = next
    const cur = images.value.find(i => i.id === img.id)
    if (cur) cur.confirmed = next
    ElMessage.success(next === 1 ? '已确认定妆，关键帧将选用该图作参考' : '已撤销确认')
    if (next === 1) await maybeCascadeRegenerate()
    await refreshImpact()
  } catch (e: any) {
    ElMessage.error(e?.message || '操作失败')
  } finally {
    confirmToggling.value = false
  }
}

/** S-05 级联重生：确认新主图后，询问并逐个重生引用该资产的关键帧（串行，失败单个跳过） */
async function maybeCascadeRegenerate(): Promise<void> {
  await refreshImpact()
  const n = impact.value.keyframes
  if (n <= 0) return
  try {
    await ElMessageBox.confirm(
      `该资产正被 ${n} 个关键帧引用。是否按新定妆图重新生成这些关键帧？（逐帧串行，失败的帧自动跳过）`,
      '级联重新生成',
      { type: 'warning', confirmButtonText: '重新生成', cancelButtonText: '暂不' },
    )
  } catch {
    return // 用户选"暂不"
  }
  const ep = (window as any).electronAPI?.episodeProduction
  if (!ep?.regenerateReferencingKeyframes) {
    ElMessage.error('regenerateReferencingKeyframes IPC 未暴露')
    return
  }
  generating.value = true
  try {
    const r = await ep.regenerateReferencingKeyframes(props.kind, props.assetId)
    if (r?.success && r.data) {
      const { succeeded = 0, failed = 0 } = r.data
      if (failed === 0) ElMessage.success(`已重新生成 ${succeeded} 个关键帧`)
      else ElMessage.warning(`已重新生成 ${succeeded} 个关键帧，${failed} 个失败已跳过`)
    } else {
      ElMessage.error(r?.error || '级联重生失败')
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '级联重生失败')
  } finally {
    generating.value = false
  }
}

/** 双击放大：用 el-image-viewer 展示大图（与分镜界面资产图展示同款样式） */
function openPreviewer(img: any): void {
  if (!img?.imagePath) return
  viewerUrlList.value = [toUrl(img.imagePath)]
  openViewer.value = true
}

function closePreviewer(): void {
  openViewer.value = false
}

/** 下载当前选中的图片（双端兼容：PC 保存对话框 / Web 浏览器下载） */
function onDownloadImage(): void {
  const img = selectedImage.value
  if (img?.imagePath) {
    void downloadImage(img)
  } else {
    ElMessage.warning('当前无图片可下载')
  }
}

/** 一键生成：按勾选的 slot 批量派生（以主图为参考，系统固定提示词） */
async function onBatchDerive(labels: string[]): Promise<void> {
  if (!props.assetId || labels.length === 0 || generating.value) return
  generating.value = true
  try {
    const root = (window as any).electronAPI?.episodeProduction?.asset
    const main = imageByLabel('main')
    const results: Array<{ ok: boolean; error?: string }> = []
    for (const label of labels) {
      const item = navItems.value.find(i => i.label === label)
      if (!item) continue
      try {
        const r = await root.derive.single({
          assetType: props.kind,
          assetId: props.assetId,
          category: item.category,
          label: item.label,
          baseImageId: main?.id || null,
        })
        results.push({ ok: !!r?.success, error: r?.success ? undefined : (r?.error ?? undefined) })
      } catch (e: any) {
        results.push({ ok: false, error: e?.message || '请求失败' })
      }
    }
    // 评审 #56：全失败弹 error、部分失败弹 warning，不再"已生成 0 张图"假成功
    const summary = summarizeBatchResults(results)
    if (summary.level === 'success') ElMessage.success(summary.message)
    else if (summary.level === 'warning') ElMessage.warning(summary.message)
    else ElMessage.error(summary.message)
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
    // 输入框显示的是剥离约束后的用户内容；落库是完整拼接。
    // 用户没改动时（纯净内容与库里的用户部分相同）不覆盖落库的完整拼接。
    if (text === stripSystemConstraints(sel.prompt || '')) return
    const r = await root.image.update(sel.id, { prompt: text })
    if (r?.success) {
      // 清空提示词是明确的用户操作，但要提示后果——避免"清空后生成静默改用系统拼接"无感知
      ElMessage[text.trim() ? 'success' : 'warning'](
        text.trim() ? '提示词已保存' : '提示词已清空，生成时将使用系统提示词',
      )
      // 同步内存图集数据，避免后续判定（sel.prompt）与 DB 不一致
      const cur = images.value.find(i => i.id === sel.id)
      if (cur) cur.prompt = text
      loadedPrompt = text
    } else if (r?.code === 'NOT_FOUND' || (r?.error && /不存在/.test(r.error))) {
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

watch(() => [props.assetId, props.kind], () => void load())
onMounted(() => { void load(); void loadImageModelOptions() })
// keep-alive 缓存组件被重新激活时（从其它 tab/路由切回）重新拉取，保证显示最新提示词；
// 但输入框有未保存编辑时跳过刷新，避免用 DB 旧值覆盖用户正在写的内容
onActivated(() => {
  if (localPrompt.value.trim() !== loadedPrompt.trim()) return
  void load()
})
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
  .impact-hint { font-size: 11px; color: var(--color-warning); }
  .top-view-pills { display: flex; gap: 6px; }
  .top-actions { display: flex; align-items: center; gap: 4px; }
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
    position: relative;
    .thumb-img { width: 100%; height: 100%; object-fit: cover; }
    .thumb-empty { color: var(--text-color-placeholder); }
    // S-05 已确认定妆角标
    .confirm-badge {
      position: absolute;
      top: -4px;
      right: -4px;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: var(--color-success);
      color: #fff;
      font-size: 9px;
      line-height: 14px;
      text-align: center;
      z-index: 2;
    }
    // 衍生图（半身/角度等）：小缩略 + 角标，与主图区分
    &.derived {
      width: 36px; height: 36px;
      border: 1px dashed var(--border-color-light);
    }
  }
  .nav-info { flex: 1; min-width: 0; }
  .nav-name { font-size: 13px; color: var(--text-color-primary); font-weight: 500; }
  .nav-status { font-size: 11px; margin-top: 2px; &.done { color: var(--color-success); } &.pending { color: var(--text-color-placeholder); } }
  .nav-add { color: var(--color-primary); }
  .nav-regen { color: var(--color-info); }
  .nav-del { color: var(--color-danger); }
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
  .preview-del {
    position: absolute;
    top: 10px;
    right: 14px;
    z-index: 3;
  }
  .preview-dl {
    position: absolute;
    top: 10px;
    left: 14px;
    z-index: 3;
  }
  // S-05 定妆确认：已确认角标 + 确认/撤销切换按钮
  .confirmed-chip {
    position: absolute;
    bottom: 10px;
    left: 14px;
    z-index: 3;
    padding: 2px 8px;
    border-radius: var(--radius-full);
    background: var(--color-success);
    color: #fff;
    font-size: 11px;
  }
  .preview-confirm {
    position: absolute;
    bottom: 10px;
    right: 14px;
    z-index: 3;
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
  .model-select { width: 200px; flex-shrink: 0; }
}

.empty {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
