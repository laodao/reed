<template>
  <div class="message-list" ref="listRef" @scroll="handleScroll">
    <div class="messages-container">
      <MessageItem
        v-for="message in displayMessages"
        :key="message.id"
        :message="message"
        :available-models="availableModels"
        @edit="handleEdit"
        @copy="handleCopy"
        @delete="handleDelete"
        @regenerate="handleRegenerate"
      />

      <!-- 流式消息占位 -->
      <div v-if="isGenerating && streamState.messageId" class="message-item assistant">
        <div class="message-avatar">🤖</div>
        <div class="message-content">
          <div class="message-text" v-html="formatStreamContent(streamState.content)"></div>
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
import { computed, ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import MessageItem from './MessageItem.vue'
import type { Message, StreamState } from '../../../shared/types'

const props = defineProps<{
  messages: Message[]
  streamState: StreamState
  isGenerating: boolean
  availableModels?: Array<{ id: string; name: string }>
}>()

const emit = defineEmits<{
  (e: 'edit', messageId: string, newContent: string): void
  (e: 'delete', messageId: string): void
  (e: 'regenerate', userMessageId: string, modelId?: string): void
}>()

const listRef = ref<HTMLElement | null>(null)

// 用户是否正在手动滚动
const isUserScrolling = ref(false)
// 上一次滚动位置
const lastScrollTop = ref(0)
// 是否应该自动滚动
const shouldAutoScroll = ref(true)

// 显示的消息列表（排除正在生成的消息）
const displayMessages = computed(() => {
  if (props.isGenerating && props.streamState.messageId) {
    return props.messages.filter(m => m.id !== props.streamState.messageId)
  }
  return props.messages
})

// 格式化流式内容（带代码块）
function formatStreamContent(content: string): string {
  if (!content) return ''

  // 先处理代码块，用占位符替换
  const codeBlocks: { language: string; code: string }[] = []
  let processedContent = content.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (match, language, code) => {
      const index = codeBlocks.length
      codeBlocks.push({ language, code: code.trim() })
      return `__CODE_BLOCK_${index}__`
    }
  )

  // 转义 HTML
  processedContent = processedContent
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // 处理行内代码
  processedContent = processedContent.replace(/`([^`]+)`/g, '<code>$1</code>')

  // 处理换行
  processedContent = processedContent.replace(/\n/g, '<br>')

  // 还原代码块为组件渲染
  codeBlocks.forEach((block, index) => {
    const codeBlockHtml = renderCodeBlock(block.language, block.code)
    processedContent = processedContent.replace(`__CODE_BLOCK_${index}__`, codeBlockHtml)
  })

  return processedContent
}

// 渲染代码块 HTML
function renderCodeBlock(language: string, code: string): string {
  const lines = code.split('\n')
  const lineNumbers = lines.map((_, i) => `<span class="line-number">${i + 1}</span>`).join('')
  const codeLines = lines.map(line => escapeHtml(line)).join('\n')

  return `
    <div class="code-block-wrapper">
      <div class="code-header">
        <span class="language">${language || 'code'}</span>
        <button class="copy-btn" onclick="copyCodeFromBlock(this)">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
          <span>复制</span>
        </button>
      </div>
      <div class="code-content">
        <div class="line-numbers">${lineNumbers}</div>
        <pre><code>${codeLines}</code></pre>
      </div>
      <div class="code-data" style="display:none">${escapeHtml(code)}</div>
    </div>
  `
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// 处理滚动事件
function handleScroll(): void {
  if (!listRef.value) return

  const { scrollTop, scrollHeight, clientHeight } = listRef.value
  const isAtBottom = scrollHeight - scrollTop - clientHeight < 50

  // 如果用户向上滚动，禁用自动滚动
  if (scrollTop < lastScrollTop.value && !isAtBottom) {
    shouldAutoScroll.value = false
  }

  // 如果用户滚动到底部，重新启用自动滚动
  if (isAtBottom) {
    shouldAutoScroll.value = true
  }

  lastScrollTop.value = scrollTop
}

// 滚动到底部
function scrollToBottom(): void {
  if (!listRef.value || !shouldAutoScroll.value) return

  nextTick(() => {
    if (listRef.value) {
      listRef.value.scrollTop = listRef.value.scrollHeight
    }
  })
}

// 处理消息编辑
function handleEdit(messageId: string, newContent: string): void {
  emit('edit', messageId, newContent)
}

// 处理消息复制
function handleCopy(content: string): void {
  // 复制已在 MessageItem 中处理
}

// 处理消息删除
function handleDelete(messageId: string): void {
  emit('delete', messageId)
}

// 处理重新生成
function handleRegenerate(messageId: string, modelId?: string): void {
  // 找到对应的用户消息（AI 回答之前的最后一条用户消息）
  const messageIndex = props.messages.findIndex(m => m.id === messageId)
  if (messageIndex === -1) return

  // 向前查找最近的用户消息
  for (let i = messageIndex - 1; i >= 0; i--) {
    if (props.messages[i].role === 'user') {
      emit('regenerate', props.messages[i].id, modelId)
      return
    }
  }
}

// 全局代码复制函数
function setupGlobalCopyFunction(): void {
  ;(window as any).copyCodeFromBlock = (button: HTMLElement) => {
    const wrapper = button.closest('.code-block-wrapper')
    if (!wrapper) return

    const codeData = wrapper.querySelector('.code-data')
    if (!codeData) return

    const code = codeData.textContent || ''
    navigator.clipboard.writeText(code).then(() => {
      const span = button.querySelector('span')
      if (span) {
        const originalText = span.textContent
        span.textContent = '已复制'
        button.style.color = '#22c55e'
        setTimeout(() => {
          span.textContent = originalText
          button.style.color = ''
        }, 2000)
      }
      ElMessage.success('代码已复制到剪贴板')
    }).catch(err => {
      console.error('复制失败:', err)
      ElMessage.error('复制失败')
    })
  }
}

// 监听消息变化
watch(
  () => props.messages.length,
  (newLength, oldLength) => {
    // 新消息添加时，强制滚动到底部
    if (newLength > (oldLength || 0)) {
      shouldAutoScroll.value = true
      scrollToBottom()
    }
  }
)

// 监听流式内容变化
watch(
  () => props.streamState.content,
  () => {
    scrollToBottom()
  }
)

// 组件挂载后
onMounted(() => {
  scrollToBottom()
  setupGlobalCopyFunction()
})

// 组件卸载时清理
onUnmounted(() => {
  delete (window as any).copyCodeFromBlock
})
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
    margin: 0;
    background: transparent;
    padding: 0;
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

  // 代码块样式
  :deep(.code-block-wrapper) {
    background: #1e293b;
    border-radius: 8px;
    overflow: hidden;
    margin: 10px 0;

    .code-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      background: #334155;
      border-bottom: 1px solid #475569;

      .language {
        font-size: 12px;
        color: #94a3b8;
        text-transform: lowercase;
      }

      .copy-btn {
        display: flex;
        align-items: center;
        gap: 4px;
        background: transparent;
        border: none;
        color: #94a3b8;
        cursor: pointer;
        font-size: 12px;
        padding: 4px 8px;
        border-radius: 4px;

        &:hover {
          color: #e2e8f0;
          background: rgba(255, 255, 255, 0.1);
        }

        svg {
          width: 14px;
          height: 14px;
        }
      }
    }

    .code-content {
      display: flex;
      overflow-x: auto;

      .line-numbers {
        display: flex;
        flex-direction: column;
        padding: 12px 0;
        min-width: 40px;
        text-align: right;
        user-select: none;
        border-right: 1px solid #475569;
        background: #1e293b;

        .line-number {
          padding: 0 8px;
          font-size: 13px;
          line-height: 1.5;
          color: #475569;
          font-family: 'SF Mono', 'Monaco', 'Menlo', monospace;
        }
      }

      pre {
        margin: 0;
        padding: 12px 14px;
        flex: 1;
        overflow-x: auto;

        code {
          font-family: 'SF Mono', 'Monaco', 'Menlo', monospace;
          font-size: 13px;
          line-height: 1.5;
          color: #e2e8f0;
          white-space: pre;
        }
      }
    }
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
