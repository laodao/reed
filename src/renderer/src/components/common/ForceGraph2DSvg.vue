<template>
  <svg
    ref="svgRef"
    class="force-graph-svg"
    :class="{ 'force-panning': isPanning }"
    :viewBox="viewBox"
    @wheel.prevent="onWheel"
    @mousedown="onSvgMouseDown"
    @mousemove="onSvgMouseMove"
    @mouseup="onSvgMouseUp"
    @mouseleave="onSvgMouseUp"
  >
    <!-- 边 -->
    <g v-for="(e, i) in edges" :key="e.id || `e${i}`">
      <line
        :x1="pos(e.source).x"
        :y1="pos(e.source).y"
        :x2="pos(e.target).x"
        :y2="pos(e.target).y"
        class="force-edge"
        :class="{ 'force-dim': isDimmedNode(e.source) || isDimmedNode(e.target), 'force-active': isActiveEdge(e) }"
      >
        <title v-if="e.title">{{ e.title }}</title>
      </line>
      <text
        v-if="showEdgeLabels && selectedId && isActiveEdge(e) && e.label"
        :x="(pos(e.source).x + pos(e.target).x) / 2"
        :y="(pos(e.source).y + pos(e.target).y) / 2 - 6"
        text-anchor="middle"
        class="force-edge-label"
      >{{ e.label }}</text>
    </g>

    <!-- 节点 -->
    <g
      v-for="node in nodes"
      :key="node.id"
      class="force-node"
      :class="{
        selected: selectedId === node.id,
        'force-dim': isDimmedNode(node.id),
        highlighted: !!selectedId && selectedId !== node.id && neighborSet.has(node.id),
      }"
      :transform="`translate(${pos(node.id).x}, ${pos(node.id).y})`"
      @mousedown.stop="onNodeMouseDown(node, $event)"
      @dblclick.stop="emit('dblclick', node)"
    >
      <circle
        :r="radiusOf(node)"
        :fill="node.color"
        class="force-node-circle"
        stroke="#fff"
        stroke-width="1.5"
      >
        <title>{{ node.name }}</title>
      </circle>
      <circle
        v-if="node.ring"
        :r="radiusOf(node) + (node.ring.radiusOffset ?? 3)"
        fill="none"
        :stroke="node.ring.color"
        stroke-width="1.5"
        :stroke-dasharray="node.ring.dash || '3 2'"
      />
      <text :y="radiusOf(node) + 14" text-anchor="middle" class="force-node-label">{{ node.name }}</text>
    </g>
  </svg>
</template>

<script setup lang="ts">
/**
 * 统一图谱能力 2D 实现（自绘 SVG，无图库依赖）
 * @module components/common/ForceGraph2DSvg
 * @description ForceGraph 门面的 2D 私有实现（mode='2d' 兜底）。逻辑自原公共
 *              ForceGraph.vue 原样迁入：力导向布局（排斥+边吸引+中心引力+碰撞分离）、
 *              viewBox 缩放/平移/适应、节点拖动、点击选中→高亮一阶邻居+其余淡化、
 *              双击上抛。默认渲染走 ForceGraph3DImpl（WebGL）；本实现保留用于
 *              小图观感偏好与 WebGL 不可用兜底。
 *
 * 宿主职责：数据获取与可见性过滤（focus/章节/类型）、图例与缩放按钮（经 ref 调用
 * zoomAt/fitView、读 zoomPercent）、详情面板。空态由宿主自己渲染（本组件仅在
 * 有数据时被挂载）。
 */
import { computed, onMounted, ref, watch } from 'vue'
import type { ForceGraphEdge, ForceGraphNode } from './force-graph.model'

const props = withDefaults(
  defineProps<{
    nodes: ForceGraphNode[]
    edges: ForceGraphEdge[]
    /** 逻辑视口宽高（viewBox 坐标系；适应/布局基于它） */
    width?: number
    height?: number
    minZoomScale?: number
    maxZoomScale?: number
    /** 选中节点时在相邻边上显示关系标签（如 Atlas 的 relation 类型） */
    showEdgeLabels?: boolean
    /** 受控选中 id（null = 无选中）；配合 update:selectedId 双向 */
    selectedId?: string | null
    /** 结构重排触发键：数据装载/下钻等结构性变化时宿主改它触发重布局；
     *  同一布局键下仅增删过滤（如章节时间轴）不重排，保持位置稳定 */
    layoutKey?: string | number
  }>(),
  {
    width: 920,
    height: 600,
    minZoomScale: 0.2,
    maxZoomScale: 5,
    showEdgeLabels: false,
    selectedId: null,
    layoutKey: undefined,
  },
)

