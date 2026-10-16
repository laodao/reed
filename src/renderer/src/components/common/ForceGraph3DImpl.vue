<template>
  <div ref="containerRef" class="force-graph3d"></div>
</template>

<script setup lang="ts">
/**
 * 统一图谱能力 3D 实现（three.js + 3d-force-graph，WebGL）
 * @module components/common/ForceGraph3DImpl
 * @description ForceGraph 门面的 3D 私有实现（mode='3d' 默认）。契约与 2D 实现一致：
 *              布局为 d3-force-3d 增量模拟（alpha 衰减自动停，不阻塞主线程，替代 2D
 *              的同步 O(n²)×200 一步算完）；轨道相机（拖转/平移/滚轮），zoomAt=dolly、
 *              fitView=zoomToFit、zoomPercent 按相机距离/适配基准换算；点选→一阶邻居
 *              高亮其余淡化（rgba 材质透明，重设访问器触发重绘）；悬停 tooltip（内置）
 *              与 dblclick（350ms 同节点双击检测）；节点可拖拽；background 取消选中。
 *
 *              治密设计：① 标签分级（helpers.selectLabeledNodes：少全显/多显枢纽+
 *              焦点集+孤立点）；② 节点对象按 id 缓存——过滤只动可见集位置不重排，
 *              layoutKey 变化才 reheat（与 2D layoutKey 语义一致）。
 *
 *              实现要点：球体/连线用 three-forcegraph 内置访问器（nodeColor/nodeVal/
 *              linkColor，支持 rgba 透明度）；标签（SpriteText）/外圈光环（canvas 环形
 *              纹理 Sprite）/选中相邻边关系标签统一放自管装饰层（decoRoot），rAF 逐帧
 *              同步位置——不介入 nodeThreeObject，避免重建整棵节点对象树。width/height
 *              prop 为 2D viewBox 兼容保留，3D 画布填满容器（ResizeObserver）。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ForceGraph3DLib from '3d-force-graph'
import type { ConfigOptions, ForceGraph3DInstance } from '3d-force-graph'
import SpriteText from 'three-spritetext'
import * as THREE from 'three'
import type { ForceGraphEdge, ForceGraphNode } from './force-graph.model'
import {
  buildAdjacency,
  clampDollyDistance,
  distanceToZoomPercent,
  selectLabeledNodes,
} from './force-graph3d.helpers'

const props = withDefaults(
  defineProps<{
    nodes: ForceGraphNode[]
    edges: ForceGraphEdge[]
    /** 2D viewBox 兼容保留；3D 画布填满容器 */
    width?: number
    height?: number
    /** 缩放百分比边界（dolly 夹取基于 fitView 基准距离） */
    minZoomScale?: number
    maxZoomScale?: number
    /** 选中节点时在相邻边中点显示关系标签 */
    showEdgeLabels?: boolean
    /** 受控选中 id（null = 无选中）；配合 update:selectedId 双向 */
    selectedId?: string | null
    /** 结构重排触发键：变化 → reheat 重模拟（位置从当前出发演化，不重新撒点） */
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
  select: [node: ForceGraphNode | null]
  click: [node: ForceGraphNode]
  dblclick: [node: ForceGraphNode]
  background: []
  zoom: [percent: number]
}>()

// ==================== 常量 ====================

/** 世界半径 = cbrt(nodeVal) × nodeRelSize = 0.5 × radius（radius 为 2D 像素半径语义） */
const NODE_REL_SIZE = 0.5
/** 球体周向分段数（库默认 8,球体呈明显多面体棱角；20 段圆润且开销可忽略） */
const NODE_RESOLUTION = 20
const LINK_DISTANCE = 60
const CHARGE_STRENGTH = -160
const DBLCLICK_MS = 350
const FIT_TRANSITION_MS = 320

// ==================== 图数据模型（节点对象按 id 缓存保位置） ====================

