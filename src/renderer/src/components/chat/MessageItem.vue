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
        <div v-else class="message-text" ref="messageContentRef" @click="handleContentClick" v-html="formatContent(message.content)"></div>

        <!-- 知识库来源标识（在内容下方，引用详情上方） -->
        <div v-if="message.metadata?.knowledgeBase && message.metadata.knowledgeBase.length > 0" class="knowledge-source-badge">
          <el-icon><Collection /></el-icon>
          <span>基于知识库回答</span>
          <el-tag size="small" type="success">{{ message.metadata.knowledgeBase.length }} 条引用</el-tag>
        </div>

        <!-- 附件显示 -->
        <div v-if="message.attachments && message.attachments.length > 0" class="attachments">
          <template v-for="attachment in message.attachments" :key="attachment.id">
            <!-- 图片附件 -->
            <div
              v-if="attachment.type === 'image'"
              class="attachment-image"
              @click="previewImage(attachment)"
            >
              <img :src="getImageUrl(attachment)" :alt="attachment.fileName" />
            </div>
            <!-- 文档附件 -->
            <div v-else class="attachment-item">
              <el-icon><Document /></el-icon>
              <span class="attachment-name">{{ attachment.fileName }}</span>
              <span class="attachment-size">{{ formatFileSize(attachment.fileSize) }}</span>
            </div>
          </template>
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

        <!-- 知识库引用显示 -->
        <div v-if="message.metadata?.knowledgeBase && message.metadata.knowledgeBase.length > 0" class="knowledge-base-refs">
          <el-collapse>
            <el-collapse-item title="知识库引用" name="knowledgeBase">
              <div class="kb-refs-list">
                <div
                  v-for="(ref, index) in message.metadata.knowledgeBase"
                  :key="index"
                  class="kb-ref-item"
                >
                  <div class="ref-title">
                    <el-icon><Document /></el-icon>
                    <span>{{ index + 1 }}. {{ ref.documentName }}</span>
                  </div>
                  <div class="ref-score">
                    相关度: {{ (ref.score * 100).toFixed(1) }}%
                  </div>
                </div>
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

              <!-- 更多操作菜单 -->
              <el-dropdown trigger="click" placement="top-end">
                <el-button size="small" text>
                  <el-icon><More /></el-icon>
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item @click="saveAsLocalFile">
                      <el-icon><Document /></el-icon>
                      <span>保存为本地文件</span>
                    </el-dropdown-item>
                    <el-dropdown-item @click="openKnowledgeBaseDialog">
                      <el-icon><Collection /></el-icon>
                      <span>保存到知识库</span>
                    </el-dropdown-item>
                    <el-dropdown-item divided @click="exportAsImage">
                      <el-icon><Picture /></el-icon>
                      <span>导出为图片</span>
                    </el-dropdown-item>
                    <el-dropdown-item @click="exportAsWord">
                      <el-icon><Document /></el-icon>
                      <span>导出为 Word</span>
                    </el-dropdown-item>
                    <el-dropdown-item @click="exportToObsidian">
                      <el-icon><Notebook /></el-icon>
                      <span>导出到 Obsidian</span>
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
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

    <!-- 图片预览 -->
    <el-image-viewer
      v-if="showImageViewer"
      :url-list="[currentImageUrl]"
      @close="showImageViewer = false"
    />

    <!-- 知识库选择对话框 -->
    <el-dialog
      v-model="showKnowledgeBaseDialog"
      title="选择知识库"
      width="500px"
      :close-on-click-modal="false"
    >
      <div class="knowledge-base-list">
        <div
          v-for="kb in knowledgeBases"
          :key="kb.id"
          class="kb-item"
          @click="saveToKnowledgeBase(kb.id)"
        >
          <el-icon><Collection /></el-icon>
          <span class="kb-name">{{ kb.name }}</span>
          <el-icon class="arrow"><ArrowRight /></el-icon>
        </div>
        <div v-if="knowledgeBases.length === 0" class="empty-tip">
          暂无可用的知识库，请先创建知识库
        </div>
      </div>
      <template #footer>
        <el-button @click="showKnowledgeBaseDialog = false">取消</el-button>
      </template>
    </el-dialog>

    <!-- 导出到 Obsidian 对话框 -->
    <ExportToObsidianDialog
      v-model="showExportObsidianDialog"
      :content="message.content"
      :thinking-chain="message.metadata?.thinkingChain"
    />

    <!-- 图片导出用的隐藏容器 -->
    <div
      ref="imageExportContainer"
      class="image-export-container"
      :style="{ position: 'fixed', left: '-9999px', top: '0', width: '600px', background: '#fff', padding: '24px', zIndex: -1 }"
      v-html="imageExportContent"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import html2canvas from 'html2canvas'
