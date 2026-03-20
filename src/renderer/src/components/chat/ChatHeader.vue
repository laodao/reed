<template>
  <div class="chat-header">
    <div class="header-left">
      <h3 class="dialog-title">{{ dialog.title }}</h3>
    </div>
    <div class="header-center">
      <!-- 模型选择（按提供商分组显示，同时选择提供商和模型） -->
      <el-select
        v-model="selectedModelKey"
        size="small"
        placeholder="选择模型"
        class="model-select"
        filterable
        :filter-method="filterModels"
        @change="handleModelChange"
      >
        <el-option-group
          v-for="provider in filteredProviderModels"
          :key="provider.id"
          :label="provider.name"
        >
          <el-option
            v-for="model in provider.models"
            :key="`${provider.id}:${model.id}`"
            :label="`${provider.shortId}/${model.name}`"
            :value="`${provider.id}:${model.id}`"
          >
            <div class="model-option">
              <div class="model-info-row">
                <span class="model-name">{{ provider.shortId }}/{{ model.name }}</span>
                <span class="model-context">{{ formatContext(model.contextWindow) }}</span>
              </div>
              <!-- 模型特性图标 -->
              <div class="model-features" v-if="model.supportsThinking || model.supportsWebSearch || model.supportsTools || model.type">
                <el-tooltip v-if="model.supportsThinking" content="支持深度思考" placement="top">
                  <el-icon class="feature-icon thinking"><Cpu /></el-icon>
                </el-tooltip>
                <el-tooltip v-if="model.supportsWebSearch" content="支持联网搜索" placement="top">
                  <el-icon class="feature-icon websearch"><Search /></el-icon>
                </el-tooltip>
                <el-tooltip v-if="model.supportsTools" content="支持工具调用" placement="top">
                  <el-icon class="feature-icon tools"><SetUp /></el-icon>
                </el-tooltip>
              </div>
            </div>
          </el-option>
        </el-option-group>
      </el-select>
    </div>
    <div class="header-right">
      <el-button text size="small" @click="showSettingsDialog = true">
        <el-icon><Setting /></el-icon>
      </el-button>
      <el-button text size="small" @click="$emit('clearMessages')">
        <el-icon><Delete /></el-icon>
      </el-button>
    </div>

    <!-- 设置对话框 -->
    <el-dialog v-model="showSettingsDialog" title="对话设置" width="440px" :close-on-click-modal="false">
      <el-form :model="settingsForm" label-width="90px" size="default">
        <el-form-item label="对话标题">
          <el-input v-model="settingsForm.title" placeholder="请输入对话标题" maxlength="50" show-word-limit />
        </el-form-item>
        <el-form-item label="系统提示">
          <el-input
            v-model="settingsForm.systemPrompt"
            type="textarea"
            :rows="4"
            placeholder="自定义系统提示词"
          />
        </el-form-item>
        <el-form-item label="上下文限制">
          <div class="setting-row">
            <el-input-number
              v-model="settingsForm.maxMessages"
              :min="1"
              :max="100"
              size="small"
            />
            <span class="setting-hint">条消息</span>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showSettingsDialog = false">取消</el-button>
        <el-button type="primary" @click="handleSaveSettings">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, computed, onMounted } from 'vue'
import { Setting, Delete, Cpu, Search, SetUp } from '@element-plus/icons-vue'
import type { Dialog, ContextConfig, UserProviderConfig, ModelDefinition, ProviderTemplate } from '../../../shared/types'
import { useDialogStore } from '../../stores/dialog'

const props = defineProps<{
  dialog: Dialog
}>()

// 直接获取 dialogStore，用于立即更新 currentDialog
const dialogStore = useDialogStore()

const emit = defineEmits<{
  (e: 'updateConfig', dialogId: string, config: {
    modelId?: string
    providerConfigId?: string
    systemPrompt?: string
    contextConfig?: ContextConfig
  }): void
  (e: 'clearMessages'): void
}>()

