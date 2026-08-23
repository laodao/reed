<template>
  <div class="writing-workbench">
    <!-- 上下文面板（生成前展示将注入的已确认设定） -->
    <div class="context-panel" :class="{ open: contextOpen }">
      <div class="context-header" @click="contextOpen = !contextOpen">
        <span>上下文面板</span>
        <span class="context-summary">{{ contextSummary }}</span>
        <el-icon><ArrowUp v-if="contextOpen" /><ArrowDown v-else /></el-icon>
      </div>
      <div v-if="contextOpen" class="context-body">
        <div v-if="contextOverview" class="context-item">
          <span class="ctx-label">故事蓝图</span>
          <span class="ctx-text">{{ contextOverview.oneLine }}</span>
        </div>
        <div v-if="contextCharacters.length" class="context-item">
          <span class="ctx-label">人物</span>
          <span class="ctx-text">{{ contextCharacters.join('、') }}</span>
        </div>
        <div v-if="contextPlots.length" class="context-item">
          <span class="ctx-label">故事线</span>
          <span class="ctx-text">{{ contextPlots.join('；') }}</span>
        </div>
        <div v-if="contextEvents.length" class="context-item">
          <span class="ctx-label">已发生事件</span>
          <span class="ctx-text">{{ contextEvents.join('；') }}</span>
        </div>
        <div v-if="contextEdges.length" class="context-item">
          <span class="ctx-label">生效关系</span>
          <span class="ctx-text">{{ contextEdges.join('；') }}</span>
        </div>
        <div v-if="!contextOverview && !contextCharacters.length && !contextPlots.length" class="context-item empty">
          暂无已确认设定——先在向导或设定库中完成概要/人物/故事线
        </div>
      </div>
    </div>

    <div class="workbench-layout">
      <!-- 大纲树 -->
      <div class="outline-pane">
        <div class="pane-header">
          大纲
          <el-button size="small" text type="primary" @click="openNodeDialog(null)">
            <el-icon><Plus /></el-icon>
            新建
          </el-button>
        </div>
        <div v-if="treeData.length === 0" class="pane-empty">
          暂无大纲，可点击「新建」添加卷/章/节，或在向导「故事大纲」步骤 AI 生成
        </div>
        <el-tree
          v-else
          :data="treeData"
          node-key="id"
          :props="{ label: 'name', children: 'children' }"
          highlight-current
          :current-node-key="activeOutlineId"
          @node-click="handleNodeClick"
        >
          <template #default="{ data }">
            <span class="tree-node">
              <el-tag size="small" :type="nodeTagType(data.nodeType)" class="node-type-tag">
                {{ nodeTypeLabel(data.nodeType) }}
              </el-tag>
              <span class="node-name">{{ data.name }}</span>
              <el-icon v-if="isChapterDone(data.id)" class="done-icon"><Check /></el-icon>
              <span class="node-actions" @click.stop>
                <el-icon class="node-action" @click="openNodeDialog(data)"><Edit /></el-icon>
                <el-icon class="node-action" @click="addChildNode(data)"><Plus /></el-icon>
                <el-icon class="node-action danger" @click="deleteNode(data)"><Delete /></el-icon>
              </span>
            </span>
          </template>
        </el-tree>
      </div>

      <!-- 编辑区 -->
      <div class="editor-pane">
        <template v-if="activeNode">
          <div class="editor-header">
            <span class="chapter-name">{{ activeNode.name }}</span>
            <span class="chapter-summary">{{ activeNode.summary }}</span>
            <div class="editor-actions">
              <el-button
                size="small"
                type="primary"
                :loading="generating"
                :disabled="!canGenerate"
                @click="generateCurrent"
              >
                <el-icon><MagicStick /></el-icon>
                {{ generating ? '生成中...' : '生成本节' }}
              </el-button>
              <el-button v-if="generating" size="small" @click="ai.cancel()">取消</el-button>
              <el-button size="small" type="success" :disabled="!content.trim()" @click="saveCurrent">
                <el-icon><Check /></el-icon>
                保存
              </el-button>
              <el-button v-if="isLeaf(activeNode)" size="small" :loading="extracting" @click="runPipeline">
                <el-icon><Share /></el-icon>
                提取图谱
              </el-button>
            </div>
          </div>

          <!-- 非叶子：子内容预览 -->
          <div v-if="!isLeaf(activeNode)" class="preview-area">
            <div v-for="child in childrenContent(activeNode)" :key="child.id" class="preview-block">
              <div class="preview-title">{{ child.name }}</div>
              <div class="preview-text">{{ child.content || '（未写作）' }}</div>
            </div>
          </div>

          <!-- 叶子：章节编辑 -->
          <el-input
            v-else
            v-model="content"
            type="textarea"
            :rows="22"
            placeholder="AI 生成内容将显示在这里，你可以直接编辑..."
          />
          <div class="editor-status">
            <span v-if="wordCount > 0">{{ wordCount }} 字</span>
            <span v-if="savedAt" class="saved-at">已保存 {{ savedAt }}</span>
            <span v-if="extracting" class="extracting">正在提取事件/状态/图谱...</span>
          </div>
        </template>
        <div v-else class="editor-empty">从左侧选择节点进行编辑</div>
      </div>
    </div>

    <!-- 节点编辑对话框 -->
    <el-dialog v-model="showNodeDialog" :title="editingNode ? '编辑节点' : '新建节点'" width="520px">
      <el-form label-width="80px">
        <el-form-item label="类型">
          <el-radio-group v-model="nodeForm.nodeType">
            <el-radio-button value="volume">卷</el-radio-button>
            <el-radio-button value="chapter">章</el-radio-button>
            <el-radio-button value="section">节</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="名称" required>
          <el-input v-model="nodeForm.name" placeholder="节点名称" />
        </el-form-item>
        <el-form-item label="概要">
          <el-input v-model="nodeForm.summary" type="textarea" :rows="3" placeholder="节点概要（AI 生成时作为章节任务）" />
        </el-form-item>
        <el-form-item label="预估字数">
          <el-input-number v-model="nodeForm.estimatedWords" :min="0" :max="100000" :step="500" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showNodeDialog = false">取消</el-button>
        <el-button type="primary" :disabled="!nodeForm.name.trim()" @click="saveNode">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
