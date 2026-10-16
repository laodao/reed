<template>
  <div class="chapter-stage">
    <div class="stage-header">
      <h2>章节写作</h2>
      <p class="stage-desc">根据大纲撰写评论内容</p>
    </div>

    <div class="stage-content">
      <!-- 段落选择 -->
      <div class="section-selector">
        <el-select v-model="selectedSectionId" placeholder="选择要写作的段落" @change="loadSection">
          <el-option
            v-for="(section, index) in outlineSections"
            :key="section.id"
            :label="`${index + 1}. ${section.name || '未命名段落'}`"
            :value="section.id"
          >
            <span>{{ index + 1 }}. {{ section.name || '未命名段落' }}</span>
            <el-tag :type="section.status === 'completed' ? 'success' : 'info'" size="small" class="status-tag">
              {{ section.status === 'completed' ? '已完成' : '待写' }}
            </el-tag>
          </el-option>
        </el-select>
      </div>

      <!-- 未选择段落时的提示 -->
      <div v-if="!selectedSectionId" class="empty-section">
        <el-empty description="请先选择要写作的段落">
          <el-button type="primary" @click="goToOutline">前往大纲设计</el-button>
        </el-empty>
      </div>

      <!-- 已选择段落时的编辑区 -->
      <template v-else>
        <!-- 段落信息 -->
        <div class="section-info">
          <div class="info-header">
            <h3>{{ selectedSection?.name }}</h3>
            <div class="info-meta">
              <span>预估字数：{{ selectedSection?.estimatedWords || 0 }}字</span>
              <span>当前字数：{{ currentWordCount }}字</span>
            </div>
          </div>
          <p class="info-summary">{{ selectedSection?.summary || '暂无概要' }}</p>
        </div>

        <!-- 素材引用 -->
        <div class="material-reference">
          <div class="reference-header">
            <span>素材引用</span>
            <el-button text size="small" @click="showMaterialDialog = true">
              <el-icon><Plus /></el-icon>
              添加引用
            </el-button>
          </div>
          <div class="reference-list">
            <el-tag
              v-for="ref in referencedMaterials"
              :key="ref.id"
              closable
              @close="removeReference(ref.id)"
            >
              {{ ref.name }}
            </el-tag>
            <span v-if="referencedMaterials.length === 0" class="no-reference">
              暂无引用素材
            </span>
          </div>
        </div>

        <!-- 内容编辑区 -->
        <div class="editor-container">
          <div class="editor-toolbar">
            <el-button v-if="!generating" type="primary" @click="generateSection">
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
            <el-button type="success" @click="saveSection">
              <el-icon><DocumentChecked /></el-icon>
              保存
            </el-button>
            <div class="toolbar-right">
              <span class="word-count">{{ currentWordCount }}字</span>
              <el-progress
                :percentage="wordProgress"
                :status="wordProgress >= 100 ? 'success' : ''"
                :show-text="false"
                class="progress-bar"
              />
            </div>
          </div>

          <el-input
            v-model="sectionContent"
            type="textarea"
            :rows="18"
            placeholder="在这里编写评论内容，或点击'AI 生成'自动生成..."
            class="section-editor"
            @input="updateWordCount"
          />
        </div>

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
              </div>
              <div class="version-actions">
                <el-button text size="small" @click="previewVersion(version)">
                  <el-icon><View /></el-icon>
                  预览
                </el-button>
                <el-button text size="small" @click="restoreVersion(version)">
                  <el-icon><RefreshLeft /></el-icon>
                  恢复
                </el-button>
              </div>
            </div>
            <el-empty v-if="versions.length === 0" description="暂无历史版本" />
          </div>
        </el-dialog>

        <!-- 素材选择对话框 -->
        <el-dialog
          v-model="showMaterialDialog"
          title="选择素材"
          width="500px"
        >
          <div class="material-select-list">
            <div
              v-for="material in availableMaterials"
              :key="material.id"
              class="material-select-item"
              :class="{ selected: selectedMaterialIds.includes(material.id) }"
              @click="toggleMaterial(material.id)"
            >
              <el-checkbox :model-value="selectedMaterialIds.includes(material.id)" />
              <span class="material-name">{{ material.name }}</span>
              <span class="material-type">{{ getMaterialTypeLabel(material.type) }}</span>
            </div>
            <el-empty v-if="availableMaterials.length === 0" description="暂无可用素材" />
          </div>
          <template #footer>
            <el-button @click="showMaterialDialog = false">取消</el-button>
            <el-button type="primary" @click="confirmMaterials">确认</el-button>
          </template>
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
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Plus, MagicStick, Clock, DocumentChecked, View, RefreshLeft, Close
} from '@element-plus/icons-vue'
import type { StoryMaterial, MaterialType, ChapterVersion, StoryOutline } from '../../../../shared/types/longwriting.types'

