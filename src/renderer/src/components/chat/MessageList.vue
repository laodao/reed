<template>
  <div class="message-list" ref="listRef" @scroll="handleScroll">
    <div class="messages-container">
      <!-- 折叠的历史：首开只挂载最近若干条，避免长会话把主线程压满 -->
      <div v-if="windowState.canExpand.value" class="history-more" @click="loadMoreHistory">
        展开更早的 {{ Math.min(windowState.hiddenCount.value, HISTORY_CHUNK) }} 条（还有 {{ windowState.hiddenCount.value }} 条更早消息）
      </div>

      <MessageItem
        v-for="row in visibleMessages"
        :key="row.message.id"
        :data-message-id="row.message.id"
        :ref="el => setMessageRef(el, row.message.id)"
        :message="row.message"
        :available-models="availableModels"
        :dialog-title="dialogTitle"
        :answer-index="row.answerIndex"
        :has-prev-answer="row.hasPrevAnswer"
        :has-next-answer="row.hasNextAnswer"
        @edit="handleEdit"
        @copy="handleCopy"
        @delete="handleDelete"
        @regenerate="handleRegenerate"
        @navigate-answer="handleNavigateAnswer(row.index, $event)"
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

      <!-- 发送失败错误（此前存量缺口：streamState.error 从未被渲染）。
           按 [AIHUB_*] 前缀映射为登录/充值引导，其余错误展示真实文案。 -->
      <div v-if="!isGenerating && streamState.error" class="message-item assistant">
        <div class="message-avatar">⚠️</div>
        <div class="message-content">
          <el-alert :type="aihubErrorCode ? 'warning' : 'error'" :closable="false" show-icon>
            <template #title>{{ aihubErrorTitle }}</template>
            {{ displayErrorText }}
            <el-button
              v-if="aihubErrorCode === 'AIHUB_NOT_LOGGED_IN' || aihubErrorCode === 'AIHUB_SESSION_EXPIRED'"
              size="small"
              type="primary"
              text
              @click="goAihubLogin"
            >
              去登录
            </el-button>
            <el-button
              v-if="aihubErrorCode === 'AIHUB_INSUFFICIENT_BALANCE'"
              size="small"
              type="primary"
              text
              @click="goAihubLogin"
            >
              去充值/登录
            </el-button>
          </el-alert>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import MessageItem from './MessageItem.vue'
import { extractCodeBlocks, restoreCodeBlocks, escapeHtmlKeepPlaceholders } from './code-block'
import { createRenderCache } from '@/utils/chat-render-cache'
import { useMessageWindow, expandHistoryKeepingScroll } from '@/composables/useMessageWindow'
import type { Message, StreamState } from '../../../shared/types'

/** 首开挂载的最近消息条数（长会话不再一次性全挂） */
const INITIAL_WINDOW = 30
/** 每次向上补齐的条数 */
const HISTORY_CHUNK = 30
/** 滚动到距顶部多少像素内即自动补齐历史 */
const HISTORY_EXPAND_THRESHOLD = 120

// 模型选项接口
interface ModelOption {
  id: string
  name: string
  providerName: string
  providerId: string
  modelId: string
}

const props = defineProps<{
  messages: Message[]
  streamState: StreamState
  isGenerating: boolean
  availableModels?: ModelOption[]
  dialogTitle?: string
}>()

const emit = defineEmits<{
  (e: 'edit', messageId: string, newContent: string): void
  (e: 'delete', messageId: string): void
  (e: 'regenerate', userMessageId: string, modelId?: string): void
}>()

const listRef = ref<HTMLElement | null>(null)

