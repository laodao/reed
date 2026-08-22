/**
 * 节点装配：全量注册表工厂
 * @module core/modules/workflow/nodes/index
 * @description 片7 的 IPC 接线与引擎服务用同一工厂装配，
 * 保证任何入口看到的节点集合一致。
 */

import { createNodeRegistry, checkRegistryConsistency } from '../engine/node-registry'
import type { WorkflowNodeRegistry } from '../engine/node-registry'
import { CONTROL_NODE_HANDLERS } from './control-nodes'
import { TASK_NODE_HANDLERS } from './task-nodes'
import { AI_NODE_HANDLERS } from './ai-nodes'
import { EXTRA_NODE_HANDLERS } from './extra-nodes'
import { A2_NODE_HANDLERS } from './a2-nodes'
import { OAS_NODE_HANDLERS } from './oas-nodes'
import { INTERACTION_NODE_HANDLERS } from './interaction-nodes'
import { MEDIA_NODE_HANDLERS } from './media-nodes'
import { TOOL_NODE_HANDLERS } from './tool-nodes'
import { CODE_NODE_HANDLERS } from './code-nodes'
import { SUB_WORKFLOW_NODE_HANDLERS } from './sub-workflow-nodes'
import { VARIABLE_NODE_HANDLERS } from './variable-nodes'
import { ASSET_NODE_HANDLERS } from './asset-nodes'

/** 创建注册了全部内置节点的注册表 */
export function createFullNodeRegistry(): WorkflowNodeRegistry {
  return createNodeRegistry([...CONTROL_NODE_HANDLERS, ...TASK_NODE_HANDLERS, ...AI_NODE_HANDLERS, ...EXTRA_NODE_HANDLERS, ...A2_NODE_HANDLERS, ...OAS_NODE_HANDLERS, ...INTERACTION_NODE_HANDLERS, ...MEDIA_NODE_HANDLERS, ...TOOL_NODE_HANDLERS, ...CODE_NODE_HANDLERS, ...SUB_WORKFLOW_NODE_HANDLERS, ...VARIABLE_NODE_HANDLERS, ...ASSET_NODE_HANDLERS])
}

/** 启动自检：目录与 handler 全量一致性（有问题说明代码与目录漂移，拒绝启动） */
export function assertNodeRegistryConsistent(registry: WorkflowNodeRegistry): void {
  const problems = checkRegistryConsistency(registry)
  if (problems.length > 0) {
    throw new Error(`[WorkflowNodes] 节点目录一致性检查失败：\n${problems.join('\n')}`)
  }
}
