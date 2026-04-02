<template>
  <div class="chapter-stage">
    <div class="stage-header">
      <h2>章节写作</h2>
      <p class="stage-desc">根据大纲生成章节内容，支持手动编辑和版本管理</p>
    </div>

    <div class="stage-content">
      <!-- 左侧大纲树 + 右侧编辑区的布局 -->
      <div class="chapter-layout">
        <!-- 左侧大纲树 -->
        <div class="outline-tree-panel">
          <div class="tree-header">
            <h3>大纲目录</h3>
            <el-button text size="small" @click="collapseAll">
              <el-icon><Fold /></el-icon>
              折叠
            </el-button>
          </div>
          <el-tree
            ref="treeRef"
            :data="outlineTreeData"
            :props="treeProps"
            :highlight-current="true"
            :expand-on-click-node="false"
            :default-expand-all="true"
            node-key="id"
            class="outline-tree"
            @node-click="handleNodeClick"
          >
            <template #default="{ node, data }">
              <div class="tree-node" :class="{ active: data.id === activeOutlineId }">
                <span class="node-name">{{ data.name }}</span>
                <span class="node-status" :class="data.status">{{ getStatusName(data.status) }}</span>
              </div>
            </template>
          </el-tree>
          <el-empty v-if="outlineTreeData.length === 0" description="暂无大纲数据" />
        </div>

        <!-- 右侧章节编辑区 -->
        <div class="chapters-panel" ref="chaptersPanelRef">
          <div v-if="outlineTreeData.length === 0" class="empty-chapter">
            <el-empty description="请先在大纲设计阶段创建大纲">
              <el-button type="primary" @click="goToOutline">前往大纲设计</el-button>
            </el-empty>
          </div>

          <!-- 单章节编辑模式 -->
          <div v-else class="single-chapter-container">
            <!-- 章节导航 -->
            <div class="chapter-nav">
              <el-button
                :disabled="currentChapterIndex <= 0"
                @click="prevChapter"
              >
                <el-icon><ArrowLeft /></el-icon>
                上一章
              </el-button>
              <span class="chapter-position">
                {{ currentChapterIndex + 1 }} / {{ allOutlines.length }}
              </span>
              <el-button
                :disabled="currentChapterIndex >= allOutlines.length - 1"
                @click="nextChapter"
              >
                下一章
                <el-icon><ArrowRight /></el-icon>
              </el-button>
            </div>

            <!-- 当前章节卡片 -->
            <div v-if="currentChapter" class="chapter-card active">
              <!-- 章节标题栏 -->
              <div class="chapter-title-bar">
                <div class="title-left">
                  <span class="chapter-type">{{ getNodeTypeName(currentChapter.nodeType) }}</span>
                  <h3 class="chapter-title">{{ currentChapter.name }}</h3>
                  <el-tag :type="getStatusType(currentChapter.status)" size="small">
                    {{ getStatusName(currentChapter.status) }}
                  </el-tag>
                  <span class="word-count" v-if="getChapterWordCount(currentChapter.id)">
                    {{ getChapterWordCount(currentChapter.id) }} 字
                  </span>
                </div>
                <div class="title-actions">
                  <el-button
                    v-if="!generatingMap[currentChapter.id]"
                    type="primary"
                    size="small"
                    @click="startGenerate(currentChapter)"
                  >
                    <el-icon><MagicStick /></el-icon>
                    AI 生成
                  </el-button>
                  <el-button
                    v-else
                    type="danger"
                    size="small"
                    @click="cancelGenerate(currentChapter.id)"
                  >
                    <el-icon><Close /></el-icon>
                    取消
                  </el-button>
                  <el-button size="small" @click="showVersions(currentChapter)">
                    <el-icon><Clock /></el-icon>
                    版本
                  </el-button>
                  <el-button
                    size="small"
                    :loading="savingMap[currentChapter.id]"
                    @click="saveChapter(currentChapter.id)"
                  >
                    <el-icon><DocumentChecked /></el-icon>
                    保存
                  </el-button>
                </div>
              </div>

              <!-- 章节信息 -->
              <div class="chapter-info" v-if="currentChapter.summary || currentChapter.involvedCharacters?.length || currentChapter.involvedLocations?.length">
                <p v-if="currentChapter.summary" class="chapter-summary">{{ currentChapter.summary }}</p>
                <div class="chapter-tags" v-if="currentChapter.involvedCharacters?.length > 0 || currentChapter.involvedLocations?.length > 0">
                  <template v-if="currentChapter.involvedCharacters?.length > 0">
                    <el-tag v-for="id in currentChapter.involvedCharacters" :key="id" size="small" type="info">
                      {{ getCharacterName(id) }}
                    </el-tag>
                  </template>
                  <template v-if="currentChapter.involvedLocations?.length > 0">
                    <el-tag v-for="id in currentChapter.involvedLocations" :key="id" size="small" type="warning">
                      {{ getLocationName(id) }}
                    </el-tag>
                  </template>
                </div>
              </div>

              <!-- Markdown 编辑器 -->
              <div class="chapter-editor-wrapper">
                <MarkdownEditor
                  :key="currentChapter.id"
                  v-model="chapterContentMap[currentChapter.id]"
                  :placeholder="getEditorPlaceholder(currentChapter)"
                  height="100%"
                  mode="split"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- AI 生成参数设置对话框 -->
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
        <el-button type="primary" @click="executeGeneration">
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, inject, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { MagicStick, Clock, DocumentChecked, View, RefreshLeft, Close, Fold } from '@element-plus/icons-vue'
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'
import MarkdownEditor from '@/components/common/MarkdownEditor.vue'
import { ArrowLeft, ArrowRight } from '@element-plus/icons-vue'
import type { StoryOutline, StoryChapter, ChapterVersion, OutlineStatus, OutlineNodeType, StoryCharacter } from '../../../../shared/types/longwriting.types'
import type { ElTree } from 'element-plus'

