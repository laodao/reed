<template>
  <div class="atlas-graph">
    <!-- 工具栏：图例（类型着色）+ 缩放 -->
    <div class="graph-toolbar">
      <div class="graph-legend">
        <span v-for="t in legendTypes" :key="t" class="legend-item" :title="nodeTypeMeta(t).desc">
          <i class="legend-dot" :style="{ background: nodeTypeMeta(t).color }" />
          {{ nodeTypeMeta(t).label }}
        </span>
      </div>
      <div class="zoom-controls">
        <el-button size="small" :icon="ZoomOut" circle title="缩小" @click="zoomAt(1 / 1.2)" />
        <span class="zoom-percent">{{ zoomPercent }}%</span>
        <el-button size="small" :icon="ZoomIn" circle title="放大" @click="zoomAt(1.2)" />
        <el-button size="small" :icon="FullScreen" circle title="适应视图" @click="fitView" />
      </div>
    </div>

    <div v-if="nodes.length === 0" class="graph-empty">
      <el-icon><Share /></el-icon>
      <p>暂无图谱数据</p>
    </div>
    <svg
      v-else
      ref="svgRef"
      class="graph-svg"
      :class="{ panning: isPanning }"
      :viewBox="viewBox"
      @wheel.prevent="onWheel"
      @mousedown="onSvgMouseDown"
      @mousemove="onSvgMouseMove"
      @mouseup="onSvgMouseUp"
      @mouseleave="onSvgMouseUp"
    >
      <!-- 边 -->
      <g v-for="(e, i) in visibleEdges" :key="`e${i}`">
        <line
          :x1="pos(e.source).x"
          :y1="pos(e.source).y"
          :x2="pos(e.target).x"
          :y2="pos(e.target).y"
          class="graph-edge"
          :class="{ dim: isDimmedNode(e.source) || isDimmedNode(e.target), active: isActiveEdge(e) }"
        />
        <!-- 关系标签（选中聚焦时显示） -->
        <text
          v-if="selectedId && isActiveEdge(e)"
          :x="(pos(e.source).x + pos(e.target).x) / 2"
          :y="(pos(e.source).y + pos(e.target).y) / 2 - 6"
          text-anchor="middle"
          class="edge-label"
        >{{ relLabel(e.type) }}</text>
      </g>
      <!-- 节点 -->
      <g
        v-for="node in visibleNodes"
        :key="node.id"
        class="graph-node"
        :class="{ selected: selectedId === node.id, dim: isDimmedNode(node.id) }"
        :transform="`translate(${pos(node.id).x}, ${pos(node.id).y})`"
        @mousedown.stop="onNodeMouseDown(node, $event)"
        @dblclick.stop="$emit('dblclick', node)"
      >
        <circle
          :r="nodeR"
          :fill="nodeTypeMeta(node.nodeType).color"
          class="node-circle"
          stroke="#fff"
          stroke-width="1.5"
        >
          <title>{{ node.name }}（{{ nodeTypeMeta(node.nodeType).label }}）</title>
        </circle>
        <!-- 掌握度外圈（学习态才有） -->
        <circle
          v-if="node.mastery === 'learning'"
          :r="nodeR + 3"
          fill="none"
          stroke="#E6A23C"
          stroke-width="1.5"
          stroke-dasharray="3 2"
        />
        <text :y="nodeR + 14" text-anchor="middle" class="node-label">{{ node.name }}</text>
      </g>
    </svg>
  </div>
</template>

<script setup lang="ts">
/**
 * Atlas 自绘 SVG 力导向图谱
 * @module views/domain-learning/AtlasGraph
 * @description 技术与长文写作 GraphView 同源（自绘 SVG，无图库依赖）：
 *              力导向布局（排斥+边吸引+中心引力+碰撞分离）、viewBox 缩放/平移/适应、
 *              节点拖动、点击选中→高亮一阶邻居+其余淡化、双击上抛（子图谱下钻由父级接管）。
 *              节点按知识类型着色（domain-learning-ui 类型图例）；数据源 = dl:get-atlas-graph
 *              返回的 DlAtlasNode/DlAtlasEdge。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { ZoomIn, ZoomOut, FullScreen, Share } from '@element-plus/icons-vue'
import { nodeTypeMeta, relLabel } from './domain-learning-ui'
import type { DlAtlasEdge, DlAtlasNode, DlNodeType } from '@shared/types/domain-learning.types'

const props = defineProps<{
  nodes: DlAtlasNode[]
  edges: DlAtlasEdge[]
  /** 父级下钻控制：置为非空 = 只显示该节点及其一阶邻居（子图谱模式） */
  focusId?: string | null
}>()

