<template>
  <div class="diary-editor">
    <!-- 编辑器头部 -->
    <div class="editor-header">
      <div class="header-left">
        <el-button text @click="$emit('back')">
          <el-icon><ArrowLeft /></el-icon>
          返回列表
        </el-button>
      </div>
      <div class="header-right">
        <el-tooltip content="插入指向其他日记的 [[链接]]" placement="bottom">
          <el-button @click="openLinkDialog">
            <el-icon><Link /></el-icon>
          </el-button>
        </el-tooltip>
        <el-badge :value="backlinks.length" :hidden="backlinks.length === 0">
          <el-button @click="toggleBacklinks">
            <el-icon><Connection /></el-icon>
            反链
          </el-button>
        </el-badge>
        <el-button @click="toggleInspiration">
          <el-icon><Sunny /></el-icon>
          灵感
        </el-button>
        <el-dropdown @command="handleExport">
          <el-button>
            <el-icon><Download /></el-icon>
            导出
            <el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="html">导出 HTML</el-dropdown-item>
              <el-dropdown-item v-if="isElectron" command="pdf">导出 PDF</el-dropdown-item>
              <el-dropdown-item command="docx">导出 Word</el-dropdown-item>
              <el-dropdown-item
                command="kb"
                :disabled="!content.trim()"
              >
                加入知识库
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <!-- 标题输入 -->
    <div class="editor-title">
      <input
        v-model="title"
        type="text"
        placeholder="日记标题"
        class="title-input"
        @blur="handleTitleChange"
      />
      <el-select
        v-model="localTags"
        multiple
        filterable
        allow-create
        default-first-option
        :reserve-keyword="false"
        placeholder="添加标签（回车创建）"
        size="small"
        class="tag-select"
      />
    </div>

    <!-- 编辑器内容 -->
    <div class="editor-content">
      <MarkdownEditor
        ref="editorRef"
        v-model="content"
        placeholder="开始写日记..."
        @change="handleContentChange"
      />
    </div>

    <!-- 底部信息栏 -->
    <div class="editor-footer">
      <span class="word-count">{{ wordCount }} 字</span>
      <span class="last-saved">最后保存: {{ lastSavedTime }}</span>
    </div>

    <!-- 知识库导入对话框 -->
    <KbPickerDialog
      v-model="showKbDialog"
      :entry-id="props.entry.id"
      :title="title"
      :content="content"
    />

    <!-- 反向链接面板 -->
    <el-drawer
      v-model="showBacklinks"
      title="反向链接"
      size="340px"
      :append-to-body="true"
    >
      <div v-if="backlinks.length === 0" class="backlink-empty">
        还没有其他日记链接到这里。在别的日记里输入 <code>[[{{ title }}]]</code> 即可建立链接。
      </div>
      <div v-else class="backlink-list">
        <div
          v-for="link in backlinks"
          :key="link.sourceEntryId"
          class="backlink-item"
          @click="handleOpenBacklink(link)"
        >
          <div class="backlink-title">{{ link.sourceEntryTitle }}</div>
          <div v-if="link.context" class="backlink-context">{{ link.context }}</div>
        </div>
      </div>
    </el-drawer>

    <!-- 灵感条：到期复习卡 + 相关论断/卡片（一期展示，不注入正文） -->
    <el-drawer
      v-model="showInspiration"
      title="灵感"
      size="360px"
      :append-to-body="true"
    >
      <div v-if="isLoadingInspiration" class="inspiration-loading">
        <el-icon class="is-loading"><Loading /></el-icon>
        <span>加载中...</span>
      </div>
      <template v-else>
        <div class="inspiration-section">
          <div class="section-title">今日到期复习卡（{{ dueCards.length }}）</div>
          <div v-if="dueCards.length === 0" class="section-empty">今天没有到期的复习卡片</div>
          <div v-for="card in dueCards" :key="card.noteId" class="due-card">
            <div class="due-card-title">{{ card.title }}</div>
            <div class="due-card-desc">{{ card.description }}</div>
            <div class="due-card-meta">{{ card.kbName }}</div>
          </div>
          <div v-if="dueCards.length > 0" class="section-hint">到「知识大脑」的复习面板完成回忆评分</div>
        </div>
        <div class="inspiration-section">
          <div class="section-title">相关论断与卡片（{{ relatedItems.length }}）</div>
          <div v-if="relatedItems.length === 0" class="section-empty">知识大脑里还没有与这篇日记相关的内容</div>
          <div v-for="(item, i) in relatedItems" :key="i" class="related-item">
            <div class="related-item-head">
              <el-tag size="small" :type="item.kind === 'note' ? 'warning' : 'success'">
                {{ item.kind === 'note' ? '卡片' : '论断' }}
              </el-tag>
              <span class="related-item-title">{{ item.title }}</span>
            </div>
            <div class="related-item-snippet">{{ item.snippet }}</div>
            <div class="related-item-meta">{{ item.kbName }} · {{ item.documentName }}</div>
          </div>
          <div v-if="relatedItems.length > 0" class="section-hint">仅作参考，不会写入日记</div>
        </div>
        <div class="inspiration-section">
          <div class="section-title">相关历史日记（{{ relatedEntries.length }}）</div>
          <div v-if="relatedEntries.length === 0" class="section-empty">还没有相关的历史日记（开启目录「纳入知识大脑」后可自动召回）</div>
          <div
            v-for="item in relatedEntries"
            :key="item.entryId"
            class="related-entry"
            @click="handleOpenRelatedEntry(item.entryId)"
          >
            <div class="related-entry-title">{{ item.title }}</div>
            <div class="related-entry-snippet">{{ item.snippet }}</div>
          </div>
        </div>
      </template>
    </el-drawer>

    <!-- 插入链接对话框 -->
    <el-dialog v-model="showLinkDialog" title="插入日记链接" width="460px" :append-to-body="true">
      <el-input
        v-model="linkSearchKeyword"
        placeholder="按标题搜索日记..."
        prefix-icon="Search"
        clearable
      />
      <div class="link-candidates">
        <div
          v-for="candidate in linkCandidates"
          :key="candidate.id"
          class="link-candidate"
          @click="insertLink(candidate)"
        >
          <div class="candidate-title">{{ candidate.title }}</div>
          <div class="candidate-meta">{{ formatDate(candidate.createdAt) }}</div>
        </div>
        <div v-if="linkCandidates.length === 0" class="link-empty">
          没有匹配的日记
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowLeft, Download, ArrowDown, Link, Connection, Sunny, Loading } from '@element-plus/icons-vue'
import MarkdownEditor from '@/components/common/MarkdownEditor.vue'
import KbPickerDialog from './KbPickerDialog.vue'
import type { DiaryEntry, DiaryEntryListItem, BacklinkInfo } from '@shared/types/diary'