// ===== 发送失败错误展示（N7 存量缺口补位）=====
// 错误码约定：主进程在 [AIHUB_*] 前缀中携带错误类别，此处解析映射为引导文案
const aihubErrorCode = computed(() => {
  const m = props.streamState?.error?.match(/^\[(AIHUB_[A-Z_]+)\]/)
  return m ? m[1] : null
})
const aihubErrorTitle = computed(() => {
  switch (aihubErrorCode.value) {
    case 'AIHUB_NOT_LOGGED_IN': return 'AI Hub 未登录'
    case 'AIHUB_SESSION_EXPIRED': return 'AI Hub 登录已过期'
    case 'AIHUB_INSUFFICIENT_BALANCE': return 'AI Hub 余额不足'
    default: return '发送失败'
  }
})
const displayErrorText = computed(() => props.streamState?.error?.replace(/^\[AIHUB_[A-Z_]+\]\s*/, '') || '')
function goAihubLogin(): void {
  // 跳设置页 AI Hub 账号 Tab（Settings 路由支持 ?tab= 定位）
  window.location.hash = '#/settings?tab=aihub'
}

// 用户是否正在手动滚动（保留语义占位：滚动检测接线在 MessageList 滚动容器上）
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

/**
 * 窗口化：只挂载最近 INITIAL_WINDOW 条，向上滚动再补齐。
 * 长会话说 (数百条) 一次性挂载 = 数百个组件 + 数百次 markdown 渲染 + 事件绑定，
 * 首开主线程因此出现长任务。
 */
const totalCount = computed(() => displayMessages.value.length)
const windowState = useMessageWindow(totalCount, { initialSize: INITIAL_WINDOW, chunkSize: HISTORY_CHUNK })

/**
 * 单遍预计算每条的序号/前后回答标记。
 * 旧实现把 getAnswerIndex/hasPrevAnswer/hasNextAnswer 直接写在模板里，每条消息各扫
 * 一遍数组（O(n²)），且每次重渲染都重算；这里一次遍历算完并随窗口切片复用。
 */
const displayMeta = computed(() => {
  const list = displayMessages.value
  const lastAssistant = list.map((m) => m.role === 'assistant').lastIndexOf(true)
  const rows: Array<{
    message: Message
    index: number
    answerIndex?: number
    hasPrevAnswer: boolean
    hasNextAnswer: boolean
  }> = []
  let answers = 0
  for (let i = 0; i < list.length; i++) {
    const isAssistant = list[i].role === 'assistant'
    if (isAssistant) answers++
    rows.push({
      message: list[i],
      index: i,
      answerIndex: isAssistant ? answers : undefined,
      // 前面已出现过助手消息 / 后面还有助手消息
      hasPrevAnswer: answers > (isAssistant ? 1 : 0),
      hasNextAnswer: isAssistant ? i < lastAssistant : lastAssistant > i,
    })
  }
  return rows
})

/** 当前窗口内的消息（带预计算元数据） */
const visibleMessages = computed(() => displayMeta.value.slice(windowState.startIndex.value))

/** 向上补齐历史，并保住滚动位置 */
async function loadMoreHistory(): Promise<void> {
  await expandHistoryKeepingScroll(
    listRef.value,
    '[data-message-id]',
    () => windowState.expandHistory(),
  )
}

// 消息组件引用存储
const messageRefs = new Map<string, any>()

function setMessageRef(el: any, messageId: string) {
  if (el) {
    messageRefs.set(messageId, el)
  } else {
    // Vue 卸载组件时 ref 回调收到 null：同步清理，避免窗口折叠/消息删除后残留失效引用
    messageRefs.delete(messageId)
  }
}

