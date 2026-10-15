<template>
  <div class="makeup-panel">
    <div class="mp-title">妆造</div>

    <!-- 口红 -->
    <div class="mp-section">
      <div class="mp-section-title">口红</div>
      <div class="mp-opacity">
        <span>浓度</span><el-slider v-model="lipAlpha" :min="0" :max="100" :step="5" size="small" @update:model-value="updateLip" />
      </div>
      <div class="mp-swatches">
        <span v-for="c in presets.lip" :key="c[1]" class="mp-swatch"
          :class="{ active: modelValue.lip?.color === c[1] }"
          :style="{ background: c[1] }" :title="c[0]" @click="setLip(c)" />
        <span class="mp-swatch none" @click="clearLip">x</span>
      </div>
    </div>

    <!-- 眼线 -->
    <div class="mp-section">
      <div class="mp-section-title">眼线</div>
      <div class="mp-opacity">
        <span>浓度</span><el-slider v-model="linerAlpha" :min="0" :max="100" :step="5" size="small" @update:model-value="updateLiner" />
      </div>
      <div class="mp-swatches">
        <span v-for="c in presets.liner" :key="c[1]" class="mp-swatch"
          :class="{ active: modelValue.liner?.color === c[1] }"
          :style="{ background: c[1] }" :title="c[0]" @click="setLiner(c)" />
        <span class="mp-swatch none" @click="clearLiner">x</span>
      </div>
      <div class="mp-chips">
        <span v-for="[label, val] in LINER_STYLES" :key="val" class="mp-chip"
          :class="{ active: (modelValue.liner?.style || 'natural') === val }"
          @click="setLinerStyle(val)">{{ label }}</span>
      </div>
    </div>

    <!-- 腮红 -->
    <div class="mp-section">
      <div class="mp-section-title">腮红</div>
      <div class="mp-opacity">
        <span>浓度</span><el-slider v-model="blushAlpha" :min="0" :max="100" :step="5" size="small" @update:model-value="updateBlush" />
      </div>
      <div class="mp-swatches">
        <span v-for="c in presets.blush" :key="c[1]" class="mp-swatch"
          :class="{ active: modelValue.blush?.color === c[1] }"
          :style="{ background: c[1] }" :title="c[0]" @click="setBlush(c)" />
        <span class="mp-swatch none" @click="clearBlush">x</span>
      </div>
      <div class="mp-chips">
        <span v-for="[label, val] in BLUSH_POS" :key="val" class="mp-chip"
          :class="{ active: (modelValue.blush?.pos || 'apple') === val }"
          @click="setBlushPos(val)">{{ label }}</span>
      </div>
    </div>

    <!-- 眉色 -->
    <div class="mp-section">
      <div class="mp-section-title">眉色</div>
      <div class="mp-opacity">
        <span>浓度</span><el-slider v-model="browAlpha" :min="0" :max="100" :step="5" size="small" @update:model-value="updateBrow" />
      </div>
      <div class="mp-swatches">
        <span v-for="c in presets.brow" :key="c[1]" class="mp-swatch"
          :class="{ active: modelValue.brow?.color === c[1] }"
          :style="{ background: c[1] }" :title="c[0]" @click="setBrow(c)" />
        <span class="mp-swatch none" @click="clearBrow">x</span>
      </div>
    </div>

    <!-- 修容 -->
    <div class="mp-section">
      <div class="mp-section-title">修容</div>
      <div class="mp-opacity">
        <span>浓度</span><el-slider v-model="contourAlpha" :min="0" :max="100" :step="5" size="small" @update:model-value="updateContour" />
      </div>
      <div class="mp-swatches">
        <span v-for="c in presets.contour" :key="c[1]" class="mp-swatch"
          :class="{ active: modelValue.contour?.shade?.[0] === c[0] }"
          :style="{ background: c[1] }" :title="c[0]" @click="setContour(c)" />
        <span class="mp-swatch none" @click="clearContour">x</span>
      </div>
      <div class="mp-chips">
        <span v-for="[label, key] in CONTOUR_PARTS" :key="key" class="mp-chip"
          :class="{ active: !!modelValue.contour?.parts?.[key] }"
          @click="toggleContourPart(key)">{{ label }}</span>
      </div>
    </div>

    <!-- 底妆 -->
    <div class="mp-section">
      <div class="mp-section-title">底妆</div>
      <div class="mp-opacity">
        <span>浓度</span><el-slider v-model="foundAlpha" :min="0" :max="100" :step="5" size="small" @update:model-value="updateFound" />
      </div>
      <div class="mp-swatches">
        <span v-for="c in presets.foundation" :key="c[1]" class="mp-swatch"
          :class="{ active: modelValue.foundation?.tone === c[1] }"
          :style="{ background: c[1] }" :title="c[0]" @click="setFound(c)" />
        <span class="mp-swatch none" @click="clearFound">x</span>
      </div>
      <div class="mp-opacity">
        <span>磨皮</span><el-slider v-model="foundSmooth" :min="0" :max="100" :step="5" size="small" @update:model-value="updateFoundSmooth" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import {
  PRESETS,
  CONTOUR_DEFAULT,
  BLUSH_POS,
  LINER_STYLES,
  CONTOUR_PARTS,
  type MakeupState,
} from './makeupRenderer'