/**
 * 创作台（高级模式）：大纲树 + 章节编辑 + 写前校验 + 生成/保存 + 图谱流水线 + 上下文面板
 * 整合"大纲设计 + 章节写作"，生成→确认→提取 单条流水线。
 */
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { MagicStick, Check, Share, ArrowUp, ArrowDown, Plus, Edit, Delete } from '@element-plus/icons-vue'
import { useAiGeneration } from '@/composables/useAiGeneration'

const props = defineProps<{
  projectId: string
}>()

const ai = useAiGeneration()
const generating = ai.generating
const extracting = ref(false)
const contextOpen = ref(true)

const outlineNodes = ref<any[]>([])
const activeOutlineId = ref('')
const content = ref('')
const savedAt = ref('')
const chapterIdMap = ref<Record<string, string>>({})
const contentMap = ref<Record<string, string>>({})

// ==================== 上下文数据 ====================
const contextOverview = ref<{ oneLine: string } | null>(null)
const contextCharacters = ref<string[]>([])
const contextPlots = ref<string[]>([])
const contextEvents = ref<string[]>([])
const contextEdges = ref<string[]>([])

const contextSummary = computed(() => {
  const parts: string[] = []
  if (contextOverview.value) parts.push('蓝图')
  if (contextCharacters.value.length) parts.push(`${contextCharacters.value.length} 人物`)
  if (contextPlots.value.length) parts.push(`${contextPlots.value.length} 情节`)
  if (contextEvents.value.length) parts.push(`${contextEvents.value.length} 事件`)
  if (contextEdges.value.length) parts.push(`${contextEdges.value.length} 关系`)
  return parts.join(' · ') || '暂无设定'
})

// ==================== 大纲树 ====================
const treeData = computed(() => buildTree(outlineNodes.value))

function buildTree(nodes: any[]): any[] {
  const map = new Map<string, any>()
  for (const n of nodes) map.set(n.id, { ...n, children: [] })
  const roots: any[] = []
  for (const n of nodes) {
    const node = map.get(n.id)
    if (n.parentId && map.has(n.parentId)) map.get(n.parentId)!.children.push(node)
    else roots.push(node)
  }
  return roots
}

function nodeTypeLabel(t: string): string {
  return { volume: '卷', chapter: '章', section: '节' }[t] || t
}
function nodeTagType(t: string): 'primary' | 'success' | 'info' {
  if (t === 'volume') return 'primary'
  if (t === 'chapter') return 'success'
  return 'info'
}

const activeNode = computed(() => outlineNodes.value.find(n => n.id === activeOutlineId.value) || null)

function isLeaf(node: any): boolean {
  return !outlineNodes.value.some(n => n.parentId === node.id)
}

