<template>
  <el-dialog
    :model-value="modelValue"
    title="📐 面容几何工作室"
    width="880px"
    :close-on-click-modal="false"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="studio-body">
      <!-- 检测中 -->
      <div v-if="detecting" class="studio-status">
        <el-icon class="is-loading"><Loading /></el-icon>
        <span>正在检测面容关键点...</span>
      </div>

      <!-- 检测失败（降级） -->
      <div v-else-if="failure" class="studio-status failure">
        <div class="fail-ico">😶‍🌫️</div>
        <p>{{ failure.message }}</p>
        <el-button size="small" @click="runDetect">重试</el-button>
      </div>

      <!-- 主体 -->
      <div v-else-if="landmarks.length && metrics" class="studio-main">
        <div class="studio-left">
          <div class="preview-switch">
            <el-switch
              v-model="showWarped"
              :disabled="!hasParams"
              inline-prompt
              active-text="变形"
              inactive-text="原图"
            />
          </div>
          <FaceAnnotator
            :image-src="displaySrc"
            :landmarks="displayLandmarks"
            :metrics="displayMetrics"
          />
        </div>
        <div class="studio-right">
          <MetricsPanel :metrics="displayMetrics" :changed-keys="changedKeys" />
          <div v-if="remeasuredMetrics" class="remeasure-tag">✓ 已复测：AI 结果 vs 目标</div>
          <ParamSliders v-model="warpParams" />
          <div class="studio-actions">
            <el-button :disabled="!hasParams" @click="resetParams">↺ 重置</el-button>
            <el-button :loading="saving" :disabled="!hasParams" @click="saveAlgorithmic">
              用算法结果保存
            </el-button>
            <el-button type="primary" :loading="generating" :disabled="!hasParams" @click="aiGenerate">
              ✨ AI 生成
            </el-button>
          </div>
          <div class="studio-note" v-if="!hasParams">拖动参数滑块查看实时变形预览</div>
        </div>
      </div>
    </div>

    <!-- AI 生成结果对比确认（复用现有组件） -->
    <FaceCompareDialog
      v-model="showCompare"
      :original-src="variant.imagePath"
      :new-variant="aiResultVariant"
      @keep="onAiKeep"
      @discarded="onAiDone"
    />
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import FaceAnnotator from './FaceAnnotator.vue'
import MetricsPanel from './MetricsPanel.vue'
import ParamSliders from './ParamSliders.vue'
import FaceCompareDialog from '../workbench/FaceCompareDialog.vue'
import { detectFaceLandmarks, isDetectFailure, type DetectFailure } from './useFaceLandmarks'
import { computeFaceMetrics, type Point, type FaceMetrics } from './faceMetrics'
import { warpFaceBands, transformLandmarks, type WarpParams } from './bandWarp'
import { buildFaceEditPrompt } from './paramPrompt'
import type { PortraitVariant } from '../../../../../shared/types/portrait.types'

/**
 * 面容几何工作室（spec §F5）：
 * 检测 + 标注 + 指标 + 实时变形预览（P3）+ 算法保存/双通道 AI 生成/复测（P4）。
 */
const props = defineProps<{
  modelValue: boolean
  variant: PortraitVariant
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  saved: []
}>()

const detecting = ref(false)
const failure = ref<DetectFailure | null>(null)
const landmarks = ref<Point[]>([])
const metrics = ref<FaceMetrics | null>(null)
const imageSrc = ref('')

// ---- 变形预览（P3） ----
const warpParams = ref<WarpParams>({})
const showWarped = ref(false)
const warpedSrc = ref('')
const sourceImage = ref<HTMLImageElement | null>(null)

const hasParams = computed(() =>
  Object.values(warpParams.value).some(v => typeof v === 'number' && v !== 0),
)

// 展示源：有参数且切到变形预览时用变形结果
const useWarp = computed(() => hasParams.value && showWarped.value && !!warpedSrc.value)
const displaySrc = computed(() => (useWarp.value ? warpedSrc.value : imageSrc.value))
const displayLandmarks = computed(() =>
  useWarp.value ? transformLandmarks(landmarks.value, warpParams.value) : landmarks.value,
)
const displayMetrics = computed<FaceMetrics>(() =>
  useWarp.value
    ? computeFaceMetrics(transformLandmarks(landmarks.value, warpParams.value))
    : metrics.value!,
)

function loadSourceImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = url
  })
}

/** 参数变化 → 实时重算变形（单次合成 <16ms，input 连续触发） */
function rebuildPreview() {
  if (!sourceImage.value || !hasParams.value) {
    warpedSrc.value = ''
    return
  }
  // 预览降采样（1/4 分辨率）保证实时性；保存时另用全量渲染
  const canvas = warpFaceBands(sourceImage.value, landmarks.value, warpParams.value, { scale: 0.25 })
  warpedSrc.value = canvas.toDataURL('image/png')
  // 有参数时自动切到变形预览
  showWarped.value = true
}

watch(warpParams, rebuildPreview, { deep: true })

function resetParams() {
  warpParams.value = {}
  warpedSrc.value = ''
  showWarped.value = false
}

// ---- P4：算法保存 / AI 双通道生成 / 复测 ----
const saving = ref(false)
const generating = ref(false)
const showCompare = ref(false)
const aiResultVariant = ref<PortraitVariant | null>(null)
const remeasuredMetrics = ref<FaceMetrics | null>(null)
const changedKeys = ref<Set<string>>(new Set())

