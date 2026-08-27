<template>
  <div class="wf-editor">
    <!-- 顶栏 -->
    <div class="toolbar">
      <el-button text @click="router.push('/workflow')">
        <el-icon><ArrowLeft /></el-icon>
      </el-button>
      <span class="title">{{ definition?.name ?? '编辑器' }}</span>
      <el-tag v-if="definition?.publishedVersion > 0" size="small" type="success">v{{ definition.publishedVersion }}</el-tag>
      <span v-if="validation && !validation.valid" class="val-error" :title="validation.errors.join('；')">
        ⚠ {{ validation.errors[0] }}
      </span>
      <span v-else-if="validation?.warnings.length" class="val-warn" :title="validation.warnings.join('；')">
        {{ validation.warnings.length }} 条警告
      </span>
      <div class="spacer" />
      <el-button size="small" :disabled="!canUndo" @click="undo()">↩ 撤销</el-button>
      <el-button size="small" :disabled="!canRedo" @click="redo()">↪ 重做</el-button>
      <el-button size="small" @click="saveDraft" :loading="saving">保存草稿</el-button>
      <el-button size="small" @click="autoLayout">🧹 一键整理</el-button>
      <el-button size="small" @click="doValidate">校验</el-button>
      <el-button size="small" type="warning" plain @click="showDebug = true">试运行</el-button>
      <el-button size="small" type="primary" @click="doPublish">发布</el-button>
      <el-button size="small" type="success" plain @click="openAppPublish">发布为应用</el-button>
      <el-button size="small" type="info" plain @click="openShare">分享</el-button>
    </div>

    <div class="body">
      <!-- 节点面板（目录驱动：新组件自动出现） -->
      <div class="palette">
        <div class="palette-title">组件</div>
        <el-input v-model="paletteSearch" size="small" placeholder="搜索组件…" clearable style="margin-bottom: 8px" />
        <div class="palette-list">
          <template v-for="group in paletteGroups" :key="group.category">
            <div class="palette-group">{{ group.label }}</div>
            <div v-for="entry in group.items" :key="entry.type" class="palette-item"
              draggable="true" :title="entry.description"
              @dragstart="dragType = entry.type" @click="addNode(entry.type)">
              <span class="pi-icon" :class="entry.category"><el-icon :size="16"><component :is="entry.icon" /></el-icon></span>
              <div class="pi-text">{{ entry.label }}</div>
            </div>
          </template>
        </div>
      </div>

      <!-- 画布 -->
      <div class="canvas" @drop="onDrop" @dragover.prevent @dragenter.prevent>
        <VueFlow v-model:nodes="nodes" v-model:edges="edges" :default-edge-options="{ markerEnd: MarkerType.ArrowClosed }"
          :edges-updatable="true" :edge-updater-radius="14" :connection-radius="30" connection-mode="loose"
          @connect="onConnect" @edge-click="onEdgeClick" @edge-update="onEdgeUpdate" @pane-click="closeConfigPanel" fit-view-on-init :min-zoom="0.2" :delete-key-code="['Delete','Backspace']">
          <Background :gap="20" />
          <Controls />
          <MiniMap />

          <!-- 自定义节点 -->
          <template #node-wf="nodeProps">
            <div class="wf-node" :class="[nodeProps.data.category, nodeRunState(nodeProps.id), { selected: nodeProps.selected, hl: highlightedNodeIds.has(nodeProps.id) }]"
              @click="selectNode(nodeProps.id)">
              <div class="wf-node-head">
                <span class="wf-node-icon">{{ ICONS[nodeProps.data.category] }}</span>
                <span class="wf-node-name">{{ nodeProps.data.label }}</span>
              </div>
              <div class="wf-node-summary">{{ nodeProps.data.summary }}</div>
              <!-- 四向锚点：左/上为入（target），右/下为出（source） -->
              <Handle type="target" :position="Position.Left" id="in-left" />
              <Handle type="target" :position="Position.Top" id="in-top" />
              <Handle type="source" :position="Position.Right" id="out-right" />
              <Handle type="source" :position="Position.Bottom" id="out-bottom" />
            </div>
          </template>
        </VueFlow>
      </div>

      <!-- 试运行抽屉（宽度容纳复杂表单：label 在上方 + 数字/下拉/文件控件） -->
      <el-drawer v-model="showDebug" title="试运行" size="min(560px, 92vw)" :append-to-body="true">
        <div class="debug-panel">
          <RunInputForm ref="debugInputRef" :inputs="debugInputs" @valid="v => debugValid = v" />
          <el-button type="primary" size="small" style="width: 100%; margin-top: 12px"
            :loading="debugStarting" :disabled="!debugValid" @click="debugRun">
            {{ debugStatus ? '重新运行' : '开始运行' }}
          </el-button>
          <div v-if="debugRunId" class="debug-status">
            <el-tag :type="debugStatus === 'succeeded' ? 'success' : debugStatus === 'failed' || debugStatus === 'timed_out' ? 'danger' : 'warning'" size="small">
              {{ debugStatus }}
            </el-tag>
            <el-button text size="small" @click="router.push(`/workflow/run/${debugRunId}`)">详情 →</el-button>
          </div>
          <div class="debug-hint">画布节点边框实时显示执行状态（灰=待执行/蓝=执行中/绿=成功/红=失败）</div>
        </div>
      </el-drawer>

      <!-- 配置面板（默认隐藏，点击节点/连线时显示；可关闭） -->
      <div v-if="selectedNode || selectedEdge" class="config-area">
        <div class="config-area-head">
          <span class="config-area-title">配置</span>
          <el-button text size="small" @click="closeConfigPanel"><el-icon><Close /></el-icon></el-button>
        </div>
        <!-- 边编辑（选中连线时） -->
        <div v-if="selectedEdge" class="edge-panel">
          <div class="edge-panel-title">🔗 连线属性</div>
          <div class="edge-field">
            <span class="edge-label">类型</span>
            <el-tag size="small" :color="edgeKindColor(selectedEdge.kind)" class="edge-kind-tag">{{ edgeKindLabel(selectedEdge.kind) }}</el-tag>
          </div>
          <div class="edge-field">
            <span class="edge-label">文字</span>
            <el-input v-model="selectedEdgeLabel" size="small" placeholder="连线显示文字（留空=默认）" @change="saveEdgeLabel" />
          </div>
          <div class="edge-field edge-src">
            <span class="edge-label">来源</span>
            <span class="edge-src-text">{{ edgeNodeName(selectedEdge.source) }} → {{ edgeNodeName(selectedEdge.target) }}</span>
          </div>
          <el-button type="danger" size="small" plain style="width:100%; margin-top:10px" @click="deleteSelectedEdge">删除连线</el-button>
        </div>
        <NodeConfigPanel v-else-if="selectedNode" :node="selectedNode" @change="onConfigChanged" @remove="removeSelected" />
      </div>
    </div>

    <!-- 发布为应用配置对话框（发布即配置渠道，无需事后进详情改） -->
    <el-dialog v-model="showAppPublish" :title="appPublishMode === 'edit' ? '更新应用配置' : '发布为应用'" width="480px" :close-on-click-modal="false">
      <el-form label-width="90px" label-position="left">
        <el-form-item label="应用名称">
          <el-input v-model="appForm.name" placeholder="默认取工作流名称" />
        </el-form-item>
        <el-form-item label="图标">
          <el-input v-model="appForm.icon" placeholder="emoji，如 📦" maxlength="4" />
        </el-form-item>
        <el-form-item label="渠道">
          <div class="channel-options">
            <el-checkbox v-model="appForm.channelSession">💬 会话（应用内对话）</el-checkbox>
            <el-checkbox v-model="appForm.channelShare">🔗 分享（免登录链接）</el-checkbox>
            <el-checkbox v-model="appForm.channelApi">🔌 API（外部调用）</el-checkbox>
          </div>
          <p class="app-hint">一个工作流对应一个应用；发布后可在应用列表直接启动，或到详情页调整渠道</p>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAppPublish = false">取消</el-button>
        <el-button type="primary" :loading="appPublishing" @click="doAppPublish">
          {{ appPublishMode === 'edit' ? '保存配置' : '发布应用' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'WorkflowEditor' })