function childrenContent(node: any): any[] {
  const children = outlineNodes.value.filter(n => n.parentId === node.id)
  return children.map(c => ({ id: c.id, name: c.name, content: contentMap.value[c.id] || '' }))
}

function isChapterDone(id: string): boolean {
  return !!contentMap.value[id]
}

const wordCount = computed(() => content.value.replace(/\s/g, '').length)
const canGenerate = computed(() => !!activeNode.value && isLeaf(activeNode.value) && !generating.value)

function calcChapterNo(outlineId: string): number {
  let count = 0
  for (const n of outlineNodes.value) {
    if (n.nodeType === 'chapter') count++
    if (n.id === outlineId) return count
  }
  return count || 1
}

// ==================== 加载 ====================
async function loadAll(): Promise<void> {
  const [treeResp, overviewResp, charsResp, plotsResp] = await Promise.all([
    window.electronAPI.longwriting.getOutlineTree(props.projectId),
    window.electronAPI.longwriting.getStoryOverview(props.projectId),
    window.electronAPI.longwriting.getCharacters(props.projectId),
    window.electronAPI.longwriting.getPlots(props.projectId),
  ])
  if (treeResp.success) {
    outlineNodes.value = (treeResp.data || []).sort((a: any, b: any) => (a.orderIndex || 0) - (b.orderIndex || 0))
    const firstLeaf = outlineNodes.value.find(n => !outlineNodes.value.some(c => c.parentId === n.id))
    if (firstLeaf) await selectNode(firstLeaf)
  }
  if (overviewResp.success && overviewResp.data) {
    contextOverview.value = { oneLine: overviewResp.data.summary || overviewResp.data.coreConflict || '' }
  }
  if (charsResp.success) contextCharacters.value = (charsResp.data || []).map((c: any) => c.name)
  if (plotsResp.success) contextPlots.value = (plotsResp.data || []).map((p: any) => p.title)

  // 图谱上下文：事件 + 关系（懒加载，失败不影响）
  try {
    const g = await window.electronAPI.longwriting.graphGet(props.projectId)
    if (g.success && g.data) {
      contextEvents.value = (g.data.nodes || []).filter((n: any) => n.type === 'event').map((n: any) => n.name)
      contextEdges.value = (g.data.edges || []).map((e: any) => e.relationType)
    }
  } catch { /* 忽略 */ }
}

async function selectNode(node: any): Promise<void> {
  activeOutlineId.value = node.id
  content.value = ''
  savedAt.value = ''
  if (!isLeaf(node)) return
  const r = await window.electronAPI.longwriting.getChapter(node.id)
  if (r.success && r.data) {
    content.value = r.data.content || ''
    contentMap.value[node.id] = r.data.content || ''
    chapterIdMap.value[node.id] = r.data.id
    savedAt.value = r.data.updatedAt ? new Date(r.data.updatedAt).toLocaleTimeString() : ''
  }
}

function handleNodeClick(data: any): void {
  void selectNode(data)
}

// ==================== 生成（含写前校验） ====================
async function generateCurrent(): Promise<void> {
  if (!activeNode.value || !isLeaf(activeNode.value)) return

  // 写前校验（目标章节时间点）
  const proceed = await runPreGenerationCheck(activeNode.value.id)
  if (proceed === false) return

  const outlineId = activeNode.value.id
  const eventId = `chapter-${outlineId}-${Date.now()}`
  content.value = ''

  const ok = await ai.start({
    eventId,
    subscribe: (handlers: { onContent: (c: string) => void; onDone: () => void; onError: (e: string) => void }) =>
      window.electronAPI.longwriting.onGenerateEvent(eventId, (event: { type: string; content?: string; error?: string }) => {
        if (event.type === 'content' && event.content) {
          handlers.onContent(event.content)
          content.value = ai.content.value
        } else if (event.type === 'done') {
          handlers.onDone()
          content.value = ai.content.value
        } else if (event.type === 'error') {
          handlers.onError(event.error || '生成失败')
        }
      }),
    invoke: async () => {
      const r = await window.electronAPI.longwriting.generateChapter(
        eventId, props.projectId, outlineId, activeNode.value.estimatedWords || 3000,
      )
      return { success: r.success, error: r.error }
    },
  })

  if (!ok) {
    ElMessage.error(ai.error.value || '生成失败')
    return
  }
  content.value = ai.content.value
  await saveCurrent(true)
}

