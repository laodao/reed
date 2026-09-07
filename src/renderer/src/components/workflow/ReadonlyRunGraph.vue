<template>
  <div class="ro-graph">
    <!-- 图例：按执行状态着色说明 -->
    <div class="legend">
      <span class="lg-title">图例</span>
      <span class="lg-item"><span class="dot st-success"></span>已执行成功</span>
      <span class="lg-item"><span class="dot st-active"></span>执行中/等待审核</span>
      <span class="lg-item"><span class="dot st-failed"></span>失败</span>
      <span class="lg-item"><span class="dot st-pending"></span>未执行</span>
    </div>

    <!-- 画布容器：滚动平移 + 缩放 -->
    <div class="graph-body">
      <div class="zoom-ctrl">
        <el-button circle size="small" text @click="zoomOut" title="缩小">−</el-button>
        <span class="zoom-val">{{ Math.round(zoom * 100) }}%</span>
        <el-button circle size="small" text @click="zoomIn" title="放大">＋</el-button>
        <el-button size="small" text @click="fitView">适应</el-button>
      </div>

      <!-- 视口：滚轮缩放 + 空白处拖拽平移（节点/边不注册任何拖拽，仅点击看详情） -->
      <div
        ref="viewportRef"
        class="viewport"
        @wheel.prevent="onWheel"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
      >
        <div v-if="!nodeDtos.length" class="graph-empty">暂无图形数据</div>
        <div v-else class="content" :style="contentStyle">
          <!-- 连线层（SVG，位于节点下方；pointer-events:none，不可交互/不可拖动） -->
          <svg class="edges" :width="contentW" :height="contentH">
            <g v-for="e in edgeDtos" :key="e.id">
              <path :d="e.d" class="edge-path" :style="edgeStyleOf(e.kind)" />
              <text v-if="e.label" :x="e.mx" :y="e.my" class="edge-label">{{ e.label }}</text>
            </g>
          </svg>

          <!-- 节点层（绝对定位；只读：仅可点击选中，不可拖拽） -->
          <div
            v-for="n in nodeDtos"
            :key="n.id"
            class="wf-node"
            :class="[STATE_CLASS[n.state], { selected: n.id === selectedNodeId }]"
            :style="nodeStyleOf(n)"
            :title="`${n.name}（${n.typeLabel} · ${n.id}）`"
            @click.prevent.stop="onClickNode(n)"
          >
            <div class="wf-node-head">
              <span class="wf-node-icon" :class="n.category">{{ iconGlyph(n) }}</span>
              <span class="wf-node-name">{{ n.name }}</span>
            </div>
            <div class="wf-node-sub">
              <span class="wf-node-type">{{ n.typeLabel }}</span>
              <template v-if="n.executed && n.iterCount > 1">
                <span class="wf-node-iters">×{{ n.iterCount }}</span>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 只读工作流执行图（运行详情页）。
 *
 * 实现取舍：自绘轻量只读画布（SVG 连线 + 绝对定位节点 + transform translate+scale 缩放/平移），
 * 未复用 @vue-flow/core——运行详情仅需「可视 + 点击看详情」，不需要编辑器的拖拽/连线更新/
 * 撤销重做等交互，自绘可完全避免误拖拽并精确控制状态着色与聚合。
 *
 * 交互：
 *  - 滚轮缩放（0.2~2.5，指针中心锚点）；初始「适应」整体适配并居中显示全图。
 *  - 空白处按住拖拽平移画布（视口 pointer 事件；节点上不触发，避免与点击选中冲突）。
 *  - 节点/边一律不可拖动、不可编辑：节点仅绑定 click，边 SVG pointer-events:none。
 * 聚合语义：同一节点多次迭代（loop 内 iterationIndex 多条）统一为一个可视节点——任一
 * running/waiting_review → 高亮；否则任一 failed → 失败；否则全部 succeeded → 成功；
 * nodeRuns 中不存在 → 未执行（灰）。
 */
import { computed, onBeforeUnmount, onMounted, nextTick, ref, watch } from 'vue'
import { NODE_TYPE_CATALOG_MAP } from '@shared/types/workflow-node-catalog'

