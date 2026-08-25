<template>
  <div class="asset-image-card">
    <!-- 预览区 -->
    <div class="img-preview">
      <el-image
        v-if="imageUrl"
        :src="imageUrl"
        fit="cover"
        class="preview-img"
        :preview-src-list="imageUrl ? [imageUrl] : []"
      />
      <div v-else class="preview-placeholder" :class="{ shimmer: generating }">
        <el-icon :size="30"><Picture /></el-icon>
        <span class="ph-text">{{ generating ? '生成中…' : '待生成' }}</span>
      </div>
      <div v-if="isMain" class="main-badge">主图</div>
      <div v-if="generating" class="gen-overlay">
        <el-icon class="is-loading"><Loading /></el-icon>
      </div>
    </div>

    <!-- 信息区 -->
    <div class="card-info">
      <div class="info-top">
        <span class="card-title">{{ title }}</span>
        <span class="card-category">{{ categoryLabel }}</span>
      </div>

      <!-- 提示词编辑 -->
      <el-input
        v-model="localPrompt"
        type="textarea"
        :rows="2"
        resize="none"
        class="prompt-input"
        placeholder="镜头提示词…"
        @blur="onSavePrompt"
      />

      <!-- 操作 -->
      <div class="card-actions">
        <el-button
          v-if="!hasImage"
          type="primary"
          size="small"
          :loading="generating"
          @click="$emit('generate')"
        >
          <el-icon><MagicStick /></el-icon>
          {{ isMain ? '生成主图' : '生成图片' }}
        </el-button>
        <el-button
          v-if="hasImage"
          type="primary"
          size="small"
          :loading="generating"
          @click="$emit('regenerate')"
        >
          <el-icon><Refresh /></el-icon>
          重新生成
        </el-button>
        <el-button v-if="hasImage && !isMain" text size="small" @click="$emit('delete')">
          <el-icon><Delete /></el-icon>
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * M3 资产页 · 单张资产图卡（预览 + 状态 + 提示词编辑 + 生成/重新生成/删除）。
 * "待生成"：无图（category 目标但无记录）；"已定妆"：有 imagePath。
 */
import { ref, computed, watch } from 'vue'
import { Picture, MagicStick, Refresh, Delete, Loading } from '@element-plus/icons-vue'
import { toImageUrl } from '@/utils/asset-url'

const props = defineProps<{
  image: any | null
  /** 卡片标题（如"正面全身"/"正面半身"） */
  title: string
  category: string
  isMain?: boolean
  generating?: boolean
}>()

const emit = defineEmits<{
  (e: 'generate'): void
  (e: 'regenerate'): void
  (e: 'delete'): void
  (e: 'savePrompt', image: any, prompt: string): void
}>()

const localPrompt = ref(props.image?.prompt || '')
watch(() => props.image, (v) => { localPrompt.value = v?.prompt || '' })

const imageUrl = computed(() => {
  const p = props.image?.imagePath || props.image?.thumbnailPath
  if (!p) return null
  return toImageUrl(p)
})

const hasImage = computed(() => !!props.image?.imagePath)

const categoryLabel = computed(() => {
  const map: Record<string, string> = { main: '主图', view: '造型', expression: '表情', outfit: '服装', pose: '姿势', variant: '变体' }
  return map[props.category] || props.category
})

async function onSavePrompt(): Promise<void> {
  if (!props.image?.id) return
  if (localPrompt.value === (props.image?.prompt || '')) return
  emit('savePrompt', props.image, localPrompt.value)
}
</script>

<style lang="scss" scoped>
.asset-image-card {
  background: var(--bg-color);
  border: 1px solid var(--border-color-lighter);
  border-radius: var(--radius-lg);
  overflow: hidden;
  transition: all var(--transition-fast);
  &:hover { border-color: var(--color-primary); box-shadow: var(--shadow-card-hover); }
}

.img-preview {
  position: relative;
  height: 200px;
  background: var(--fill-color-lighter);
  display: flex;
  align-items: center;
  justify-content: center;
  .preview-img { width: 100%; height: 100%; object-fit: cover; }
  .preview-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    color: var(--text-color-placeholder);
    .ph-text { font-size: 12px; }
    &.shimmer { animation: shimmer 1.5s linear infinite; }
  }
  .main-badge {
    position: absolute;
    top: 8px; left: 8px;
    background: var(--color-primary);
    color: #fff;
    font-size: 10px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: var(--radius-full);
  }
  .gen-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0,0,0,0.35);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-size: 28px;
  }
}

@keyframes shimmer {
  0% { opacity: 0.5; }
  50% { opacity: 1; }
  100% { opacity: 0.5; }
}

.card-info { padding: 10px 12px 12px; }
.info-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.card-title { font-size: 13px; font-weight: 600; color: var(--text-color-primary); }
.card-category { font-size: 11px; color: var(--text-color-secondary); }

.prompt-input {
  :deep(.el-textarea__inner) { font-size: 12px; line-height: 1.6; }
}

.card-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
}
</style>
