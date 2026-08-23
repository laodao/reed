<template>
  <div class="graph-view">
    <div class="graph-toolbar">
      <span class="graph-title">知识图谱</span>
      <div class="graph-controls">
        <span class="filter-label">章节时间轴：</span>
        <el-slider
          v-model="chapterFilter"
          :min="0"
          :max="maxChapter"
          :step="1"
          style="width: 200px"
          :show-tooltip="true"
          @input="applyChapterFilter"
        />
        <span class="filter-value">{{ chapterFilter === 0 ? '全部' : `第 ${chapterFilter} 章` }}</span>
      </div>
      <el-button size="small" :loading="loading" @click="loadGraph">刷新</el-button>
    </div>

    <div v-if="loading" class="graph-loading">加载图谱中...</div>
    <div v-else-if="nodes.length === 0" class="graph-empty">
      暂无图谱数据——完成章节写作并确认后，事件/关系会自动生成
    </div>

    <svg v-else class="graph-svg" :viewBox="`0 0 ${W} ${H}`" @mousedown.self="deselectNode">
      <!-- 边 -->
      <line
        v-for="(edge, i) in visibleEdges"
        :key="`${edge.id || i}`"
        :x1="pos(edge.sourceId).x"
        :y1="pos(edge.sourceId).y"
        :x2="pos(edge.targetId).x"
        :y2="pos(edge.targetId).y"
        class="graph-edge"
        :class="{ dim: selectedNode && edge.sourceId !== selectedNode && edge.targetId !== selectedNode }"
      />
      <!-- 节点 -->
      <g
        v-for="node in nodes"
        :key="node.id"
        class="graph-node"
        :class="{ selected: selectedNode === node.id }"
        :transform="`translate(${pos(node.id).x}, ${pos(node.id).y})`"
        @mousedown.stop="selectNode(node)"
      >
        <circle :r="nodeRadius(node)" :fill="nodeColor(node.type)" class="node-circle" />
        <text :y="nodeRadius(node) + 14" text-anchor="middle" class="node-label">{{ node.name }}</text>
      </g>
    </svg>

    <!-- 节点详情 -->
    <div v-if="selectedInfo" class="node-detail">
      <div class="detail-header">
        <span class="detail-name">{{ selectedInfo.name }}</span>
        <el-tag size="small" :color="nodeColor(selectedInfo.type)" class="detail-tag">{{ typeLabel(selectedInfo.type) }}</el-tag>
        <el-button size="small" text @click="selectedInfo = null"><el-icon><Close /></el-icon></el-button>
      </div>
      <div v-if="selectedInfo.latestState" class="detail-block">
        <div class="detail-label">当前状态（第 {{ selectedInfo.latestState.chapterNumber }} 章）</div>
        <div class="detail-text">{{ selectedInfo.latestState.stateSummary }}</div>
      </div>
      <div v-if="selectedInfo.events?.length" class="detail-block">
        <div class="detail-label">相关事件</div>
        <div v-for="e in selectedInfo.events" :key="e.id" class="detail-text">
          · 第{{ e.chapterNumber }}章 {{ e.name }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 图谱可视化（懒加载：调用方 defineAsyncComponent）
 * 力导向 SVG 自绘（无第三方图库）：节点按类型着色，章节时间轴过滤生效边，点击查看详情。
 */
import { ref, computed, onMounted } from 'vue'
import { Close } from '@element-plus/icons-vue'

const props = defineProps<{
  projectId: string
}>()

const W = 900
const H = 560

interface GraphNode { id: string; type: string; name: string; description?: string }
interface GraphEdge { id: string; sourceId: string; targetId: string; relationType: string; label?: string; validFromChapter?: number; validUntilChapter?: number }

const loading = ref(false)
const nodes = ref<GraphNode[]>([])
const edges = ref<GraphEdge[]>([])
const positions = new Map<string, { x: number; y: number }>()
const chapterFilter = ref(0)
const maxChapter = ref(1)
const selectedNode = ref<string | null>(null)
const selectedInfo = ref<any>(null)

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
  return node.type === 'event' ? 8 : node.type === 'character' ? 7 : 6
}

function pos(id: string): { x: number; y: number } {
  return positions.get(id) || { x: W / 2, y: H / 2 }
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
      // 章节范围：取边的最大章节（事件节点章节暂不参与时间轴）
      const maxEdge = Math.max(0, ...edges.value.map(e => e.validUntilChapter || e.validFromChapter || 0))
      maxChapter.value = Math.max(1, maxEdge)
      layout()
    }
  } finally {
    loading.value = false
  }
}

