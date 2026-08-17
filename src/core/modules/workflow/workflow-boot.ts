/**
 * 工作流子系统 boot 装配（双端共用）
 * @module core/modules/workflow/workflow-boot
 * @description Electron 与 Web 启动序列各调一次 initWorkflowSubsystem()：
 *              注册表一致性自检 → 引擎/服务装配 → boot 恢复 → 触发调度器 →
 *              审核超时 ticker。片7 的 IPC handler 经 getter 取同一组实例。
 *
 *              失败不致命（与 VoiceCloneJobScheduler 同策略）：工作流子系统
 *              故障不阻断应用启动，只影响工作流功能可用性。
 */

import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { WORKFLOW_DEFAULTS } from '@shared/types/workflow.types'
import { WorkflowEngineService } from './engine/workflow-engine.service'
import { makeEngineDeps, WorkflowRunService } from './workflow-run.service'
import { WorkflowDefinitionService } from './workflow-definition.service'
import { assertNodeRegistryConsistent, createFullNodeRegistry } from './nodes'
import { WorkflowTriggerScheduler } from './trigger/workflow-trigger-scheduler.service'

/** 子系统单例（boot 后可用；未 boot 时 getter 抛错提示） */
interface WorkflowSubsystem {
  engine: WorkflowEngineService
  runService: WorkflowRunService
  definitionService: WorkflowDefinitionService
  scheduler: WorkflowTriggerScheduler
}

let subsystem: WorkflowSubsystem | null = null
let reviewTickerHandle: ReturnType<typeof setInterval> | null = null

/**
 * 初始化工作流子系统（幂等；重复调用返回既有实例）。
 * 必须在数据库管理器注册之后调用。
 */
export async function initWorkflowSubsystem(): Promise<WorkflowSubsystem> {
  if (subsystem) return subsystem

  const db = getCoreDatabaseManager()
  if (!db.workflowDefinitions || !db.workflowRuns || !db.workflowNodeRuns) {
    throw new Error('工作流数据仓库未初始化（数据库管理器缺少 workflow_* 仓库）')
  }

  // 1. 节点注册表 + 一致性自检（目录↔handler 漂移拒绝启动）
  const registry = createFullNodeRegistry()
  assertNodeRegistryConsistent(registry)

  // 2. 引擎与服务装配
  const engine = new WorkflowEngineService(
    makeEngineDeps(db.workflowRuns, db.workflowNodeRuns),
    registry
  )
  const runService = new WorkflowRunService({
    runs: db.workflowRuns,
    nodeRuns: db.workflowNodeRuns,
    definitions: db.workflowDefinitions,
    engine,
  })
  const definitionService = new WorkflowDefinitionService(db.workflowDefinitions, registry)

  // 3. boot 恢复：在途运行标记 interrupted/timed_out（waiting 保持）
  try {
    const recovered = await runService.recoverOnBoot()
    if (recovered.interrupted + recovered.timedOut + recovered.keptWaiting > 0) {
      console.log(
        `[workflow-boot] boot 恢复：interrupted=${recovered.interrupted} timedOut=${recovered.timedOut} waitingReview=${recovered.keptWaiting}`
      )
    }
  } catch (e) {
    console.error('[workflow-boot] boot 恢复失败（继续启动）', e)
  }

  // 4. 触发调度器（cron tick + 事件订阅）
  const scheduler = WorkflowTriggerScheduler.getInstance({
    definitions: db.workflowDefinitions,
    runService,
  })
  await scheduler.start()

  // 5. 审核超时 ticker（30s 扫描挂起审核的 wait_expires_at）
  reviewTickerHandle = setInterval(() => {
    void engine.tickReviewTimeouts().catch(e =>
      console.error('[workflow-boot] 审核超时扫描失败', e)
    )
  }, WORKFLOW_DEFAULTS.cronTickMs)
  reviewTickerHandle.unref?.()

  subsystem = { engine, runService, definitionService, scheduler }
  console.log('[workflow-boot] 工作流子系统已启动')
  return subsystem
}

/** 取子系统（未初始化抛错——IPC 层据此返回明确错误） */
export function getWorkflowSubsystem(): WorkflowSubsystem {
  if (!subsystem) {
    throw new Error('工作流子系统未初始化（initWorkflowSubsystem 未调用）')
  }
  return subsystem
}

/** 测试/关停用：清空单例 */
export function resetWorkflowSubsystem(): void {
  if (subsystem?.scheduler) subsystem.scheduler.stop()
  if (reviewTickerHandle !== null) clearInterval(reviewTickerHandle)
  reviewTickerHandle = null
  subsystem = null
  WorkflowTriggerScheduler.resetInstance()
}
