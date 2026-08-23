<template>
  <div class="agent-chat-view">
    <!-- 消息列表 -->
    <div ref="scrollRef" class="chat-scroll">
      <div class="chat-inner">
        <!-- 空态：欢迎 + 引导 -->
        <div v-if="chat.messages.value.length === 0" class="chat-empty">
          <div class="empty-logo">
            <el-icon :size="34"><MagicStick /></el-icon>
          </div>
          <h2>开始你的故事</h2>
          <p class="empty-desc">
            把想法告诉我，我会一步步陪你完成设定、大纲和正文。<br />
            比如：
          </p>
          <div class="empty-suggestions">
            <button v-for="(s, i) in WELCOME_SUGGESTIONS" :key="i" class="suggestion-chip" @click="onSuggestion(s)">
              {{ s }}
            </button>
          </div>
        </div>

        <!-- 消息 -->
        <div
          v-for="msg in chat.messages.value"
          :key="msg.id"
          class="msg-row"
          :class="[msg.role === 'user' ? 'msg-user' : 'msg-ai']"
        >
          <!-- 用户消息 -->
          <template v-if="msg.role === 'user'">
            <div class="bubble user-bubble">{{ msg.content }}</div>
          </template>

          <!-- AI 消息 -->
          <template v-else>
            <div class="ai-avatar"><el-icon><MagicStick /></el-icon></div>
            <div class="ai-body">
              <!-- 过程状态（同一气泡内演进） -->
              <div v-if="msg.status === 'pending'" class="ai-thinking">
                <span class="typing-dots"><i /><i /><i /></span>
                <span class="thinking-text">{{ thinkingText }}</span>
              </div>
              <div v-else-if="msg.status === 'streaming'" class="ai-thinking streaming">
                <span class="typing-dots"><i /><i /><i /></span>
                <span class="thinking-text">AI 正在组织回复…</span>
              </div>

              <!-- 正文 -->
              <div v-if="msg.content" class="bubble ai-bubble" :class="{ streaming: msg.status === 'streaming' }">
                <span class="ai-content">{{ msg.content }}<span v-if="msg.status === 'streaming'" class="caret" /></span>
              </div>

              <!-- 动作执行进度（acting 阶段） -->
              <div v-if="chat.stage.value === 'acting' && msg === lastAssistant" class="action-progress">
                <el-progress :percentage="100" :indeterminate="true" :stroke-width="3" :show-text="false" />
                <span class="action-label">{{ chat.currentActionLabel.value || 'AI 正在生成内容…' }}</span>
              </div>

              <!-- 内嵌产物预览卡 -->
              <AgentPreviewCards v-if="msg.actions && msg.actions.length > 0" :actions="msg.actions" />

              <!-- 错误 -->
              <div v-if="msg.status === 'error' && msg.error" class="ai-error">
                <el-icon><WarningFilled /></el-icon>
                <span>{{ msg.error }}</span>
              </div>

              <!-- 下一步建议 chips -->
              <div v-if="msg.status === 'done' && msg.suggestions && msg.suggestions.length > 0" class="suggestion-row">
                <button v-for="(s, i) in msg.suggestions" :key="i" class="suggestion-chip next" @click="onSuggestion(s)">
                  {{ s }}
                  <el-icon class="chip-arrow"><ArrowRight /></el-icon>
                </button>
              </div>
            </div>
          </template>
        </div>

        <!-- 底部留白 -->
        <div class="chat-bottom-space" />
      </div>
    </div>

    <!-- 输入区 -->
    <div class="chat-input-area">
      <div v-if="chat.error.value" class="input-error">{{ chat.error.value }}</div>
      <div class="input-box">
        <el-input
          ref="inputRef"
          v-model="draft"
          type="textarea"
          :autosize="{ minRows: 1, maxRows: 6 }"
          :placeholder="chat.sending.value ? 'AI 正在处理，请稍候…' : '和 AI 说说你的想法…'"
          :disabled="chat.sending.value"
          resize="none"
          @keydown.enter.exact.prevent="onSend"
          @keydown.enter.shift.prevent=""
        />
        <div class="input-actions">
          <span class="input-hint">Enter 发送 · Shift+Enter 换行</span>
          <div class="input-buttons">
            <el-button v-if="chat.sending.value" text class="cancel-btn" @click="onCancel">
              <el-icon><CircleClose /></el-icon>
              打断
            </el-button>
            <el-button
              type="primary"
              circle
              class="send-btn"
              :disabled="!draft.trim() || chat.sending.value"
              :loading="chat.sending.value"
              @click="onSend"
            >
              <el-icon v-if="!chat.sending.value"><Promotion /></el-icon>
            </el-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 对话区：消息流 + 过程状态 + 预览卡 + 下一步 chips + 输入框。
 * 数据来自 useAgentChat；右侧面板联动由 AgentWorkspace 处理。
 */
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { MagicStick, ArrowRight, Promotion, CircleClose, WarningFilled } from '@element-plus/icons-vue'
import { useAgentChat } from '@/composables/useAgentChat'
import AgentPreviewCards from './AgentPreviewCards.vue'

