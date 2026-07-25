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
          <div class="preview-toggle">
            <span
              class="pt-tab"
              :class="{ active: !showWarped }"
              @click="showWarped = false"
            >原图</span>
            <span
              class="pt-tab"
              :class="{ active: showWarped }"
              @click="showWarped = true"
            >变形预览</span>
          </div>
          <FaceAnnotator
            :image-src="displaySrc"
            :landmarks="displayLandmarks"
            :metrics="displayMetrics"
          />
        </div>
        <div class="studio-right">
          <MetricsPanel :metrics="displayMetrics" />
          <ParamSliders v-model="warpParams" />
          <div class="studio-actions">
            <el-button :disabled="!hasParams" @click="resetParams">↺ 重置</el-button>
            <el-button :disabled="!hasParams" title="P4 阶段开放">用算法结果保存</el-button>
            <el-button type="primary" :disabled="!hasParams" title="P4 阶段开放">✨ AI 生成</el-button>
          </div>
          <div class="studio-note" v-if="!hasParams">拖动参数滑块查看实时变形预览</div>
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import FaceAnnotator from './FaceAnnotator.vue'
import MetricsPanel from './MetricsPanel.vue'
import ParamSliders from './ParamSliders.vue'
import { detectFaceLandmarks, isDetectFailure, type DetectFailure } from './useFaceLandmarks'
import { computeFaceMetrics, type Point, type FaceMetrics } from './faceMetrics'
import { warpFaceBands, transformLandmarks, type WarpParams } from './bandWarp'
import type { PortraitVariant } from '../../../../../shared/types/portrait.types'

/**
 * 面容几何工作室（spec §F5）：
 * 打开自动检测 + 标注 + 指标；参数滑块 → 实时变形预览（P3）。
 */
const props = defineProps<{
  modelValue: boolean
  variant: PortraitVariant
}>()

defineEmits<{
  'update:modelValue': [value: boolean]
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
  const canvas = warpFaceBands(sourceImage.value, landmarks.value, warpParams.value)
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
.preview-toggle {
  display: flex;
  gap: 4px;
  background: var(--fill-color);
  border-radius: var(--radius-md);
  padding: 3px;
  margin-bottom: 10px;
  width: fit-content;
}

.pt-tab {
  padding: 5px 14px;
  font-size: 12px;
  color: var(--text-secondary);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);

  &.active {
    background: var(--bg-color-card);
    color: var(--text-primary);
    font-weight: 600;
    box-shadow: var(--shadow-sm);
  }
}
</style>
