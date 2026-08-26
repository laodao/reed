<template>
  <div class="studio-page">
    <!-- 检测中/失败 -->
    <div v-if="detecting" class="studio-status"><el-icon class="is-loading"><Loading /></el-icon><span>正在检测面容关键点...</span></div>
    <div v-else-if="failure" class="studio-status failure"><div class="fail-ico">?</div><p>{{ failure.message }}</p><el-button size="small" @click="runDetect">重试</el-button></div>

    <!-- 主体：三栏布局 -->
    <div v-else-if="landmarks.length && metrics" class="studio-layout">
      <!-- 左：妆造 -->
      <div class="studio-left">
        <MakeupPanel v-model="makeupState" />
      </div>

      <!-- 中：图像 + 按钮 -->
      <div class="studio-center">
        <FaceAnnotator
          ref="annotatorRef"
          :image-src="imageSrc"
          :landmarks="landmarks"
          :warp-params="warpParams"
          :makeup-state="makeupState"
          :overlay-landmarks="displayLandmarks"
          :overlay-metrics="displayMetrics"
        />
        <div class="center-actions">
          <el-button :disabled="!hasMakeup" @click="resetMakeup" size="small">重置妆造</el-button>
          <el-button :disabled="!hasWarpParams" @click="resetFaceParams" size="small">重置面容</el-button>
          <el-button :loading="saving" :disabled="!hasAnyChange" @click="saveAsNew" size="small">另存为新变体</el-button>
          <el-button :loading="overwriting" :disabled="!hasAnyChange" @click="overwrite" size="small" type="warning">覆盖原图</el-button>
          <el-button :loading="prompting" :disabled="!hasWarpParams" @click="copyPrompt" size="small">复制 AI 提示词</el-button>
          <el-button type="primary" :loading="generating" :disabled="!hasWarpParams" @click="aiGenerate" size="small">AI 生成</el-button>
        </div>
        <div v-if="remeasuredMetrics" class="remeasure-tag">? 已复测：AI 结果 vs 目标</div>
      </div>

      <!-- 右：滑块 -->
      <div class="studio-right">
        <ParamSliders v-model="warpParams" />
      </div>
    </div>

    <!-- AI 结果对比 -->
    <FaceCompareDialog v-model="showCompare" :original-src="variant?.imagePath ?? ''" :new-variant="aiResultVariant" @keep="onAiKeep" @discarded="onAiDone" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import FaceAnnotator from './FaceAnnotator.vue'
import ParamSliders from './ParamSliders.vue'
import MakeupPanel from './MakeupPanel.vue'
import FaceCompareDialog from '../workbench/FaceCompareDialog.vue'
import { detectFaceLandmarks, isDetectFailure, type DetectFailure } from './useFaceLandmarks'
import { computeFaceMetrics, type Point, type FaceMetrics } from './faceMetrics'
import { transformLandmarks, type WarpParams } from './bandWarp'
import { buildFaceEditPrompt } from './paramPrompt'
import { defaultMakeup } from './makeupRenderer'
import type { MakeupState } from './makeupRenderer'
import type { PortraitVariant } from '../../../../../shared/types/portrait.types'

const props = defineProps<{ variant: PortraitVariant }>()
const emit = defineEmits<{ saved: [] }>()

// ---- 检测 ----
const detecting = ref(false)
const failure = ref<DetectFailure | null>(null)
const landmarks = ref<Point[]>([])
const metrics = ref<FaceMetrics | null>(null)
const imageSrc = ref('')
const sourceImage = ref<HTMLImageElement | null>(null)

// ---- 变形 ----
const warpParams = ref<WarpParams>({})
const makeupState = ref<MakeupState>(defaultMakeup())

