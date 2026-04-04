<template>
  <div
    ref="messageItemRef"
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
        <div class="header-left">
          <span class="sender-name">
            {{ message.role === 'user' ? '用户' : modelName }}
          </span>
          <span class="message-time">{{ formatTime(message.createdAt) }}</span>
        </div>
        <!-- AI回答：右侧操作按钮 -->
        <div v-if="message.role === 'assistant'" class="header-right">
          <el-tooltip content="上一个回答" placement="top">
            <el-button
              size="small"
              text
              class="nav-btn"
              :disabled="!hasPrevAnswer"
              @click="$emit('navigateAnswer', 'prev')"
            >
              <el-icon><ArrowUp /></el-icon>
            </el-button>
          </el-tooltip>
          <el-tooltip content="下一个回答" placement="top">
            <el-button
              size="small"
              text
              class="nav-btn"
              :disabled="!hasNextAnswer"
              @click="$emit('navigateAnswer', 'next')"
            >
              <el-icon><ArrowDown /></el-icon>
            </el-button>
          </el-tooltip>
          <el-tooltip :content="isRenderMode ? '切换到源码模式' : '切换到阅读模式'" placement="top">
            <el-button
              size="small"
              text
              class="view-mode-toggle"
              @click="isRenderMode = !isRenderMode"
            >
              <el-icon><component :is="isRenderMode ? 'Tickets' : 'View'" /></el-icon>
            </el-button>
          </el-tooltip>
        </div>
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
        <div v-else class="message-text" ref="messageContentRef" @click="handleContentClick">
          <!-- AI 回答：根据模式切换显示 -->
          <template v-if="message.role === 'assistant'">
            <!-- 阅读模式：渲染 markdown -->
            <div v-if="isRenderMode" v-html="formatContent(message.content)"></div>
            <!-- 源码模式：保留 markdown 格式字符，但美化代码块和行内代码 -->
            <div v-else v-html="formatSourceContent(message.content)"></div>
          </template>
          <!-- 用户消息：始终渲染显示 -->
          <template v-else>
            <div v-html="formatSourceContent(message.content)"></div>
          </template>
        </div>

        <!-- 知识库来源标识（在内容下方，引用详情上方） -->
        <div v-if="message.metadata?.knowledgeBase && message.metadata.knowledgeBase.length > 0" class="knowledge-source-badge">
          <el-icon><Collection /></el-icon>
          <span>基于知识库回答</span>
          <el-tag size="small">{{ message.metadata.knowledgeBase.length }} 条引用</el-tag>
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
                  @click="showKnowledgeBaseSnippet(ref)"
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

          <!-- AI回答：回到顶部按钮 -->
          <el-tooltip v-if="message.role === 'assistant'" content="回到顶部" placement="top">
            <el-button size="small" text class="back-to-top-btn" :class="{ visible: showActions }" @click="scrollToTop">
              <el-icon><Top /></el-icon>
            </el-button>
          </el-tooltip>

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
              <!-- 复制菜单 -->
              <el-dropdown trigger="click" placement="top">
                <el-button size="small" text>
                  <el-icon><CopyDocument /></el-icon>
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item @click="copyRenderedContent">
                      <span>复制内容</span>
                    </el-dropdown-item>
                    <el-dropdown-item @click="copyMessage">
                      <span>复制源码</span>
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
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
                    <el-dropdown-item @click="openExportToDiaryDialog">
                      <el-icon><Notebook /></el-icon>
                      <span>导出到日记</span>
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

    <!-- 导出到日记对话框 -->
    <el-dialog
      v-model="showExportToDiaryDialog"
      title="导出到日记"
      width="500px"
      :close-on-click-modal="false"
    >
      <el-form label-width="80px">
        <el-form-item label="日记标题">
          <el-input v-model="exportToDiaryTitle" placeholder="请输入日记标题" />
        </el-form-item>
        <el-form-item label="选择目录">
          <el-select
            v-model="selectedDiaryFolderId"
            filterable
            placeholder="请选择或搜索目录"
            style="width: 100%"
          >
            <el-option
              v-for="folder in allDiaryFolders"
              :key="folder.id"
              :label="folder.fullName || folder.name"
              :value="folder.id"
            >
              <div :style="{ paddingLeft: `${folder.level * 16}px` }">
                <el-icon style="vertical-align: middle; margin-right: 4px;"><Folder /></el-icon>
                <span>{{ folder.name }}</span>
              </div>
            </el-option>
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showExportToDiaryDialog = false">取消</el-button>
        <el-button type="primary" :loading="exportToDiaryLoading" @click="handleExportToDiary">导出</el-button>
      </template>
    </el-dialog>

    <!-- 知识库片段预览对话框 -->
    <el-dialog
      v-model="showKbSnippetDialog"
      :title="currentKbRef?.documentName || '文档片段'"
      width="600px"
      class="kb-snippet-dialog"
    >
      <div v-if="currentKbRef" class="kb-snippet-content">
        <div class="snippet-meta">
          <el-tag size="small">
            相关度: {{ ((currentKbRef.score || 0) * 100).toFixed(1) }}%
          </el-tag>
        </div>
        <div class="snippet-text">
          {{ currentKbRef.snippet || '暂无片段内容' }}
        </div>
      </div>
      <template #footer>
        <el-button @click="showKbSnippetDialog = false">关闭</el-button>
      </template>
    </el-dialog>

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
import { ref, computed, nextTick, watch, onMounted } from 'vue'
import html2canvas from 'html2canvas'
import { Document, Edit, CopyDocument, Delete, Refresh, Switch, Coin, Collection, More, Picture, Notebook, ArrowRight, View, Tickets, Folder, Check, ArrowUp, ArrowDown, Top } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox, ElImageViewer } from 'element-plus'
import { marked } from 'marked'
import mermaid from 'mermaid'
import type { Message, Attachment } from '../../../shared/types'
import ModelSelectDialog from './ModelSelectDialog.vue'
import ExportToObsidianDialog from './ExportToObsidianDialog.vue'

