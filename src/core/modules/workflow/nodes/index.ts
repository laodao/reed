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

/** 创建注册了全部 21 个内置节点的注册表 */
export function createFullNodeRegistry(): WorkflowNodeRegistry {
  return createNodeRegistry([...CONTROL_NODE_HANDLERS, ...TASK_NODE_HANDLERS, ...AI_NODE_HANDLERS, ...EXTRA_NODE_HANDLERS])
}

/** 启动自检：目录与 handler 全量一致性（有问题说明代码与目录漂移，拒绝启动） */
export function assertNodeRegistryConsistent(registry: WorkflowNodeRegistry): void {
  const problems = checkRegistryConsistency(registry)
  if (problems.length > 0) {
    throw new Error(`[WorkflowNodes] 节点目录一致性检查失败：\n${problems.join('\n')}`)
  }
}
