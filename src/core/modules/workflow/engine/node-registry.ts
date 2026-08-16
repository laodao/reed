/**
 * 工作流节点注册表
 * @module core/modules/workflow/engine/node-registry
 * @description 节点 handler 的注册与查找。新节点 = 实现 WorkflowNodeHandler +
 *              register()，编辑器面板与引擎自动可用。
 *
 *              一致性纪律：注册表的每个 handler 与 NODE_TYPE_CATALOG 对应项的
 *              controlKind / cancellable / outputSchema 必须一致（有配套测试）。
 */

import type { WorkflowNodeType } from '@shared/types/workflow.types'
import { NODE_TYPE_CATALOG_MAP } from '@shared/types/workflow-node-catalog'
import type { WorkflowNodeHandler } from './node-handler'

export class WorkflowNodeRegistry {
  private handlers = new Map<WorkflowNodeType, WorkflowNodeHandler>()

  /** 注册节点 handler（重复注册同一 type = 编码错误，直接抛） */
  register(handler: WorkflowNodeHandler): void {
    if (this.handlers.has(handler.type)) {
      throw new Error(`[WorkflowNodeRegistry] 节点类型重复注册：${handler.type}`)
    }
    this.handlers.set(handler.type, handler)
  }

  get(type: WorkflowNodeType): WorkflowNodeHandler | undefined {
    return this.handlers.get(type)
  }

  /** 无 handler 时抛错（引擎调度前置条件） */
  getOrThrow(type: WorkflowNodeType): WorkflowNodeHandler {
    const h = this.handlers.get(type)
    if (!h) {
      throw new Error(`[WorkflowNodeRegistry] 节点类型未注册 handler：${type}`)
    }
    return h
  }

  list(): WorkflowNodeHandler[] {
    return [...this.handlers.values()]
  }

  /** 已注册的类型集合 */
  registeredTypes(): Set<WorkflowNodeType> {
    return new Set(this.handlers.keys())
  }
}

/**
 * 创建注册表并注册传入的 handler 集合。
 * 内置控制类通过 CONTROL_NODE_HANDLERS 显式传入（nodes/control-nodes.ts）；
 * 任务类节点在 nodes/ 下各文件实现（片5 补齐）。
 */
export function createNodeRegistry(extraHandlers: WorkflowNodeHandler[] = []): WorkflowNodeRegistry {
  const registry = new WorkflowNodeRegistry()
  for (const handler of extraHandlers) {
    registry.register(handler)
  }
  return registry
}

/**
 * 目录与注册表一致性检查（启动自检 + 测试用）：
 * 每个目录项都有 handler，且 controlKind / cancellable / outputSchema 的键与类型一致
 * （desc 属展示文案，允许两边独立演化，不比较）。
 */
export function checkRegistryConsistency(registry: WorkflowNodeRegistry): string[] {
  const problems: string[] = []
  for (const [type, catalog] of Object.entries(NODE_TYPE_CATALOG_MAP)) {
    const handler = registry.get(type as WorkflowNodeType)
    if (!handler) {
      problems.push(`节点类型 ${type} 在目录中但未注册 handler`)
      continue
    }
    if (handler.controlKind !== catalog.controlKind) {
      problems.push(
        `${type}: controlKind 不一致（handler=${handler.controlKind}, catalog=${catalog.controlKind}）`
      )
    }
    if (handler.cancellable !== catalog.cancellable) {
      problems.push(
        `${type}: cancellable 不一致（handler=${handler.cancellable}, catalog=${catalog.cancellable}）`
      )
    }
    // outputSchema：键与类型必须一一对应（顺序不敏感；'*' 通配键两边都要有）
    const handlerKeys = handler.outputSchema.map(f => `${f.key}:${f.type}`).sort()
    const catalogKeys = catalog.outputSchema.map(f => `${f.key}:${f.type}`).sort()
    if (JSON.stringify(handlerKeys) !== JSON.stringify(catalogKeys)) {
      problems.push(
        `${type}: outputSchema 不一致（handler=[${handlerKeys.join(', ')}], catalog=[${catalogKeys.join(', ')}]）`
      )
    }
  }
  // 反向：注册了但目录没有
  for (const type of registry.registeredTypes()) {
    if (!NODE_TYPE_CATALOG_MAP[type]) {
      problems.push(`handler ${type} 不在 NODE_TYPE_CATALOG 中`)
    }
  }
  return problems
}