import { ref, reactive, computed, onMounted, onUnmounted, provide, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Close } from '@element-plus/icons-vue'
import { VueFlow, Handle, Position, MarkerType, useVueFlow } from '@vue-flow/core'
import type { Node, Edge, Connection } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'
import { NODE_TYPE_CATALOG, NODE_TYPE_CATALOG_MAP } from '@shared/types/workflow-node-catalog'
import { WORKFLOW_EDGE_KINDS } from '@shared/types/workflow.types'
import type { WorkflowGraph, WorkflowNodeType, WorkflowEdgeKind } from '@shared/types/workflow.types'
import NodeConfigPanel from '@/components/workflow/NodeConfigPanel.vue'
import RunInputForm from '@/components/workflow/RunInputForm.vue'
import { useWorkflowStore } from '@/stores/workflow'
import { computeHighlight, EDGE_HIGHLIGHT_STYLE } from '@/utils/workflow-editor-highlight'
import type { HighlightSelection } from '@/utils/workflow-editor-highlight'

const route = useRoute()
const router = useRouter()
const definition = ref<any>(null)
const nodes = ref<Node[]>([])
const edges = ref<Edge[]>([])
const selectedNode = ref<Node | null>(null)
const dragType = ref<WorkflowNodeType | ''>('')
const paletteSearch = ref('')
const saving = ref(false)
const validation = ref<{ valid: boolean; errors: string[]; warnings: string[] } | null>(null)

const api = () => (window as never as { electronAPI: any }).electronAPI.workflow

/** 变量选择器数据源：画布节点（响应式转发给配置面板） */
const canvasNodesRef = ref<any[]>([])
watch(nodes, (list: any) => { canvasNodesRef.value = list }, { immediate: true, deep: true })
provide('wfCanvasNodes', canvasNodesRef)

/** 变量选择器上游过滤数据源：画布边 */
const canvasEdgesRef = ref<any[]>([])
watch(edges, (list: any) => { canvasEdgesRef.value = list }, { immediate: true, deep: true })
provide('wfCanvasEdges', canvasEdgesRef)

/** 屏幕坐标 → 画布流坐标（拖放落点精确） */
const { screenToFlowCoordinate, setNodes, setEdges, toObject, fromObject } = useVueFlow()

// ==================== 撤销 / 重做（历史栈快照） ====================

/** 历史快照：{ nodes, edges } 深拷贝 */
interface EditorSnapshot { nodes: Node[]; edges: Edge[] }
const undoStack = ref<EditorSnapshot[]>([])
const redoStack = ref<EditorSnapshot[]>([])
const canUndo = computed(() => undoStack.value.length > 0)
const canRedo = computed(() => redoStack.value.length > 0)

