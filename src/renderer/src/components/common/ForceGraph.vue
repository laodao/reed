<template>
  <ForceGraph2DSvg
    v-if="mode === '2d'"
    ref="impl2dRef"
    :nodes="nodes"
    :edges="edges"
    :width="width"
    :height="height"
    :min-zoom-scale="minZoomScale"
    :max-zoom-scale="maxZoomScale"
    :show-edge-labels="showEdgeLabels"
    :selected-id="selectedId"
    :layout-key="layoutKey"
    @update:selected-id="emit('update:selectedId', $event)"
    @select="emit('select', $event)"
    @click="emit('click', $event)"
    @dblclick="emit('dblclick', $event)"
    @background="emit('background')"
    @zoom="emit('zoom', $event)"
  />
  <ForceGraph3DImpl
    v-else
    ref="impl3dRef"
    :nodes="nodes"
    :edges="edges"
    :min-zoom-scale="minZoomScale"
    :max-zoom-scale="maxZoomScale"
    :show-edge-labels="showEdgeLabels"
    :selected-id="selectedId"
    :layout-key="layoutKey"
    @update:selected-id="emit('update:selectedId', $event)"
    @select="emit('select', $event)"
    @click="emit('click', $event)"
    @dblclick="emit('dblclick', $event)"
    @background="emit('background')"
    @zoom="emit('zoom', $event)"
  />
</template>

<script setup lang="ts">
/**
 * 统一图谱能力（力导向图渲染门面）
 * @module components/common/ForceGraph
 * @description 长文知识图谱（GraphView）与领域学习 Atlas（AtlasGraph）共用的图渲染
 *              基座。对外 API 契约自抽取以来保持稳定：节点/边经 model 参数化
 *              （color/radius/ring/edge label），交互面 = 选中高亮一阶邻居+其余淡化、
 *              单击/双击上抛、空白取消选中、zoomAt/fitView + zoomPercent 读数。
 *
 *              渲染模式（mode）：'3d'（默认，WebGL，three.js + d3-force-3d 增量模拟，
 *              大图治密：3D 空间摊开 + 标签分级）与 '2d'（自绘 SVG 兜底，逻辑在
 *              ForceGraph2DSvg）。3D 实现经 defineAsyncComponent 拆独立 chunk，
 *              three.js 不进首屏。宿主职责不变：数据获取与可见性过滤（focus/章节/
 *              类型）、图例/过滤工具栏、详情面板。
 */
import { computed, defineAsyncComponent, ref } from 'vue'
import ForceGraph2DSvg from './ForceGraph2DSvg.vue'
import type { ForceGraphEdge, ForceGraphNode, ForceGraphImplExpose } from './force-graph.model'

const ForceGraph3DImpl = defineAsyncComponent(() => import('./ForceGraph3DImpl.vue'))

const props = withDefaults(
  defineProps<{
    nodes: ForceGraphNode[]
    edges: ForceGraphEdge[]
    /** 逻辑视口宽高（2D viewBox 坐标系；3D 填满容器仅作兼容保留） */
    width?: number
    height?: number
    minZoomScale?: number
    maxZoomScale?: number
    /** 选中节点时在相邻边上显示关系标签 */
    showEdgeLabels?: boolean
    /** 受控选中 id（null = 无选中）；配合 update:selectedId 双向 */
    selectedId?: string | null
    /** 结构重排触发键：数据装载/下钻等结构性变化时宿主改它触发重布局；
     *  同一布局键下仅增删过滤（如章节时间轴）不重排，保持位置稳定 */
    layoutKey?: string | number
    /** 渲染模式：默认 3D（WebGL）；2D SVG 兜底 */
    mode?: '2d' | '3d'
  }>(),
  {
    width: 920,
    height: 600,
    minZoomScale: 0.2,
    maxZoomScale: 5,
    showEdgeLabels: false,
    selectedId: null,
    layoutKey: undefined,
    mode: '3d',
  },
)

const emit = defineEmits<{
  'update:selectedId': [id: string | null]
  /** 节点被按下即选中（高亮/淡化立即生效；宿主可据此即时更新侧栏或仅标记） */
  select: [node: ForceGraphNode | null]
  /** 节点单击未拖动（宿主开详情等"确认式"动作用） */
  click: [node: ForceGraphNode]
  /** 双击（下钻/子图谱） */
  dblclick: [node: ForceGraphNode]
  /** 点击空白（取消选中） */
  background: []
  /** 缩放比例变化（宿主按钮 disabled / 百分比读数用） */
  zoom: [percent: number]
}>()

const impl2dRef = ref<InstanceType<typeof ForceGraph2DSvg> | null>(null)
const impl3dRef = ref<ForceGraphImplExpose | null>(null)

const zoomPercent = computed(() => (props.mode === '2d' ? impl2dRef.value?.zoomPercent : impl3dRef.value?.zoomPercent) ?? 100)
const view = computed(() => (props.mode === '2d' ? impl2dRef.value?.view : undefined))

function zoomAt(factor: number): void {
  if (props.mode === '2d') impl2dRef.value?.zoomAt(factor)
  else impl3dRef.value?.zoomAt(factor)
}

function fitView(): void {
  if (props.mode === '2d') impl2dRef.value?.fitView()
  else impl3dRef.value?.fitView()
}

defineExpose({ zoomAt, fitView, zoomPercent, view })
</script>