const props = defineProps<{
  projectId: string
}>()

const emit = defineEmits<{
  /** 数据变更（面板联动） */
  (e: 'dataChanged', sections: string[]): void
}>()

const chat = useAgentChat({ projectId: props.projectId })
const draft = ref('')
const scrollRef = ref<HTMLElement | null>(null)
const inputRef = ref()

const WELCOME_SUGGESTIONS = [
  '我想写一个明朝锦衣卫与江湖门派对抗的故事',
  '帮我设计一个修仙题材的玄幻故事',
  '我想写一个都市悬疑推理小说',
]

const lastAssistant = computed(() => {
  const msgs = chat.messages.value
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === 'assistant') return msgs[i]
  }
  return null
})

const thinkingText = computed(() => {
  switch (chat.stage.value) {
    case 'deciding': return 'AI 正在思考…'
    case 'acting': return chat.currentActionLabel.value || 'AI 正在生成…'
    case 'summarizing': return 'AI 正在组织回复…'
    default: return 'AI 正在处理…'
  }
})

async function onSend(): Promise<void> {
  const text = draft.value.trim()
  if (!text || chat.sending.value) return
  draft.value = ''
  // 订阅本轮事件，把变更分区转发给面板
  const unsub = window.electronAPI.longwriting.onAgentEvent(props.projectId, (ev: any) => {
    if (ev.type === 'action:done' && ev.summary?.changed?.length) {
      emit('dataChanged', ev.summary.changed)
    }
  })
  await chat.send(text)
  unsub()
  scrollToBottom()
}

function onSuggestion(text: string): void {
  if (chat.sending.value) return
  void onSendFromSuggestion(text)
}

async function onSendFromSuggestion(text: string): Promise<void> {
  const unsub = window.electronAPI.longwriting.onAgentEvent(props.projectId, (ev: any) => {
    if (ev.type === 'action:done' && ev.summary?.changed?.length) {
      emit('dataChanged', ev.summary.changed)
    }
  })
  await chat.sendSuggestion(text)
  unsub()
  scrollToBottom()
}

function onCancel(): void {
  chat.cancel()
  ElMessage.info('已发送打断请求')
}

function scrollToBottom(): void {
  void nextTick(() => {
    if (scrollRef.value) {
      scrollRef.value.scrollTop = scrollRef.value.scrollHeight
    }
  })
}

watch(
  () => chat.messages.value.length,
  () => scrollToBottom(),
  { deep: true },
)

onMounted(async () => {
  await chat.loadHistory()
  scrollToBottom()
  void inputRef.value?.focus?.()
})
</script>

<style lang="scss" scoped>
.agent-chat-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
}

.chat-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 24px 28px 8px;
}

.chat-inner {
  max-width: 760px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

// ==================== 空态 ====================

.chat-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 72px 20px 40px;

  .empty-logo {
    width: 72px;
    height: 72px;
    border-radius: 22px;
    background: linear-gradient(135deg, var(--color-primary-light), var(--color-primary));
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: var(--shadow-glow);
    margin-bottom: 20px;
  }

  h2 {
    font-size: 22px;
    font-weight: 600;
    color: var(--text-color-primary);
    margin: 0 0 10px;
  }

  .empty-desc {
    font-size: 14px;
    color: var(--text-color-secondary);
    line-height: 1.8;
    margin: 0 0 24px;
  }
}