const NEUTRAL: Record<string, number> = {
  faceW: 1, jaw: 1, eye: 0,
  foreH: 1, eyeH: 1, noseH: 1, philH: 1, mouthH: 1, chinH: 1,
  bridgeW: 1, alaW: 1, philW: 1, mouthW: 1, chinW: 1, cheekW: 1,
  eyeSize: 1, eyeTilt: 0, eyeLen: 1,
  noseTipLift: 0, noseTipSize: 1,
  lip: 1, cupidH: 0, mouthCorner: 0, cheekUp: 0, cheekProject: 0,
}
// 面容参数是否偏离中性（仅 warpParams）
const hasWarpParams = computed(() =>
  Object.entries(warpParams.value).some(([k, v]) =>
    typeof v === 'number' && Math.abs((v as number) - (NEUTRAL[k] ?? 0)) > 0.001,
  ),
)
// 妆造是否偏离默认（任一层有可见 alpha 且设置了颜色/色号）
const hasMakeup = computed(() => {
  const m = makeupState.value
  return !!(
    (m.lip?.alpha && m.lip.color) ||
    (m.liner?.alpha && m.liner.color) ||
    (m.blush?.alpha && m.blush.color) ||
    (m.brow?.alpha && m.brow.color) ||
    (m.contour?.alpha && m.contour.shade) ||
    m.foundation?.tone ||
    m.foundation?.smooth
  )
})
// 画面是否有任何改动（妆造或面容，决定保存/覆盖是否可点）
const hasAnyChange = computed(() => hasWarpParams.value || hasMakeup.value)

// 变形后关键点（landmarks 是像素坐标 -> 归一化变换 -> 转回像素，供 overlay 标注）
const displayLandmarks = computed(() => {
  if (!hasWarpParams.value || !sourceImage.value || !landmarks.value.length) return landmarks.value
  const srcW = sourceImage.value.naturalWidth
  const srcH = sourceImage.value.naturalHeight
  const normLM = landmarks.value.map(p => ({ x: p.x / srcW, y: p.y / srcH, z: p.z }))
  const transformed = transformLandmarks(normLM, warpParams.value)
  return transformed.map(p => ({ x: p.x * srcW, y: p.y * srcH, z: p.z }))
})
const displayMetrics = computed<FaceMetrics>(() =>
  hasWarpParams.value ? computeFaceMetrics(displayLandmarks.value) : metrics.value!,
)

function loadSourceImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image(); img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img); img.onerror = () => reject(new Error('图片加载失败'))
    img.src = url
  })
}

const annotatorRef = ref<InstanceType<typeof FaceAnnotator> | null>(null)

/** 重置妆造（仅清空妆容，保留面容滑块参数） */
function resetMakeup() { makeupState.value = defaultMakeup() }
/** 重置面容参数（仅清空滑块，保留妆容） */
function resetFaceParams() { warpParams.value = {} }

// ---- 保存 ----
const saving = ref(false); const overwriting = ref(false)
const generating = ref(false); const prompting = ref(false)

/** 全分辨率导出（交由 FaceAnnotator 的 WebGL 渲染器） */
function getExportDataUrl(): string | null {
  if (!annotatorRef.value) { ElMessage.warning('渲染未就绪'); return null }
  const url = annotatorRef.value.exportFull()
  if (!url) ElMessage.warning('图片未加载')
  return url
}

async function saveAsNew() {
  saving.value = true
  try {
    const dataUrl = getExportDataUrl(); if (!dataUrl) return
    const result = await window.electronAPI.portrait.saveFaceVariant({
      characterId: props.variant.characterId,
      sourceVariantId: props.variant.id,
      dataUrl,
      faceParams: { ...warpParams.value },
    })
    if (result.success) { ElMessage.success('已保存为新变体'); emit('saved') }
    else ElMessage.error(result.error || '保存失败')
  } catch (e: any) { ElMessage.error(e.message || '保存失败') }
  finally { saving.value = false }
}

async function overwrite() {
  overwriting.value = true
  try {
    const dataUrl = getExportDataUrl(); if (!dataUrl) return
    const result = await window.electronAPI.portrait.saveFaceVariant({
      characterId: props.variant.characterId,
      sourceVariantId: props.variant.id,
      dataUrl,
      faceParams: { ...warpParams.value },
      overwrite: true,
    })
    if (result.success) { ElMessage.success('已覆盖原图'); emit('saved') }
    else ElMessage.error(result.error || '覆盖失败')
  } catch (e: any) { ElMessage.error(e.message || '覆盖失败') }
  finally { overwriting.value = false }
}

async function copyPrompt() {
  prompting.value = true
  try {
    const prompt = buildFaceEditPrompt(warpParams.value, displayMetrics.value)
    if (!prompt) { ElMessage.warning('请先拖动参数'); return }
    await navigator.clipboard.writeText(prompt)
    ElMessage.success('AI 提示词已复制到剪贴板')
  } catch { ElMessage.warning('复制失败，请手动复制') }
  finally { prompting.value = false }
}