const props = defineProps<{
  projectId: string
}>()

const emit = defineEmits<{
  'update:progress': [progress: number]
}>()

const router = useRouter()

// 从父组件获取选中的模型（是一个 ComputedRef）
const selectedModel = inject<ReturnType<typeof computed<{ providerId: string; modelId: string } | null>>>('selectedModel', computed(() => null))

// 大纲节点列表
const outlineNodes = ref<StoryOutline[]>([])

// 角色和地点列表
const characters = ref<StoryCharacter[]>([])
const locations = ref<any[]>([])

// 当前激活的大纲 ID（用于高亮左侧树和右侧卡片）
const activeOutlineId = ref<string>('')

// 章节内容映射（outlineId -> content）
const chapterContentMap = ref<Record<string, string>>({})

// 章节ID映射（outlineId -> chapterId）
const chapterIdMap = ref<Record<string, string>>({})

// 章节卡片DOM引用
const chapterRefs = ref<Record<string, HTMLElement | null>>({})
const chaptersPanelRef = ref<HTMLElement | null>(null)

// 版本列表
const versions = ref<ChapterVersion[]>([])

// 对话框状态
const showVersionDialog = ref(false)
const showPreviewDialog = ref(false)
const showGenerateDialog = ref(false)
const previewContent = ref('')

// 当前操作的大纲
const currentOutlineForAction = ref<StoryOutline | null>(null)

// 生成状态映射
const generatingMap = ref<Record<string, boolean>>({})
const generatingEventIdMap = ref<Record<string, string | null>>({})

// 保存状态映射
const savingMap = ref<Record<string, boolean>>({})

// 自动保存
const autoSave = ref(true)

// 自动保存相关变量
const saveTimers: Record<string, ReturnType<typeof setTimeout>> = {}
const lastSavedContent: Record<string, string> = {}

// 加载状态
const loading = ref(false)

// 生成参数表单
const generateForm = ref({
  targetWords: 3000,
  style: '',
  extraPrompt: ''
})

// 树配置
const treeProps = {
  children: 'children',
  label: 'name'
}

// 树引用
const treeRef = ref<InstanceType<typeof ElTree> | null>(null)

// 构建树形数据
const outlineTreeData = computed(() => {
  return buildOutlineTree(outlineNodes.value)
})

// 所有大纲（扁平化，用于渲染右侧卡片）
const allOutlines = computed(() => {
  return outlineNodes.value
    .filter(n => n.nodeType === 'chapter' || n.nodeType === 'section')
    .sort((a, b) => a.orderIndex - b.orderIndex)
})

// 当前章节索引
const currentChapterIndex = computed(() => {
  if (!activeOutlineId.value) return 0
  return allOutlines.value.findIndex(o => o.id === activeOutlineId.value)
})