interface InspirationDueCard {
  noteId: string
  kbId: string
  kbName: string
  title: string
  description: string
  dueAt: string
}

interface InspirationRelatedItem {
  kind: 'atom' | 'note'
  kbId: string
  kbName: string
  documentName: string
  title: string
  snippet: string
  score: number
}

interface InspirationRelatedEntry {
  entryId: string
  title: string
  snippet: string
  score: number
}
import { toFileUrl, isElectronRenderer } from '@/utils/asset-url'

/**
 * 触发浏览器下载（Web 端用）
 * @param pathOrUrl service 返回的文件路径
 * @param suggestedName 下载文件名
 */
function triggerDownload(pathOrUrl: string, suggestedName: string): void {
  // 把 fs 路径或相对路径转成 /assets/... HTTP URL
  // service 返回的可能是绝对路径（含 /home/.../data-web-mt/users/<uid>/exports/xxx）
  // 转换：剥到 exports/<file> → /assets/exports/<file>
  let downloadUrl = pathOrUrl
  const exportsIdx = pathOrUrl.lastIndexOf('/exports/')
  if (exportsIdx >= 0) {
    const rel = 'exports/' + pathOrUrl.slice(exportsIdx + '/exports/'.length)
    downloadUrl = toFileUrl(rel)
  }
  const a = document.createElement('a')
  a.href = downloadUrl
  a.download = suggestedName
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

const props = defineProps<{
  entry: DiaryEntry
}>()

const emit = defineEmits<{
  back: []
  updated: []
  'open-entry': [entryId: string]
}>()

const title = ref(props.entry.title)
const content = ref(props.entry.content || '')
const lastSavedTime = ref(new Date().toLocaleTimeString())
const saveTimeout = ref<number | null>(null)

// 标签（编辑后随防抖一并保存）
const localTags = ref<string[]>([...(props.entry.tags || [])])

// 反向链接
const showBacklinks = ref(false)
const backlinks = ref<BacklinkInfo[]>([])

// 灵感条
const showInspiration = ref(false)
const isLoadingInspiration = ref(false)
const dueCards = ref<InspirationDueCard[]>([])
const relatedItems = ref<InspirationRelatedItem[]>([])
const relatedEntries = ref<InspirationRelatedEntry[]>([])

// 插入链接对话框
const showLinkDialog = ref(false)
const linkSearchKeyword = ref('')
const allEntriesForLink = ref<DiaryEntryListItem[]>([])
const editorRef = ref<InstanceType<typeof MarkdownEditor> | null>(null)

// 平台标记：PDF 依赖 Electron 的 BrowserWindow.printToPDF，Web 端暂不支持
// 模板里据此隐藏「导出 PDF」选项
const isElectron = isElectronRenderer()

// 知识库对话框可见性
const showKbDialog = ref(false)

const wordCount = computed(() => {
  return content.value.replace(/\s/g, '').length
})

// 自动保存
watch([content, localTags], () => {
  if (saveTimeout.value) {
    clearTimeout(saveTimeout.value)
  }
  saveTimeout.value = window.setTimeout(() => {
    saveEntry()
  }, 1000)
})

async function saveEntry() {
  try {
    const result = await window.electronAPI.diary.updateEntry(props.entry.id, {
      title: title.value,
      content: content.value,
      tags: localTags.value
    })
    if (result.success) {
      lastSavedTime.value = new Date().toLocaleTimeString()
      emit('updated')
    }
  } catch (error) {
    console.error('保存失败:', error)
  }
}

async function handleTitleChange() {
  if (title.value !== props.entry.title) {
    await saveEntry()
  }
}

function handleContentChange() {
  // 内容变化由 watch 处理
}

// ==================== 反向链接 ====================

async function loadBacklinks() {
  try {
    const result = await window.electronAPI.diary.getBacklinks(props.entry.id)
    if (result.success) {
      backlinks.value = result.data || []
    }
  } catch (error) {
    console.error('加载反链失败:', error)
  }
}

function toggleBacklinks() {
  showBacklinks.value = !showBacklinks.value
  if (showBacklinks.value) {
    void loadBacklinks()
  }
}

function handleOpenBacklink(link: BacklinkInfo) {
  showBacklinks.value = false
  emit('open-entry', link.sourceEntryId)
}

// ==================== 灵感条 ====================

async function toggleInspiration() {
  showInspiration.value = !showInspiration.value
  if (showInspiration.value) {
    await loadInspiration()
  }
}

function handleOpenRelatedEntry(entryId: string) {
  showInspiration.value = false
  emit('open-entry', entryId)
}

async function loadInspiration() {
  isLoadingInspiration.value = true
  try {
    const result = await window.electronAPI.diary.getInspiration(props.entry.id)
    if (result.success && result.data) {
      dueCards.value = result.data.dueCards || []
      relatedItems.value = result.data.related || []
      relatedEntries.value = result.data.relatedEntries || []
    } else {
      dueCards.value = []
      relatedItems.value = []
      relatedEntries.value = []
    }
  } catch (error) {
    console.error('加载灵感失败:', error)
    dueCards.value = []
    relatedItems.value = []
    relatedEntries.value = []
  } finally {
    isLoadingInspiration.value = false
  }
}

// ==================== 插入链接 ====================

async function openLinkDialog() {
  showLinkDialog.value = true
  if (allEntriesForLink.value.length === 0) {
    try {
      const result = await window.electronAPI.diary.listAllEntries(500)
      if (result.success) {
        allEntriesForLink.value = result.data || []
      }
    } catch (error) {
      console.error('加载日记列表失败:', error)
    }
  }
}

const linkCandidates = computed(() => {
  const kw = linkSearchKeyword.value.trim().toLowerCase()
  return allEntriesForLink.value
    .filter(e => e.id !== props.entry.id)
    .filter(e => !kw || e.title.toLowerCase().includes(kw))
    .slice(0, 50)
})

function insertLink(candidate: DiaryEntryListItem) {
  const text = `[[${candidate.title}]]`
  const cm = editorRef.value?.getCodemirror?.()
  if (cm?.state && cm?.dispatch) {
    const pos = cm.state.selection.main.head
    cm.dispatch({
      changes: { from: pos, insert: text },
      selection: { anchor: pos + text.length }
    })
    cm.focus()
  } else {
    // 编辑器未就绪时降级：追加到文末
    content.value = `${content.value}\n${text}`
  }
  showLinkDialog.value = false
}

function formatDate(date: Date | string): string {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

onMounted(() => {
  void loadBacklinks()
})

async function handleExport(format: string) {
  if (format === 'kb') {
    showKbDialog.value = true
    return
  }

  try {
    // 定义文件过滤器
    const filters: Array<{ name: string; extensions: string[] }> = []
    let ext = ''

    switch (format) {
      case 'html':
        filters.push({ name: 'HTML 文件', extensions: ['html', 'htm'] })
        ext = 'html'
        break
      case 'pdf':
        filters.push({ name: 'PDF 文件', extensions: ['pdf'] })
        ext = 'pdf'
        break
      case 'docx':
        filters.push({ name: 'Word 文档', extensions: ['docx'] })
        ext = 'docx'
        break
    }

    // 双端：Electron 通过 dialog 选保存路径并传给 service；Web 跳过 dialog
    // 让 service 写到用户数据目录，返回相对路径后由浏览器触发下载。
    let savePath: string | undefined
    if (isElectron) {
      const dialogResult = await window.electronAPI.file.saveFile({
        defaultPath: `${props.entry.title}.${ext}`,
        filters
      })
      if (!dialogResult.success || !dialogResult.filePath) {
        return // 用户取消
      }
      savePath = dialogResult.filePath
    }

    // 执行导出
    let result
    switch (format) {
      case 'html':
        result = await window.electronAPI.diary.exportHtml(props.entry.id, savePath)
        break
      case 'pdf':
        result = await window.electronAPI.diary.exportPdf(props.entry.id, savePath)
        break
      case 'docx':
        result = await window.electronAPI.diary.exportDocx(props.entry.id, savePath)
        break
    }

    if (result?.success) {
      // Web 端：result.data 是后端写入的绝对/相对路径，触发浏览器下载
      if (!isElectron && result.data) {
        triggerDownload(result.data, `${props.entry.title}.${ext}`)
      }
      ElMessage.success(`导出成功`)
    } else {
      ElMessage.error(result?.error || '导出失败')
    }
  } catch (error) {
    console.error('导出失败:', error)
    ElMessage.error('导出失败')
  }
}

onUnmounted(() => {
  if (saveTimeout.value) {
    clearTimeout(saveTimeout.value)
  }
})
</script>

<style lang="scss" scoped>
.diary-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--bg-color);
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 24px;
  border-bottom: 1px solid var(--border-color-lighter);
}