interface G3DNode {
  id: string
  name: string
  color: string
  radius?: number
  ring?: ForceGraphNode['ring']
  x?: number
  y?: number
  z?: number
}

interface G3DLink {
  source: string | G3DNode
  target: string | G3DNode
  label?: string
  title?: string
}

type G3DInstance = ForceGraph3DInstance<G3DNode, any>

interface OrbitLikeControls {
  target: THREE.Vector3
  addEventListener(type: string, listener: () => void): void
  removeEventListener(type: string, listener: () => void): void
}

const containerRef = ref<HTMLDivElement | null>(null)
const zoomPercent = ref(100)
let graph: G3DInstance | null = null
let controls: OrbitLikeControls | null = null
let resizeObserver: ResizeObserver | null = null
let fitTimer = 0
let rafId = 0
/** fitView 后的相机距离 = 100% 缩放基准 */
let refDistance = 0
const nodeObjCache = new Map<string, G3DNode>()

// ==================== 选中/淡化（访问器闭包读取，变更时重设触发重绘） ====================

const selectedId = computed(() => props.selectedId ?? null)
const adjacency = computed(() => buildAdjacency(props.edges))
const hoveredId = ref<string | null>(null)

const neighborSet = computed(() => {
  const set = new Set<string>()
  if (!selectedId.value) return set
  return adjacency.value.get(selectedId.value) ?? set
})

/** 标签分级的焦点集：选中/悬停及其一阶邻居（密图下仍保证可见名字） */
const focusIds = computed(() => {
  const set = new Set<string>()
  const add = (id: string | null | undefined): void => {
    if (!id) return
    set.add(id)
    adjacency.value.get(id)?.forEach((n) => set.add(n))
  }
  add(selectedId.value)
  add(hoveredId.value)
  return set
})

const labeledKey = computed(() =>
  [...selectLabeledNodes(props.nodes, props.edges, focusIds.value)].sort().join('\n'),
)

/** #rgb/#rrggbb/rgb()/rgba() → rgba(r,g,b,alpha)；解析失败原样返回 */
function withAlpha(color: string, alpha: number): string {
  const c = color.trim()
  if (c.startsWith('#')) {
    if (c.length === 4) {
      return `rgba(${parseInt(c[1] + c[1], 16)}, ${parseInt(c[2] + c[2], 16)}, ${parseInt(c[3] + c[3], 16)}, ${alpha})`
    }
    if (c.length === 7) {
      return `rgba(${parseInt(c.slice(1, 3), 16)}, ${parseInt(c.slice(3, 5), 16)}, ${parseInt(c.slice(5, 7), 16)}, ${alpha})`
    }
    return c
  }
  const m = c.match(/^rgba?\(([^)]+)\)$/i)
  if (m) {
    const [r = '0', g = '0', b = '0'] = m[1].split(/[,\s/]+/).filter(Boolean)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  return c
}

function endpointId(endpoint: string | G3DNode): string {
  return typeof endpoint === 'string' ? endpoint : endpoint.id
}

function nodeVisualColor(n: G3DNode): string {
  if (!selectedId.value || n.id === selectedId.value || neighborSet.value.has(n.id)) return n.color
  return withAlpha(n.color, 0.15)
}

function linkVisualColor(l: G3DLink): string {
  if (!selectedId.value) return withAlpha(theme.edge, 0.5)
  const sid = endpointId(l.source)
  const tid = endpointId(l.target)
  const active = sid === selectedId.value || tid === selectedId.value
  return active ? theme.primary : withAlpha(theme.edge, 0.08)
}

// ==================== 主题色（挂载时解析 CSS 变量，双设计体系兜底） ====================

const theme = { primary: '#409EFF', edge: '#c0c4cc', text: '#606266' }