// 提供商配置列表
const providerConfigs = ref<UserProviderConfig[]>([])
// 提供商模板列表（用于验证模型）
const providerTemplates = ref<ProviderTemplate[]>([])
// 选中的模型键：格式为 "providerConfigId:modelId"
const selectedModelKey = ref<string>('')
// 记录上次处理的 dialog id，用于检测切换对话
const lastDialogId = ref<string>('')
// 记录正在切换模型的对话 ID（而不是简单的布尔值）
const changingModelDialogId = ref<string | null>(null)

// 提供商模型列表（用于显示）
const providerModels = computed(() => {
  const result: Array<{ id: string; name: string; shortId: string; models: Array<{ id: string; name: string; contextWindow: number }> }> = []

  console.log('[ChatHeader.providerModels] 开始计算模型列表')
  console.log('[ChatHeader.providerModels] providerConfigs 数量:', providerConfigs.value.length)
  console.log('[ChatHeader.providerModels] providerTemplates 数量:', providerTemplates.value.length)

  for (const config of providerConfigs.value) {
    if (!config.isEnabled) continue

    console.log(`[ChatHeader.providerModels] 处理提供商: ${config.name}, id: ${config.id}, shortId: ${config.shortId}`)

    const models: Array<{ id: string; name: string; contextWindow: number }> = []
    const addedModelIds = new Set<string>() // 跟踪已添加的模型 ID

    // 获取该配置对应的模板
    const template = providerTemplates.value.find(t => t.id === config.templateId)
    console.log(`[ChatHeader.providerModels] 找到的模板:`, template ? { id: template.id, name: template.name, modelCount: template.models?.length } : null)

    // 模板中定义的有效模型 ID 列表
    // 注意：只有当模板有预定义模型且不为空时才进行验证
    // 如果模板 models 为空，说明模型是动态从 API 获取的，不应过滤
    const templateHasModels = template && template.models && template.models.length > 0
    const validModelIds = templateHasModels ? new Set(template.models.map(m => m.id)) : null
    console.log(`[ChatHeader.providerModels] 模板 ${template?.name} 是否有预定义模型:`, templateHasModels)

    // 1. 先添加自定义模型
    if (config.customModels) {
      console.log(`[ChatHeader.providerModels] 自定义模型:`, config.customModels)
      for (const model of config.customModels) {
        // 自定义模型也需要验证（如果模板不允许自定义模型，则跳过）
        if (template && !template.allowCustomModels) continue
        if (!config.enabledModels || config.enabledModels.includes(model.id)) {
          models.push({
            id: model.id,
            name: model.name,
            contextWindow: model.contextWindow
          })
          addedModelIds.add(model.id)
        }
      }
    }

    // 2. 添加启用的模型（从 enabledModels 列表）
    if (config.enabledModels) {
      console.log(`[ChatHeader.providerModels] enabledModels:`, config.enabledModels)
      for (const modelId of config.enabledModels) {
        // 跳过已添加的模型
        if (addedModelIds.has(modelId)) continue

        // 验证模型是否属于该提供商模板（如果模板有预定义模型）
        if (validModelIds && !validModelIds.has(modelId)) {
          console.warn(`[ChatHeader] 模型 ${modelId} 不属于提供商 ${config.name} 的模板 ${template?.name}，已过滤`)
          continue
        }

        // 尝试从 API 模型、模板或配置中获取模型名称
        let modelName = modelId
        let contextWindow = 8192

        // 优先从 apiModels 中查找（保存的 API 获取的模型信息）
        if (config.apiModels) {
          const apiModel = config.apiModels.find(m => m.id === modelId)
          if (apiModel) {
            modelName = apiModel.name || modelId
            contextWindow = apiModel.contextWindow || 8192
          }
        }

        // 如果 apiModels 中没有，尝试从模板中查找
        if (modelName === modelId && template?.models) {
          const templateModel = template.models.find(m => m.id === modelId)
          if (templateModel) {
            modelName = templateModel.name || modelId
            contextWindow = templateModel.contextWindow || 8192
          }
        }

        // 从 apiModels 中获取模型特性
        const apiModelInfo = config.apiModels?.find(m => m.id === modelId)

        models.push({
          id: modelId,
          name: modelName,
          contextWindow,
          type: apiModelInfo?.type,
          supportsThinking: apiModelInfo?.supportsThinking,
          supportsWebSearch: apiModelInfo?.supportsWebSearch,
          supportsTools: apiModelInfo?.supportsTools
        })
        addedModelIds.add(modelId)
      }
    }

    // 3. 如果没有启用的模型，使用模板的默认模型列表
    if (models.length === 0 && template && template.models.length > 0) {
      console.log(`[ChatHeader.providerModels] 提供商 ${config.name} 没有有效模型，使用模板默认模型`)
      for (const model of template.models) {
        models.push({
          id: model.id,
          name: model.name || model.id,
          contextWindow: model.contextWindow || 8192
        })
      }
    }

    console.log(`[ChatHeader.providerModels] 提供商 ${config.name} 最终模型列表:`, models.map(m => m.id))

    if (models.length > 0) {
      // 获取提供商的显示名称：优先使用 shortId，其次使用配置名称
      // 注意：shortId 是用户设置的短标识符，不应该显示数据库 id
      const displayShortId = config.shortId || config.name

      result.push({
        id: config.id,
        name: config.name,
        shortId: displayShortId,
        models
      })
    }
  }

  console.log('[ChatHeader.providerModels] 最终结果:', result.map(r => ({ name: r.name, shortId: r.shortId, models: r.models.map(m => m.id) })))

  return result
})

