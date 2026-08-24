<template>
  <div class="graph-view">
    <!-- 工具栏 -->
    <div class="graph-toolbar">
      <span class="graph-title">知识图谱</span>
      <div class="graph-controls">
        <span class="filter-label">章节时间轴：</span>
        <el-slider
          v-model="chapterFilter"
          :min="0"
          :max="maxChapter"
          :step="1"
          style="width: 180px"
          :show-tooltip="true"
        />
        <span class="filter-value">{{ chapterFilter === 0 ? '全部' : `第 ${chapterFilter} 章` }}</span>
      </div>
      <div class="toolbar-actions">
        <!-- 视图缩放控制 -->
        <div class="zoom-controls">
          <el-button size="small" :icon="ZoomOut" circle :disabled="zoomPercent <= 20" title="缩小" @click="zoomAt(1 / 1.2)" />
          <span class="zoom-percent">{{ zoomPercent }}%</span>
          <el-button size="small" :icon="ZoomIn" circle :disabled="zoomPercent >= 500" title="放大" @click="zoomAt(1.2)" />
          <el-button size="small" :icon="FullScreen" circle title="适应视图" @click="fitView" />
        </div>
        <el-button
          size="small"
          type="primary"
          plain
          :loading="generating"
          :disabled="!hasEntities"
          @click="generateRelations"
        >
          <el-icon v-if="!generating"><MagicStick /></el-icon>
          {{ generating ? 'AI 分析实体关系…' : 'AI 分析实体关系' }}
        </el-button>
        <el-button size="small" :loading="loading" @click="loadGraph">刷新</el-button>
      </div>
    </div>

    <div class="graph-main">
      <!-- 左侧：图 -->
      <div class="graph-canvas">
        <div v-if="loading" class="graph-loading">加载图谱中...</div>
        <div v-else-if="nodes.length === 0" class="graph-empty">
          <el-icon><Share /></el-icon>
          <p>暂无图谱数据</p>
          <span>完成设定（人物/地点/物品等）后，点击「AI 分析实体关系」构建关系网络；<br />写完章节后事件会自动挂到图谱上</span>
        </div>

        <svg
          ref="svgRef"
          v-else
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
          <g v-for="(edge, i) in visibleEdges" :key="`e${edge.id || i}`">
            <line
              :x1="pos(edge.sourceId).x"
              :y1="pos(edge.sourceId).y"
              :x2="pos(edge.targetId).x"
              :y2="pos(edge.targetId).y"
              class="graph-edge"
              :class="{
                dim: selectedNode && edge.sourceId !== selectedNode && edge.targetId !== selectedNode,
                active: selectedNode && (edge.sourceId === selectedNode || edge.targetId === selectedNode),
              }"
            >
              <title>{{ edge.relationType }}</title>
            </line>
          </g>
          <!-- 节点 -->
          <g
            v-for="node in visibleNodes"
            :key="node.id"
            class="graph-node"
            :class="{ selected: selectedNode === node.id, highlighted: highlightSet.has(node.id) }"
            :transform="`translate(${pos(node.id).x}, ${pos(node.id).y})`"
            @mousedown.stop="onNodeMouseDown(node, $event)"
          >
            <circle :r="nodeRadius(node)" :fill="nodeColor(node.type)" class="node-circle">
              <title>{{ typeLabel(node.type) }}：{{ node.name }}</title>
            </circle>
            <text :y="nodeRadius(node) + 14" text-anchor="middle" class="node-label">{{ node.name }}</text>
          </g>
        </svg>
      </div>

      <!-- 右侧：实体详情栏 -->
      <aside class="graph-detail" :class="{ empty: !detail }">
        <template v-if="detail">
          <div class="detail-header">
            <span class="detail-name">{{ detail.name }}</span>
            <el-tag size="small" :color="nodeColor(detail.type)" class="detail-tag">{{ typeLabel(detail.type) }}</el-tag>
            <el-button size="small" text class="detail-close" @click="deselectNode"><el-icon><Close /></el-icon></el-button>
          </div>

          <!-- 基本信息 -->
          <div v-if="detail.description" class="detail-block">
            <div class="detail-label">简介</div>
            <div class="detail-text">{{ detail.description }}</div>
          </div>

          <!-- 当前状态（时间轴 N 章时显示该章状态） -->
          <div v-if="detailState" class="detail-block">
            <div class="detail-label">{{ chapterFilter > 0 ? `第 ${chapterFilter} 章状态` : '当前状态' }}（第 {{ detailState.chapterNumber }} 章）</div>
            <div class="detail-text">{{ detailState.stateSummary }}</div>
            <div v-if="detailState.keyChanges?.length" class="key-changes">
              <el-tag v-for="(k, i) in detailState.keyChanges" :key="i" size="small" type="warning" effect="light">{{ k }}</el-tag>
            </div>
          </div>

          <!-- 相关实体 -->
          <div v-if="relatedEntities.length" class="detail-block">
            <div class="detail-label">相关实体（{{ relatedEntities.length }}）</div>
            <div class="relation-list">
              <div
                v-for="rel in relatedEntities"
                :key="rel.key"
                class="relation-item"
                @click="jumpToEntity(rel)"
              >
                <span class="rel-avatar" :style="{ background: nodeColor(rel.type) }">{{ (rel.name || '?').slice(0, 1) }}</span>
                <div class="rel-body">
                  <div class="rel-top">
                    <span class="rel-name">{{ rel.name }}</span>
                    <span class="rel-type">{{ typeLabel(rel.type) }}</span>
                  </div>
                  <div class="rel-relation">
                    {{ rel.relationType }}
                    <span v-if="rel.validFromChapter || rel.validUntilChapter" class="rel-time">
                      （{{ rel.validFromChapter ? `第${rel.validFromChapter}章起` : '开篇起' }}<template v-if="rel.validUntilChapter">～第{{ rel.validUntilChapter }}章</template>）
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 状态时间线（历史快照） -->
          <div v-if="timeline.length" class="detail-block">
            <div class="detail-label">状态历史（{{ timeline.length }} 章快照）</div>
            <div class="timeline-list">
              <div v-for="t in timeline" :key="`${t.chapterNumber}-${t.stateSummary.slice(0, 8)}`" class="timeline-item">
                <span class="timeline-chapter">第{{ t.chapterNumber }}章</span>
                <span class="timeline-state">{{ t.stateSummary }}</span>
              </div>
            </div>
          </div>

          <!-- 相关事件 -->
          <div v-if="detail.events?.length" class="detail-block">
            <div class="detail-label">相关事件（{{ detail.events.length }}）</div>
            <div v-for="e in detail.events" :key="e.id" class="event-item">
              <span class="event-chapter">第{{ e.chapterNumber }}章</span>
              <span class="event-name">{{ e.name }}</span>
            </div>
          </div>
        </template>

        <!-- 空态：未选中 -->
        <div v-else class="detail-placeholder">
          <el-icon><Mouse /></el-icon>
          <p>点击图中的实体查看详情</p>
          <span>显示实体信息、相关实体、状态时间线与事件</span>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 知识图谱（新 Tab 视图）
 * 左图右详情：力导向 SVG 自绘；章节时间轴过滤生效边 + 选中实体按章节显示状态；
 * 点击实体右侧详情栏显示：基本信息/当前状态/相关实体（点击跳转）/状态时间线/相关事件。
 * 「AI 分析实体关系」：调 AI 识别设定关系 → 幂等落库 lw_graph_edges → 刷新图谱。
 */
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Close, MagicStick, Share, Mouse, ZoomIn, ZoomOut, FullScreen } from '@element-plus/icons-vue'

