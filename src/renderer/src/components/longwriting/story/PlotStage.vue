<template>
  <div class="plot-stage">
    <div class="stage-header">
      <h2>故事情节设计</h2>
      <p class="stage-desc">规划故事的主要情节脉络，为大纲设计提供基础</p>
    </div>

    <div class="stage-content">
      <!-- 情节列表 -->
      <div class="plot-list" v-if="plots.length > 0">
        <draggable
          v-model="plots"
          item-key="id"
          handle=".drag-handle"
          animation="200"
          @end="onDragEnd"
        >
          <template #item="{ element, index }">
            <div class="plot-card" :class="{ editing: editingPlotId === element.id }">
              <div class="plot-header">
                <div class="drag-handle">
                  <el-icon><Rank /></el-icon>
                </div>
                <span class="plot-number">{{ index + 1 }}</span>
                <h4 class="plot-title">{{ element.title }}</h4>
                <div class="plot-actions">
                  <el-button text size="small" @click="startEdit(element)">
                    <el-icon><Edit /></el-icon>
                  </el-button>
                  <el-button text size="small" type="danger" @click="deletePlot(element.id)">
                    <el-icon><Delete /></el-icon>
                  </el-button>
                </div>
              </div>
              <p class="plot-summary">{{ element.summary }}</p>
              <div class="plot-meta" v-if="element.involvedCharacters?.length > 0">
                <el-tag
                  v-for="char in element.involvedCharacters"
                  :key="char"
                  size="small"
                  type="info"
                  class="character-tag"
                >
                  {{ char }}
                </el-tag>
              </div>
            </div>
          </template>
        </draggable>
      </div>

      <!-- 空状态 -->
      <div class="empty-state" v-else-if="!generating">
        <el-empty description="暂无情节">
          <template #image>
            <el-icon :size="64" color="#C0C4CC"><Document /></el-icon>
          </template>
        </el-empty>
      </div>

      <!-- AI 生成中 -->
      <div v-if="generating" class="generating-progress">
        <el-progress :percentage="100" :indeterminate="true" />
        <p class="progress-text">AI 正在生成故事情节...</p>
        <div class="generating-content" v-if="generatingContent">
          <pre>{{ generatingContent }}</pre>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="action-buttons" v-if="!generating">
        <el-button type="primary" @click="generatePlots" :disabled="plots.length > 0">
          <el-icon><MagicStick /></el-icon>
          AI 生成情节
        </el-button>
        <el-button @click="showAddDialog = true">
          <el-icon><Plus /></el-icon>
          手动添加
        </el-button>
        <el-button v-if="plots.length > 0" type="danger" plain @click="clearAllPlots">
          <el-icon><Delete /></el-icon>
          清空全部
        </el-button>
      </div>
    </div>

    <!-- 添加/编辑对话框 -->
    <el-dialog
      v-model="showAddDialog"
      :title="editingPlotId ? '编辑情节' : '添加情节'"
      width="600px"
      @close="resetForm"
    >
      <el-form :model="plotForm" label-width="100px">
        <el-form-item label="情节标题" required>
          <el-input v-model="plotForm.title" placeholder="输入情节标题" maxlength="50" show-word-limit />
        </el-form-item>
        <el-form-item label="情节概要" required>
          <el-input
            v-model="plotForm.summary"
            type="textarea"
            :rows="4"
            placeholder="描述这个情节的主要内容..."
            maxlength="500"
            show-word-limit
          />
        </el-form-item>
        <el-form-item label="涉及角色">
          <el-select
            v-model="plotForm.involvedCharacters"
            multiple
            filterable
            allow-create
            default-first-option
            placeholder="选择或输入涉及的角色"
          >
            <el-option
              v-for="char in characterNames"
              :key="char"
              :label="char"
              :value="char"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="plotForm.notes"
            type="textarea"
            :rows="2"
            placeholder="可选的备注信息"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddDialog = false">取消</el-button>
        <el-button type="primary" @click="savePlot">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, inject } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete, MagicStick, Rank, Document } from '@element-plus/icons-vue'
