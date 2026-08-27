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
      <el-dropdown trigger="click" @command="handleExportCommand">
        <el-button text size="small">
          <el-icon><Download /></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="markdown">
              <el-icon><Document /></el-icon>
              <span>导出为 Markdown</span>
            </el-dropdown-item>
            <el-dropdown-item command="image" :disabled="isExportingImage">
              <el-icon><Picture /></el-icon>
              <span>{{ isExportingImage ? '导出中...' : '导出为长图' }}</span>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
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
import { ref, reactive, watch, computed, onMounted, onUnmounted } from 'vue'
import { Setting, Delete, Cpu, Search, SetUp, Download, Document, Picture } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import type { Dialog, ContextConfig, UserProviderConfig, ModelDefinition, ProviderTemplate, Message } from '../../../shared/types'
import { useDialogStore } from '../../stores/dialog'
// html2canvas 按需加载：模块求值耗时大（约 400ms），只在导出长图时才加载
import { loadHtml2Canvas } from '@/utils/lazy-libs'

const props = defineProps<{
  dialog: Dialog
  messages?: Message[]
  messageListRef?: HTMLElement | null
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
// 辅助函数：判断模型是否为文本类型（包含文本和多模态模型，排除图片/视频/音频生成模型）
function isTextModel(type: string | undefined): boolean {
  // undefined 表示旧数据，默认认为是文本模型
  // 'text' 是纯文本模型
  // 'multimodal' 是多模态模型，可以处理文本
  return type === undefined || type === 'text' || type === 'multimodal'
}

const providerModels = computed(() => {
  const result: Array<{ id: string; name: string; shortId: string; models: Array<{ id: string; name: string; contextWindow: number; type?: string }> }> = []

  console.log('[ChatHeader.providerModels] 开始计算模型列表')
  console.log('[ChatHeader.providerModels] providerConfigs 数量:', providerConfigs.value.length)

  for (const config of providerConfigs.value) {
    if (!config.isEnabled) continue

    console.log(`[ChatHeader.providerModels] 处理提供商: ${config.name}, id: ${config.id}`)

    const models: Array<{ id: string; name: string; contextWindow: number; type?: string }> = []

    // 获取该配置对应的模板
    const template = providerTemplates.value.find(t => t.id === config.templateId)

    // 使用 models 字段
    if (config.models && config.models.length > 0) {
      for (const model of config.models) {
        // 过滤非文本模型
        if (!isTextModel(model.type)) {
          console.log(`[ChatHeader.providerModels] 过滤非文本模型: ${model.id}, type: ${model.type}`)
          continue
        }
        models.push({
          id: model.id,
          name: model.name,
          contextWindow: model.contextWindow,
          type: model.type,
          supportsThinking: model.supportsThinking,
          supportsWebSearch: model.supportsWebSearch,
          supportsTools: model.supportsTools
        })
      }
    }
    // 如果 models 为空，使用模板的默认模型列表
    else if (template && template.models.length > 0) {
      for (const model of template.models) {
        if (!isTextModel(model.type)) continue
        models.push({
          id: model.id,
          name: model.name || model.id,
          contextWindow: model.contextWindow || 8192,
          type: model.type
        })
      }
    }

    console.log(`[ChatHeader.providerModels] 提供商 ${config.name} 最终模型列表:`, models.map(m => m.id))

    if (models.length > 0) {
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
  const result: Array<{ id: string; name: string; shortId: string; models: Array<{ id: string; name: string; contextWindow: number; type?: string }> }> = []

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
    // 先加载提供商模板（用于验证模型类型），必须先于配置加载
    const templatesResponse = await window.electronAPI.providerTemplate.list()
    if (templatesResponse.success && templatesResponse.templates) {
      providerTemplates.value = templatesResponse.templates
    }

    // 然后加载提供商配置
    const response = await window.electronAPI.providerConfig.list()
    if (response.success && response.data) {
      providerConfigs.value = response.data.filter((c: UserProviderConfig) => c.isEnabled)

      // 如果没有加载过选中状态，设置默认值
      // 此时 providerTemplates 已加载，providerModels 可以正确过滤模型类型
      if (!selectedModelKey.value && props.dialog) {
        updateSelectedModelFromDialog()
      }
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
  console.log('[updateSelectedModelFromDialog] ========== 开始 ==========')
  console.log('[updateSelectedModelFromDialog] props.dialog:', {
    id: props.dialog.id,
    modelId: props.dialog.modelId,
    providerConfigId: props.dialog.providerConfigId
  })
  console.log('[updateSelectedModelFromDialog] providerModels 数量:', providerModels.value.length)
  console.log('[updateSelectedModelFromDialog] providerModels 详情:', providerModels.value.map(p => ({
    id: p.id,
    name: p.name,
    models: p.models.map(m => m.id)
  })))

  const modelId = props.dialog.modelId
  let providerId = props.dialog.providerConfigId

  // 如果没有 providerConfigId，尝试从模型列表中找到包含该模型的提供商
  if (!providerId && modelId) {
    for (const provider of providerModels.value) {
      if (provider.models.some(m => m.id === modelId)) {
        providerId = provider.id
        console.log('[updateSelectedModelFromDialog] 从模型列表找到提供商:', providerId)
        break
      }
    }
  }

  // 验证 providerId 和 modelId 组合是否在选项列表中
  if (providerId && modelId) {
    const provider = providerModels.value.find(p => p.id === providerId)
    if (provider && provider.models.some(m => m.id === modelId)) {
      const newKey = `${providerId}:${modelId}`
      console.log('[updateSelectedModelFromDialog] 设置 selectedModelKey:', newKey)
      selectedModelKey.value = newKey
    } else {
      console.log('[updateSelectedModelFromDialog] 找不到匹配，选择第一个可用模型')
      // 如果找不到匹配，选择第一个可用模型并持久化
      if (providerModels.value.length > 0 && providerModels.value[0].models.length > 0) {
        const firstProvider = providerModels.value[0]
        const firstModel = firstProvider.models[0]
        const newKey = `${firstProvider.id}:${firstModel.id}`
        console.log('[updateSelectedModelFromDialog] 第一个模型:', { provider: firstProvider.id, model: firstModel.id })
        selectedModelKey.value = newKey
        // 持久化到 dialog（只有当 dialog 原本没有模型时才自动设置）
        if (!props.dialog.modelId) {
          console.log('[updateSelectedModelFromDialog] dialog 没有 modelId，调用 persistModelSelection')
          persistModelSelection(firstProvider.id, firstModel.id)
        }
      }
    }
  } else if (!modelId && providerModels.value.length > 0 && providerModels.value[0].models.length > 0) {
    console.log('[updateSelectedModelFromDialog] 没有 modelId，选择第一个可用模型')
    // 如果没有 modelId，选择第一个可用模型
    const firstProvider = providerModels.value[0]
    const firstModel = firstProvider.models[0]
    const newKey = `${firstProvider.id}:${firstModel.id}`
    console.log('[updateSelectedModelFromDialog] 第一个模型:', { provider: firstProvider.id, model: firstModel.id })
    selectedModelKey.value = newKey
    // 只在 dialog 原本没有 modelId 时才持久化（避免覆盖用户手动选择的值）
    if (!props.dialog.modelId) {
      console.log('[updateSelectedModelFromDialog] dialog 没有 modelId，调用 persistModelSelection')
      persistModelSelection(firstProvider.id, firstModel.id)
    }
  }
  console.log('[updateSelectedModelFromDialog] 最终 selectedModelKey:', selectedModelKey.value)
  console.log('[updateSelectedModelFromDialog] ========== 结束 ==========')
}

// 持久化模型选择到 dialog（不触发 UI 更新循环）
function persistModelSelection(providerConfigId: string, modelId: string): void {
  console.log('[ChatHeader.persistModelSelection] 持久化模型选择:', { providerConfigId, modelId, dialogId: props.dialog.id })
  // 记录正在切换模型的对话 ID
  changingModelDialogId.value = props.dialog.id
  // 更新 dialog
  dialogStore.updateDialog(props.dialog.id, {
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

// 监听 dialog 变化（使用 getter 函数返回对象属性来实现深度监听）
watch(
  [
    () => props.dialog.id,
    () => props.dialog.modelId,
    () => props.dialog.providerConfigId
  ],
  ([dialogId, modelId, providerConfigId], [oldDialogId]) => {
    // 更新设置表单
    settingsForm.title = props.dialog.title
    settingsForm.systemPrompt = props.dialog.systemPrompt || ''
    settingsForm.maxMessages = props.dialog.contextConfig?.maxMessages || 20

    // 判断是否应该跳过更新
    // 只有当前对话正在切换模型时才跳过，切换到其他对话时不跳过
    const shouldSkipUpdate = changingModelDialogId.value === dialogId
    if (shouldSkipUpdate) {
      return
    }

    // 如果切换到了不同的对话，清除之前的切换状态
    if (dialogId !== oldDialogId && changingModelDialogId.value === oldDialogId) {
      changingModelDialogId.value = null
    }

    // 更新选中的模型 - 直接调用更新函数
    updateSelectedModelFromDialog()

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
    // 记录正在切换模型的对话 ID
    changingModelDialogId.value = props.dialog.id

    // 更新本地 UI 状态
    selectedModelKey.value = modelKey

    // 直接调用 store 的更新方法，同时更新内存和数据库
    dialogStore.updateDialog(props.dialog.id, {
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

// 导出状态
const isExportingImage = ref(false)

// 处理导出命令
function handleExportCommand(command: string): void {
  if (command === 'markdown') {
    exportToMarkdown()
  } else if (command === 'image') {
    exportToImage()
  }
}

// 导出为 Markdown
function exportToMarkdown(): void {
  if (!props.messages || props.messages.length === 0) {
    ElMessage.warning('没有消息可以导出')
    return
  }

  try {
    const title = props.dialog.title || '对话记录'
    let markdown = `# ${title}\n\n`
    markdown += `> 导出时间：${formatDateTime(new Date())}\n\n`
    markdown += '---\n\n'

    for (const message of props.messages) {
      const sender = message.role === 'user' ? '👤 用户' : '🤖 助手'
      const time = formatDateTime(new Date(message.createdAt))

      markdown += `## ${sender}\n\n`
      markdown += `*${time}*\n\n`

      // 处理内容
      const content = message.content.trim()

      // 如果内容已经包含代码块，直接保留
      // 否则根据内容类型处理
      if (content.includes('```')) {
        // 包含代码块，直接输出
        markdown += `${content}\n\n`
      } else {
        // 纯文本，直接输出
        markdown += `${content}\n\n`
      }

      // 如果有附件信息
      if (message.attachments && message.attachments.length > 0) {
        markdown += `**附件：**\n`
        for (const attachment of message.attachments) {
          markdown += `- ${attachment.fileName}\n`
        }
        markdown += '\n'
      }

      markdown += '---\n\n'
    }

    // 创建并下载文件
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${title}_${formatFileName(new Date())}.md`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    ElMessage.success('Markdown 文件已导出')
  } catch (error) {
    console.error('导出 Markdown 失败:', error)
    ElMessage.error('导出失败')
  }
}

// 导出为长图
async function exportToImage(): Promise<void> {
  if (!props.messages || props.messages.length === 0) {
    ElMessage.warning('没有消息可以导出')
    return
  }

  // 获取消息列表元素
  const messageListEl = props.messageListRef
  if (!messageListEl) {
    console.error('[导出长图] 无法获取消息列表元素')
    ElMessage.warning('无法获取消息列表区域')
    return
  }

  console.log('[导出长图] 获取到元素:', {
    tagName: messageListEl.tagName,
    className: messageListEl.className,
    scrollWidth: messageListEl.scrollWidth,
    scrollHeight: messageListEl.scrollHeight,
    clientWidth: messageListEl.clientWidth,
    clientHeight: messageListEl.clientHeight
  })

  // 检查元素尺寸
  if (messageListEl.scrollHeight === 0 || messageListEl.scrollWidth === 0) {
    console.error('[导出长图] 元素尺寸为 0')
    ElMessage.error('消息列表区域尺寸为空，无法导出')
    return
  }

  isExportingImage.value = true

  try {
    // 保存原始样式
    const originalOverflow = messageListEl.style.overflow
    const originalHeight = messageListEl.style.height
    const originalMaxHeight = messageListEl.style.maxHeight
    const originalPosition = messageListEl.style.position

    // 设置为自动高度以显示所有内容
    messageListEl.style.overflow = 'visible'
    messageListEl.style.height = 'auto'
    messageListEl.style.maxHeight = 'none'
    messageListEl.style.position = 'relative'

    // 等待 DOM 更新
    await new Promise(resolve => setTimeout(resolve, 200))

    console.log('[导出长图] 截图前元素尺寸:', {
      scrollWidth: messageListEl.scrollWidth,
      scrollHeight: messageListEl.scrollHeight
    })

    // 使用 html2canvas 截图（按需加载，仅导出时）
    const html2canvas = await loadHtml2Canvas()
    const canvas = await html2canvas(messageListEl, {
      backgroundColor: '#f8fafc',
      scale: 2,
      useCORS: true,
      logging: false,
      width: messageListEl.scrollWidth,
      height: messageListEl.scrollHeight,
      windowWidth: messageListEl.scrollWidth,
      windowHeight: messageListEl.scrollHeight
    })

    console.log('[导出长图] Canvas 创建成功:', {
      canvasWidth: canvas.width,
      canvasHeight: canvas.height
    })

    // 恢复原始样式
    messageListEl.style.overflow = originalOverflow
    messageListEl.style.height = originalHeight
    messageListEl.style.maxHeight = originalMaxHeight
    messageListEl.style.position = originalPosition

    // 检查 canvas 是否有内容
    if (canvas.width === 0 || canvas.height === 0) {
      throw new Error('Canvas 尺寸为 0')
    }

    // 转换为图片并下载
    const title = props.dialog.title || '对话记录'
    const dataUrl = canvas.toDataURL('image/png')

    if (!dataUrl || dataUrl === 'data:,' || dataUrl.length < 100) {
      throw new Error('Canvas 内容为空')
    }

    const link = document.createElement('a')
    link.href = dataUrl
    link.download = `${title}_${formatFileName(new Date())}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    ElMessage.success('长图已导出')
  } catch (error) {
    console.error('[导出长图] 失败:', error)
    ElMessage.error('导出失败: ' + (error instanceof Error ? error.message : '未知错误'))
  } finally {
    isExportingImage.value = false
  }
}

// 格式化日期时间
function formatDateTime(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}`
}

// 格式化文件名日期
function formatFileName(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}${month}${day}_${hours}${minutes}`
}

onMounted(() => {
  loadProviderConfigs()
  // 监听配置变化，自动刷新模型列表
  const unsubscribe = window.electronAPI.providerConfig.onChanged(() => {
    console.log('[ChatHeader] 收到配置变化通知，重新加载提供商配置')
    loadProviderConfigs()
  })
  // 组件卸载时取消监听
  onUnmounted(() => {
    unsubscribe()
  })
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
