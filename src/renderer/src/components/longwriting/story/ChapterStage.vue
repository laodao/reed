<template>
  <div class="chapter-stage">
    <div class="stage-header">
      <h2>章节写作</h2>
      <p class="stage-desc">根据大纲生成章节内容，支持手动编辑和版本管理</p>
    </div>

    <div class="stage-content">
      <!-- 大纲选择 -->
      <div class="outline-selector">
        <el-select v-model="selectedOutlineId" placeholder="选择要写作的大纲节点" @change="loadChapter">
          <el-option-group label="卷">
            <el-option
              v-for="node in volumeNodes"
              :key="node.id"
              :label="node.name"
              :value="node.id"
            >
              <span>{{ node.name }}</span>
              <span class="node-status" :class="node.status">{{ getStatusName(node.status) }}</span>
            </el-option>
          </el-option-group>
          <el-option-group label="章">
            <el-option
              v-for="node in chapterNodes"
              :key="node.id"
              :label="node.name"
              :value="node.id"
            >
              <span>{{ node.name }}</span>
              <span class="node-status" :class="node.status">{{ getStatusName(node.status) }}</span>
            </el-option>
          </el-option-group>
          <el-option-group label="节">
            <el-option
              v-for="node in sectionNodes"
              :key="node.id"
              :label="node.name"
              :value="node.id"
            >
              <span>{{ node.name }}</span>
              <span class="node-status" :class="node.status">{{ getStatusName(node.status) }}</span>
            </el-option>
          </el-option-group>
        </el-select>
      </div>

      <!-- 未选择大纲时的提示 -->
      <div v-if="!selectedOutlineId" class="empty-chapter">
        <el-empty description="请先选择要写作的大纲节点">
          <el-button type="primary" @click="goToOutline">前往大纲设计</el-button>
        </el-empty>
      </div>

      <!-- 已选择大纲时的编辑区 -->
      <template v-else>
        <!-- 大纲信息 -->
        <div class="outline-info">
          <div class="info-header">
            <h3>{{ selectedOutline?.name }}</h3>
            <div class="info-meta">
              <span>预估字数：{{ selectedOutline?.estimatedWords || 0 }}字</span>
              <span>当前字数：{{ currentWordCount }}字</span>
              <el-tag :type="getStatusType(selectedOutline?.status)">
                {{ getStatusName(selectedOutline?.status) }}
              </el-tag>
            </div>
          </div>
          <p class="info-summary">{{ selectedOutline?.summary || '暂无概要' }}</p>
          <div class="info-references">
            <span v-if="selectedOutline?.involvedCharacters.length > 0">
              涉及角色：
              <el-tag v-for="id in selectedOutline?.involvedCharacters" :key="id" size="small">
                {{ getCharacterName(id) }}
              </el-tag>
            </span>
            <span v-if="selectedOutline?.involvedLocations.length > 0">
              涉及地点：
              <el-tag v-for="id in selectedOutline?.involvedLocations" :key="id" size="small" type="info">
                {{ getLocationName(id) }}
              </el-tag>
            </span>
          </div>
        </div>

        <!-- 内容编辑区 -->
        <div class="editor-container">
          <div class="editor-toolbar">
            <el-button v-if="!generating" type="primary" @click="generateChapter">
              <el-icon><MagicStick /></el-icon>
              AI 生成
            </el-button>
            <el-button v-else type="danger" @click="cancelGeneration">
              <el-icon><Close /></el-icon>
              取消生成
            </el-button>
            <el-button :loading="generating" @click="showVersionDialog = true">
              <el-icon><Clock /></el-icon>
              版本历史
            </el-button>
            <el-button :disabled="generating" @click="saveChapter">
              <el-icon><DocumentChecked /></el-icon>
              保存
            </el-button>
            <div class="toolbar-right">
              <span class="word-count">{{ currentWordCount }}字</span>
              <el-switch v-model="autoSave" active-text="自动保存" :disabled="generating" />
            </div>
          </div>

          <el-input
            v-model="chapterContent"
            type="textarea"
            :rows="20"
            placeholder="在这里编写章节内容，或点击'AI 生成'自动生成..."
            class="chapter-editor"
            @input="updateWordCount"
          />
        </div>

        <!-- AI 生成参数设置 -->
        <el-dialog
          v-model="showGenerateDialog"
          title="AI 生成参数"
          width="400px"
        >
          <el-form :model="generateForm" label-width="80px">
            <el-form-item label="目标字数">
              <el-input-number v-model="generateForm.targetWords" :min="500" :max="50000" :step="500" />
            </el-form-item>
            <el-form-item label="写作风格">
              <el-select v-model="generateForm.style" placeholder="选择写作风格">
                <el-option label="默认" value="" />
                <el-option label="轻松幽默" value="light" />
                <el-option label="沉重深刻" value="heavy" />
                <el-option label="热血激昂" value="passionate" />
                <el-option label="冷峻沉稳" value="calm" />
              </el-select>
            </el-form-item>
            <el-form-item label="附加提示">
              <el-input
                v-model="generateForm.extraPrompt"
                type="textarea"
                :rows="2"
                placeholder="其他写作要求..."
              />
            </el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="showGenerateDialog = false">取消</el-button>
            <el-button type="primary" :loading="generating" @click="executeGeneration">
              开始生成
            </el-button>
          </template>
        </el-dialog>

        <!-- 版本历史对话框 -->
        <el-dialog
          v-model="showVersionDialog"
          title="版本历史"
          width="600px"
        >
          <div class="version-list">
            <div v-for="version in versions" :key="version.id" class="version-item">
              <div class="version-info">
                <span class="version-number">版本 {{ version.versionNumber }}</span>
                <span class="version-type" :class="version.versionType">
                  {{ version.versionType === 'generated' ? 'AI生成' : '手动编辑' }}
                </span>
                <span class="version-date">{{ formatDate(version.createdAt) }}</span>
                <span class="version-words">{{ version.wordCount }}字</span>
                <el-tag v-if="version.isLocked" type="warning" size="small">已锁定</el-tag>
              </div>
              <div class="version-actions">
                <el-button text size="small" @click="previewVersion(version)">
                  <el-icon><View /></el-icon>
                  预览
                </el-button>
                <el-button
                  text
                  size="small"
                  :disabled="version.isLocked"
                  @click="restoreVersion(version)"
                >
                  <el-icon><RefreshLeft /></el-icon>
                  恢复
                </el-button>
              </div>
            </div>
            <el-empty v-if="versions.length === 0" description="暂无历史版本" />
          </div>
        </el-dialog>

        <!-- 版本预览对话框 -->
        <el-dialog
          v-model="showPreviewDialog"
          title="版本预览"
          width="700px"
        >
          <div class="preview-content">
            <pre>{{ previewContent }}</pre>
          </div>
        </el-dialog>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { MagicStick, Clock, DocumentChecked, View, RefreshLeft, Close } from '@element-plus/icons-vue'
