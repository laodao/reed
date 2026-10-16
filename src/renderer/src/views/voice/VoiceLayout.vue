<template>
  <!--
    VoiceLayout · 语音助手 TTS / STT 公用 shell
    包：左 sidebar 历史列表（按 historyType 过滤）+ 右主区 slot + 历史详情 dialog。
    声音复刻页用不到 sidebar，不走 layout，直接渲染 VoiceCloneTab。
  -->
  <div class="voice-page">
    <VoiceSidebar
      v-model="selectedHistoryId"
      :history-type="historyType"
      :title="sidebarTitle"
      class="page-sidebar"
      @select="handleSelectHistory"
    />

    <div class="page-main">
      <slot />
    </div>

    <!-- 历史详情对话框（与原 Voice.vue 一致，搬过来共用） -->
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
                <audio :src="toFileUrl(historyDetail.outputAudioPath)" controls style="width: 100%" />
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
                <audio :src="toFileUrl(historyDetail.inputAudioPath)" controls style="width: 100%" />
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
import { getVoiceLanguageName } from '../../../../shared/types/voice.types'
import type { VoiceRecord } from '../../../../shared/types/voice.types'
import { toFileUrl } from '@/utils/asset-url'

defineProps<{
  /** 历史筛选：'tts' / 'stt' */
  historyType: 'tts' | 'stt'
  /** sidebar 标题（默认"语音历史"）*/
  sidebarTitle?: string
}>()

const selectedHistoryId = ref('')
const showHistoryDetail = ref(false)
const historyDetail = ref<VoiceRecord | null>(null)

function handleSelectHistory(history: VoiceRecord): void {
  historyDetail.value = history
  showHistoryDetail.value = true
}

async function handleCopyText(text?: string): Promise<void> {
  if (text) {
    await navigator.clipboard.writeText(text)
    ElMessage.success('已复制到剪贴板')
  }
}

function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<style lang="scss" scoped>
.voice-page {
  display: flex;
  height: 100%;
  background: var(--el-bg-color-page);
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
        background: var(--el-bg-color);
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