const props = defineProps<{
  projectId: string
}>()

const emit = defineEmits<{
  'update:progress': [progress: number]
}>()

// 大纲段落列表
const outlineSections = ref<StoryOutline[]>([])

// 选中的段落
const selectedSectionId = ref<string>('')

// 当前章节 ID
const currentChapterId = ref<string | null>(null)

// 内容
const sectionContent = ref('')
const currentWordCount = ref(0)

// 版本列表
const versions = ref<ChapterVersion[]>([])

// 素材
const availableMaterials = ref<StoryMaterial[]>([])
const referencedMaterials = ref<StoryMaterial[]>([])
const selectedMaterialIds = ref<string[]>([])

// 对话框状态
const showVersionDialog = ref(false)
const showMaterialDialog = ref(false)
const showPreviewDialog = ref(false)
const previewContent = ref('')

// 生成状态
const generating = ref(false)
const loading = ref(false)

// 选中的段落
const selectedSection = computed(() => {
  return outlineSections.value.find(s => s.id === selectedSectionId.value)
})

// 字数进度
const wordProgress = computed(() => {
  if (!selectedSection.value?.estimatedWords) return 0
  return Math.min(100, Math.round((currentWordCount.value / selectedSection.value.estimatedWords) * 100))
})

// 名称映射
function getMaterialTypeLabel(type: MaterialType): string {
  const labels: Record<MaterialType, string> = {
    file: '文件',
    url: '网址',
    manual: '手动'
  }
  return labels[type] || type
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN')
}

// 加载段落
async function loadSection(sectionId: string) {
  if (!sectionId) {
    sectionContent.value = ''
    versions.value = []
    referencedMaterials.value = []
    currentChapterId.value = null
    return
  }

  const result = await window.electronAPI.longwriting.getChapter(sectionId)
  if (result.success && result.data) {
    currentChapterId.value = result.data.id
    sectionContent.value = result.data.content || ''
    currentWordCount.value = sectionContent.value.length

    // 加载版本历史
    const versionsResult = await window.electronAPI.longwriting.getChapterVersions(result.data.id)
    if (versionsResult.success) {
      versions.value = versionsResult.data || []
    }
  } else {
    currentChapterId.value = null
    sectionContent.value = ''
    currentWordCount.value = 0
    versions.value = []
  }

  referencedMaterials.value = []
  selectedMaterialIds.value = []
}

// 更新字数
function updateWordCount() {
  currentWordCount.value = sectionContent.value.length
}

// 保存段落
async function saveSection() {
  if (!selectedSectionId.value) return

  const result = await window.electronAPI.longwriting.saveChapter(selectedSectionId.value, sectionContent.value)
  if (result.success) {
    currentChapterId.value = result.data.id
    ElMessage.success('内容已保存')

    // 更新段落状态
    if (selectedSection.value && currentWordCount.value >= (selectedSection.value.estimatedWords || 0) * 0.8) {
      await window.electronAPI.longwriting.updateOutline(selectedSection.value.id, { status: 'completed' })
      await loadOutlineSections()
    }

    updateProgress()
  } else {
    ElMessage.error(result.error || '保存失败')
  }
}

// 当前生成事件 ID
const currentEventId = ref<string | null>(null)