/** 变形预览 dataURL（空则提示先调参数） */
function requireWarped(): string | null {
  if (!warpedSrc.value) {
    ElMessage.warning('请先拖动参数生成变形预览')
    return null
  }
  return warpedSrc.value
}

/** 用算法结果保存（零 AI 成本） */
async function saveAlgorithmic() {
  if (!sourceImage.value || !hasParams.value) {
    ElMessage.warning('请先拖动参数生成变形预览')
    return
  }
  saving.value = true
  try {
    // 保存用全量渲染（预览为降采样，保存需清晰）
    const canvas = warpFaceBands(sourceImage.value, landmarks.value, warpParams.value, { scale: 1 })
    const dataUrl = canvas.toDataURL('image/png')
    const result = await window.electronAPI.portrait.saveFaceVariant({
      characterId: props.variant.characterId,
      sourceVariantId: props.variant.id,
      dataUrl,
      faceParams: { ...warpParams.value },
    })
    if (result.success) {
      ElMessage.success('已保存为面部变体（原图未改动）')
      emit('update:modelValue', false)
      emit('saved')
    } else {
      ElMessage.error(result.error || '保存失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '保存失败')
  } finally {
    saving.value = false
  }
}

/** AI 生成（双通道：文字参数短语 + 变形预览图作第二参考图） */
async function aiGenerate() {
  const warpedUrl = requireWarped()
  if (!warpedUrl) return
  const facePrompt = buildFaceEditPrompt(warpParams.value, displayMetrics.value)
  if (!facePrompt) {
    ElMessage.warning('请先拖动参数')
    return
  }
  generating.value = true
  try {
    const result = await window.electronAPI.portrait.editFace({
      characterId: props.variant.characterId,
      variantId: props.variant.id,
      facePrompt,
      // 通道②：变形预览图（service 自动将原图置首为身份锚点）
      referenceImages: [warpedUrl],
    })
    if (result.success && result.data) {
      aiResultVariant.value = result.data
      showCompare.value = true
    } else {
      ElMessage.error(result.error || '生成失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '生成失败')
  } finally {
    generating.value = false
  }
}

/** AI 结果保留 → 自动复测指标（spec §8-4：前后对比显示） */
async function onAiKeep() {
  const v = aiResultVariant.value
  aiResultVariant.value = null
  if (v?.imagePath) {
    try {
      const url = v.imagePath.startsWith('local-image://') || v.imagePath.startsWith('http')
        ? v.imagePath
        : `local-image://${v.imagePath.replace(/^\//, '')}`
      const result = await detectFaceLandmarks(url, v.id)
      if (!isDetectFailure(result)) {
        const newMetrics = computeFaceMetrics(result.landmarks)
        remeasuredMetrics.value = newMetrics
        // 高亮变化项（占比变化 ≥1%）
        const changed = new Set<string>()
        if (metrics.value) {
          if (Math.abs(newMetrics.midThird.pct - metrics.value.midThird.pct) >= 1) changed.add('mid')
          if (Math.abs(newMetrics.lowerThird.pct - metrics.value.lowerThird.pct) >= 1) changed.add('lower')
        }
        changedKeys.value = changed
        ElMessage.success(`复测完成：中庭 ${metrics.value?.midThird.pct}% → ${newMetrics.midThird.pct}%`)
      }
    } catch (error) {
      console.warn('[FaceGeometryStudio] 复测失败（不阻断）:', error)
    }
  }
  emit('saved')
}

function onAiDone() {
  aiResultVariant.value = null
  emit('saved')
}

async function runDetect() {
  detecting.value = true
  failure.value = null
  landmarks.value = []
  metrics.value = null
  warpedSrc.value = ''
  showWarped.value = false
  imageSrc.value = props.variant.imagePath

  try {
    const [result, img] = await Promise.all([
      detectFaceLandmarks(props.variant.imagePath, props.variant.id),
      loadSourceImage(props.variant.imagePath),
    ])
    sourceImage.value = img
    detecting.value = false

    if (isDetectFailure(result)) {
      failure.value = result
      return
    }
    landmarks.value = result.landmarks
    metrics.value = computeFaceMetrics(result.landmarks)
  } catch {
    detecting.value = false
    failure.value = { reason: 'detect_failed', message: '图片加载失败，请重试' }
  }
}

watch(() => props.modelValue, (open) => {
  if (open) runDetect()
})
</script>

<style lang="scss" scoped>
.studio-body {
  min-height: 320px;
}

.studio-status {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 60px 20px;
  color: var(--text-secondary);

  &.failure {
    color: var(--text-regular);

    .fail-ico {
      font-size: 44px;
      opacity: 0.6;
    }
  }
}

.studio-main {
  display: grid;
  grid-template-columns: 1fr 260px;
  gap: 18px;
  align-items: start;
}

.studio-left {
  display: flex;
  justify-content: center;
}

.studio-right {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.studio-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;

  .el-button + .el-button {
    margin-left: 0;
  }
}

.studio-note {
  font-size: 11.5px;
  color: var(--text-placeholder);
  text-align: center;
}
</style>

<style lang="scss" scoped>
.preview-switch {
  margin-bottom: 10px;
  display: flex;
  justify-content: flex-end;
}
</style>

<style lang="scss" scoped>
.remeasure-tag {
  font-size: 11.5px;
  color: var(--color-success);
  background: var(--color-success-light-9, #f0f9eb);
  border-radius: var(--radius-sm);
  padding: 5px 10px;
  text-align: center;
}
</style>