const emit = defineEmits<{
  select: [node: DlAtlasNode | null]
  dblclick: [node: DlAtlasNode]
}>()

const W = 1000
const H = 640

// ==================== 视口（viewBox 缩放/平移） ====================
const svgRef = ref<SVGSVGElement | null>(null)
const view = ref({ x: 0, y: 0, w: W, h: H })
const isPanning = ref(false)
let panStart: { x: number; y: number; viewX: number; viewY: number } | null = null
let dragNode: { id: string; sx: number; sy: number; px: number; py: number; moved: boolean } | null = null

const viewBox = computed(() => `${view.value.x} ${view.value.y} ${view.value.w} ${view.value.h}`)
const zoomPercent = computed(() => Math.round((W / view.value.w) * 100))

function svgSize(): { w: number; h: number } {
  const el = svgRef.value
  return el ? { w: el.clientWidth || W, h: el.clientHeight || H } : { w: W, h: H }
}

function zoomAt(factor: number): void {
  const nw = clampNum(view.value.w * factor, W * 0.15, W * 8)
  const nh = nw * (H / W)
  view.value = { x: view.value.x + (view.value.w - nw) / 2, y: view.value.y + (view.value.h - nh) / 2, w: nw, h: nh }
}

function onWheel(e: WheelEvent): void {
  const rect = svgRef.value?.getBoundingClientRect()
  if (!rect) return
  const { w: cw, h: ch } = svgSize()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
  const nw = clampNum(view.value.w * factor, W * 0.15, W * 8)
  const nh = nw * (H / W)
  const gx = view.value.x + (mx / cw) * view.value.w
  const gy = view.value.y + (my / ch) * view.value.h
  view.value = { x: gx - (mx / cw) * nw, y: gy - (my / ch) * nh, w: nw, h: nh }
}

function onSvgMouseDown(e: MouseEvent): void {
  panStart = { x: e.clientX, y: e.clientY, viewX: view.value.x, viewY: view.value.y }
  isPanning.value = true
}

function mouseToGraph(e: MouseEvent): { x: number; y: number } {
  const rect = svgRef.value!.getBoundingClientRect()
  const { w: cw, h: ch } = svgSize()
  return {
    x: view.value.x + ((e.clientX - rect.left) / cw) * view.value.w,
    y: view.value.y + ((e.clientY - rect.top) / ch) * view.value.h,
  }
}

function onNodeMouseDown(node: DlAtlasNode, e: MouseEvent): void {
  e.stopPropagation()
  // 与长文 GraphView 同源：按下即选中（高亮/档案立即生效），拖动/点击区分在 mouseup
  selectedId.value = node.id
  emit('select', node)
  const p = positions.value[node.id] || { x: W / 2, y: H / 2 }
  dragNode = { id: node.id, sx: e.clientX, sy: e.clientY, px: p.x, py: p.y, moved: false }
}

function onSvgMouseMove(e: MouseEvent): void {
  if (dragNode) {
    const cur = mouseToGraph(e)
    const start = mouseToGraph({ clientX: dragNode.sx, clientY: dragNode.sy } as MouseEvent)
    const dx = cur.x - start.x
    const dy = cur.y - start.y
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) dragNode.moved = true
    positions.value[dragNode.id] = { x: dragNode.px + dx, y: dragNode.py + dy }
    return
  }
  if (!panStart) return
  const { w: cw, h: ch } = svgSize()
  view.value = {
    x: panStart.viewX - ((e.clientX - panStart.x) / cw) * view.value.w,
    y: panStart.viewY - ((e.clientY - panStart.y) / ch) * view.value.h,
    w: view.value.w,
    h: view.value.h,
  }
}

