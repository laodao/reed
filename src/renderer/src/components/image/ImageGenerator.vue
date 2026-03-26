<template>
  <div class="image-generator">
    <!-- 第一行：模型选择 + 参数 + 生成按钮 -->
    <div class="top-row">
      <!-- 模型选择 -->
      <el-select
        v-model="selectedModelId"
        placeholder="选择模型"
        class="model-select"
        :disabled="generating"
      >
        <el-option
          v-for="model in availableModels"
          :key="model.id"
          :label="model.name"
          :value="model.id"
        >
          <div class="model-option">
            <span>{{ model.name }}</span>
            <span class="model-size" v-if="model.maxResolution">
              {{ model.maxResolution }}
            </span>
          </div>
        </el-option>
      </el-select>

      <!-- 尺寸选择 -->
      <el-select v-model="selectedSize" class="size-select" :disabled="generating">
        <el-option
          v-for="size in sizeOptions"
          :key="size.value"
          :label="size.label"
          :value="size.value"
        />
      </el-select>

      <!-- 数量选择 -->
      <el-select v-model="selectedCount" class="count-select" :disabled="generating">
        <el-option
          v-for="count in countOptions"
          :key="count"
          :label="`${count}张`"
          :value="count"
        />
      </el-select>

      <!-- 高级选项按钮 -->
      <el-tooltip content="高级选项" placement="top">
        <el-button
          :type="showAdvanced ? 'primary' : 'default'"
          :icon="Setting"
          @click="showAdvanced = !showAdvanced"
        />
      </el-tooltip>

      <!-- 生成按钮 -->
      <el-button
        v-if="!generating"
        type="primary"
        :disabled="!canGenerate"
        :loading="loading"
        @click="handleGenerate"
      >
        <el-icon><Picture /></el-icon>
        <span>生成</span>
      </el-button>

      <el-button
        v-else
        type="danger"
        @click="handleStop"
      >
        <el-icon><VideoPause /></el-icon>
        <span>停止</span>
      </el-button>
    </div>

    <!-- 第二行：提示词输入 -->
    <div class="prompt-row">
      <el-input
        v-model="prompt"
        type="textarea"
        :rows="2"
        placeholder="描述你想要生成的图像..."
        resize="none"
        class="prompt-input"
        :disabled="generating"
      />
      <span class="prompt-counter">{{ prompt.length }}/{{ maxPromptLength }}</span>
    </div>

    <!-- 高级选项 -->
    <template v-if="showAdvanced">
      <!-- 负面提示词 -->
      <div class="advanced-row">
        <span class="advanced-label">负面提示词</span>
        <el-input
          v-model="negativePrompt"
          type="textarea"
          :rows="1"
          placeholder="不想出现的内容..."
          resize="none"
          class="negative-input"
          :disabled="generating"
        />
      </div>

      <!-- 高级参数 -->
      <div class="advanced-row">
        <!-- 风格 -->
        <div class="param-group">
          <span class="param-label">风格</span>
          <el-select
            v-model="selectedStyle"
            placeholder="默认"
            class="param-select"
            clearable
            :disabled="generating"
          >
            <el-option
              v-for="style in styleOptions"
              :key="style.value"
              :label="style.label"
              :value="style.value"
            />
          </el-select>
        </div>

        <!-- 质量 -->
        <div class="param-group">
          <span class="param-label">质量</span>
          <el-select
            v-model="selectedQuality"
            placeholder="标准"
            class="param-select"
            clearable
            :disabled="generating"
          >
            <el-option
              v-for="quality in qualityOptions"
              :key="quality.value"
              :label="quality.label"
              :value="quality.value"
            />
          </el-select>
        </div>

        <!-- 种子 -->
        <div class="param-group">
          <span class="param-label">种子</span>
          <el-input-number
            v-model="seed"
            :min="-1"
            :max="2147483647"
            placeholder="随机"
            class="seed-input"
            :disabled="generating"
            controls-position="right"
          />
        </div>

        <!-- 参考图片 -->
        <div class="param-group reference-group">
          <span class="param-label">参考图</span>
          <div v-if="!referenceImage" class="upload-btn" @click="handleUploadReference">
            <el-icon><Upload /></el-icon>
          </div>
          <div v-else class="reference-preview">
            <el-image :src="referenceImage" fit="cover" class="reference-thumb" />
            <el-button
              type="danger"
              :icon="Delete"
              circle
              size="small"
              class="remove-btn"
              @click="referenceImage = ''"
            />
          </div>
        </div>
      </div>
    </template>

    <!-- 生成进度 -->
    <div v-if="generating" class="progress-row">
      <el-progress
        :percentage="taskProgress"
        :stroke-width="6"
        :show-text="true"
        :format="progressFormat"
      />
      <span class="progress-text">{{ progressText }}</span>
    </div>

    <!-- 错误提示 -->
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon class="error-alert" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  Setting,
  Upload,
  Delete,
  Picture,
  VideoPause
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useImage } from '@/composables'