const props = defineProps<{ modelValue: MakeupState }>()
const emit = defineEmits<{ 'update:modelValue': [value: MakeupState] }>()

const presets = PRESETS

// 各项浓度（0-100，与 0-1 互转）
const lipAlpha = ref(Math.round((props.modelValue.lip?.alpha ?? 0) * 100))
const blushAlpha = ref(Math.round((props.modelValue.blush?.alpha ?? 0) * 100))
const browAlpha = ref(Math.round((props.modelValue.brow?.alpha ?? 0) * 100))
const linerAlpha = ref(Math.round((props.modelValue.liner?.alpha ?? 0) * 100))
const contourAlpha = ref(Math.round((props.modelValue.contour?.alpha ?? 0) * 100))
const foundAlpha = ref(Math.round((props.modelValue.foundation?.alpha ?? 0) * 100))
const foundSmooth = ref(Math.round((props.modelValue.foundation?.smooth ?? 0) * 100))

function emitUpdate(patch: Partial<MakeupState>) {
  emit('update:modelValue', { ...props.modelValue, ...patch })
}

// ── 口红 ──
function setLip(c: readonly [string, string]) {
  lipAlpha.value = 60; emitUpdate({ lip: { color: c[1], alpha: 0.6 } })
}
function clearLip() { lipAlpha.value = 0; emitUpdate({ lip: { color: null, alpha: 0 } }) }
function updateLip(v: number) {
  emitUpdate({ lip: { color: props.modelValue.lip?.color ?? null, alpha: v / 100 } })
}

// ── 眼线 ──
function setLiner(c: readonly [string, string]) {
  linerAlpha.value = 75
  emitUpdate({ liner: { color: c[1], alpha: 0.75, style: props.modelValue.liner?.style || 'natural' } })
}
function clearLiner() { linerAlpha.value = 0; emitUpdate({ liner: { color: null, alpha: 0, style: 'natural' } }) }
function updateLiner(v: number) {
  emitUpdate({ liner: { color: props.modelValue.liner?.color ?? null, alpha: v / 100, style: props.modelValue.liner?.style || 'natural' } })
}
function setLinerStyle(style: string) {
  const cur = props.modelValue.liner
  emitUpdate({ liner: { color: cur?.color ?? null, alpha: cur?.alpha || 0.75, style } })
  if (!cur?.alpha) linerAlpha.value = 75
}

// ── 腮红 ──
function setBlush(c: readonly [string, string]) {
  blushAlpha.value = 50
  emitUpdate({ blush: { color: c[1], alpha: 0.5, pos: props.modelValue.blush?.pos || 'apple' } })
}
function clearBlush() { blushAlpha.value = 0; emitUpdate({ blush: { color: null, alpha: 0, pos: 'apple' } }) }
function updateBlush(v: number) {
  emitUpdate({ blush: { color: props.modelValue.blush?.color ?? null, alpha: v / 100, pos: props.modelValue.blush?.pos || 'apple' } })
}
function setBlushPos(pos: string) {
  const cur = props.modelValue.blush
  emitUpdate({ blush: { color: cur?.color ?? null, alpha: cur?.alpha || 0.5, pos } })
  if (!cur?.alpha) blushAlpha.value = 50
}