function snapshot(): EditorSnapshot {
  return { nodes: JSON.parse(JSON.stringify(nodes.value)), edges: JSON.parse(JSON.stringify(edges.value)) }
}
/** 变更前调用：当前状态入撤销栈（清空重做栈） */
function pushUndo(): void {
  undoStack.value.push(snapshot())
  if (undoStack.value.length > 50) undoStack.value.shift() // 上限防膨胀
  redoStack.value = []
}
function applySnap(s: EditorSnapshot): void {
  nodes.value = s.nodes
  edges.value = s.edges
  setNodes(s.nodes)
  // 快照经 JSON 深拷贝会丢弃 undefined 的 handle 键；Vue Flow parseEdge 用 Object.assign(existingEdge, edge)
  // 合并时会用现有边补全缺失键 → 撤销后锚点残留。显式补回 undefined 键强制覆盖
  setEdges(s.edges.map(e => ({ ...e, sourceHandle: e.sourceHandle ?? undefined, targetHandle: e.targetHandle ?? undefined })))
  selectedNode.value = null
  selectedEdge.value = null
  syncHighlight() // 快照里的边样式可能含高亮，按当前（空）选中重置
}
function undo(): void {
  const cur = snapshot()
  const prev = undoStack.value.pop()
  if (!prev) return
  redoStack.value.push(cur)
  applySnap(prev)
}
function redo(): void {
  const cur = snapshot()
  const next = redoStack.value.pop()
  if (!next) return
  undoStack.value.push(cur)
  applySnap(next)
}
// Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y 快捷键
function onKeydown(e: KeyboardEvent): void {
  if (!(e.ctrlKey || e.metaKey)) return
  const k = e.key.toLowerCase()
  if (k === 'z' && e.shiftKey) { e.preventDefault(); redo() }
  else if (k === 'z') { e.preventDefault(); undo() }
  else if (k === 'y') { e.preventDefault(); redo() }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  // 取消实时事件订阅（subscribe 幂等 + 卸载清理，避免监听器累积）
  wfStore.unsubscribeAll()
})

// ==================== 连线编辑（选中/删除/改文字） ====================

/** 选中的边（null=无）；选中边时隐藏节点面板 */
const selectedEdge = ref<{ id: string; kind: WorkflowEdgeKind; branchId?: string; source: string; target: string } | null>(null)
/** 边文字输入（label override） */
const selectedEdgeLabel = ref('')

function onEdgeClick({ edge }: { edge: Edge }): void {
  const d = (edge.data ?? {}) as { kind?: WorkflowEdgeKind; branchId?: string; label?: string }
  selectedEdge.value = {
    id: edge.id,
    kind: d.kind ?? WORKFLOW_EDGE_KINDS.normal,
    branchId: d.branchId,
    source: edge.source,
    target: edge.target,
  }
  selectedNode.value = null
  // 自定义 label 优先；否则恢复默认
  selectedEdgeLabel.value = d.label ?? ''
}

function edgeKindLabel(kind: WorkflowEdgeKind): string {
  return { fail: '失败', approve: '批准', reject: '驳回', 'loop-body': '循环体', 'loop-done': '完成', 'loop-back': '回边', branch: '分支', normal: '正常' }[kind] ?? kind
}
function edgeKindColor(kind: WorkflowEdgeKind): string {
  return { fail: '#ef4444', approve: '#10b981', reject: '#f59e0b', 'loop-body': '#8b5cf6', 'loop-done': '#6366f1', branch: '#0ea5e9', normal: '#909399' }[kind] ?? '#909399'
}
function edgeNodeName(id: string): string {
  return (findNode(id)?.data as { label?: string })?.label ?? id
}
/** 保存自定义边文字（写入 edge.data.label；空则恢复默认） */
function saveEdgeLabel(): void {
  if (!selectedEdge.value) return
  pushUndo()
  const id = selectedEdge.value.id
  edges.value = edges.value.map(e => {
    if (e.id !== id) return e
    const d = { ...((e.data ?? {}) as Record<string, unknown>), label: selectedEdgeLabel.value.trim() || undefined }
    const label = selectedEdgeLabel.value.trim() || edgeLabel((d.kind as WorkflowEdgeKind) ?? WORKFLOW_EDGE_KINDS.normal, d.branchId as string | undefined)
    return { ...e, label, data: d }
  })
}
function deleteSelectedEdge(): void {
  if (!selectedEdge.value) return
  pushUndo()
  const id = selectedEdge.value.id
  edges.value = edges.value.filter(e => e.id !== id)
  selectedEdge.value = null
}

// ==================== 选中高亮（节点 ⇄ 相关连线 ⇄ 相邻节点） ====================

/** 高亮集合（纯函数计算：选中节点 → 相连边+另一端节点；选中边 → 自身+两端节点） */
const highlightedNodeIds = ref<Set<string>>(new Set())
const highlightedEdgeIds = ref<Set<string>>(new Set())