// 模型搜索关键词
const modelSearchKeyword = ref('')

// 过滤后的模型列表
const filteredProviderModels = computed(() => {
  if (!modelSearchKeyword.value) {
    return providerModels.value
  }

  const keyword = modelSearchKeyword.value.toLowerCase()
  const result: Array<{ id: string; name: string; shortId: string; models: Array<{ id: string; name: string; contextWindow: number }> }> = []

  for (const provider of providerModels.value) {
    // 过滤模型（包括 shortId 搜索）
    const filteredModels = provider.models.filter(model =>
      model.name.toLowerCase().includes(keyword) ||
      model.id.toLowerCase().includes(keyword) ||
      provider.name.toLowerCase().includes(keyword) ||
      provider.shortId.toLowerCase().includes(keyword)
    )

    // 如果有匹配的模型或提供商名称匹配，添加到结果
    if (filteredModels.length > 0) {
      result.push({
        ...provider,
        models: filteredModels
      })
    }
  }

  return result
})

// 模型搜索过滤方法
function filterModels(keyword: string): void {
  modelSearchKeyword.value = keyword
}

// 加载提供商配置
async function loadProviderConfigs(): Promise<void> {
  try {
    // 加载提供商配置
    const response = await window.electronAPI.providerConfig.list()
    if (response.success && response.configs) {
      providerConfigs.value = response.configs.filter((c: UserProviderConfig) => c.isEnabled)

      // 如果没有加载过选中状态，设置默认值
      if (!selectedModelKey.value && props.dialog) {
        updateSelectedModelFromDialog()
      }
    }

    // 加载提供商模板（用于验证模型）
    const templatesResponse = await window.electronAPI.providerTemplate.list()
    if (templatesResponse.success && templatesResponse.templates) {
      providerTemplates.value = templatesResponse.templates
    }
  } catch (error) {
    console.error('加载提供商配置失败:', error)
  }
}

// 设置对话框
const showSettingsDialog = ref(false)
const settingsForm = reactive({
  title: '',
  systemPrompt: '',
  maxMessages: 20
})

// 从 dialog 更新选中的模型
function updateSelectedModelFromDialog(): void {
  const providerId = props.dialog.providerConfigId || getDefaultProviderId()
  const modelId = props.dialog.modelId
  if (providerId && modelId) {
    const newKey = `${providerId}:${modelId}`
    selectedModelKey.value = newKey
    console.log('[ChatHeader.updateSelectedModelFromDialog] 设置 selectedModelKey:', newKey)
  }
}

