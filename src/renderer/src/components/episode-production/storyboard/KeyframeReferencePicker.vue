<template>
  <!--
    阶段 2 · 用户为关键帧手动挑选参考图（覆盖默认评分选图）。

    展示：本帧涉及的角色 / 地点 / 物品，每个资产一个 section，
    section 内列出该资产全部 asset_image（按主图 → 变体顺序），
    用户点击切换选择；点"保存"或"保存并重生"提交。

    依赖 IPC：
      - episodeProduction.listAssetImages(kind, bindingId)
      - episodeProduction.setKeyframeReferenceOverrides(keyframeId, overrides)
      - episodeProduction.regenerateKeyframe（可选 · 保存并重生）
  -->
  <el-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    title="为该关键帧挑选参考图"
    width="80%"
    destroy-on-close
    @open="onOpen"
  >
    <div v-if="loading" class="picker-loading">
      <el-icon class="is-loading"><Loading /></el-icon>
      加载中…
    </div>

    <div v-else-if="assetSections.length === 0" class="picker-empty">
      该帧暂未识别到出场资产；先在 ④ 分镜配置角色或在 ③ 剧本指定地点
    </div>

    <div v-else class="picker-body">
      <p class="picker-hint">
        💡 每个资产可挑一张图作 reference。未选则走默认评分（角色按 view/expression/outfit/pose；地点按 angle/time/weather；物品按 view/context）。
      </p>

      <section
        v-for="sec in assetSections"
        :key="`${sec.kind}:${sec.bindingId}`"
        class="picker-section"
      >
        <header class="picker-section-header">
          <span class="picker-kind">{{ kindEmoji(sec.kind) }} {{ kindLabel(sec.kind) }}</span>
          <span class="picker-name">{{ sec.name }}</span>
          <span v-if="sec.images.length === 0" class="picker-empty-tag">该资产无图</span>
          <el-button
            v-if="getSelected(sec.kind, sec.bindingId)"
            text
            size="small"
            class="picker-clear"
            @click="clearSelection(sec.kind, sec.bindingId)"
          >
            清除选择（恢复自动）
          </el-button>
        </header>

        <div v-if="sec.images.length > 0" class="picker-grid">
          <div
            v-for="img in sec.images"
            :key="img.id"
            class="picker-cell"
            :class="{ selected: getSelected(sec.kind, sec.bindingId) === img.id }"
            @click="onSelect(sec.kind, sec.bindingId, img.id)"
          >
            <img :src="toImageUrl(img.thumbnailPath || img.imagePath)" :alt="img.label || img.category" />
            <div class="picker-cell-meta">
              <span class="picker-cat">{{ img.category }}</span>
              <span v-if="img.label" class="picker-label">· {{ img.label }}</span>
              <span v-if="img.isMain" class="picker-main">· 主图</span>
            </div>
          </div>
        </div>
      </section>
    </div>

    <template #footer>
      <span class="footer-hint" v-if="hasChanges">{{ changedCount }} 处选择待保存</span>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button
        type="primary"
        plain
        :loading="saving"
        :disabled="!hasChanges"
        @click="onSave(false)"
      >
        保存
      </el-button>
      <el-button
        type="primary"
        :loading="saving || regenerating"
        :disabled="!hasChanges && !canRegenAnyway"
        @click="onSave(true)"
      >
        保存并重生此帧
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import { toImageUrl } from '@/utils/asset-url'

interface KindBinding {
  kind: 'character' | 'location' | 'item'
  bindingId: string
  name: string
}

interface AssetImageRow {
  id: string
  imagePath: string
  thumbnailPath: string | null
  category: string
  label: string | null
  isMain: boolean
}

interface KeyframeReferenceLike {
  /** 已经在用的 reference（来自 listKeyframes 返回的 references）— 用于初始化选择 */
  bindingId: string
  assetType: 'character' | 'location' | 'item' | string
  id: string  // asset_image.id
  assetName: string
}

interface OverrideEntry {
  kind: 'character' | 'location' | 'item'
  bindingId: string
  imageId: string
}

const props = defineProps<{
  modelValue: boolean
  keyframeId: string | null
  /** 该帧出场的资产列表（kind/bindingId/name）— 父组件从 storyboard.characters / scene.location / scene.items 解析 */
  assets: KindBinding[]
  /** 该帧已存在的 references（用于 dialog 打开时初始化选择高亮） */
  existingReferences?: KeyframeReferenceLike[]
  /** 该帧已存在的用户 overrides（最终持久化的真值，优先于 existingReferences） */
  existingOverrides?: OverrideEntry[]
}>()

const emit = defineEmits<{
  'update:modelValue': [boolean]
  /** 重生完成后通知父组件刷新 */
  saved: [{ regenerated: boolean }]
}>()

const loading = ref(false)
const saving = ref(false)
const regenerating = ref(false)
const assetImages = ref<Map<string, AssetImageRow[]>>(new Map())
const selections = reactive<Record<string, string>>({})
const initialSelections = ref<Record<string, string>>({})

const assetSections = computed(() =>
  props.assets.map((a) => ({
    ...a,
    images: assetImages.value.get(`${a.kind}:${a.bindingId}`) ?? [],
  })),
)

const hasChanges = computed(() => {
  const keys = new Set([
    ...Object.keys(selections),
    ...Object.keys(initialSelections.value),
  ])
  for (const k of keys) {
    if ((selections[k] ?? null) !== (initialSelections.value[k] ?? null)) return true
  }
  return false
})