import type { StoryOutline, StoryChapter, ChapterVersion, OutlineStatus, StoryCharacter } from '../../../../shared/types/longwriting.types'

const props = defineProps<{
  projectId: string
}>()

const emit = defineEmits<{
  'update:progress': [progress: number]
}>()

const router = useRouter()

// 大纲节点列表
const outlineNodes = ref<StoryOutline[]>([])

// 角色和地点列表
const characters = ref<StoryCharacter[]>([])
const locations = ref<any[]>([])

// 选中的大纲
const selectedOutlineId = ref<string>('')

// 章节内容
const chapterContent = ref('')
const currentChapterId = ref<string | null>(null)
const currentWordCount = ref(0)

// 版本列表
const versions = ref<ChapterVersion[]>([])

// 对话框状态
const showGenerateDialog = ref(false)
const showVersionDialog = ref(false)
const showPreviewDialog = ref(false)
const previewContent = ref('')

// 生成状态
const generating = ref(false)
const autoSave = ref(true)

// 加载状态
const loading = ref(false)

// 生成参数表单
const generateForm = ref({
  targetWords: 3000,
  style: '',
  extraPrompt: ''
})

// 计算属性：按类型分组的大纲节点
const volumeNodes = computed(() => {
  return outlineNodes.value.filter(n => n.nodeType === 'volume')
})