const props = defineProps<{
  /** WorkflowGraph 形状 { nodes:[{id,type,name,position,config}], edges:[{id,sourceNodeId,targetNodeId,kind,branchId}] } */
  graph: any
  /** 本次运行全部 nodeRuns（用于按节点聚合状态） */
  nodeRuns: any[]
  /** 当前选中节点 id（外部驱动高亮） */
  selectedNodeId?: string | null
}>()

const emit = defineEmits<{
  (e: 'node-click', payload: { nodeId: string; node: any; state: string; label: string; runs: any[]; executed: boolean }): void
}>()

// ── 尺寸常量 ──
const NODE_W = 180
const NODE_H = 64
const PAD = 30
const MIN_ZOOM = 0.2
const MAX_ZOOM = 2.5

const viewportRef = ref<HTMLElement | null>(null)
const zoom = ref(1)
// 平移（视口像素坐标）：content 以 translate(panX, panY) scale(zoom)，原点 0,0
const panX = ref(0)
const panY = ref(0)
const isPanning = ref(false)
const panStart = ref({ x: 0, y: 0, px: 0, py: 0 })

// ── 图数据解析 ──
const graphNodes = computed(() => props.graph?.nodes ?? [])
const graphEdges = computed(() => props.graph?.edges ?? [])

/** 节点坐标包围盒（用于把画布坐标统一平移到非负区域） */
const bounds = computed(() => {
  const ns = graphNodes.value
  if (!ns.length) return { minX: 0, minY: 0 }
  let minX = Infinity
  let minY = Infinity
  for (const n of ns) {
    const x = n.position?.x ?? 0
    const y = n.position?.y ?? 0
    if (x < minX) minX = x
    if (y < minY) minY = y
  }
  return { minX, minY }
})

/** 画布内容宽高（含节点尺寸与四周留白） */
const contentW = computed(() => {
  let maxX = 0
  for (const n of graphNodes.value) maxX = Math.max(maxX, (n.position?.x ?? 0))
  return Math.max(NODE_W, maxX - bounds.value.minX + NODE_W + PAD * 2)
})
const contentH = computed(() => {
  let maxY = 0
  for (const n of graphNodes.value) maxY = Math.max(maxY, (n.position?.y ?? 0))
  return Math.max(NODE_H, maxY - bounds.value.minY + NODE_H + PAD * 2)
})

// ── 节点运行状态聚合 ──
interface AggResult {
  state: string
  iterCount: number
  statuses: string[]
  executed: boolean
}
function aggregate(nodeId: string): AggResult {
  const runs = props.nodeRuns.filter(r => r.nodeId === nodeId)
  const iterCount = runs.length
  const statuses = runs.map(r => r.status)
  const hasActive = statuses.some(s => s === 'running' || s === 'waiting_review')
  const hasFailed = statuses.some(s => s === 'failed' || s === 'timed_out')
  const allSucceeded = iterCount > 0 && statuses.every(s => s === 'succeeded')
  let state = 'pending'
  if (hasActive) state = 'active'
  else if (hasFailed) state = 'failed'
  else if (allSucceeded) state = 'succeeded'
  return { state, iterCount, statuses, executed: iterCount > 0 }
}

const STATE_CLASS: Record<string, string> = {
  active: 'st-active',
  failed: 'st-failed',
  succeeded: 'st-success',
  pending: 'st-pending',
}
const STATE_LABEL: Record<string, string> = {
  active: '执行中/等待审核',
  failed: '失败',
  succeeded: '成功',
  pending: '未执行',
}

/** 节点展示数据（坐标已平移到非负 + 补齐中心点供连线计算） */
const nodeDtos = computed(() =>
  graphNodes.value.map((n: any) => {
    const pos = n.position ?? { x: 0, y: 0 }
    const left = pos.x - bounds.value.minX + PAD
    const top = pos.y - bounds.value.minY + PAD
    const agg = aggregate(n.id)
    const entry = (NODE_TYPE_CATALOG_MAP as Record<string, any>)[n.type]
    return {
      id: n.id,
      type: n.type,
      name: n.name,
      typeLabel: entry?.label ?? n.type,
      category: entry?.category ?? 'general',
      icon: entry?.icon,
      left,
      top,
      cx: left + NODE_W / 2,
      cy: top + NODE_H / 2,
      state: agg.state,
      stateLabel: STATE_LABEL[agg.state],
      iterCount: agg.iterCount,
      statuses: agg.statuses,
      executed: agg.executed,
    }
  })
)

