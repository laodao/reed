<template>
  <div class="outline-stage">
    <div class="stage-header">
      <h2>大纲设计</h2>
      <p class="stage-desc">设计故事结构大纲，支持多层级嵌套（卷/章/节）</p>
    </div>

    <div class="stage-content">
      <!-- 大纲树形结构 -->
      <div class="outline-tree">
        <div v-if="outlineNodes.length === 0" class="empty-outline">
          <el-empty description="暂无大纲">
            <el-button type="primary" @click="addRootNode">添加第一卷</el-button>
          </el-empty>
        </div>

        <template v-else>
          <!-- 根节点列表（卷） -->
          <div v-for="node in rootNodes" :key="node.id" class="outline-node volume-node">
            <div
              class="node-header"
              :class="{ expanded: expandedNodes.includes(node.id), clickable: hasChildren(node.id) }"
              @click="hasChildren(node.id) && toggleExpand(node.id)"
            >
              <div class="node-expand" @click.stop="toggleExpand(node.id)">
                <el-icon v-if="hasChildren(node.id)">
                  <ArrowRight v-if="!expandedNodes.includes(node.id)" />
                  <ArrowDown v-else />
                </el-icon>
              </div>
              <div class="node-title">
                <span class="node-type-tag">{{ getNodeTypeName(node.nodeType) }}</span>
                <h4>{{ node.name }}</h4>
                <span class="node-status" :class="node.status">{{ getStatusName(node.status) }}</span>
              </div>
              <div class="node-meta">
                <span v-if="node.estimatedWords">{{ node.estimatedWords }}字</span>
              </div>
              <div class="node-actions">
                <el-button text size="small" @click="addChildNode(node)">
                  <el-icon><Plus /></el-icon>
                  添加子节点
                </el-button>
                <el-button text size="small" @click="editNode(node)">
                  <el-icon><Edit /></el-icon>
                  编辑
                </el-button>
                <el-button text size="small" type="danger" @click="deleteNode(node.id)">
                  <el-icon><Delete /></el-icon>
                </el-button>
              </div>
            </div>

            <!-- 子节点（章） -->
            <div v-if="expandedNodes.includes(node.id)" class="node-children">
              <div v-for="child in getChildren(node.id)" :key="child.id" class="outline-node chapter-node">
                <div
                  class="node-header"
                  :class="{ expanded: expandedNodes.includes(child.id), clickable: hasChildren(child.id) }"
                  @click="hasChildren(child.id) && toggleExpand(child.id)"
                >
                  <div class="node-expand" @click.stop="toggleExpand(child.id)">
                    <el-icon v-if="hasChildren(child.id)">
                      <ArrowRight v-if="!expandedNodes.includes(child.id)" />
                      <ArrowDown v-else />
                    </el-icon>
                  </div>
                  <div class="node-title">
                    <span class="node-type-tag">{{ getNodeTypeName(child.nodeType) }}</span>
                    <h4>{{ child.name }}</h4>
                    <span class="node-status" :class="child.status">{{ getStatusName(child.status) }}</span>
                  </div>
                  <div class="node-meta">
                    <span v-if="child.estimatedWords">{{ child.estimatedWords }}字</span>
                    <el-tag v-if="child.involvedCharacters.length > 0" size="small" class="char-tag">
                      {{ child.involvedCharacters.length }}角色
                    </el-tag>
                  </div>
                  <div class="node-actions">
                    <el-button text size="small" @click="addChildNode(child)">
                      <el-icon><Plus /></el-icon>
                      添加小节
                    </el-button>
                    <el-button text size="small" @click="editNode(child)">
                      <el-icon><Edit /></el-icon>
                    </el-button>
                    <el-button text size="small" type="danger" @click="deleteNode(child.id)">
                      <el-icon><Delete /></el-icon>
                    </el-button>
                  </div>
                </div>

                <!-- 第三层节点（节） -->
                <div v-if="expandedNodes.includes(child.id)" class="node-children">
                  <div v-for="section in getChildren(child.id)" :key="section.id" class="outline-node section-node">
                    <div class="node-header">
                      <div class="node-expand"></div>
                      <div class="node-title">
                        <span class="node-type-tag">{{ getNodeTypeName(section.nodeType) }}</span>
                        <h4>{{ section.name }}</h4>
                        <span class="node-status" :class="section.status">{{ getStatusName(section.status) }}</span>
                      </div>
                      <div class="node-meta">
                        <span v-if="section.estimatedWords">{{ section.estimatedWords }}字</span>
                      </div>
                      <div class="node-actions">
                        <el-button text size="small" @click="editNode(section)">
                          <el-icon><Edit /></el-icon>
                        </el-button>
                        <el-button text size="small" type="danger" @click="deleteNode(section.id)">
                          <el-icon><Delete /></el-icon>
                        </el-button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 添加根节点按钮 -->
          <el-button type="primary" plain class="add-btn" @click="addRootNode">
            <el-icon><Plus /></el-icon>
            添加新卷
          </el-button>
        </template>
      </div>

      <!-- 快速生成按钮 -->
      <div class="action-buttons">
        <el-button v-if="!generating" type="primary" size="large" @click="generateOutline">
          <el-icon><MagicStick /></el-icon>
          AI 生成大纲建议
        </el-button>
        <el-button v-else type="danger" size="large" @click="cancelGeneration">
          <el-icon><Close /></el-icon>
          取消生成
        </el-button>
      </div>

      <!-- 生成进度 -->
      <div v-if="generating" class="generating-progress">
        <el-progress :percentage="100" :indeterminate="true" />
        <p class="progress-text">AI 正在生成大纲...</p>
      </div>
    </div>

    <!-- 大纲节点编辑对话框 -->
    <el-dialog
      v-model="showNodeDialog"
      :title="editingNode ? '编辑大纲节点' : '添加大纲节点'"
      width="600px"
      destroy-on-close
    >
      <el-form :model="nodeForm" label-width="100px">
        <el-form-item label="节点名称" required>
          <el-input v-model="nodeForm.name" placeholder="输入节点名称，如：第一卷 少年崛起" />
        </el-form-item>

        <el-form-item label="节点类型">
          <el-radio-group v-model="nodeForm.nodeType" :disabled="!!editingNode">
            <el-radio value="volume">卷</el-radio>
            <el-radio value="chapter">章</el-radio>
            <el-radio value="section">节</el-radio>
          </el-radio-group>
          <span v-if="editingNode" class="form-tip">节点类型不可修改</span>
        </el-form-item>

        <el-form-item label="节点概要">
          <el-input
            v-model="nodeForm.summary"
            type="textarea"
            :rows="4"
            placeholder="描述本节点的主要内容..."
          />
        </el-form-item>

        <el-form-item label="预估字数">
          <el-input-number v-model="nodeForm.estimatedWords" :min="0" :step="500" />
        </el-form-item>

        <el-form-item label="涉及角色">
          <el-select
            v-model="nodeForm.involvedCharacters"
            multiple
            placeholder="选择涉及的角色"
          >
            <el-option
              v-for="char in characters"
              :key="char.id"
              :label="char.name"
              :value="char.id"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="涉及地点">
          <el-select
            v-model="nodeForm.involvedLocations"
            multiple
            placeholder="选择涉及的地点"
          >
            <el-option
              v-for="loc in locations"
              :key="loc.id"
              :label="loc.name"
              :value="loc.id"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="状态">
          <el-radio-group v-model="nodeForm.status" :disabled="!!editingNode">
            <el-radio value="pending">待写</el-radio>
            <el-radio value="progressing">进行中</el-radio>
            <el-radio value="completed">已完成</el-radio>
          </el-radio-group>
          <span v-if="editingNode" class="form-tip">状态在章节写作阶段自动更新</span>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showNodeDialog = false">取消</el-button>
        <el-button type="primary" @click="saveNode">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, inject } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete, MagicStick, ArrowRight, ArrowDown, Close } from '@element-plus/icons-vue'
