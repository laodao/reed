<template>
  <div class="message-item" :class="message.role">
    <div class="message-avatar">
      {{ message.role === 'user' ? '👤' : '🤖' }}
    </div>
    <div class="message-content">
      <!-- 思维链显示 - 放在答案内容之前 -->
      <div v-if="message.metadata?.thinkingChain" class="thinking-chain">
        <el-collapse>
          <el-collapse-item title="思维链" name="thinking">
            <div class="thinking-content">{{ message.metadata.thinkingChain }}</div>
          </el-collapse-item>
        </el-collapse>
      </div>

      <div class="message-text" v-html="formatContent(message.content)"></div>

      <!-- 附件显示 -->
      <div v-if="message.attachments && message.attachments.length > 0" class="attachments">
        <div
          v-for="attachment in message.attachments"
          :key="attachment.id"
          class="attachment-item"
        >
          <el-icon><Document /></el-icon>
          <span>{{ attachment.fileName }}</span>
        </div>
      </div>

      <!-- 联网搜索结果显示 -->
      <div v-if="message.metadata?.webSearch && message.metadata.webSearch.length > 0" class="web-search-results">
        <el-collapse>
          <el-collapse-item title="联网搜索结果" name="webSearch">
            <div class="search-results-list">
              <a
                v-for="(result, index) in message.metadata.webSearch"
                :key="index"
                :href="result.url"
                target="_blank"
                class="search-result-item"
              >
                <div class="result-title">{{ index + 1 }}. {{ result.title }}</div>
                <div class="result-snippet">{{ result.snippet }}</div>
                <div class="result-url">{{ result.url }}</div>
              </a>
            </div>
          </el-collapse-item>
        </el-collapse>
      </div>

      <div class="message-time">{{ formatTime(message.createdAt) }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Document } from '@element-plus/icons-vue'
import type { Message } from '../../../shared/types'

defineProps<{
  message: Message
}>()

// 格式化内容
function formatContent(content: string): string {
  if (!content) return ''

  let formatted = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  formatted = formatted.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
  formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>')
  formatted = formatted.replace(/\n/g, '<br>')

  return formatted
}

// 格式化时间
function formatTime(date: Date | string): string {
  const d = new Date(date)
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}
</script>

<style lang="scss" scoped>
.message-item {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
  animation: fadeIn 0.3s ease;

  &.user {
    flex-direction: row-reverse;

    .message-content {
      background: var(--el-color-primary);
      color: #fff;
      border: none;

      .message-time {
        color: rgba(255, 255, 255, 0.7);
      }

      :deep(code:not(pre code)) {
        background: rgba(255, 255, 255, 0.2);
        color: #fff;
      }
    }
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.message-avatar {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  background: linear-gradient(135deg, #fff 0%, #f8fafc 100%);
  border-radius: 8px;
  flex-shrink: 0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.message-content {
  max-width: 70%;
  background: #fff;
  padding: 12px 14px;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  border: 1px solid #f1f5f9;
}

.message-text {
  font-size: 14px;
  line-height: 1.6;
  word-wrap: break-word;

  :deep(pre) {
    background: #1e293b;
    color: #e2e8f0;
    padding: 12px 14px;
    border-radius: 8px;
    overflow-x: auto;
    margin: 10px 0;
    font-size: 13px;
  }

  :deep(code) {
    font-family: 'SF Mono', 'Monaco', 'Menlo', monospace;
    font-size: 13px;
  }

  :deep(code:not(pre code)) {
    background: #f1f5f9;
    color: var(--el-color-primary);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 13px;
  }
}

.attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.attachment-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 6px;
  font-size: 12px;
}

.thinking-chain {
  margin-top: 8px;

  :deep(.el-collapse) {
    border: none;
  }

  :deep(.el-collapse-item__header) {
    font-size: 12px;
    color: #64748b;
    background: #f8fafc;
    border-radius: 6px;
    padding: 0 12px;
    height: 32px;
  }

  :deep(.el-collapse-item__wrap) {
    border: none;
    background: #f8fafc;
    border-radius: 0 0 6px 6px;
  }
}

.thinking-content {
  font-size: 12px;
  color: #64748b;
  line-height: 1.5;
  white-space: pre-wrap;
  padding: 8px 12px;
}

.web-search-results {
  margin-top: 8px;

  :deep(.el-collapse) {
    border: none;
  }

  :deep(.el-collapse-item__header) {
    font-size: 12px;
    color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
    border-radius: 6px;
    padding: 0 12px;
    height: 32px;
  }

  :deep(.el-collapse-item__wrap) {
    border: none;
    background: var(--el-color-primary-light-9);
    border-radius: 0 0 6px 6px;
  }
}

.search-results-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 12px;
}

.search-result-item {
  display: block;
  padding: 8px 10px;
  background: #fff;
  border-radius: 6px;
  text-decoration: none;
  border: 1px solid #e2e8f0;
  transition: all 0.2s;

  &:hover {
    border-color: var(--el-color-primary);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }

  .result-title {
    font-size: 13px;
    font-weight: 500;
    color: #1e293b;
    margin-bottom: 4px;
  }

  .result-snippet {
    font-size: 12px;
    color: #64748b;
    line-height: 1.4;
    margin-bottom: 4px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .result-url {
    font-size: 11px;
    color: #94a3b8;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.message-time {
  margin-top: 6px;
  font-size: 11px;
  color: #94a3b8;
}
</style>
