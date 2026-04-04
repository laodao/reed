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
        <el-dropdown @command="handleExport">
          <el-button>
            <el-icon><Download /></el-icon>
            导出
            <el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="html">导出 HTML</el-dropdown-item>
              <el-dropdown-item command="pdf">导出 PDF</el-dropdown-item>
              <el-dropdown-item command="docx">导出 Word</el-dropdown-item>
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
    </div>

    <!-- 编辑器内容 -->
    <div class="editor-content">
      <MarkdownEditor
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowLeft, Download, ArrowDown } from '@element-plus/icons-vue'
import MarkdownEditor from '@/components/common/MarkdownEditor.vue'
import type { DiaryEntry } from '@shared/types/diary'

const props = defineProps<{
  entry: DiaryEntry
}>()

const emit = defineEmits<{
  back: []
  updated: []
}>()

const title = ref(props.entry.title)
const content = ref(props.entry.content || '')
const lastSavedTime = ref(new Date().toLocaleTimeString())
const saveTimeout = ref<number | null>(null)

const wordCount = computed(() => {
  return content.value.replace(/\s/g, '').length
})

// 自动保存
watch(content, () => {
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
      content: content.value
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

async function handleExport(format: string) {
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

    // 弹出保存对话框
    const dialogResult = await window.electronAPI.file.saveFile({
      defaultPath: `${props.entry.title}.${ext}`,
      filters
    })

    // 用户取消
    if (!dialogResult.success || !dialogResult.filePath) {
      return
    }

    const savePath = dialogResult.filePath

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

  .title-input {
    width: 100%;
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
</style>