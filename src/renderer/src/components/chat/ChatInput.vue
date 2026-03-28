<template>
  <div class="chat-input">
    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="tool-left">
        <el-tooltip content="附件" placement="top">
          <el-button
            class="tool-btn"
            :class="{ active: attachments.length > 0 }"
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
              <!-- 关闭选项 -->
              <el-dropdown-item command="close" :class="{ 'is-active': !webSearchEnabled }">
                关闭
              </el-dropdown-item>

              <!-- 模型内置搜索 -->
              <el-dropdown-item
                v-if="modelBuiltInAvailable"
                command="model"
                :class="{ 'is-active': searchEngineSelection?.engine === 'model' }"
              >
                模型内置搜索
              </el-dropdown-item>

              <!-- 快速搜索（网页抓取型） -->
              <el-dropdown-item divided disabled>
                <span style="color: #909399; font-size: 12px;">快速搜索</span>
              </el-dropdown-item>
              <el-dropdown-item
                v-for="engine in quickSearchEngines"
                :key="engine.id"
                :command="`quick:${engine.id}`"
                :class="{ 'is-active': searchEngineSelection?.type === 'quick' && searchEngineSelection?.engine === engine.id }"
              >
                {{ engine.icon }} {{ engine.name }}
              </el-dropdown-item>

              <!-- 已配置的搜索引擎 -->
              <template v-if="configuredEngines.length > 0">
                <el-dropdown-item divided disabled>
                  <span style="color: #909399; font-size: 12px;">已配置</span>
                </el-dropdown-item>
                <el-dropdown-item
                  v-for="config in configuredEngines"
                  :key="config.id"
                  :command="`configured:${config.id}`"
                  :class="{ 'is-active': searchEngineSelection?.configId === config.id }"
                >
                  {{ config.name }}
                </el-dropdown-item>
              </template>

              <!-- 配置管理入口 -->
              <el-dropdown-item divided command="settings">
                <el-icon><Setting /></el-icon>
                管理搜索引擎
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

        <!-- 知识库下拉菜单 -->
        <el-dropdown
          trigger="click"
          @command="handleKnowledgeBaseCommand"
        >
          <el-button
            class="tool-btn"
            :class="{ active: selectedKnowledgeBaseIds.length > 0 }"
            text
          >
            <el-icon><Collection /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <template v-if="!allKnowledgeBases || allKnowledgeBases.length === 0">
                <el-dropdown-item disabled>
                  <span style="color: #909399;">暂无可用知识库</span>
                </el-dropdown-item>
                <el-dropdown-item divided>
                  <span style="color: #909399; font-size: 12px;">请先创建知识库</span>
                </el-dropdown-item>
              </template>
              <template v-else>
                <el-dropdown-item command="clear" :class="{ 'is-active': selectedKnowledgeBaseIds.length === 0 }">
                  不使用知识库
                </el-dropdown-item>
                <el-dropdown-item divided disabled>
                  <span style="color: #909399; font-size: 12px;">选择知识库（可多选）</span>
                </el-dropdown-item>
                <el-dropdown-item
                  v-for="kb in allKnowledgeBases"
                  :key="kb.id"
                  :command="kb.id"
                  :class="{ 'is-active': selectedKnowledgeBaseIds.includes(kb.id) }"
                >
                  <el-icon v-if="selectedKnowledgeBaseIds.includes(kb.id)" style="color: #10b981; margin-right: 4px;"><Check /></el-icon>
                  {{ kb.name }}
                </el-dropdown-item>
              </template>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
      <div class="tool-right">
        <span class="tool-hint">Ctrl + Enter 发送</span>
      </div>
    </div>

    <!-- 附件预览区域 -->
    <div v-if="attachments.length > 0" class="attachments-preview">
      <div
        v-for="file in attachments"
        :key="file.id"
        class="attachment-item"
      >
        <!-- 图片预览 -->
        <div v-if="file.type === 'image'" class="attachment-image">
          <img :src="file.previewUrl" :alt="file.fileName" />
          <div class="attachment-overlay">
            <el-button
              type="danger"
              size="small"
              circle
              @click="removeAttachment(file.id)"
            >
              <el-icon><Close /></el-icon>
            </el-button>
          </div>
        </div>
        <!-- 文件图标 -->
        <div v-else class="attachment-file">
          <el-icon class="file-icon"><Document /></el-icon>
          <div class="file-info">
            <span class="file-name" :title="file.fileName">{{ file.fileName }}</span>
            <span class="file-size">{{ formatFileSize(file.fileSize) }}</span>
          </div>
          <el-button
            type="danger"
            size="small"
            circle
            class="remove-btn"
            @click="removeAttachment(file.id)"
          >
            <el-icon><Close /></el-icon>
          </el-button>
        </div>
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
          <!-- 附件数量指示 -->
          <span v-if="attachments.length > 0" class="status-tag">
            <el-icon><Paperclip /></el-icon>
            {{ attachments.length }} 个附件
          </span>
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
          <!-- 知识库状态指示 -->
          <span v-if="selectedKnowledgeBaseIds.length > 0" class="status-tag kb-tag">
            <el-icon><Collection /></el-icon>
            知识库 ({{ selectedKnowledgeBaseIds.length }})
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
            :disabled="!canSend"
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
import { ref, computed, watch, onMounted } from 'vue'
import { Paperclip, Search, Cpu, Collection, VideoPause, Promotion, Close, Document, Check, Setting } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import type { Message, Attachment, SearchEngineType, SearchEngineConfigId } from '../../../shared/types'
import type { SearchEngineTemplate, UserSearchEngineConfig } from '../../../shared/types/search-engine.types'
import type { DialogWebSearchConfig } from '../../../shared/types/dialog.types'