function iconGlyph(n: any): string {
  if (n.type === 'start') return '▶'
  if (n.type === 'end') return '■'
  return n.category === 'flow' ? '⎇' : n.category === 'ai' ? '✦' : '⚙'
}

function nodeStyleOf(n: any): Record<string, string> {
  return { left: `${n.left}px`, top: `${n.top}px`, width: `${NODE_W}px`, minHeight: `${NODE_H}px` }
}

// ── 连线绘制（矩形边界交点 → 贝塞尔曲线） ──
interface EdgeDto {
  id: string
  kind: string
  d: string
  label: string
  mx: number
  my: number
}

/** 从矩形中心沿方向 (dx,dy) 的射线与矩形边界交点 */
function boundaryPoint(cx: number, cy: number, w: number, h: number, dx: number, dy: number): { x: number; y: number } {
  if (dx === 0 && dy === 0) return { x: cx, y: cy }
  const sx = dx !== 0 ? (w / 2) / Math.abs(dx) : Infinity
  const sy = dy !== 0 ? (h / 2) / Math.abs(dy) : Infinity
  const t = Math.min(sx, sy)
  return { x: cx + dx * t, y: cy + dy * t }
}

function edgePathFor(src: any, tgt: any): string {
  const dx = tgt.cx - src.cx
  const dy = tgt.cy - src.cy
  const dist = Math.hypot(dx, dy)
  if (dist === 0) return ''
  const sa = boundaryPoint(src.cx, src.cy, NODE_W, NODE_H, dx, dy)
  const ta = boundaryPoint(tgt.cx, tgt.cy, NODE_W, NODE_H, -dx, -dy)
  const off = Math.min(60, dist * 0.3)
  const c1x = sa.x + (dx / dist) * off
  const c1y = sa.y + (dy / dist) * off
  const c2x = ta.x - (dx / dist) * off
  const c2y = ta.y - (dy / dist) * off
  return `M ${sa.x.toFixed(1)} ${sa.y.toFixed(1)} C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${ta.x.toFixed(1)} ${ta.y.toFixed(1)}`
}

function edgeLabel(kind: string, branchId?: string): string {
  if (kind === 'branch') return branchId ?? ''
  const map: Record<string, string> = {
    fail: '失败',
    approve: '批准',
    reject: '驳回',
    'loop-body': '循环体',
    'loop-done': '完成',
    'loop-back': '回边',
  }
  return map[kind] ?? ''
}

const EDGE_COLOR: Record<string, string> = {
  normal: '#c3c9d4',
  fail: '#ef4444',
  approve: '#10b981',
  reject: '#f59e0b',
  branch: '#0ea5e9',
  'loop-body': '#8b5cf6',
  'loop-done': '#6366f1',
  'loop-back': '#94a3b8',
}
function edgeStyleOf(kind: string): Record<string, string> {
  return { stroke: EDGE_COLOR[kind] ?? EDGE_COLOR.normal ?? '#c3c9d4' }
}

const edgeDtos = computed<EdgeDto[]>(() => {
  const byId = new Map<string, any>(nodeDtos.value.map((n: any) => [n.id, n]))
  return graphEdges.value.map((e: any) => {
    const src = byId.get(e.sourceNodeId) as any
    const tgt = byId.get(e.targetNodeId) as any
    if (!src || !tgt) return { id: e.id, kind: e.kind, d: '', label: '', mx: 0, my: 0 }
    return {
      id: e.id,
      kind: e.kind,
      d: edgePathFor(src, tgt),
      label: edgeLabel(e.kind, e.branchId),
      mx: (src.cx + tgt.cx) / 2,
      my: (src.cy + tgt.cy) / 2,
    }
  })
})

// ── 缩放 / 适配（transform translate+scale；wheel 缩放 + 空白拖拽平移） ──
function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v))
}

