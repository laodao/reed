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
      <el-button size="small" @click="saveDraft" :loading="saving">保存草稿</el-button>
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
              <span class="pi-dot" :class="entry.category" />
              <div class="pi-text">
                <div>{{ entry.label }}</div>
                <div class="pi-desc">{{ entry.description }}</div>
              </div>
            </div>
          </template>
        </div>
      </div>

      <!-- 画布 -->
      <div class="canvas" @drop="onDrop" @dragover.prevent @dragenter.prevent>
        <VueFlow v-model:nodes="nodes" v-model:edges="edges" :default-edge-options="{ markerEnd: MarkerType.ArrowClosed }"
          @connect="onConnect" fit-view-on-init :min-zoom="0.2">
          <Background :gap="20" />
          <Controls />
          <MiniMap />

          <!-- 自定义节点 -->
          <template #node-wf="nodeProps">
            <div class="wf-node" :class="[nodeProps.data.category, nodeRunState(nodeProps.id), { selected: nodeProps.selected }]"
              @click="selectedNode = findNode(nodeProps.id)">
              <div class="wf-node-head">
                <span class="wf-node-icon">{{ ICONS[nodeProps.data.category] }}</span>
                <span class="wf-node-name">{{ nodeProps.data.label }}</span>
              </div>
              <div class="wf-node-summary">{{ nodeProps.data.summary }}</div>
              <Handle type="target" :position="Position.Left" />
              <Handle type="source" :position="Position.Right" />
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

      <!-- 配置面板 -->
      <div class="config-area">
        <NodeConfigPanel v-if="selectedNode" :node="selectedNode" @change="onConfigChanged" @remove="removeSelected" />
        <div v-else class="config-empty">
          <p>👆 点击画布中的节点<br/>在此配置参数</p>
        </div>
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
import { ref, reactive, computed, onMounted, provide, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft } from '@element-plus/icons-vue'
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

/** 屏幕坐标 → 画布流坐标（拖放落点精确） */
const { screenToFlowCoordinate } = useVueFlow()

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
      wfNode.name = (vf.data as any).label?.includes(': ')
        ? (vf.data as any).label.split(': ').slice(1).join(': ')
        : (vf.data as any).label
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

async function doValidate() {
  await saveDraftSilent()
  const resp = await api().validateGraph(toGraph())
  if (resp.success) validation.value = resp.data
  if (!resp.data.valid) ElMessage.warning(`校验未通过：${resp.data.errors.slice(0, 3).join('；')}`)
  else ElMessage.success('校验通过')
}
async function saveDraftSilent() {
  await api().saveDraft(definition.value.id, toGraph()).catch(() => {})
}

async function doPublish() {
  await doValidate()
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
    label: edgeLabel(kind, branchId),
    animated: kind !== WORKFLOW_EDGE_KINDS.normal,
    data: { kind, ...(branchId ? { branchId } : {}) },
    style: edgeStyle(kind),
  })
}

function onConfigChanged() {
  if (!selectedNode.value) return
  const wf = (selectedNode.value.data as any).wfNode
  ;(selectedNode.value.data as any).summary = summaryOf(wf.type, wf.config)
}

function removeSelected() {
  if (!selectedNode.value) return
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

.palette { width: 210px; border-right: 1px solid var(--el-border-color); padding: 10px; display: flex; flex-direction: column; }
.palette-title { font-size: 13px; font-weight: 600; margin-bottom: 8px; }
.palette-list { flex: 1; overflow: auto; }
.palette-group { font-size: 11px; color: var(--el-text-color-secondary); margin: 10px 0 4px; }
.palette-item { display: flex; gap: 8px; align-items: flex-start; padding: 6px 8px; border: 1px solid var(--el-border-color-lighter); border-radius: 6px; margin-bottom: 6px; cursor: grab; transition: border-color .15s; }
.palette-item:hover { border-color: var(--el-color-primary); }
.pi-dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 5px; flex-shrink: 0; }
.pi-dot.flow { background: #6366f1; } .pi-dot.ai { background: #10b981; } .pi-dot.general { background: #f59e0b; }
.pi-text { font-size: 13px; line-height: 1.3; }
.pi-desc { font-size: 11px; color: var(--el-text-color-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 140px; }

.canvas { flex: 1; position: relative; background: #fafafa; }
.config-area { width: 320px; border-left: 1px solid var(--el-border-color); }
.config-empty { height: 100%; display: flex; align-items: center; justify-content: center; color: var(--el-text-color-placeholder); text-align: center; line-height: 1.8; }

/* ── 自定义节点卡片 ── */
.wf-node { min-width: 150px; max-width: 210px; background: #fff; border: 2px solid #d1d5db; border-radius: 10px; padding: 0; box-shadow: 0 1px 3px rgba(0,0,0,.08); font-size: 13px; }
.wf-node.selected { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,.18); }
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
.debug-panel { padding: 0 4px; }
.debug-status { display: flex; align-items: center; gap: 10px; margin-top: 12px; }
.debug-hint { font-size: 11px; color: var(--el-text-color-placeholder); margin-top: 12px; line-height: 1.5; }
.channel-options { display: flex; flex-direction: column; gap: 8px; }
.app-hint { font-size: 12px; color: var(--el-text-color-secondary); margin: 8px 0 0; line-height: 1.5; }

.wf-node-summary { padding: 0 10px 7px; font-size: 11px; color: #6b7280; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
