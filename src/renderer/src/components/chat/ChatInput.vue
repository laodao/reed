<template>
  <div class="chat-input">
    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="tool-left">
        <el-tooltip content="附件（开发中）" placement="top">
          <el-button
            class="tool-btn"
            :class="{ active: hasAttachments }"
            text
            @click="handleAttach"
          >
            <el-icon><Paperclip /></el-icon>
          </el-button>
        </el-tooltip>

        <!-- 联网搜索下拉菜单 -->
        <el-dropdown trigger="click" @command="handleWebSearchCommand">
          <el-button
            class="tool-btn"
            :class="{ active: webSearchEnabled }"
            text
          >
            <el-icon><Search /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="close" :class="{ 'is-active': !webSearchEnabled }">
                关闭
              </el-dropdown-item>
              <el-dropdown-item command="model" :class="{ 'is-active': webSearchEnabled && webSearchEngine === 'model' }">
                模型自带搜索
              </el-dropdown-item>
              <el-dropdown-item command="baidu" :class="{ 'is-active': webSearchEnabled && webSearchEngine === 'baidu' }">
                百度
              </el-dropdown-item>
              <el-dropdown-item command="bing" :class="{ 'is-active': webSearchEnabled && webSearchEngine === 'bing' }">
                Bing
              </el-dropdown-item>
              <el-dropdown-item command="google" :class="{ 'is-active': webSearchEnabled && webSearchEngine === 'google' }">
                Google
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>

        <!-- 深度思考按钮 -->
        <el-tooltip
          :content="thinkingTooltip"
          placement="top"
          :disabled="thinkingDisabled"
        >
          <el-button
            class="tool-btn"
            :class="{ active: enableThinkingChain, disabled: thinkingDisabled }"
            text
            :disabled="thinkingDisabled"
            @click="enableThinkingChain = !enableThinkingChain"
          >
            <el-icon><Cpu /></el-icon>
          </el-button>
        </el-tooltip>

        <el-tooltip content="知识库（开发中）" placement="top">
          <el-button
            class="tool-btn"
            :class="{ active: enableKnowledgeBase }"
            text
            @click="enableKnowledgeBase = !enableKnowledgeBase"
          >
            <el-icon><Collection /></el-icon>
          </el-button>
        </el-tooltip>
      </div>
      <div class="tool-right">
        <span class="tool-hint">Ctrl + Enter 发送</span>
      </div>
    </div>

    <!-- 输入区域 -->
    <div class="input-area">
      <el-input
        v-model="inputContent"
        type="textarea"
        :rows="3"
        :placeholder="disabled ? '请等待 AI 响应完成...' : '输入消息...'"
        :disabled="disabled"
        resize="none"
        @keydown="handleKeydown"
        class="input-textarea"
      />

      <div class="input-actions">
        <div class="action-left">
          <!-- 联网搜索状态指示 -->
          <span v-if="webSearchEnabled" class="status-tag">
            <el-icon><Search /></el-icon>
            {{ webSearchEngineLabel }}
          </span>
          <!-- 深度思考状态指示 -->
          <span v-if="enableThinkingChain" class="status-tag">
            <el-icon><Cpu /></el-icon>
            深度思考
          </span>
        </div>
        <div class="action-right">
          <el-button v-if="disabled" type="danger" round @click="$emit('stop')">
            <el-icon><VideoPause /></el-icon>
            停止
          </el-button>
          <el-button
            v-else
            type="primary"
            round
            :disabled="!inputContent.trim()"
            @click="handleSend"
          >
            <el-icon><Promotion /></el-icon>
            发送
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Paperclip, Search, Cpu, Collection, VideoPause, Promotion } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import type { Message, WebSearchEngine } from '../../../shared/types'

const props = defineProps<{
  disabled: boolean
  /** 当前模型信息 */
  currentModel?: {
    supportsThinking?: boolean
    supportsWebSearch?: boolean
  }
}>()