.editor-title {
  padding: 16px 24px;
  border-bottom: 1px solid var(--border-color-lighter);
  display: flex;
  align-items: center;
  gap: 16px;

  .title-input {
    flex: 1;
    font-size: 24px;
    font-weight: 600;
    border: none;
    outline: none;
    background: transparent;
    color: var(--text-color-primary);

    &::placeholder {
      color: var(--text-color-placeholder);
    }
  }

  .tag-select {
    width: 240px;
    flex-shrink: 0;
  }
}

.editor-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 0 24px;
  display: flex;
  flex-direction: column;
}

.editor-footer {
  display: flex;
  justify-content: space-between;
  padding: 8px 24px;
  font-size: 12px;
  color: var(--text-color-secondary);
  border-top: 1px solid var(--border-color-lighter);
}

// 反链面板
.backlink-empty {
  font-size: 13px;
  color: var(--text-color-secondary);
  line-height: 1.8;

  code {
    background: var(--bg-color-page);
    padding: 2px 6px;
    border-radius: 4px;
  }
}

.backlink-list {
  .backlink-item {
    padding: 10px 12px;
    border: 1px solid var(--border-color-lighter);
    border-radius: 8px;
    margin-bottom: 10px;
    cursor: pointer;
    transition: border-color 0.2s;

    &:hover {
      border-color: var(--color-primary-light-5);
    }

    .backlink-title {
      font-size: 14px;
      font-weight: 500;
    }

    .backlink-context {
      font-size: 12px;
      color: var(--text-color-secondary);
      margin-top: 4px;
      line-height: 1.5;
    }
  }
}

