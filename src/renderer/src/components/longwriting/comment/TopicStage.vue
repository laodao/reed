<template>
  <div class="topic-stage">
    <div class="stage-header">
      <h2>主题与素材</h2>
      <p class="stage-desc">设定评论的主题和收集相关素材</p>
    </div>

    <div class="stage-content">
      <!-- 主题设定 -->
      <div class="section-block">
        <h3>主题设定</h3>
        <el-form :model="topicForm" label-width="100px" class="topic-form">
          <el-form-item label="评论主题" required>
            <el-input v-model="topicForm.title" placeholder="输入评论主题，如：论《红楼梦》的人物塑造艺术" />
          </el-form-item>
          <el-form-item label="评论类型">
            <el-select v-model="topicForm.type" placeholder="选择评论类型">
              <el-option label="文学评论" value="literature" />
              <el-option label="影评" value="movie" />
              <el-option label="书评" value="book" />
              <el-option label="乐评" value="music" />
              <el-option label="艺术评论" value="art" />
              <el-option label="社会评论" value="society" />
              <el-option label="其他" value="other" />
            </el-select>
          </el-form-item>
          <el-form-item label="核心观点">
            <el-input
              v-model="topicForm.coreArgument"
              type="textarea"
              :rows="3"
              placeholder="阐述你的核心观点和立场..."
            />
          </el-form-item>
          <el-form-item label="目标读者">
            <el-select v-model="topicForm.targetReader" placeholder="选择目标读者群体" clearable>
              <el-option label="学术读者" value="academic" />
              <el-option label="普通读者" value="general" />
              <el-option label="专业人士" value="professional" />
              <el-option label="学生群体" value="student" />
            </el-select>
          </el-form-item>
          <el-form-item label="写作风格">
            <el-select v-model="topicForm.style" placeholder="选择写作风格" clearable>
              <el-option label="学术严谨" value="academic" />
              <el-option label="通俗易懂" value="popular" />
              <el-option label="文艺感性" value="artistic" />
              <el-option label="犀利批判" value="critical" />
            </el-select>
          </el-form-item>
          <el-form-item label="预估字数">
            <el-input-number v-model="topicForm.estimatedWords" :min="1000" :max="50000" :step="500" />
          </el-form-item>
        </el-form>
      </div>

      <!-- 素材管理 -->
      <div class="section-block">
        <h3>素材管理</h3>
        <div class="material-list">
          <div v-for="material in materials" :key="material.id" class="material-card">
            <div class="material-icon">
              <el-icon v-if="material.type === 'file'"><Document /></el-icon>
              <el-icon v-else-if="material.type === 'url'"><Link /></el-icon>
              <el-icon v-else><EditPen /></el-icon>
            </div>
            <div class="material-info">
              <h4>{{ material.name }}</h4>
              <div class="material-meta">
                <span class="material-type">{{ getMaterialTypeLabel(material.type) }}</span>
                <span class="material-status" :class="material.status">
                  {{ getMaterialStatusLabel(material.status) }}
                </span>
                <span v-if="material.retryCount > 0" class="retry-count">
                  重试 {{ material.retryCount }} 次
                </span>
              </div>
              <p class="material-source">{{ material.source }}</p>
            </div>
            <div class="material-actions">
              <el-button text size="small" @click="previewMaterial(material)">
                <el-icon><View /></el-icon>
                预览
              </el-button>
              <el-button
                v-if="material.status === 'failed'"
                text
                size="small"
                @click="retryMaterial(material)"
              >
                <el-icon><RefreshRight /></el-icon>
                重试
              </el-button>
              <el-button text size="small" type="danger" @click="deleteMaterial(material.id)">
                <el-icon><Delete /></el-icon>
                删除
              </el-button>
            </div>
          </div>

          <div class="add-material-buttons">
            <el-button @click="showFileDialog = true">
              <el-icon><Upload /></el-icon>
              上传文件
            </el-button>
            <el-button @click="showUrlDialog = true">
              <el-icon><Link /></el-icon>
              添加网址
            </el-button>
            <el-button @click="showManualDialog = true">
              <el-icon><EditPen /></el-icon>
              手动输入
            </el-button>
          </div>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="action-buttons">
        <el-button v-if="!generating" type="primary" size="large" @click="generateOutline">
          <el-icon><MagicStick /></el-icon>
          生成大纲建议
        </el-button>
        <el-button v-else type="danger" size="large" @click="cancelGeneration">
          <el-icon><Close /></el-icon>
          取消生成
        </el-button>
      </div>

      <!-- 生成进度 -->
      <div v-if="generating" class="generating-progress">
        <el-progress :percentage="100" :indeterminate="true" />
        <p class="progress-text">AI 正在生成大纲建议...</p>
      </div>
    </div>

    <!-- 上传文件对话框 -->
    <el-dialog v-model="showFileDialog" title="上传文件" width="500px">
      <el-upload
        drag
        :auto-upload="false"
        :on-change="handleFileChange"
        accept=".txt,.md,.doc,.docx,.pdf"
      >
        <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
        <div class="el-upload__text">
          拖拽文件到此处，或<em>点击上传</em>
        </div>
        <template #tip>
          <div class="el-upload__tip">
            支持 txt、md、doc、docx、pdf 格式文件
          </div>
        </template>
      </el-upload>
      <template #footer>
        <el-button @click="showFileDialog = false">取消</el-button>
        <el-button type="primary" @click="addFileMaterial">添加</el-button>
      </template>
    </el-dialog>

    <!-- 添加网址对话框 -->
    <el-dialog v-model="showUrlDialog" title="添加网址" width="500px">
      <el-form :model="urlForm" label-width="80px">
        <el-form-item label="素材名称">
          <el-input v-model="urlForm.name" placeholder="给素材起个名称" />
        </el-form-item>
        <el-form-item label="网址" required>
          <el-input v-model="urlForm.url" placeholder="输入要抓取的网址" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showUrlDialog = false">取消</el-button>
        <el-button type="primary" @click="addUrlMaterial">抓取并添加</el-button>
      </template>
    </el-dialog>

    <!-- 手动输入对话框 -->
    <el-dialog v-model="showManualDialog" title="手动输入素材" width="600px">
      <el-form :model="manualForm" label-width="80px">
        <el-form-item label="素材名称">
          <el-input v-model="manualForm.name" placeholder="给素材起个名称" />
        </el-form-item>
        <el-form-item label="内容" required>
          <el-input
            v-model="manualForm.content"
            type="textarea"
            :rows="10"
            placeholder="粘贴或输入素材内容..."
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showManualDialog = false">取消</el-button>
        <el-button type="primary" @click="addManualMaterial">添加</el-button>
      </template>
    </el-dialog>

    <!-- 素材预览对话框 -->
    <el-dialog v-model="showPreviewDialog" title="素材预览" width="700px">
      <div class="preview-content">
        <pre>{{ previewContent }}</pre>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, toRaw } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Document, Link, EditPen, View, Delete, RefreshRight, Upload, MagicStick, UploadFilled, Close
} from '@element-plus/icons-vue'
import type { StoryMaterial, MaterialType, MaterialStatus } from '../../../../shared/types/longwriting.types'