// 扩展的附件类型（包含预览 URL）
interface AttachmentWithPreview extends Attachment {
  previewUrl?: string
}

// 搜索引擎选择状态
interface SearchEngineSelection {
  type: 'quick' | 'configured'  // 快速搜索或配置型
  engine: SearchEngineType      // 搜索引擎类型
  configId?: string             // 配置 ID（配置型需要）
}

const props = defineProps<{
  disabled: boolean
  /** 当前模型信息 */
  currentModel?: {
    supportsThinking?: boolean
    supportsWebSearch?: boolean
  }
  /** 所有可用的知识库列表 */
  allKnowledgeBases?: Array<{
    id: string
    name: string
  }>
  /** 已选择的知识库 ID 列表（用于持久化恢复） */
  selectedKnowledgeBaseIds?: string[]
  /** 当前对话的联网搜索配置（用于持久化恢复） */
  webSearchConfig?: DialogWebSearchConfig
}>()

const emit = defineEmits<{
  (e: 'send', content: string, options?: {
    attachments?: Message['attachments']
    webSearch?: {
      enabled: boolean
      engine: SearchEngineType
      configId?: SearchEngineConfigId
    }
    enableThinkingChain?: boolean
    knowledgeBaseIds?: string[]
  }): void
  (e: 'stop'): void
  /** 知识库选择变化事件（用于持久化） */
  (e: 'updateKnowledgeBaseIds', ids: string[]): void
  /** 联网搜索配置变化事件（用于持久化） */
  (e: 'updateWebSearchConfig', config: DialogWebSearchConfig | undefined): void
}>()

// 输入内容
const inputContent = ref('')

// 附件列表
const attachments = ref<AttachmentWithPreview[]>([])

// 搜索引擎相关
const searchEngineSelection = ref<SearchEngineSelection | null>(null)
const searchEngineTemplates = ref<SearchEngineTemplate[]>([])
const searchEngineConfigs = ref<UserSearchEngineConfig[]>([])
const disabledQuickEngines = ref<string[]>([])
const enableThinkingChain = ref(false)
const selectedKnowledgeBaseIds = ref<string[]>([])

