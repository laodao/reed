<template>
  <div class="translation-page">
    <!-- 左侧边栏 -->
    <TranslationSidebar
      v-model="selectedHistoryId"
      class="page-sidebar"
      @select="handleSelectHistory"
    />

    <!-- 主内容区域 -->
    <div class="page-main">
      <!-- 标签切换 -->
      <el-tabs v-model="activeTab" class="translation-tabs">
        <el-tab-pane label="文本翻译" name="text">
          <TextTranslation />
        </el-tab-pane>
        <el-tab-pane label="文件翻译" name="file">
          <FileTranslation />
        </el-tab-pane>
      </el-tabs>
    </div>

    <!-- 历史详情对话框 -->
    <el-dialog
      v-model="showHistoryDetail"
      :title="historyDetail?.type === 'text' ? '文本翻译详情' : '文件翻译详情'"
      width="80%"
      top="5vh"
      destroy-on-close
      :close-on-click-modal="false"
    >
      <div v-if="historyDetail" class="history-detail">
        <!-- 基本信息 -->
        <div class="detail-section info-section">
          <div class="info-grid">
            <div class="info-item">
              <span class="label">翻译语言</span>
              <span class="value">
                {{ getLanguageName(historyDetail.sourceLanguage) }} → {{ getLanguageName(historyDetail.targetLanguage) }}
              </span>
            </div>
            <div class="info-item">
              <span class="label">字数</span>
              <span class="value">{{ historyDetail.wordCount }} 字</span>
            </div>
            <div class="info-item">
              <span class="label">翻译时间</span>
              <span class="value">{{ formatDateTime(historyDetail.createdAt) }}</span>
            </div>
            <div v-if="historyDetail.status === 'failed'" class="info-item full-width">
              <span class="label">错误信息</span>
              <span class="value error">{{ historyDetail.errorMessage }}</span>
            </div>
          </div>
        </div>

        <!-- 文本翻译内容 -->
        <template v-if="historyDetail.type === 'text'">
          <div class="detail-section content-section">
            <div class="content-panel">
              <div class="panel-header">
                <span>原文</span>
              </div>
              <div class="panel-content">{{ historyDetail.sourceText }}</div>
            </div>
            <div class="content-panel">
              <div class="panel-header">
                <span>译文</span>
                <el-button text size="small" @click="handleCopyText(historyDetail.targetText)">
                  <el-icon><CopyDocument /></el-icon>
                  复制
                </el-button>
              </div>
              <div class="panel-content">{{ historyDetail.targetText }}</div>
            </div>
          </div>
        </template>

        <!-- 文件翻译内容 -->
        <template v-else-if="historyDetail.type === 'file'">
          <div class="detail-section content-section">
            <div class="file-info-grid">
              <div class="file-info-item">
                <span class="label">源文件</span>
                <span class="value">{{ historyDetail.sourceFileName }}</span>
              </div>
              <div v-if="historyDetail.targetFile" class="file-info-item">
                <span class="label">翻译结果</span>
                <span class="value">{{ historyDetail.targetFile }}</span>
              </div>
              <div class="file-info-item">
                <span class="label">状态</span>
                <el-tag :type="getStatusType(historyDetail.status)" size="large">
                  {{ getStatusText(historyDetail.status) }}
                </el-tag>
              </div>
            </div>
          </div>
        </template>
      </div>

      <template #footer>
        <div class="dialog-footer">
          <el-button v-if="historyDetail?.type === 'file' && historyDetail?.targetFile" type="primary" @click="handleDownloadResult">
            <el-icon><Download /></el-icon>
            下载翻译结果
          </el-button>
          <el-button v-if="historyDetail?.type === 'file' && historyDetail?.targetFile" @click="handleOpenFolder">
            <el-icon><FolderOpened /></el-icon>
            打开文件夹
          </el-button>
          <el-button @click="showHistoryDetail = false">关闭</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { CopyDocument, Download, FolderOpened } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import TranslationSidebar from '@/components/translation/TranslationSidebar.vue'
import TextTranslation from '@/components/translation/TextTranslation.vue'
import FileTranslation from '@/components/translation/FileTranslation.vue'
import { useTranslation } from '@/composables'
import { getLanguageName } from '../../../shared/types/translation.types'
import type { TranslationRecord } from '../../../shared/types/translation.types'

// 使用翻译 composable
const {
  downloadResult
} = useTranslation()

// 当前激活的标签
const activeTab = ref('text')

// 选中的历史 ID
const selectedHistoryId = ref('')

// 历史详情对话框
const showHistoryDetail = ref(false)
const historyDetail = ref<TranslationRecord | null>(null)

/**
 * 处理历史选择
 */
function handleSelectHistory(history: TranslationRecord): void {
  historyDetail.value = history
  showHistoryDetail.value = true
}

/**
 * 下载翻译结果
 */
async function handleDownloadResult(): Promise<void> {
  if (historyDetail.value) {
    const result = await downloadResult(historyDetail.value.id)
    if (result) {
      ElMessage.success('保存成功')
    }
  }
}

/**
 * 打开文件夹
 */
async function handleOpenFolder(): Promise<void> {
  if (historyDetail.value?.targetFile) {
    const response = await window.electronAPI.translation.openFolder(historyDetail.value.targetFile)
    if (!response.success) {
      ElMessage.error(response.error || '打开文件夹失败')
    }
  }
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

/**
 * 获取状态类型
 */
function getStatusType(status: string): 'success' | 'warning' | 'danger' | 'info' {
  switch (status) {
    case 'completed': return 'success'
    case 'processing': return 'warning'
    case 'failed': return 'danger'
    default: return 'info'
  }
}

/**
 * 获取状态文本
 */
function getStatusText(status: string): string {
  switch (status) {
    case 'completed': return '已完成'
    case 'processing': return '处理中'
    case 'failed': return '失败'
    case 'pending': return '等待中'
    default: return status
  }
}
</script>

<style lang="scss" scoped>
.translation-page {
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

.translation-tabs {
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
  display: flex;
  flex-direction: column;
  height: calc(90vh - 200px);
  min-height: 400px;

  .detail-section {
    margin-bottom: 0;
  }

  .info-section {
    flex-shrink: 0;

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

        &.full-width {
          grid-column: 1 / -1;
        }

        .label {
          font-size: 13px;
          color: var(--el-text-color-secondary);
        }

        .value {
          font-size: 15px;
          color: var(--el-text-color-primary);
          font-weight: 500;

          &.error {
            color: var(--el-color-danger);
            font-weight: normal;
          }
        }
      }
    }
  }

  .content-section {
    flex: 1;
    min-height: 0;
    margin-top: 20px;

    .content-panel {
      height: 50%;
      display: flex;
      flex-direction: column;
      border: 1px solid var(--el-border-color-light);
      border-radius: 12px;
      overflow: hidden;
      margin-bottom: 16px;

      &:last-child {
        margin-bottom: 0;
      }

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
        flex: 1;
        padding: 16px;
        font-size: 15px;
        line-height: 1.8;
        color: var(--el-text-color-regular);
        white-space: pre-wrap;
        word-break: break-word;
        overflow-y: auto;
      }
    }

    .file-info-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 24px;
      padding: 32px;
      background: var(--el-fill-color-light);
      border-radius: 12px;

      .file-info-item {
        display: flex;
        flex-direction: column;
        gap: 12px;

        .label {
          font-size: 13px;
          color: var(--el-text-color-secondary);
        }

        .value {
          font-size: 15px;
          color: var(--el-text-color-primary);
          word-break: break-all;
        }
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