function resolvePalette(): void {
  if (!containerRef.value) return
  const css = getComputedStyle(containerRef.value)
  const read = (names: string[], fallback: string): string => {
    for (const name of names) {
      const v = css.getPropertyValue(name).trim()
      if (v) return v
    }
    return fallback
  }
  theme.primary = read(['--color-primary', '--el-color-primary'], '#409EFF')
  theme.edge = read(['--border-color', '--el-border-color'], '#c0c4cc')
  theme.text = read(['--text-color-regular', '--el-text-color-regular'], '#606266')
}

// ==================== 装饰层（标签/光环/边标签，自管生命周期 + rAF 同步位置） ====================

const decoRoot = new THREE.Group()
interface DecoSprite {
  sprite: THREE.Sprite | SpriteText
  node?: G3DNode
  link?: G3DLink
  /** 相对节点的世界偏移（标签悬于球体上方） */
  offsetY?: number
}
let decoSprites: DecoSprite[] = []
const ringTextures = new Map<string, THREE.CanvasTexture>()

function ringTexture(color: string, dash: string): THREE.CanvasTexture {
  const key = `${color}|${dash}`
  const cached = ringTextures.get(key)
  if (cached) return cached
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')!
  ctx.strokeStyle = color
  ctx.lineWidth = 7
  if (dash) ctx.setLineDash(dash.split(/[\s,]+/).map(Number).filter((n) => n > 0))
  ctx.beginPath()
  ctx.arc(64, 64, 56, 0, Math.PI * 2)
  ctx.stroke()
  const texture = new THREE.CanvasTexture(canvas)
  ringTextures.set(key, texture)
  return texture
}

function clearDeco(): void {
  for (const d of decoSprites) {
    decoRoot.remove(d.sprite)
    const material = d.sprite.material as THREE.SpriteMaterial
    material.dispose()
    if (d.sprite instanceof SpriteText && d.sprite.material.map) d.sprite.material.map.dispose()
  }
  decoSprites = []
}

function rebuildDeco(): void {
  if (!graph) return
  clearDeco()

  const labeled = new Set(labeledKey.value ? labeledKey.value.split('\n') : [])
  for (const node of graph.graphData().nodes as G3DNode[]) {
    const worldRadius = (node.radius ?? 8) * NODE_REL_SIZE
    if (node.ring) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: ringTexture(node.ring.color, node.ring.dash || '3 2'),
          transparent: true,
          depthTest: false,
        }),
      )
      sprite.renderOrder = 10
      const d = (worldRadius + (node.ring.radiusOffset ?? 3) * NODE_REL_SIZE + 0.8) * 2
      sprite.scale.set(d, d, 1)
      decoRoot.add(sprite)
      decoSprites.push({ sprite, node })
    }
    if (labeled.has(node.id)) {
      const text = new SpriteText(node.name)
      text.color = theme.text
      text.textHeight = Math.max(2.0, worldRadius * 0.62)
      text.fontWeight = '500'
      decoRoot.add(text)
      decoSprites.push({ sprite: text, node, offsetY: worldRadius + text.textHeight })
    }
  }

  // 选中相邻边的关系标签（对齐 2D showEdgeLabels 语义）
  if (props.showEdgeLabels && selectedId.value) {
    for (const link of graph.graphData().links as G3DLink[]) {
      const label = link.label
      if (!label) continue
      const sid = endpointId(link.source)
      const tid = endpointId(link.target)
      if (sid !== selectedId.value && tid !== selectedId.value) continue
      const text = new SpriteText(label)
      text.color = theme.primary
      text.textHeight = 1.8
      text.material.depthTest = false
      text.renderOrder = 9
      decoRoot.add(text)
      decoSprites.push({ sprite: text, link })
    }
  }
  ensureDecoLoop()
}

