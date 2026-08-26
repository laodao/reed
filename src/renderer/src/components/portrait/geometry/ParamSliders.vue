<template>
  <div class="param-sliders">
    <div class="ps-title">面容编辑</div>

    <div class="ps-group"><div class="ps-group-title">整体</div>
      <div v-for="item in groupOverall" :key="item.key" class="ps-row">
        <span class="ps-label">{{ item.label }}</span>
        <el-slider :model-value="toSlider(item.key)" :min="item.min" :max="item.max" :step="1"
          @update:model-value="setValue(item.key, $event)" />
        <span class="ps-val">{{ fmtVal(item.key) }}</span>
      </div>
    </div>

    <div class="ps-group"><div class="ps-group-title">纵向高度</div>
      <div v-for="item in groupVertical" :key="item.key" class="ps-row">
        <span class="ps-label">{{ item.label }}</span>
        <el-slider :model-value="toSlider(item.key)" :min="item.min" :max="item.max" :step="1"
          @update:model-value="setValue(item.key, $event)" />
        <span class="ps-val">{{ fmtVal(item.key) }}</span>
      </div>
    </div>

    <div class="ps-group"><div class="ps-group-title">横向宽度</div>
      <div v-for="item in groupHorizontal" :key="item.key" class="ps-row">
        <span class="ps-label">{{ item.label }}</span>
        <el-slider :model-value="toSlider(item.key)" :min="item.min" :max="item.max" :step="1"
          @update:model-value="setValue(item.key, $event)" />
        <span class="ps-val">{{ fmtVal(item.key) }}</span>
      </div>
    </div>

    <div class="ps-group"><div class="ps-group-title">五官精调</div>
      <div v-for="item in groupFeatures" :key="item.key" class="ps-row">
        <span class="ps-label">{{ item.label }}</span>
        <el-slider :model-value="toSlider(item.key)" :min="item.min" :max="item.max" :step="1"
          @update:model-value="setValue(item.key, $event)" />
        <span class="ps-val">{{ fmtVal(item.key) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { WarpParams } from './bandWarp'

interface ParamMeta {
  key: keyof WarpParams; label: string
  min: number; max: number; div: number; neutral: number
}
const props = withDefaults(defineProps<{ modelValue: WarpParams }>(), { modelValue: () => ({}) })
const emit = defineEmits<{ 'update:modelValue': [value: WarpParams] }>()

const groupOverall: ParamMeta[] = [
  { key: 'faceW', label: '脸宽', min: 80, max: 120, div: 100, neutral: 1 },
  { key: 'jaw', label: '下颌宽', min: 70, max: 115, div: 100, neutral: 1 },
  { key: 'eye', label: '眼距', min: -15, max: 15, div: 100, neutral: 0 },
]
const groupVertical: ParamMeta[] = [
  { key: 'foreH', label: '上庭', min: 70, max: 130, div: 100, neutral: 1 },
  { key: 'eyeH', label: '眼部', min: 70, max: 130, div: 100, neutral: 1 },
  { key: 'noseH', label: '鼻部', min: 70, max: 130, div: 100, neutral: 1 },
  { key: 'philH', label: '人中', min: 60, max: 140, div: 100, neutral: 1 },
  { key: 'mouthH', label: '嘴部', min: 70, max: 130, div: 100, neutral: 1 },
  { key: 'chinH', label: '下巴', min: 70, max: 130, div: 100, neutral: 1 },
]
const groupHorizontal: ParamMeta[] = [
  { key: 'bridgeW', label: '鼻梁宽', min: 70, max: 130, div: 100, neutral: 1 },
  { key: 'alaW', label: '鼻翼宽', min: 70, max: 130, div: 100, neutral: 1 },
  { key: 'philW', label: '人中宽', min: 70, max: 130, div: 100, neutral: 1 },
  { key: 'mouthW', label: '嘴宽', min: 75, max: 130, div: 100, neutral: 1 },
  { key: 'chinW', label: '下巴宽', min: 70, max: 130, div: 100, neutral: 1 },
  { key: 'cheekW', label: '颧骨宽', min: 85, max: 120, div: 100, neutral: 1 },
]
const groupFeatures: ParamMeta[] = [
  { key: 'eyeSize', label: '眼睛大小', min: 70, max: 140, div: 100, neutral: 1 },
  { key: 'eyeTilt', label: '眼角上扬', min: -25, max: 25, div: 100, neutral: 0 },
  { key: 'eyeLen', label: '眼睛拉长', min: 85, max: 120, div: 100, neutral: 1 },
  { key: 'noseTipLift', label: '鼻尖上翘', min: -1, max: 1, div: 100, neutral: 0 },
  { key: 'noseTipSize', label: '鼻尖大小', min: 80, max: 120, div: 100, neutral: 1 },
  { key: 'lip', label: '嘴唇厚薄', min: 60, max: 160, div: 100, neutral: 1 },
  { key: 'cupidH', label: '唇峰高低', min: -15, max: 15, div: 1000, neutral: 0 },
  { key: 'mouthCorner', label: '嘴角上扬', min: -2, max: 2, div: 100, neutral: 0 },
  { key: 'cheekUp', label: '颧骨高低', min: -2, max: 2, div: 100, neutral: 0 },
  { key: 'cheekProject', label: '颧骨突起', min: -15, max: 25, div: 100, neutral: 0 },
]
const allItems = [...groupOverall, ...groupVertical, ...groupHorizontal, ...groupFeatures]
const metaMap = new Map<string, ParamMeta>(allItems.map(m => [m.key as string, m]))

function getMeta(key: keyof WarpParams): ParamMeta | undefined { return metaMap.get(key as string) }
function toSlider(key: keyof WarpParams) { const m = getMeta(key); return Math.round((props.modelValue[key] ?? m?.neutral ?? 0) * (m?.div ?? 100)) }
function setValue(key: keyof WarpParams, sv: number) { const m = getMeta(key); emit('update:modelValue', { ...props.modelValue, [key]: sv / (m?.div ?? 100) }) }
function fmtVal(key: keyof WarpParams) { const m = getMeta(key); const raw = props.modelValue[key] ?? m?.neutral ?? 0; return (raw * (m?.div ?? 100)).toFixed(0) }
</script>

<style lang="scss" scoped>
.param-sliders { background: var(--fill-color-light); border-radius: var(--radius-md); padding: 10px 12px; height: 100%; overflow-y: auto; }
.ps-title { font-size: 12px; font-weight: 600; color: var(--text-primary); margin-bottom: 6px; }
.ps-group { margin-bottom: 6px; &:last-of-type { margin-bottom: 0; } }
.ps-group-title { font-size: 10.5px; color: var(--color-primary, #6c8cd9); margin-bottom: 2px; font-weight: 500; letter-spacing: 0.3px; }
.ps-row { display: grid; grid-template-columns: 50px 1fr 32px; align-items: center; gap: 6px; margin-bottom: 1px; }
.ps-label { font-size: 11px; color: var(--text-regular); text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ps-val { font-size: 10.5px; color: var(--text-secondary); text-align: center; font-feature-settings: 'tnum'; }
</style>