/** 根据当前选中计算高亮集合，并把高亮描边同步到边对象（取消选中时恢复类型色） */
function syncHighlight(): void {
  const sel: HighlightSelection = selectedNode.value
    ? { kind: 'node', nodeId: selectedNode.value.id }
    : selectedEdge.value
      ? { kind: 'edge', edgeId: selectedEdge.value.id, source: selectedEdge.value.source, target: selectedEdge.value.target }
      : null
  const r = computeHighlight(sel, edges.value)
  highlightedNodeIds.value = new Set(r.nodeIds)
  highlightedEdgeIds.value = new Set(r.edgeIds)
  // 高亮样式直接写入 edge.style（不进撤销快照语义：快照取交互前状态，applySnap 后会按选中重置）
  edges.value = edges.value.map(e => {
    const d = (e.data ?? {}) as { kind?: WorkflowEdgeKind }
    const base = edgeStyle(d.kind ?? WORKFLOW_EDGE_KINDS.normal)
    const st = highlightedEdgeIds.value.has(e.id) ? EDGE_HIGHLIGHT_STYLE : base
    const cur = (e.style ?? {}) as Record<string, string | number | undefined>
    if ((cur.stroke ?? undefined) === (st.stroke ?? undefined) && (cur.strokeWidth ?? undefined) === (st.strokeWidth ?? undefined)) return e
    return { ...e, style: st }
  })
}
watch([selectedNode, selectedEdge], () => syncHighlight())

/** 拖拽连线端点重连到新锚点：保留 id/类型/文字等属性，只更新头尾节点与锚点 */
function onEdgeUpdate({ edge, connection }: { edge: Edge; connection: Connection }): void {
  if (!connection.source || !connection.target) return
  pushUndo()
  // 直接更新 v-model 边数组（唯一数据源：撤销快照/保存草稿都读它），再同步 Vue Flow 内部 store
  edges.value = edges.value.map(e =>
    e.id === edge.id
      ? { ...e, source: connection.source, target: connection.target, sourceHandle: connection.sourceHandle ?? undefined, targetHandle: connection.targetHandle ?? undefined }
      : e,
  )
  setEdges(edges.value)
  // 若正在编辑这条边的属性，刷新来源显示
  if (selectedEdge.value?.id === edge.id) {
    selectedEdge.value = { ...selectedEdge.value, source: connection.source, target: connection.target }
  }
  syncHighlight()
}

/** 分类 → 展示（颜色 / 图标字符） */
const CATEGORY_META: Record<string, { label: string; icon: string }> = {
  flow: { label: '流程控制', icon: '⎇' },
  ai: { label: 'AI 能力', icon: '✦' },
  general: { label: '通用', icon: '⚙' },
}
const ICONS: Record<string, string> = { flow: '⎇', ai: '✦', general: '⚙' }

const paletteGroups = computed(() => {
  const kw = paletteSearch.value.trim().toLowerCase()
  return (['flow', 'ai', 'general'] as const)
    .map(cat => ({
      category: cat,
      label: CATEGORY_META[cat].label,
      items: NODE_TYPE_CATALOG.filter(e =>
        e.category === cat &&
        (!kw || e.label.toLowerCase().includes(kw) || e.type.includes(kw) || e.description.toLowerCase().includes(kw))
      ),
    }))
    .filter(g => g.items.length > 0)
})

// ── 节点摘要（画布卡片上的一行配置提示） ──
const SUMMARY_FIELD: Partial<Record<WorkflowNodeType, string>> = {
  'llm-chat': 'prompt', 'kb-retrieve': 'query', 'kb-ingest': 'title', 'web-search': 'query',
  translate: 'text', 'image-gen': 'prompt', tts: 'text', stt: 'audio', delay: 'durationMs',
  'http-request': 'url', 'app-notify': 'title', loop: 'listExpression', 'human-review': 'payload',
  assign: '',
  'template-transform': 'template', 'parameter-extractor': 'input', 'web-extract': 'url',
  'video-extract-audio': 'videoPath',
}
function summaryOf(type: WorkflowNodeType, config: Record<string, unknown>): string {
  const key = SUMMARY_FIELD[type]
  if (!key) return ''
  const v = config?.[key]
  if (v === undefined || v === null || v === '') return ''
  return String(v).slice(0, 22)
}

// ── 试运行（B5）──
const showDebug = ref(false)
const debugInputRef = ref<any>(null)
const debugValid = ref(true)
const debugStarting = ref(false)
const debugRunId = ref('')
const debugStatus = ref('')
const wfStore = useWorkflowStore()

const debugInputs = computed(() => {
  const startNode = nodes.value.find(n => (n.data as any)?.wfNode?.type === 'start')
  return (startNode?.data as any)?.wfNode?.config?.inputs ?? []
})

async function debugRun() {
  const inputs = debugInputRef.value?.getValues() ?? {}
  if (!debugValid.value) { ElMessage.warning('请填写必填参数'); return }
  await saveDraftSilent()
  debugStarting.value = true
  try {
    const resp = api().startRun({ definitionId: definition.value.id, inputs })
    const respR = await resp
    if (respR.success) {
      debugRunId.value = respR.data.id
      debugStatus.value = respR.data.status ?? 'running'
      ElMessage.success(respR.data.status === 'skipped' ? '已有运行中实例' : '已启动，画布实时显示进度')
    } else ElMessage.error(respR.error)
  } finally { debugStarting.value = false }
}

// ── 加载 / 序列化 ──
onMounted(async () => {
  wfStore.subscribe()
  const resp = await api().getDefinition(route.params.id as string)
  if (!resp.success || !resp.data) { ElMessage.error(resp.error ?? '加载失败'); return }
  definition.value = resp.data
  shareToken.value = resp.data.shareToken ?? null
  if (resp.data.draftGraph) loadGraph(resp.data.draftGraph)
})