async function runPreGenerationCheck(outlineId: string): Promise<boolean | null> {
  try {
    const chapterNo = calcChapterNo(outlineId)
    const r = await window.electronAPI.longwriting.graphValidateBeforeGeneration(props.projectId, outlineId, chapterNo)
    if (!r.success || !Array.isArray(r.data) || r.data.length === 0) return true
    const errors = r.data.filter((c: any) => c.severity === 'error')
    const warnings = r.data.filter((c: any) => c.severity === 'warning')
    const lines = [
      ...errors.map((c: any) => `❌ ${c.message}`),
      ...warnings.map((c: any) => `⚠️ ${c.message}`),
    ]
    try {
      await ElMessageBox.confirm(
        `检测到 ${r.data.length} 处可能的时间线冲突：\n\n${lines.join('\n')}\n\n仍要继续生成吗？`,
        '时间线一致性检查',
        { confirmButtonText: '继续生成', cancelButtonText: '取消', type: 'warning' },
      )
      return true
    } catch {
      return false
    }
  } catch {
    return null
  }
}

// ==================== 保存 + 流水线 ====================
async function saveCurrent(auto = false): Promise<void> {
  if (!activeNode.value || !content.value.trim()) return
  const r = await window.electronAPI.longwriting.saveChapter(activeNode.value.id, content.value)
  if (r.success) {
    chapterIdMap.value[activeNode.value.id] = r.data?.id || chapterIdMap.value[activeNode.value.id]
    contentMap.value[activeNode.value.id] = content.value
    savedAt.value = new Date().toLocaleTimeString()
    if (!auto) ElMessage.success('章节已保存')
    // 自动跑图谱流水线（事件/状态/建边/摘要）
    void runPipeline()
  } else {
    ElMessage.error(r.error || '保存失败')
  }
}

async function runPipeline(): Promise<void> {
  if (!activeNode.value || extracting.value) return
  const outlineId = activeNode.value.id
  const chapterContent = content.value
  if (!chapterContent.trim() || chapterContent.length < 100) return
  extracting.value = true
  try {
    const chapterNo = calcChapterNo(outlineId)
    const r = await window.electronAPI.longwriting.graphExtractChapter(
      props.projectId, outlineId, chapterContent, chapterNo,
    )
    if (r.success && r.data) {
      const { events, stateCount } = r.data
      const parts: string[] = []
      if (events?.length) parts.push(`${events.length} 个事件`)
      if (stateCount) parts.push(`${stateCount} 条状态`)
      if (parts.length) ElMessage.success(`图谱已更新（${parts.join('，')}）`)
    }
    // 刷新上下文面板
    await loadGraphContext()
  } catch (e) {
    console.error('[WritingWorkbench] 图谱流水线失败:', e)
  } finally {
    extracting.value = false
  }
}

async function loadGraphContext(): Promise<void> {
  try {
    const g = await window.electronAPI.longwriting.graphGet(props.projectId)
    if (g.success && g.data) {
      contextEvents.value = (g.data.nodes || []).filter((n: any) => n.type === 'event').map((n: any) => n.name)
      contextEdges.value = (g.data.edges || []).map((e: any) => e.relationType)
    }
  } catch { /* 忽略 */ }
}

// ==================== 大纲节点管理 ====================
const showNodeDialog = ref(false)
const editingNode = ref<any>(null)
const nodeForm = ref({ name: '', summary: '', nodeType: 'chapter', estimatedWords: 3000 })

function openNodeDialog(node: any | null): void {
  editingNode.value = node
  nodeForm.value = node
    ? { name: node.name || '', summary: node.summary || '', nodeType: node.nodeType || 'chapter', estimatedWords: node.estimatedWords || 3000 }
    : { name: '', summary: '', nodeType: 'chapter', estimatedWords: 3000 }
  showNodeDialog.value = true
}

async function addChildNode(parent: any): Promise<void> {
  editingNode.value = null
  const childType = parent.nodeType === 'volume' ? 'chapter' : parent.nodeType === 'chapter' ? 'section' : 'section'
  nodeForm.value = { name: '', summary: '', nodeType: childType, estimatedWords: 3000 }
  nodeFormParent.value = parent
  showNodeDialog.value = true
}

const nodeFormParent = ref<any>(null)