import { Document, Edit, CopyDocument, Delete, Refresh, Switch, Coin, Collection, More, Picture, Notebook, ArrowRight } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox, ElImageViewer } from 'element-plus'
import type { Message, Attachment } from '../../../shared/types'
import ModelSelectDialog from './ModelSelectDialog.vue'
import ExportToObsidianDialog from './ExportToObsidianDialog.vue'

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

// 知识库选择对话框
const showKnowledgeBaseDialog = ref(false)
const knowledgeBases = ref<Array<{ id: string; name: string }>>([])
const savingToKnowledgeBase = ref(false)

// 导出到 Obsidian 对话框
const showExportObsidianDialog = ref(false)

// 图片预览缓存
const imagePreviewUrls = ref<Map<string, string>>(new Map())

// 图片导出相关
const imageExportContainer = ref<HTMLElement | null>(null)
const imageExportContent = ref('')

// 消息内容容器引用
const messageContentRef = ref<HTMLElement | null>(null)

// 处理复制按钮点击（事件委托）
function handleContentClick(event: MouseEvent): void {
  const target = event.target as HTMLElement
  const copyBtn = target.closest('.copy-btn') as HTMLElement | null

  if (copyBtn) {
    const encodedCode = copyBtn.dataset.codeB64
    if (encodedCode) {
      // 解码 base64（支持 UTF-8）
      const code = decodeURIComponent(escape(atob(encodedCode)))
      copyCode(code, copyBtn)
    }
  }
}

// 复制代码到剪贴板
async function copyCode(code: string, button: HTMLElement): Promise<void> {
  try {
    await navigator.clipboard.writeText(code)
    // 更新按钮显示
    const span = button.querySelector('span')
    if (span) {
      const originalText = span.textContent
      span.textContent = '已复制'
      button.style.color = '#10b981'
      setTimeout(() => {
        span.textContent = originalText
        button.style.color = ''
      }, 2000)
    }
  } catch (err) {
    console.error('复制失败:', err)
    ElMessage.error('复制失败')
  }
}

// 获取图片 URL（用于显示）
function getImageUrl(attachment: Attachment): string {
  // 如果已经有缓存，直接返回
  if (imagePreviewUrls.value.has(attachment.id)) {
    return imagePreviewUrls.value.get(attachment.id)!
  }

  // 否则异步加载并返回占位符
  loadImagePreview(attachment)
  return ''
}

// 异步加载图片预览
async function loadImagePreview(attachment: Attachment): Promise<void> {
  if (attachment.type !== 'image') return

  try {
    const response = await window.electronAPI.file.readAsBase64(attachment.filePath)
    if (response.success) {
      imagePreviewUrls.value.set(attachment.id, response.base64)
      // 触发重新渲染
      imagePreviewUrls.value = new Map(imagePreviewUrls.value)
    }
  } catch (error) {
    console.error('加载图片预览失败:', error)
  }
}

// 预览图片 - 使用 Element Plus 的图片预览组件
const showImageViewer = ref(false)
const currentImageUrl = ref('')

function previewImage(attachment: Attachment): void {
  const url = imagePreviewUrls.value.get(attachment.id)
  if (url) {
    currentImageUrl.value = url
    showImageViewer.value = true
  }
}

