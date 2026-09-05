/**
 * 工作流子系统 boot 装配（双端共用）
 * @module core/platform/workflow/workflow-boot
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
import { AppDefinitionService } from '@core/packs/app/services/app-definition.service'
import { AppSessionService } from '@core/packs/app/services/app-session.service'
import { getEventEmitter } from '@core/interfaces/event.interface'
import type { EventChannel } from '@shared/types/event.types'
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
/** 已挂接的平台事件通道（reset 时 stop） */
let attachedChannels: EventChannel[] = []
/** 平台事件归档作业（M4，10-event-system §7.10；reset 时 stop） */
let archiveJob: { stop(): void } | null = null

export interface WorkflowBootOptions {
  /**
   * 平台事件投递通道（10-event-system §5.4；Electron 传 IpcEventChannel、Web 传
   * WsEventChannel），在事件总线启动成功后挂接——把 workflow.run.* 平台事件
   * 翻译回 wf:run-event 五型载荷推前端（前端零改动，§9）。
   */
  eventChannels?: EventChannel[]
}

/**
 * 初始化工作流子系统（幂等；重复调用返回既有实例）。
 * 必须在数据库管理器注册之后调用。
 */
export async function initWorkflowSubsystem(opts: WorkflowBootOptions = {}): Promise<WorkflowSubsystem> {
  if (subsystem) return subsystem

  const db = getCoreDatabaseManager()
  if (!db.workflowDefinitions || !db.workflowRuns || !db.workflowNodeRuns) {
    throw new Error('工作流数据仓库未初始化（数据库管理器缺少 workflow_* 仓库）')
  }
  // 应用模块仓库（片1）：未接线则 fail-fast——避免 as any 掩盖 null 至首个调用才崩
  if (!db.appDefinitions || !db.appSessions || !db.messages) {
    throw new Error('应用模块仓库未初始化（数据库管理器缺少 apps/app_sessions/messages 仓库）')
  }

  // 0. 平台事件总线（10-event-system M1）：平台级公共底座，非工作流私有——
  //    boot 装配借道此处（双端共用，失败不致命）。启动后 dispatcher 扫表补偿崩溃窗口漏投。
  let eventBus: import('@shared/types/event.types').EventBus | null = null
  try {
    const { getEventBus } = await import('@core/platform/services/event-system/event-bus.service')
    eventBus = await getEventBus()
  } catch (e) {
    logger.error('[workflow-boot] 平台事件总线启动失败（继续启动）', e)
  }

  // 0.1 事件通道挂接（§5.4，紧随总线启动之后）：总线不可用/通道异常不致命——
  //     producer 适配器会回退存量直推路径，前端推送不断（§9 契约）。
  if (eventBus && opts.eventChannels) {
    for (const channel of opts.eventChannels) {
      try {
        channel.start(eventBus)
        attachedChannels.push(channel)
      } catch (e) {
        logger.error(
          `[workflow-boot] 事件通道挂接失败（kind=${channel.kind}，继续启动）：${e instanceof Error ? e.stack : String(e)}`
        )
      }
    }
  }

  // 0.2 事件保留与归档作业（M4，§6.1 archived / §7.10）：每日扫描——超保留期且所有
  //     消费者游标均已越过的事件导出 JSONL.gz 后删行；失败不致命（下轮继续）。
  if (eventBus) {
    try {
      const { startEventArchiveJob } = await import('@core/platform/services/event-system/event-archive.service')
      archiveJob = startEventArchiveJob()
    } catch (e) {
      logger.error('[workflow-boot] 事件归档作业启动失败（继续启动）', e)
    }
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
    { appSessions: db.appSessions, messages: db.messages, appSessionMessages: db.appSessionMessages, runService, engine },
    db.appDefinitions,
    db.workflowDefinitions,
  )
  // 事件桥（M2，10-event-system §9 末行）：总线就绪 → 命名持久消费者
  // 'app-session-bridge'（at-least-once，崩溃补投由游标保证；startFrom='latest' 不补历史）；
  // 总线不可用 → 回退存量 tapEvents 桥（至多一次，与 M1 前行为一致）
  if (eventBus) {
    appSessionService.attachEventConsumer(eventBus)
  } else {
    // 闭包捕获 getEventEmitter() 的 tapEvents（直接传方法引用会丢 this）
    appSessionService.attach((cb: (c: string, d: unknown, u: string | null) => void) =>
      getEventEmitter().tapEvents?.(cb)
    )
  }
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
  // 7.1 技能：技能包服务（内置只读 + 用户技能目录管理），注册全局取用（skill-call 节点 / IPC）
  try {
    const { SkillService } = await import('./skills/skill.service')
    const { registerSkillService } = await import('./skills/skill-registry')
    registerSkillService(new SkillService())
  } catch (e) {
    logger.error('[workflow-boot] 技能服务装配失败（继续启动）', e)
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
  // 9.1 数据源：外部数据库连接服务 + 驱动注册（data-table 节点外部模式取用）
  try {
    const { DataSourceService, registerDataSourceService } = await import('./datasource/datasource.service')
    const { registerDataSourceDriver } = await import('./datasource/datasource-executor.service')
    const { PostgresDriverAdapter } = await import('./datasource/drivers/postgresql-driver')
    const { MySqlDriverAdapter } = await import('./datasource/drivers/mysql-driver')
    const { SqlServerDriverAdapter } = await import('./datasource/drivers/sqlserver-driver')
    const { ClickHouseDriverAdapter } = await import('./datasource/drivers/clickhouse-driver')
    registerDataSourceDriver(new PostgresDriverAdapter())
    registerDataSourceDriver(new MySqlDriverAdapter())
    registerDataSourceDriver(new SqlServerDriverAdapter())
    registerDataSourceDriver(new ClickHouseDriverAdapter())
    registerDataSourceService(new DataSourceService(db.dataSources!))
  } catch (e: any) {
    logger.error(
      `[workflow-boot] 数据源服务/驱动装配失败（继续启动）: ${e?.message || e} | stack: ${e?.stack || ''}`,
    )
  }
  // 10. 通用资产库：保存资产/读取资产节点与资产中心 IPC 取用
  if (!db.assets) {
    throw new Error('资产仓库未初始化（数据库管理器缺少 assets 仓库）')
  }
  try {
    const { AssetService, AssetStorageService, registerAssetService } = await import('../assets')
    const { createAssetSourceLinkResolver } = await import('../assets/asset-source-link')
    registerAssetService(
      new AssetService(
        new AssetStorageService(),
        db.assets,
        db.assetCategories,
        db.assetGroups ?? undefined,
        createAssetSourceLinkResolver({ runs: db.workflowRuns!, apps: db.appDefinitions! }),
      )
    )
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
  for (const channel of attachedChannels) channel.stop()
  attachedChannels = []
  archiveJob?.stop()
  archiveJob = null
  if (reviewTickerHandle !== null) clearInterval(reviewTickerHandle)
  reviewTickerHandle = null
  subsystem = null
}