const emit = defineEmits<{
  'update:selectedId': [id: string | null]
  /** 节点被按下即选中（高亮/淡化立即生效；宿主可据此即时更新侧栏或仅标记） */
  select: [node: ForceGraphNode | null]
  /** 节点 mouseup 未拖动 = 单击（宿主开详情等"确认式"动作用） */
  click: [node: ForceGraphNode]
  /** 双击（下钻/子图谱） */
  dblclick: [node: ForceGraphNode]
  /** 点击空白（取消选中） */
  background: []
  /** 缩放比例变化（宿主按钮 disabled / 百分比读数用） */
  zoom: [percent: number]
}>()

const W = computed(() => props.width)
const H = computed(() => props.height)
const minZoom = computed(() => props.minZoomScale)
const maxZoom = computed(() => props.maxZoomScale)
const selectedId = computed(() => props.selectedId ?? null)

// ==================== 视口（viewBox 缩放/平移） ====================

const svgRef = ref<SVGSVGElement | null>(null)
const view = ref({ x: 0, y: 0, w: props.width, h: props.height })
let panStart: { x: number; y: number; viewX: number; viewY: number } | null = null
let dragNode: { id: string; sx: number; sy: number; px: number; py: number; moved: boolean } | null = null
const isPanning = ref(false)

const viewBox = computed(() => `${view.value.x} ${view.value.y} ${view.value.w} ${view.value.h}`)
const zoomPercent = computed(() => Math.round((W.value / view.value.w) * 100))

function svgSize(): { w: number; h: number } {
  const el = svgRef.value
  return el ? { w: el.clientWidth || W.value, h: el.clientHeight || H.value } : { w: W.value, h: H.value }
}

function clampNum(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max)
}

/** 以视图中心为锚点缩放（保持 W:H 比例，限制 minZoomScale~maxZoomScale） */
function zoomAt(factor: number): void {
  const nw = clampNum(view.value.w * factor, W.value * minZoom.value, W.value * maxZoom.value)
  const nh = nw * (H.value / W.value)
  view.value = {
    x: view.value.x + (view.value.w - nw) / 2,
    y: view.value.y + (view.value.h - nh) / 2,
    w: nw,
    h: nh,
  }
  emit('zoom', zoomPercent.value)
}

function onWheel(e: WheelEvent): void {
  const rect = svgRef.value?.getBoundingClientRect()
  if (!rect) return
  const { w: cw, h: ch } = svgSize()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
  const nw = clampNum(view.value.w * factor, W.value * minZoom.value, W.value * maxZoom.value)
  const nh = nw * (H.value / W.value)
  const gx = view.value.x + (mx / cw) * view.value.w
  const gy = view.value.y + (my / ch) * view.value.h
  view.value = { x: gx - (mx / cw) * nw, y: gy - (my / ch) * nh, w: nw, h: nh }
  emit('zoom', zoomPercent.value)
}

function mouseToGraph(e: MouseEvent): { x: number; y: number } {
  const rect = svgRef.value!.getBoundingClientRect()
  const { w: cw, h: ch } = svgSize()
  return {
    x: view.value.x + ((e.clientX - rect.left) / cw) * view.value.w,
    y: view.value.y + ((e.clientY - rect.top) / ch) * view.value.h,
  }
}

function onSvgMouseDown(e: MouseEvent): void {
  panStart = { x: e.clientX, y: e.clientY, viewX: view.value.x, viewY: view.value.y }
  isPanning.value = true
}

function onNodeMouseDown(node: ForceGraphNode, e: MouseEvent): void {
  e.stopPropagation()
  // 按下即选中（高亮/淡化立即生效；拖动与单击在 mouseup 区分）
  emit('update:selectedId', node.id)
  emit('select', node)
  const p = positions.value[node.id] || { x: W.value / 2, y: H.value / 2 }
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
    if (!dragNode.moved) {
      const node = props.nodes.find((n) => n.id === dragNode!.id)
      if (node) emit('click', node)
    }
    dragNode = null
    return
  }
  const moved = panStart && (Math.abs(e.clientX - panStart.x) > 4 || Math.abs(e.clientY - panStart.y) > 4)
  if (panStart && !moved) {
    // 点击空白 → 取消选中
    emit('update:selectedId', null)
    emit('select', null)
    emit('background')
  }
  panStart = null
  isPanning.value = false
}

/** 适应视图（重置） */
function fitView(): void {
  view.value = { x: 0, y: 0, w: W.value, h: H.value }
  emit('zoom', zoomPercent.value)
}

// ==================== 选中与淡化 ====================

/** 一阶邻居集合（选中节点） */
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

function isActiveEdge(e: ForceGraphEdge): boolean {
  return !!selectedId.value && (e.source === selectedId.value || e.target === selectedId.value)
}

function radiusOf(node: ForceGraphNode): number {
  return node.radius ?? 8
}

// ==================== 节点位置（布局 + 手动拖动共用） ====================

