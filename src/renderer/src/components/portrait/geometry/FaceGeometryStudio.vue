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
          <FaceAnnotator
            :image-src="imageSrc"
            :landmarks="landmarks"
            :metrics="metrics"
          />
        </div>
        <div class="studio-right">
          <MetricsPanel :metrics="metrics" />
          <div class="studio-actions">
            <el-button disabled title="P3 阶段开放">↺ 重置</el-button>
            <el-button disabled title="P3 阶段开放">用算法结果保存</el-button>
            <el-button type="primary" disabled title="P4 阶段开放">✨ AI 生成</el-button>
          </div>
          <div class="studio-note">参数调整与变形预览将在下一阶段开放</div>
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import FaceAnnotator from './FaceAnnotator.vue'
import MetricsPanel from './MetricsPanel.vue'
import { detectFaceLandmarks, isDetectFailure, type DetectFailure } from './useFaceLandmarks'
import { computeFaceMetrics, type Point, type FaceMetrics } from './faceMetrics'
import type { PortraitVariant } from '../../../../../shared/types/portrait.types'

/**
 * 面容几何工作室（spec §F5）：
 * 打开自动检测 + 标注 + 指标；参数区与变形预览随 P3/P4 接入。
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

async function runDetect() {
  detecting.value = true
  failure.value = null
  landmarks.value = []
  metrics.value = null
  imageSrc.value = props.variant.imagePath

  const result = await detectFaceLandmarks(props.variant.imagePath, props.variant.id)
  detecting.value = false

  if (isDetectFailure(result)) {
    failure.value = result
    return
  }
  landmarks.value = result.landmarks
  metrics.value = computeFaceMetrics(result.landmarks)
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