// 获取默认提供商 ID
function getDefaultProviderId(): string {
  const defaultProvider = providerConfigs.value.find(c => c.isDefault)
  return defaultProvider?.id || providerConfigs.value[0]?.id || ''
}

// 监听 dialog 变化（使用 getter 函数返回对象属性来实现深度监听）
watch(
  [
    () => props.dialog.id,
    () => props.dialog.modelId,
    () => props.dialog.providerConfigId
  ],
  ([dialogId, modelId, providerConfigId], [oldDialogId]) => {
    console.log('[ChatHeader.watch] dialog 属性变化:', { dialogId, modelId, providerConfigId, oldDialogId })

    // 更新设置表单
    settingsForm.title = props.dialog.title
    settingsForm.systemPrompt = props.dialog.systemPrompt || ''
    settingsForm.maxMessages = props.dialog.contextConfig?.maxMessages || 20

    // 判断是否应该跳过更新
    // 只有当前对话正在切换模型时才跳过，切换到其他对话时不跳过
    const shouldSkipUpdate = changingModelDialogId.value === dialogId
    if (shouldSkipUpdate) {
      console.log('[ChatHeader.watch] 当前对话正在切换模型，跳过更新')
      return
    }

    // 如果切换到了不同的对话，清除之前的切换状态
    if (dialogId !== oldDialogId && changingModelDialogId.value === oldDialogId) {
      console.log('[ChatHeader.watch] 切换到不同对话，清除旧的切换状态')
      changingModelDialogId.value = null
    }

    // 更新选中的模型
    const providerId = providerConfigId || getDefaultProviderId()
    console.log('[ChatHeader.watch] 计算的 providerId:', providerId, ', 传入的 providerConfigId:', providerConfigId)
    if (providerId && modelId) {
      const newKey = `${providerId}:${modelId}`
      console.log('[ChatHeader.watch] newKey:', newKey, ', 当前 selectedModelKey:', selectedModelKey.value)
      if (selectedModelKey.value !== newKey) {
        selectedModelKey.value = newKey
        console.log('[ChatHeader.watch] 更新 selectedModelKey:', newKey)
      }
    }

    // 更新 lastDialogId
    if (dialogId !== lastDialogId.value) {
      lastDialogId.value = dialogId
    }
  },
  { immediate: true }
)

// 监听提供商配置加载完成
watch(
  () => providerConfigs.value.length,
  () => {
    if (providerConfigs.value.length > 0 && !selectedModelKey.value) {
      updateSelectedModelFromDialog()
    }
  }
)

// 格式化上下文窗口大小
function formatContext(contextWindow: number): string {
  if (contextWindow >= 1000000) {
    return `${(contextWindow / 1000000).toFixed(1)}M`
  }
  if (contextWindow >= 1000) {
    return `${Math.round(contextWindow / 1000)}K`
  }
  return `${contextWindow}`
}