// 格式化文件大小
function formatFileSize(bytes: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

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

  // 使用 base64 编码代码内容，避免特殊字符问题
  const encodedCode = btoa(unescape(encodeURIComponent(code)))

  return `
    <div class="code-block-wrapper">
      <div class="code-header">
        <span class="language">${language || 'code'}</span>
        <button class="copy-btn" data-code-b64="${encodedCode}">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
          <span>复制</span>
        </button>
      </div>
      <div class="code-content">
        <div class="line-numbers">${lineNumbers}</div>
        <pre><code>${codeLines}</code></pre>
      </div>
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

// 保存为本地 Markdown 文件
async function saveAsLocalFile(): Promise<void> {
  try {
    // 生成默认文件名（使用时间戳）
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const defaultName = `AI回答_${timestamp}.md`

    const response = await window.electronAPI.file.saveFile({
      defaultPath: defaultName,
      filters: [{ name: 'Markdown 文件', extensions: ['md'] }]
    })

    if (response.success && response.filePath) {
      // 将消息内容写入文件
      const writeResponse = await window.electronAPI.file.writeTextFile(
        response.filePath,
        props.message.content
      )

      if (writeResponse.success) {
        ElMessage.success('保存成功')
      } else {
        ElMessage.error(writeResponse.error || '保存失败')
      }
    }
  } catch (error) {
    console.error('保存文件失败:', error)
    ElMessage.error('保存文件失败')
  }
}

// 打开知识库选择对话框
async function openKnowledgeBaseDialog(): Promise<void> {
  try {
    const response = await window.electronAPI.knowledgeBase.list()
    if (response.success && response.data) {
      knowledgeBases.value = response.data
      showKnowledgeBaseDialog.value = true
    } else {
      ElMessage.error('获取知识库列表失败')
    }
  } catch (error) {
    console.error('获取知识库列表失败:', error)
    ElMessage.error('获取知识库列表失败')
  }
}

// 保存到选中的知识库
async function saveToKnowledgeBase(kbId: string): Promise<void> {
  savingToKnowledgeBase.value = true
  try {
    // 生成文档标题
    const timestamp = new Date().toLocaleString('zh-CN')
    const title = `AI回答_${timestamp}`

    const response = await window.electronAPI.knowledgeBase.addDocument(kbId, {
      name: title,
      type: 'text',
      content: props.message.content
    })

    if (response.success) {
      ElMessage.success('已保存到知识库')
      showKnowledgeBaseDialog.value = false
    } else {
      ElMessage.error(response.error || '保存失败')
    }
  } catch (error) {
    console.error('保存到知识库失败:', error)
    ElMessage.error('保存到知识库失败')
  } finally {
    savingToKnowledgeBase.value = false
  }
}

// 导出为图片
async function exportAsImage(): Promise<void> {
  if (!props.message.content) {
    ElMessage.warning('消息内容为空')
    return
  }

  try {
    // 准备渲染内容
    imageExportContent.value = renderContentForImage(props.message.content)

    // 等待 DOM 更新
    await nextTick()

    if (!imageExportContainer.value) {
      ElMessage.error('无法创建图片容器')
      return
    }

    // 使用 html2canvas 截图
    const canvas = await html2canvas(imageExportContainer.value, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      logging: false
    })

    // 转换为 Base64
    const base64 = canvas.toDataURL('image/png')

    // 调用主进程保存
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const response = await window.electronAPI.export.messageAsImage({
      imageBase64: base64,
      fileName: `AI回答_${timestamp}.png`
    })

    if (response.success) {
      ElMessage.success('图片已保存')
    } else if (response.error) {
      ElMessage.error(response.error)
    }

    // 清理
    imageExportContent.value = ''
  } catch (error) {
    console.error('导出图片失败:', error)
    ElMessage.error('导出图片失败')
  }
}

// 渲染内容为图片用的 HTML
function renderContentForImage(content: string): string {
  let html = content

  // 代码块
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre style="background:#f5f5f5;padding:12px;border-radius:4px;overflow-x:auto;font-family:Consolas,monospace;font-size:13px;line-height:1.5;"><code>${escapeHtml(code.trim())}</code></pre>`
  })

  // 行内代码
  html = html.replace(/`([^`]+)`/g, '<code style="background:#f5f5f5;padding:2px 6px;border-radius:3px;font-family:Consolas,monospace;">$1</code>')

  // 标题
  html = html.replace(/^### (.+)$/gm, '<h3 style="margin:16px 0 8px;font-size:16px;font-weight:600;">$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2 style="margin:20px 0 10px;font-size:18px;font-weight:600;">$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1 style="margin:24px 0 12px;font-size:22px;font-weight:700;">$1</h1>')

  // 粗体和斜体
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')

  // 列表
  html = html.replace(/^- (.+)$/gm, '<li style="margin-left:20px;">$1</li>')
  html = html.replace(/^\d+\. (.+)$/gm, '<li style="margin-left:20px;">$1</li>')

  // 换行
  html = html.replace(/\n\n/g, '</p><p style="margin:12px 0;line-height:1.6;">')
  html = html.replace(/\n/g, '<br>')

  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:#333;line-height:1.6;">
    <p style="margin:0 0 12px;line-height:1.6;">${html}</p>
  </div>`
}

