<template>
  <el-select
    :model-value="modelValue"
    style="width: 100%"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <el-option-group v-for="group in groups" :key="group.key" :label="group.label">
      <el-option
        v-for="size in group.items"
        :key="size.value"
        :label="size.label"
        :value="size.value"
      />
    </el-option-group>
  </el-select>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { MAINSTREAM_PORTRAIT_SIZES } from '../../../../../shared/types/portrait.types'

/**
 * 尺寸下拉（spec 2026-07-24 D8b）：
 * 竖版/方形/横版分组，候选 = 模型 supportedSizes ∪ MAINSTREAM_PORTRAIT_SIZES（去重）。
 */
const props = withDefaults(defineProps<{
  modelValue: string
  /** 当前模型 supportedSizes（'WxH' 数组），与主流分辨率取并集 */
  modelSizes?: string[]
}>(), {
  modelSizes: () => []
})

defineEmits<{
  'update:modelValue': [value: string]
}>()

interface SizeItem { value: string; label: string }

/** 计算宽高比（约分） */
function ratioOf(value: string): string {
  const [w, h] = value.split('x').map(Number)
  if (!w || !h) return ''
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
  const g = gcd(w, h)
  return `${w / g}:${h / g}`
}

function groupOf(value: string): 'portrait' | 'square' | 'landscape' {
  const [w, h] = value.split('x').map(Number)
  if (w === h) return 'square'
  return w > h ? 'landscape' : 'portrait'
}

const groups = computed(() => {
  // 候选 = 主流分辨率 ∪ 模型支持尺寸（去重）
  const map = new Map<string, SizeItem>()
  for (const s of MAINSTREAM_PORTRAIT_SIZES) {
    map.set(s.value, { value: s.value, label: `${s.value.replace('x', '×')}（${s.ratio}）` })
  }
  for (const value of props.modelSizes ?? []) {
    if (!map.has(value)) {
      const ratio = ratioOf(value)
      map.set(value, { value, label: ratio ? `${value.replace('x', '×')}（${ratio}）` : value.replace('x', '×') })
    }
  }

  const defs = [
    { key: 'portrait', label: '竖版', items: [] as SizeItem[] },
    { key: 'square', label: '方形', items: [] as SizeItem[] },
    { key: 'landscape', label: '横版', items: [] as SizeItem[] }
  ]
  const byKey = Object.fromEntries(defs.map(d => [d.key, d]))
  for (const item of map.values()) {
    byKey[groupOf(item.value)].items.push(item)
  }
  return defs.filter(d => d.items.length > 0)
})
</script>