function loadGraph(graph: WorkflowGraph) {
  nodes.value = graph.nodes.map(n => ({
    id: n.id,
    type: 'wf',
    position: { x: n.position.x, y: n.position.y },
    data: {
      label: n.name,
      category: NODE_TYPE_CATALOG_MAP[n.type]?.category ?? 'general',
      summary: summaryOf(n.type, n.config),
      wfNode: n,
    },
  }))
  edges.value = graph.edges.map(e => ({
    id: e.id,
    source: e.sourceNodeId,
    target: e.targetNodeId,
    sourceHandle: e.sourceHandle,
    targetHandle: e.targetHandle,
    label: edgeLabel(e.kind, e.branchId),
    animated: e.kind !== WORKFLOW_EDGE_KINDS.normal,
    data: { kind: e.kind, branchId: e.branchId },
    style: edgeStyle(e.kind),
  }))
}

function edgeLabel(kind: WorkflowEdgeKind, branchId?: string): string {
  if (kind === WORKFLOW_EDGE_KINDS.branch) return branchId ?? ''
  if (kind === WORKFLOW_EDGE_KINDS.normal) return ''
  return { fail: '失败', approve: '批准', reject: '驳回', 'loop-body': '循环体', 'loop-done': '完成', 'loop-back': '回边' }[kind] ?? kind
}
function edgeStyle(kind: WorkflowEdgeKind): Record<string, string> {
  const colors: Partial<Record<WorkflowEdgeKind, string>> = {
    fail: '#ef4444', approve: '#10b981', reject: '#f59e0b',
    'loop-body': '#8b5cf6', 'loop-done': '#6366f1', branch: '#0ea5e9',
  }
  const color = colors[kind]
  return color ? { stroke: color, strokeWidth: 2 } : {}
}

/** 导出为引擎 WorkflowGraph（位置从画布节点实时读取） */
function toGraph(): WorkflowGraph {
  return {
    version: 1,
    nodes: nodes.value.map(vf => {
      const wfNode = JSON.parse(JSON.stringify((vf.data as any).wfNode))
      wfNode.position = { x: Math.round(vf.position.x), y: Math.round(vf.position.y) }
      // name 由配置面板表单直接维护（NodeConfigPanel v-model="wfNode.name"），
      // 不再从画布 label 反解——label 是"类型: 名称"显示串，名称含 ": " 会被
      // split(': ').slice(1) 截断丢字（如"步骤1: 生成"保存后变"生成"）
      return wfNode
    }),
    edges: edges.value.map(e => {
      const d = (e.data ?? {}) as { kind?: WorkflowEdgeKind; branchId?: string }
      return {
        id: e.id,
        sourceNodeId: e.source,
        targetNodeId: e.target,
        kind: d.kind ?? WORKFLOW_EDGE_KINDS.normal,
        ...(d.branchId ? { branchId: d.branchId } : {}),
        ...(e.sourceHandle ? { sourceHandle: e.sourceHandle } : {}),
        ...(e.targetHandle ? { targetHandle: e.targetHandle } : {}),
      }
    }),
  }
}

async function saveDraft() {
  saving.value = true
  try {
    const resp = await api().saveDraft(definition.value.id, toGraph())
    if (resp.success) ElMessage.success('草稿已保存')
    else ElMessage.error(resp.error)
  } finally { saving.value = false }
}

/** 校验图：失败（IPC 报错/网络异常）时明确提示并返回 false，不再让 undefined 崩溃发布流程 */
async function doValidate(): Promise<boolean> {
  await saveDraftSilent()
  try {
    const resp = await api().validateGraph(toGraph())
    if (!resp.success) {
      validation.value = null
      ElMessage.error(resp.error ?? '校验请求失败')
      return false
    }
    validation.value = resp.data
    if (!resp.data.valid) ElMessage.warning(`校验未通过：${resp.data.errors.slice(0, 3).join('；')}`)
    else ElMessage.success('校验通过')
    return true
  } catch (e: any) {
    validation.value = null
    ElMessage.error(`校验请求失败：${e?.message ?? String(e)}`)
    return false
  }
}
async function saveDraftSilent() {
  await api().saveDraft(definition.value.id, toGraph()).catch(() => {})
}

async function doPublish() {
  if (!(await doValidate())) return
  if (validation.value && !validation.value.valid) return
  await ElMessageBox.confirm(`发布「${definition.value.name}」为 v${(definition.value.publishedVersion ?? 0) + 1}？发布后定时/事件触发生效。`, '发布')
  const resp = await api().publishDefinition({ id: definition.value.id })
  if (resp.success) { ElMessage.success('已发布'); definition.value.publishedVersion = (definition.value.publishedVersion ?? 0) + 1 }
  else ElMessage.error(resp.error)
}

// ── 分享（C3 免登录独立页；仅 Web 端生效，PC 端提示） ──
const shareToken = ref<string | null>(null)
const shareLoading = ref(false)

async function openShare() {
  if (!definition.value) return
  if ((window as unknown as { __APP_PLATFORM__?: string }).__APP_PLATFORM__ !== 'web') {
    ElMessage.info('分享为 Web 端功能：请部署 Web 服务后使用')
    return
  }
  shareLoading.value = true
  try {
    if (!shareToken.value) {
      const resp = await api().enableShare({ id: definition.value.id })
      if (!resp.success) { ElMessage.error(resp.error); return }
      shareToken.value = resp.data?.shareToken ?? null
    }
    if (!shareToken.value) { ElMessage.error('分享令牌生成失败'); return }
    const link = `${window.location.origin}/#/workflow-run/${shareToken.value}`
    try {
      await ElMessageBox.alert(link, '分享链接（任何人都可运行）', {
        confirmButtonText: '复制链接',
        distinguishCancelAndClose: true,
        cancelButtonText: '停止分享',
      })
      await navigator.clipboard.writeText(link)
      ElMessage.success('链接已复制')
    } catch (action) {
      if (action === 'cancel') {
        const resp = await api().disableShare({ id: definition.value.id })
        if (resp.success) { shareToken.value = null; ElMessage.success('已停止分享') }
        else ElMessage.error(resp.error)
      }
    }
  } finally {
    shareLoading.value = false
  }
}