const props = defineProps<{
  projectId: string
}>()

const W = 920
const H = 600

// ==================== 视图缩放/平移（动态 viewBox） ====================

const svgRef = ref<SVGSVGElement | null>(null)
const view = ref({ x: 0, y: 0, w: W, h: H })
const isPanning = ref(false)
let panStart: { x: number; y: number; viewX: number; viewY: number } | null = null

const viewBox = computed(() => `${view.value.x} ${view.value.y} ${view.value.w} ${view.value.h}`)
const zoomPercent = computed(() => Math.round((W / view.value.w) * 100))

function svgSize(): { w: number; h: number } {
  const el = svgRef.value
  return el ? { w: el.clientWidth || W, h: el.clientHeight || H } : { w: W, h: H }
}

/** 以视图中心为锚点缩放（保持 W:H 比例，限制 20%~500%） */
function zoomAt(factor: number): void {
  const nw = clampNum(view.value.w * factor, W * 0.2, W * 5)
  const nh = nw * (H / W)
  view.value = {
    x: view.value.x + (view.value.w - nw) / 2,
    y: view.value.y + (view.value.h - nh) / 2,
    w: nw,
    h: nh,
  }
}

/** 滚轮缩放（锚定鼠标位置） */
function onWheel(e: WheelEvent): void {
  const { w: cw, h: ch } = svgSize()
  const rect = svgRef.value?.getBoundingClientRect()
  if (!rect) return
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
  const nw = clampNum(view.value.w * factor, W * 0.2, W * 5)
  const nh = nw * (H / W)
  // 鼠标所在图坐标（保持不动）
  const gx = view.value.x + (mx / cw) * view.value.w
  const gy = view.value.y + (my / ch) * view.value.h
  view.value = {
    x: gx - (mx / cw) * nw,
    y: gy - (my / ch) * nh,
    w: nw,
    h: nh,
  }
}