const positions = ref<Record<string, { x: number; y: number }>>({})

function pos(id: string): { x: number; y: number } {
  return positions.value[id] || { x: W.value / 2, y: H.value / 2 }
}

// ==================== 力导向布局（排斥+边吸引+中心引力+碰撞分离） ====================

function layout(): void {
  const list = props.nodes
  const n = list.length
  if (n === 0) return
  const next: Record<string, { x: number; y: number }> = {}
  for (const node of list) {
    next[node.id] = { x: W.value / 2 + (Math.random() - 0.5) * W.value * 0.6, y: H.value / 2 + (Math.random() - 0.5) * H.value * 0.6 }
  }
  const repulsion = 1500
  const attraction = 0.02
  const center = 0.004

  for (let iter = 0; iter < 200; iter++) {
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
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 24)
        const f = repulsion / (dist * dist)
        const fx = (dx / dist) * f
        const fy = (dy / dist) * f
        forces.get(a.id)!.x += fx
        forces.get(a.id)!.y += fy
        forces.get(b.id)!.x -= fx
        forces.get(b.id)!.y -= fy
      }
    }
    for (const edge of props.edges) {
      const pa = next[edge.source]
      const pb = next[edge.target]
      if (!pa || !pb) continue
      const dx = pb.x - pa.x
      const dy = pb.y - pa.y
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 24)
      const f = attraction * dist
      forces.get(edge.source)!.x += (dx / dist) * f
      forces.get(edge.source)!.y += (dy / dist) * f
      forces.get(edge.target)!.x -= (dx / dist) * f
      forces.get(edge.target)!.y -= (dy / dist) * f
    }
    for (const node of list) {
      const p = next[node.id]
      const f = forces.get(node.id)!
      p.x += f.x + (W.value / 2 - p.x) * center
      p.y += f.y + (H.value / 2 - p.y) * center
    }
    for (let sub = 0; sub < 6; sub++) {
      if (!collidePass(next)) break
    }
    for (const node of list) {
      const p = next[node.id]
      p.x = Math.min(Math.max(p.x, 34), W.value - 34)
      p.y = Math.min(Math.max(p.y, 34), H.value - 34)
    }
  }
  // 收尾：纯碰撞分离，确保无重叠
  for (let sub = 0; sub < 12; sub++) {
    if (!collidePass(next)) break
  }
  positions.value = next
}

/** 一轮碰撞分离：间距 < 半径和×2+标签余量则互相推开；返回是否有移动 */
function collidePass(next: Record<string, { x: number; y: number }>): boolean {
  const list = props.nodes
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
      const minDist = (radiusOf(a) + radiusOf(b)) * 2 + 16
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
        pa.x -= Math.cos(ang) * 24
        pa.y -= Math.sin(ang) * 24
        pb.x += Math.cos(ang) * 24
        pb.y += Math.sin(ang) * 24
        moved = true
      }
    }
  }
  return moved
}

// 结构键变化（数据装载/下钻）→ 重新布局；仅数据内容刷新不重排（保留手动位置）
watch(
  () => props.layoutKey,
  () => layout(),
)
onMounted(layout)

defineExpose({ zoomAt, fitView, zoomPercent, view })
</script>

<style scoped lang="scss">
/* 图引擎样式（双设计体系 CSS 变量兜底：长文 --color-* / Atlas --el-*） */
.force-graph-svg {
  width: 100%;
  height: 100%;
  display: block;
  cursor: grab;
  &.force-panning {
    cursor: grabbing;
  }
}

.force-edge {
  stroke: var(--border-color, var(--el-border-color));
  stroke-width: 1;
  opacity: 0.55;
  transition: opacity 0.2s, stroke 0.2s;

  &.force-active {
    stroke: var(--color-primary, var(--el-color-primary));
    stroke-width: 1.6;
    opacity: 0.95;
  }
  &.force-dim {
    opacity: 0.08;
  }
}

.force-edge-label {
  font-size: 10px;
  fill: var(--color-primary, var(--el-color-primary));
  pointer-events: none;
}

.force-node {
  cursor: pointer;
  transition: opacity 0.2s;

  .force-node-circle {
    stroke: #fff;
    stroke-width: 1.5;
  }

  .force-node-label {
    font-size: 11px;
    fill: var(--text-color-regular, var(--el-text-color-regular));
    pointer-events: none;
  }

  &.selected .force-node-circle {
    stroke: var(--color-primary, var(--el-color-primary));
    stroke-width: 3;
  }

  &.force-dim {
    opacity: 0.18;

    .force-node-label {
      opacity: 0.5;
    }
  }

  /* 邻居弱高亮：非选中但相邻 → 虚线外圈提示 */
  &.highlighted:not(.selected) .force-node-circle {
    stroke-width: 2.5;
    stroke-dasharray: 3 2;
  }
}
</style>