// ── 发布为应用（P0：发布入口迁移到工作流编辑器，发布即配置渠道） ──
const showAppPublish = ref(false)
const appPublishing = ref(false)
const appPublishMode = ref<'create' | 'edit'>('create')
const appForm = reactive({ name: '', icon: '', channelSession: true, channelShare: false, channelApi: true })

async function openAppPublish() {
  if (!definition.value) return
  if ((definition.value.publishedVersion ?? 0) <= 0) {
    ElMessage.warning('请先「发布」工作流，再发布为应用')
    return
  }
  const appApi = (window as never as { electronAPI: { app: any } }).electronAPI.app
  const existing = await appApi.getByDefinition(definition.value.id)
  if (existing.success && existing.data) {
    // 已发布过 → 编辑模式（预填现有配置；保存=幂等更新渠道/名称）
    appPublishMode.value = 'edit'
    appForm.name = existing.data.name ?? ''
    appForm.icon = existing.data.icon ?? ''
    appForm.channelSession = existing.data.channelSession === 1
    appForm.channelShare = existing.data.channelShare === 1
    appForm.channelApi = existing.data.channelApi === 1
  } else {
    appPublishMode.value = 'create'
    appForm.name = definition.value.name ?? ''
    appForm.icon = ''
    appForm.channelSession = true
    appForm.channelShare = false
    appForm.channelApi = true
  }
  showAppPublish.value = true
}

async function doAppPublish() {
  if (!definition.value) return
  appPublishing.value = true
  try {
    const appApi = (window as never as { electronAPI: { app: any } }).electronAPI.app
    const resp = await appApi.createFromWorkflow({
      definitionId: definition.value.id,
      name: appForm.name.trim() || undefined,
      icon: appForm.icon.trim() || undefined,
      channelSession: appForm.channelSession,
      channelShare: appForm.channelShare,
      channelApi: appForm.channelApi,
    })
    if (resp.success) {
      ElMessage.success(appPublishMode.value === 'edit' ? '应用配置已更新' : '应用已发布')
      showAppPublish.value = false
      router.push(`/apps/${resp.data?.id}`)
    } else ElMessage.error(resp.error ?? '发布失败')
  } finally {
    appPublishing.value = false
  }
}

// ── 画布交互 ──
function addNode(type: WorkflowNodeType, pos?: { x: number; y: number }) {
  pushUndo()
  const catalog = NODE_TYPE_CATALOG_MAP[type]
  const id = `${type.replace(/-/g, '_')}_${Date.now().toString(36)}`
  const config = JSON.parse(JSON.stringify(catalog.defaultConfig))
  nodes.value.push({
    id, type: 'wf',
    position: pos ?? { x: 160 + Math.random() * 240, y: 140 + Math.random() * 160 },
    data: { label: catalog.label, category: catalog.category, summary: summaryOf(type, config), wfNode: { id, type, name: catalog.label, position: { x: 0, y: 0 }, config } },
  })
}

function onDrop(e: DragEvent) {
  if (!dragType.value) return
  const pos = screenToFlowCoordinate({ x: e.clientX, y: e.clientY })
  addNode(dragType.value, { x: pos.x, y: pos.y })
  dragType.value = ''
}

/** 试运行实时状态 → 节点着色 class（store key 为 `${nodeId}:${iteration}`，按前缀匹配） */
function nodeRunState(nodeId: string): string {
  if (!debugRunId.value) return ''
  const m = wfStore.nodeStatusMap.get(debugRunId.value)
  if (!m) return ''
  let latest = ''
  for (const [key, st] of m) {
    if (!key.startsWith(`${nodeId}:`)) continue
    latest = st.status
  }
  return latest ? `run-${latest}` : ''
}

function findNode(id: string) { return nodes.value.find(n => n.id === id) ?? null }

/** 选中节点（清除边选中） */
function selectNode(id: string): void {
  selectedEdge.value = null
  selectedNode.value = findNode(id)
}

/** 关闭配置面板（清空选中） */
function closeConfigPanel(): void {
  selectedNode.value = null
  selectedEdge.value = null
}