.empty-suggestions,
.suggestion-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.suggestion-chip {
  padding: 8px 16px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-color-light);
  background: var(--bg-color);
  color: var(--text-color-regular);
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition-fast);
  display: inline-flex;
  align-items: center;
  gap: 4px;

  &:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
    background: var(--color-primary-light-9);
    transform: translateY(-1px);
  }

  &.next {
    justify-content: flex-start;
    text-align: left;
  }

  .chip-arrow {
    font-size: 12px;
    opacity: 0.7;
  }
}

// ==================== 消息 ====================

.msg-row {
  display: flex;
  gap: 12px;
  animation: msg-in 0.25s cubic-bezier(0.4, 0, 0.2, 1);

  &.msg-user {
    justify-content: flex-end;
  }
}

@keyframes msg-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.bubble {
  border-radius: var(--radius-lg);
  padding: 12px 16px;
  font-size: 14px;
  line-height: 1.7;
  max-width: 82%;
  word-break: break-word;
  white-space: pre-wrap;
}

.user-bubble {
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark));
  color: #fff;
  border-bottom-right-radius: 6px;
  box-shadow: var(--shadow-sm);
}

.ai-avatar {
  width: 34px;
  height: 34px;
  border-radius: var(--radius-md);
  background: var(--fill-color);
  border: 1px solid var(--border-color-light);
  color: var(--color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 18px;
}

.ai-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ai-bubble {
  background: var(--bg-color);
  border: 1px solid var(--border-color-lighter);
  border-top-left-radius: 6px;
  box-shadow: var(--shadow-sm);

  &.streaming {
    border-color: var(--color-primary-light-5);
  }
}

.ai-content {
  white-space: pre-wrap;
}

.caret {
  display: inline-block;
  width: 2px;
  height: 1em;
  background: var(--color-primary);
  margin-left: 2px;
  vertical-align: text-bottom;
  animation: caret-blink 0.9s steps(2, start) infinite;
}

@keyframes caret-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

// ==================== 过程状态 ====================

.ai-thinking {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-color-secondary);
  font-size: 13px;
  padding: 4px 2px;

  .typing-dots {
    display: inline-flex;
    gap: 4px;

    i {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--color-primary-light);
      animation: typing-bounce 1.2s infinite;

      &:nth-child(2) { animation-delay: 0.15s; }
      &:nth-child(3) { animation-delay: 0.3s; }
    }
  }

  &.streaming .thinking-text {
    color: var(--color-primary);
  }
}

@keyframes typing-bounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
  30% { transform: translateY(-4px); opacity: 1; }
}

.action-progress {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 14px;
  border-radius: var(--radius-md);
  background: var(--fill-color-lighter);
  border: 1px solid var(--border-color-lighter);

  .action-label {
    font-size: 12px;
    color: var(--text-color-secondary);
  }
}

.ai-error {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--color-danger);
  padding: 8px 12px;
  border-radius: var(--radius-md);
  background: var(--color-danger-light-9);
}

// ==================== 输入区 ====================

.chat-input-area {
  padding: 12px 28px 16px;
  background: linear-gradient(180deg, transparent, var(--bg-color-page) 30%);
}

.input-box {
  max-width: 760px;
  margin: 0 auto;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--bg-color);
  box-shadow: var(--shadow-md);
  padding: 10px 12px 8px;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);

  &:focus-within {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px var(--color-primary-light-9), var(--shadow-md);
  }

  :deep(.el-textarea__inner) {
    border: none;
    box-shadow: none;
    padding: 2px 4px;
    background: transparent;
    font-size: 14px;
  }
}

.input-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 6px;

  .input-hint {
    font-size: 11px;
    color: var(--text-color-placeholder);
    padding-left: 4px;
  }

  .input-buttons {
    display: flex;
    align-items: center;
    gap: 6px;
  }
}

.cancel-btn {
  color: var(--text-color-secondary);
  font-size: 13px;
}

.send-btn {
  width: 34px;
  height: 34px;
}

.input-error {
  max-width: 760px;
  margin: 0 auto 8px;
  font-size: 12px;
  color: var(--color-danger);
  padding: 6px 12px;
  border-radius: var(--radius-md);
  background: var(--color-danger-light-9);
}

.chat-bottom-space {
  height: 8px;
}
</style>