const chapterNodes = computed(() => {
  return outlineNodes.value.filter(n => n.nodeType === 'chapter')
})

const sectionNodes = computed(() => {
  return outlineNodes.value.filter(n => n.nodeType === 'section')
})

// 选中的大纲节点
const selectedOutline = computed(() => {
  return outlineNodes.value.find(n => n.id === selectedOutlineId.value)
})

// 名称映射
function getStatusName(status?: OutlineStatus): string {
  const names: Record<OutlineStatus, string> = {
    pending: '待写',
    progressing: '进行中',
    completed: '已完成'
  }
  return status ? names[status] : '待写'
}

function getStatusType(status?: OutlineStatus): string {
  const types: Record<OutlineStatus, string> = {
    pending: 'info',
    progressing: 'warning',
    completed: 'success'
  }
  return status ? types[status] : 'info'
}

function getCharacterName(id: string): string {
  const char = characters.value.find(c => c.id === id)
  return char?.name || '未知角色'
}

function getLocationName(id: string): string {
  const loc = locations.value.find(l => l.id === id)
  return loc?.name || '未知地点'
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN')
}

// 加载章节内容
async function loadChapter(outlineId: string) {
  if (!outlineId) {
    chapterContent.value = ''
    currentChapterId.value = null
    versions.value = []
    return
  }

  const result = await window.electronAPI.longwriting.getChapter(outlineId)
  if (result.success && result.data) {
    currentChapterId.value = result.data.id
    chapterContent.value = result.data.content || ''
    currentWordCount.value = chapterContent.value.length

    // 加载版本历史
    await loadVersions(result.data.id)
  } else {
    currentChapterId.value = null
    chapterContent.value = ''
    currentWordCount.value = 0
    versions.value = []
  }
}

// 加载版本历史
async function loadVersions(chapterId: string) {
  const result = await window.electronAPI.longwriting.getChapterVersions(chapterId)
  if (result.success) {
    versions.value = result.data || []
  }
}

// 更新字数统计
function updateWordCount() {
  currentWordCount.value = chapterContent.value.length
}

// 保存章节
async function saveChapter() {
  if (!selectedOutlineId.value) return

  const result = await window.electronAPI.longwriting.saveChapter(selectedOutlineId.value, chapterContent.value)
  if (result.success) {
    currentChapterId.value = result.data.id
    ElMessage.success('章节已保存')

    // 更新大纲状态为进行中
    if (selectedOutline.value && selectedOutline.value.status === 'pending') {
      await window.electronAPI.longwriting.updateOutline(selectedOutline.value.id, { status: 'progressing' })
      await loadOutlineTree()
    }

    // 重新加载版本历史
    if (currentChapterId.value) {
      await loadVersions(currentChapterId.value)
    }

    updateProgress()
  } else {
    ElMessage.error(result.error || '保存失败')
  }
}

// AI 生成章节
function generateChapter() {
  if (!selectedOutlineId.value) {
    ElMessage.warning('请先选择大纲节点')
    return
  }

  // 设置默认目标字数
  generateForm.value.targetWords = selectedOutline.value?.estimatedWords || 3000
  showGenerateDialog.value = true
}

// 当前生成事件 ID
const currentEventId = ref<string | null>(null)