// 插入链接对话框
.link-candidates {
  max-height: 320px;
  overflow-y: auto;
  margin-top: 10px;

  .link-candidate {
    padding: 10px 12px;
    border-radius: 6px;
    cursor: pointer;

    &:hover {
      background: var(--bg-color-page);
    }

    .candidate-title {
      font-size: 14px;
      font-weight: 500;
    }

    .candidate-meta {
      font-size: 12px;
      color: var(--text-color-secondary);
      margin-top: 2px;
    }
  }

  .link-empty {
    padding: 24px;
    text-align: center;
    color: var(--text-color-secondary);
    font-size: 13px;
  }
}

// 灵感条
.inspiration-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px;
  color: var(--text-color-secondary);
}

.inspiration-section {
  margin-bottom: 24px;

  .section-title {
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 10px;
  }

  .section-empty {
    font-size: 12px;
    color: var(--text-color-secondary);
    padding: 8px 0;
  }

  .section-hint {
    font-size: 11px;
    color: var(--text-color-placeholder);
    margin-top: 8px;
  }
}

.due-card {
  padding: 10px 12px;
  border: 1px solid var(--border-color-lighter);
  border-radius: 8px;
  margin-bottom: 8px;

  .due-card-title {
    font-size: 13px;
    font-weight: 500;
  }

  .due-card-desc {
    font-size: 12px;
    color: var(--text-color-regular);
    margin-top: 4px;
    line-height: 1.5;
  }

  .due-card-meta {
    font-size: 11px;
    color: var(--text-color-secondary);
    margin-top: 4px;
  }
}

.related-entry {
  padding: 10px 12px;
  border: 1px solid var(--border-color-lighter);
  border-radius: 8px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: border-color 0.2s;

  &:hover {
    border-color: var(--color-primary-light-5);
  }

  .related-entry-title {
    font-size: 13px;
    font-weight: 500;
  }

  .related-entry-snippet {
    font-size: 12px;
    color: var(--text-color-secondary);
    margin-top: 4px;
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
}

.related-item {
  padding: 10px 12px;
  border: 1px solid var(--border-color-lighter);
  border-radius: 8px;
  margin-bottom: 8px;

  .related-item-head {
    display: flex;
    align-items: center;
    gap: 8px;

    .related-item-title {
      font-size: 13px;
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .related-item-snippet {
    font-size: 12px;
    color: var(--text-color-regular);
    margin-top: 6px;
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .related-item-meta {
    font-size: 11px;
    color: var(--text-color-secondary);
    margin-top: 6px;
  }
}
</style>