async function aiGenerate() {
  const facePrompt = buildFaceEditPrompt(warpParams.value, displayMetrics.value)
  if (!facePrompt) { ElMessage.warning('请先拖动参数'); return }
  generating.value = true
  try {
    const dataUrl = getExportDataUrl(); if (!dataUrl) return
    const result = await window.electronAPI.portrait.editFace({
      characterId: props.variant.characterId,
      variantId: props.variant.id,
      facePrompt,
      referenceImages: [dataUrl],
    })
    if (result.success && result.data) { aiResultVariant.value = result.data; showCompare.value = true }
    else ElMessage.error(result.error || '生成失败')
  } catch (e: any) { ElMessage.error(e.message || '生成失败') }
  finally { generating.value = false }
}

const showCompare = ref(false)
const aiResultVariant = ref<PortraitVariant | null>(null)
const remeasuredMetrics = ref<FaceMetrics | null>(null)
const changedKeys = ref<Set<string>>(new Set())

async function onAiKeep() {
  const v = aiResultVariant.value; aiResultVariant.value = null
  if (v?.imagePath) {
    try {
      const url = v.imagePath.startsWith('local-image://') || v.imagePath.startsWith('http') ? v.imagePath : `local-image://${v.imagePath.replace(/^\//, '')}`
      const result = await detectFaceLandmarks(url, v.id)
      if (!isDetectFailure(result)) {
        const newMetrics = computeFaceMetrics(result.landmarks)
        remeasuredMetrics.value = newMetrics
        const changed = new Set<string>()
        if (metrics.value) {
          if (Math.abs(newMetrics.midThird.pct - metrics.value.midThird.pct) >= 1) changed.add('mid')
          if (Math.abs(newMetrics.lowerThird.pct - metrics.value.lowerThird.pct) >= 1) changed.add('lower')
        }
        changedKeys.value = changed
      }
    } catch (e) { console.warn('[FaceGeometryStudio] 复测失败:', e) }
  }
  emit('saved')
}
function onAiDone() { aiResultVariant.value = null; emit('saved') }

async function runDetect() {
  detecting.value = true; failure.value = null
  landmarks.value = []; metrics.value = null
  // 防御：variant 缺失时给出友好错误，避免读取 null.imagePath 崩溃
  const src = props.variant?.imagePath
  if (!src) {
    detecting.value = false
    failure.value = { reason: 'missing_variant', message: '缺少变体图片，无法进行面容分析' }
    return
  }
  imageSrc.value = src
  try {
    const [result, img] = await Promise.all([
      detectFaceLandmarks(src, props.variant.id),
      loadSourceImage(src),
    ])
    sourceImage.value = img; detecting.value = false
    if (isDetectFailure(result)) { failure.value = result; return }
    landmarks.value = result.landmarks
    metrics.value = computeFaceMetrics(result.landmarks)
  } catch { detecting.value = false; failure.value = { reason: 'detect_failed', message: '图片加载失败，请重试' } }
}

onMounted(runDetect)
</script>

<style lang="scss" scoped>
.studio-page { height: 100%; display: flex; flex-direction: column; }
.studio-status {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 12px; padding: 60px 20px; color: var(--text-secondary);
  &.failure { color: var(--text-regular); .fail-ico { font-size: 44px; opacity: 0.6; } }
}
.studio-layout {
  display: grid; grid-template-columns: 220px 1fr 240px; gap: 14px;
  height: 100%; overflow: hidden;
  align-items: start;
}
.studio-left {
  overflow-y: auto; overflow-x: hidden; height: 100%; min-width: 0;
  border-right: 1px solid var(--border-color-light, #e4e7ed);
  padding: 0 8px 0 0;
}
.studio-center {
  display: flex; flex-direction: column; gap: 6px;
  min-width: 0; overflow: hidden; height: 100%;
  :deep(.annotator) { flex: 1; min-height: 0; width: 100%; overflow: hidden; }
}
.studio-right {
  display: flex; flex-direction: column; height: 100%; min-width: 0;
  overflow-y: auto; overflow-x: hidden;
  border-left: 1px solid var(--border-color-light, #e4e7ed);
  padding-left: 8px;
}
.center-actions {
  display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; padding: 4px 0; flex-shrink: 0;
}
.remeasure-tag {
  font-size: 11.5px; color: var(--color-success);
  background: var(--color-success-light-9, #f0f9eb);
  border-radius: var(--radius-sm); padding: 5px 10px; text-align: center; flex-shrink: 0;
}
</style>