/** 空白处按下 → 准备平移 */
function onSvgMouseDown(e: MouseEvent): void {
  panStart = { x: e.clientX, y: e.clientY, viewX: view.value.x, viewY: view.value.y }
  isPanning.value = true
}

/** 节点按下：先高亮；区分"点击选中"与"拖动节点" */
const dragNode = ref<{
  id: string
  startClientX: number
  startClientY: number
  startPosX: number
  startPosY: number
  moved: boolean
} | null>(null)

function onNodeMouseDown(node: GraphNode, e: MouseEvent): void {
  e.stopPropagation()
  selectedNode.value = node.id
  const p = positions.value[node.id] || { x: W / 2, y: H / 2 }
  dragNode.value = {
    id: node.id,
    startClientX: e.clientX,
    startClientY: e.clientY,
    startPosX: p.x,
    startPosY: p.y,
    moved: false,
  }
}

/** 鼠标在图坐标系中的位置（考虑 viewBox 缩放/平移） */
function mouseToGraph(e: MouseEvent): { x: number; y: number } {
  const rect = svgRef.value!.getBoundingClientRect()
  const { w: cw, h: ch } = svgSize()
  return {
    x: view.value.x + ((e.clientX - rect.left) / cw) * view.value.w,
    y: view.value.y + ((e.clientY - rect.top) / ch) * view.value.h,
  }
}

function onSvgMouseMove(e: MouseEvent): void {
  // 节点拖动优先
  if (dragNode.value) {
    const cur = mouseToGraph(e)
    const start = mouseToGraph({ clientX: dragNode.value.startClientX, clientY: dragNode.value.startClientY } as MouseEvent)
    const dx = cur.x - start.x
    const dy = cur.y - start.y
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) dragNode.value.moved = true
    positions.value[dragNode.value.id] = {
      x: dragNode.value.startPosX + dx,
      y: dragNode.value.startPosY + dy,
    }
    return
  }
  if (!panStart) return
  const { w: cw, h: ch } = svgSize()
  const dx = e.clientX - panStart.x
  const dy = e.clientY - panStart.y
  view.value = {
    x: panStart.viewX - (dx / cw) * view.value.w,
    y: panStart.viewY - (dy / ch) * view.value.h,
    w: view.value.w,
    h: view.value.h,
  }
}

function onSvgMouseUp(e: MouseEvent): void {
  if (dragNode.value) {
    if (!dragNode.value.moved) {
      // 未拖动 = 点击节点 → 选中并显示详情
      const node = nodes.value.find(n => n.id === dragNode.value!.id)
      if (node) void selectNode(node)
    }
    dragNode.value = null
    return
  }
  const moved = panStart && (Math.abs(e.clientX - panStart.x) > 4 || Math.abs(e.clientY - panStart.y) > 4)
  if (panStart && !moved) {
    // 未拖拽 = 点击空白 → 取消选中
    deselectNode()
  }
  panStart = null
  isPanning.value = false
}