import draggable from 'vuedraggable'
import type { StoryPlot } from '../../../../shared/types/longwriting.types'
import type { ComputedRef } from 'vue'

const props = defineProps<{
  projectId: string
}>()

const emit = defineEmits<{
  'update:progress': [progress: number]
}>()

// 从父组件注入选中的模型（computed ref）
const selectedModelRef = inject<ComputedRef<{ providerId: string; modelId: string } | null>>('selectedModel')
// 获取当前选中的模型值
const selectedModel = computed(() => selectedModelRef?.value)

// 情节列表
const plots = ref<StoryPlot[]>([])

// 角色名称列表（用于选择）
const characterNames = ref<string[]>([])

// 生成状态
const generating = ref(false)
const generatingContent = ref('')
const currentEventId = ref<string | null>(null)

// 对话框状态
const showAddDialog = ref(false)
const editingPlotId = ref<string | null>(null)
const plotForm = ref({
  title: '',
  summary: '',
  involvedCharacters: [] as string[],
  notes: ''
})

// 加载情节列表
async function loadPlots() {
  console.log('[PlotStage] loadPlots 被调用, projectId:', props.projectId)
  try {
    const result = await window.electronAPI.longwriting.getPlots(props.projectId)
    console.log('[PlotStage] getPlots 结果:', result)
    if (result.success) {
      plots.value = result.data || []
      console.log('[PlotStage] 加载到情节数量:', plots.value.length)
      updateProgress()
    } else {
      console.error('[PlotStage] 加载情节失败:', result.error)
    }
  } catch (error) {
    console.error('[PlotStage] 加载情节失败:', error)
  }
}

// 加载角色名称列表
async function loadCharacterNames() {
  try {
    const result = await window.electronAPI.longwriting.getCharacters(props.projectId)
    if (result.success && result.data) {
      characterNames.value = result.data.map((c: any) => c.name)
    }
  } catch (error) {
    console.error('加载角色列表失败:', error)
  }
}

// 更新进度
function updateProgress() {
  const count = plots.value.length
  if (count >= 10) {
    emit('update:progress', 20)
  } else if (count >= 5) {
    emit('update:progress', 15)
  } else if (count > 0) {
    emit('update:progress', 12)
  } else {
    emit('update:progress', 10)
  }
}

// AI 生成情节
async function generatePlots() {
  console.log('[PlotStage] generatePlots 被调用')
  console.log('[PlotStage] selectedModelRef:', selectedModelRef)
  console.log('[PlotStage] selectedModel.value:', selectedModel.value)

  // 检查是否选择了模型
  if (!selectedModel.value?.providerId || !selectedModel.value?.modelId) {
    console.error('[PlotStage] 未选择模型, providerId:', selectedModel.value?.providerId, 'modelId:', selectedModel.value?.modelId)
    ElMessage.warning('请先在顶部选择 AI 模型')
    return
  }

  console.log('[PlotStage] 开始生成情节, providerId:', selectedModel.value.providerId, 'modelId:', selectedModel.value.modelId)

  generating.value = true
  generatingContent.value = ''

  currentEventId.value = `plots-${props.projectId}-${Date.now()}`

  // 监听流式生成事件
  const unsubscribe = window.electronAPI.longwriting.onGenerateEvent(
    currentEventId.value,
    (event: { type: string; content?: string; error?: string; data?: any }) => {
      console.log('[PlotStage] 收到事件:', event.type)
      if (event.type === 'content' && event.content) {
        generatingContent.value += event.content
      } else if (event.type === 'done') {
        console.log('[PlotStage] 生成完成, 内容长度:', generatingContent.value.length)
        generating.value = false
        currentEventId.value = null
        unsubscribe()
        parsePlotsResult(generatingContent.value)
      } else if (event.type === 'error') {
        console.error('[PlotStage] 生成错误:', event.error)
        generating.value = false
        currentEventId.value = null
        unsubscribe()
        ElMessage.error(event.error || '生成失败')
      }
    }
  )

  const result = await window.electronAPI.longwriting.generatePlots(
    currentEventId.value,
    props.projectId,
    selectedModel.value.providerId,
    selectedModel.value.modelId
  )

  console.log('[PlotStage] generatePlots API 返回:', result)

  if (!result.success) {
    generating.value = false
    currentEventId.value = null
    unsubscribe()
    ElMessage.error(result.error || '生成失败')
  }
}

