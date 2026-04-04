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
        <el-button text @click="handleSave">
          <el-icon><Check /></el-icon>
          保存
        </el-button>
      </div>
    </div>

    <!-- 标题输入 -->
    <div class="editor-title">
      <el-input
        v-model="title"
        placeholder="请输入标题..."
        size="large"
        @change="handleTitleChange"
      />
    </div>

    <!-- 编辑器内容 -->
    <div class="editor-content">
      <div ref="editorRef" class="md-editor"></div>
    </div>

    <!-- 底部信息栏 -->
    <div class="editor-footer">
      <div class="footer-left">
        <span class="word-count">{{ wordCount }} 字</span>
      </div>
      <div class="footer-right">
        <span class="last-update">最后更新: {{ formatTime(entry.updatedAt) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowLeft, Check } from '@element-plus/icons-vue'
import type { DiaryEntry } from '@shared/types/diary'

// Props
const props = defineProps<{
  entry: DiaryEntry
}>()

// Emits
const emit = defineEmits<{
  back: []
  updated: []
}>()

// 编辑器引用
const editorRef = ref<HTMLDivElement | null>(null)
let editorInstance: any = null

// 标题
const title = ref(props.entry.title || '')

// 内容
const content = ref(props.entry.content || '')

// 字数统计
const wordCount = computed(() => {
  return content.value.replace(/\s/g, '').length
})

// 标题变化处理
async function handleTitleChange() {
  if (title.value === props.entry.title) return
  await saveEntry()
}

// 保存日记
async function saveEntry() {
  try {
    const result = await window.electronAPI.diary.updateEntry(props.entry.id, {
      title: title.value,
      content: content.value
    })
    if (result.success) {
      emit('updated')
      ElMessage.success('保存成功')
    } else {
      ElMessage.error(result.error || '保存失败')
    }
  } catch (error) {
    console.error('保存日记失败:', error)
    ElMessage.error('保存失败')
  }
}

// 处理保存按钮点击
async function handleSave() {
  await saveEntry()
}

// 格式化时间
function formatTime(date: Date | string): string {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// 初始化编辑器
async function initEditor() {
  // 动态导入 ByteMD
  const { Editor } = await import('@bytemd/vue')
  const gfm = await import('@bytemd/plugin-gfm')
  const highlight = await import('@bytemd/plugin-highlight')

  if (editorRef.value) {
    editorInstance = new Editor({
      target: editorRef.value,
      props: {
        value: content.value,
        plugins: [gfm.default(), highlight.default()],
        mode: 'split'
      }
    })

    editorInstance.$on('change', (e: { detail: { value: string } }) => {
      content.value = e.detail.value
    })
  }
}

// 监听 entry 变化，重置编辑器内容
watch(() => props.entry, (newEntry) => {
  title.value = newEntry.title || ''
  content.value = newEntry.content || ''
  if (editorInstance) {
    editorInstance.$set({ value: content.value })
  }
})

onMounted(() => {
  initEditor()
})

onUnmounted(() => {
  if (editorInstance) {
    editorInstance.$destroy()
  }
})
</script>

<style lang="scss" scoped>
.diary-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
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

  :deep(.el-input__wrapper) {
    background: transparent;
    box-shadow: none;
    font-size: 20px;
    font-weight: 500;
  }

  :deep(.el-input__inner) {
    font-size: 20px;
    font-weight: 500;
  }
}

.editor-content {
  flex: 1;
  overflow: hidden;
  padding: 16px 24px;

  .md-editor {
    height: 100%;
    border: 1px solid var(--border-color-lighter);
    border-radius: 8px;
  }
}

.editor-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 24px;
  border-top: 1px solid var(--border-color-lighter);
  font-size: 12px;
  color: var(--text-color-secondary);

  .word-count {
    margin-right: 16px;
  }
}
</style>