/** 适应视图（重置） */
function fitView(): void {
  view.value = { x: 0, y: 0, w: W, h: H }
}

function clampNum(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max)
}

interface GraphNode { id: string; type: string; name: string; description?: string; chapterNumber?: number }
interface GraphEdge { id: string; sourceId: string; targetId: string; relationType: string; label?: string; validFromChapter?: number; validUntilChapter?: number }

interface RelatedEntity {
  key: string
  name: string
  type: string
  relationType: string
  neighborId: string
  validFromChapter?: number
  validUntilChapter?: number
}

const loading = ref(false)
const generating = ref(false)
const nodes = ref<GraphNode[]>([])
const edges = ref<GraphEdge[]>([])
/** 节点位置（响应式：布局 + 手动拖动共用；键 = 节点 id） */
const positions = ref<Record<string, { x: number; y: number }>>({})
const chapterFilter = ref(0)
const maxChapter = ref(1)
const selectedNode = ref<string | null>(null)
const detail = ref<any>(null)
const relatedEntities = ref<RelatedEntity[]>([])
const timeline = ref<Array<{ chapterNumber: number; stateSummary: string; keyChanges?: string[] }>>([])
const detailState = ref<any>(null)

const hasEntities = computed(() => nodes.value.length > 0)

/** 时间轴节点过滤：事件节点只在"发生章节 ≤ 当前章节"时显示（实体节点无章节概念常显） */
const visibleNodes = computed(() => {
  if (chapterFilter.value === 0) return nodes.value
  const cn = chapterFilter.value
  return nodes.value.filter(n => n.type !== 'event' || (n.chapterNumber !== undefined && n.chapterNumber <= cn))
})

const highlightSet = computed(() => {
  const set = new Set<string>()
  if (!selectedNode.value) return set
  for (const e of edges.value) {
    if (e.sourceId === selectedNode.value) set.add(e.targetId)
    if (e.targetId === selectedNode.value) set.add(e.sourceId)
  }
  return set
})

const nodeColor = (type: string): string => {
  const colors: Record<string, string> = {
    character: '#409EFF', location: '#67C23A', item: '#E6A23C',
    faction: '#909399', skill: '#B37FEB', event: '#F56C6C',
  }
  return colors[type] || '#909399'
}

function typeLabel(type: string): string {
  const labels: Record<string, string> = {
    character: '人物', location: '地点', item: '物品',
    faction: '势力', skill: '技能', event: '事件',
  }
  return labels[type] || type
}

function nodeRadius(node: GraphNode): number {
  return node.type === 'event' ? 7 : node.type === 'character' ? 9 : 7
}

function pos(id: string): { x: number; y: number } {
  return positions.value[id] || { x: W / 2, y: H / 2 }
}

const visibleEdges = computed(() => {
  if (chapterFilter.value === 0) return edges.value
  const cn = chapterFilter.value
  return edges.value.filter(e =>
    (e.validFromChapter === undefined || e.validFromChapter <= cn) &&
    (e.validUntilChapter === undefined || e.validUntilChapter >= cn),
  )
})

async function loadGraph(): Promise<void> {
  loading.value = true
  try {
    const r = await window.electronAPI.longwriting.graphGet(props.projectId)
    if (r.success && r.data) {
      nodes.value = r.data.nodes || []
      edges.value = r.data.edges || []
      const maxEdge = Math.max(0, ...edges.value.map(e => e.validUntilChapter || e.validFromChapter || 0))
      maxChapter.value = Math.max(1, maxEdge)
      layout()
      // 若当前选中实体还在，刷新其详情
      if (selectedNode.value) {
        const node = nodes.value.find(n => n.id === selectedNode.value)
        if (node) await selectNode(node)
        else deselectNode()
      }
    }
  } finally {
    loading.value = false
  }
}

/**
 * 力导向布局（排斥 + 边吸引 + 中心引力 + 碰撞检测防重叠）。
 * 每轮迭代后执行子迭代碰撞分离：节点间距 < 最小距离（圆半径和 + 标签空间）则互相推开，
 * 确保最终布局无重叠。布局结果写入响应式 positions（手动拖动基于同一数据源）。
 */
