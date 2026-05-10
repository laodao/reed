<template>
  <!--
    ReferenceSetPanel · 角色形象组（spec 2026-05-09 ep-redesign §3.2 D1 · P-9）

    用户勾选 character_binding 已有图作为生图固定参考集；
    keyframe 生成时全部喂给 provider 的 multi-reference 入参。

    取代 LoRA 训练路径（4 家国内云 API 都不开放训练；唯一可行 = multi-reference）。

    双母语：
      大众用户 → 勾选直观；默认值合理（main + 三视图自动加入）
      专业用户 → 明确告知当前 provider 多图上限；可手动调整组合
  -->
  <el-card class="reference-set-panel" shadow="never">
    <template #header>
      <div class="card-header">
        <span class="header-title">⭐ 角色形象组</span>
        <span class="header-hint">— 生图时用这些图作为稳定参考</span>
        <span class="header-spacer" />
        <el-tag v-if="dirty" size="small" type="warning">未保存</el-tag>
      </div>
    </template>

    <div v-if="allImages.length === 0" class="empty-hint">
      请先生成主图 / 派生视角 / 表情等图。
    </div>
    <template v-else>
      <el-checkbox-group v-model="selected" class="image-grid">
        <el-checkbox
          v-for="img in allImages"
          :key="img.id"
          :value="img.id"
          class="image-item"
          border
        >
          <span class="image-cell">
            <img :src="toImageUrl(img.thumbnailPath || img.imagePath)" :alt="img.label || img.category" />
            <span class="image-meta">
              <span class="image-cat">{{ img.category }}</span>
              <span v-if="img.label" class="image-label">{{ img.label }}</span>
              <el-tag v-if="img.isMain === 1" size="small" type="warning" effect="light">主图</el-tag>
            </span>
          </span>
        </el-checkbox>
      </el-checkbox-group>

      <div class="info-row">
        <span class="muted">已选 {{ selected.length }} 张 / {{ allImages.length }} 张可选</span>
        <el-tooltip
          placement="top"
          content="不勾选时默认用 main + 所有 view 类目作为形象组（自动 fallback）"
        >
          <el-icon class="hint-icon"><QuestionFilled /></el-icon>
        </el-tooltip>
        <span class="header-spacer" />
        <el-button size="small" :disabled="!dirty" @click="onReset">
          恢复
        </el-button>
        <el-button
          size="small"
          type="primary"
          :loading="saving"
          :disabled="!dirty"
          @click="onSave"
        >
          保存形象组
        </el-button>
      </div>
    </template>
  </el-card>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { QuestionFilled } from '@element-plus/icons-vue'
import { toImageUrl } from '@/utils/asset-url'

interface AssetImageRow {
  id: string
  category: string
  label: string | null
  imagePath: string
  thumbnailPath?: string | null
  isMain: number
}

const props = defineProps<{ bindingId: string }>()

const allImages = ref<AssetImageRow[]>([])
const selected = ref<string[]>([])
const initial = ref<string[]>([])
const saving = ref(false)

const dirty = computed(() => {
  if (selected.value.length !== initial.value.length) return true
  const s = new Set(selected.value)
  for (const id of initial.value) if (!s.has(id)) return true
  return false
})

async function loadImages(): Promise<void> {
  if (!props.bindingId) return
  const api = (window as any).electronAPI?.episodeProduction?.asset
  if (!api?.image?.listByAsset) return
  const resp = await api.image.listByAsset('character', props.bindingId)
  if (resp?.success && Array.isArray(resp.data)) {
    allImages.value = resp.data as AssetImageRow[]
  }
}

async function loadReferenceSet(): Promise<void> {
  if (!props.bindingId) return
  const api = (window as any).electronAPI?.episodeProduction?.asset
  if (!api?.character?.getReferenceSet) return
  const resp = await api.character.getReferenceSet({ bindingId: props.bindingId })
  if (resp?.success) {
    const ids = (resp.data?.imageIds as string[]) ?? []
    selected.value = [...ids]
    initial.value = [...ids]
  }
}

async function onSave(): Promise<void> {
  saving.value = true
  try {
    const api = (window as any).electronAPI?.episodeProduction?.asset
    const resp = await api?.character?.setReferenceSet({
      bindingId: props.bindingId,
      imageIds: selected.value,
    })
    if (!resp?.success) {
      ElMessage.error(resp?.error || '保存形象组失败')
      return
    }
    initial.value = [...selected.value]
    ElMessage.success(
      selected.value.length === 0
        ? '已重置为默认形象组（main + 所有 view 自动 fallback）'
        : `已保存形象组（${selected.value.length} 张）`,
    )
  } finally {
    saving.value = false
  }
}

function onReset(): void {
  selected.value = [...initial.value]
}

onMounted(async () => {
  await loadImages()
  await loadReferenceSet()
})

watch(
  () => props.bindingId,
  async () => {
    await loadImages()
    await loadReferenceSet()
  },
)

defineExpose({ reload: loadImages })
</script>

<style scoped lang="scss">
.reference-set-panel {
  background: var(--el-color-primary-light-9);
}

.card-header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.header-title {
  font-weight: 600;
  font-size: 13px;
  color: var(--el-color-primary);
}

.header-hint {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.header-spacer {
  flex: 1;
}

.empty-hint {
  text-align: center;
  padding: 12px;
  color: var(--el-text-color-placeholder);
  font-size: 12px;
}

.image-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.image-item {
  margin: 0 !important;
  display: inline-flex !important;
  padding: 4px !important;
  height: auto !important;
}

.image-item :deep(.el-checkbox__label) {
  padding-left: 4px;
}

.image-cell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  width: 80px;
}

.image-cell img {
  width: 80px;
  height: 80px;
  object-fit: cover;
  border-radius: 4px;
  border: 1px solid var(--el-border-color-lighter);
}

.image-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: flex-start;
}

.image-cat {
  font-size: 10px;
  color: var(--el-text-color-placeholder);
}

.image-label {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.info-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.muted {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}

.hint-icon {
  cursor: help;
  color: var(--el-text-color-placeholder);
  font-size: 14px;
}
</style>