import type { StoryOutline, OutlineNodeType, OutlineStatus, StoryCharacter } from '../../../../shared/types/longwriting.types'
import type { ComputedRef } from 'vue'

const props = defineProps<{
  projectId: string
}>()

const emit = defineEmits<{
  'update:progress': [progress: number]
}>()

// 从父组件获取选中的模型（是一个 ComputedRef）
const selectedModel = inject<ReturnType<typeof computed<{ providerId: string; modelId: string } | null>>>('selectedModel', computed(() => null))

// 大纲节点列表
const outlineNodes = ref<StoryOutline[]>([])

// 展开的节点 ID
const expandedNodes = ref<string[]>([])

// 角色列表（用于关联选择）
const characters = ref<StoryCharacter[]>([])

// 地点列表（用于关联选择）
const locations = ref<any[]>([])

// 对话框状态
const showNodeDialog = ref(false)

// 编辑状态
const editingNode = ref<StoryOutline | null>(null)
const parentNodeId = ref<string | null>(null)

// 生成状态
const generating = ref(false)
const currentEventId = ref<string | null>(null)
const generatingContent = ref('')

// 加载状态
const loading = ref(false)

// 表单数据
const nodeForm = ref({
  name: '',
  nodeType: 'volume' as OutlineNodeType,
  summary: '',
  estimatedWords: 0,
  involvedCharacters: [] as string[],
  involvedLocations: [] as string[],
  status: 'pending' as OutlineStatus
})