function layout(): void {
  const n = nodes.value.length
  if (n === 0) return
  const next: Record<string, { x: number; y: number }> = {}
  for (const node of nodes.value) {
    next[node.id] = {
      x: W / 2 + (Math.random() - 0.5) * W * 0.6,
      y: H / 2 + (Math.random() - 0.5) * H * 0.6,
    }
  }
  const repulsion = 1400
  const attraction = 0.02
  const center = 0.004

  for (let iter = 0; iter < 200; iter++) {
    const forces = new Map<string, { x: number; y: number }>()
    for (const node of nodes.value) forces.set(node.id, { x: 0, y: 0 })
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = nodes.value[i]
        const b = nodes.value[j]
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
    for (const edge of visibleEdges.value) {
      const pa = next[edge.sourceId]
      const pb = next[edge.targetId]
      if (!pa || !pb) continue
      const dx = pb.x - pa.x
      const dy = pb.y - pa.y
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 24)
      const f = attraction * dist
      forces.get(edge.sourceId)!.x += (dx / dist) * f
      forces.get(edge.sourceId)!.y += (dy / dist) * f
      forces.get(edge.targetId)!.x -= (dx / dist) * f
      forces.get(edge.targetId)!.y -= (dy / dist) * f
    }
    // 应用力 + 中心引力
    for (const node of nodes.value) {
      const p = next[node.id]
      const f = forces.get(node.id)!
      p.x += f.x + (W / 2 - p.x) * center
      p.y += f.y + (H / 2 - p.y) * center
    }
    // 碰撞检测（子迭代直到无重叠）：节点圆 + 标签空间防重叠
    for (let sub = 0; sub < 6; sub++) {
      if (!collidePass(next)) break
    }
    // 边界约束
    for (const node of nodes.value) {
      const p = next[node.id]
      p.x = Math.min(Math.max(p.x, 34), W - 34)
      p.y = Math.min(Math.max(p.y, 34), H - 34)
    }
  }
  // 收尾：纯碰撞分离（无力导向干扰），确保最终布局严格无重叠
  for (let sub = 0; sub < 12; sub++) {
    if (!collidePass(next)) break
  }
  positions.value = next
}

/**
 * 一轮碰撞分离：节点间距 < 最小距离则互相推开。
 * @returns 是否有节点发生移动
 */
