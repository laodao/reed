<template>
  <div class="chat-main">
    <!-- 顶部标题栏 -->
    <ChatHeader
      :dialog="dialog"
      @update-config="(config) => $emit('updateConfig', dialog.id, config)"
      @clear-messages="$emit('clearMessages')"
    />

    <!-- 消息列表 -->
    <MessageList
      :messages="messages"
      :stream-state="streamState"
      :is-generating="isGenerating"
    />

    <!-- 输入区域 -->
    <ChatInput
      :disabled="isGenerating"
      @send="(content, options) => $emit('sendMessage', content, options)"
      @stop="$emit('stopGeneration')"
    />
  </div>
</template>

<script setup lang="ts">
import ChatHeader from './ChatHeader.vue'
import MessageList from './MessageList.vue'
import ChatInput from './ChatInput.vue'
import type { Dialog, Message, StreamState, ContextConfig } from '../../../shared/types'

defineProps<{
  dialog: Dialog
  messages: Message[]
  streamState: StreamState
  isGenerating: boolean
}>()

defineEmits<{
  (e: 'sendMessage', content: string, options?: {
    attachments?: Message['attachments']
    enableWebSearch?: boolean
    enableThinkingChain?: boolean
  }): void
  (e: 'stopGeneration'): void
  (e: 'clearMessages'): void
  (e: 'updateConfig', dialogId: string, config: {
    modelId?: string
    providerConfigId?: string
    systemPrompt?: string
    contextConfig?: ContextConfig
  }): void
}>()
</script>

<style lang="scss" scoped>
.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #fff;
  min-width: 0;
}
</style>