// AI 生成段落
async function generateSection() {
  if (!selectedSectionId.value) {
    ElMessage.warning('请先选择段落')
    return
  }

  generating.value = true
  sectionContent.value = '' // 清空当前内容

  // 生成唯一事件 ID
  currentEventId.value = `section-${selectedSectionId.value}-${Date.now()}`

  // 监听流式生成事件
  const unsubscribe = window.electronAPI.longwriting.onGenerateEvent(
    currentEventId.value,
    (event: { type: string; content?: string; error?: string }) => {
      if (event.type === 'content' && event.content) {
        sectionContent.value += event.content
        currentWordCount.value = sectionContent.value.length
      } else if (event.type === 'done') {
        generating.value = false
        currentEventId.value = null
        ElMessage.success('内容已生成')
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
  const result = await window.electronAPI.longwriting.generateSection(
    currentEventId.value,
    props.projectId,
    selectedSectionId.value,
    selectedSection.value?.estimatedWords
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
  // 注意：当前架构下无法取消正在进行的 AI 请求
  // 可以在后续添加 AbortController 支持
  generating.value = false
  currentEventId.value = null
  ElMessage.info('已取消生成')
}

// 预览版本
function previewVersion(version: ChapterVersion) {
  previewContent.value = version.content
}

// 恢复版本
async function restoreVersion(version: ChapterVersion) {
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
      sectionContent.value = result.data.content || ''
      currentWordCount.value = sectionContent.value.length
      ElMessage.success(`已恢复到版本 ${version.versionNumber}`)
    } else {
      ElMessage.error(result.error || '恢复失败')
    }
  } catch {
    // 用户取消
  }
}

// 切换素材选择
function toggleMaterial(materialId: string) {
  const index = selectedMaterialIds.value.indexOf(materialId)
  if (index === -1) {
    selectedMaterialIds.value.push(materialId)
  } else {
    selectedMaterialIds.value.splice(index, 1)
  }
}

// 确认素材选择
function confirmMaterials() {
  referencedMaterials.value = availableMaterials.value.filter(
    m => selectedMaterialIds.value.includes(m.id)
  )
  showMaterialDialog.value = false
}

// 移除引用
function removeReference(materialId: string) {
  const index = referencedMaterials.value.findIndex(m => m.id === materialId)
  if (index !== -1) {
    referencedMaterials.value.splice(index, 1)
  }
  selectedMaterialIds.value = selectedMaterialIds.value.filter(id => id !== materialId)
}

// 前往大纲设计
function goToOutline() {
  emit('update:progress', 35)
}

// 更新进度
function updateProgress() {
  const completedCount = outlineSections.value.filter(s => s.status === 'completed').length
  const total = outlineSections.value.length
  const progress = Math.min(100, 60 + Math.floor((completedCount / Math.max(total, 1)) * 40))
  emit('update:progress', progress)
}

// 加载大纲段落列表
async function loadOutlineSections() {
  if (!props.projectId) return
  const result = await window.electronAPI.longwriting.getOutlineTree(props.projectId)
  if (result.success) {
    outlineSections.value = (result.data || [])
      .filter(o => o.nodeType === 'section' || !o.parentId)
      .sort((a, b) => a.orderIndex - b.orderIndex)
  }
}

// 加载素材列表
async function loadMaterials() {
  if (!props.projectId) return
  const result = await window.electronAPI.longwriting.getMaterials(props.projectId)
  if (result.success) {
    availableMaterials.value = result.data || []
  }
}

// 加载数据
async function loadData() {
  loading.value = true
  await Promise.all([
    loadOutlineSections(),
    loadMaterials()
  ])
  loading.value = false
  updateProgress()
}

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

.section-selector {
  margin-bottom: 24px;

  .el-select {
    width: 100%;
  }

  .status-tag {
    margin-left: 8px;
  }
}

.empty-section {
  padding: 40px 0;
}

.section-info {
  margin-bottom: 24px;
  padding: 16px;
  background: var(--fill-color-lighter);
  border-radius: 8px;

  .info-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;

    h3 {
      font-size: 16px;
      font-weight: 500;
      color: var(--text-color-primary);
      margin: 0;
    }

    .info-meta {
      font-size: 13px;
      color: var(--text-color-secondary);

      span {
        margin-left: 16px;
      }
    }
  }

  .info-summary {
    font-size: 14px;
    color: var(--text-color-regular);
    margin: 0;
  }
}

.material-reference {
  margin-bottom: 16px;
  padding: 12px;
  background: var(--fill-color-blank);
  border-radius: 8px;
  border: 1px solid var(--border-color-lighter);

  .reference-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
    font-size: 13px;
    color: var(--text-color-secondary);
  }

  .reference-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;

    .no-reference {
      font-size: 12px;
      color: var(--text-color-placeholder);
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
    gap: 12px;

    .word-count {
      font-size: 14px;
      color: var(--text-color-secondary);
    }

    .progress-bar {
      width: 100px;
    }
  }
}

.section-editor {
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
}

.material-select-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 400px;
  overflow-y: auto;
}

.material-select-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--fill-color-blank);
  border-radius: 6px;
  border: 1px solid var(--border-color-lighter);
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: var(--color-primary-light-5);
  }

  &.selected {
    border-color: var(--color-primary);
    background: var(--color-primary-light-9);
  }

  .material-name {
    flex: 1;
    font-size: 14px;
    color: var(--text-color-primary);
  }

  .material-type {
    font-size: 12px;
    color: var(--text-color-secondary);
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
    line-height: 1.6;
    white-space: pre-wrap;
    word-wrap: break-word;
  }
}
</style>