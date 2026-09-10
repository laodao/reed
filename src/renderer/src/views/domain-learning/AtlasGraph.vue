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
        <el-button size="small" :icon="ZoomOut" circle title="缩小" @click="graphRef?.zoomAt(1 / 1.2)" />
        <span class="zoom-percent">{{ zoomPercent }}%</span>
        <el-button size="small" :icon="ZoomIn" circle title="放大" @click="graphRef?.zoomAt(1.2)" />
        <el-button size="small" :icon="FullScreen" circle title="适应视图" @click="graphRef?.fitView()" />
      </div>
    </div>

    <div v-if="nodes.length === 0" class="graph-empty">
      <el-icon><Share /></el-icon>
      <p>暂无图谱数据</p>
    </div>
    <ForceGraph
      v-else
      ref="graphRef"
      class="graph-canvas"
      :nodes="fgNodes"
      :edges="fgEdges"
      :width="1000"
      :height="640"
      :min-zoom-scale="0.15"
      :max-zoom-scale="8"
      :show-edge-labels="true"
      :selected-id="selectedId"
      :layout-key="props.focusId ?? 'all'"
      @update:selected-id="selectedId = $event"
      @select="onGraphSelect"
      @dblclick="onGraphDblclick"
      @zoom="zoomPercent = $event"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * Atlas 图谱（力导向自绘；图引擎由公共 ForceGraph 提供）
 * @module views/domain-learning/AtlasGraph
 * @description M2-D 抽取公共 ForceGraph 后的薄壳：保留对外契约
 *              （props nodes/edges/focusId；emits select/dblclick）与图例/缩放工具栏，
 *              数据映射 = dl 节点 → 公共模型（类型色/掌握度外圈/关系标签）。focus 过滤
 *              （子图谱 = 节点 + 一阶邻居）仍由本层做。
 */
import { computed, ref, watch } from 'vue'
import { ZoomIn, ZoomOut, FullScreen, Share } from '@element-plus/icons-vue'
import ForceGraph from '@/components/common/ForceGraph.vue'
import type { ForceGraphEdge, ForceGraphNode } from '@/components/common/force-graph.model'
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

const graphRef = ref<InstanceType<typeof ForceGraph> | null>(null)
/** 缩放百分比（由公共组件 zoom 事件回传，驱动按钮读数） */
const zoomPercent = ref(100)

// ==================== 可见性（focus 子图谱过滤） ====================

const visibleNodes = computed(() => {
  if (!props.focusId) return props.nodes
  const focus = props.nodes.find((n) => n.id === props.focusId)
  if (!focus) return props.nodes
  const neighbors = new Set<string>()
  for (const e of props.edges) {
    if (e.source === props.focusId) neighbors.add(e.target)
    if (e.target === props.focusId) neighbors.add(e.source)
  }
  return props.nodes.filter((n) => n.id === props.focusId || neighbors.has(n.id))
})

const visibleEdges = computed(() => {
  const ids = new Set(visibleNodes.value.map((n) => n.id))
  return props.edges.filter((e) => ids.has(e.source) && ids.has(e.target))
})

// ==================== 数据映射（dl → 公共模型） ====================

const fgNodes = computed<ForceGraphNode[]>(() =>
  visibleNodes.value.map((n) => ({
    id: n.id,
    name: n.name,
    color: nodeTypeMeta(n.nodeType).color,
    radius: 9,
    ...(n.mastery === 'learning' ? { ring: { color: '#E6A23C', radiusOffset: 3, dash: '3 2' } } : {}),
  })),
)

const fgEdges = computed<ForceGraphEdge[]>(() =>
  visibleEdges.value.map((e) => ({ source: e.source, target: e.target, label: relLabel(e.type) })),
)

// ==================== 选中态 ====================

const selectedId = ref<string | null>(props.focusId ?? null)
watch(
  () => props.focusId,
  (v) => (selectedId.value = v ?? null),
)

function onGraphSelect(node: ForceGraphNode | null): void {
  if (!node) {
    emit('select', null)
    return
  }
  // 还原原始 dl 节点（图内只传模型子集；Focus 模式以外按全量找）
  const orig = props.nodes.find((n) => n.id === node.id)
  emit('select', orig ?? null)
}

function onGraphDblclick(node: ForceGraphNode): void {
  const orig = props.nodes.find((n) => n.id === node.id)
  if (orig) emit('dblclick', orig)
}

/** 图例类型（按出现序） */
const legendTypes = computed<DlNodeType[]>(() => {
  const seen: DlNodeType[] = []
  for (const n of props.nodes) {
    if (!seen.includes(n.nodeType)) seen.push(n.nodeType)
  }
  return seen
})
</script>

<style scoped lang="scss">
.atlas-graph {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 380px;
  overflow: hidden;
}

.graph-canvas {
  flex: 1;
  min-height: 0;
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
</style>
