<template>
  <div class="chat-main">
    <!-- 顶部标题栏 -->
    <ChatHeader
      :dialog="dialog"
      @update-config="(dialogId, config) => $emit('updateConfig', dialogId, config)"
      @clear-messages="$emit('clearMessages')"
    />

    <!-- 消息列表 -->
    <MessageList
      :messages="messages"
      :stream-state="streamState"
      :is-generating="isGenerating"
      :available-models="availableModels"
      @edit="handleMessageEdit"
      @delete="handleMessageDelete"
      @regenerate="handleMessageRegenerate"
    />

    <!-- 输入区域 -->
    <ChatInput
      :disabled="isGenerating"
      :current-model="currentModelInfo"
      @send="handleSend"
      @stop="$emit('stopGeneration')"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import ChatHeader from './ChatHeader.vue'
import MessageList from './MessageList.vue'
import ChatInput from './ChatInput.vue'
import type { Dialog, Message, StreamState, ContextConfig, WebSearchEngine, UserProviderConfig, ModelDefinition } from '../../../shared/types'

const props = defineProps<{
  dialog: Dialog
  messages: Message[]
  streamState: StreamState
  isGenerating: boolean
}>()

const emit = defineEmits<{
  (e: 'sendMessage', content: string, options?: {
    attachments?: Message['attachments']
    webSearch?: {
      enabled: boolean
      engine: WebSearchEngine
    }
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
  (e: 'editMessage', messageId: string, newContent: string): void
  (e: 'deleteMessage', messageId: string): void
  (e: 'regenerateMessage', userMessageId: string, modelId?: string): void
}>()

// 提供商配置列表
const providerConfigs = ref<UserProviderConfig[]>([])

// 加载提供商配置
async function loadProviderConfigs(): Promise<void> {
  try {
    const response = await window.electronAPI.providerConfig.list()
    if (response.success && response.configs) {
      providerConfigs.value = response.configs
    }
  } catch (error) {
    console.error('加载提供商配置失败:', error)
  }
}

// 获取模型能力信息
function getModelCapabilities(providerConfig: UserProviderConfig, modelId: string): { supportsThinking?: boolean; supportsWebSearch?: boolean } | undefined {
  // 优先从自定义模型中查找
  if (providerConfig.customModels) {
    const model = providerConfig.customModels.find(m => m.id === modelId)
    if (model) {
      return {
        supportsThinking: model.supportsThinking,
        supportsWebSearch: model.supportsWebSearch
      }
    }
  }
  return undefined
}

// 计算当前模型信息
const currentModelInfo = computed(() => {
  if (!props.dialog.modelId || !props.dialog.providerConfigId) {
    return undefined
  }

  const providerConfig = providerConfigs.value.find(c => c.id === props.dialog.providerConfigId)
  if (!providerConfig) {
    return undefined
  }

  return getModelCapabilities(providerConfig, props.dialog.modelId)
})

// 处理发送消息
function handleSend(content: string, options?: {
  attachments?: Message['attachments']
  webSearch?: {
    enabled: boolean
    engine: WebSearchEngine
  }
  enableThinkingChain?: boolean
}): void {
  emit('sendMessage', content, options)
}

// 计算可用模型列表（用于换模型重答）
const availableModels = computed(() => {
  const models: Array<{ id: string; name: string }> = []

  providerConfigs.value.forEach(config => {
    // 添加启用的模型
    if (config.enabledModels) {
      config.enabledModels.forEach(modelId => {
        // 查找模型名称
        let modelName = modelId

        // 从自定义模型中查找
        if (config.customModels) {
          const customModel = config.customModels.find(m => m.id === modelId)
          if (customModel) {
            modelName = customModel.name
          }
        }

        // 格式：提供商名称 / 模型名称
        models.push({
          id: `${config.id}::${modelId}`,
          name: `${config.name} / ${modelName}`
        })
      })
    }
  })

  return models
})

// 处理消息编辑
function handleMessageEdit(messageId: string, newContent: string): void {
  emit('editMessage', messageId, newContent)
}

// 处理消息删除
function handleMessageDelete(messageId: string): void {
  emit('deleteMessage', messageId)
}

// 处理消息重新生成
function handleMessageRegenerate(userMessageId: string, modelId?: string): void {
  emit('regenerateMessage', userMessageId, modelId)
}

// 监听 dialog 变化，重新加载配置
watch(
  () => props.dialog.providerConfigId,
  () => {
    loadProviderConfigs()
  }
)

onMounted(() => {
  loadProviderConfigs()
})
</script>

<style lang="scss" scoped>
.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color);
  min-width: 0;
}
</style>