const changedCount = computed(() => {
  let n = 0
  const keys = new Set([
    ...Object.keys(selections),
    ...Object.keys(initialSelections.value),
  ])
  for (const k of keys) {
    if ((selections[k] ?? null) !== (initialSelections.value[k] ?? null)) n++
  }
  return n
})

// 即使无改动，用户也可能想"按当前选择"重生（极少场景；保留通道）
const canRegenAnyway = computed(() => Object.keys(selections).length > 0)

async function onOpen(): Promise<void> {
  loading.value = true
  try {
    // 初始化 selections：override 优先；其次 existingReferences
    const init: Record<string, string> = {}
    for (const ref of props.existingReferences ?? []) {
      const k = `${ref.assetType}:${ref.bindingId}`
      init[k] = ref.id
    }
    for (const ov of props.existingOverrides ?? []) {
      init[`${ov.kind}:${ov.bindingId}`] = ov.imageId
    }
    initialSelections.value = { ...init }
    Object.keys(selections).forEach((k) => delete selections[k])
    for (const k of Object.keys(init)) selections[k] = init[k]

    // 拉每个资产的图谱
    const api = (window as any).electronAPI?.episodeProduction
    if (!api?.listAssetImages) {
      ElMessage.error('listAssetImages IPC 未暴露')
      return
    }
    const next = new Map<string, AssetImageRow[]>()
    await Promise.all(
      props.assets.map(async (a) => {
        const resp = await api.listAssetImages(a.kind, a.bindingId).catch(() => null)
        if (resp?.success && Array.isArray(resp.data)) {
          next.set(`${a.kind}:${a.bindingId}`, resp.data as AssetImageRow[])
        } else {
          next.set(`${a.kind}:${a.bindingId}`, [])
        }
      }),
    )
    assetImages.value = next
  } finally {
    loading.value = false
  }
}

function getSelected(kind: string, bindingId: string): string | undefined {
  return selections[`${kind}:${bindingId}`]
}

function onSelect(kind: 'character' | 'location' | 'item', bindingId: string, imageId: string): void {
  const k = `${kind}:${bindingId}`
  if (selections[k] === imageId) {
    delete selections[k]
  } else {
    selections[k] = imageId
  }
}

function clearSelection(kind: string, bindingId: string): void {
  delete selections[`${kind}:${bindingId}`]
}

async function onSave(regenAfter: boolean): Promise<void> {
  if (!props.keyframeId) return
  saving.value = true
  try {
    const overrides: OverrideEntry[] = []
    for (const a of props.assets) {
      const id = selections[`${a.kind}:${a.bindingId}`]
      if (id) overrides.push({ kind: a.kind, bindingId: a.bindingId, imageId: id })
    }
    const api = (window as any).electronAPI?.episodeProduction
    if (!api?.setKeyframeReferenceOverrides) {
      ElMessage.error('setKeyframeReferenceOverrides IPC 未暴露')
      return
    }
    const resp = await api.setKeyframeReferenceOverrides(props.keyframeId, overrides)
    if (!resp?.success) {
      ElMessage.error(resp?.error || '保存挑图失败')
      return
    }
    if (regenAfter) {
      regenerating.value = true
      try {
        const r = await api.regenerateKeyframe?.(props.keyframeId)
        if (!r?.success) {
          ElMessage.error(r?.error || '重生失败')
          return
        }
        ElMessage.success('已保存挑图并重生此帧')
      } finally {
        regenerating.value = false
      }
    } else {
      ElMessage.success('已保存挑图（重生时生效）')
    }
    emit('saved', { regenerated: regenAfter })
    emit('update:modelValue', false)
  } catch (e: any) {
    ElMessage.error('保存失败：' + (e?.message ?? '未知错误'))
  } finally {
    saving.value = false
  }
}

function kindLabel(k: string): string {
  return k === 'character' ? '角色' : k === 'location' ? '地点' : k === 'item' ? '物品' : k
}

function kindEmoji(k: string): string {
  return k === 'character' ? '👤' : k === 'location' ? '📍' : k === 'item' ? '⚔️' : '📦'
}
</script>

<style scoped>
.picker-loading,
.picker-empty {
  padding: 40px;
  text-align: center;
  color: var(--el-text-color-secondary);
}

.picker-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.picker-hint {
  margin: 0 0 12px;
  padding: 8px 12px;
  background: var(--el-color-primary-light-9);
  border-left: 3px solid var(--el-color-primary);
  font-size: 12px;
  color: var(--el-text-color-regular);
}

.picker-section {
  margin-bottom: 16px;
}

.picker-section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
  margin-bottom: 8px;
}

.picker-kind {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.picker-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.picker-empty-tag {
  font-size: 11px;
  color: var(--el-color-warning);
  margin-left: auto;
}

.picker-clear {
  margin-left: auto;
}

.picker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 10px;
}

.picker-cell {
  cursor: pointer;
  border: 2px solid transparent;
  border-radius: 4px;
  overflow: hidden;
  background: var(--el-fill-color-lighter);
  transition: all 0.15s;
}

.picker-cell:hover {
  border-color: var(--el-color-primary-light-5);
}

.picker-cell.selected {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 2px var(--el-color-primary-light-7);
}

.picker-cell img {
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  display: block;
}

.picker-cell-meta {
  padding: 4px 6px;
  font-size: 11px;
  color: var(--el-text-color-regular);
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
}

.picker-cat {
  color: var(--el-text-color-primary);
  font-weight: 500;
}

.picker-label {
  color: var(--el-text-color-secondary);
}

.picker-main {
  color: var(--el-color-success);
}

.footer-hint {
  font-size: 12px;
  color: var(--el-color-warning);
  margin-right: auto;
}
</style>