// 加载搜索引擎模板和配置
async function loadSearchEngines(): Promise<void> {
  try {
    const [templatesRes, configsRes, disabledRes] = await Promise.all([
      window.electronAPI.searchEngine.getTemplates(),
      window.electronAPI.searchEngine.list(),
      window.electronAPI.searchEngine.getDisabledQuickEngines()
    ])
    if (templatesRes.success && templatesRes.templates) {
      searchEngineTemplates.value = templatesRes.templates
    }
    if (configsRes.success && configsRes.configs) {
      searchEngineConfigs.value = configsRes.configs
    }
    if (disabledRes.success && disabledRes.disabledEngines) {
      disabledQuickEngines.value = disabledRes.disabledEngines
    }
  } catch (error) {
    console.error('加载搜索引擎配置失败:', error)
  }
}

// 组件挂载时加载搜索引擎配置
onMounted(() => {
  loadSearchEngines()
})

// 计算属性：快速搜索引擎列表（网页抓取型，过滤掉被禁用的）
const quickSearchEngines = computed(() => {
  return searchEngineTemplates.value
    .filter(t => t.category === 'web-scrape' && !disabledQuickEngines.value.includes(t.id))
    .sort((a, b) => (a.priority || 0) - (b.priority || 0))
})

// 计算属性：已配置的搜索引擎列表（API 型）
const configuredEngines = computed(() => {
  return searchEngineConfigs.value.filter(c => c.isEnabled)
})

// 计算属性：模型内置搜索是否可用
const modelBuiltInAvailable = computed(() => {
  return props.currentModel?.supportsWebSearch ?? false
})

// 监听外部传入的知识库选择（用于恢复持久化的选择）
watch(
  () => props.selectedKnowledgeBaseIds,
  (newIds) => {
    const normalizedNewIds = newIds || []
    if (JSON.stringify(normalizedNewIds) !== JSON.stringify(selectedKnowledgeBaseIds.value)) {
      selectedKnowledgeBaseIds.value = [...normalizedNewIds]
    }
  },
  { immediate: true }
)

// 监听外部传入的联网搜索配置（用于恢复持久化的选择）
watch(
  () => props.webSearchConfig,
  (newConfig) => {
    if (newConfig && newConfig.enabled) {
      searchEngineSelection.value = {
        type: newConfig.configId ? 'configured' : 'quick',
        engine: newConfig.engine,
        configId: newConfig.configId
      }
    } else {
      searchEngineSelection.value = null
    }
  },
  { immediate: true }
)

// 计算属性：是否可以发送
const canSend = computed(() => {
  return inputContent.value.trim() || attachments.value.length > 0
})

// 计算属性：联网搜索是否启用
const webSearchEnabled = computed(() => searchEngineSelection.value !== null)