// 执行生成
async function executeGeneration() {
  showGenerateDialog.value = false
  generating.value = true
  chapterContent.value = '' // 清空当前内容

  // 生成唯一事件 ID
  currentEventId.value = `chapter-${selectedOutlineId.value}-${Date.now()}`

  // 监听流式生成事件
  const unsubscribe = window.electronAPI.longwriting.onGenerateEvent(
    currentEventId.value,
    (event: { type: string; content?: string; error?: string }) => {
      if (event.type === 'content' && event.content) {
        chapterContent.value += event.content
        currentWordCount.value = chapterContent.value.length
      } else if (event.type === 'done') {
        generating.value = false
        currentEventId.value = null
        // 自动保存
        if (autoSave.value && chapterContent.value) {
          saveChapter()
        }
        ElMessage.success('章节内容已生成')
        unsubscribe()
      } else if (event.type === 'error') {
        generating.value = false
        currentEventId.value = null
        ElMessage.error(event.error || '生成失败')
        unsubscribe()
      }
    }
  )

  // 调用 AI API，传递 eventId
  const result = await window.electronAPI.longwriting.generateChapter(
    currentEventId.value,
    props.projectId,
    selectedOutlineId.value,
    generateForm.value.targetWords
  )

  if (!result.success) {
    generating.value = false
    currentEventId.value = null
    unsubscribe()
    ElMessage.error(result.error || '生成失败')
  }
}

// 取消生成
function cancelGeneration() {
  if (!currentEventId.value) return
  generating.value = false
  currentEventId.value = null
  ElMessage.info('已取消生成')
}

// 预览版本
function previewVersion(version: ChapterVersion) {
  previewContent.value = version.content
  showPreviewDialog.value = true
}

// 恢复版本
async function restoreVersion(version: ChapterVersion) {
  if (version.isLocked) {
    ElMessage.warning('该版本已锁定，无法恢复')
    return
  }

  try {
    await ElMessageBox.confirm(
      '恢复历史版本将替换当前内容，确定要恢复吗？',
      '恢复版本',
      {
        confirmButtonText: '恢复',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    if (!currentChapterId.value) return

    const result = await window.electronAPI.longwriting.restoreChapterVersion(currentChapterId.value, version.id)
    if (result.success) {
      chapterContent.value = result.data.content || ''
      currentWordCount.value = chapterContent.value.length
      await loadVersions(currentChapterId.value)
      ElMessage.success(`已恢复到版本 ${version.versionNumber}`)
    } else {
      ElMessage.error(result.error || '恢复失败')
    }
  } catch {
    // 用户取消
  }
}

// 前往大纲设计
function goToOutline() {
  emit('update:progress', 65)
}

// 更新进度
function updateProgress() {
  const completedNodes = outlineNodes.value.filter(n => n.status === 'completed').length
  const totalNodes = outlineNodes.value.length
  const progress = Math.min(100, 75 + Math.floor((completedNodes / Math.max(totalNodes, 1)) * 25))
  emit('update:progress', progress)
}

// 加载大纲树
async function loadOutlineTree() {
  if (!props.projectId) return
  const result = await window.electronAPI.longwriting.getOutlineTree(props.projectId)
  if (result.success) {
    outlineNodes.value = result.data || []
  }
}

// 加载角色列表
async function loadCharacters() {
  if (!props.projectId) return
  const result = await window.electronAPI.longwriting.getCharacters(props.projectId)
  if (result.success) {
    characters.value = result.data || []
  }
}

// 加载地点列表
async function loadLocations() {
  if (!props.projectId) return
  const result = await window.electronAPI.longwriting.getLocations(props.projectId)
  if (result.success) {
    locations.value = result.data || []
  }
}

// 加载大纲和引用数据
async function loadData() {
  loading.value = true
  await Promise.all([
    loadOutlineTree(),
    loadCharacters(),
    loadLocations()
  ])
  loading.value = false
  updateProgress()
}

// 自动保存 - 使用防抖
let saveTimer: ReturnType<typeof setTimeout> | null = null
watch(chapterContent, () => {
  if (autoSave.value && currentChapterId.value) {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveChapter()
    }, 3000)
  }
})

