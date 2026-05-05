<template>
  <el-dialog :model-value="modelValue" title="合成场景视频" width="500px" @update:model-value="emit('update:modelValue', $event)">
    <el-form :model="form" label-width="80px">
      <el-form-item label="视频质量">
        <el-select v-model="form.quality" style="width: 100%">
          <el-option label="标准 (1080p 30fps)" value="standard" />
          <el-option label="高清 (1080p 高码率)" value="high" />
          <el-option label="流畅 (720p 24fps)" value="low" />
          <el-option label="竖屏 (1080x1920)" value="vertical" />
        </el-select>
      </el-form-item>
      <el-form-item label="说明">
        <div class="generate-info">将合成 {{ storyboardCount }} 个镜头为完整视频</div>
      </el-form-item>
      <el-form-item v-if="progressPhase" label="进度">
        <div class="synthesis-progress">
          <el-progress :percentage="progressValue" :status="progressValue === 100 ? 'success' : ''" />
          <span class="progress-label">{{ getSynthesisPhaseLabel(progressPhase) }}</span>
        </div>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="loading || progressValue > 0" @click="onConfirm">
        开始合成
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive } from 'vue'

// ==================== Props ====================
const props = defineProps<{
  /** 对话框显示/隐藏 */
  modelValue: boolean
  /** 分镜总数 */
  storyboardCount: number
  /** 合成进度阶段 */
  progressPhase: string
  /** 合成进度百分比 */
  progressValue: number
  /** 加载中标志 */
  loading: boolean
}>()

// ==================== Emits ====================
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  /** 确认合成，携带质量参数 */
  (e: 'confirm', quality: string): void
}>()

// ==================== 表单状态 ====================
const form = reactive({
  quality: 'standard'
})

// ==================== 标签映射 ====================
function getSynthesisPhaseLabel(phase: string): string {
  const labels: Record<string, string> = {
    shots: '生成镜头视频',
    audio: '合成音频',
    merge: '合并视频片段',
    final: '最终合成'
  }
  return labels[phase] || phase
}

function onConfirm() {
  emit('confirm', form.quality)
}
</script>

<style scoped lang="scss">
.synthesis-progress {
  .progress-label {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    margin-top: 8px;
    display: block;
  }
}

.generate-info {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
</style>