function collidePass(next: Record<string, { x: number; y: number }>): boolean {
  const n = nodes.value.length
  let moved = false
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = nodes.value[i]
      const b = nodes.value[j]
      const pa = next[a.id]
      const pb = next[b.id]
      const dx = pb.x - pa.x
      const dy = pb.y - pa.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      const minDist = (nodeRadius(a) + nodeRadius(b)) * 2 + 16
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

/** 选中实体：拉详情 + 相关实体 + 时间线 + 章节状态 */
async function selectNode(node: GraphNode): Promise<void> {
  selectedNode.value = node.id
  try {
    const r = await window.electronAPI.longwriting.graphGetNode(props.projectId, node.type, node.id)
    detail.value = r.success && r.data ? { ...r.data, type: node.type } : { ...node, type: node.type }
  } catch {
    detail.value = { ...node, type: node.type }
  }

  // 相关实体（邻居，含边的时间线信息）
  relatedEntities.value = []
  try {
    const rr = await window.electronAPI.longwriting.graphGetRelations(props.projectId, node.type, node.id)
    if (rr.success && Array.isArray(rr.data)) {
      relatedEntities.value = rr.data
        .map((e: any, idx: number) => {
          const isSource = e.sourceId === node.id
          const neighborId = isSource ? e.targetId : e.sourceId
          const neighborType = isSource ? e.targetType : e.sourceType
          const neighbor = nodes.value.find(x => x.id === neighborId)
          if (!neighbor) return null
          return {
            key: `${e.id || idx}-${e.relationType}`,
            name: neighbor.name,
            type: neighborType,
            relationType: e.relationType,
            neighborId,
            validFromChapter: e.validFromChapter,
            validUntilChapter: e.validUntilChapter,
          }
        })
        .filter(Boolean)
    }
  } catch { /* 忽略 */ }

  // 状态时间线（历史快照：每章结束该实体的状态，升序）
  timeline.value = []
  try {
    const tr = await window.electronAPI.longwriting.graphGetTimeline(props.projectId, node.type, node.id)
    if (tr.success && Array.isArray(tr.data)) {
      timeline.value = tr.data
    }
  } catch { /* 忽略 */ }

  await refreshDetailState()
}

/** 刷新选中实体的章节状态（时间轴联动：切章节时调用） */
async function refreshDetailState(): Promise<void> {
  if (!selectedNode.value || !detail.value) return
  detailState.value = null
  try {
    if (chapterFilter.value > 0) {
      const sr = await window.electronAPI.longwriting.graphGetStateAtChapter(props.projectId, detail.value.type, selectedNode.value, chapterFilter.value)
      if (sr.success && sr.data) detailState.value = sr.data
    } else if (detail.value?.latestState) {
      detailState.value = detail.value.latestState
    }
  } catch { /* 忽略 */ }
}

/** 时间轴变化：边/节点过滤由 computed 自动处理，刷新选中实体的章节状态 */
watch(chapterFilter, () => {
  if (selectedNode.value) {
    void refreshDetailState()
  }
})

function jumpToEntity(rel: { neighborId: string }): void {
  const node = nodes.value.find(x => x.id === rel.neighborId)
  if (node) void selectNode(node)
}

function deselectNode(): void {
  selectedNode.value = null
  detail.value = null
  relatedEntities.value = []
  timeline.value = []
  detailState.value = null
}

/** AI 分析实体关系 → 幂等落库 → 刷新 */
async function generateRelations(): Promise<void> {
  if (generating.value) return
  generating.value = true
  const eventId = `graph-rel-${props.projectId}-${Date.now()}`
  // 流式进度提示（AI 生成中）
  const unsub = window.electronAPI.longwriting.onGenerateEvent(eventId, (ev: any) => {
    if (ev.type === 'error') {
      ElMessage.error(ev.error || '关系分析失败')
    }
  })
  try {
    const r = await window.electronAPI.longwriting.graphGenerateRelations(eventId, props.projectId)
    if (r.success && r.data) {
      const { created, skipped } = r.data
      ElMessage.success(`已建立 ${created} 条实体关系${skipped > 0 ? `（跳过 ${skipped} 条无效/重复）` : ''}`)
      await loadGraph()
    } else {
      ElMessage.error(r.error || '关系分析失败')
    }
  } catch (e: any) {
    ElMessage.error(e.message || '关系分析失败')
  } finally {
    unsub()
    generating.value = false
  }
}

onMounted(() => {
  loadGraph()
})
</script>

<style lang="scss" scoped>
.graph-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 480px;
  background: var(--bg-color);
  border: 1px solid var(--border-color-light);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.graph-toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-color-lighter);
  flex-wrap: wrap;

  .graph-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-color-primary);
  }

  .graph-controls {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 260px;

    .filter-label {
      font-size: 12px;
      color: var(--text-color-secondary);
      white-space: nowrap;
    }

    .filter-value {
      font-size: 12px;
      color: var(--text-color-secondary);
      min-width: 56px;
      white-space: nowrap;
    }
  }

  .toolbar-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .zoom-controls {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    border-radius: var(--radius-full);
    background: var(--fill-color-lighter);
    border: 1px solid var(--border-color-lighter);

    .zoom-percent {
      min-width: 44px;
      text-align: center;
      font-size: 12px;
      color: var(--text-color-secondary);
      font-variant-numeric: tabular-nums;
    }

    :deep(.el-button) {
      margin-left: 0;
    }
  }
}

.graph-main {
  flex: 1;
  min-height: 0;
  display: flex;
}

// ==================== 图区 ====================

.graph-canvas {
  flex: 1;
  min-width: 0;
  position: relative;
}

.graph-svg {
  width: 100%;
  height: 100%;
  cursor: grab;
  background: linear-gradient(180deg, var(--bg-color) 0%, var(--fill-color-lighter) 100%);

  &.panning {
    cursor: grabbing;
  }
}