// 初始化 Mermaid
mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
  suppressErrorRendering: true, // 禁用默认错误渲染，我们自己处理
  flowchart: {
    useMaxWidth: true,
    htmlLabels: true,
    curve: 'basis',
    padding: 15
  },
  sequence: {
    useMaxWidth: true,
    diagramMarginX: 10,
    diagramMarginY: 10,
    actorMargin: 40,
    width: 120,
    height: 50
  },
  gantt: {
    useMaxWidth: true,
    leftPadding: 50,
    gridLineStartPadding: 25,
    fontSize: 12,
    sectionFontSize: 12
  },
  class: {
    useMaxWidth: true
  },
  state: {
    useMaxWidth: true
  },
  er: {
    useMaxWidth: true
  },
  pie: {
    useMaxWidth: true
  }
})

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
  dialogTitle?: string
  answerIndex?: number
  hasPrevAnswer?: boolean
  hasNextAnswer?: boolean
}>()

const emit = defineEmits<{
  (e: 'edit', messageId: string, newContent: string): void
  (e: 'copy', content: string): void
  (e: 'navigateAnswer', direction: 'prev' | 'next'): void
  (e: 'delete', messageId: string): void
  (e: 'regenerate', messageId: string, modelId?: string): void
}>()

const showActions = ref(false)
const isEditing = ref(false)
const editContent = ref('')
const showModelDialog = ref(false)

// 消息元素引用
const messageItemRef = ref<HTMLElement | null>(null)

// 阅读模式（true = 渲染模式，false = 源码模式）
const isRenderMode = ref(true)

