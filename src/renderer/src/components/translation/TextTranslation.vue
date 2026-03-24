<template>
  <div class="text-translation">
    <!-- 模型选择区域 -->
    <div class="model-section">
      <div class="model-selector">
        <el-select
          v-model="selectedModelId"
          placeholder="选择模型"
          class="model-select"
          :disabled="translating"
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

    <!-- 翻译区域 -->
    <div class="translation-area">
      <!-- 源文本 -->
      <div class="text-panel">
        <el-input
          v-model="sourceText"
          type="textarea"
          :rows="10"
          placeholder="输入要翻译的文本..."
          :disabled="translating"
          @input="handleInput"
        />
        <div class="panel-footer">
          <span class="char-count" :class="{ over: isOverLimit }">
            {{ charCount }}/5000
          </span>
          <el-button text @click="clearTranslation" :disabled="translating">
            清空
          </el-button>
        </div>
      </div>

      <!-- 目标文本 -->
      <div class="text-panel">
        <div class="result-area">
          <div v-if="translating" class="loading-state">
            <el-icon class="is-loading"><Loading /></el-icon>
            <span>翻译中...</span>
          </div>
          <div v-else-if="targetText" class="result-text">
            {{ targetText }}
          </div>
          <div v-else class="empty-state">
            翻译结果将显示在这里
          </div>
        </div>
        <div class="panel-footer">
          <el-button
            text
            :disabled="!targetText"
            @click="copyText(targetText)"
          >
            <el-icon><CopyDocument /></el-icon>
            复制
          </el-button>
        </div>
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="action-bar">
      <el-button
        type="primary"
        size="large"
        :loading="translating"
        :disabled="!sourceText.trim() || isOverLimit || !hasProviders"
        @click="translateText()"
      >
        {{ hasProviders ? '翻译' : '无可用提供商' }}
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
import { Switch, Loading, CopyDocument } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useTranslation } from '@/composables'

const {
  translating,
  error,
  selectedModelId,
  availableModels,
  hasProviders,
  sourceLanguage,
  targetLanguage,
  sourceText,
  targetText,
  charCount,
  isOverLimit,
  translateText,
  swapLanguages,
  clearTranslation,
  copyText,
  startRealtimeTranslation,
  LANGUAGES
} = useTranslation()

// 输入处理（可扩展为实时翻译）
function handleInput(): void {
  // 可以在这里启用实时翻译
  // startRealtimeTranslation()
}
</script>

<style lang="scss" scoped>
.text-translation {
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

  .model-select {
    flex: 1;
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

.translation-area {
  flex: 1;
  display: flex;
  gap: 16px;
  min-height: 0;
}

.text-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 12px;
  overflow: hidden;

  :deep(.el-textarea) {
    flex: 1;

    .el-textarea__inner {
      height: 100%;
      resize: none;
      border: none;
      padding: 16px;
      font-size: 15px;
      line-height: 1.6;
    }
  }

  .result-area {
    flex: 1;
    padding: 16px;
    overflow-y: auto;
    font-size: 15px;
    line-height: 1.6;
    color: var(--el-text-color-primary);
  }

  .loading-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 8px;
    color: var(--el-color-primary);
  }

  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--el-text-color-placeholder);
  }

  .result-text {
    white-space: pre-wrap;
    word-break: break-word;
  }
}

.panel-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  border-top: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-light);

  .char-count {
    font-size: 13px;
    color: var(--el-text-color-secondary);

    &.over {
      color: var(--el-color-danger);
      font-weight: 500;
    }
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