// 处理模型变更
function handleModelChange(modelKey: string): void {
  console.log('[ChatHeader.handleModelChange] ========== 开始处理模型变更 ==========')
  console.log('[ChatHeader.handleModelChange] modelKey:', modelKey)
  console.log('[ChatHeader.handleModelChange] props.dialog.id:', props.dialog.id)
  console.log('[ChatHeader.handleModelChange] 当前 dialog.modelId:', props.dialog.modelId)
  console.log('[ChatHeader.handleModelChange] 当前 dialog.providerConfigId:', props.dialog.providerConfigId)
  if (!modelKey) return

  // 解析选中的值：格式为 "providerConfigId:modelId"
  const parts = modelKey.split(':')
  console.log('[ChatHeader.handleModelChange] 解析结果, parts:', parts)
  if (parts.length < 2) {
    console.error('[ChatHeader.handleModelChange] 解析失败, parts.length < 2')
    return
  }

  const providerConfigId = parts[0]
  const modelId = parts.slice(1).join(':') // 处理模型 ID 中可能包含冒号的情况

  console.log('[ChatHeader.handleModelChange] 解析后的值:')
  console.log('[ChatHeader.handleModelChange]   providerConfigId:', providerConfigId)
  console.log('[ChatHeader.handleModelChange]   modelId:', modelId)

  console.log('[ChatHeader.handleModelChange] 模型变更详情:', {
    modelKey,
    providerConfigId,
    modelId,
    dialogId: props.dialog.id,
    currentDialogModelId: props.dialog.modelId,
    currentDialogProviderId: props.dialog.providerConfigId
  })

  // 检查是否真的发生了变化
  const isModelChanged = props.dialog.modelId !== modelId
  const isProviderChanged = props.dialog.providerConfigId !== providerConfigId
  console.log('[ChatHeader.handleModelChange] 变化检测:', {
    isModelChanged,
    isProviderChanged,
    oldModelId: props.dialog.modelId,
    newModelId: modelId,
    oldProviderId: props.dialog.providerConfigId,
    newProviderId: providerConfigId
  })

  if (providerConfigId && modelId) {
    // 记录正在切换模型的对话 ID（而不是简单的布尔值）
    changingModelDialogId.value = props.dialog.id

    // 先更新本地状态，确保 UI 立即反映变化
    selectedModelKey.value = modelKey

    // ===== 关键：立即更新 store 中的 currentDialog =====
    if (dialogStore.currentDialog && dialogStore.currentDialog.id === props.dialog.id) {
      dialogStore.currentDialog = {
        ...dialogStore.currentDialog,
        modelId,
        providerConfigId
      }
      console.log('[ChatHeader.handleModelChange] 立即更新了 currentDialog')
      console.log('[ChatHeader.handleModelChange] 新的 modelId:', dialogStore.currentDialog.modelId)
      console.log('[ChatHeader.handleModelChange] 新的 providerConfigId:', dialogStore.currentDialog.providerConfigId)
    }

    console.log('[ChatHeader.handleModelChange] 准备发送 updateConfig 事件（异步写数据库）')
    // 发送更新请求（异步写数据库，不阻塞）
    emit('updateConfig', props.dialog.id, {
      modelId,
      providerConfigId
    })

    // 延迟后重置标志
    setTimeout(() => {
      if (changingModelDialogId.value === props.dialog.id) {
        changingModelDialogId.value = null
      }
    }, 300)
  }
}

// 保存设置
function handleSaveSettings(): void {
  emit('updateConfig', props.dialog.id, {
    systemPrompt: settingsForm.systemPrompt,
    contextConfig: {
      maxMessages: settingsForm.maxMessages,
      maxTokens: 4096
    }
  })
  showSettingsDialog.value = false
}

onMounted(() => {
  loadProviderConfigs()
})
</script>

<style lang="scss" scoped>
.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  border-bottom: 1px solid #e2e8f0;
  background: #fff;
}

.header-left {
  display: flex;
  align-items: center;
  min-width: 0;
}

.dialog-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #1e293b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-center {
  display: flex;
  align-items: center;
  gap: 8px;
}

.model-select {
  width: 200px;

  :deep(.el-input__wrapper) {
    border-radius: 8px;
  }
}

.model-option {
  display: flex;
  flex-direction: column;
  width: 100%;
  gap: 2px;

  .model-info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;

    .model-name {
      font-size: 13px;
      color: #334155;
    }

    .model-context {
      font-size: 11px;
      color: #94a3b8;
      background: #f1f5f9;
      padding: 2px 6px;
      border-radius: 4px;
    }
  }

  .model-features {
    display: flex;
    align-items: center;
    gap: 4px;

    .feature-icon {
      font-size: 12px;

      &.thinking {
        color: #67C23A;
      }

      &.websearch {
        color: #409EFF;
      }

      &.tools {
        color: #909399;
      }
    }
  }
}

.header-right {
  display: flex;
  gap: 4px;
}

.setting-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.setting-hint {
  font-size: 13px;
  color: #64748b;
}
</style>
