/**
 * runService 访问注册器（P0 片3：子工作流节点）
 * @module core/modules/workflow/run-service-access
 * @description workflow-boot 装配后注册 WorkflowRunService；sub-workflow 节点经 getter 取用
 *              （避免节点静态引用 workflow-boot 造成循环依赖）。
 */

import type { WorkflowRunService } from './workflow-run.service'

let _runService: WorkflowRunService | null = null

export function registerRunServiceAccess(svc: WorkflowRunService): void {
  _runService = svc
}

export function getRunServiceAccess(): WorkflowRunService {
  if (!_runService) {
    throw new Error('runService 未注册（workflow-boot 装配失败或未调用）')
  }
  return _runService
}

/** 测试/关停用 */
export function resetRunServiceAccess(): void {
  _runService = null
}
