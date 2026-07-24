<template>
  <el-select
    :model-value="modelValue"
    :disabled="disabled"
    :placeholder="placeholder"
    class="size-selector"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <el-option
      v-for="size in options"
      :key="size.value"
      :label="size.label"
      :value="size.value"
    />
  </el-select>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { DEFAULT_PORTRAIT_SIZES } from '../../../../shared/types/portrait.types'

/**
 * 人像图片分辨率选择器（6 个生成/编辑入口共用）
 *
 * 候选尺寸来源（并集，去重）：
 *   1. 父级透传的 sizes（通常是当前模型的 supportedSizes）
 *   2. DEFAULT_PORTRAIT_SIZES（共享默认列表）
 * 采用并集而非替换，避免某模型 supportedSizes 较少时选项缩水。
 *
 * 候选数据由父级（CharacterEditor）统一通过 image.getProviders() 加载并注入，
 * 本组件不自己发 IPC，避免 6 个选择器各发一次请求。
 */
const props = withDefaults(
  defineProps<{
    /** 当前选中尺寸，格式 'WxH'，如 '768x1024' */
    modelValue: string
    /** 外部候选尺寸（如当前模型 supportedSizes）；不传则仅用默认列表 */
    sizes?: string[]
    disabled?: boolean
    placeholder?: string
  }>(),
  {
    sizes: () => [],
    disabled: false,
    placeholder: '选择图片尺寸',
  },
)

defineEmits<{
  'update:modelValue': [value: string]
}>()

interface SizeOption {
  label: string
  value: string
}

/**
 * 按 'WxH' 生成展示文案：宽×高 + 比例标注（竖版/横版/正方形）。
 * 人像以竖版全身为主，竖版标注"全身"提示更友好。
 */
function formatSizeLabel(size: string): string {
  const parts = size.split('x')
  const w = Number(parts[0])
  const h = Number(parts[1])
  if (!w || !h) return size
  let tag = ''
  if (h > w) tag = '竖版全身'
  else if (w > h) tag = '横版'
  else tag = '正方形'
  return `${w}×${h} (${tag})`
}

const options = computed<SizeOption[]>(() => {
  // 并集去重，保持插入顺序（外部 sizes 在前，默认列表补全在后）
  const merged = Array.from(new Set([...props.sizes, ...DEFAULT_PORTRAIT_SIZES]))
  return merged.map(s => ({ label: formatSizeLabel(s), value: s }))
})
</script>

<style lang="scss" scoped>
.size-selector {
  width: 100%;
}
</style>