// 当前章节
const currentChapter = computed(() => {
  return allOutlines.value[currentChapterIndex.value] || null
})

// 上一章
function prevChapter() {
  if (currentChapterIndex.value > 0) {
    const prevOutline = allOutlines.value[currentChapterIndex.value - 1]
    activeOutlineId.value = prevOutline.id
    treeRef.value?.setCurrentKey(prevOutline.id)
  }
}

// 下一章
function nextChapter() {
  if (currentChapterIndex.value < allOutlines.value.length - 1) {
    const nextOutline = allOutlines.value[currentChapterIndex.value + 1]
    activeOutlineId.value = nextOutline.id
    treeRef.value?.setCurrentKey(nextOutline.id)
  }
}

// 构建大纲树结构
function buildOutlineTree(nodes: StoryOutline[]): any[] {
  const nodeMap = new Map<string, any>()
  const rootNodes: any[] = []

  // 先创建映射
  for (const node of nodes) {
    nodeMap.set(node.id, {
      ...node,
      children: []
    })
  }

  // 构建树
  for (const node of nodes) {
    const treeNode = nodeMap.get(node.id)!
    if (node.parentId && nodeMap.has(node.parentId)) {
      const parent = nodeMap.get(node.parentId)!
      parent.children.push(treeNode)
    } else {
      rootNodes.push(treeNode)
    }
  }

  return rootNodes
}

// 设置章节卡片DOM引用
function setChapterRef(id: string, el: any) {
  if (el) {
    chapterRefs.value[id] = el as HTMLElement
  }
}

// 折叠所有节点
function collapseAll() {
  const nodes = treeRef.value?.store?.nodesMap
  if (nodes) {
    for (const key in nodes) {
      nodes[key].expanded = false
    }
  }
}

// 处理节点点击 - 切换到对应章节
function handleNodeClick(data: StoryOutline) {
  // 只有章节和节类型才能切换
  if (data.nodeType === 'chapter' || data.nodeType === 'section') {
    activeOutlineId.value = data.id
    treeRef.value?.setCurrentKey(data.id)
  }
}

// 名称映射
function getNodeTypeName(type?: OutlineNodeType): string {
  const names: Record<OutlineNodeType, string> = {
    volume: '卷',
    chapter: '章',
    section: '节'
  }
  return type ? names[type] : '节'
}

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

// 获取章节字数
function getChapterWordCount(outlineId: string): number {
  return chapterContentMap.value[outlineId]?.length || 0
}

// 更新字数统计
function updateWordCount(outlineId: string) {
  // 字数是实时计算的，不需要额外处理
}

// 获取编辑器占位符
function getEditorPlaceholder(outline: StoryOutline): string {
  return `编写「${outline.name}」的内容，或点击"AI 生成"自动生成...`
}

// 加载所有章节内容
async function loadAllChapters() {
  if (allOutlines.value.length === 0) return

  // 批量获取所有章节内容（一次 API 调用）
  const outlineIds = allOutlines.value.map(o => o.id)
  const result = await window.electronAPI.longwriting.getChaptersByOutlineIds(outlineIds)

  if (result.success && result.data) {
    for (const outlineId of outlineIds) {
      const chapter = result.data[outlineId]
      if (chapter) {
        chapterIdMap.value[outlineId] = chapter.id
        chapterContentMap.value[outlineId] = chapter.content || ''
        // 记录从数据库加载的内容，避免触发不必要的自动保存
        lastSavedContent[outlineId] = chapter.content || ''
      } else {
        chapterIdMap.value[outlineId] = ''
        chapterContentMap.value[outlineId] = ''
        lastSavedContent[outlineId] = ''
      }
    }
  }
}

// 加载单个章节内容
async function loadChapter(outlineId: string) {
  const result = await window.electronAPI.longwriting.getChapter(outlineId)
  if (result.success && result.data) {
    chapterIdMap.value[outlineId] = result.data.id
    chapterContentMap.value[outlineId] = result.data.content || ''
  } else {
    chapterIdMap.value[outlineId] = ''
    chapterContentMap.value[outlineId] = ''
  }
}

// 加载版本历史
async function loadVersions(chapterId: string) {
  const result = await window.electronAPI.longwriting.getChapterVersions(chapterId)
  if (result.success) {
    versions.value = result.data || []
  }
}

