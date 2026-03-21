<template>
  <div
    class="message-item"
    :class="message.role"
    @mouseenter="showActions = true"
    @mouseleave="showActions = false"
  >
    <div class="message-avatar">
      {{ message.role === 'user' ? '👤' : '🤖' }}
    </div>
    <div class="message-body">
      <!-- 顶部：发送者名称和时间 -->
      <div class="message-header">
        <span class="sender-name">
          {{ message.role === 'user' ? '用户' : modelName }}
        </span>
        <span class="message-time">{{ formatTime(message.createdAt) }}</span>
      </div>

      <div class="message-content">
        <!-- 思维链显示 - 放在答案内容之前 -->
        <div v-if="message.metadata?.thinkingChain" class="thinking-chain">
          <el-collapse>
            <el-collapse-item title="思维链" name="thinking">
              <div class="thinking-content">{{ message.metadata.thinkingChain }}</div>
            </el-collapse-item>
          </el-collapse>
        </div>

        <!-- 编辑模式 -->
        <div v-if="isEditing" class="edit-mode">
          <el-input
            v-model="editContent"
            type="textarea"
            :rows="4"
            placeholder="编辑消息内容..."
          />
          <div class="edit-actions">
            <el-button size="small" @click="cancelEdit">取消</el-button>
            <el-button size="small" type="primary" @click="saveEdit">保存</el-button>
          </div>
        </div>

        <!-- 正常显示模式 -->
        <div v-else class="message-text" v-html="formatContent(message.content)"></div>

        <!-- 附件显示 -->
        <div v-if="message.attachments && message.attachments.length > 0" class="attachments">
          <div
            v-for="attachment in message.attachments"
            :key="attachment.id"
            class="attachment-item"
          >
            <el-icon><Document /></el-icon>
            <span>{{ attachment.fileName }}</span>
          </div>
        </div>

        <!-- 联网搜索结果显示 -->
        <div v-if="message.metadata?.webSearch && message.metadata.webSearch.length > 0" class="web-search-results">
          <el-collapse>
            <el-collapse-item title="联网搜索结果" name="webSearch">
              <div class="search-results-list">
                <a
                  v-for="(result, index) in message.metadata.webSearch"
                  :key="index"
                  :href="result.url"
                  target="_blank"
                  class="search-result-item"
                >
                  <div class="result-title">{{ index + 1 }}. {{ result.title }}</div>
                  <div class="result-snippet">{{ result.snippet }}</div>
                  <div class="result-url">{{ result.url }}</div>
                </a>
              </div>
            </el-collapse-item>
          </el-collapse>
        </div>

        <!-- 底部：操作按钮 -->
        <div class="message-footer">
          <!-- Token 数量（暂时隐藏，待后续完善） -->
          <!-- <span v-if="message.tokensUsed" class="token-info">
            <el-icon><Coin /></el-icon>
            <span>{{ message.tokensUsed }} tokens</span>
          </span> -->
          <span class="token-placeholder"></span>

          <!-- 消息操作工具栏 -->
          <div v-if="!isEditing" class="message-actions" :class="{ visible: showActions }">
            <!-- 用户消息操作 -->
            <template v-if="message.role === 'user'">
              <el-tooltip content="编辑" placement="top">
                <el-button size="small" text @click="startEdit">
                  <el-icon><Edit /></el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip content="复制" placement="top">
                <el-button size="small" text @click="copyMessage">
                  <el-icon><CopyDocument /></el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip content="删除" placement="top">
                <el-button size="small" text @click="deleteMessage">
                  <el-icon><Delete /></el-icon>
                </el-button>
              </el-tooltip>
            </template>

            <!-- AI 回答操作 -->
            <template v-else>
              <el-tooltip content="重新回答" placement="top">
                <el-button size="small" text @click="regenerate">
                  <el-icon><Refresh /></el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip content="换模型重答" placement="top">
                <el-button size="small" text @click="openModelSelectDialog">
                  <el-icon><Switch /></el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip content="复制" placement="top">
                <el-button size="small" text @click="copyMessage">
                  <el-icon><CopyDocument /></el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip content="删除" placement="top">
                <el-button size="small" text @click="deleteMessage">
                  <el-icon><Delete /></el-icon>
                </el-button>
              </el-tooltip>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- 模型选择对话框 -->
    <ModelSelectDialog
      v-model="showModelDialog"
      :models="availableModels"
      @select="handleModelSelect"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Document, Edit, CopyDocument, Delete, Refresh, Switch, Coin } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { Message } from '../../../shared/types'
import ModelSelectDialog from './ModelSelectDialog.vue'

interface ModelOption {
  id: string
  name: string
  providerName: string
  providerId: string
  modelId: string
}

const props = defineProps<{
  message: Message
  availableModels?: ModelOption[]
}>()