/** 智能语义连线：按源节点类型弹出连线类型选择 */
async function onConnect(conn: Connection) {
  const source = findNode(conn.source)
  const wfNode = (source?.data as any)?.wfNode
  const sourceType = wfNode?.type as WorkflowNodeType | undefined

  let kind: WorkflowEdgeKind = WORKFLOW_EDGE_KINDS.normal
  let branchId: string | undefined

  if (sourceType === 'condition') {
    const branches = (wfNode.config?.branches ?? []) as Array<{ branchId: string; label: string }>
    if (branches.length === 0) { ElMessage.warning('请先在条件节点中配置分支'); return }
    const { value } = await ElMessageBox.prompt(
      `选择分支（输入序号）：\n${branches.map((b, i) => `${i + 1}. ${b.label || b.branchId}`).join('\n')}`,
      '条件分支连线', { inputValue: '1' }
    )
    const picked = branches[Number(value) - 1]
    if (!picked) { ElMessage.error('无效序号'); return }
    kind = WORKFLOW_EDGE_KINDS.branch
    branchId = picked.branchId
  } else if (sourceType === 'human-review') {
    const isApprove = await ElMessageBox.confirm('这条连线是"批准"路径吗？（否 = 驳回路径）', '审核连线', { type: 'info' }).then(() => true).catch(() => false)
    kind = isApprove ? WORKFLOW_EDGE_KINDS.approve : WORKFLOW_EDGE_KINDS.reject
  } else if (sourceType === 'loop') {
    const isBody = await ElMessageBox.confirm('这条连线指向循环体吗？（否 = 完成出口）', '循环连线', { type: 'info' }).then(() => true).catch(() => false)
    kind = isBody ? WORKFLOW_EDGE_KINDS['loop-body'] : WORKFLOW_EDGE_KINDS['loop-done']
  } else if (sourceType && sourceType !== 'parallel' && sourceType !== 'start') {
    // 任务节点：可选失败分支
    const isFail = await ElMessageBox.confirm(
      '连线类型：确定 = 正常流转；取消 = 失败分支（重试耗尽后走此线）', '连线类型', {
        confirmButtonText: '正常', cancelButtonText: '失败分支', type: 'info',
      }
    ).then(() => false).catch(() => true)
    if (isFail) kind = WORKFLOW_EDGE_KINDS.fail
  }

  edges.value.push({
    id: `e_${Date.now().toString(36)}`,
    source: conn.source, target: conn.target,
    sourceHandle: conn.sourceHandle ?? undefined,
    targetHandle: conn.targetHandle ?? undefined,
    label: edgeLabel(kind, branchId),
    animated: kind !== WORKFLOW_EDGE_KINDS.normal,
    data: { kind, ...(branchId ? { branchId } : {}) },
    style: edgeStyle(kind),
  })
  pushUndo()
}

/** 一键整理：分层拓扑布局（同层纵向排列，层间横向推进；环/孤岛回退兜底） */
function autoLayout(): void {
  if (nodes.value.length === 0) return
  pushUndo()
  const NODE_W = 200, NODE_H = 64, H_GAP = 60, V_GAP = 24
  const X0 = 60, Y0 = 60
  // 邻接表（normal/branch/approve/reject/loop-done/fail 都算流向；loop-back 除外）
  const outgoing = new Map<string, string[]>()
  const incoming = new Map<string, string[]>()
  for (const node of nodes.value) {
    outgoing.set(node.id, [])
    incoming.set(node.id, [])
  }
  for (const e of edges.value) {
    const kind = (e.data as { kind?: string })?.kind
    if (kind === 'loop-back') continue // 回边不参与分层（防环）
    outgoing.get(e.source)?.push(e.target)
    incoming.get(e.target)?.push(e.source)
  }
  // Kahn 分层：level[i] = 最长路径深度；有环节点（入度未清零）归最后一层
  const indeg = new Map<string, number>()
  for (const [id, ins] of incoming) indeg.set(id, ins.length)
  const queue: string[] = nodes.value.filter(n => (indeg.get(n.id) ?? 0) === 0).map(n => n.id)
  const level = new Map<string, number>()
  for (const n of nodes.value) level.set(n.id, 0)
  let processed = 0
  while (queue.length) {
    const id = queue.shift()!
    processed++
    for (const t of outgoing.get(id) ?? []) {
      level.set(t, Math.max(level.get(t) ?? 0, (level.get(id) ?? 0) + 1))
      indeg.set(t, (indeg.get(t) ?? 1) - 1)
      if ((indeg.get(t) ?? 0) === 0) queue.push(t)
    }
  }
  // 环内节点：归入最深层
  if (processed < nodes.value.length) {
    const maxLv = Math.max(...[...level.values()], 0)
    for (const n of nodes.value) {
      if (!level.has(n.id) || (indeg.get(n.id) ?? 0) > 0) level.set(n.id, maxLv + 1)
    }
  }
  // 按层分组 → 同层纵向排列（居中）
  const byLevel = new Map<number, string[]>()
  for (const n of nodes.value) {
    const lv = level.get(n.id) ?? 0
    const list = byLevel.get(lv) ?? []
    list.push(n.id)
    byLevel.set(lv, list)
  }
  const maxInLevel = Math.max(...[...byLevel.values()].map(l => l.length), 1)
  const update: Record<string, { x: number; y: number }> = {}
  for (const [lv, ids] of [...byLevel.entries()].sort((a, b) => a[0] - b[0])) {
    const x = X0 + lv * (NODE_W + H_GAP)
    const startY = Y0 + (maxInLevel - ids.length) * ((NODE_H + V_GAP) / 2)
    ids.forEach((id, i) => {
      update[id] = { x, y: startY + i * (NODE_H + V_GAP) }
    })
  }
  nodes.value = nodes.value.map(n => ({ ...n, position: update[n.id] ?? n.position }))
  // 同步 Vue Flow 内部节点（v-model 有时不触发画布重排，用官方 setNodes 确保生效）
  setNodes(nodes.value)
  ElMessage.success('已整理布局')
}

function onConfigChanged() {
  if (!selectedNode.value) return
  pushUndo()
  const wf = (selectedNode.value.data as any).wfNode
  ;(selectedNode.value.data as any).summary = summaryOf(wf.type, wf.config)
}