function onSvgMouseUp(e: MouseEvent): void {
  if (dragNode) {
    // 选中已在 mousedown 完成；此处只结束拖拽
    dragNode = null
    return
  }
  const moved = panStart && (Math.abs(e.clientX - panStart.x) > 4 || Math.abs(e.clientY - panStart.y) > 4)
  if (panStart && !moved) {
    selectedId.value = null
    emit('select', null)
  }
  panStart = null
  isPanning.value = false
}

function fitView(): void {
  view.value = { x: 0, y: 0, w: W, h: H }
}

function clampNum(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max)
}

// ==================== 布局与数据 ====================

const nodeR = 9

const visibleNodes = computed(() => {
  if (!props.focusId) return props.nodes
  const focus = props.nodes.find(n => n.id === props.focusId)
  if (!focus) return props.nodes
  const neighbors = new Set<string>()
  for (const e of props.edges) {
    if (e.source === props.focusId) neighbors.add(e.target)
    if (e.target === props.focusId) neighbors.add(e.source)
  }
  return props.nodes.filter(n => n.id === props.focusId || neighbors.has(n.id))
})

const visibleEdges = computed(() => {
  const ids = new Set(visibleNodes.value.map(n => n.id))
  return props.edges.filter(e => ids.has(e.source) && ids.has(e.target))
})

/** 选中态（父级回写 props.focusId 与本地 selectedId 保持一致；用本地 ref 由父同步） */
const selectedId = ref<string | null>(null)
watch(
  () => props.focusId,
  v => (selectedId.value = v ?? null)
)

/** 一阶邻居集合（用于高亮/淡化） */
const neighborSet = computed(() => {
  const set = new Set<string>()
  if (!selectedId.value) return set
  for (const e of props.edges) {
    if (e.source === selectedId.value) set.add(e.target)
    if (e.target === selectedId.value) set.add(e.source)
  }
  return set
})

function isDimmedNode(id: string): boolean {
  if (!selectedId.value) return false
  if (id === selectedId.value) return false
  return !neighborSet.value.has(id)
}

function isActiveEdge(e: DlAtlasEdge): boolean {
  return !!selectedId.value && (e.source === selectedId.value || e.target === selectedId.value)
}

/** 节点位置（布局后 + 手动拖动共用） */
const positions = ref<Record<string, { x: number; y: number }>>({})

function pos(id: string): { x: number; y: number } {
  return positions.value[id] || { x: W / 2, y: H / 2 }
}

/** 图例类型（按出现序） */
const legendTypes = computed<DlNodeType[]>(() => {
  const seen: DlNodeType[] = []
  for (const n of props.nodes) {
    if (!seen.includes(n.nodeType)) seen.push(n.nodeType)
  }
  return seen
})

// ==================== 力导向布局（同源长文 GraphView） ====================

function layout(): void {
  const list = visibleNodes.value
  const n = list.length
  if (n === 0) return
  const next: Record<string, { x: number; y: number }> = {}
  for (const node of list) {
    next[node.id] = { x: W / 2 + (Math.random() - 0.5) * W * 0.6, y: H / 2 + (Math.random() - 0.5) * H * 0.6 }
  }
  const repulsion = 1600
  const attraction = 0.02
  const center = 0.004
  const edges = visibleEdges.value

  for (let iter = 0; iter < 220; iter++) {
    const forces = new Map<string, { x: number; y: number }>()
    for (const node of list) forces.set(node.id, { x: 0, y: 0 })
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = list[i]
        const b = list[j]
        const pa = next[a.id]
        const pb = next[b.id]
        const dx = pa.x - pb.x
        const dy = pa.y - pb.y
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 28)
        const f = repulsion / (dist * dist)
        const fx = (dx / dist) * f
        const fy = (dy / dist) * f
        forces.get(a.id)!.x += fx
        forces.get(a.id)!.y += fy
        forces.get(b.id)!.x -= fx
        forces.get(b.id)!.y -= fy
      }
    }
    for (const edge of edges) {
      const pa = next[edge.source]
      const pb = next[edge.target]
      if (!pa || !pb) continue
      const dx = pb.x - pa.x
      const dy = pb.y - pa.y
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 28)
      const f = attraction * dist
      forces.get(edge.source)!.x += (dx / dist) * f
      forces.get(edge.source)!.y += (dy / dist) * f
      forces.get(edge.target)!.x -= (dx / dist) * f
      forces.get(edge.target)!.y -= (dy / dist) * f
    }
    for (const node of list) {
      const p = next[node.id]
      const f = forces.get(node.id)!
      p.x += f.x + (W / 2 - p.x) * center
      p.y += f.y + (H / 2 - p.y) * center
    }
    for (let sub = 0; sub < 5; sub++) {
      if (!collidePass(next, list)) break
    }
    for (const node of list) {
      const p = next[node.id]
      p.x = Math.min(Math.max(p.x, 40), W - 40)
      p.y = Math.min(Math.max(p.y, 40), H - 40)
    }
  }
  positions.value = next
}

