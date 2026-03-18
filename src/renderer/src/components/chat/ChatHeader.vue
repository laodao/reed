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
        @change="handleModelChange"
      >
        <el-option-group
          v-for="provider in providerModels"
          :key="provider.id"
          :label="provider.name"
        >
          <el-option
            v-for="model in provider.models"
            :key="`${provider.id}:${model.id}`"
            :label="model.name"
            :value="`${provider.id}:${model.id}`"
          >
            <div class="model-option">
              <span class="model-name">{{ model.name }}</span>
              <span class="model-context">{{ formatContext(model.contextWindow) }}</span>
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
import { Setting, Delete } from '@element-plus/icons-vue'
import type { Dialog, ContextConfig, UserProviderConfig, ModelDefinition, ProviderTemplate } from '../../../shared/types'

const props = defineProps<{
  dialog: Dialog
}>()

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
// 标记是否正在本地更新（防止 watch 循环）
const isLocalUpdate = ref(false)
// 记录上次处理的 dialog id，用于检测切换对话
const lastDialogId = ref<string>('')

// 提供商模型列表（用于显示）
const providerModels = computed(() => {
  const result: Array<{ id: string; name: string; models: Array<{ id: string; name: string; contextWindow: number }> }> = []

  console.log('[ChatHeader.providerModels] 开始计算模型列表')
  console.log('[ChatHeader.providerModels] providerConfigs 数量:', providerConfigs.value.length)
  console.log('[ChatHeader.providerModels] providerTemplates 数量:', providerTemplates.value.length)

  for (const config of providerConfigs.value) {
    if (!config.isEnabled) continue

    console.log(`[ChatHeader.providerModels] 处理提供商: ${config.name}, id: ${config.id}, templateId: ${config.templateId}`)

    const models: Array<{ id: string; name: string; contextWindow: number }> = []

    // 获取该配置对应的模板
    const template = providerTemplates.value.find(t => t.id === config.templateId)
    console.log(`[ChatHeader.providerModels] 找到的模板:`, template ? { id: template.id, name: template.name, modelCount: template.models?.length } : null)

    // 模板中定义的有效模型 ID 列表
    const validModelIds = template ? new Set(template.models.map(m => m.id)) : null
    console.log(`[ChatHeader.providerModels] 有效模型 ID 列表:`, validModelIds ? Array.from(validModelIds) : null)

    // 自定义模型
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
        }
      }
    }

    // 添加启用的模型（必须验证是否属于该提供商模板）
    if (config.enabledModels && models.length === 0) {
      console.log(`[ChatHeader.providerModels] enabledModels:`, config.enabledModels)
      for (const modelId of config.enabledModels) {
        // 验证模型是否属于该提供商模板
        if (validModelIds && !validModelIds.has(modelId)) {
          console.warn(`[ChatHeader] 模型 ${modelId} 不属于提供商 ${config.name} 的模板 ${template?.name}，已过滤`)
          continue
        }
        models.push({
          id: modelId,
          name: modelId,
          contextWindow: 8192
        })
      }
    }

    // 如果 enabledModels 为空或全部无效，使用模板的默认模型列表
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
      result.push({
        id: config.id,
        name: config.name,
        models
      })
    }
  }

  console.log('[ChatHeader.providerModels] 最终结果:', result.map(r => ({ name: r.name, models: r.models.map(m => m.id) })))

  return result
})

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

// 从 dialog 更新选中的模型（仅在切换对话时调用）
function updateSelectedModelFromDialog(): void {
  if (isLocalUpdate.value) return

  const providerId = props.dialog.providerConfigId || getDefaultProviderId()
  const modelId = props.dialog.modelId
  if (providerId && modelId) {
    const newKey = `${providerId}:${modelId}`
    // 只有当 key 真正变化时才更新
    if (selectedModelKey.value !== newKey) {
      selectedModelKey.value = newKey
    }
  }
}

// 获取默认提供商 ID
function getDefaultProviderId(): string {
  const defaultProvider = providerConfigs.value.find(c => c.isDefault)
  return defaultProvider?.id || providerConfigs.value[0]?.id || ''
}

// 监听 dialog 变化
watch(
  () => props.dialog,
  (dialog, oldDialog) => {
    // 更新设置表单
    settingsForm.title = dialog.title
    settingsForm.systemPrompt = dialog.systemPrompt || ''
    settingsForm.maxMessages = dialog.contextConfig?.maxMessages || 20

    // 切换对话时，重置状态并更新选中的模型
    if (dialog.id !== lastDialogId.value) {
      lastDialogId.value = dialog.id
      isLocalUpdate.value = false
      updateSelectedModelFromDialog()
    } else {
      // 同一对话，检查模型是否被外部更新（或其他来源更新）
      // 如果 dialog.modelId 或 dialog.providerConfigId 变化了，需要同步 selectedModelKey
      const currentKey = selectedModelKey.value
      const dialogKey = `${dialog.providerConfigId || ''}:${dialog.modelId || ''}`

      if (currentKey !== dialogKey && dialog.modelId && dialog.providerConfigId) {
        // 模型被更新了，同步 UI 并重置标志
        selectedModelKey.value = dialogKey
        isLocalUpdate.value = false
        console.log('[ChatHeader.watch] 检测到模型更新，同步 selectedModelKey:', dialogKey)
      }
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
  if (!modelKey) return

  // 解析选中的值：格式为 "providerConfigId:modelId"
  const parts = modelKey.split(':')
  if (parts.length < 2) return

  const providerConfigId = parts[0]
  const modelId = parts.slice(1).join(':') // 处理模型 ID 中可能包含冒号的情况

  console.log('[ChatHeader.handleModelChange] 模型变更:', {
    modelKey,
    providerConfigId,
    modelId,
    dialogId: props.dialog.id,
    currentDialogModelId: props.dialog.modelId,
    currentDialogProviderId: props.dialog.providerConfigId
  })

  if (providerConfigId && modelId) {
    // 标记为本地更新
    isLocalUpdate.value = true

    emit('updateConfig', props.dialog.id, {
      modelId,
      providerConfigId
    })
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