/** 装饰层位置逐帧同步（引擎 tick/拖拽导致的节点位移都能跟上；无装饰时空转开销≈0） */
function ensureDecoLoop(): void {
  if (rafId) return
  const tick = (): void => {
    rafId = requestAnimationFrame(tick)
    if (!graph) return
    for (const d of decoSprites) {
      if (d.node) {
        d.sprite.position.set(d.node.x ?? 0, (d.node.y ?? 0) + (d.offsetY ?? 0), d.node.z ?? 0)
      } else if (d.link) {
        const s = d.link.source
        const t = d.link.target
        if (typeof s === 'string' || typeof t === 'string') continue
        d.sprite.position.set((s.x ?? 0) / 2 + (t.x ?? 0) / 2, (s.y ?? 0) / 2 + (t.y ?? 0) / 2, (s.z ?? 0) / 2 + (t.z ?? 0) / 2)
      }
    }
  }
  rafId = requestAnimationFrame(tick)
}

// ==================== 相机（dolly / fit / 百分比读数） ====================

function cameraDistance(): number {
  if (!graph) return 0
  const pos = graph.camera().position
  return controls ? pos.distanceTo(controls.target) : pos.length()
}

function onControlsChange(): void {
  if (!refDistance) return
  const percent = distanceToZoomPercent(cameraDistance(), refDistance)
  if (percent !== zoomPercent.value) {
    zoomPercent.value = percent
    emit('zoom', percent)
  }
}

function zoomAt(factor: number): void {
  if (!graph) return
  const cam = graph.camera().position
  const target = controls?.target
  const dist = target ? cam.distanceTo(target) : cam.length()
  if (!refDistance) refDistance = dist
  const next = clampDollyDistance(dist, factor, refDistance / props.maxZoomScale, refDistance / props.minZoomScale)
  const dir = cam.clone().sub(target ?? new THREE.Vector3()).normalize()
  const nextPos = (target ?? new THREE.Vector3()).clone().add(dir.multiplyScalar(next))
  graph.cameraPosition(nextPos, target ? target.clone() : undefined, 0)
  zoomPercent.value = distanceToZoomPercent(next, refDistance)
  emit('zoom', zoomPercent.value)
}

function fitView(): void {
  if (!graph || props.nodes.length === 0) return
  graph.zoomToFit(FIT_TRANSITION_MS, 80)
  window.clearTimeout(fitTimer)
  fitTimer = window.setTimeout(() => {
    refDistance = cameraDistance() || refDistance
    zoomPercent.value = 100
    emit('zoom', 100)
  }, FIT_TRANSITION_MS + 80)
}

// ==================== 交互（点击/双击/空白/悬停） ====================

let lastClick: { id: string; time: number } | null = null

function toModel(node: G3DNode): ForceGraphNode {
  return { id: node.id, name: node.name, color: node.color, radius: node.radius, ring: node.ring }
}

function onNodeClick(node: G3DNode): void {
  const now = Date.now()
  if (lastClick && lastClick.id === node.id && now - lastClick.time < DBLCLICK_MS) {
    lastClick = null
    emit('dblclick', toModel(node))
    return
  }
  lastClick = { id: node.id, time: now }
  emit('update:selectedId', node.id)
  emit('select', toModel(node))
  emit('click', toModel(node))
}

function onBackgroundClick(): void {
  lastClick = null
  emit('update:selectedId', null)
  emit('select', null)
  emit('background')
}

// ==================== 数据同步（过滤只动可见集；layoutKey 变化 reheat） ====================

function applyForceTuning(): void {
  if (!graph) return
  // d3 force 类型未随库导出,按 duck-typing 调参
  const linkForce = graph.d3Force('link') as unknown as { distance?: (d: number) => void } | undefined
  linkForce?.distance?.(LINK_DISTANCE)
  const chargeForce = graph.d3Force('charge') as unknown as { strength?: (s: number) => void } | undefined
  chargeForce?.strength?.(CHARGE_STRENGTH)
}

