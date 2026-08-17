/**
 * 控制流语义集中表（引擎对控制类型特判的唯一集中地）
 * @module core/modules/workflow/engine/control-semantics
 * @description 引擎核心（pump/就绪/输出构造）对控制节点的全部特殊语义
 *              集中在这张表——新增控制类型时：表加一行 + 实现其语义，
 *              不再散落 if(type===X) 于调度代码各处。
 *
 *              V2 扩展路径：当子工作流/while 循环等真实需求落地时，
 *              把本表记录类型提升为公开的 ControlFlowHandler 接口（机械提升）。
 */

import type { WorkflowNodeType } from '@shared/types/workflow.types'
import { WORKFLOW_NODE_TYPES } from '@shared/types/workflow.types'

/** 控制流语义标记 */
export interface ControlFlowSemantics {
  /** 仅在根作用域调度（start） */
  rootOnly?: boolean
  /** 引擎直接驱动（不走 handler.execute；作用域机器生效）——loop 专属 */
  engineDriven?: boolean
  /** 输出由引擎按到达记录构造（parallel-merge 专属） */
  mergeOutput?: boolean
}

const EMPTY: ControlFlowSemantics = {}

/** 全部控制特判的单一来源 */
export const CONTROL_SEMANTICS: Partial<Record<WorkflowNodeType, ControlFlowSemantics>> = {
  [WORKFLOW_NODE_TYPES.start]: { rootOnly: true },
  [WORKFLOW_NODE_TYPES.loop]: { engineDriven: true },
  [WORKFLOW_NODE_TYPES['parallel-merge']]: { mergeOutput: true },
}

/** 语义查取（无记录 = 常规节点，无特殊语义） */
export function semOf(type: WorkflowNodeType): ControlFlowSemantics {
  return CONTROL_SEMANTICS[type] ?? EMPTY
}