// 处理导航到上一个/下一个回答（基于完整消息列表的索引，非窗口内索引）
// 目标消息可能被虚拟窗口折叠（未挂载），直接取 ref 会因可选链静默吞掉：
// 先把窗口扩到覆盖目标，等 DOM 挂上后再取元素滚动
async function handleNavigateAnswer(currentIndex: number, direction: 'prev' | 'next'): Promise<void> {
  const targetIndex = direction === 'prev'
    ? findPrevAnswerIndex(currentIndex)
    : findNextAnswerIndex(currentIndex)

  if (targetIndex === -1) return
  // 窗口是"尾部窗口"（startIndex 到列表尾全部挂载），只有目标落在窗口之前才需扩窗；
  // 直接前移 startIndex（与 expandHistory 同机制，留一个 chunk 余量供导航后向上续载）
  if (targetIndex < windowState.startIndex.value) {
    windowState.startIndex.value = Math.max(0, targetIndex - HISTORY_CHUNK)
    await nextTick()
  }
  const targetMessage = displayMessages.value[targetIndex]
  const targetEl = messageRefs.get(targetMessage.id)
  if (targetEl?.$el) {
    targetEl.$el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

// 查找上一个回答的索引
function findPrevAnswerIndex(currentIndex: number): number {
  for (let i = currentIndex - 1; i >= 0; i--) {
    if (displayMessages.value[i]?.role === 'assistant') {
      return i
    }
  }
  return -1
}

// 查找下一个回答的索引
function findNextAnswerIndex(currentIndex: number): number {
  for (let i = currentIndex + 1; i < displayMessages.value.length; i++) {
    if (displayMessages.value[i]?.role === 'assistant') {
      return i
    }
  }
  return -1
}

// 格式化流式内容（带代码块）
// 缓存：流式 delta 每秒可触发数十次重渲染，同一份内容不该反复重跑占位符提取与转义
const streamRenderCache = createRenderCache((text: string) => renderStreamContent(text))

function formatStreamContent(content: string): string {
  return streamRenderCache.get('stream', content)
}

function renderStreamContent(content: string): string {
  if (!content) return ''

  // 提取代码块为占位符（含流式输出中的未闭合块）
  const { blocks, contentWithPlaceholders } = extractCodeBlocks(content)

  // 转义 HTML（占位符由字母数字组成，转义不受影响）
  let processedContent = escapeHtmlKeepPlaceholders(contentWithPlaceholders)

  // 处理行内代码
  processedContent = processedContent.replace(/`([^`]+)`/g, '<code>$1</code>')

  // 处理换行
  processedContent = processedContent.replace(/\n/g, '<br>')

  // 还原代码块为组件渲染（未闭合的显示"输出中"状态）
  return restoreCodeBlocks(processedContent, blocks, block =>
    renderCodeBlock(block.language, block.code, !block.closed)
  )
}

// 渲染代码块 HTML
function renderCodeBlock(language: string, code: string, isOpen: boolean = false): string {
  const lines = code.split('\n')
  const lineNumbers = lines.map((_, i) => `<span class="line-number">${i + 1}</span>`).join('')
  const codeLines = lines.map(line => escapeHtml(line)).join('\n')
  const openClass = isOpen ? 'code-block-open' : ''

  return `
    <div class="code-block-wrapper ${openClass}">
      <div class="code-header">
        <span class="language">${escapeHtml(language) || 'code'}${isOpen ? ' (输出中...)' : ''}</span>
        <button class="copy-btn" onclick="copyCodeFromBlock(this)" ${isOpen ? 'disabled title="代码块尚未完成"' : ''}>
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

  // 接近顶部时自动补齐历史（窗口化：长会话不一次性挂载）
  if (scrollTop < HISTORY_EXPAND_THRESHOLD && windowState.canExpand.value) {
    void loadMoreHistory()
  }
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
function handleCopy(_content: string): void {
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

// 暴露 DOM 元素给父组件
defineExpose({
  el: listRef
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
  // 自适应宽度，不再限制最大宽度
  width: 100%;
}

/* 折叠历史的展开入口（窗口化：长会话首开只挂最近若干条） */
.history-more {
  margin: 0 auto 14px;
  width: fit-content;
  padding: 5px 14px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color);
  border-radius: 999px;
  cursor: pointer;
  user-select: none;
}

.history-more:hover {
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
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