function syncData(): void {
  if (!graph) return
  const nodes: G3DNode[] = props.nodes.map((n) => {
    const cached = nodeObjCache.get(n.id)
    if (cached) {
      cached.name = n.name
      cached.color = n.color
      cached.radius = n.radius
      cached.ring = n.ring
      return cached
    }
    const fresh: G3DNode = { id: n.id, name: n.name, color: n.color, radius: n.radius, ring: n.ring }
    nodeObjCache.set(n.id, fresh)
    return fresh
  })
  const links: G3DLink[] = props.edges.map((e) => ({
    source: e.source,
    target: e.target,
    label: e.label,
    title: e.title,
  }))
  graph.graphData({ nodes, links })
  // 不再显式 d3ReheatSimulation:graphData 的 digest 本身会 re-heat(alpha(1) + 恢复
  // 引擎);立即调它会与 1ms 防抖 digest 竞态(layout 未建时 engineRunning 已为 true,
  // 下一帧 tickFrame 在 undefined 上调 .tick 打死渲染循环——黑屏根因)
  rebuildDeco()
}

let didInitialFit = false
let layoutReady = false
function onEngineStop(): void {
  // 首次布局稳定后自动取景（后续过滤/reheat 不再抢相机）
  if (!didInitialFit && props.nodes.length > 0) {
    didInitialFit = true
    fitView()
  }
}

// ==================== 生命周期 ====================

onMounted(() => {
  const el = containerRef.value
  if (!el) return
  resolvePalette()
  const config: ConfigOptions = { controlType: 'orbit', rendererConfig: { antialias: true, alpha: true } }
  // 库 d.ts 以默认泛型发布构造器,业务节点/边模型经断言接入
  const g = new ForceGraph3DLib(el, config) as unknown as G3DInstance
  graph = g
  g.backgroundColor('rgba(0,0,0,0)')
  g.showNavInfo(false)
  g.nodeRelSize(NODE_REL_SIZE)
  g.nodeResolution(NODE_RESOLUTION)
  g.nodeVal((n) => Math.pow(n.radius ?? 8, 3))
  g.nodeColor(nodeVisualColor)
  g.linkColor(linkVisualColor)
  g.nodeLabel((n) => n.name)
  g.linkLabel((l) => l.label || l.title || '')
  g.onNodeClick(onNodeClick)
  g.onBackgroundClick(onBackgroundClick)
  g.onNodeHover((node) => {
    hoveredId.value = node?.id ?? null
  })
  g.onEngineStop(onEngineStop)
  g.onEngineTick(() => {
    layoutReady = true
  })
  g.scene().add(decoRoot)
  applyForceTuning()

  controls = g.controls() as unknown as OrbitLikeControls
  controls?.addEventListener('change', onControlsChange)

  resizeObserver = new ResizeObserver(onResize)
  resizeObserver.observe(el)

  syncData()
})

function onResize(): void {
  const el = containerRef.value
  if (!el || !graph) return
  const w = el.clientWidth
  const h = el.clientHeight
  if (w > 0 && h > 0) graph.width(w).height(h)
}

watch(selectedId, () => {
  if (!graph) return
  // 重设访问器触发节点/边着色重绘（含 rgba 淡化）
  graph.nodeColor(nodeVisualColor)
  graph.linkColor(linkVisualColor)
  rebuildDeco()
})

watch(labeledKey, () => rebuildDeco())

watch(
  () => props.layoutKey,
  () => {
    // 结构键变化 → reheat（从当前布局继续演化）;layout 未就绪时跳过,
    // graphData 的 digest 会自行 reheat
    if (graph && layoutReady) graph.d3ReheatSimulation()
  },
)

watch(() => [props.nodes, props.edges], () => syncData())

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId)
  rafId = 0
  window.clearTimeout(fitTimer)
  resizeObserver?.disconnect()
  resizeObserver = null
  controls?.removeEventListener('change', onControlsChange)
  controls = null
  clearDeco()
  for (const texture of ringTextures.values()) texture.dispose()
  ringTextures.clear()
  graph?._destructor()
  graph = null
})

defineExpose({ zoomAt, fitView, zoomPercent })
</script>

<style scoped lang="scss">
.force-graph3d {
  width: 100%;
  height: 100%;
  min-height: 320px;
  cursor: grab;
}
</style>