/** 简单力导向布局：随机初始 + 迭代（排斥 + 边吸引 + 中心引力） */
function layout(): void {
  const n = nodes.value.length
  if (n === 0) return
  positions.clear()
  for (const node of nodes.value) {
    positions.set(node.id, {
      x: W / 2 + (Math.random() - 0.5) * W * 0.6,
      y: H / 2 + (Math.random() - 0.5) * H * 0.6,
    })
  }
  const repulsion = 1200
  const attraction = 0.02
  const center = 0.004
  for (let iter = 0; iter < 120; iter++) {
    const forces = new Map<string, { x: number; y: number }>()
    for (const node of nodes.value) forces.set(node.id, { x: 0, y: 0 })
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = nodes.value[i]
        const b = nodes.value[j]
        const pa = positions.get(a.id)!
        const pb = positions.get(b.id)!
        const dx = pa.x - pb.x
        const dy = pa.y - pb.y
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 20)
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
      const pa = positions.get(edge.sourceId)
      const pb = positions.get(edge.targetId)
      if (!pa || !pb) continue
      const dx = pb.x - pa.x
      const dy = pb.y - pa.y
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 20)
      const f = attraction * dist
      forces.get(edge.sourceId)!.x += (dx / dist) * f
      forces.get(edge.sourceId)!.y += (dy / dist) * f
      forces.get(edge.targetId)!.x -= (dx / dist) * f
      forces.get(edge.targetId)!.y -= (dy / dist) * f
    }
    for (const node of nodes.value) {
      const p = positions.get(node.id)!
      const f = forces.get(node.id)!
      p.x += f.x + (W / 2 - p.x) * center
      p.y += f.y + (H / 2 - p.y) * center
      p.x = Math.min(Math.max(p.x, 30), W - 30)
      p.y = Math.min(Math.max(p.y, 30), H - 30)
    }
  }
}

function applyChapterFilter(): void {
  // 时间轴变化：保留布局（边过滤由 computed 处理）
}

async function selectNode(node: GraphNode): Promise<void> {
  selectedNode.value = node.id
  try {
    const r = await window.electronAPI.longwriting.graphGetNode(props.projectId, node.type, node.id)
    if (r.success && r.data) {
      selectedInfo.value = { ...r.data, type: node.type }
    }
  } catch {
    selectedInfo.value = { ...node, type: node.type }
  }
}

function deselectNode(): void {
  selectedNode.value = null
  selectedInfo.value = null
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
  min-height: 400px;
  background: var(--bg-color);
  border: 1px solid var(--border-color-light);
  border-radius: 10px;
  overflow: hidden;
}

.graph-toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-color-light);

  .graph-title {
    font-size: 15px;
    font-weight: 600;
  }

  .graph-controls {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;

    .filter-label {
      font-size: 12px;
      color: var(--text-color-secondary);
    }

    .filter-value {
      font-size: 12px;
      color: var(--text-color-secondary);
      min-width: 56px;
    }
  }
}

.graph-svg {
  flex: 1;
  width: 100%;
  cursor: grab;
  background: linear-gradient(180deg, var(--bg-color) 0%, var(--fill-color-lighter) 100%);
}

.graph-edge {
  stroke: var(--border-color);
  stroke-width: 1;
  transition: opacity 0.2s;

  &.dim {
    opacity: 0.15;
  }
}

.graph-node {
  cursor: pointer;

  .node-circle {
    stroke: #fff;
    stroke-width: 1.5;
  }

  .node-label {
    font-size: 11px;
    fill: var(--text-color-regular);
  }

  &.selected .node-circle {
    stroke: var(--color-primary);
    stroke-width: 2.5;
  }
}

.graph-loading,
.graph-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-color-placeholder);
  font-size: 13px;
}

.node-detail {
  position: absolute;
  right: 12px;
  top: 56px;
  width: 280px;
  max-height: 70%;
  overflow-y: auto;
  background: var(--bg-color);
  border: 1px solid var(--border-color-light);
  border-radius: 10px;
  padding: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);

  .detail-header {
    display: flex;
    align-items: center;
    gap: 8px;

    .detail-name {
      font-size: 15px;
      font-weight: 600;
      flex: 1;
    }
  }

  .detail-block {
    margin-top: 10px;
  }

  .detail-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-color-secondary);
    margin-bottom: 4px;
  }

  .detail-text {
    font-size: 13px;
    color: var(--text-color-regular);
    line-height: 1.6;
  }
}
</style>