/**
 * 以视口中心为锚缩放（按钮 +/− 用）。
 * 变焦后回写 panX/panY，使原中心内容点不漂移。
 */
function zoomBy(factor: number): void {
  const vp = viewportRef.value
  if (!vp) return
  const cx = vp.clientWidth / 2
  const cy = vp.clientHeight / 2
  const nz = clamp(zoom.value * factor, MIN_ZOOM, MAX_ZOOM)
  if (nz === zoom.value) return
  const contentX = (cx - panX.value) / zoom.value
  const contentY = (cy - panY.value) / zoom.value
  zoom.value = nz
  panX.value = cx - contentX * nz
  panY.value = cy - contentY * nz
}
function zoomIn(): void { zoomBy(1.2) }
function zoomOut(): void { zoomBy(1 / 1.2) }

/** 初始/「适应」：整体适配并水平垂直居中显示全图 */
function fitView(): void {
  const vp = viewportRef.value
  if (!vp || !contentW.value || !contentH.value || !graphNodes.value.length) return
  const vw = vp.clientWidth || 600
  const vh = vp.clientHeight || 480
  const fit = Math.min(vw / contentW.value, vh / contentH.value)
  zoom.value = clamp(fit, MIN_ZOOM, MAX_ZOOM * 0.9)
  // 居中：内容小于视口时居正中；大于时同样以中心对齐（超出部分由用户拖拽/缩放查看）
  panX.value = (vw - contentW.value * zoom.value) / 2
  panY.value = (vh - contentH.value * zoom.value) / 2
}

/** 滚轮缩放（作用于画布，指针中心锚点；范围 MIN_ZOOM~MAX_ZOOM） */
function onWheel(e: WheelEvent): void {
  const vp = viewportRef.value
  if (!vp) return
  e.preventDefault()
  const rect = vp.getBoundingClientRect()
  const cx = e.clientX - rect.left
  const cy = e.clientY - rect.top
  // deltaMode: 0=像素, 1=行, 2=页 → 统一折算为像素
  const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 100 : e.deltaY
  const factor = Math.exp(-dy * 0.0015)
  const nz = clamp(zoom.value * factor, MIN_ZOOM, MAX_ZOOM)
  if (nz === zoom.value) return
  // 保持指针下的内容点不动
  const contentX = (cx - panX.value) / zoom.value
  const contentY = (cy - panY.value) / zoom.value
  zoom.value = nz
  panX.value = cx - contentX * nz
  panY.value = cy - contentY * nz
}

/** 空白处按下 → 拖拽平移画布（节点上不触发，避免与点击选中冲突） */
function onPointerDown(e: PointerEvent): void {
  const vp = viewportRef.value
  if (!vp) return
  const target = e.target as HTMLElement
  if (target.closest('.wf-node')) return
  if (!target.closest('.viewport')) return
  isPanning.value = true
  panStart.value = { x: e.clientX, y: e.clientY, px: panX.value, py: panY.value }
  try { vp.setPointerCapture(e.pointerId) } catch { /* 兼容 */ }
  vp.classList.add('panning')
}
function onPointerMove(e: PointerEvent): void {
  if (!isPanning.value) return
  panX.value = panStart.value.px + (e.clientX - panStart.value.x)
  panY.value = panStart.value.py + (e.clientY - panStart.value.y)
}
function onPointerUp(e: PointerEvent): void {
  if (!isPanning.value) return
  isPanning.value = false
  const vp = viewportRef.value
  if (vp) {
    vp.classList.remove('panning')
    try { vp.releasePointerCapture(e.pointerId) } catch { /* 兼容 */ }
  }
}

const contentStyle = computed(() => ({
  width: `${contentW.value}px`,
  height: `${contentH.value}px`,
  transform: `translate(${panX.value}px, ${panY.value}px) scale(${zoom.value})`,
  transformOrigin: '0 0',
}))

function onClickNode(n: any): void {
  emit('node-click', {
    nodeId: n.id,
    node: props.graph?.nodes?.find((g: any) => g.id === n.id) ?? null,
    state: n.state,
    label: n.stateLabel,
    runs: props.nodeRuns.filter((r: any) => r.nodeId === n.id),
    executed: n.executed,
  })
}

