<template>
  <div class="image-generator">
    <!-- 模型选择区域 -->
    <div class="generator-section">
      <div class="section-label">模型选择</div>
      <div class="model-selector">
        <el-select
          v-model="selectedProviderId"
          placeholder="选择提供商"
          class="provider-select"
          @change="handleProviderChange"
        >
          <el-option
            v-for="provider in providers"
            :key="provider.id"
            :label="provider.name"
            :value="provider.id"
            :disabled="!provider.configured"
          >
            <div class="provider-option">
              <span>{{ provider.name }}</span>
              <el-tag v-if="!provider.configured" type="info" size="small">
                未配置
              </el-tag>
            </div>
          </el-option>
        </el-select>

        <el-select
          v-model="selectedModelId"
          placeholder="选择模型"
          class="model-select"
          :disabled="!selectedProviderId"
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
      </div>
    </div>

    <!-- 提示词输入区域 -->
    <div class="generator-section">
      <div class="section-label">提示词</div>
      <div class="prompt-input-wrapper">
        <el-input
          v-model="prompt"
          type="textarea"
          :rows="4"
          placeholder="描述你想要生成的图像..."
          resize="none"
          class="prompt-input"
          :disabled="generating"
        />
        <div class="prompt-counter">
          {{ prompt.length }} / {{ maxPromptLength }}
        </div>
      </div>
    </div>

    <!-- 负面提示词（高级选项） -->
    <div v-if="showAdvanced" class="generator-section">
      <div class="section-label">负面提示词（可选）</div>
      <el-input
        v-model="negativePrompt"
        type="textarea"
        :rows="2"
        placeholder="描述不想在图像中出现的内容..."
        resize="none"
        class="negative-prompt-input"
        :disabled="generating"
      />
    </div>

    <!-- 参数设置区域 -->
    <div class="generator-section">
      <div class="section-label">参数设置</div>
      <div class="params-row">
        <!-- 尺寸选择 -->
        <div class="param-item">
          <span class="param-label">尺寸</span>
          <el-select v-model="selectedSize" class="size-select" :disabled="generating">
            <el-option
              v-for="size in sizeOptions"
              :key="size.value"
              :label="size.label"
              :value="size.value"
            />
          </el-select>
        </div>

        <!-- 数量选择 -->
        <div class="param-item">
          <span class="param-label">数量</span>
          <el-select v-model="selectedCount" class="count-select" :disabled="generating">
            <el-option
              v-for="count in countOptions"
              :key="count"
              :label="`${count} 张`"
              :value="count"
            />
          </el-select>
        </div>

        <!-- 高级选项按钮 -->
        <el-button
          :type="showAdvanced ? 'primary' : 'default'"
          :icon="Setting"
          circle
          @click="showAdvanced = !showAdvanced"
        />
      </div>

      <!-- 高级参数 -->
      <div v-if="showAdvanced" class="advanced-params">
        <!-- 风格选择 -->
        <div class="param-item">
          <span class="param-label">风格</span>
          <el-select
            v-model="selectedStyle"
            placeholder="默认"
            class="style-select"
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

        <!-- 质量选择 -->
        <div class="param-item">
          <span class="param-label">质量</span>
          <el-select
            v-model="selectedQuality"
            placeholder="标准"
            class="quality-select"
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

        <!-- 种子值 -->
        <div class="param-item">
          <span class="param-label">种子</span>
          <el-input-number
            v-model="seed"
            :min="-1"
            :max="2147483647"
            placeholder="随机"
            class="seed-input"
            :disabled="generating"
          />
        </div>
      </div>
    </div>

    <!-- 参考图片（高级选项） -->
    <div v-if="showAdvanced" class="generator-section">
      <div class="section-label">参考图片（可选）</div>
      <div class="reference-image-area">
        <div v-if="!referenceImage" class="upload-area" @click="handleUploadReference">
          <el-icon :size="32"><Upload /></el-icon>
          <span>点击上传参考图片</span>
        </div>
        <div v-else class="reference-preview">
          <el-image :src="referenceImage" fit="cover" class="reference-thumb" />
          <el-button
            type="danger"
            :icon="Delete"
            circle
            size="small"
            class="remove-reference"
            @click="referenceImage = ''"
          />
        </div>
      </div>
    </div>

    <!-- 生成进度 -->
    <div v-if="generating" class="progress-section">
      <el-progress
        :percentage="taskProgress"
        :stroke-width="8"
        :show-text="true"
        :format="progressFormat"
      />
      <div class="progress-status">
        <el-icon class="is-loading"><Loading /></el-icon>
        <span>{{ progressText }}</span>
      </div>
    </div>

    <!-- 错误提示 -->
    <div v-if="error" class="error-section">
      <el-alert :title="error" type="error" :closable="false" show-icon />
    </div>

    <!-- 操作按钮区域 -->
    <div class="action-buttons">
      <el-button
        v-if="!generating"
        type="primary"
        size="large"
        :disabled="!canGenerate"
        :loading="loading"
        @click="handleGenerate"
      >
        <el-icon><Picture /></el-icon>
        <span>生成图像</span>
      </el-button>

      <el-button
        v-else
        type="danger"
        size="large"
        @click="handleStop"
      >
        <el-icon><VideoPause /></el-icon>
        <span>停止生成</span>
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  Setting,
  Upload,
  Delete,
  Picture,
  VideoPause,
  Loading
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
  providers,
  selectedProviderId,
  selectedModelId,
  loading,
  generating,
  error,
  currentTask,
  availableModels,
  taskProgress,
  selectProvider,
  generateImage,
  stopGeneration
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
    selectedProviderId.value &&
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
 * 处理提供商变更
 */