const props = defineProps<{
  projectId: string
}>()

const emit = defineEmits<{
  'update:progress': [progress: number]
}>()

// 主题表单
const topicForm = ref({
  title: '',
  type: 'other',
  coreArgument: '',
  targetReader: '',
  style: '',
  estimatedWords: 5000
})

// 素材列表
const materials = ref<StoryMaterial[]>([])

// 对话框状态
const showFileDialog = ref(false)
const showUrlDialog = ref(false)
const showManualDialog = ref(false)
const showPreviewDialog = ref(false)
const previewContent = ref('')

// 生成状态
const generating = ref(false)
const currentEventId = ref<string | null>(null)
const generatingContent = ref('')

// 加载状态
const loading = ref(false)

// 表单数据
const urlForm = ref({
  name: '',
  url: ''
})

const manualForm = ref({
  name: '',
  content: ''
})

// 待上传文件
const pendingFile = ref<File | null>(null)

// 标签映射
function getMaterialTypeLabel(type: MaterialType): string {
  const labels: Record<MaterialType, string> = {
    file: '文件',
    url: '网址',
    manual: '手动'
  }
  return labels[type] || type
}

function getMaterialStatusLabel(status: MaterialStatus): string {
  const labels: Record<MaterialStatus, string> = {
    pending: '处理中',
    success: '成功',
    failed: '失败'
  }
  return labels[status] || status
}

// 文件选择处理
function handleFileChange(uploadFile: any) {
  pendingFile.value = uploadFile.raw
}