/**
 * Props 定义
 */
interface Props {
  /** 是否自动重置 */
  autoReset?: boolean
}

/**
 * Emits 定义
 */
interface Emits {
  /** 生成完成事件 */
  (e: 'generated', taskId: string): void
  /** 生成失败事件 */
  (e: 'error', error: string): void
}

const props = withDefaults(defineProps<Props>(), {
  autoReset: false
})

const emit = defineEmits<Emits>()

// 使用 useImage composable
const {
  selectedProviderId,
  selectedModelId,
  loading,
  generating,
  error,
  currentTask,
  availableModels,
  taskProgress,
  generateImage,
  stopGeneration,
  selectReferenceImage
} = useImage()

// ==================== 状态 ====================

/** 提示词 */
const prompt = ref('')

/** 负面提示词 */
const negativePrompt = ref('')

/** 是否显示高级选项 */
const showAdvanced = ref(false)

/** 选中的尺寸 */
const selectedSize = ref('1024x1024')

/** 选中的数量 */
const selectedCount = ref(1)

/** 选中的风格 */
const selectedStyle = ref('')

/** 选中的质量 */
const selectedQuality = ref('')

/** 种子值 */
const seed = ref(-1)

/** 参考图片 */
const referenceImage = ref('')

/** 最大提示词长度 */
const maxPromptLength = 1000

// ==================== 选项配置 ====================

/** 尺寸选项 */
const sizeOptions = [
  { label: '512×512', value: '512x512' },
  { label: '1024×1024', value: '1024x1024' },
  { label: '1024×768', value: '1024x768' },
  { label: '768×1024', value: '768x1024' }
]

/** 数量选项 */
const countOptions = [1, 2, 4]

/** 风格选项 */
const styleOptions = [
  { label: '写实', value: 'realistic' },
  { label: '动漫', value: 'anime' },
  { label: '油画', value: 'oil_painting' },
  { label: '水彩', value: 'watercolor' },
  { label: '素描', value: 'sketch' },
  { label: '3D渲染', value: '3d_render' }
]

/** 质量选项 */
const qualityOptions = [
  { label: '标准', value: 'standard' },
  { label: '高清', value: 'hd' }
]

// ==================== 计算属性 ====================

/** 是否可以生成 */
const canGenerate = computed(() => {
  return (
    selectedModelId.value &&
    prompt.value.trim().length > 0 &&
    prompt.value.length <= maxPromptLength &&
    !loading.value &&
    !generating.value
  )
})

/** 进度文本 */
const progressText = computed(() => {
  if (!currentTask.value) return '准备中...'

  switch (currentTask.value.status) {
    case 'pending':
      return '任务排队中...'
    case 'processing':
      return `正在生成... ${taskProgress.value}%`
    case 'completed':
      return '生成完成！'
    case 'failed':
      return '生成失败'
    default:
      return '准备中...'
  }
})

// ==================== 方法 ====================

/**
 * 处理生成
 */
async function handleGenerate(): Promise<void> {
  if (!canGenerate.value) return

  // 解析尺寸
  const [width, height] = selectedSize.value.split('x').map(Number)

  const taskId = await generateImage({
    prompt: prompt.value.trim(),
    negativePrompt: negativePrompt.value.trim() || undefined,
    width,
    height,
    style: selectedStyle.value || undefined,
    quality: selectedQuality.value || undefined,
    count: selectedCount.value,
    seed: seed.value >= 0 ? seed.value : undefined,
    referenceImage: referenceImage.value || undefined
  })

  if (taskId) {
    emit('generated', taskId)

    // 如果启用了自动重置，生成后清空表单
    if (props.autoReset) {
      prompt.value = ''
      negativePrompt.value = ''
    }
  } else if (error.value) {
    emit('error', error.value)
  }
}

