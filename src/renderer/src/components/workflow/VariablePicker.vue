<template>
  <el-popover placement="left" :width="320" trigger="click">
    <template #reference>
      <el-button text size="small" class="picker-btn" title="插入变量">
        <span class="var-brace">{ }</span>
      </el-button>
    </template>
    <div class="var-tree">
      <div v-for="group in groups" :key="group.label" class="var-group">
        <div class="var-group-title">{{ group.label }}</div>
        <div v-for="v in group.items" :key="v.path" class="var-item" @click="$emit('insert', v.path)">
          <span class="var-path">{{ v.path }}</span>
          <span class="var-desc">{{ v.desc }}</span>
        </div>
      </div>
      <div class="var-hint">仅可引用上游节点输出；点击插入到光标处</div>
    </div>
  </el-popover>
</template>

<script setup lang="ts">
/**
 * 变量选择器（A4）：列出可用变量（sys/start/各节点 outputSchema），
 * 点击插入 {{path}} 到目标字段光标处。目录驱动——新组件自动出现。
 */
import { computed } from 'vue'
import type { Node } from '@vue-flow/core'
import { NODE_TYPE_CATALOG_MAP } from '@shared/types/workflow-node-catalog'
import { computeUpstreamNodeIds, type CanvasEdgeLike } from '@/utils/workflow-graph-utils'

const props = defineProps<{
  /** 画布全部节点（数据源） */
  nodes: Node[]
  /** 当前编辑的节点 id（排除自身） */
  excludeNodeId: string
  /** 画布全部边（按上游可达过滤可引用节点） */
  edges?: CanvasEdgeLike[]
}>()
defineEmits<{ (e: 'insert', path: string): void }>()

/** loop 节点的特殊输出（item/index 只在循环体内可用，仍列出并注明） */
const LOOP_FIELDS = [
  { key: 'item', desc: '循环当前元素' },
  { key: 'index', desc: '循环当前下标' },
  { key: 'results', desc: '各迭代结果' },
  { key: 'count', desc: '迭代总数' },
]

const groups = computed(() => {
  // 上游可达集合（沿入边反向 BFS，loop-back 排除）——只允许引用先于当前节点执行的环节
  const upstream = computeUpstreamNodeIds(props.excludeNodeId, props.edges ?? [])
  const startNode = props.nodes.find(n => (n.data as any)?.wfNode?.type === 'start')

  const result: Array<{ label: string; items: Array<{ path: string; desc: string }> }> = [
    {
      label: '系统变量',
      items: [
        { path: 'sys.now', desc: '当前时间（ISO）' },
        { path: 'sys.today', desc: '今天（yyyy-MM-dd）' },
        { path: 'sys.ts', desc: '当前毫秒时间戳' },
      ],
    },
  ]

  // start 输入参数（仅当 start 在当前节点上游可达时显示）
  const startInputs: typeof result[0]['items'] = []
  const inputs = ((startNode?.data as any)?.wfNode?.config?.inputs ?? []) as Array<{
    key: string
    label?: string
    type?: string
  }>
  if (startNode && upstream.has(startNode.id)) {
    for (const i of inputs) {
      if (i.type === 'model') {
        // 模型字段：拆成 providerConfigId / modelId 两个可引用路径
        startInputs.push({ path: `start.${i.key}.providerConfigId`, desc: `${i.label || i.key}·Provider` })
        startInputs.push({ path: `start.${i.key}.modelId`, desc: `${i.label || i.key}·模型` })
      } else {
        startInputs.push({ path: `start.${i.key}`, desc: i.label || i.key })
      }
    }
  }
  if (startInputs.length) result.push({ label: '输入参数', items: startInputs })

  // 各节点输出（outputSchema 目录驱动 + loop 特殊字段）——只列拓扑上游可达节点
  const nodeItems: typeof result[0]['items'] = []
  for (const n of props.nodes) {
    if (n.id === props.excludeNodeId) continue
    if (!upstream.has(n.id)) continue // 后置/未执行环节：不提供引用
    const wf = (n.data as any)?.wfNode
    if (!wf || wf.type === 'start' || wf.type === 'end') continue
    const fields =
      wf.type === 'loop'
        ? LOOP_FIELDS
        : (NODE_TYPE_CATALOG_MAP[wf.type as keyof typeof NODE_TYPE_CATALOG_MAP]?.outputSchema ?? [])
    for (const f of fields) {
      nodeItems.push({ path: `${wf.id}.${f.key}`, desc: `${wf.name}·${f.desc}` })
    }
  }
  if (nodeItems.length) result.push({ label: '节点输出', items: nodeItems })

  return result
})
</script>

<style scoped>
.picker-btn { padding: 0 6px; font-size: 12px; color: var(--el-text-color-secondary); height: 20px; }
.picker-btn:hover { color: var(--el-color-primary); }
.var-brace { font-family: 'JetBrains Mono', Consolas, monospace; font-size: 12px; letter-spacing: .04em; }
.var-tree { max-height: 360px; overflow: auto; }
.var-group-title { font-size: 11px; color: var(--el-text-color-secondary); margin: 8px 0 4px; font-weight: 600; }
.var-item { display: flex; justify-content: space-between; gap: 8px; padding: 5px 6px; border-radius: 4px; cursor: pointer; }
.var-item:hover { background: var(--el-fill-color-light); }
.var-path { font-family: monospace; font-size: 12px; color: var(--el-color-primary); }
.var-desc { font-size: 11px; color: var(--el-text-color-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 140px; }
.var-hint { font-size: 11px; color: var(--el-text-color-placeholder); margin-top: 8px; }
</style>
