<template>
  <div class="voice-page">
    <!-- 左侧边栏 -->
    <VoiceSidebar
      v-model="selectedHistoryId"
      class="page-sidebar"
      @select="handleSelectHistory"
    />

    <!-- 主内容区域 -->
    <div class="page-main">
      <!-- 标签切换 -->
      <el-tabs v-model="activeTab" class="voice-tabs">
        <el-tab-pane label="文本转语音" name="tts">
          <TextToSpeech />
        </el-tab-pane>
        <el-tab-pane label="语音转文本" name="stt">
          <SpeechToText />
        </el-tab-pane>
      </el-tabs>
    </div>

    <!-- 历史详情对话框 -->
    <el-dialog
      v-model="showHistoryDetail"
      title="语音详情"
      width="600px"
      destroy-on-close
      :close-on-click-modal="false"
    >
      <div v-if="historyDetail" class="history-detail">
        <!-- 基本信息 -->
        <div class="detail-section info-section">
          <div class="info-grid">
            <div class="info-item">
              <span class="label">类型</span>
              <el-tag :type="historyDetail.type === 'tts' ? 'primary' : 'success'">
                {{ historyDetail.type === 'tts' ? '文本转语音' : '语音转文本' }}
              </el-tag>
            </div>
            <div class="info-item">
              <span class="label">语言</span>
              <span class="value">{{ getVoiceLanguageName(historyDetail.language || 'zh') }}</span>
            </div>
            <div class="info-item">
              <span class="label">时间</span>
              <span class="value">{{ formatDateTime(historyDetail.createdAt) }}</span>
            </div>
            <div v-if="historyDetail.duration" class="info-item">
              <span class="label">时长</span>
              <span class="value">{{ (historyDetail.duration / 1000).toFixed(1) }} 秒</span>
            </div>
          </div>
        </div>

        <!-- TTS 内容 -->
        <template v-if="historyDetail.type === 'tts'">
          <div class="detail-section content-section">
            <div class="content-panel">
              <div class="panel-header">
                <span>输入文本</span>
              </div>
              <div class="panel-content">{{ historyDetail.inputText }}</div>
            </div>
            <div v-if="historyDetail.outputAudioPath" class="audio-section">
              <div class="panel-header">
                <span>生成的音频</span>
              </div>
              <div class="audio-player">
                <audio :src="'file:///' + historyDetail.outputAudioPath.replace(/\\/g, '/')" controls style="width: 100%" />
              </div>
            </div>
          </div>
        </template>

        <!-- STT 内容 -->
        <template v-else-if="historyDetail.type === 'stt'">
          <div class="detail-section content-section">
            <div v-if="historyDetail.inputAudioPath" class="audio-section">
              <div class="panel-header">
                <span>输入音频</span>
              </div>
              <div class="audio-player">
                <audio :src="'file:///' + historyDetail.inputAudioPath.replace(/\\/g, '/')" controls style="width: 100%" />
              </div>
            </div>
            <div class="content-panel">
              <div class="panel-header">
                <span>识别结果</span>
                <el-button text size="small" @click="handleCopyText(historyDetail.outputText)">
                  <el-icon><CopyDocument /></el-icon>
                  复制
                </el-button>
              </div>
              <div class="panel-content">{{ historyDetail.outputText }}</div>
            </div>
          </div>
        </template>
      </div>

      <template #footer>
        <div class="dialog-footer">
          <el-button @click="showHistoryDetail = false">关闭</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { CopyDocument } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import VoiceSidebar from '@/components/voice/VoiceSidebar.vue'
import TextToSpeech from '@/components/voice/TextToSpeech.vue'
import SpeechToText from '@/components/voice/SpeechToText.vue'
import { getVoiceLanguageName } from '../../../shared/types/voice.types'
import type { VoiceRecord } from '../../../shared/types/voice.types'

// 当前激活的标签
const activeTab = ref('tts')

// 选中的历史 ID
const selectedHistoryId = ref('')

// 历史详情对话框
const showHistoryDetail = ref(false)
const historyDetail = ref<VoiceRecord | null>(null)

/**
 * 处理历史选择
 */
function handleSelectHistory(history: VoiceRecord): void {
  historyDetail.value = history
  showHistoryDetail.value = true
}

/**
 * 复制文本
 */
async function handleCopyText(text?: string): Promise<void> {
  if (text) {
    await navigator.clipboard.writeText(text)
    ElMessage.success('已复制到剪贴板')
  }
}

/**
 * 格式化日期时间
 */
function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}
</script>

<style lang="scss" scoped>
.voice-page {
  display: flex;
  height: 100%;
  background: #f5f7fa;
  overflow: hidden;
}

.page-sidebar {
  flex-shrink: 0;
  height: 100%;
}

.page-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  padding: 20px;
}

.voice-tabs {
  height: 100%;
  display: flex;
  flex-direction: column;

  :deep(.el-tabs__header) {
    margin-bottom: 16px;
    background: #fff;
    padding: 8px 16px;
    border-radius: 12px;
  }

  :deep(.el-tabs__content) {
    flex: 1;
    min-height: 0;

    .el-tab-pane {
      height: 100%;
    }
  }
}

.history-detail {
  .detail-section {
    margin-bottom: 20px;
  }

  .info-section {
    .info-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 24px;
      padding: 20px;
      background: var(--el-fill-color-light);
      border-radius: 12px;

      .info-item {
        display: flex;
        flex-direction: column;
        gap: 8px;

        .label {
          font-size: 13px;
          color: var(--el-text-color-secondary);
        }

        .value {
          font-size: 15px;
          color: var(--el-text-color-primary);
          font-weight: 500;
        }
      }
    }
  }

  .content-section {
    .content-panel {
      margin-bottom: 16px;
      border: 1px solid var(--el-border-color-light);
      border-radius: 12px;
      overflow: hidden;

      .panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        background: var(--el-fill-color-light);
        border-bottom: 1px solid var(--el-border-color-lighter);
        font-size: 14px;
        font-weight: 600;
        color: var(--el-text-color-primary);
      }

      .panel-content {
        padding: 16px;
        font-size: 15px;
        line-height: 1.8;
        color: var(--el-text-color-regular);
        white-space: pre-wrap;
        word-break: break-word;
        max-height: 200px;
        overflow-y: auto;
      }
    }

    .audio-section {
      margin-bottom: 16px;

      .panel-header {
        padding: 12px 16px;
        background: var(--el-fill-color-light);
        border-radius: 12px 12px 0 0;
        font-size: 14px;
        font-weight: 600;
        color: var(--el-text-color-primary);
      }

      .audio-player {
        padding: 16px;
        background: #fff;
        border: 1px solid var(--el-border-color-light);
        border-top: none;
        border-radius: 0 0 12px 12px;
      }
    }
  }
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>