// 监听 projectId 变化重新加载
watch(() => props.projectId, () => {
  loadData()
})

onMounted(() => {
  loadData()
})
</script>

<style lang="scss" scoped>
.chapter-stage {
  max-width: 900px;
  margin: 0 auto;
}

.stage-header {
  margin-bottom: 24px;

  h2 {
    font-size: 20px;
    font-weight: 600;
    color: var(--text-color-primary);
    margin: 0 0 8px 0;
  }

  .stage-desc {
    font-size: 14px;
    color: var(--text-color-secondary);
    margin: 0;
  }
}

.stage-content {
  background: var(--bg-color);
  padding: 24px;
  border-radius: 12px;
  border: 1px solid var(--border-color-light);
}

.outline-selector {
  margin-bottom: 24px;

  .el-select {
    width: 100%;
  }

  .node-status {
    font-size: 12px;
    padding: 2px 6px;
    border-radius: 4px;
    margin-left: 8px;

    &.pending {
      background: var(--color-info-light-9);
      color: var(--color-info);
    }

    &.progressing {
      background: var(--color-warning-light-9);
      color: var(--color-warning);
    }

    &.completed {
      background: var(--color-success-light-9);
      color: var(--color-success);
    }
  }
}

.empty-chapter {
  padding: 40px 0;
}

.outline-info {
  margin-bottom: 24px;
  padding: 16px;
  background: var(--fill-color-lighter);
  border-radius: 8px;

  .info-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;

    h3 {
      font-size: 18px;
      font-weight: 500;
      color: var(--text-color-primary);
      margin: 0;
    }

    .info-meta {
      display: flex;
      align-items: center;
      gap: 16px;
      font-size: 14px;
      color: var(--text-color-secondary);
    }
  }

  .info-summary {
    font-size: 14px;
    color: var(--text-color-regular);
    margin: 0 0 12px 0;
    line-height: 1.6;
  }

  .info-references {
    display: flex;
    gap: 16px;
    font-size: 13px;
    color: var(--text-color-secondary);

    .el-tag {
      margin-left: 4px;
    }
  }
}

.editor-container {
  border: 1px solid var(--border-color-lighter);
  border-radius: 8px;
  overflow: hidden;
}

.editor-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: var(--fill-color-blank);
  border-bottom: 1px solid var(--border-color-lighter);

  .toolbar-right {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 16px;

    .word-count {
      font-size: 14px;
      color: var(--text-color-secondary);
    }
  }
}

.chapter-editor {
  :deep(.el-textarea__inner) {
    border: none;
    border-radius: 0;
    font-family: 'Microsoft YaHei', sans-serif;
    font-size: 14px;
    line-height: 1.8;
    padding: 16px;
    resize: none;
  }
}

.version-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.version-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--fill-color-blank);
  border-radius: 6px;
  border: 1px solid var(--border-color-lighter);

  .version-info {
    display: flex;
    align-items: center;
    gap: 12px;

    .version-number {
      font-weight: 500;
      color: var(--text-color-primary);
    }

    .version-type {
      font-size: 12px;
      padding: 2px 6px;
      border-radius: 4px;

      &.generated {
        background: var(--color-primary-light-9);
        color: var(--color-primary);
      }

      &.manual {
        background: var(--color-success-light-9);
        color: var(--color-success);
      }
    }

    .version-date,
    .version-words {
      font-size: 12px;
      color: var(--text-color-secondary);
    }
  }

  .version-actions {
    display: flex;
    gap: 4px;
  }
}

.preview-content {
  background: var(--fill-color-lighter);
  padding: 16px;
  border-radius: 8px;
  max-height: 400px;
  overflow-y: auto;

  pre {
    margin: 0;
    font-family: 'Microsoft YaHei', sans-serif;
    font-size: 14px;
    line-height: 1.8;
    white-space: pre-wrap;
    word-wrap: break-word;
  }
}
</style>