.graph-edge {
  stroke: var(--border-color);
  stroke-width: 1;
  transition: opacity 0.2s, stroke 0.2s;

  &.dim {
    opacity: 0.12;
  }

  &.active {
    stroke: var(--color-primary);
    stroke-width: 1.6;
    opacity: 0.85;
  }
}

.graph-node {
  cursor: pointer;
  transition: opacity 0.2s;

  .node-circle {
    stroke: #fff;
    stroke-width: 1.5;
  }

  .node-label {
    font-size: 11px;
    fill: var(--text-color-regular);
    pointer-events: none;
  }

  &.selected .node-circle {
    stroke: var(--color-primary);
    stroke-width: 3;
  }

  &:not(.selected):not(.highlighted) {
    opacity: 0.75;
  }

  &.highlighted:not(.selected) .node-circle {
    stroke-width: 2.5;
    stroke-dasharray: 3 2;
  }
}

.graph-loading,
.graph-empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-color-placeholder);
  font-size: 13px;
  text-align: center;

  .el-icon {
    font-size: 32px;
    opacity: 0.5;
  }

  p {
    margin: 4px 0 0;
    color: var(--text-color-secondary);
    font-size: 14px;
  }

  span {
    font-size: 12px;
    line-height: 1.8;
  }
}

// ==================== 详情栏 ====================

.graph-detail {
  width: 320px;
  flex-shrink: 0;
  border-left: 1px solid var(--border-color-lighter);
  background: var(--bg-color);
  overflow-y: auto;
  padding: 14px;
}

.detail-placeholder {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--text-color-placeholder);
  text-align: center;

  .el-icon {
    font-size: 30px;
    opacity: 0.4;
  }

  p {
    margin: 4px 0 0;
    color: var(--text-color-secondary);
    font-size: 13px;
  }

  span {
    font-size: 12px;
  }
}

.detail-header {
  display: flex;
  align-items: center;
  gap: 8px;

  .detail-name {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-color-primary);
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .detail-tag {
    border: none;
    color: #fff;
    font-size: 11px;
  }

  .detail-close {
    color: var(--text-color-placeholder);
  }
}

.detail-block {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed var(--border-color-lighter);

  .detail-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-color-secondary);
    margin-bottom: 6px;
  }

  .detail-text {
    font-size: 13px;
    color: var(--text-color-regular);
    line-height: 1.7;
    white-space: pre-wrap;
  }
}

.key-changes {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}

// 相关实体

.relation-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.relation-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--radius-md);
  background: var(--fill-color-lighter);
  border: 1px solid var(--border-color-lighter);
  cursor: pointer;
  transition: all var(--transition-fast);

  &:hover {
    border-color: var(--color-primary-light-5);
    transform: translateX(2px);
  }
}

.rel-avatar {
  width: 30px;
  height: 30px;
  border-radius: var(--radius-full);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.rel-body {
  flex: 1;
  min-width: 0;
}

.rel-top {
  display: flex;
  align-items: center;
  gap: 6px;

  .rel-name {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-color-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .rel-type {
    font-size: 11px;
    color: var(--text-color-placeholder);
    flex-shrink: 0;
  }
}

.rel-relation {
  font-size: 11px;
  color: var(--color-primary);
  margin-top: 2px;

  .rel-time {
    color: var(--text-color-placeholder);
    font-size: 10.5px;
  }
}

// 时间线

.timeline-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 240px;
  overflow-y: auto;
  padding-right: 4px;
}

.timeline-item {
  display: flex;
  gap: 8px;
  font-size: 12.5px;
  padding: 4px 0;

  .timeline-chapter {
    color: var(--color-primary);
    flex-shrink: 0;
    font-weight: 500;
  }

  .timeline-state {
    color: var(--text-color-regular);
    line-height: 1.5;
  }
}

// 事件

.event-item {
  display: flex;
  gap: 8px;
  font-size: 12.5px;
  padding: 4px 0;

  .event-chapter {
    color: var(--color-danger);
    flex-shrink: 0;
    font-weight: 500;
  }

  .event-name {
    color: var(--text-color-regular);
  }
}
</style>
