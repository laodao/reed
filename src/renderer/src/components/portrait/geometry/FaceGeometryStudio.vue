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

      <!-- 中：图像 + 指标 + 按钮 -->
      <div class="studio-center">
        <FaceAnnotator
          :image-src="displaySrc"
          :landmarks="displayLandmarks"
          :metrics="displayMetrics"
        />
        <MetricsPanel :metrics="displayMetrics" :changed-keys="changedKeys" />
        <div class="center-actions">
          <el-button :disabled="!hasParams" @click="resetParams" size="small">重置</el-button>
          <el-button :loading="saving" :disabled="!hasParams" @click="saveAsNew" size="small">另存为新变体</el-button>
          <el-button :loading="overwriting" :disabled="!hasParams" @click="overwrite" size="small" type="warning">覆盖原图</el-button>
          <el-button :loading="prompting" :disabled="!hasParams" @click="copyPrompt" size="small">复制 AI 提示词</el-button>
          <el-button type="primary" :loading="generating" :disabled="!hasParams" @click="aiGenerate" size="small">AI 生成</el-button>
        </div>
        <div v-if="remeasuredMetrics" class="remeasure-tag">已复测：AI 结果 vs 目标</div>
      </div>

      <!-- 右：滑块 -->
      <div class="studio-right">
        <div v-if="!hasParams" class="studio-note">拖动参数滑块查看实时变形预览</div>
        <ParamSliders v-model="warpParams" />
      </div>
    </div>

    <!-- AI 结果对比 -->
    <FaceCompareDialog v-model="showCompare" :original-src="variant.imagePath" :new-variant="aiResultVariant" @keep="onAiKeep" @discarded="onAiDone" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import FaceAnnotator from './FaceAnnotator.vue'
import MetricsPanel from './MetricsPanel.vue'
import ParamSliders from './ParamSliders.vue'
import MakeupPanel from './MakeupPanel.vue'
import FaceCompareDialog from '../workbench/FaceCompareDialog.vue'
import { detectFaceLandmarks, isDetectFailure, type DetectFailure } from './useFaceLandmarks'
import { computeFaceMetrics, type Point, type FaceMetrics } from './faceMetrics'
import { warpFaceBands, transformLandmarks, type WarpParams } from './bandWarp'
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
const warpedSrc = ref('')
const makeupState = ref<MakeupState>(defaultMakeup())

const NEUTRAL: Record<string, number> = {
  faceW: 1, jaw: 1, eye: 0,
  foreH: 1, eyeH: 1, noseH: 1, philH: 1, mouthH: 1, chinH: 1,
  bridgeW: 1, alaW: 1, philW: 1, mouthW: 1, chinW: 1, cheekW: 1,
  eyeSize: 1, eyeTilt: 0, eyeLen: 1,
  noseTipLift: 0, noseTipSize: 1,
  lip: 1, cupidH: 0, mouthCorner: 0, cheekUp: 0, cheekProject: 0,
}
const hasParams = computed(() =>
  Object.entries(warpParams.value).some(([k, v]) =>
    typeof v === 'number' && Math.abs((v as number) - (NEUTRAL[k] ?? 0)) > 0.001,
  ),
)

// 始终显示变形结果
const displaySrc = computed(() => warpedSrc.value || imageSrc.value)
const displayLandmarks = computed(() =>
  hasParams.value ? transformLandmarks(landmarks.value, warpParams.value) : landmarks.value,
)
const displayMetrics = computed<FaceMetrics>(() =>
  hasParams.value
    ? computeFaceMetrics(transformLandmarks(landmarks.value, warpParams.value))
    : metrics.value!,
)

function loadSourceImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image(); img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img); img.onerror = () => reject(new Error('图片加载失败'))
    img.src = url
  })
}

function rebuildPreview() {
  if (!sourceImage.value) { warpedSrc.value = ''; return }
  try {
    const canvas = warpFaceBands(sourceImage.value, landmarks.value, warpParams.value, {
      scale: 0.25,
      makeup: makeupState.value,
    })
    warpedSrc.value = canvas.toDataURL('image/png')
  } catch (e) { console.warn('[FaceGeometryStudio] warp 失败:', e) }
}
watch([warpParams, makeupState], rebuildPreview, { deep: true })

function resetParams() { warpParams.value = {}; makeupState.value = defaultMakeup() }

// ---- 保存 ----
const saving = ref(false); const overwriting = ref(false)
const generating = ref(false); const prompting = ref(false)

async function renderFull(): Promise<string | null> {
  if (!sourceImage.value) { ElMessage.warning('图片未加载'); return null }
  const canvas = warpFaceBands(sourceImage.value, landmarks.value, warpParams.value, {
    scale: 1,
    makeup: makeupState.value,
  })
  return canvas.toDataURL('image/png')
}

async function saveAsNew() {
  saving.value = true
  try {
    const dataUrl = await renderFull(); if (!dataUrl) return
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
    const dataUrl = await renderFull(); if (!dataUrl) return
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
    const dataUrl = await renderFull(); if (!dataUrl) return
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
  landmarks.value = []; metrics.value = null; warpedSrc.value = ''
  imageSrc.value = props.variant.imagePath
  try {
    const [result, img] = await Promise.all([
      detectFaceLandmarks(props.variant.imagePath, props.variant.id),
      loadSourceImage(props.variant.imagePath),
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
.studio-page { height: 100%; display: flex; flex-direction: column; overflow: hidden; }
.studio-status {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 12px; padding: 60px 20px; color: var(--text-secondary);
  &.failure { color: var(--text-regular); .fail-ico { font-size: 44px; opacity: 0.6; } }
}
.studio-layout {
  display: grid; grid-template-columns: 200px 1fr 240px; gap: 14px;
  align-items: start; height: 100%; overflow: hidden;
}
.studio-left {
  overflow-y: auto; height: 100%;
  border-right: 1px solid var(--border-color-light, #e4e7ed);
  padding-right: 8px;
}
.studio-center {
  display: flex; flex-direction: column; gap: 8px; overflow: hidden; height: 100%;
  :deep(.base-img) { max-height: 55vh; object-fit: contain; }
  :deep(.annotator) { max-height: 55vh; }
}
.studio-right {
  display: flex; flex-direction: column; gap: 8px;
  overflow-y: auto; height: 100%;
  border-left: 1px solid var(--border-color-light, #e4e7ed);
  padding-left: 8px;
}
.center-actions {
  display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; padding: 4px 0; flex-shrink: 0;
}
.studio-note { font-size: 11.5px; color: var(--text-placeholder); text-align: center; margin-bottom: 6px; flex-shrink: 0; }
.remeasure-tag {
  font-size: 11.5px; color: var(--color-success);
  background: var(--color-success-light-9, #f0f9eb);
  border-radius: var(--radius-sm); padding: 5px 10px; text-align: center; flex-shrink: 0;
}
</style>