// 计算根节点
const rootNodes = computed(() => {
  return outlineNodes.value
    .filter(n => !n.parentId)
    .sort((a, b) => a.orderIndex - b.orderIndex)
})

// 获取子节点
function getChildren(parentId: string): StoryOutline[] {
  return outlineNodes.value
    .filter(n => n.parentId === parentId)
    .sort((a, b) => a.orderIndex - b.orderIndex)
}

// 是否有子节点
function hasChildren(nodeId: string): boolean {
  return outlineNodes.value.some(n => n.parentId === nodeId)
}

// 展开/折叠节点
function toggleExpand(nodeId: string) {
  const index = expandedNodes.value.indexOf(nodeId)
  if (index === -1) {
    expandedNodes.value.push(nodeId)
  } else {
    expandedNodes.value.splice(index, 1)
  }
}

// 名称映射
function getNodeTypeName(type: OutlineNodeType): string {
  const names: Record<OutlineNodeType, string> = {
    volume: '卷',
    chapter: '章',
    section: '节'
  }
  return names[type] || type
}

function getStatusName(status: OutlineStatus): string {
  const names: Record<OutlineStatus, string> = {
    pending: '待写',
    progressing: '进行中',
    completed: '已完成'
  }
  return names[status] || status
}

// 添加根节点
function addRootNode() {
  parentNodeId.value = null
  editingNode.value = null
  nodeForm.value = {
    name: '',
    nodeType: 'volume',
    summary: '',
    estimatedWords: 0,
    involvedCharacters: [],
    involvedLocations: [],
    status: 'pending'
  }
  showNodeDialog.value = true
}

// 添加子节点
function addChildNode(parent: StoryOutline) {
  parentNodeId.value = parent.id

  // 根据父节点层级确定子节点类型
  let childType: OutlineNodeType = 'chapter'
  if (parent.nodeType === 'chapter') {
    childType = 'section'
  }

  editingNode.value = null
  nodeForm.value = {
    name: '',
    nodeType: childType,
    summary: '',
    estimatedWords: 0,
    involvedCharacters: [],
    involvedLocations: [],
    status: 'pending'
  }
  showNodeDialog.value = true
}

// 编辑节点
function editNode(node: StoryOutline) {
  editingNode.value = node
  parentNodeId.value = node.parentId || null
  nodeForm.value = {
    name: node.name,
    nodeType: node.nodeType,
    summary: node.summary,
    estimatedWords: node.estimatedWords,
    involvedCharacters: node.involvedCharacters,
    involvedLocations: node.involvedLocations,
    status: node.status
  }
  showNodeDialog.value = true
}