// 保存章节
async function saveChapter(outlineId: string) {
  const content = chapterContentMap.value[outlineId]
  if (content === undefined) return

  savingMap.value[outlineId] = true
  try {
    const result = await window.electronAPI.longwriting.saveChapter(outlineId, content)
    if (result.success) {
      chapterIdMap.value[outlineId] = result.data.id
      ElMessage.success('章节已保存')

      // 更新大纲状态为进行中
      const outline = outlineNodes.value.find(n => n.id === outlineId)
      if (outline && outline.status === 'pending') {
        await window.electronAPI.longwriting.updateOutline(outlineId, { status: 'progressing' })
        await loadOutlineTree()
      }

      updateProgress()
    } else {
      ElMessage.error(result.error || '保存失败')
    }
  } finally {
    savingMap.value[outlineId] = false
  }
}

// 开始生成 - 显示对话框
function startGenerate(outline: StoryOutline) {
  if (!selectedModel.value || !selectedModel.value.providerId || !selectedModel.value.modelId) {
    ElMessage.warning('请先在顶部选择 AI 模型')
    return
  }

  currentOutlineForAction.value = outline
  generateForm.value.targetWords = outline.estimatedWords || 3000
  showGenerateDialog.value = true
}

// 执行生成
async function executeGeneration() {
  if (!currentOutlineForAction.value) return

  const outline = currentOutlineForAction.value
  const outlineId = outline.id

  showGenerateDialog.value = false
  generatingMap.value[outlineId] = true
  chapterContentMap.value[outlineId] = '' // 清空当前内容

  console.log('[ChapterStage] 生成章节, providerId:', selectedModel.value?.providerId, 'modelId:', selectedModel.value?.modelId)

  // 生成唯一事件 ID
  const eventId = `chapter-${outlineId}-${Date.now()}`
  generatingEventIdMap.value[outlineId] = eventId

  // 监听流式生成事件
  const unsubscribe = window.electronAPI.longwriting.onGenerateEvent(
    eventId,
    (event: { type: string; content?: string; error?: string }) => {
      if (event.type === 'content' && event.content) {
        chapterContentMap.value[outlineId] += event.content
      } else if (event.type === 'done') {
        generatingMap.value[outlineId] = false
        generatingEventIdMap.value[outlineId] = null
        // 自动保存
        if (autoSave.value && chapterContentMap.value[outlineId]) {
          saveChapter(outlineId)
        }
        ElMessage.success('章节内容已生成')
        unsubscribe()
      } else if (event.type === 'error') {
        generatingMap.value[outlineId] = false
        generatingEventIdMap.value[outlineId] = null
        ElMessage.error(event.error || '生成失败')
        unsubscribe()
      }
    }
  )

  // 调用 AI API
  const result = await window.electronAPI.longwriting.generateChapter(
    eventId,
    props.projectId,
    outlineId,
    generateForm.value.targetWords,
    selectedModel.value!.providerId,
    selectedModel.value!.modelId
  )

  if (!result.success) {
    generatingMap.value[outlineId] = false
    generatingEventIdMap.value[outlineId] = null
    unsubscribe()
    ElMessage.error(result.error || '生成失败')
  }

  currentOutlineForAction.value = null
}

// 取消生成
function cancelGenerate(outlineId: string) {
  const eventId = generatingEventIdMap.value[outlineId]
  if (eventId) {
    generatingMap.value[outlineId] = false
    generatingEventIdMap.value[outlineId] = null
    ElMessage.info('已取消生成')
  }
}

