<template>
  <div class="file-translation">
    <!-- 模型选择区域 -->
    <div class="model-section">
      <div class="model-selector">
        <el-select
          v-model="selectedProviderId"
          placeholder="选择提供商"
          class="provider-select"
          :disabled="translating"
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
          :disabled="!selectedProviderId || translating"
        >
          <el-option
            v-for="model in availableModels"
            :key="model.id"
            :label="model.name"
            :value="model.id"
          />
        </el-select>
      </div>
    </div>

    <!-- 语言选择栏 -->
    <div class="language-bar">
      <el-select
        v-model="sourceLanguage"
        placeholder="源语言"
        class="language-select"
        :disabled="translating"
      >
        <el-option
          v-for="lang in LANGUAGES"
          :key="lang.code"
          :label="lang.name"
          :value="lang.code"
        />
      </el-select>

      <el-button
        :icon="Switch"
        circle
        :disabled="sourceLanguage === 'auto' || translating"
        @click="swapLanguages"
      />

      <el-select
        v-model="targetLanguage"
        placeholder="目标语言"
        class="language-select"
        :disabled="translating"
      >
        <el-option
          v-for="lang in LANGUAGES.filter(l => l.code !== 'auto')"
          :key="lang.code"
          :label="lang.name"
          :value="lang.code"
        />
      </el-select>
    </div>

    <!-- 文件上传区域 -->
    <div class="upload-area">
      <div
        v-if="!selectedFile"
        class="upload-box"
        @click="handleSelectFile"
        @dragover.prevent
        @drop.prevent="handleDropFile"
      >
        <el-icon :size="48"><Upload /></el-icon>
        <p class="upload-text">点击或拖拽上传文件</p>
        <p class="upload-tip">支持 .md .txt 格式，最大 5MB</p>
      </div>

      <div v-else class="file-info">
        <div class="file-icon">
          <el-icon :size="32"><Document /></el-icon>
        </div>
        <div class="file-details">
          <p class="file-name">{{ selectedFile.name }}</p>
          <p class="file-size">{{ formatFileSize(selectedFile.size) }}</p>
        </div>
        <el-button
          type="danger"
          :icon="Delete"
          circle
          :disabled="translating"
          @click="handleClearFile"
        />
      </div>
    </div>

    <!-- 翻译进度 -->
    <div v-if="translating" class="progress-area">
      <el-progress
        :percentage="fileProgress"
        :stroke-width="8"
        :show-text="true"
      />
      <p class="progress-text">正在翻译... {{ fileProgress }}%</p>
      <el-button
        type="warning"
        size="small"
        @click="handleCancel"
        style="margin-top: 12px;"
      >
        取消翻译
      </el-button>
    </div>

    <!-- 翻译结果 -->
    <div v-if="translationResult && !translating" class="result-area">
      <div class="result-header">
        <el-icon class="success-icon"><CircleCheck /></el-icon>
        <span>翻译完成</span>
      </div>
      <div class="result-info">
        <p><strong>源文件：</strong>{{ selectedFile?.name }}</p>
        <p><strong>翻译结果：</strong>{{ translationResult }}</p>
      </div>
      <div class="result-actions">
        <el-button type="primary" @click="handleOpenFolder">
          <el-icon><FolderOpened /></el-icon>
          打开文件夹
        </el-button>
        <el-button @click="handleClearResult">
          清除结果
        </el-button>
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="action-bar">
      <el-button
        type="primary"
        size="large"
        :loading="translating"
        :disabled="!selectedFile || !hasProviders"
        @click="handleTranslate"
      >
        {{ hasProviders ? (translating ? '翻译中...' : '开始翻译') : '无可用提供商' }}
      </el-button>
    </div>

    <!-- 错误提示 -->
    <el-alert
      v-if="error"
      :title="error"
      type="error"
      show-icon
      closable
      @close="error = null"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Upload, Document, Delete, Switch, CircleCheck, FolderOpened } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useTranslation } from '@/composables'

const {
  translating,
  error,
  providers,
  selectedProviderId,
  selectedModelId,
  availableModels,
  hasProviders,
  sourceLanguage,
  targetLanguage,
  selectedFile,
  fileProgress,
  selectFile,
  translateFile,
  cancelFileTranslation,
  swapLanguages,
  clearTranslation,
  LANGUAGES
} = useTranslation()

/** 翻译结果（保存的文件路径） */
const translationResult = ref<string | null>(null)

/**
 * 处理提供商切换
 */
function handleProviderChange(): void {
  // 切换提供商时，自动选择第一个模型
  const provider = providers.value.find(p => p.id === selectedProviderId.value)
  if (provider && provider.models.length > 0) {
    selectedModelId.value = provider.models[0].id
  }
}

/**
 * 选择文件
 */
async function handleSelectFile(): Promise<void> {
  const file = await selectFile()
  if (!file) {
    // 用户取消选择，不显示错误
  }
}

/**
 * 拖拽文件
 */