function collidePass(next: Record<string, { x: number; y: number }>, list: DlAtlasNode[]): boolean {
  let moved = false
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i]
      const b = list[j]
      const pa = next[a.id]
      const pb = next[b.id]
      const dx = pb.x - pa.x
      const dy = pb.y - pa.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      const minDist = nodeR * 2 + 24
      if (dist < minDist && dist > 0.01) {
        const overlap = ((minDist - dist) / 2) * 0.6
        const nx = dx / dist
        const ny = dy / dist
        pa.x -= nx * overlap
        pa.y -= ny * overlap
        pb.x += nx * overlap
        pb.y += ny * overlap
        moved = true
      } else if (dist <= 0.01) {
        const ang = Math.random() * Math.PI * 2
        pa.x -= Math.cos(ang) * 30
        pa.y -= Math.sin(ang) * 30
        pb.x += Math.cos(ang) * 30
        pb.y += Math.sin(ang) * 30
        moved = true
      }
    }
  }
  return moved
}

// 数据或聚焦变化时重布局
watch([() => props.nodes, () => props.edges, () => props.focusId], () => {
  layout()
})
onMounted(layout)
</script>

<style scoped lang="scss">
.atlas-graph {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 380px;
  overflow: hidden;
}

.graph-toolbar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-wrap: wrap;

  .graph-legend {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
    font-size: 12px;
    color: var(--el-text-color-regular);
    cursor: default;

    .legend-item {
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }
    .legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      display: inline-block;
    }
  }

  .zoom-controls {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 4px;

    .zoom-percent {
      min-width: 46px;
      text-align: center;
      font-size: 12px;
      color: var(--el-text-color-secondary);
      font-variant-numeric: tabular-nums;
    }
  }
}

.graph-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--el-text-color-placeholder);

  .el-icon {
    font-size: 32px;
    opacity: 0.5;
  }
  p {
    margin: 0;
    font-size: 14px;
    color: var(--el-text-color-secondary);
  }
}

.graph-svg {
  flex: 1;
  width: 100%;
  cursor: grab;
  &.panning {
    cursor: grabbing;
  }
}

.graph-edge {
  stroke: var(--el-border-color);
  stroke-width: 1;
  opacity: 0.55;
  transition: opacity 0.2s;

  &.active {
    stroke: var(--el-color-primary);
    stroke-width: 1.6;
    opacity: 0.95;
  }
  &.dim {
    opacity: 0.08;
  }
}

.edge-label {
  font-size: 10px;
  fill: var(--el-color-primary);
  pointer-events: none;
}

.graph-node {
  cursor: pointer;
  transition: opacity 0.2s;

  .node-label {
    font-size: 11px;
    fill: var(--el-text-color-regular);
    pointer-events: none;
  }

  &.selected .node-circle {
    stroke: var(--el-color-primary);
    stroke-width: 3;
  }
  &.dim {
    opacity: 0.18;
    .node-label {
      opacity: 0.5;
    }
  }
}
</style>
