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
import { AppDefinitionService } from '../app/app-definition.service'
import { AppSessionService } from '../app/app-session.service'
import { getEventEmitter } from '@core/interfaces/event.interface'
import { assertNodeRegistryConsistent, createFullNodeRegistry } from './nodes'
import { WorkflowTriggerScheduler } from './trigger/workflow-trigger-scheduler.service'
import { createLogger } from '@core/utils/logger'

const logger = createLogger('WorkflowBoot')

/** 子系统单例（boot 后可用；未 boot 时 getter 抛错提示） */
interface WorkflowSubsystem {
  engine: WorkflowEngineService
  runService: WorkflowRunService
  definitionService: WorkflowDefinitionService
  scheduler: WorkflowTriggerScheduler
  appDefinitionService: AppDefinitionService
  appSessionService: AppSessionService
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
  // 应用模块仓库（片1）：未接线则 fail-fast——避免 as any 掩盖 null 至首个调用才崩
  if (!db.appDefinitions || !db.appSessions || !db.messages) {
    throw new Error('应用模块仓库未初始化（数据库管理器缺少 apps/app_sessions/messages 仓库）')
  }

  // 1. 节点注册表 + 一致性自检（目录↔handler 漂移拒绝启动）
  const registry = createFullNodeRegistry()
  assertNodeRegistryConsistent(registry)

  // 2. 引擎与服务装配
  const engine = new WorkflowEngineService(
    makeEngineDeps(db.workflowRuns, db.workflowNodeRuns),
    registry
  )
  // settings 表 wf:defaults 全局执行设置（配置链：默认值 → 全局层 → definition 覆盖）
  let globalSettings: import('@shared/types/workflow.types').WorkflowExecutionSettings | null = null
  try {
    const raw = db.settings ? await db.settings.get('wf:defaults') : null
    if (raw && typeof raw === 'object') {
      globalSettings = raw as import('@shared/types/workflow.types').WorkflowExecutionSettings
    }
  } catch (e) {
    logger.warn('[workflow-boot] 读取 wf:defaults 失败（使用内置默认值）', e)
  }
  const runService = new WorkflowRunService({
    runs: db.workflowRuns,
    nodeRuns: db.workflowNodeRuns,
    definitions: db.workflowDefinitions,
    engine,
    globalSettings,
  })
  const definitionService = new WorkflowDefinitionService(db.workflowDefinitions, registry)

  // 3. boot 恢复：在途运行标记 interrupted/timed_out；已过期的挂起审核标 interrupted
  //    （重启后引擎内存态丢失，未过期的 waiting 保持等待用户续跑）
  try {
    const recovered = await runService.recoverOnBoot()
    if (recovered.interrupted + recovered.timedOut + recovered.keptWaiting > 0) {
      logger.info(
        `[workflow-boot] boot 恢复：interrupted=${recovered.interrupted} timedOut=${recovered.timedOut} waitingReview=${recovered.keptWaiting}`
      )
    }
  } catch (e) {
    logger.error('[workflow-boot] boot 恢复失败（继续启动）', e)
  }

  // 4. 触发调度器（cron tick + 事件订阅）
  const scheduler = new WorkflowTriggerScheduler({
    definitions: db.workflowDefinitions,
    runService,
  })
  await scheduler.start()
  // 发布/触发器变更 → 刷新调度状态与事件索引（否则 cron 发布后永不触发）
  definitionService.setTriggerScheduler(scheduler)

  // 5. 审核超时 ticker（间隔独立于 cronTick 可单独调优）
  reviewTickerHandle = setInterval(() => {
    void engine.tickReviewTimeouts().catch(e =>
      logger.error('[workflow-boot] 审核超时扫描失败', e)
    )
  }, WORKFLOW_DEFAULTS.reviewTimeoutTickMs)
  reviewTickerHandle.unref?.()

  // 6. 应用模块：应用定义/会话服务（片1/片2），事件桥挂到全局事件发射器
  const appDefinitionService = new AppDefinitionService(
    db.appDefinitions,
    db.appSessions,
    db.workflowDefinitions,
    db.messages
  )
  const appSessionService = new AppSessionService(
    { appSessions: db.appSessions, messages: db.messages, dialogs: db.dialogs, runService, engine },
    db.appDefinitions,
    db.workflowDefinitions,
  )
  // 事件桥：闭包捕获 getEventEmitter() 的 tapEvents（直接传方法引用会丢 this）
  appSessionService.attach((cb: (c: string, d: unknown, u: string | null) => void) =>
    getEventEmitter().tapEvents?.(cb)
  )
  // boot 恢复：重建 runId→session 映射 + running 会话终态收口（引擎 recoverOnBoot 已执行，失败不阻断启动）
  try {
    await appSessionService.recoverOnBoot()
  } catch (e) {
    logger.error('[workflow-boot] 应用会话 boot 恢复失败（继续启动）', e)
  }

  // 7. P0 工具：第三方 API 工具服务（凭据加密 + 自定义工具 + 预设工具 + 执行），注册全局取用
  try {
    const { ToolService } = await import('./tools/tool.service')
    const { registerToolService } = await import('./tools/tool-registry')
    registerToolService(new ToolService(db.toolCredentials, db.customTools))
  } catch (e) {
    logger.error('[workflow-boot] 工具服务装配失败（继续启动）', e)
  }
  // 8. P0 子工作流：runService 访问注册（sub-workflow 节点取用，避免循环依赖）
  try {
    const { registerRunServiceAccess } = await import('./run-service-access')
    registerRunServiceAccess(runService)
  } catch (e) {
    logger.error('[workflow-boot] runService 访问注册失败（继续启动）', e)
  }
  // 9. P0 变量与数据表：持久化服务注册（variable/data-table 节点取用）
  try {
    const { VariableDataService, registerVariableDataService } = await import('./variables/variable-data.service')
    registerVariableDataService(new VariableDataService(db.variables, db.dataTableDefs, db.dataTableRows))
  } catch (e) {
    logger.error('[workflow-boot] 变量/数据表服务装配失败（继续启动）', e)
  }
  // 10. 通用资产库：保存资产/读取资产节点与资产中心 IPC 取用
  if (!db.assets) {
    throw new Error('资产仓库未初始化（数据库管理器缺少 assets 仓库）')
  }
  try {
    const { AssetService, AssetStorageService, registerAssetService } = await import('../assets')
    registerAssetService(new AssetService(new AssetStorageService(), db.assets))
  } catch (e) {
    logger.error('[workflow-boot] 资产服务装配失败（继续启动）', e)
  }

  subsystem = { engine, runService, definitionService, scheduler, appDefinitionService, appSessionService }
  logger.info('[workflow-boot] 工作流子系统已启动')
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
}