// 删除节点（递归删除子节点）
async function deleteNode(id: string) {
  const node = outlineNodes.value.find(n => n.id === id)
  if (!node) return

  const hasChildrenNodes = hasChildren(id)

  try {
    await ElMessageBox.confirm(
      hasChildrenNodes
        ? '该节点有子节点，删除将一并删除所有子节点，确定要删除吗？'
        : '确定要删除该节点吗？',
      '删除节点',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    // 递归删除所有子节点
    const toDelete = [id]
    function collectChildren(parentId: string) {
      outlineNodes.value.forEach(n => {
        if (n.parentId === parentId && !toDelete.includes(n.id)) {
          toDelete.push(n.id)
          collectChildren(n.id)
        }
      })
    }
    collectChildren(id)

    // 依次删除（从叶子节点开始）
    for (const deleteId of toDelete.reverse()) {
      await window.electronAPI.longwriting.deleteOutline(deleteId)
    }

    await loadOutlineTree()
    expandedNodes.value = expandedNodes.value.filter(eId => !toDelete.includes(eId))

    ElMessage.success('节点已删除')
    updateProgress()
  } catch {
    // 用户取消
  }
}

// 保存节点
async function saveNode() {
  if (!nodeForm.value.name) {
    ElMessage.warning('请输入节点名称')
    return
  }

  if (editingNode.value) {
    // 更新现有节点
    const result = await window.electronAPI.longwriting.updateOutline(editingNode.value.id, {
      name: nodeForm.value.name,
      nodeType: nodeForm.value.nodeType,
      summary: nodeForm.value.summary,
      estimatedWords: nodeForm.value.estimatedWords,
      involvedCharacters: nodeForm.value.involvedCharacters,
      involvedLocations: nodeForm.value.involvedLocations,
      status: nodeForm.value.status
    })
    if (result.success) {
      await loadOutlineTree()
      ElMessage.success('节点已更新')
    } else {
      ElMessage.error(result.error || '更新失败')
    }
  } else {
    // 创建新节点
    const siblings = parentNodeId.value
      ? getChildren(parentNodeId.value)
      : rootNodes.value

    const newLevel = parentNodeId.value
      ? (outlineNodes.value.find(n => n.id === parentNodeId.value)?.level || 0) + 1
      : 1

    const result = await window.electronAPI.longwriting.createOutline({
      projectId: props.projectId,
      parentId: parentNodeId.value || undefined,
      name: nodeForm.value.name,
      level: newLevel,
      nodeType: nodeForm.value.nodeType,
      summary: nodeForm.value.summary,
      involvedCharacters: nodeForm.value.involvedCharacters,
      involvedLocations: nodeForm.value.involvedLocations,
      status: nodeForm.value.status,
      estimatedWords: nodeForm.value.estimatedWords,
      orderIndex: siblings.length
    })

    if (result.success) {
      await loadOutlineTree()
      ElMessage.success('节点已添加')

      // 自动展开父节点
      if (parentNodeId.value && !expandedNodes.value.includes(parentNodeId.value)) {
        expandedNodes.value.push(parentNodeId.value)
      }
    } else {
      ElMessage.error(result.error || '添加失败')
    }
  }

  showNodeDialog.value = false
  resetNodeForm()
  updateProgress()
}

function resetNodeForm() {
  editingNode.value = null
  parentNodeId.value = null
  nodeForm.value = {
    name: '',
    nodeType: 'volume',
    summary: '',
    estimatedWords: 0,
    involvedCharacters: [],
    involvedLocations: [],
    status: 'pending'
  }
}

// AI 生成大纲
async function generateOutline() {
  // 检查是否选择了模型（需要同时检查 providerId 和 modelId）
  if (!selectedModel.value || !selectedModel.value.providerId || !selectedModel.value.modelId) {
    ElMessage.warning('请先在顶部选择 AI 模型')
    return
  }

  console.log('[OutlineStage] 生成大纲, providerId:', selectedModel.value.providerId, 'modelId:', selectedModel.value.modelId)

  generating.value = true
  generatingContent.value = '准备生成大纲...'

  // 生成唯一事件 ID
  currentEventId.value = `outline-${props.projectId}-${Date.now()}`

  // 监听进度事件
  const unsubscribe = window.electronAPI.longwriting.onGenerateEvent(
    currentEventId.value,
    (event: { type: string; content?: string; error?: string; data?: any }) => {
      if (event.type === 'progress' && event.content) {
        // 显示进度信息
        generatingContent.value = event.content
      } else if (event.type === 'error') {
        generating.value = false
        currentEventId.value = null
        unsubscribe()
        ElMessage.error(event.error || '生成失败')
      }
    }
  )

  // 调用 AI API，传递 eventId 和模型参数
  try {
    const result = await window.electronAPI.longwriting.generateOutlineStory(
      currentEventId.value,
      props.projectId,
      selectedModel.value.providerId,
      selectedModel.value.modelId
    )

    generating.value = false
    currentEventId.value = null
    unsubscribe()

    if (!result.success) {
      ElMessage.error(result.error || '生成失败')
    } else if (result.data && result.data.length > 0) {
      showOutlineConfirm(result.data)
    } else {
      ElMessage.error('生成结果为空')
    }
  } catch (error) {
    generating.value = false
    currentEventId.value = null
    unsubscribe()
    ElMessage.error('生成失败: ' + error)
  }
}

// 显示大纲确认对话框
async function showOutlineConfirm(suggestedOutline: any[]) {
  if (!Array.isArray(suggestedOutline) || suggestedOutline.length === 0) {
    ElMessage.warning('AI 未生成大纲建议')
    return
  }

  // 显示确认对话框
  ElMessageBox.confirm(
      `AI 建议生成以下大纲结构：\n\n${suggestedOutline.map((o: any) => `- ${o.name}（预估${o.estimatedWords || 0}字）`).join('\n')}`,
      'AI 生成建议',
      {
        confirmButtonText: '采纳建议',
        cancelButtonText: '取消',
        type: 'info'
      }
    ).then(async () => {
      console.log('开始创建大纲，建议数据:', suggestedOutline)
      try {
        // 创建大纲节点
        for (let i = 0; i < suggestedOutline.length; i++) {
          const volume = suggestedOutline[i]
          console.log('创建卷:', volume.name)
          // 创建卷
          const volumeResult = await window.electronAPI.longwriting.createOutline({
            projectId: props.projectId,
            name: volume.name,
            level: 1,
            nodeType: 'volume',
            summary: volume.summary || '',
            estimatedWords: volume.estimatedWords || 0,
            involvedCharacters: [],
            involvedLocations: [],
            status: 'pending',
            orderIndex: i
          })
          console.log('卷创建结果:', volumeResult)

          // 如果有章节，创建章
          if (volumeResult.success && volume.chapters && Array.isArray(volume.chapters)) {
            const volumeId = volumeResult.data.id
            for (let j = 0; j < volume.chapters.length; j++) {
              const chapter = volume.chapters[j]
              const chapterResult = await window.electronAPI.longwriting.createOutline({
                projectId: props.projectId,
                parentId: volumeId,
                name: chapter.name,
                level: 2,
                nodeType: 'chapter',
                summary: chapter.summary || '',
                estimatedWords: chapter.estimatedWords || 0,
                involvedCharacters: [],
                involvedLocations: [],
                status: 'pending',
                orderIndex: j
              })
              console.log('章创建结果:', chapterResult)

              // 如果有小节，创建节
              if (chapterResult.success && chapter.sections && Array.isArray(chapter.sections)) {
                const chapterId = chapterResult.data.id
                for (let k = 0; k < chapter.sections.length; k++) {
                  const section = chapter.sections[k]
                  await window.electronAPI.longwriting.createOutline({
                    projectId: props.projectId,
                    parentId: chapterId,
                    name: section.name,
                    level: 3,
                    nodeType: 'section',
                    summary: section.summary || '',
                    estimatedWords: section.estimatedWords || 0,
                    involvedCharacters: [],
                    involvedLocations: [],
                    status: 'pending',
                    orderIndex: k
                  })
                }
              }
            }
          }
        }

        console.log('大纲创建完成，重新加载...')
        await loadOutlineTree()
        console.log('大纲树加载完成:', outlineNodes.value)
        updateProgress()
        ElMessage.success('大纲已生成')
      } catch (error) {
        console.error('创建大纲失败:', error)
        ElMessage.error('创建大纲失败: ' + error)
      }
    }).catch((err) => {
      console.log('用户取消或出错:', err)
    })
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
  const completedCount = outlineNodes.value.filter(n => n.status === 'completed').length
  const total = outlineNodes.value.length
  const progress = Math.min(75, 65 + Math.floor((completedCount / Math.max(total, 1)) * 10))
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

// 加载角色和地点列表
async function loadReferences() {
  loading.value = true
  await Promise.all([
    loadOutlineTree(),
    loadCharacters(),
    loadLocations()
  ])
  loading.value = false
  updateProgress()
}

onMounted(() => {
  loadReferences()
})

// 监听 projectId 变化重新加载
watch(() => props.projectId, () => {
  loadReferences()
})
</script>

<style lang="scss" scoped>
.outline-stage {
  max-width: 900px;
  margin: 0 auto;
  flex: 1;
  min-height: 0;
  min-width: 0;
  width: 100%;
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

.outline-tree {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.empty-outline {
  padding: 40px 0;
}

.outline-node {
  position: relative;

  .node-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: var(--fill-color-blank);
    border-radius: 8px;
    border: 1px solid var(--border-color-lighter);
    transition: all 0.2s;

    &:hover {
      border-color: var(--color-primary-light-5);
    }

    &.clickable {
      cursor: pointer;
    }

    &.expanded {
      border-radius: 8px 8px 0 0;
      border-bottom: none;
    }
  }

  // 子节点容器，继承父节点的边框样式
  .node-children {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px 0 12px 0;
    border-left: 1px solid var(--border-color-lighter);
    border-right: 1px solid var(--border-color-lighter);
    border-bottom: 1px solid var(--border-color-lighter);
    border-bottom-left-radius: 8px;
    border-bottom-right-radius: 8px;
    margin-top: -1px; // 与父节点的 header 重叠，避免双边框
    background: var(--fill-color-blank);
  }

  .node-expand {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--text-color-secondary);
  }

  .node-title {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;

    h4 {
      font-size: 14px;
      font-weight: 500;
      color: var(--text-color-primary);
      margin: 0;
    }

    .node-type-tag {
      font-size: 12px;
      padding: 2px 6px;
      border-radius: 4px;
      background: var(--fill-color-light);
      color: var(--text-color-secondary);
    }

    .node-status {
      font-size: 12px;
      padding: 2px 6px;
      border-radius: 4px;

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

  .node-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--text-color-secondary);

    .char-tag {
      font-size: 12px;
    }
  }

  .node-actions {
    display: flex;
    gap: 4px;
  }
}

.volume-node {
  > .node-header {
    padding: 16px;

    h4 {
      font-size: 16px;
    }
  }
}

.chapter-node {
  margin-left: 12px;
  margin-right: 12px;

  &:first-child {
    margin-top: 0;
  }

  > .node-header {
    background: var(--fill-color-lighter);
  }
}

.section-node {
  margin-left: 12px;
  margin-right: 12px;

  > .node-header {
    background: var(--fill-color);
    padding: 8px 12px;

    h4 {
      font-size: 13px;
    }
  }
}

.add-btn {
  width: 100%;
  height: 48px;
  margin-top: 12px;
}

.form-tip {
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-left: 8px;
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
</style>