const emit = defineEmits<{
  (e: 'send', content: string, options?: {
    attachments?: Message['attachments']
    webSearch?: {
      enabled: boolean
      engine: WebSearchEngine
    }
    enableThinkingChain?: boolean
  }): void
  (e: 'stop'): void
}>()

// 输入内容
const inputContent = ref('')

// 工具选项
const webSearchEngine = ref<WebSearchEngine | null>(null)
const enableThinkingChain = ref(false)
const enableKnowledgeBase = ref(false)
const hasAttachments = ref(false)

// 计算属性：联网搜索是否启用
const webSearchEnabled = computed(() => webSearchEngine.value !== null)

// 计算属性：联网搜索引擎标签
const webSearchEngineLabel = computed(() => {
  switch (webSearchEngine.value) {
    case 'model': return '模型搜索'
    case 'baidu': return '百度搜索'
    case 'bing': return 'Bing 搜索'
    case 'google': return 'Google 搜索'
    default: return ''
  }
})

// 计算属性：深度思考是否禁用
const thinkingDisabled = computed(() => {
  // 如果模型信息不存在，默认不禁用
  if (!props.currentModel) return false
  // 根据模型能力决定是否禁用
  return !props.currentModel.supportsThinking
})

// 计算属性：深度思考提示文本
const thinkingTooltip = computed(() => {
  if (thinkingDisabled.value) {
    return '当前模型不支持深度思考'
  }
  return '深度思考'
})

// 处理联网搜索命令
function handleWebSearchCommand(command: string): void {
  if (command === 'close') {
    webSearchEngine.value = null
  } else {
    webSearchEngine.value = command as WebSearchEngine
  }
}

// 发送消息
function handleSend(): void {
  const content = inputContent.value.trim()
  if (!content) return

  emit('send', content, {
    webSearch: webSearchEnabled.value ? {
      enabled: true,
      engine: webSearchEngine.value!
    } : undefined,
    enableThinkingChain: enableThinkingChain.value && !thinkingDisabled.value
  })

  inputContent.value = ''
}

// 键盘事件
function handleKeydown(event: KeyboardEvent): void {
  if (event.ctrlKey && event.key === 'Enter') {
    event.preventDefault()
    handleSend()
  }
}

// 附件处理（暂未实现）
function handleAttach(): void {
  ElMessage.info('附件功能开发中')
}
</script>

<style lang="scss" scoped>
.chat-input {
  border-top: 1px solid #e2e8f0;
  background: #fff;
  padding: 10px 16px;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.tool-left {
  display: flex;
  gap: 2px;
}

.tool-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  color: #64748b;

  &:hover {
    background: #f1f5f9;
    color: var(--el-color-primary);
  }

  &.active {
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
  }

  &.disabled {
    color: #c0c4cc;
    cursor: not-allowed;

    &:hover {
      background: transparent;
      color: #c0c4cc;
    }
  }
}

.tool-right {
  .tool-hint {
    font-size: 11px;
    color: #94a3b8;
  }
}

.input-area {
  position: relative;
}

.input-textarea {
  :deep(.el-textarea__inner) {
    border-radius: 12px;
    border-color: #e2e8f0;
    padding: 12px;
    font-size: 14px;
    line-height: 1.5;
    resize: none !important;

    &:focus {
      border-color: var(--el-color-primary);
      box-shadow: 0 0 0 3px var(--el-color-primary-light-8);
    }

    &::placeholder {
      color: #94a3b8;
    }
  }
}

.input-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
}

.action-left {
  display: flex;
  gap: 8px;

  .status-tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    font-size: 12px;
    color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
    border-radius: 4px;
  }
}

.action-right {
  display: flex;
  gap: 8px;
}

// 下拉菜单激活状态
:deep(.el-dropdown-menu__item.is-active) {
  color: var(--el-color-primary);
  background-color: var(--el-color-primary-light-9);
}
</style>