function removeSelected() {
  if (!selectedNode.value) return
  pushUndo()
  const id = selectedNode.value.id
  nodes.value = nodes.value.filter(n => n.id !== id)
  edges.value = edges.value.filter(e => e.source !== id && e.target !== id)
  selectedNode.value = null
}
</script>

<style scoped>
.wf-editor { height: 100%; display: flex; flex-direction: column; background: var(--el-bg); }
.toolbar { display: flex; align-items: center; gap: 10px; padding: 8px 14px; border-bottom: 1px solid var(--el-border-color); }
.title { font-weight: 600; }
.spacer { flex: 1; }
.val-error { color: var(--el-color-danger); font-size: 12px; max-width: 380px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.val-warn { color: var(--el-color-warning); font-size: 12px; }
.body { flex: 1; display: flex; min-height: 0; }

.palette { width: 210px; border-right: 1px solid var(--el-border-color); padding: 12px 10px; display: flex; flex-direction: column; background: var(--el-fill-color-light); }
.palette-title { font-size: 13px; font-weight: 600; margin-bottom: 10px; }
.palette-list { flex: 1; overflow: auto; padding-right: 2px; }
.palette-group { font-size: 11px; font-weight: 600; color: var(--el-text-color-secondary); margin: 12px 0 6px; letter-spacing: .03em; }
.palette-item { display: flex; gap: 8px; align-items: center; padding: 8px 9px; border: 1px solid var(--el-border-color-lighter); border-radius: 8px; margin-bottom: 6px; cursor: grab; background: #fff; transition: border-color .15s, box-shadow .15s; }
.palette-item:hover { border-color: var(--el-color-primary); box-shadow: 0 2px 8px rgba(0,0,0,.06); }
.palette-item:active { cursor: grabbing; }
.pi-icon { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 7px; flex-shrink: 0; background: var(--el-fill-color); }
.pi-icon.flow { color: #6366f1; background: rgba(99,102,241,.1); } .pi-icon.ai { color: #10b981; background: rgba(16,185,129,.1); } .pi-icon.general { color: #f59e0b; background: rgba(245,158,11,.1); }
.pi-text { font-size: 13px; font-weight: 600; line-height: 1.3; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.canvas { flex: 1; position: relative; background: #fafafa; }
.config-area { width: 400px; border-left: 1px solid var(--el-border-color); background: var(--el-bg-color); display: flex; flex-direction: column; }
.config-area-head { display: flex; align-items: center; justify-content: space-between; padding: 6px 10px 6px 14px; border-bottom: 1px solid var(--el-border-color-lighter); }
.config-area-title { font-size: 12px; font-weight: 600; color: var(--el-text-color-secondary); }
.config-empty { height: 100%; display: flex; align-items: center; justify-content: center; color: var(--el-text-color-placeholder); text-align: center; line-height: 1.8; }

/* 连线编辑面板 */
.edge-panel { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.edge-panel-title { font-size: 14px; font-weight: 600; }
.edge-field { display: flex; flex-direction: column; gap: 4px; }
.edge-field.edge-src { font-size: 12px; }
.edge-label { font-size: 12px; font-weight: 600; color: var(--el-text-color-secondary); }
.edge-kind-tag { align-self: flex-start; }
.edge-src-text { color: var(--el-text-color-regular); font-size: 12px; word-break: break-all; }

/* ── 自定义节点卡片 ── */
.wf-node { min-width: 150px; max-width: 210px; background: #fff; border: 2px solid #d1d5db; border-radius: 10px; padding: 0; box-shadow: 0 1px 3px rgba(0,0,0,.08); font-size: 13px; transition: box-shadow .15s; }
.wf-node:hover { box-shadow: 0 4px 14px rgba(0,0,0,.12); }
.wf-node.selected { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,.18); }
/* 关联高亮：选中节点时其相连的边/另一端节点；选中边时两端的节点 */
.wf-node.hl { border-color: #f59e0b; box-shadow: 0 0 0 3px rgba(245,158,11,.22); }
.wf-node.flow { border-color: #6366f1; } .wf-node.ai { border-color: #10b981; } .wf-node.general { border-color: #f59e0b; }
.wf-node-head { display: flex; align-items: center; gap: 6px; padding: 7px 10px; font-weight: 600; }
.wf-node.flow .wf-node-head { color: #4f46e5; } .wf-node.ai .wf-node-head { color: #059669; } .wf-node.general .wf-node-head { color: #d97706; }
/* 试运行状态着色（B5） */
.wf-node.run-running { border-color: #3b82f6 !important; box-shadow: 0 0 0 3px rgba(59,130,246,.2); }
.wf-node.run-succeeded { border-color: #10b981 !important; }
.wf-node.run-failed, .wf-node.run-timed_out { border-color: #ef4444 !important; }
.wf-node.run-failed_recovered { border-color: #f59e0b !important; }
.wf-node.run-waiting_review { border-color: #8b5cf6 !important; }
.wf-node.run-cancelled, .wf-node.run-skipped { opacity: .55; }
.debug-panel { padding: 4px 6px; }
.debug-status { display: flex; align-items: center; gap: 10px; margin-top: 12px; }
.debug-hint { font-size: 11px; color: var(--el-text-color-placeholder); margin-top: 12px; line-height: 1.5; }
.channel-options { display: flex; flex-direction: column; gap: 8px; }
.app-hint { font-size: 12px; color: var(--el-text-color-secondary); margin: 8px 0 0; line-height: 1.5; }

.wf-node-summary { padding: 0 10px 7px; font-size: 11px; color: #6b7280; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