// 导出为 Word
async function exportAsWord(): Promise<void> {
  try {
    ElMessage.info('正在生成 Word 文档...')

    const response = await window.electronAPI.export.messageAsWord({
      content: props.message.content,
      modelId: props.message.modelId
    })

    if (response.success) {
      ElMessage.success('Word 文档已保存')
    } else {
      ElMessage.error(response.error || '导出 Word 失败')
    }
  } catch (error) {
    console.error('导出 Word 失败:', error)
    ElMessage.error('导出 Word 失败')
  }
}

// 导出到 Obsidian
function exportToObsidian(): void {
  showExportObsidianDialog.value = true
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
          white-space: pre-wrap;
          word-wrap: break-word;
          word-break: break-all;
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

  // 下拉菜单按钮样式统一
  .el-dropdown {
    .el-button {
      padding: 4px 6px;
      color: #64748b;

      &:hover {
        color: var(--el-color-primary);
        background: rgba(0, 0, 0, 0.04);
      }
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
  gap: 8px;
  margin-top: 8px;
}

.attachment-image {
  width: 120px;
  height: 120px;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  border: 1px solid #e2e8f0;
  transition: all 0.2s;

  &:hover {
    border-color: var(--el-color-primary);
    transform: scale(1.02);
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.attachment-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 8px;
  font-size: 12px;
  border: 1px solid transparent;
  transition: all 0.2s;

  &:hover {
    background: rgba(0, 0, 0, 0.08);
    border-color: #e2e8f0;
  }

  .el-icon {
    font-size: 18px;
    color: var(--el-color-primary);
  }

  .attachment-name {
    font-weight: 500;
    color: #1e293b;
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .attachment-size {
    color: #94a3b8;
    font-size: 11px;
  }
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

.knowledge-base-refs {
  margin-top: 8px;

  :deep(.el-collapse) {
    border: none;
  }

  :deep(.el-collapse-item__header) {
    font-size: 12px;
    color: #10b981;
    background: #ecfdf5;
    border-radius: 6px;
    padding: 0 12px;
    height: 32px;
  }

  :deep(.el-collapse-item__wrap) {
    border: none;
    background: #ecfdf5;
    border-radius: 0 0 6px 6px;
  }
}

.knowledge-source-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  margin-top: 8px;
  background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
  border: 1px solid #a7f3d0;
  border-radius: 6px;
  font-size: 12px;
  color: #059669;

  .el-icon {
    font-size: 14px;
  }
}

.kb-refs-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 12px;
}

.kb-ref-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  background: #fff;
  border-radius: 6px;
  border: 1px solid #d1fae5;

  .ref-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 500;
    color: #1e293b;

    .el-icon {
      color: #10b981;
    }
  }

  .ref-score {
    font-size: 11px;
    color: #10b981;
    background: #d1fae5;
    padding: 2px 8px;
    border-radius: 4px;
  }
}

// 知识库选择对话框样式
.knowledge-base-list {
  max-height: 400px;
  overflow-y: auto;
}

.kb-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid #e2e8f0;
  margin-bottom: 8px;

  &:hover {
    background: #f1f5f9;
    border-color: var(--el-color-primary);
  }

  .el-icon {
    font-size: 20px;
    color: var(--el-color-primary);
  }

  .kb-name {
    flex: 1;
    font-size: 14px;
    font-weight: 500;
    color: #1e293b;
  }

  .arrow {
    font-size: 14px;
    color: #94a3b8;
  }
}

.empty-tip {
  text-align: center;
  padding: 40px 20px;
  color: #94a3b8;
  font-size: 14px;
}
</style>