// 添加文件素材
async function addFileMaterial() {
  if (!pendingFile.value) {
    ElMessage.warning('请先选择文件')
    return
  }

  const result = await window.electronAPI.longwriting.createMaterial({
    projectId: props.projectId,
    name: pendingFile.value.name,
    type: 'file',
    source: pendingFile.value.path || pendingFile.value.name,
    status: 'pending'
  })

  if (result.success) {
    showFileDialog.value = false
    pendingFile.value = null
    ElMessage.success('文件已添加，正在处理中...')

    // 异步处理素材
    processMaterialAsync(result.data.id)
    await loadMaterials()
  } else {
    ElMessage.error(result.error || '添加失败')
  }
}

// 添加网址素材
async function addUrlMaterial() {
  if (!urlForm.value.url) {
    ElMessage.warning('请输入网址')
    return
  }

  const rawUrlForm = toRaw(urlForm.value)
  const result = await window.electronAPI.longwriting.createMaterial({
    projectId: props.projectId,
    name: rawUrlForm.name || rawUrlForm.url,
    type: 'url',
    source: rawUrlForm.url,
    status: 'pending'
  })

  if (result.success) {
    showUrlDialog.value = false
    urlForm.value = { name: '', url: '' }
    ElMessage.success('网址已添加，正在抓取内容...')

    // 异步处理素材
    processMaterialAsync(result.data.id)
    await loadMaterials()
  } else {
    ElMessage.error(result.error || '添加失败')
  }
}

// 添加手动输入素材
async function addManualMaterial() {
  if (!manualForm.value.content) {
    ElMessage.warning('请输入内容')
    return
  }

  const rawManualForm = toRaw(manualForm.value)
  const result = await window.electronAPI.longwriting.createMaterial({
    projectId: props.projectId,
    name: rawManualForm.name || `素材 ${materials.value.length + 1}`,
    type: 'manual',
    source: '手动输入',
    content: rawManualForm.content,
    status: 'success'
  })

  if (result.success) {
    await loadMaterials()
    showManualDialog.value = false
    manualForm.value = { name: '', content: '' }
    ElMessage.success('素材已添加')
    updateProgress()
  } else {
    ElMessage.error(result.error || '添加失败')
  }
}

// 异步处理素材
async function processMaterialAsync(materialId: string) {
  try {
    const result = await window.electronAPI.longwriting.processMaterial(materialId)
    if (result.success) {
      await loadMaterials()
      updateProgress()
    } else {
      ElMessage.error(result.error || '素材处理失败')
    }
  } catch (error) {
    console.error('素材处理异常:', error)
    ElMessage.error('素材处理异常')
  }
}

// 预览素材
function previewMaterial(material: StoryMaterial) {
  previewContent.value = material.content || '内容暂未加载'
  showPreviewDialog.value = true
}

// 重试抓取
async function retryMaterial(material: StoryMaterial) {
  if (material.retryCount >= 5) {
    ElMessage.warning('已达到最大重试次数')
    return
  }

  const result = await window.electronAPI.longwriting.updateMaterialStatus(material.id, 'pending')
  if (result.success) {
    await loadMaterials()
    ElMessage.info('正在重试...')
  }
}

// 删除素材
async function deleteMaterial(id: string) {
  const result = await window.electronAPI.longwriting.deleteMaterial(id)
  if (result.success) {
    await loadMaterials()
    ElMessage.success('素材已删除')
    updateProgress()
  } else {
    ElMessage.error(result.error || '删除失败')
  }
}

// 生成大纲建议
async function generateOutline() {
  if (!topicForm.value.title) {
    ElMessage.warning('请输入评论主题')
    return
  }

  // 先保存主题
  await saveTopic()

  generating.value = true
  generatingContent.value = ''

  // 生成唯一事件 ID
  currentEventId.value = `outline-comment-${props.projectId}-${Date.now()}`

  // 监听流式生成事件
  const unsubscribe = window.electronAPI.longwriting.onGenerateEvent(
    currentEventId.value,
    (event: { type: string; content?: string; error?: string; data?: any }) => {
      if (event.type === 'content' && event.content) {
        generatingContent.value += event.content
      } else if (event.type === 'done') {
        generating.value = false
        currentEventId.value = null
        unsubscribe()
        // 解析 AI 响应
        parseOutlineResult(generatingContent.value)
      } else if (event.type === 'error') {
        generating.value = false
        currentEventId.value = null
        unsubscribe()
        ElMessage.error(event.error || '生成失败')
      }
    }
  )

  // 调用 AI API，传递 eventId
  const result = await window.electronAPI.longwriting.generateOutlineComment(currentEventId.value, props.projectId)

  if (!result.success) {
    generating.value = false
    currentEventId.value = null
    unsubscribe()
    ElMessage.error(result.error || '生成失败')
  }
}

