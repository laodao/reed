<template>
  <div class="param-sliders">
    <div class="ps-title">参数调整</div>
    <div v-for="item in items" :key="item.key" class="ps-row">
      <span class="ps-label">{{ item.label }}</span>
      <el-slider
        :model-value="valueOf(item.key)"
        :min="item.min"
        :max="item.max"
        :step="1"
        @update:model-value="setValue(item.key, $event)"
      />
      <span class="ps-val" :class="{ strong: Math.abs(valueOf(item.key)) > 10 }">
        {{ valueOf(item.key) > 0 ? '+' : '' }}{{ valueOf(item.key) }}%
      </span>
    </div>
    <div v-if="hasStrong" class="ps-warning">
      ⚠️ 变形幅度较大（>10%），预览可能有拉伸痕迹，建议用 AI 生成获得更自然效果
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { WarpParams } from './bandWarp'

/**
 * 参数滑块组（spec §F3）：
 * 中庭/下庭/脸长/下颌/眼距；超 ±10% 标黄提示。
 */
const props = withDefaults(defineProps<{
  modelValue: WarpParams
}>(), {
  modelValue: () => ({}),
})

const emit = defineEmits<{
  'update:modelValue': [value: WarpParams]
}>()

const items: { key: keyof WarpParams; label: string; min: number; max: number }[] = [
  { key: 'midface', label: '中庭', min: -15, max: 15 },
  { key: 'lowerface', label: '下庭', min: -15, max: 15 },
  { key: 'faceLength', label: '脸长', min: -10, max: 10 },
  { key: 'jaw', label: '下颌宽', min: -10, max: 10 },
  { key: 'eyeSpacing', label: '眼距', min: -8, max: 8 },
]

function valueOf(key: keyof WarpParams): number {
  return Math.round((props.modelValue[key] ?? 0) * 100)
}

function setValue(key: keyof WarpParams, v: number) {
  emit('update:modelValue', { ...props.modelValue, [key]: v / 100 })
}

const hasStrong = computed(() =>
  items.some(item => Math.abs(valueOf(item.key)) > 10),
)
</script>

<style lang="scss" scoped>
.param-sliders {
  background: var(--fill-color-light);
  border-radius: var(--radius-md);
  padding: 12px 14px;
}

.ps-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 10px;
}

.ps-row {
  display: grid;
  grid-template-columns: 52px 1fr 48px;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;

  &:last-of-type {
    margin-bottom: 0;
  }
}

.ps-label {
  font-size: 12.5px;
  color: var(--text-regular);
}

.ps-val {
  font-size: 12px;
  color: var(--text-secondary);
  text-align: right;
  font-feature-settings: 'tnum';

  &.strong {
    color: var(--color-warning);
    font-weight: 600;
  }
}

.ps-warning {
  margin-top: 8px;
  font-size: 11.5px;
  color: var(--color-warning);
  background: var(--color-warning-light-9, #fdf6ec);
  border-radius: var(--radius-sm);
  padding: 6px 10px;
}
</style>
