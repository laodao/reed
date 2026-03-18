<template>
  <div class="message-list" ref="listRef">
    <div class="messages-container">
      <MessageItem
        v-for="message in displayMessages"
        :key="message.id"
        :message="message"
      />

      <!-- 流式消息占位 -->
      <div v-if="isGenerating && streamState.messageId" class="message-item assistant">
        <div class="message-avatar">🤖</div>
        <div class="message-content">
          <div class="message-text" v-html="formatContent(streamState.content)"></div>
          <div class="typing-indicator">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import MessageItem from './MessageItem.vue'
import type { Message, StreamState } from '../../../shared/types'

const props = defineProps<{
  messages: Message[]
  streamState: StreamState
  isGenerating: boolean
}>()

const listRef = ref<HTMLElement | null>(null)

// 显示的消息列表（排除正在生成的消息）
const displayMessages = computed(() => {
  if (props.isGenerating && props.streamState.messageId) {
    return props.messages.filter(m => m.id !== props.streamState.messageId)
  }
  return props.messages
})

// 格式化内容（简单的 Markdown 支持）
function formatContent(content: string): string {
  if (!content) return ''

  // 转义 HTML
  let formatted = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // 代码块
  formatted = formatted.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')

  // 行内代码
  formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>')

  // 换行
  formatted = formatted.replace(/\n/g, '<br>')

  return formatted
}

// 自动滚动到底部
watch(
  () => [props.messages.length, props.streamState.content],
  () => {
    nextTick(() => {
      if (listRef.value) {
        listRef.value.scrollTop = listRef.value.scrollHeight
      }
    })
  }
)
</script>

<style lang="scss" scoped>
.message-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  background: var(--el-fill-color-lighter);
}

.messages-container {
  max-width: 720px;
  margin: 0 auto;
}

.message-item.assistant {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
  animation: fadeIn 0.3s ease;
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
  flex: 1;
  background: #fff;
  padding: 12px 14px;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  border: 1px solid #f1f5f9;
}

.message-text {
  font-size: 14px;
  line-height: 1.6;
  color: #334155;

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

.typing-indicator {
  display: flex;
  gap: 4px;
  margin-top: 8px;

  span {
    width: 6px;
    height: 6px;
    background: var(--el-color-primary);
    border-radius: 50%;
    animation: typing 1s infinite;

    &:nth-child(2) {
      animation-delay: 0.2s;
    }

    &:nth-child(3) {
      animation-delay: 0.4s;
    }
  }
}

@keyframes typing {
  0%, 100% {
    opacity: 0.3;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.2);
  }
}
</style>