// ── 眉色 ──
function setBrow(c: readonly [string, string]) {
  browAlpha.value = 55; emitUpdate({ brow: { color: c[1], alpha: 0.55 } })
}
function clearBrow() { browAlpha.value = 0; emitUpdate({ brow: { color: null, alpha: 0 } }) }
function updateBrow(v: number) {
  emitUpdate({ brow: { color: props.modelValue.brow?.color ?? null, alpha: v / 100 } })
}

// ── 修容 ──
function setContour(c: readonly [string, string, string]) {
  contourAlpha.value = 55
  emitUpdate({ contour: { shade: c, alpha: 0.55, parts: { ...(props.modelValue.contour?.parts || CONTOUR_DEFAULT) } } })
}
function clearContour() { contourAlpha.value = 0; emitUpdate({ contour: { shade: null, alpha: 0, parts: { ...CONTOUR_DEFAULT } } }) }
function updateContour(v: number) {
  emitUpdate({ contour: { shade: props.modelValue.contour?.shade ?? null, alpha: v / 100, parts: { ...(props.modelValue.contour?.parts || CONTOUR_DEFAULT) } } })
}
function toggleContourPart(key: string) {
  const parts = { ...(props.modelValue.contour?.parts || CONTOUR_DEFAULT) }
  parts[key] = !parts[key]
  const shade = props.modelValue.contour?.shade ?? null
  const alpha = props.modelValue.contour?.alpha || 0.55
  if (!props.modelValue.contour?.alpha) contourAlpha.value = 55
  emitUpdate({ contour: { shade, alpha, parts } })
}

// ── 底妆 ──
function setFound(c: readonly [string, string]) {
  foundAlpha.value = 50
  emitUpdate({ foundation: { tone: c[1], alpha: 0.5, smooth: props.modelValue.foundation?.smooth || 0 } })
}
function clearFound() { foundAlpha.value = 0; emitUpdate({ foundation: { tone: null, alpha: 0, smooth: props.modelValue.foundation?.smooth || 0 } }) }
function updateFound(v: number) {
  emitUpdate({ foundation: { tone: props.modelValue.foundation?.tone ?? null, alpha: v / 100, smooth: props.modelValue.foundation?.smooth || 0 } })
}
function updateFoundSmooth(v: number) {
  emitUpdate({ foundation: { tone: props.modelValue.foundation?.tone ?? null, alpha: props.modelValue.foundation?.alpha || 0, smooth: v / 100 } })
}
</script>

<style lang="scss" scoped>
.makeup-panel { padding: 8px 4px; }
.mp-title { font-size: 13px; font-weight: 600; color: var(--text-primary); margin-bottom: 10px; }
.mp-section { margin-bottom: 14px; }
.mp-section-title { font-size: 11.5px; color: var(--color-primary, #6c8cd9); margin-bottom: 4px; }
.mp-opacity { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--text-secondary); margin-bottom: 4px;
  span { flex: 0 0 28px; } .el-slider { flex: 1; }
}
.mp-swatches { display: flex; flex-wrap: wrap; gap: 4px; }
.mp-swatch {
  width: 18px; height: 18px; border-radius: 50%; border: 2px solid transparent;
  cursor: pointer; transition: transform 0.1s;
  &:hover { transform: scale(1.2); }
  &.active { border-color: var(--color-primary, #6c8cd9); box-shadow: 0 0 0 2px rgba(108,140,217,0.3); }
  &.none { background: #eee; color: #999; font-size: 10px; display: flex; align-items: center; justify-content: center; border: 1px solid #ddd; }
}
.mp-chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
.mp-chip {
  padding: 2px 8px; font-size: 11px; border-radius: 10px;
  background: var(--fill-color-light, #f0f0f0); color: var(--text-secondary);
  border: 1px solid transparent; cursor: pointer; user-select: none;
  &:hover { border-color: var(--color-primary, #6c8cd9); }
  &.active { background: var(--color-primary, #6c8cd9); color: #fff; }
}
</style>