async function handleProviderChange(providerId: string): Promise<void> {
  await selectProvider(providerId)
}

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
function handleUploadReference(): void {
  // TODO: 实现图片上传功能
  // 可以通过 Electron 的 dialog.showOpenDialog 实现
  ElMessage.info('图片上传功能开发中')
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
</script>

<style lang="scss" scoped>
.image-generator {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 24px;
  background: #ffffff;
  border-radius: 16px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

.generator-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.model-selector {
  display: flex;
  gap: 12px;
}

.provider-select,
.model-select {
  flex: 1;
}

.provider-option,
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

.prompt-input-wrapper {
  position: relative;
}

.prompt-input,
.negative-prompt-input {
  :deep(.el-textarea__inner) {
    font-size: 14px;
    line-height: 1.6;
    padding: 12px;
    border-radius: 12px;
    border: 1px solid var(--el-border-color-light);
    transition: all 0.3s ease;

    &:focus {
      border-color: var(--el-color-primary);
      box-shadow: 0 0 0 2px var(--el-color-primary-light-9);
    }
  }
}

.prompt-counter {
  position: absolute;
  bottom: 8px;
  right: 12px;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.params-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.param-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.param-label {
  font-size: 13px;
  color: var(--el-text-color-regular);
  white-space: nowrap;
}

.size-select,
.count-select {
  width: 120px;
}

.advanced-params {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.style-select,
.quality-select {
  width: 120px;
}

.seed-input {
  width: 150px;
}

.reference-image-area {
  width: 100%;
}

.upload-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 120px;
  border: 2px dashed var(--el-border-color);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s ease;
  color: var(--el-text-color-placeholder);

  &:hover {
    border-color: var(--el-color-primary);
    color: var(--el-color-primary);
  }
}

.reference-preview {
  position: relative;
  width: 120px;
  height: 120px;
}

.reference-thumb {
  width: 100%;
  height: 100%;
  border-radius: 12px;
}

.remove-reference {
  position: absolute;
  top: -8px;
  right: -8px;
}

.progress-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  background: var(--el-fill-color-light);
  border-radius: 12px;
}

.progress-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--el-text-color-regular);
}

.error-section {
  margin-top: -8px;
}

.action-buttons {
  display: flex;
  justify-content: center;
  padding-top: 8px;

  .el-button {
    min-width: 160px;
    height: 48px;
    font-size: 16px;
    border-radius: 12px;

    .el-icon {
      margin-right: 8px;
    }
  }
}
</style>