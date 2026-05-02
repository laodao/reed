<template>
  <el-dialog
    v-model="visible"
    title="合成场景视频"
    width="500px"
  >
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
        <div class="generate-info">
          将合成 {{ storyboardCount }} 个镜头为完整视频
        </div>
      </el-form-item>
      <el-form-item v-if="synthesisProgress.phase" label="进度">
        <div class="synthesis-progress">
          <el-progress
            :percentage="synthesisProgress.progress"
            :status="synthesisProgress.progress === 100 ? 'success' : ''"
          />
          <span class="progress-text">
            {{ getSynthesisPhaseLabel(synthesisProgress.phase) }}
          </span>
        </div>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button
        type="primary"
        :loading="loading || synthesisProgress.progress > 0"
        @click="handleSubmit"
      >
        开始合成
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue'
import { useEpWorkbenchStore } from '@/stores/episode-production'

const props = defineProps<{
  modelValue: boolean
  storyboardCount: number
  synthesisProgress: {
    phase: string
    progress: number
  }
}>()

const emit = defineEmits<{
  'update:modelValue': [boolean]
  'submit': [quality: string]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const workbenchStore = useEpWorkbenchStore()
const loading = computed(() => workbenchStore.loading)

const form = reactive({
  quality: 'standard'
})

/**
 * 获取合成阶段标签
 */
function getSynthesisPhaseLabel(phase: string): string {
  const labels: Record<string, string> = {
    shots: '生成镜头视频',
    audio: '合成音频',
    merge: '合并视频片段',
    final: '最终合成',
    complete: '完成'
  }
  return labels[phase] || phase
}

function handleSubmit() {
  emit('submit', form.quality)
}
</script>

<style scoped lang="scss">
.generate-info {
  color: var(--el-text-color-regular);
  font-size: 13px;
}

.synthesis-progress {
  width: 100%;

  .progress-text {
    display: block;
    margin-top: 8px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
}
</style>