// 回到顶部
function scrollToTop(): void {
  if (messageItemRef.value) {
    messageItemRef.value.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

// 知识库选择对话框
const showKnowledgeBaseDialog = ref(false)
const knowledgeBases = ref<Array<{ id: string; name: string }>>([])
const savingToKnowledgeBase = ref(false)

// 导出到 Obsidian 对话框
const showExportObsidianDialog = ref(false)

// 导出到日记相关
const showExportToDiaryDialog = ref(false)
const exportToDiaryLoading = ref(false)
const exportToDiaryTitle = ref('')
const selectedDiaryFolderId = ref('')
const allDiaryFolders = ref<Array<{ id: string; name: string; parentId?: string; level: number; fullName: string }>>([])

// 打开导出到日记对话框
async function openExportToDiaryDialog() {
  // 设置默认标题：对话标题-回答序号
  if (props.dialogTitle && props.answerIndex) {
    exportToDiaryTitle.value = `${props.dialogTitle}-${props.answerIndex}`
  } else if (props.dialogTitle) {
    exportToDiaryTitle.value = props.dialogTitle
  } else {
    exportToDiaryTitle.value = `AI回答 - ${new Date().toLocaleDateString()}`
  }
  selectedDiaryFolderId.value = ''

  // 加载目录列表
  try {
    const result = await window.electronAPI.diary.getAllFolders()
    if (result.success && result.data) {
      // 构建树形结构并计算层级和完整路径
      const folders = result.data
      const folderMap = new Map(folders.map(f => [f.id, { ...f, level: 0, fullName: f.name }]))

      // 递归计算层级和完整路径
      function getLevelAndPath(folderId: string): { level: number; fullName: string } {
        const folder = folderMap.get(folderId)
        if (!folder) return { level: 0, fullName: '' }
        if (folder.level > 0) return { level: folder.level, fullName: folder.fullName }
        if (!folder.parentId) {
          folder.level = 0
          folder.fullName = folder.name
        } else {
          const parent = getLevelAndPath(folder.parentId)
          folder.level = parent.level + 1
          folder.fullName = `${parent.fullName} / ${folder.name}`
        }
        return { level: folder.level, fullName: folder.fullName }
      }

      // 计算每个目录的层级和完整路径
      folders.forEach(f => getLevelAndPath(f.id))

      // 按完整路径排序
      allDiaryFolders.value = Array.from(folderMap.values()).sort((a, b) => {
        return a.fullName.localeCompare(b.fullName)
      })

      // 默认选择第一个目录
      if (allDiaryFolders.value.length > 0) {
        selectedDiaryFolderId.value = allDiaryFolders.value[0].id
      }
    }
  } catch (error) {
    console.error('加载日记目录失败:', error)
  }

  showExportToDiaryDialog.value = true
}

// 导出到日记
async function handleExportToDiary() {
  if (!selectedDiaryFolderId.value) {
    ElMessage.warning('请选择日记目录')
    return
  }

  if (!exportToDiaryTitle.value.trim()) {
    ElMessage.warning('请输入日记标题')
    return
  }

  exportToDiaryLoading.value = true
  try {
    // 构建内容
    const content = `# ${exportToDiaryTitle.value}\n\n> 导出自 AI 对话，时间：${new Date().toLocaleString()}\n\n${props.message.content}`

    const result = await window.electronAPI.diary.createEntry({
      folderId: selectedDiaryFolderId.value,
      title: exportToDiaryTitle.value.trim(),
      content
    })

    if (result.success) {
      ElMessage.success('导出到日记成功')
      showExportToDiaryDialog.value = false
    } else {
      ElMessage.error(result.error || '导出失败')
    }
  } catch (error) {
    console.error('导出到日记失败:', error)
    ElMessage.error('导出失败')
  } finally {
    exportToDiaryLoading.value = false
  }
}

// 图片预览缓存
const imagePreviewUrls = ref<Map<string, string>>(new Map())

// 图片导出相关
const imageExportContainer = ref<HTMLElement | null>(null)
const imageExportContent = ref('')

// 知识库片段预览
const showKbSnippetDialog = ref(false)
const currentKbRef = ref<{ documentId: string; documentName: string; score: number; snippet?: string } | null>(null)

// 消息内容容器引用
const messageContentRef = ref<HTMLElement | null>(null)

// 渲染 Mermaid 图表
async function renderMermaidCharts(): Promise<void> {
  if (!messageContentRef.value) return

  // 源码模式下不渲染 mermaid 图表，保持代码形式
  if (!isRenderMode.value) return

  const mermaidWrappers = messageContentRef.value.querySelectorAll('.mermaid-wrapper')
  if (mermaidWrappers.length === 0) return

  // 为每个 mermaid wrapper 处理渲染
  for (let i = 0; i < mermaidWrappers.length; i++) {
    const wrapper = mermaidWrappers[i] as HTMLElement
    const status = wrapper.getAttribute('data-render-status')

    // 已处理过的跳过
    if (status === 'success' || status === 'error') continue

    const mermaidElement = wrapper.querySelector('.mermaid') as HTMLElement
    if (!mermaidElement) continue

    const code = mermaidElement.textContent || ''
    // 如果代码为空，跳过（可能 DOM 还没准备好）
    if (!code.trim()) continue

    const id = `mermaid-${Date.now()}-${i}`

    try {
      const { svg } = await mermaid.render(id, code)
      mermaidElement.innerHTML = svg
      wrapper.setAttribute('data-render-status', 'success')
    } catch (error) {
      // 渲染失败：标记错误状态，显示错误图标
      console.error('Mermaid 渲染错误:', error)
      wrapper.setAttribute('data-render-status', 'error')

      // 显示错误图标
      const errorIndicator = wrapper.querySelector('.error-indicator') as HTMLElement
      if (errorIndicator) {
        errorIndicator.style.display = 'inline-flex'
      }

      // 保持代码显示，添加错误样式
      mermaidElement.classList.add('mermaid-error-code')
    }
  }
}

// 使用 requestAnimationFrame 确保在浏览器渲染后执行
function scheduleMermaidRender(): void {
  requestAnimationFrame(() => {
    nextTick(() => {
      renderMermaidCharts()
    })
  })
}

// 监听内容变化，渲染 mermaid 图表
watch(
  () => props.message.content,
  () => {
    scheduleMermaidRender()
  },
  { immediate: true }
)

// 监听渲染模式变化，重新渲染 mermaid
watch(isRenderMode, () => {
  scheduleMermaidRender()
})

// 组件挂载后渲染 Mermaid 图表
onMounted(() => {
  // 多次尝试渲染，确保复杂内容也能正确渲染
  scheduleMermaidRender()
  setTimeout(scheduleMermaidRender, 50)
  setTimeout(scheduleMermaidRender, 200)
})

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

// 格式化内容 - 阅读模式，使用 marked 解析 markdown
function formatContent(content: string): string {
  if (!content) return ''

  try {
    // 自定义渲染器，让代码块使用自定义样式
    const renderer = new marked.Renderer()

    // 自定义代码块渲染
    renderer.code = ({ text, lang }: { text: string; lang?: string }) => {
      const language = lang || ''
      const code = text
      return renderCodeBlock(language, code)
    }

    // 自定义行内代码渲染
    renderer.codespan = (text: string) => {
      return `<code class="inline-code">${text}</code>`
    }

    return marked.parse(content, {
      breaks: true,
      gfm: true,
      renderer
    }) as string
  } catch (error) {
    console.error('Markdown 解析错误:', error)
    return escapeHtml(content).replace(/\n/g, '<br>')
  }
}

// 格式化源码 - 源码模式，保留 markdown 源码但做基本格式化
function formatSourceContent(content: string): string {
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
  processedContent = processedContent.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')

  // 处理换行
  processedContent = processedContent.replace(/\n/g, '<br>')

  // 还原代码块 - 源码模式下所有代码块都用普通样式显示
  codeBlocks.forEach((block, index) => {
    const codeBlockHtml = renderSourceCodeBlock(block.language, block.code)
    processedContent = processedContent.replace(`__CODE_BLOCK_${index}__`, codeBlockHtml)
  })

  return processedContent
}

// 渲染源码模式的代码块（mermaid不渲染，显示为普通代码）
function renderSourceCodeBlock(language: string, code: string): string {
  const lines = code.split('\n')
  const lineNumbers = lines.map((_, i) => `<span class="line-number">${i + 1}</span>`).join('')
  const codeLines = lines.map(line => escapeHtml(line)).join('\n')
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

// 渲染代码块 HTML（使用纯 HTML 模拟 CodeBlock 组件）
function renderCodeBlock(language: string, code: string): string {
  // Mermaid 图表特殊处理
  if (language === 'mermaid') {
    // 使用 base64 编码代码内容
    const encodedCode = btoa(unescape(encodeURIComponent(code)))
    return `
      <div class="mermaid-wrapper" data-render-status="pending">
        <div class="mermaid-header">
          <span class="language">mermaid</span>
          <div class="header-actions">
            <span class="error-indicator" style="display:none" title="语法有误无法解析">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="#ef4444"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
            </span>
            <button class="copy-btn" data-code-b64="${encodedCode}">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
              <span>复制</span>
            </button>
          </div>
        </div>
        <div class="mermaid-content" data-mermaid-code="${encodedCode}">
          <pre class="mermaid">${escapeHtml(code)}</pre>
        </div>
      </div>
    `
  }

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
    ElMessage.success('已复制源码')
    emit('copy', props.message.content)
  } catch (err) {
    console.error('复制失败:', err)
    ElMessage.error('复制失败')
  }
}

// 复制渲染后的内容（带格式）
async function copyRenderedContent() {
  try {
    // 获取渲染后的 HTML 内容
    const renderedHtml = formatContent(props.message.content)

    // 使用 Clipboard API 写入 HTML 和纯文本
    const clipboardItem = new ClipboardItem({
      'text/html': new Blob([renderedHtml], { type: 'text/html' }),
      'text/plain': new Blob([props.message.content], { type: 'text/plain' })
    })

    await navigator.clipboard.write([clipboardItem])
    ElMessage.success('已复制内容')
  } catch (err) {
    console.error('复制失败:', err)
    // 降级：只复制纯文本
    try {
      await navigator.clipboard.writeText(props.message.content)
      ElMessage.success('已复制')
    } catch {
      ElMessage.error('复制失败')
    }
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
    // 准备渲染内容（使用与阅读模式相同的渲染逻辑）
    imageExportContent.value = renderContentForImage(props.message.content)

    // 等待 DOM 更新
    await nextTick()

    if (!imageExportContainer.value) {
      ElMessage.error('无法创建图片容器')
      return
    }

    // 渲染 Mermaid 图表
    await renderMermaidInExportContainer()

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

// 在导出容器中渲染 Mermaid 图表
async function renderMermaidInExportContainer(): Promise<void> {
  if (!imageExportContainer.value) return

  const mermaidWrappers = imageExportContainer.value.querySelectorAll('.mermaid-wrapper')
  if (mermaidWrappers.length === 0) return

  for (let i = 0; i < mermaidWrappers.length; i++) {
    const wrapper = mermaidWrappers[i] as HTMLElement
    const mermaidElement = wrapper.querySelector('.mermaid') as HTMLElement
    if (!mermaidElement) continue

    const code = mermaidElement.textContent || ''
    if (!code.trim()) continue

    const id = `mermaid-export-${Date.now()}-${i}`

    try {
      const { svg } = await mermaid.render(id, code)
      mermaidElement.innerHTML = svg
    } catch (error) {
      console.error('Mermaid 渲染错误:', error)
      // 渲染失败时保持代码显示
    }
  }

  // 等待渲染完成
  await new Promise(resolve => setTimeout(resolve, 100))
}

// 渲染内容为图片用的 HTML（使用与阅读模式相同的逻辑）
function renderContentForImage(content: string): string {
  if (!content) return ''

  try {
    // 使用与阅读模式相同的渲染器
    const renderer = new marked.Renderer()

    // 自定义代码块渲染（带内联样式）
    renderer.code = ({ text, lang }: { text: string; lang?: string }) => {
      const language = lang || ''
      const code = text

      if (language === 'mermaid') {
        const encodedCode = btoa(unescape(encodeURIComponent(code)))
        return `
          <div class="mermaid-wrapper" style="background:#f8fafc;border-radius:8px;overflow:hidden;margin:10px 0;border:1px solid #e2e8f0;">
            <div class="mermaid-header" style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:#f1f5f9;border-bottom:1px solid #e2e8f0;">
              <span class="language" style="font-size:12px;color:#64748b;text-transform:lowercase;">mermaid</span>
            </div>
            <div class="mermaid-content" style="padding:16px;overflow-x:auto;">
              <pre class="mermaid" style="margin:0;background:transparent;font-family:inherit;line-height:1.5;">${escapeHtml(code)}</pre>
            </div>
          </div>
        `
      }

      const lines = code.split('\n')
      const lineNumbers = lines.map((_, i) => `<span style="display:block;text-align:right;padding:0 8px;font-size:13px;line-height:1.5;color:#64748b;">${i + 1}</span>`).join('')
      const codeLines = lines.map(line => escapeHtml(line)).join('\n')

      return `
        <div style="background:#1e293b;border-radius:8px;overflow:hidden;margin:10px 0;">
          <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:#334155;border-bottom:1px solid #475569;">
            <span style="font-size:12px;color:#94a3b8;text-transform:lowercase;">${language || 'code'}</span>
          </div>
          <div style="display:flex;overflow-x:auto;">
            <div style="padding:12px 0;min-width:40px;text-align:right;background:#1e293b;border-right:1px solid #475569;">
              ${lineNumbers}
            </div>
            <pre style="margin:0;padding:12px 14px;flex:1;overflow-x:auto;"><code style="font-family:'SF Mono',Monaco,Menlo,monospace;font-size:13px;line-height:1.5;color:#e2e8f0;white-space:pre;">${codeLines}</code></pre>
          </div>
        </div>
      `
    }

    // 自定义行内代码渲染（带内联样式）
    renderer.codespan = (text: string) => {
      return `<code style="background:#f1f5f9;color:#3b82f6;padding:2px 6px;border-radius:4px;font-size:13px;font-family:'SF Mono',Monaco,Menlo,monospace;">${text}</code>`
    }

    // 其他元素使用默认渲染器，然后通过 CSS 样式包装
    const html = marked.parse(content, {
      breaks: true,
      gfm: true,
      renderer
    }) as string

    // 包装一层带样式的容器
    return `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:#334155;line-height:1.7;max-width:100%;">
        <style>
          p { margin: 0 0 12px; line-height: 1.7; color: #334155; }
          h1 { margin: 24px 0 12px; font-size: 22px; font-weight: 600; color: #1e293b; }
          h2 { margin: 20px 0 10px; font-size: 18px; font-weight: 600; color: #1e293b; }
          h3 { margin: 16px 0 8px; font-size: 16px; font-weight: 600; color: #1e293b; }
          h4 { margin: 14px 0 7px; font-size: 14px; font-weight: 600; color: #1e293b; }
          ul, ol { margin: 8px 0; padding-left: 24px; color: #334155; }
          li { margin: 4px 0; line-height: 1.6; }
          a { color: #3b82f6; text-decoration: none; }
          blockquote { margin: 12px 0; padding: 8px 16px; border-left: 4px solid #e2e8f0; background: #f8fafc; color: #64748b; }
          strong { font-weight: 600; }
          em { font-style: italic; }
        </style>
        ${html}
      </div>
    `
  } catch (error) {
    console.error('渲染内容失败:', error)
    return `<div style="font-family:sans-serif;font-size:14px;color:#334155;white-space:pre-wrap;">${escapeHtml(content)}</div>`
  }
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

// 显示知识库片段预览
function showKnowledgeBaseSnippet(ref: { documentId: string; documentName: string; score: number; snippet?: string }): void {
  currentKbRef.value = ref
  showKbSnippetDialog.value = true
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
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.message-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
}

// 导航按钮（上一个/下一个回答）
.nav-btn {
  padding: 4px 6px;

  &:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  &:not(:disabled):hover {
    color: var(--el-color-primary);
  }
}

// 阅读模式切换按钮
.view-mode-toggle {
  padding: 4px 6px;
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
  border: 1px solid var(--el-color-primary-light-7);
  position: relative;
}

.message-text {
  font-size: 14px;
  line-height: 1.6;
  word-wrap: break-word;

  // markdown 渲染内容样式
  :deep(h1), :deep(h2), :deep(h3), :deep(h4), :deep(h5), :deep(h6) {
    margin: 16px 0 8px;
    font-weight: 600;
    line-height: 1.4;
  }

  :deep(h1) { font-size: 22px; }
  :deep(h2) { font-size: 18px; }
  :deep(h3) { font-size: 16px; }
  :deep(h4) { font-size: 15px; }
  :deep(h5), :deep(h6) { font-size: 14px; }

  :deep(p) {
    margin: 8px 0;
    line-height: 1.7;
  }

  :deep(ul), :deep(ol) {
    margin: 8px 0;
    padding-left: 24px;
  }

  :deep(li) {
    margin: 4px 0;
    line-height: 1.6;
  }

  :deep(blockquote) {
    margin: 8px 0;
    padding: 8px 16px;
    border-left: 4px solid var(--el-color-primary-light-5);
    background: var(--el-color-primary-light-9);
    border-radius: 0 4px 4px 0;
  }

  :deep(blockquote p) {
    margin: 0;
  }

  :deep(a) {
    color: var(--el-color-primary);
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }

  :deep(strong) {
    font-weight: 600;
  }

  :deep(em) {
    font-style: italic;
  }

  :deep(hr) {
    margin: 16px 0;
    border: none;
    border-top: 1px solid #e2e8f0;
  }

  :deep(table) {
    width: 100%;
    margin: 8px 0;
    border-collapse: collapse;
  }

  :deep(th), :deep(td) {
    padding: 8px 12px;
    border: 1px solid #e2e8f0;
    text-align: left;
  }

  :deep(th) {
    background: #f8fafc;
    font-weight: 600;
  }

  :deep(img) {
    max-width: 100%;
    border-radius: 8px;
  }

  // 行内代码样式
  :deep(.inline-code) {
    background: #f1f5f9;
    color: var(--el-color-primary);
    padding: 2px 6px;
    border-radius: 4px;
    font-family: 'SF Mono', 'Monaco', 'Menlo', monospace;
    font-size: 13px;
  }

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

  // Mermaid 图表样式
  :deep(.mermaid-wrapper) {
    background: #f8fafc;
    border-radius: 8px;
    overflow: hidden;
    margin: 10px 0;
    border: 1px solid #e2e8f0;

    .mermaid-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      background: #f1f5f9;
      border-bottom: 1px solid #e2e8f0;

      .language {
        font-size: 12px;
        color: #64748b;
        text-transform: lowercase;
      }

      .header-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .error-indicator {
        display: none;
        align-items: center;
        justify-content: center;
      }

      .copy-btn {
        display: flex;
        align-items: center;
        gap: 4px;
        background: transparent;
        border: none;
        color: #64748b;
        cursor: pointer;
        font-size: 12px;
        padding: 4px 8px;
        border-radius: 4px;
        transition: all 0.2s;

        &:hover {
          background: #e2e8f0;
          color: #334155;
        }
      }
    }

    .mermaid-content {
      padding: 16px;
      overflow-x: auto;
      overflow-y: visible;

      pre.mermaid {
        margin: 0;
        background: transparent;
        font-family: inherit;
        line-height: 1.5;

        svg {
          max-width: 100%;
          height: auto;
          display: block;
        }

        // Mermaid 错误显示样式
        .mermaid-error {
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 6px;
          padding: 12px;

          .error-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;

            .error-icon {
              font-size: 16px;
            }

            .error-text {
              font-size: 14px;
              font-weight: 500;
              color: #dc2626;
            }
          }

          .error-detail {
            font-size: 12px;
            color: #ef4444;
            background: #fee2e2;
            padding: 6px 10px;
            border-radius: 4px;
            margin-bottom: 10px;
          }

          .error-code {
            background: #1e293b;
            color: #e2e8f0;
            padding: 12px;
            border-radius: 6px;
            font-family: 'SF Mono', 'Monaco', 'Menlo', monospace;
            font-size: 12px;
            line-height: 1.5;
            overflow-x: auto;
            margin: 0;
            white-space: pre-wrap;
            word-break: break-all;
          }
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

// 回到顶部按钮
.back-to-top-btn {
  padding: 4px 6px;
  color: #94a3b8;
  opacity: 0;
  transition: opacity 0.2s;

  &:hover {
    color: var(--el-color-primary);
  }

  &.visible {
    opacity: 1;
  }
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

.knowledge-source-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  margin-top: 8px;
  background: linear-gradient(135deg, var(--el-color-primary-light-9) 0%, var(--el-color-primary-light-7) 100%);
  border: 1px solid var(--el-color-primary-light-5);
  border-radius: 6px;
  font-size: 12px;
  color: var(--el-color-primary-dark-2);

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
  border: 1px solid var(--el-color-primary-light-5);
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: var(--el-color-primary);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }

  .ref-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 500;
    color: #1e293b;

    .el-icon {
      color: var(--el-color-primary);
    }
  }

  .ref-score {
    font-size: 11px;
    color: var(--el-color-primary);
    background: var(--el-color-primary-light-7);
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

// 知识库片段预览对话框样式
.kb-snippet-dialog {
  :deep(.el-dialog__body) {
    padding: 16px 20px;
  }
}

.kb-snippet-content {
  .snippet-meta {
    margin-bottom: 12px;
  }

  .snippet-text {
    font-size: 14px;
    line-height: 1.8;
    color: #1e293b;
    background: #f8fafc;
    padding: 16px;
    border-radius: 8px;
    border: 1px solid #e2e8f0;
    max-height: 400px;
    overflow-y: auto;
    white-space: pre-wrap;
    word-break: break-word;
  }
}
</style>
