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
        <p class="upload-tip">支持 .md .txt .docx 格式，最大 5MB</p>
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
          @click="clearTranslation"
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
      <p class="progress-text">正在翻译...</p>
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
import { Upload, Document, Delete, Switch } from '@element-plus/icons-vue'
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
  swapLanguages,
  clearTranslation,
  LANGUAGES
} = useTranslation()

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
    ElMessage.error('选择文件失败')
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
    if (!['md', 'txt', 'docx'].includes(ext || '')) {
      ElMessage.error('不支持的文件格式，请上传 .md、.txt 或 .docx 文件')
      return
    }
    // 检查文件大小
    if (file.size > 5 * 1024 * 1024) {
      ElMessage.error('文件大小超过限制（最大 5MB）')
      return
    }
    // 这里需要手动设置 selectedFile
    // 由于 selectFile 是通过 IPC 的，我们需要直接设置
    // 暂时使用 IPC 选择文件
    await handleSelectFile()
  }
}

/**
 * 开始翻译
 */
async function handleTranslate(): Promise<void> {
  const result = await translateFile()
  if (result) {
    ElMessage.success('翻译任务已创建')
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

  .progress-text {
    margin: 12px 0 0;
    text-align: center;
    font-size: 14px;
    color: var(--el-text-color-secondary);
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