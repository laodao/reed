<template>
  <div class="text-to-speech">
    <!-- 上部分：配置和输入区域 -->
    <div class="top-section">
      <div class="tts-config">
        <!-- 模型选择 -->
        <div class="config-row">
          <el-select
            v-model="selectedModelId"
            placeholder="选择模型"
            style="width: 200px"
          >
            <el-option
              v-for="model in availableModels"
              :key="model.id"
              :label="model.name"
              :value="model.id"
            />
          </el-select>
        </div>

        <!-- 发音人和语言选择 -->
        <div class="config-row">
          <el-select
            v-model="selectedVoiceId"
            placeholder="选择发音人"
            style="width: 200px"
          >
            <el-option
              v-for="voice in voices"
              :key="voice.id"
              :label="voice.name"
              :value="voice.id"
            />
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

        <!-- 参数调节 -->
        <div class="config-row params-row">
          <div class="param-item">
            <span class="param-label">语速</span>
            <el-slider
              v-model="speed"
              :min="0.5"
              :max="2"
              :step="0.1"
              show-input
              style="width: 200px"
            />
          </div>
          <div class="param-item">
            <span class="param-label">音调</span>
            <el-slider
              v-model="pitch"
              :min="-12"
              :max="12"
              :step="1"
              show-input
              style="width: 200px"
            />
          </div>
          <div class="param-item">
            <span class="param-label">音量</span>
            <el-slider
              v-model="volume"
              :min="0"
              :max="100"
              :step="5"
              show-input
              style="width: 200px"
            />
          </div>
        </div>
      </div>

      <!-- 文本输入 -->
      <div class="text-input-section">
        <div class="input-header">
          <span>输入文本</span>
          <span class="char-count" :class="{ overlimit: isOverLimit }">
            {{ charCount }} / 5000
          </span>
        </div>
        <el-input
          v-model="inputText"
          type="textarea"
          :rows="6"
          placeholder="请输入要转换为语音的文本..."
          resize="none"
        />
      </div>

      <!-- 操作按钮 -->
      <div class="action-bar">
        <el-button @click="clearInput">清空</el-button>
        <el-button
          type="primary"
          :loading="ttsGenerating"
          :disabled="!inputText.trim() || isOverLimit || !selectedVoiceId"
          @click="handleGenerate"
        >
          {{ ttsGenerating ? '生成中...' : '生成语音' }}
        </el-button>
      </div>
    </div>

    <!-- 下部分：输出结果（固定在底部） -->
    <div v-if="outputAudioPath" class="output-section">
      <div class="output-header">
        <span>生成结果</span>
        <div class="output-actions">
          <el-button text size="small" @click="handleDownload">
            <el-icon><Download /></el-icon>
            下载
          </el-button>
          <el-button text size="small" @click="handleOpenFolder">
            <el-icon><FolderOpened /></el-icon>
            打开文件夹
          </el-button>
        </div>
      </div>
      <div class="audio-player">
        <audio
          ref="audioRef"
          :src="audioSrc"
          controls
          style="width: 100%"
          @error="handleAudioError"
          @loadeddata="handleAudioLoaded"
        />
        <div v-if="audioError" class="audio-error">{{ audioError }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { FolderOpened, Download } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useVoice } from '@/composables'

// 音频元素引用
const audioRef = ref<HTMLAudioElement | null>(null)
// 音频错误信息
const audioError = ref<string | null>(null)

const {
  // 状态
  ttsGenerating,
  providers,
  voices,
  selectedProviderId,
  selectedModelId,
  selectedVoiceId,
  currentLanguage,
  speed,
  pitch,
  volume,
  inputText,
  outputAudioPath,

  // 计算属性
  availableModels,
  charCount,
  isOverLimit,

  // 方法
  loadVoices,
  generateSpeech,
  clearInput
} = useVoice()

/**
 * 音频源 URL
 */
const audioSrc = computed(() => {
  if (!outputAudioPath.value) return ''
  // 使用 file:// 协议，Windows 路径需要特殊处理
  const normalizedPath = outputAudioPath.value.replace(/\\/g, '/')
  return 'file:///' + normalizedPath
})

/**
 * 音频加载错误处理
 */
function handleAudioError(e: Event): void {
  const audio = e.target as HTMLAudioElement
  console.error('[TTS] 音频加载错误:', audio.error)
  if (audio.error) {
    switch (audio.error.code) {
      case MediaError.MEDIA_ERR_ABORTED:
        audioError.value = '音频加载被中止'
        break
      case MediaError.MEDIA_ERR_NETWORK:
        audioError.value = '网络错误，无法加载音频'
        break
      case MediaError.MEDIA_ERR_DECODE:
        audioError.value = '音频解码失败'
        break
      case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
        audioError.value = '不支持的音频格式或路径无效'
        break
      default:
        audioError.value = `音频加载失败 (错误码: ${audio.error.code})`
    }
  }
}

/**
 * 音频加载成功处理
 */
function handleAudioLoaded(): void {
  audioError.value = null
  console.log('[TTS] 音频加载成功')
}

/**
 * 生成语音
 */
async function handleGenerate(): Promise<void> {
  const result = await generateSpeech()
  if (result) {
    ElMessage.success('语音生成成功')
  }
}

/**
 * 下载音频文件
 */
async function handleDownload(): Promise<void> {
  if (!outputAudioPath.value) return

  try {
    const response = await window.electronAPI.voice.download(outputAudioPath.value)
    if (response.success) {
      ElMessage.success('下载成功')
    } else {
      ElMessage.error(response.error || '下载失败')
    }
  } catch (error) {
    ElMessage.error('下载失败')
  }
}

/**
 * 打开文件夹
 */
async function handleOpenFolder(): Promise<void> {
  if (outputAudioPath.value) {
    const response = await window.electronAPI.translation.openFolder(outputAudioPath.value)
    if (!response.success) {
      ElMessage.error(response.error || '打开文件夹失败')
    }
  }
}
</script>

<style lang="scss" scoped>
.text-to-speech {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
}

.top-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.tts-config {
  padding: 20px;
  border-bottom: 1px solid #e4e7ed;
  flex-shrink: 0;

  .config-row {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 16px;

    &:last-child {
      margin-bottom: 0;
    }
  }

  .params-row {
    flex-wrap: wrap;
  }

  .param-item {
    display: flex;
    align-items: center;
    gap: 12px;

    .param-label {
      font-size: 14px;
      color: #606266;
      white-space: nowrap;
    }
  }
}

.text-input-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 20px;
  min-height: 0;
  overflow: hidden;

  .input-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
    font-size: 14px;
    font-weight: 500;
    color: #303133;
    flex-shrink: 0;

    .char-count {
      font-size: 13px;
      color: #909399;

      &.overlimit {
        color: #f56c6c;
      }
    }
  }

  :deep(.el-textarea) {
    flex: 1;
    min-height: 100px;

    .el-textarea__inner {
      height: 100% !important;
      font-size: 15px;
      line-height: 1.8;
    }
  }
}

.action-bar {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid #e4e7ed;
  flex-shrink: 0;
}

.output-section {
  flex-shrink: 0;
  padding: 16px 20px;
  border-top: 1px solid #e4e7ed;
  background: #f5f7fa;

  .output-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
    font-size: 14px;
    font-weight: 500;
    color: #303133;

    .output-actions {
      display: flex;
      gap: 8px;
    }
  }

  .audio-player {
    padding: 16px;
    background: #fff;
    border: 1px solid #e4e7ed;
    border-radius: 8px;

    .audio-error {
      margin-top: 8px;
      color: #f56c6c;
      font-size: 13px;
    }
  }
}
</style>