// 显示版本历史
async function showVersions(outline: StoryOutline) {
  currentOutlineForAction.value = outline
  const chapterId = chapterIdMap.value[outline.id]
  if (chapterId) {
    await loadVersions(chapterId)
  } else {
    versions.value = []
  }
  showVersionDialog.value = true
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

    if (!currentOutlineForAction.value) return
    const chapterId = chapterIdMap.value[currentOutlineForAction.value.id]
    if (!chapterId) return

    const result = await window.electronAPI.longwriting.restoreChapterVersion(chapterId, version.id)
    if (result.success) {
      chapterContentMap.value[currentOutlineForAction.value.id] = result.data.content || ''
      await loadVersions(chapterId)
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
  const totalNodes = outlineNodes.value.filter(n => n.nodeType === 'chapter' || n.nodeType === 'section').length
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
  // 临时禁用自动保存，避免加载时触发不必要的保存
  autoSave.value = false

  await Promise.all([
    loadOutlineTree(),
    loadCharacters(),
    loadLocations()
  ])

  // 加载所有章节内容
  await loadAllChapters()

  loading.value = false

  // 加载完成后恢复自动保存
  nextTick(() => {
    autoSave.value = true
  })

  // 设置初始激活节点
  if (allOutlines.value.length > 0) {
    activeOutlineId.value = allOutlines.value[0].id
  }

  updateProgress()
}

// 自动保存 - 使用防抖，记录上一次保存的内容以避免重复保存
watch(chapterContentMap, (newVal) => {
  if (!autoSave.value) return

  for (const outlineId in newVal) {
    // 只保存已有 ID 的章节，且内容有变化
    if (chapterIdMap.value[outlineId]) {
      const currentContent = newVal[outlineId]
      // 如果内容与上次保存的内容相同，跳过
      if (lastSavedContent[outlineId] === currentContent) continue

      if (saveTimers[outlineId]) clearTimeout(saveTimers[outlineId])
      saveTimers[outlineId] = setTimeout(() => {
        saveChapter(outlineId)
        lastSavedContent[outlineId] = currentContent
      }, 3000)
    }
  }
}, { deep: true })

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
  max-width: 1200px;
  margin: 0 auto;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.stage-header {
  margin-bottom: 24px;
  flex-shrink: 0;

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
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.chapter-layout {
  display: flex;
  gap: 24px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.outline-tree-panel {
  width: 280px;
  flex-shrink: 0;
  border: 1px solid var(--border-color-lighter);
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;

  .tree-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    background: var(--fill-color-lighter);
    border-bottom: 1px solid var(--border-color-lighter);

    h3 {
      font-size: 14px;
      font-weight: 500;
      color: var(--text-color-primary);
      margin: 0;
    }
  }

  .outline-tree {
    flex: 1;
    overflow-y: auto;
    padding: 8px;

    :deep(.el-tree-node__content) {
      height: auto;
      padding: 8px 4px;
    }

    .tree-node {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      gap: 8px;

      &.active {
        .node-name {
          color: var(--color-primary);
          font-weight: 500;
        }
      }

      .node-name {
        flex: 1;
        font-size: 13px;
        color: var(--text-color-primary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .node-status {
        font-size: 11px;
        padding: 2px 6px;
        border-radius: 4px;
        flex-shrink: 0;

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
  }
}

// 右侧章节编辑面板
.chapters-panel {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

// 单章节容器
.single-chapter-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

// 章节导航
.chapter-nav {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 20px;
  padding: 8px;
  background: var(--fill-color-lighter);
  border-radius: 8px;
  margin-bottom: 8px;
  flex-shrink: 0;

  .chapter-position {
    font-size: 14px;
    color: var(--text-color-secondary);
    min-width: 80px;
    text-align: center;
  }
}

.empty-chapter {
  padding: 60px 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

// 章节卡片样式
.chapter-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--fill-color-blank);
  border: 1px solid var(--border-color-lighter);
  border-radius: 8px;
  min-height: 0;
  overflow: hidden;
  transition: all 0.2s ease;

  &.active {
    border-color: var(--color-primary-light-3);
    box-shadow: 0 2px 12px rgba(var(--color-primary-rgb), 0.12);
  }
}

// 标题栏（紧凑）
.chapter-title-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  background: var(--fill-color-lighter);
  border-bottom: 1px solid var(--border-color-lighter);
  flex-shrink: 0;

  .title-left {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;

    .chapter-type {
      font-size: 11px;
      padding: 2px 6px;
      border-radius: 3px;
      background: var(--color-primary-light-9);
      color: var(--color-primary);
      flex-shrink: 0;
    }

    .chapter-title {
      font-size: 14px;
      font-weight: 500;
      color: var(--text-color-primary);
      margin: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .word-count {
      font-size: 12px;
      color: var(--text-color-secondary);
      flex-shrink: 0;
    }
  }

  .title-actions {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
  }
}

// 章节信息（可折叠）
.chapter-info {
  padding: 8px 16px;
  background: var(--bg-color);
  border-bottom: 1px solid var(--border-color-lighter);
  flex-shrink: 0;

  .chapter-summary {
    font-size: 12px;
    color: var(--text-color-secondary);
    line-height: 1.5;
    margin: 0 0 6px 0;
  }

  .chapter-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
}

// 编辑器容器
.chapter-editor-wrapper {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
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