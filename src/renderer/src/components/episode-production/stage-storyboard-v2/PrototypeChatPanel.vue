<template>
  <!--
    PrototypeChatPanel · 原型右侧 AI 对话面板

    复用 useChat（dialogStore 流式对话）自建简化聊天 UI：
      - 消息列表（user/assistant 气泡 + 流式增量）
      - 输入框 + 发送按钮（AI 文字对话）
      + 🎨 生成图片按钮（用输入框文字调 useImage 文生图，完成后 emit 给主组件）
    对话与生图共享同一输入框：发送=对话，🎨=生图（互不干扰）。
  -->
  <aside class="proto-chat-panel">
    <header class="panel-header">
      <span class="panel-title">AI 对话</span>
      <el-button text size="small" :icon="Plus" @click="onNewDialog" :loading="creating">新对话</el-button>
    </header>

    <!-- 消息列表 -->
    <div ref="msgListRef" class="msg-list">
      <div v-if="messages.length === 0 && !isGenerating" class="msg-empty">
        输入「生成关键帧：画面描述」生成图片
      </div>
      <template v-for="m in messages" :key="m.id">
        <div class="msg-row" :class="`is-${m.role}`">
          <div class="msg-bubble">{{ m.content }}</div>
        </div>
      </template>
      <!-- 流式增量气泡 -->
      <div v-if="isGenerating && streamContent" class="msg-row is-assistant">
        <div class="msg-bubble is-streaming">{{ streamContent }}</div>
      </div>
    </div>

    <!-- 输入区 -->
    <footer class="input-area">
      <el-input
        v-model="inputText"
        type="textarea"
        :rows="3"
        resize="none"
        placeholder="输入提示词…"
        @keydown.enter.exact.prevent="onSend"
      />
      <div class="input-actions">
        <el-button
          type="primary"
          :loading="isGenerating || generatingImg"
          :disabled="!inputText.trim()"
          @click="onSend"
        >
          发送
        </el-button>
      </div>
    </footer>
  </aside>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onMounted } from 'vue'
import { Plus } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useChat } from '@/composables/useChat'
import { useImage } from '@/composables/useImage'
import type { ImageRecord } from '../../../../../shared/types/image.types'

const emit = defineEmits<{
  'image-generated': [image: ImageRecord]
}>()

const {
  currentDialog,
  messages,
  streamState,
  isGenerating,
  sendMessage,
  createNewDialog,
} = useChat()

const imageStore = useImage()

const inputText = ref('')
const creating = ref(false)
const generatingImg = ref(false)
const msgListRef = ref<HTMLElement | null>(null)
const myTaskId = ref<string | null>(null)

const streamContent = ref('')

// 同步流式增量内容
watch(
  () => streamState.value,
  (ss) => {
    streamContent.value = ss?.content ?? ''
    if (ss?.isStreaming) scrollToBottom()
  },
  { deep: true },
)

// 消息变化时滚动到底
watch(
  () => messages.value.length,
  () => nextTick(scrollToBottom),
)

// 确保有对话可用
onMounted(() => {
  if (!currentDialog.value) {
    void ensureDialog()
  }
})

watch(
  () => currentDialog.value?.id,
  (id) => {
    if (!id) void ensureDialog()
  },
)

async function ensureDialog(): Promise<void> {
  creating.value = true
  try {
    await createNewDialog({
      systemPrompt:
        '你是剧集分镜制作助手。用户会描述画面、关键帧、分镜需求，你可以帮其构思画面描述、镜头语言。当用户想生成图片时，会点「生成图片」按钮直接出图。',
    })
  } finally {
    creating.value = false
  }
}

async function onNewDialog(): Promise<void> {
  creating.value = true
  try {
    await createNewDialog()
  } finally {
    creating.value = false
  }
}

async function onSend(): Promise<void> {
  const text = inputText.value.trim()
  if (!text || isGenerating.value || generatingImg.value) return
  // 检测图片生成指令："生成图片：xxx" / "生成关键帧：xxx"（支持中英文冒号）-> 走文生图
  const m = text.match(/^(生成图片|生成关键帧)\s*[:：]\s*([\s\S]+)$/)
  if (m && m[2].trim()) {
    await onGenerateImage(m[2].trim())
    return
  }
  // 否则走正常 AI 对话
  if (!currentDialog.value) {
    await ensureDialog()
  }
  inputText.value = ''
  const ok = await sendMessage(text)
  if (!ok) {
    ElMessage.error('发送失败，请检查模型配置')
    inputText.value = text
  }
}

async function onGenerateImage(prompt: string): Promise<void> {
  if (generatingImg.value) return
  generatingImg.value = true
  try {
    const taskId = await imageStore.generateImage({
      prompt,
      width: 1024,
      height: 1024,
      count: 1,
    })
    if (!taskId) {
      ElMessage.error(imageStore.error.value || '生成失败，请先在设置里配置图床')
      return
    }
    myTaskId.value = taskId
    inputText.value = ''
    ElMessage.info('图片生成中…')
  } finally {
    generatingImg.value = false
  }
}

// 监听任务完成，emit 新图
watch(
  () => imageStore.currentTask.value,
  (task) => {
    if (!task || !myTaskId.value || task.taskId !== myTaskId.value) return
    if (task.status === 'completed') {
      myTaskId.value = null
      const newImg = imageStore.images.value[0]
      if (newImg) {
        emit('image-generated', newImg)
        ElMessage.success('图片已生成，已加入输出区')
      }
    } else if (task.status === 'failed') {
      myTaskId.value = null
      ElMessage.error(imageStore.error.value || task.error || '图片生成失败')
    }
  },
)

function scrollToBottom(): void {
  nextTick(() => {
    const el = msgListRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}
</script>

<style scoped lang="scss">
.proto-chat-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--el-bg-color);
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-light);

  .panel-title {
    flex: 1;
    font-size: 14px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }
}

.msg-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.msg-empty {
  margin: auto;
  text-align: center;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  line-height: 1.8;
  padding: 20px;
}

.msg-row {
  display: flex;

  &.is-user {
    justify-content: flex-end;
  }

  &.is-assistant {
    justify-content: flex-start;
  }
}

.msg-bubble {
  max-width: 85%;
  padding: 8px 12px;
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;

  .is-user & {
    background: var(--el-color-primary);
    color: #fff;
    border-bottom-right-radius: 2px;
  }

  .is-assistant & {
    background: var(--el-fill-color);
    color: var(--el-text-color-primary);
    border-bottom-left-radius: 2px;
  }

  &.is-streaming::after {
    content: '▍';
    animation: blink 1s infinite;
    color: var(--el-text-color-secondary);
  }
}

@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

.input-area {
  flex-shrink: 0;
  padding: 10px 12px;
  border-top: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.input-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
</style>
