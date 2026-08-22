/**
 * 工具服务注册器（P0 片1）
 * @module core/modules/workflow/tools/tool-registry
 * @description workflow-boot 装配后注册单例；tool-call 节点与 IPC handler 经 getter 取用。
 *              未注册时 getter 抛错（同 getWorkflowSubsystem 纪律）。
 */

import { ToolService } from './tool.service'

let _toolService: ToolService | null = null

export function registerToolService(svc: ToolService): void {
  _toolService = svc
}

export function getToolService(): ToolService {
  if (!_toolService) {
    throw new Error('工具服务未注册（workflow-boot 装配失败或未调用）')
  }
  return _toolService
}

/** 测试/关停用 */
export function resetToolService(): void {
  _toolService = null
}