async function saveNode(): Promise<void> {
  if (!nodeForm.value.name.trim()) return
  try {
    if (editingNode.value) {
      const r = await window.electronAPI.longwriting.updateOutline(editingNode.value.id, {
        name: nodeForm.value.name.trim(),
        summary: nodeForm.value.summary || undefined,
        nodeType: nodeForm.value.nodeType as any,
        estimatedWords: nodeForm.value.estimatedWords || undefined,
      })
      if (!r.success) { ElMessage.error(r.error || '更新失败'); return }
    } else {
      const r = await window.electronAPI.longwriting.createOutline({
        projectId: props.projectId,
        parentId: nodeFormParent.value?.id,
        name: nodeForm.value.name.trim(),
        nodeType: nodeForm.value.nodeType as any,
        summary: nodeForm.value.summary || undefined,
        estimatedWords: nodeForm.value.estimatedWords || undefined,
      })
      if (!r.success) { ElMessage.error(r.error || '创建失败'); return }
    }
    showNodeDialog.value = false
    await loadOutlineOnly()
    ElMessage.success('已保存')
  } catch (e: any) {
    ElMessage.error(`操作失败：${e?.message || e}`)
  }
}

async function deleteNode(node: any): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定删除「${node.name}」及其子节点吗？`, '删除节点', {
      confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning',
    })
  } catch {
    return
  }
  try {
    // 递归收集子树，从叶子删除
    const children = outlineNodes.value.filter(n => n.parentId === node.id)
    for (const child of children) {
      await deleteNodeRecursive(child.id)
    }
    await window.electronAPI.longwriting.deleteOutline(node.id)
    if (activeOutlineId.value === node.id) {
      activeOutlineId.value = ''
      content.value = ''
    }
    await loadOutlineOnly()
    ElMessage.success('已删除')
  } catch (e: any) {
    ElMessage.error(`删除失败：${e?.message || e}`)
  }
}

async function deleteNodeRecursive(id: string): Promise<void> {
  const children = outlineNodes.value.filter(n => n.parentId === id)
  for (const child of children) {
    await deleteNodeRecursive(child.id)
  }
  await window.electronAPI.longwriting.deleteOutline(id)
}

async function loadOutlineOnly(): Promise<void> {
  const r = await window.electronAPI.longwriting.getOutlineTree(props.projectId)
  if (r.success) {
    outlineNodes.value = (r.data || []).sort((a: any, b: any) => (a.orderIndex || 0) - (b.orderIndex || 0))
  }
}

onMounted(() => {
  loadAll()
})
</script>

<style lang="scss" scoped>
.writing-workbench {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.context-panel {
  border: 1px solid var(--border-color-light);
  border-radius: 10px;
  background: var(--bg-color);
  overflow: hidden;

  .context-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 14px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;

    .context-summary {
      flex: 1;
      font-weight: 400;
      color: var(--text-color-secondary);
      font-size: 12px;
    }
  }

  .context-body {
    padding: 8px 14px;
    border-top: 1px solid var(--border-color-lighter);
    display: flex;
    flex-wrap: wrap;
    gap: 8px;

    .context-item {
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--fill-color-lighter);
      border-radius: 6px;
      padding: 4px 10px;
      font-size: 12px;

      .ctx-label {
        font-weight: 600;
        color: var(--color-primary);
        flex-shrink: 0;
      }

      .ctx-text {
        color: var(--text-color-regular);
        max-width: 320px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      &.empty {
        color: var(--text-color-placeholder);
      }
    }
  }
}

.workbench-layout {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 12px;
}

.outline-pane {
  width: 240px;
  flex-shrink: 0;
  overflow-y: auto;
  background: var(--bg-color);
  border: 1px solid var(--border-color-light);
  border-radius: 10px;
  padding: 10px;

  .pane-header {
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 10px;
  }

  .pane-empty {
    font-size: 12px;
    color: var(--text-color-placeholder);
    padding: 12px;
  }

  .tree-node {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 0;

    .node-name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .done-icon {
      color: var(--color-success);
    }
  }
}

.editor-pane {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--bg-color);
  border: 1px solid var(--border-color-light);
  border-radius: 10px;
  padding: 14px;
}

.editor-header {
  display: flex;
  align-items: center;
  gap: 12px;

  .chapter-name {
    font-size: 16px;
    font-weight: 600;
  }

  .chapter-summary {
    flex: 1;
    font-size: 12px;
    color: var(--text-color-secondary);
  }

  .editor-actions {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
  }
}

.preview-area {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.preview-block {
  margin-bottom: 12px;

  .preview-title {
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 4px;
  }

  .preview-text {
    font-size: 13px;
    color: var(--text-color-regular);
    white-space: pre-wrap;
    line-height: 1.7;
  }
}

.editor-status {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--text-color-placeholder);

  .saved-at {
    color: var(--color-success);
  }

  .extracting {
    color: var(--color-primary);
  }
}

.editor-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-color-placeholder);
}
</style>