async function handleDropFile(event: DragEvent): Promise<void> {
  const files = event.dataTransfer?.files
  if (files && files.length > 0) {
    // 检查文件格式
    const file = files[0]
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!['md', 'txt'].includes(ext || '')) {
      ElMessage.error('不支持的文件格式，请上传 .md 或 .txt 文件')
      return
    }
    // 检查文件大小
    if (file.size > 5 * 1024 * 1024) {
      ElMessage.error('文件大小超过限制（最大 5MB）')
      return
    }
    // 暂时不支持拖拽，提示用户使用点击选择
    ElMessage.warning('请点击上传区域选择文件')
  }
}

/**
 * 开始翻译
 */
async function handleTranslate(): Promise<void> {
  // 清除之前的结果
  translationResult.value = null

  const result = await translateFile()
  if (result) {
    ElMessage.info('翻译任务已开始，请等待...')
  } else if (error.value) {
    ElMessage.error(error.value)
  }
}

/**
 * 取消翻译
 */
function handleCancel(): void {
  cancelFileTranslation()
  ElMessage.warning('已取消翻译')
}

/**
 * 清除文件
 */
function handleClearFile(): void {
  clearTranslation()
  translationResult.value = null
}

/**
 * 清除结果
 */
function handleClearResult(): void {
  translationResult.value = null
}

/**
 * 打开文件夹
 */
async function handleOpenFolder(): Promise<void> {
  if (translationResult.value) {
    const response = await window.electronAPI.translation.openFolder(translationResult.value)
    if (!response.success) {
      ElMessage.error(response.error || '打开文件夹失败')
    }
  }
}

/**
 * 格式化文件大小
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

/**
 * 监听翻译完成事件
 */
function handleTranslationCompleted(event: CustomEvent): void {
  const { targetFile } = event.detail
  translationResult.value = targetFile
  ElMessage.success('翻译完成！')
}

/**
 * 监听翻译失败事件
 */
function handleTranslationFailed(event: CustomEvent): void {
  const { error: err } = event.detail
  ElMessage.error(`翻译失败: ${err}`)
}

onMounted(() => {
  window.addEventListener('translation-completed', handleTranslationCompleted as EventListener)
  window.addEventListener('translation-failed', handleTranslationFailed as EventListener)
})

onUnmounted(() => {
  window.removeEventListener('translation-completed', handleTranslationCompleted as EventListener)
  window.removeEventListener('translation-failed', handleTranslationFailed as EventListener)
})
</script>

<style lang="scss" scoped>
.file-translation {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 16px;
}

.model-section {
  padding: 16px;
  background: #fff;
  border-radius: 12px;

  .model-selector {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .provider-select,
  .model-select {
    flex: 1;
  }

  .provider-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
  }
}

.language-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 16px;
  background: #fff;
  border-radius: 12px;

  .language-select {
    width: 160px;
  }
}

.upload-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 20px;
}

.upload-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 60px;
  background: #fff;
  border: 2px dashed var(--el-border-color);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s;

  &:hover {
    border-color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
  }

  .el-icon {
    color: var(--el-text-color-placeholder);
  }

  .upload-text {
    font-size: 16px;
    color: var(--el-text-color-primary);
  }

  .upload-tip {
    font-size: 13px;
    color: var(--el-text-color-secondary);
  }
}

.file-info {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 24px;
  background: #fff;
  border-radius: 12px;
  border: 1px solid var(--el-border-color-light);

  .file-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 56px;
    height: 56px;
    background: var(--el-color-primary-light-9);
    border-radius: 12px;
    color: var(--el-color-primary);
  }

  .file-details {
    flex: 1;

    .file-name {
      margin: 0;
      font-size: 15px;
      font-weight: 500;
      color: var(--el-text-color-primary);
    }

    .file-size {
      margin: 4px 0 0;
      font-size: 13px;
      color: var(--el-text-color-secondary);
    }
  }
}

.progress-area {
  padding: 20px;
  background: #fff;
  border-radius: 12px;
  text-align: center;

  .progress-text {
    margin: 12px 0 0;
    font-size: 14px;
    color: var(--el-text-color-secondary);
  }
}

.result-area {
  padding: 20px;
  background: #fff;
  border-radius: 12px;
  border: 1px solid var(--el-color-success-light-5);

  .result-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 16px;

    .success-icon {
      font-size: 24px;
      color: var(--el-color-success);
    }

    span {
      font-size: 16px;
      font-weight: 600;
      color: var(--el-color-success);
    }
  }

  .result-info {
    padding: 12px;
    background: var(--el-fill-color-light);
    border-radius: 8px;
    margin-bottom: 16px;

    p {
      margin: 0 0 8px;
      font-size: 14px;
      color: var(--el-text-color-regular);

      &:last-child {
        margin-bottom: 0;
      }

      strong {
        color: var(--el-text-color-primary);
      }
    }
  }

  .result-actions {
    display: flex;
    gap: 12px;
  }
}

.action-bar {
  display: flex;
  justify-content: center;
  padding: 16px;
  background: #fff;
  border-radius: 12px;

  .el-button {
    min-width: 200px;
  }
}
</style>