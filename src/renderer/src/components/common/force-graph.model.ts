/**
 * 公共力导向图谱数据类型
 * @module components/common/force-graph.model
 * @description ForceGraph.vue 与各宿主（Atlas / 长文知识图谱）共用的图模型契约。
 *              独立成 .ts 便于宿主类型导入（SFC <script setup> 无法导出类型供
 *              其它模块 import）。
 */

/** 公共节点模型（宿主做类型→颜色/半径的映射后传入） */
export interface ForceGraphNode {
  id: string
  name: string
  color: string
  radius?: number
  /** 外圈（如掌握度学习态 / 高亮环）；radiusOffset 为相对半径的额外距离 */
  ring?: { color: string; radiusOffset?: number; dash?: string }
}

/** 公共边模型（source/target 为节点 id） */
export interface ForceGraphEdge {
  id?: string
  source: string
  target: string
  label?: string
  /** 悬停提示（可选） */
  title?: string
}
