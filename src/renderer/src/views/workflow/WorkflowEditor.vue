<template>
  <div class="wf-editor">
    <!-- 顶栏 -->
    <div class="toolbar">
      <span class="title">{{ definition?.name ?? '编辑器' }}</span>
      <span v-if="validation && !validation.valid" class="val-error">{{ validation.errors[0] }}</span>
      <span v-else-if="validation?.warnings.length" class="val-warn">{{ validation.warnings.length }} 条警告</span>
      <div class="spacer" />
      <el-button size="small" @click="saveDraft" :loading="saving">保存草稿</el-button>
      <el-button size="small" @click="doValidate">校验</el-button>
      <el-button size="small" type="primary" @click="doPublish">发布</el-button>
    </div>

    <div class="body">
      <!-- 节点面板 -->
      <div class="palette">
        <div v-for="group in paletteGroups" :key="group.category" class="palette-group">
          <div class="group-title">{{ group.category === 'flow' ? '流程控制' : group.category === 'ai' ? 'AI 能力' : '通用' }}</div>
          <div
            v-for="entry in group.items"
            :key="entry.type"
            class="palette-item"
            draggable="true"
            @dragstart="dragType = entry.type"
            @click="addNode(entry.type)"
          >{{ entry.label }}</div>
        </div>
      </div>

      <!-- 画布 -->
      <div class="canvas" @drop="onDrop" @dragover.prevent @dragenter.prevent>
        <VueFlow :nodes="nodes" :edges="edges" @nodesChange="onNodesChange" @edgesChange="onEdgesChange" @connect="onConnect" fit-view-on-init>
          <Background />
          <Controls />
          <MiniMap />
        </VueFlow>
      </div>

      <!-- 配置面板 -->
      <div class="config" v-if="selectedNode">
        <div class="config-title">节点配置</div>
        <el-form label-position="top" size="small">
          <el-form-item label="名称">
            <el-input v-model="selectedNode.name" @change="syncSelected" />
          </el-form-item>
          <el-form-item label="配置 JSON">
            <el-input v-model="configJson" type="textarea" :rows="16" @change="onConfigChange" />
          </el-form-item>
        </el-form>
        <el-button size="small" type="danger" @click="removeSelected">删除节点</el-button>
      </div>
      <div class="config empty" v-else>点击节点查看配置</div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'WorkflowEditor' })
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { VueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import type { Node, Edge, NodeChange, EdgeChange, Connection } from '@vue-flow/core'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'
import { NODE_TYPE_CATALOG, NODE_TYPE_CATALOG_MAP } from '@shared/types/workflow-node-catalog'
import { decodeWorkflowHandleId } from '@shared/types/workflow.types'
import type { WorkflowGraph, WorkflowNodeType } from '@shared/types/workflow.types'

const route = useRoute()
const definition = ref<any>(null)
const nodes = ref<Node[]>([])
const edges = ref<Edge[]>([])
const selectedNode = ref<Node | null>(null)
const configJson = ref('')
const dragType = ref<WorkflowNodeType | ''>('')
const saving = ref(false)
const validation = ref<{ valid: boolean; errors: string[]; warnings: string[] } | null>(null)

const api = () => (window as never as { electronAPI: any }).electronAPI.workflow

const paletteGroups = computed(() => {
  const cats = ['flow', 'ai', 'general'] as const
  return cats.map(category => ({ category, items: NODE_TYPE_CATALOG.filter(e => e.category === category) }))
})

// ── 加载 / 保存 ──
onMounted(async () => {
  const resp = await api().getDefinition(route.params.id as string)
  if (!resp.success || !resp.data) { ElMessage.error(resp.error ?? '加载失败'); return }
  definition.value = resp.data
  if (resp.data.draftGraph) loadGraph(resp.data.draftGraph)
})

function loadGraph(graph: WorkflowGraph) {
  nodes.value = graph.nodes.map(n => ({
    id: n.id,
    type: 'default',
    position: { x: n.position.x, y: n.position.y },
    data: { label: `${NODE_TYPE_CATALOG_MAP[n.type]?.label ?? n.type}: ${n.name}`, wfNode: n },
  }))
  edges.value = graph.edges.map(e => ({
    id: e.id,
    source: e.sourceNodeId,
    target: e.targetNodeId,
    // 目标侧统一收线；源侧按 kind 编码为 handleId（无多源 handle 时 default）
    label: e.kind === 'normal' ? '' : e.kind,
    animated: e.kind !== 'normal',
  }))
}

function toGraph(): WorkflowGraph {
  return {
    version: 1,
    nodes: nodes.value.map(n => (n.data as any).wfNode as WorkflowGraph['nodes'][number]),
    edges: edges.value.map(e => {
      const wfEdge = { id: e.id, sourceNodeId: e.source, targetNodeId: e.target, kind: 'normal' as const }
      // kind 信息保存在源节点 wfNode 的 _pendingEdgeKinds（onConnect 写入）
      const kinds = edgeKindOverrides.get(e.id)
      return kinds ? { ...wfEdge, ...kinds } : wfEdge
    }),
  }
}
const edgeKindOverrides = new Map<string, { kind: any; branchId?: string }>()

async function saveDraft() {
  saving.value = true
  try {
    const resp = await api().saveDraft(definition.value.id, toGraph())
    if (resp.success) ElMessage.success('草稿已保存')
    else ElMessage.error(resp.error)
  } finally { saving.value = false }
}

async function doValidate() {
  const resp = await api().validateGraph(toGraph())
  if (resp.success) validation.value = resp.data
  if (!resp.data.valid) ElMessage.warning(`校验未通过：${resp.data.errors.slice(0, 3).join('；')}`)
  else ElMessage.success('校验通过')
}

async function doPublish() {
  await doValidate()
  if (validation.value && !validation.value.valid) return
  await ElMessageBox.confirm(`发布「${definition.value.name}」为 v${(definition.value.publishedVersion ?? 0) + 1}？`, '发布')
  const resp = await api().publishDefinition({ id: definition.value.id })
  if (resp.success) { ElMessage.success('已发布'); definition.value.publishedVersion++ }
  else ElMessage.error(resp.error)
}

// ── 画布交互 ──
function addNode(type: WorkflowNodeType, pos?: { x: number; y: number }) {
  const catalog = NODE_TYPE_CATALOG_MAP[type]
  const id = `${type}_${Date.now().toString(36)}`
  nodes.value.push({
    id,
    type: 'default',
    position: pos ?? { x: 200 + Math.random() * 200, y: 150 + Math.random() * 150 },
    data: {
      label: catalog.label,
      wfNode: {
        id, type, name: catalog.label,
        position: { x: 0, y: 0 },
        config: JSON.parse(JSON.stringify(catalog.defaultConfig)),
      },
    },
  })
}

function onDrop(e: DragEvent) {
  if (!dragType.value) return
  addNode(dagPosition(dragType.value as WorkflowNodeType), { x: e.offsetX, y: e.offsetY })
  dragType.value = ''
}
// 防拼写误用：dragType 已是类型值
const dagPosition = (t: WorkflowNodeType) => t

function onNodesChange(changes: NodeChange[]) {
  for (const c of changes) {
    if (c.type === 'position' && c.position && selectedNode.value?.id === c.id) {
      // 位置变化在导出时从 nodes 读取，wfNode.position 由 syncSelected 维护
    }
  }
  applyChanges(changes as any, nodes)
}
function onEdgesChange(changes: EdgeChange[]) {
  applyChanges(changes as any, edges)
  for (const c of changes) if (c.type === 'remove') edgeKindOverrides.delete(c.id)
}
function applyChanges(changes: any[], ref2: typeof nodes | typeof edges) {
  // VueFlow 的 applyChanges 帮助函数（v1 导出）
  // 简化：直接处理 remove/select
  for (const c of changes) {
    if (c.type === 'remove') {
      ref2.value = ref2.value.filter((n: any) => n.id !== c.id) as never
    } else if (c.type === 'select' && ref2 === nodes && c.selected) {
      selectNode(nodes.value.find(n => n.id === c.id) ?? null)
    }
  }
}
function onConnect(conn: Connection) {
  // 简化 V1：新连线默认 normal；loop/branch 语义连线由配置 JSON 手工调整 kind
  edges.value.push({ id: `e_${Date.now().toString(36)}`, source: conn.source, target: conn.target })
}

function selectNode(n: Node | null) {
  selectedNode.value = n
  if (n) configJson.value = JSON.stringify((n.data as any).wfNode.config, null, 2)
}

function syncSelected() {
  if (!selectedNode.value) return
  const wfNode = (selectedNode.value.data as any).wfNode
  wfNode.name = selectedNode.value.data ? (selectedNode.value as any).name || wfNode.name : wfNode.name
  ;(selectedNode.value.data as any).label = `${NODE_TYPE_CATALOG_MAP[wfNode.type]?.label}: ${wfNode.name}`
  wfNode.position = { ...selectedNode.value.position }
}

function onConfigChange() {
  if (!selectedNode.value) return
  try {
    const parsed = JSON.parse(configJson.value)
    ;((selectedNode.value.data as any).wfNode).config = parsed
    ElMessage.success('配置已更新')
  } catch {
    ElMessage.error('配置 JSON 无效，未保存该字段')
  }
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
.wf-editor { height: 100%; display: flex; flex-direction: column; }
.toolbar { display: flex; align-items: center; gap: 12px; padding: 10px 16px; border-bottom: 1px solid var(--el-border-color); }
.title { font-weight: 600; }
.spacer { flex: 1; }
.val-error { color: var(--el-color-danger); font-size: 12px; }
.val-warn { color: var(--el-color-warning); font-size: 12px; }
.body { flex: 1; display: flex; min-height: 0; }
.palette { width: 170px; overflow: auto; border-right: 1px solid var(--el-border-color); padding: 8px; }
.group-title { font-size: 12px; color: var(--el-text-color-secondary); margin: 8px 0 4px; }
.palette-item { padding: 6px 8px; border: 1px solid var(--el-border-color); border-radius: 4px; margin-bottom: 6px; cursor: grab; font-size: 13px; }
.palette-item:hover { border-color: var(--el-color-primary); color: var(--el-color-primary); }
.canvas { flex: 1; position: relative; }
.config { width: 300px; border-left: 1px solid var(--el-border-color); padding: 12px; overflow: auto; }
.config.empty { display: flex; align-items: center; justify-content: center; color: var(--el-text-color-secondary); }
.config-title { font-weight: 600; margin-bottom: 12px; }
</style>