/**
 * 处理停止生成
 */
async function handleStop(): Promise<void> {
  await stopGeneration()
  ElMessage.info('已停止生成')
}

/**
 * 处理上传参考图片
 */
async function handleUploadReference(): Promise<void> {
  const result = await selectReferenceImage()
  if (result) {
    referenceImage.value = result.base64
    ElMessage.success(`已选择: ${result.name}`)
  }
}

/**
 * 进度格式化
 */
function progressFormat(percentage: number): string {
  return percentage === 100 ? '完成' : `${percentage}%`
}

// ==================== 监听 ====================

// 监听任务状态变化
watch(
  () => currentTask.value?.status,
  (status) => {
    if (status === 'completed') {
      ElMessage.success('图像生成完成！')
    } else if (status === 'failed') {
      ElMessage.error(currentTask.value?.error || '生成失败')
      emit('error', currentTask.value?.error || '生成失败')
    }
  }
)

// ==================== 暴露方法 ====================

/**
 * 设置生成参数（用于重新生成）
 * @param params - 生成参数
 */
function setParams(params: {
  prompt: string
  negativePrompt?: string
  width: number
  height: number
  style?: string
  quality?: string
  seed?: number
  providerId?: string
  modelId?: string
}): void {
  prompt.value = params.prompt
  negativePrompt.value = params.negativePrompt || ''

  // 设置尺寸
  const size = `${params.width}x${params.height}`
  if (sizeOptions.some(opt => opt.value === size)) {
    selectedSize.value = size
  }

  selectedStyle.value = params.style || ''
  selectedQuality.value = params.quality || ''
  seed.value = params.seed ?? -1

  // 设置模型
  if (params.modelId) {
    selectedModelId.value = params.modelId
  }
}

// 暴露方法给父组件
defineExpose({
  setParams
})
</script>

<style lang="scss" scoped>
.image-generator {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

// 第一行：模型 + 参数 + 按钮
.top-row {
  display: flex;
  align-items: center;
  gap: 8px;

  .model-select {
    flex: 1;
    min-width: 150px;
  }

  .size-select,
  .count-select {
    width: 100px;
  }

  .el-button {
    flex-shrink: 0;
  }
}

.model-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.model-size {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

// 第二行：提示词
.prompt-row {
  position: relative;

  .prompt-input {
    :deep(.el-textarea__inner) {
      font-size: 14px;
      line-height: 1.5;
      padding: 10px 12px;
      padding-right: 60px;
      border-radius: 8px;
    }
  }

  .prompt-counter {
    position: absolute;
    bottom: 8px;
    right: 12px;
    font-size: 12px;
    color: var(--el-text-color-placeholder);
  }
}

// 高级行
.advanced-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: var(--el-fill-color-light);
  border-radius: 8px;
}

.advanced-label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

.negative-input {
  flex: 1;

  :deep(.el-textarea__inner) {
    font-size: 13px;
    padding: 8px 10px;
    border-radius: 6px;
  }
}

.param-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.param-label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

.param-select {
  width: 90px;
}

.seed-input {
  width: 110px;
}

.reference-group {
  .upload-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: 1px dashed var(--el-border-color);
    border-radius: 6px;
    cursor: pointer;
    color: var(--el-text-color-placeholder);
    transition: all 0.2s;

    &:hover {
      border-color: var(--el-color-primary);
      color: var(--el-color-primary);
    }
  }

  .reference-preview {
    position: relative;
    width: 32px;
    height: 32px;

    .reference-thumb {
      width: 100%;
      height: 100%;
      border-radius: 6px;
      object-fit: cover;
    }

    .remove-btn {
      position: absolute;
      top: -6px;
      right: -6px;
      width: 16px;
      height: 16px;
      padding: 0;
    }
  }
}

// 进度行
.progress-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: var(--el-fill-color-light);
  border-radius: 8px;

  .el-progress {
    flex: 1;
  }

  .progress-text {
    font-size: 13px;
    color: var(--el-text-color-secondary);
    white-space: nowrap;
  }
}

// 错误提示
.error-alert {
  border-radius: 8px;
}
</style>