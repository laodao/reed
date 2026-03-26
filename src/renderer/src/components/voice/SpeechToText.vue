<template>
  <div class="speech-to-text">
    <div class="stt-config">
      <!-- 模型和语言选择 -->
      <div class="config-row">
        <el-select
          v-model="selectedModelKey"
          placeholder="选择模型"
          style="width: 200px"
          filterable
          :filter-method="filterModels"
        >
          <el-option-group
            v-for="provider in filteredProviderModels"
            :key="provider.id"
            :label="provider.name"
          >
            <el-option
              v-for="model in provider.models"
              :key="`${provider.id}:${model.id}`"
              :label="model.name"
              :value="`${provider.id}:${model.id}`"
            />
          </el-option-group>
        </el-select>

        <el-select
          v-model="currentLanguage"
          placeholder="选择语言"
          style="width: 160px"
        >
          <el-option
            v-for="lang in VOICE_LANGUAGES"
            :key="lang.code"
            :label="lang.name"
            :value="lang.code"
          />
        </el-select>
      </div>
    </div>

    <!-- 音频文件选择 -->
    <div class="file-section">
      <div class="file-selector">
        <div v-if="!selectedAudioFile" class="file-placeholder" @click="handleSelectFile">
          <el-icon size="48"><Upload /></el-icon>
          <span>点击选择音频文件</span>
          <span class="support-formats">支持 mp3, wav, m4a, ogg, webm 格式，最大 100MB</span>
        </div>
        <div v-else class="file-info">
          <div class="file-detail">
            <el-icon size="24"><Document /></el-icon>
            <div class="file-meta">
              <span class="file-name">{{ selectedAudioFile.name }}</span>
              <span class="file-size">{{ formatFileSize(selectedAudioFile.size) }}</span>
            </div>
          </div>
          <el-button text @click="handleSelectFile">
            <el-icon><Refresh /></el-icon>
            重新选择
          </el-button>
        </div>
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="action-bar">
      <el-button @click="clearInput">清空</el-button>
      <el-button
        type="primary"
        :loading="sttProcessing"
        :disabled="!selectedAudioFile"
        @click="handleRecognize"
      >
        {{ sttProcessing ? '识别中...' : '开始识别' }}
      </el-button>
    </div>

    <!-- 识别结果 -->
    <div v-if="recognizedText" class="result-section">
      <div class="result-header">
        <span>识别结果</span>
        <el-button text size="small" @click="handleCopy">
          <el-icon><CopyDocument /></el-icon>
          复制
        </el-button>
      </div>
      <div class="result-content">
        {{ recognizedText }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Upload, Document, Refresh, CopyDocument } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useVoice } from '@/composables'

// 模型搜索关键词
const modelSearchKeyword = ref('')

const {
  // 状态
  sttProcessing,
  selectedProviderId,
  selectedModelId,
  currentLanguage,
  selectedAudioFile,
  recognizedText,

  // 计算属性
  providerModels,

  // 方法
  selectAudioFile,
  recognizeSpeech,
  clearInput,
  copyText,

  // 常量
  VOICE_LANGUAGES
} = useVoice()

// 选中的模型键（格式：providerId:modelId）
const selectedModelKey = computed({
  get: () => `${selectedProviderId.value}:${selectedModelId.value}`,
  set: (val: string) => {
    const parts = val.split(':')
    if (parts.length >= 2) {
      selectedProviderId.value = parts[0]
      selectedModelId.value = parts.slice(1).join(':')
    }
  }
})

// 过滤后的模型列表
const filteredProviderModels = computed(() => {
  if (!modelSearchKeyword.value) {
    return providerModels.value
  }

  const keyword = modelSearchKeyword.value.toLowerCase()
  const result: typeof providerModels.value = []

  for (const provider of providerModels.value) {
    const filteredModels = provider.models.filter(model =>
      model.name.toLowerCase().includes(keyword) ||
      model.id.toLowerCase().includes(keyword) ||
      provider.name.toLowerCase().includes(keyword)
    )

    if (filteredModels.length > 0) {
      result.push({
        ...provider,
        models: filteredModels
      })
    }
  }

  return result
})

// 模型搜索过滤方法
function filterModels(keyword: string): void {
  modelSearchKeyword.value = keyword
}

/**
 * 选择音频文件
 */
async function handleSelectFile(): Promise<void> {
  await selectAudioFile()
}

/**
 * 开始识别
 */
async function handleRecognize(): Promise<void> {
  const result = await recognizeSpeech()
  if (result) {
    ElMessage.success('语音识别成功')
  }
}

/**
 * 复制结果
 */
async function handleCopy(): Promise<void> {
  const success = await copyText(recognizedText.value)
  if (success) {
    ElMessage.success('已复制到剪贴板')
  }
}

/**
 * 格式化文件大小
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}
</script>

<style lang="scss" scoped>
.speech-to-text {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
}

.stt-config {
  padding: 20px;
  border-bottom: 1px solid #e4e7ed;

  .config-row {
    display: flex;
    align-items: center;
    gap: 16px;
  }
}

.file-section {
  flex: 1;
  padding: 20px;
  display: flex;
  flex-direction: column;
}

.file-selector {
  flex: 1;
  border: 2px dashed #dcdfe6;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s;

  &:hover {
    border-color: #409eff;
    background: #ecf5ff;
  }
}

.file-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: #909399;
  padding: 40px;

  .support-formats {
    font-size: 12px;
    color: #c0c4cc;
  }
}

.file-info {
  width: 100%;
  padding: 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;

  .file-detail {
    display: flex;
    align-items: center;
    gap: 16px;

    .file-meta {
      display: flex;
      flex-direction: column;
      gap: 4px;

      .file-name {
        font-size: 15px;
        color: #303133;
        font-weight: 500;
      }

      .file-size {
        font-size: 13px;
        color: #909399;
      }
    }
  }
}

.action-bar {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid #e4e7ed;
}

.result-section {
  padding: 20px;
  border-top: 1px solid #e4e7ed;
  background: #f5f7fa;

  .result-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
    font-size: 14px;
    font-weight: 500;
    color: #303133;
  }

  .result-content {
    padding: 16px;
    background: #fff;
    border-radius: 8px;
    font-size: 15px;
    line-height: 1.8;
    color: #303133;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 300px;
    overflow-y: auto;
  }
}
</style>