// 解析 AI 响应
async function parseOutlineResult(content: string) {
  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      ElMessage.warning('AI 返回格式不正确，请重试')
      return
    }

    const suggestedOutline = JSON.parse(jsonMatch[0])

    if (!Array.isArray(suggestedOutline) || suggestedOutline.length === 0) {
      ElMessage.warning('AI 未生成大纲建议')
      return
    }

    // 创建大纲节点
    for (let i = 0; i < suggestedOutline.length; i++) {
      const section = suggestedOutline[i]
      await window.electronAPI.longwriting.createOutline({
        projectId: props.projectId,
        name: section.name,
        level: 1,
        nodeType: 'section',
        summary: section.summary || '',
        estimatedWords: section.estimatedWords || 500,
        involvedCharacters: [],
        involvedLocations: [],
        status: 'pending',
        orderIndex: i
      })
    }

    ElMessage.success('大纲建议已生成，请前往大纲设计查看')
    emit('update:progress', 35)
  } catch (error) {
    console.error('解析 AI 响应失败:', error)
    ElMessage.error('解析 AI 响应失败')
  }
}

// 取消生成
function cancelGeneration() {
  if (!currentEventId.value) return
  generating.value = false
  currentEventId.value = null
  ElMessage.info('已取消生成')
}

// 更新进度
function updateProgress() {
  const progress = Math.min(30, 10 + materials.value.length * 5)
  emit('update:progress', progress)
}

// 加载素材列表
async function loadMaterials() {
  if (!props.projectId) return
  const result = await window.electronAPI.longwriting.getMaterials(props.projectId)
  if (result.success) {
    materials.value = result.data || []
  }
}

// 加载主题设定
async function loadTopic() {
  if (!props.projectId) return
  const result = await window.electronAPI.longwriting.getStoryOverview(props.projectId)
  if (result.success && result.data) {
    // 从 StoryOverview 加载评论主题相关数据
    topicForm.value = {
      title: result.data.title || '',
      type: 'other',
      coreArgument: result.data.coreTheme || '',
      targetReader: '',
      style: '',
      estimatedWords: result.data.estimatedWords || 5000
    }
  }
}

// 保存主题设定
async function saveTopic() {
  if (!props.projectId) return
  await window.electronAPI.longwriting.updateStoryOverview(props.projectId, {
    title: topicForm.value.title,
    coreTheme: topicForm.value.coreArgument,
    estimatedWords: topicForm.value.estimatedWords
  })
}

// 加载所有数据
async function loadData() {
  loading.value = true
  await Promise.all([
    loadMaterials(),
    loadTopic()
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
.topic-stage {
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

.section-block {
  margin-bottom: 32px;

  &:last-child {
    margin-bottom: 0;
  }

  h3 {
    font-size: 16px;
    font-weight: 500;
    color: var(--text-color-primary);
    margin: 0 0 16px 0;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border-color-lighter);
  }
}

.topic-form {
  background: var(--fill-color-blank);
  padding: 20px;
  border-radius: 8px;
}

.material-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.material-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  background: var(--fill-color-blank);
  border-radius: 8px;
  border: 1px solid var(--border-color-lighter);
}

.material-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--fill-color-light);
  border-radius: 8px;
  color: var(--text-color-secondary);
}

.material-info {
  flex: 1;
  min-width: 0;

  h4 {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-color-primary);
    margin: 0 0 8px 0;
  }

  .material-meta {
    display: flex;
    gap: 8px;
    margin-bottom: 4px;

    span {
      font-size: 12px;
    }

    .material-type {
      color: var(--text-color-secondary);
    }

    .material-status {
      &.pending {
        color: var(--color-warning);
      }

      &.success {
        color: var(--color-success);
      }

      &.failed {
        color: var(--color-danger);
      }
    }

    .retry-count {
      color: var(--text-color-secondary);
    }
  }

  .material-source {
    font-size: 12px;
    color: var(--text-color-secondary);
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.material-actions {
  display: flex;
  gap: 4px;
}

.add-material-buttons {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.action-buttons {
  display: flex;
  justify-content: center;
  margin-top: 24px;
}

.generating-progress {
  margin-top: 16px;
  padding: 16px;
  background: var(--fill-color-lighter);
  border-radius: 8px;

  .progress-text {
    margin-top: 8px;
    font-size: 14px;
    color: var(--text-color-secondary);
    text-align: center;
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