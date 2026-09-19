/**
 * 节点装配：平台通用注册表 + 业务包贡献扩展点
 * @module core/platform/workflow/nodes/index
 * @description 片7 的 IPC 接线与引擎服务用同一工厂装配，
 * 保证任何入口看到的节点集合一致。
 *
 * 分层纪律（2026-09-18）：本目录只放业务无关的通用节点 handler；
 * 业务专用节点（chapter-writing / volume-design 等）的实现与注册归
 * 业务包——pack activate 时调 registerPackNodeHandlers() 注入，
 * createFullNodeRegistry() 合并。boot 序保证（initPackSubsystem 先于
 * initWorkflowSubsystem），注册在启动自检 assertNodeRegistryConsistent
 * 之前完成，目录一致性检查照常全量覆盖。
 */

import { createNodeRegistry, checkRegistryConsistency } from '../engine/node-registry'
import type { WorkflowNodeRegistry } from '../engine/node-registry'
import type { WorkflowNodeHandler } from '../engine/node-handler'
import { CONTROL_NODE_HANDLERS } from './control-nodes'
import { TASK_NODE_HANDLERS } from './task-nodes'
import { AI_NODE_HANDLERS } from './ai-nodes'
import { AGENT_LOOP_NODE_HANDLERS } from './agent-loop-node'
import { VOICE_CLONE_NODE_HANDLERS } from './voice-clone-nodes'
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
import { DIARY_NODE_HANDLERS } from './diary-nodes'
import { NEWS_NODE_HANDLERS } from './news-nodes'
import { SKILL_NODE_HANDLERS } from './skill-nodes'
import { VIDEO_NODE_HANDLERS } from './video-nodes'

/** 平台通用节点 handler（业务无关；业务 handler 走 pack 贡献） */
const PLATFORM_NODE_HANDLERS: WorkflowNodeHandler[] = [
  ...CONTROL_NODE_HANDLERS, ...TASK_NODE_HANDLERS, ...AI_NODE_HANDLERS, ...AGENT_LOOP_NODE_HANDLERS, ...VOICE_CLONE_NODE_HANDLERS, ...EXTRA_NODE_HANDLERS, ...A2_NODE_HANDLERS, ...OAS_NODE_HANDLERS, ...INTERACTION_NODE_HANDLERS, ...MEDIA_NODE_HANDLERS, ...TOOL_NODE_HANDLERS, ...CODE_NODE_HANDLERS, ...SUB_WORKFLOW_NODE_HANDLERS, ...VARIABLE_NODE_HANDLERS, ...ASSET_NODE_HANDLERS, ...DIARY_NODE_HANDLERS, ...NEWS_NODE_HANDLERS, ...SKILL_NODE_HANDLERS, ...VIDEO_NODE_HANDLERS,
]

/** 业务包贡献的节点 handler（pack activate 时注册；模块级暂存，boot 时合并进注册表） */
const packNodeHandlers: WorkflowNodeHandler[] = []
const packHandlerTypes = new Set<string>()

/**
 * 业务包节点 handler 注册点（longwriting 等 pack 在 activate 时调用）。
 * 同 type 重复注册 = 编码错误，直接抛（与 WorkflowNodeRegistry.register 同纪律）；
 * 与平台通用 handler 撞 type 同样抛——业务包不得覆盖平台节点。
 */
export function registerPackNodeHandlers(handlers: WorkflowNodeHandler[]): void {
  for (const handler of handlers) {
    if (packHandlerTypes.has(handler.type) || PLATFORM_NODE_HANDLERS.some((h) => h.type === handler.type)) {
      throw new Error(`[WorkflowNodes] 节点类型重复注册：${handler.type}`)
    }
    packHandlerTypes.add(handler.type)
    packNodeHandlers.push(handler)
  }
}

/** 已注册的 pack 贡献 handler（测试/诊断用） */
export function getPackNodeHandlers(): readonly WorkflowNodeHandler[] {
  return packNodeHandlers
}

/** 创建注册了全部节点的注册表（平台通用 + pack 贡献） */
export function createFullNodeRegistry(): WorkflowNodeRegistry {
  return createNodeRegistry([...PLATFORM_NODE_HANDLERS, ...packNodeHandlers])
}

/** 创建仅平台通用节点的注册表（分层回归测试/诊断用：断言平台不含业务 handler） */
export function createPlatformNodeRegistry(): WorkflowNodeRegistry {
  return createNodeRegistry([...PLATFORM_NODE_HANDLERS])
}

/** 启动自检：目录与 handler 全量一致性（有问题说明代码与目录漂移，拒绝启动） */
export function assertNodeRegistryConsistent(registry: WorkflowNodeRegistry): void {
  const problems = checkRegistryConsistency(registry)
  if (problems.length > 0) {
    throw new Error(`[WorkflowNodes] 节点目录一致性检查失败：\n${problems.join('\n')}`)
  }
}