// 计算属性：联网搜索引擎标签
const webSearchEngineLabel = computed(() => {
  if (!searchEngineSelection.value) return ''

  const selection = searchEngineSelection.value

  // 配置型搜索引擎，显示配置名称
  if (selection.type === 'configured' && selection.configId) {
    const config = searchEngineConfigs.value.find(c => c.id === selection.configId)
    if (config) return config.name
  }

  // 快速搜索，显示模板名称
  const template = searchEngineTemplates.value.find(t => t.id === selection.engine)
  return template?.name || ''
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

// 处理知识库命令
function handleKnowledgeBaseCommand(command: string): void {
  if (command === 'clear') {
    selectedKnowledgeBaseIds.value = []
  } else {
    // 切换选中状态
    const index = selectedKnowledgeBaseIds.value.indexOf(command)
    if (index > -1) {
      selectedKnowledgeBaseIds.value.splice(index, 1)
    } else {
      selectedKnowledgeBaseIds.value.push(command)
    }
  }
  // 通知父组件保存知识库选择
  emit('updateKnowledgeBaseIds', [...selectedKnowledgeBaseIds.value])
}

// 处理联网搜索命令
function handleWebSearchCommand(command: string): void {
  if (command === 'close') {
    searchEngineSelection.value = null
    // 通知父组件保存联网搜索配置（关闭状态）
    emit('updateWebSearchConfig', undefined)
    return
  }

  // 跳转到设置页面
  if (command === 'settings') {
    // 使用 router 跳转到设置页面的搜索引擎 Tab
    window.location.hash = '/settings?tab=search-engine'
    return
  }

  // 解析命令格式: "quick:{engineType}" 或 "configured:{configId}" 或 "model"
  if (command === 'model') {
    searchEngineSelection.value = {
      type: 'quick',
      engine: 'model'
    }
  } else if (command.startsWith('quick:')) {
    const engine = command.substring(6) as SearchEngineType
    searchEngineSelection.value = {
      type: 'quick',
      engine
    }
  } else if (command.startsWith('configured:')) {
    const configId = command.substring(11)
    const config = searchEngineConfigs.value.find(c => c.id === configId)
    if (config) {
      searchEngineSelection.value = {
        type: 'configured',
        engine: config.templateId,
        configId: config.id
      }
    }
  }

  // 通知父组件保存联网搜索配置
  if (searchEngineSelection.value) {
    emit('updateWebSearchConfig', {
      enabled: true,
      engine: searchEngineSelection.value.engine,
      configId: searchEngineSelection.value.configId
    })
  }
}

// 格式化文件大小
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

// 处理附件选择
async function handleAttach(): Promise<void> {
  try {
    const response = await window.electronAPI.file.openDialog({
      multiple: true
    })

    if (response.success && response.files.length > 0) {
      for (const file of response.files) {
        // 检查文件大小限制（20MB）
        if (file.fileSize > 20 * 1024 * 1024) {
          ElMessage.warning(`文件 ${file.fileName} 超过 20MB，已跳过`)
          continue
        }

        // 为图片生成预览 URL
        let previewUrl: string | undefined
        if (file.type === 'image') {
          const base64Response = await window.electronAPI.file.readAsBase64(file.filePath)
          if (base64Response.success) {
            previewUrl = base64Response.base64
          }
        }

        attachments.value.push({
          ...file,
          previewUrl
        })
      }
    }
  } catch (error) {
    console.error('选择文件失败:', error)
    ElMessage.error('选择文件失败')
  }
}

// 移除附件
function removeAttachment(id: string): void {
  attachments.value = attachments.value.filter(a => a.id !== id)
}

// 发送消息
function handleSend(): void {
  const content = inputContent.value.trim()

  // 必须有内容或附件
  if (!content && attachments.value.length === 0) return

  // 构建附件数据（不包含 previewUrl）
  const messageAttachments = attachments.value.map(a => ({
    id: a.id,
    type: a.type,
    fileName: a.fileName,
    filePath: a.filePath,
    fileSize: a.fileSize,
    mimeType: a.mimeType
  }))

  emit('send', content, {
    attachments: messageAttachments.length > 0 ? messageAttachments : undefined,
    webSearch: webSearchEnabled.value && searchEngineSelection.value ? {
      enabled: true,
      engine: searchEngineSelection.value.engine,
      configId: searchEngineSelection.value.configId
    } : undefined,
    enableThinkingChain: enableThinkingChain.value && !thinkingDisabled.value,
    knowledgeBaseIds: selectedKnowledgeBaseIds.value.length > 0 ? selectedKnowledgeBaseIds.value : undefined
  })

  // 清空输入
  inputContent.value = ''
  attachments.value = []
}

// 键盘事件
function handleKeydown(event: KeyboardEvent): void {
  if (event.ctrlKey && event.key === 'Enter') {
    event.preventDefault()
    handleSend()
  }
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

// 附件预览区域
.attachments-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
  padding: 8px;
  background: #f8fafc;
  border-radius: 8px;
}

.attachment-item {
  position: relative;
}

.attachment-image {
  position: relative;
  width: 80px;
  height: 80px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #e2e8f0;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .attachment-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.2s;
  }

  &:hover .attachment-overlay {
    opacity: 1;
  }
}

.attachment-file {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  min-width: 180px;
  max-width: 250px;

  .file-icon {
    font-size: 24px;
    color: var(--el-color-primary);
  }

  .file-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .file-name {
    font-size: 13px;
    font-weight: 500;
    color: #1e293b;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-size {
    font-size: 11px;
    color: #94a3b8;
  }

  .remove-btn {
    flex-shrink: 0;
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

    &.kb-tag {
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
    }
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