onMounted(() => nextTick(fitView))
watch([() => props.graph, contentW, contentH], () => nextTick(fitView))
onBeforeUnmount(() => {
  isPanning.value = false
})
</script>

<style scoped>
.ro-graph { display: flex; flex-direction: column; gap: 8px; }

/* 图例 */
.legend { display: flex; align-items: center; flex-wrap: wrap; gap: 14px; padding: 6px 10px; background: var(--el-fill-color-light); border-radius: 6px; font-size: 12px; color: var(--el-text-color-secondary); }
.lg-title { font-weight: 600; color: var(--el-text-color-regular); }
.lg-item { display: inline-flex; align-items: center; gap: 5px; }
.dot { display: inline-block; width: 12px; height: 12px; border-radius: 3px; border: 2px solid transparent; }
.dot.st-success { border-color: #10b981; }
.dot.st-active { border-color: #3b82f6; }
.dot.st-failed { border-color: #ef4444; }
.dot.st-pending { border-color: #cbd5e1; }

.graph-body { position: relative; border: 1px solid var(--el-border-color-lighter); border-radius: 8px; background: #fafbfc; overflow: hidden; }

/* 缩放控制 */
.zoom-ctrl { position: absolute; top: 8px; right: 8px; z-index: 3; display: flex; align-items: center; gap: 2px; background: rgba(255,255,255,.92); border: 1px solid var(--el-border-color-lighter); border-radius: 20px; padding: 2px 6px; }
.zoom-val { font-size: 12px; color: var(--el-text-color-secondary); min-width: 40px; text-align: center; }

/* 视口：transform zoom/pan；滚轮缩放 + 空白拖拽平移（无原生滚动条，避免与缩放冲突） */
.viewport { height: clamp(300px, 52vh, 480px); overflow: hidden; position: relative; user-select: none; cursor: grab; background-image: radial-gradient(var(--el-border-color-lighter) 1px, transparent 1px); background-size: 20px 20px; }
.viewport.panning { cursor: grabbing; }
.graph-empty { height: 100%; display: flex; align-items: center; justify-content: center; color: var(--el-text-color-placeholder); font-size: 13px; }
.content { position: absolute; left: 0; top: 0; }
.edges { position: absolute; left: 0; top: 0; pointer-events: none; }
.edge-path { fill: none; stroke-width: 2; opacity: .8; }
.edge-label { font-size: 10px; fill: var(--el-text-color-secondary); pointer-events: none; }

/* 节点卡片（只读：可点击选中，不可拖拽） */
.wf-node { position: absolute; background: #fff; border: 2px solid #d1d5db; border-radius: 10px; padding: 6px 9px; box-sizing: border-box; cursor: pointer; font-size: 13px; transition: box-shadow .15s, border-color .15s; }
.wf-node:hover { box-shadow: 0 4px 12px rgba(0,0,0,.12); }
.wf-node.selected { box-shadow: 0 0 0 3px rgba(59,130,246,.3); border-color: #3b82f6 !important; }
.wf-node-head { display: flex; align-items: center; gap: 6px; font-weight: 600; line-height: 1.3; }
.wf-node-icon { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 5px; flex: none; font-size: 12px; background: var(--el-fill-color); }
.wf-node-icon.flow { color: #6366f1; background: rgba(99,102,241,.1); }
.wf-node-icon.ai { color: #10b981; background: rgba(16,185,129,.1); }
.wf-node-icon.general { color: #f59e0b; background: rgba(245,158,11,.1); }
.wf-node-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wf-node-sub { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 3px; font-size: 11px; color: #6b7280; }
.wf-node-type { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wf-node-iters { flex: none; color: var(--el-color-primary); font-weight: 600; }

/* 状态着色 */
.wf-node.st-success { border-color: #10b981; }
.wf-node.st-failed { border-color: #ef4444; background: #fff7f7; }
.wf-node.st-active { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,.22); }
.wf-node.st-pending { border-color: #cbd5e1; border-style: dashed; opacity: .72; }
</style>