const emit = defineEmits<{
  (e: 'edit', messageId: string, newContent: string): void
  (e: 'copy', content: string): void
  (e: 'delete', messageId: string): void
  (e: 'regenerate', messageId: string, modelId?: string): void
}>()

const showActions = ref(false)
const isEditing = ref(false)
const editContent = ref('')
const showModelDialog = ref(false)

// 获取模型名称
const modelName = computed(() => {
  if (props.message.role !== 'assistant') return ''

  // 如果消息有 modelId，从可用模型列表中查找名称
  if (props.message.modelId && props.availableModels) {
    const model = props.availableModels.find(m => m.modelId === props.message.modelId)
    if (model) {
      return model.name
    }
  }

  // 否则返回 modelId 或默认值
  return props.message.modelId || 'AI'
})

// 格式化内容 - 将代码块替换为 CodeBlock 组件
function formatContent(content: string): string {
  if (!content) return ''

  // 先处理代码块，用占位符替换
  const codeBlocks: { language: string; code: string }[] = []
  let processedContent = content.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (match, language, code) => {
      const index = codeBlocks.length
      codeBlocks.push({ language, code: code.trim() })
      return `__CODE_BLOCK_${index}__`
    }
  )

  // 转义 HTML
  processedContent = processedContent
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // 处理行内代码
  processedContent = processedContent.replace(/`([^`]+)`/g, '<code>$1</code>')

  // 处理换行
  processedContent = processedContent.replace(/\n/g, '<br>')

  // 还原代码块为组件渲染
  codeBlocks.forEach((block, index) => {
    const codeBlockHtml = renderCodeBlock(block.language, block.code)
    processedContent = processedContent.replace(`__CODE_BLOCK_${index}__`, codeBlockHtml)
  })

  return processedContent
}

// 渲染代码块 HTML（使用纯 HTML 模拟 CodeBlock 组件）
function renderCodeBlock(language: string, code: string): string {
  const lines = code.split('\n')
  const lineNumbers = lines.map((_, i) => `<span class="line-number">${i + 1}</span>`).join('')
  const codeLines = lines.map(line => escapeHtml(line)).join('\n')

  return `
    <div class="code-block-wrapper">
      <div class="code-header">
        <span class="language">${language || 'code'}</span>
        <button class="copy-btn" onclick="copyCodeFromBlock(this)">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
          <span>复制</span>
        </button>
      </div>
      <div class="code-content">
        <div class="line-numbers">${lineNumbers}</div>
        <pre><code>${codeLines}</code></pre>
      </div>
      <div class="code-data" style="display:none">${escapeHtml(code)}</div>
    </div>
  `
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// 格式化时间 - 完整日期时间
function formatTime(date: Date | string): string {
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  const seconds = String(d.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

// 开始编辑
function startEdit() {
  isEditing.value = true
  editContent.value = props.message.content
}

// 取消编辑
function cancelEdit() {
  isEditing.value = false
  editContent.value = ''
}

// 保存编辑
function saveEdit() {
  if (!editContent.value.trim()) {
    ElMessage.warning('消息内容不能为空')
    return
  }
  emit('edit', props.message.id, editContent.value)
  isEditing.value = false
}

// 复制消息
async function copyMessage() {
  try {
    await navigator.clipboard.writeText(props.message.content)
    ElMessage.success('已复制到剪贴板')
    emit('copy', props.message.content)
  } catch (err) {
    console.error('复制失败:', err)
    ElMessage.error('复制失败')
  }
}

// 删除消息
async function deleteMessage() {
  try {
    await ElMessageBox.confirm('确定要删除这条消息吗？', '确认删除', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    })
    emit('delete', props.message.id)
  } catch {
    // 用户取消
  }
}

// 重新生成
function regenerate() {
  emit('regenerate', props.message.id)
}

// 打开模型选择对话框
function openModelSelectDialog() {
  showModelDialog.value = true
}

// 处理模型选择
function handleModelSelect(model: ModelOption) {
  emit('regenerate', props.message.id, model.id)
}
</script>

<style lang="scss" scoped>
.message-item {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
  animation: fadeIn 0.3s ease;
  position: relative;

  &.user {
    .message-content {
      background: var(--el-color-primary);
      color: #fff;
      border: none;

      .message-footer {
        .message-actions {
          .el-button {
            color: rgba(255, 255, 255, 0.8);

            &:hover {
              color: #fff;
              background: rgba(255, 255, 255, 0.1);
            }
          }
        }
      }

      .token-info {
        color: rgba(255, 255, 255, 0.7);
      }
    }

    :deep(code:not(pre code)) {
      background: rgba(255, 255, 255, 0.2);
      color: #fff;
    }
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.message-avatar {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  background: linear-gradient(135deg, #fff 0%, #f8fafc 100%);
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.message-body {
  flex: 1;
  min-width: 0;
  max-width: 85%;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.message-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sender-name {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
}

.message-time {
  font-size: 11px;
  color: #94a3b8;
  white-space: nowrap;
}

.message-content {
  background: #fff;
  padding: 12px 14px;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  border: 1px solid #f1f5f9;
  position: relative;
}

.message-text {
  font-size: 14px;
  line-height: 1.6;
  word-wrap: break-word;

  :deep(pre) {
    margin: 0;
    background: transparent;
    padding: 0;
  }

  :deep(code) {
    font-family: 'SF Mono', 'Monaco', 'Menlo', monospace;
    font-size: 13px;
  }

  :deep(code:not(pre code)) {
    background: #f1f5f9;
    color: var(--el-color-primary);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 13px;
  }

  // 代码块样式
  :deep(.code-block-wrapper) {
    background: #1e293b;
    border-radius: 8px;
    overflow: hidden;
    margin: 10px 0;

    .code-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      background: #334155;
      border-bottom: 1px solid #475569;

      .language {
        font-size: 12px;
        color: #94a3b8;
        text-transform: lowercase;
      }

      .copy-btn {
        display: flex;
        align-items: center;
        gap: 4px;
        background: transparent;
        border: none;
        color: #94a3b8;
        cursor: pointer;
        font-size: 12px;
        padding: 4px 8px;
        border-radius: 4px;

        &:hover {
          color: #e2e8f0;
          background: rgba(255, 255, 255, 0.1);
        }

        svg {
          width: 14px;
          height: 14px;
        }
      }
    }

    .code-content {
      display: flex;
      overflow-x: auto;

      .line-numbers {
        display: flex;
        flex-direction: column;
        padding: 12px 0;
        min-width: 40px;
        text-align: right;
        user-select: none;
        border-right: 1px solid #475569;
        background: #1e293b;

        .line-number {
          padding: 0 8px;
          font-size: 13px;
          line-height: 1.5;
          color: #475569;
          font-family: 'SF Mono', 'Monaco', 'Menlo', monospace;
        }
      }

      pre {
        margin: 0;
        padding: 12px 14px;
        flex: 1;
        overflow-x: auto;

        code {
          font-family: 'SF Mono', 'Monaco', 'Menlo', monospace;
          font-size: 13px;
          line-height: 1.5;
          color: #e2e8f0;
          white-space: pre;
        }
      }
    }
  }
}

// 消息底部：Token 数和操作按钮
.message-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
  gap: 12px;
}

.token-info {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #94a3b8;
}

.token-placeholder {
  flex: 1;
}

.message-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.2s;
  flex-shrink: 0;

  &.visible {
    opacity: 1;
  }

  .el-button {
    color: #64748b;
    padding: 4px 6px;

    &:hover {
      color: var(--el-color-primary);
      background: rgba(0, 0, 0, 0.04);
    }
  }
}

.edit-mode {
  .edit-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 8px;
  }
}

.attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.attachment-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 6px;
  font-size: 12px;
}

.thinking-chain {
  margin-top: 8px;

  :deep(.el-collapse) {
    border: none;
  }

  :deep(.el-collapse-item__header) {
    font-size: 12px;
    color: #64748b;
    background: #f8fafc;
    border-radius: 6px;
    padding: 0 12px;
    height: 32px;
  }

  :deep(.el-collapse-item__wrap) {
    border: none;
    background: #f8fafc;
    border-radius: 0 0 6px 6px;
  }
}

.thinking-content {
  font-size: 12px;
  color: #64748b;
  line-height: 1.5;
  white-space: pre-wrap;
  padding: 8px 12px;
}

.web-search-results {
  margin-top: 8px;

  :deep(.el-collapse) {
    border: none;
  }

  :deep(.el-collapse-item__header) {
    font-size: 12px;
    color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
    border-radius: 6px;
    padding: 0 12px;
    height: 32px;
  }

  :deep(.el-collapse-item__wrap) {
    border: none;
    background: var(--el-color-primary-light-9);
    border-radius: 0 0 6px 6px;
  }
}

.search-results-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 12px;
}

.search-result-item {
  display: block;
  padding: 8px 10px;
  background: #fff;
  border-radius: 6px;
  text-decoration: none;
  border: 1px solid #e2e8f0;
  transition: all 0.2s;

  &:hover {
    border-color: var(--el-color-primary);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }

  .result-title {
    font-size: 13px;
    font-weight: 500;
    color: #1e293b;
    margin-bottom: 4px;
  }

  .result-snippet {
    font-size: 12px;
    color: #64748b;
    line-height: 1.4;
    margin-bottom: 4px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .result-url {
    font-size: 11px;
    color: #94a3b8;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
</style>
