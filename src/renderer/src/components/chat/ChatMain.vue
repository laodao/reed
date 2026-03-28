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
      :all-knowledge-bases="allKnowledgeBases"
      :selected-knowledge-base-ids="dialog.knowledgeBaseIds"
      :web-search-config="dialog.webSearchConfig"
      @send="handleSend"
      @stop="$emit('stopGeneration')"
      @update-knowledge-base-ids="handleUpdateKnowledgeBaseIds"
      @update-web-search-config="handleUpdateWebSearchConfig"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import ChatHeader from './ChatHeader.vue'
import MessageList from './MessageList.vue'
import ChatInput from './ChatInput.vue'
import type { Dialog, Message, StreamState, ContextConfig, WebSearchEngine, UserProviderConfig, ModelDefinition, DialogWebSearchConfig } from '../../../shared/types'

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
    knowledgeBaseIds?: string[]
  }): void
  (e: 'stopGeneration'): void
  (e: 'clearMessages'): void
  (e: 'updateConfig', dialogId: string, config: {
    modelId?: string
    providerConfigId?: string
    systemPrompt?: string
    contextConfig?: ContextConfig
    knowledgeBaseIds?: string[]
    webSearchConfig?: DialogWebSearchConfig
  }): void
  (e: 'editMessage', messageId: string, newContent: string): void
  (e: 'deleteMessage', messageId: string): void
  (e: 'regenerateMessage', userMessageId: string, modelId?: string): void
}>()

// 提供商配置列表
const providerConfigs = ref<UserProviderConfig[]>([])

// 知识库列表缓存
const knowledgeBasesCache = ref<Map<string, { id: string; name: string }>>(new Map())

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

// 加载知识库列表
async function loadKnowledgeBases(): Promise<void> {
  try {
    const response = await window.electronAPI.knowledgeBase.list()
    if (response.success && response.data) {
      knowledgeBasesCache.value.clear()
      response.data.forEach(kb => {
        knowledgeBasesCache.value.set(kb.id, { id: kb.id, name: kb.name })
      })
    }
  } catch (error) {
    console.error('加载知识库列表失败:', error)
  }
}

// 计算所有可用的知识库列表
const allKnowledgeBases = computed(() => {
  return Array.from(knowledgeBasesCache.value.values())
})

// 获取模型能力信息
function getModelCapabilities(providerConfig: UserProviderConfig, modelId: string): { supportsThinking?: boolean; supportsWebSearch?: boolean } | undefined {
  // 从 models 中查找
  if (providerConfig.models) {
    const model = providerConfig.models.find(m => m.id === modelId)
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
  knowledgeBaseIds?: string[]
}): void {
  emit('sendMessage', content, options)
}

// 模型选项接口
interface ModelOption {
  id: string
  name: string
  providerName: string
  providerId: string
  modelId: string
  type?: string  // 模型类型
  supportsThinking?: boolean
  supportsWebSearch?: boolean
  supportsTools?: boolean
}

/**
 * 检测模型是否为对话模型（文本或多模态）
 * @param modelId 模型 ID
 * @param modelDef 模型定义（可选）
 * @returns 是否为对话模型
 */
function isChatModel(modelId: string, modelDef?: ModelDefinition): boolean {
  // 如果有模型定义，检查类型
  if (modelDef?.type) {
    return modelDef.type === 'text' || modelDef.type === 'multimodal'
  }

  // 否则根据模型 ID 判断
  const id = modelId.toLowerCase()

  // 排除图像生成模型
  if (id.includes('dall-e') ||
      id.includes('stable-diffusion') ||
      id.includes('midjourney') ||
      id.includes('cogview') ||
      id.includes('wanx') ||
      (id.includes('image') && !id.includes('vision'))) {
    return false
  }

  // 排除视频生成模型
  if (id.includes('sora') || id.includes('video') || id.includes('runway')) {
    return false
  }

  // 排除音频模型
  if (id.includes('whisper') || id.includes('tts') || id.includes('audio')) {
    return false
  }

  // 排除嵌入模型
  if (id.includes('embedding') || id.includes('embed')) {
    return false
  }

  // 排除重排序模型
  if (id.includes('rerank')) {
    return false
  }

  return true
}

// 计算可用模型列表（用于换模型重答和消息显示）
// 只显示对话模型（文本和多模态模型），排除图像生成、视频、音频等模型
const availableModels = computed(() => {
  const models: ModelOption[] = []

  providerConfigs.value.forEach(config => {
    // 从 models 字段获取启用的模型
    if (config.models) {
      config.models.forEach(modelDef => {
        // 过滤非对话模型
        if (!isChatModel(modelDef.id, modelDef)) {
          return
        }

        models.push({
          id: `${config.id}::${modelDef.id}`,
          name: modelDef.name,
          providerName: config.name,
          providerId: config.id,
          modelId: modelDef.id,
          type: modelDef?.type,
          supportsThinking: modelDef?.supportsThinking,
          supportsWebSearch: modelDef?.supportsWebSearch,
          supportsTools: modelDef?.supportsTools
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

// 处理知识库选择变化（用于持久化）
function handleUpdateKnowledgeBaseIds(ids: string[]): void {
  emit('updateConfig', props.dialog.id, { knowledgeBaseIds: ids })
}

// 处理联网搜索配置变化（用于持久化）
function handleUpdateWebSearchConfig(config: DialogWebSearchConfig | undefined): void {
  emit('updateConfig', props.dialog.id, { webSearchConfig: config })
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
  loadKnowledgeBases()
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