// 解析 AI 响应
async function parsePlotsResult(content: string) {
  console.log('[PlotStage] parsePlotsResult 被调用, 内容长度:', content.length)
  console.log('[PlotStage] 内容预览:', content.substring(0, 500))
  try {
    // 尝试提取 JSON 数组
    let jsonStr = content

    // 移除可能的 markdown 代码块标记
    if (jsonStr.includes('```json')) {
      jsonStr = jsonStr.replace(/```json\s*/g, '').replace(/```\s*/g, '')
    } else if (jsonStr.includes('```')) {
      jsonStr = jsonStr.replace(/```\s*/g, '')
    }

    // 尝试找到 JSON 数组
    const jsonMatch = jsonStr.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      console.error('[PlotStage] 未找到 JSON 数组')
      ElMessage.warning('AI 返回格式不正确，请重试')
      return
    }

    console.log('[PlotStage] 找到 JSON 数组, 长度:', jsonMatch[0].length)
    const data = JSON.parse(jsonMatch[0])
    console.log('[PlotStage] 解析后的数据:', data)

    if (!Array.isArray(data) || data.length === 0) {
      console.error('[PlotStage] 数据不是数组或为空')
      ElMessage.warning('AI 未生成有效的情节数据')
      return
    }

    console.log('[PlotStage] 准备批量创建情节, 数量:', data.length, 'projectId:', props.projectId)

    // 批量创建情节
    const createResult = await window.electronAPI.longwriting.batchCreatePlots(props.projectId, data)
    console.log('[PlotStage] batchCreatePlots 结果:', createResult)

    if (createResult.success) {
      plots.value = createResult.data || []
      console.log('[PlotStage] 情节创建成功, 数量:', plots.value.length)
      ElMessage.success(`成功生成 ${plots.value.length} 个情节`)
      updateProgress()
    } else {
      console.error('[PlotStage] 创建情节失败:', createResult.error)
      ElMessage.error(createResult.error || '保存情节失败')
    }
  } catch (error) {
    console.error('[PlotStage] 解析 AI 响应失败:', error)
    ElMessage.error('解析 AI 响应失败')
  }
}

// 开始编辑
function startEdit(plot: StoryPlot) {
  editingPlotId.value = plot.id
  plotForm.value = {
    title: plot.title,
    summary: plot.summary,
    involvedCharacters: [...(plot.involvedCharacters || [])],
    notes: plot.notes || ''
  }
  showAddDialog.value = true
}

// 保存情节
async function savePlot() {
  if (!plotForm.value.title.trim()) {
    ElMessage.warning('请输入情节标题')
    return
  }
  if (!plotForm.value.summary.trim()) {
    ElMessage.warning('请输入情节概要')
    return
  }

  try {
    if (editingPlotId.value) {
      // 更新
      const result = await window.electronAPI.longwriting.updatePlot(editingPlotId.value, {
        title: plotForm.value.title,
        summary: plotForm.value.summary,
        involvedCharacters: plotForm.value.involvedCharacters,
        notes: plotForm.value.notes
      })
      if (result.success) {
        ElMessage.success('情节已更新')
        await loadPlots()
      } else {
        ElMessage.error(result.error || '更新失败')
      }
    } else {
      // 创建
      const result = await window.electronAPI.longwriting.createPlot({
        projectId: props.projectId,
        title: plotForm.value.title,
        summary: plotForm.value.summary,
        involvedCharacters: plotForm.value.involvedCharacters,
        notes: plotForm.value.notes
      })
      if (result.success) {
        ElMessage.success('情节已添加')
        await loadPlots()
      } else {
        ElMessage.error(result.error || '添加失败')
      }
    }

    showAddDialog.value = false
    resetForm()
  } catch (error) {
    console.error('保存情节失败:', error)
    ElMessage.error('保存失败')
  }
}

// 删除情节
async function deletePlot(id: string) {
  try {
    await ElMessageBox.confirm('确定要删除这个情节吗？', '提示', {
      type: 'warning'
    })

    const result = await window.electronAPI.longwriting.deletePlot(id)
    if (result.success) {
      ElMessage.success('情节已删除')
      await loadPlots()
    } else {
      ElMessage.error(result.error || '删除失败')
    }
  } catch {
    // 用户取消
  }
}

// 清空所有情节
async function clearAllPlots() {
  try {
    await ElMessageBox.confirm('确定要清空所有情节吗？此操作不可恢复。', '警告', {
      type: 'warning'
    })

    // 逐个删除
    for (const plot of plots.value) {
      await window.electronAPI.longwriting.deletePlot(plot.id)
    }

    plots.value = []
    ElMessage.success('已清空所有情节')
    updateProgress()
  } catch {
    // 用户取消
  }
}

// 拖拽排序结束
async function onDragEnd() {
  // 更新顺序
  const orderList = plots.value.map((plot, index) => ({
    id: plot.id,
    order: index
  }))

  const result = await window.electronAPI.longwriting.reorderPlots(props.projectId, orderList)
  if (!result.success) {
    ElMessage.error('排序保存失败')
    await loadPlots() // 重新加载恢复原顺序
  }
}

// 重置表单
function resetForm() {
  editingPlotId.value = null
  plotForm.value = {
    title: '',
    summary: '',
    involvedCharacters: [],
    notes: ''
  }
}

onMounted(() => {
  console.log('[PlotStage] onMounted 被调用, projectId:', props.projectId)
  loadPlots()
  loadCharacterNames()
})
</script>

<style lang="scss" scoped>
.plot-stage {
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

.plot-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 24px;
}

.plot-card {
  background: var(--bg-color);
  border-radius: 12px;
  border: 1px solid var(--border-color-light);
  padding: 16px;
  transition: all 0.2s;

  &:hover {
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  }

  &.editing {
    border-color: var(--el-color-primary);
  }
}

.plot-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;

  .drag-handle {
    cursor: grab;
    color: var(--text-color-placeholder);
    padding: 4px;

    &:hover {
      color: var(--text-color-secondary);
    }

    &:active {
      cursor: grabbing;
    }
  }

  .plot-number {
    background: var(--el-color-primary);
    color: white;
    font-size: 12px;
    font-weight: 600;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .plot-title {
    flex: 1;
    font-size: 16px;
    font-weight: 500;
    color: var(--text-color-primary);
    margin: 0;
  }

  .plot-actions {
    opacity: 0;
    transition: opacity 0.2s;
  }

  &:hover .plot-actions {
    opacity: 1;
  }
}

.plot-summary {
  font-size: 14px;
  color: var(--text-color-regular);
  line-height: 1.6;
  margin: 0 0 8px 44px;
}

.plot-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-left: 44px;

  .character-tag {
    font-size: 12px;
  }
}

.empty-state {
  padding: 48px 0;
}

.action-buttons {
  display: flex;
  justify-content: center;
  gap: 12px;
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

  .generating-content {
    margin-top: 16px;
    max-height: 300px;
    overflow: auto;

    pre {
      font-size: 12px;
      color: var(--text-color-regular);
      white-space: pre-wrap;
      word-break: break-all;
      margin: 0;
    }
  }
}
</style>