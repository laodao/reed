<template>
  <el-dialog
    :model-value="modelValue"
    title="重新生成主图 · 请选择保留哪张"
    width="860px"
    append-to-body
    :show-close="false"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    class="main-compare-dialog"
  >
    <div class="compare-hint">
      本次重新生成了一版新主图。对比新旧两张下方缩略图，选择要保留的一张；被舍弃的那张（含磁盘图片文件）将被删除。
    </div>
    <div class="compare-body">
      <div class="compare-item">
        <div class="compare-tag">旧图 · 原主图</div>
        <el-image
          :src="oldSrc"
          fit="contain"
          class="compare-img"
          :preview-src-list="[oldSrc]"
          preview-teleported
          hide-on-click-modal
        />
        <el-button class="choose-btn" @click="$emit('choose', 'old')">保留这张（旧图）</el-button>
      </div>
      <div class="compare-arrow">
        <el-icon :size="28"><Right /></el-icon>
      </div>
      <div class="compare-item">
        <div class="compare-tag">新图 · 本次生成</div>
        <el-image
          :src="newSrc"
          fit="contain"
          class="compare-img"
          :preview-src-list="[newSrc]"
          preview-teleported
          hide-on-click-modal
        />
        <el-button type="primary" class="choose-btn" @click="$emit('choose', 'new')">保留这张（新图）</el-button>
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Right } from '@element-plus/icons-vue'
import { toImageUrl } from '@/utils/asset-url'
import type { CompareImage } from '@/composables/use-main-regenerate-compare'

const props = defineProps<{
  modelValue: boolean
  oldImage: CompareImage | null
  newImage: CompareImage | null
}>()

defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'choose', choice: 'old' | 'new'): void
}>()

const oldSrc = computed(() => (props.oldImage?.imagePath ? toImageUrl(props.oldImage.imagePath) : ''))
const newSrc = computed(() => (props.newImage?.imagePath ? toImageUrl(props.newImage.imagePath) : ''))
</script>

<style lang="scss" scoped>
.compare-hint {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  line-height: 1.6;
  margin-bottom: 14px;
}
.compare-body {
  display: grid;
  grid-template-columns: 1fr 40px 1fr;
  gap: 12px;
  align-items: center;
}
.compare-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.compare-tag {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.compare-img {
  width: 100%;
  height: 320px;
  background: var(--el-fill-color-light);
  border-radius: 8px;
  border: 1px solid var(--el-border-color-lighter);
}
.compare-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-placeholder);
}
.choose-btn {
  width: 100%;
}
</style>
