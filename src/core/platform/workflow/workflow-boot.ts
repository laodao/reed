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
import { SETTINGS_KEYS, getSettingWithLegacyFallback } from '@shared/constants/settings-keys'
import { loadAgentBudget } from '@core/platform/agent-runtime/budget/agent-budget'
import { runtimeLimitsFromBudget, setRuntimeLimits } from '@shared/utils/runtime-limits'
import { setWorkflowRuntimeParams, workflowRuntimeParamsFromSettings } from '@shared/utils/workflow-runtime-params'
import { setAgentContextParams, agentContextParamsFromSettings } from '@shared/utils/agent-context-params'
import { setAgentToolParams, agentToolParams, agentToolParamsFromSettings } from '@shared/utils/agent-tool-params'
import { setKnowledgeParams, knowledgeParamsFromSettings, setKnowledgeSummaryFlags, knowledgeFlagsFromSettings } from '@shared/utils/knowledge-params'
import { setAssetParams, assetParamsFromSettings } from '@shared/utils/asset-params'
import { eventParamsFromSettings } from '@shared/utils/event-params'
import { setPortraitParams, portraitParamsFromSettings } from '@shared/utils/portrait-params'
import { setLongwritingParams, longwritingParamsFromSettings } from '@shared/utils/longwriting-params'
import { registerSettingsReloadHook, setSettingsReloadLogger } from '@shared/utils/settings-reload'
import { WorkflowEngineService } from './engine/workflow-engine.service'
import { makeEngineDeps, WorkflowRunService } from './workflow-run.service'
import { WorkflowDefinitionService } from './workflow-definition.service'
import { AppDefinitionService } from '@core/packs/app/services/app-definition.service'
import { AppSessionService } from '@core/packs/app/services/app-session.service'
import { getEventEmitter } from '@core/interfaces/event.interface'
import type { EventChannel } from '@shared/types/event.types'
import { assertNodeRegistryConsistent, createFullNodeRegistry } from './nodes'
import { WorkflowTriggerScheduler } from './trigger/workflow-trigger-scheduler.service'
import { WorkflowRunLogger } from './workflow-run-logger'
import { truncateTranscriptContent } from '@core/platform/agent-runtime/memory/transcript-store'
import { createLogger } from '@core/utils/logger'

const logger = createLogger('WorkflowBoot')

/** 模型档位 env 解析（39 号 P2）：`providerConfigId/modelId` 或裸 `modelId`；空/非法返回 undefined。
 *  多段输入判非法（42号 review P2：曾静默截断——modelId 含 `/` 的 openrouter 形态必须写全前缀） */
export function parseModelTierEnv(raw: string | undefined): { providerConfigId?: string; modelId?: string } | undefined {
  if (!raw || raw.trim() === '') return undefined
  const parts = raw.trim().split('/')
  if (parts.length > 2) {
    logger.warn(`[workflow-boot] AGENT_MODEL 档位格式非法（应为 providerConfigId/modelId 或裸 modelId）：${raw}——回退默认模型`)
    return undefined
  }
  const [providerConfigId, modelId] = parts
  if (!modelId) return { modelId: providerConfigId }
  return { providerConfigId, modelId }
}

/** 子系统单例（boot 后可用；未 boot 时 getter 抛错提示） */
interface WorkflowSubsystem {
  engine: WorkflowEngineService
  runService: WorkflowRunService
  definitionService: WorkflowDefinitionService
  scheduler: WorkflowTriggerScheduler
  appDefinitionService: AppDefinitionService
  appSessionService: AppSessionService
  /** M3 任务树子系统（26 号；数据源缺失时不装配——null 降级） */
  agentTasks: import('@core/platform/agent-runtime/tasks/task-service').AgentTaskService | null
  /** M3 知识飞轮（26 号批4；null 同上） */
  memoryFlywheel: import('@core/platform/agent-runtime/memory/memory-flywheel').MemoryFlywheelService | null
  /** Agent 会话仓储（29 号 M5.5 工作台数据源；数据源缺失为 null） */
  agentSessions: import('@core/database/repositories/agent-session.repository').AgentSessionRepository | null
  /** Agent 轨迹仓储（29 号 M5.5 工作台数据源；未装配为 null） */
  agentTrajectories: import('@core/database/repositories/agent-trajectory.repository').AgentTrajectoryRepository | null
  /** NL→工作流草稿生成（31 号 M7；M5 块装配） */
  draftService: import('@core/platform/workflow/draft/workflow-draft.service').WorkflowDraftService | null
  /** 运行执行日志（每步时间线；IPC wf:list-run-logs 取用） */
  runLogger: WorkflowRunLogger
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
      const archiveMod = await import('@core/platform/services/event-system/event-archive.service')
      // 「参数设置 → 事件系统 → 事件归档」：装配前先把生效值交给归档单例（改完需重启客户端）。
      // 这里读一次 settings，用的是与设置页同一份登记表解析口径。
      try {
        const raw: Record<string, unknown> = {}
        for (const key of [SETTINGS_KEYS.eventBus, SETTINGS_KEYS.eventArchive]) {
          raw[key] = db.settings ? await getSettingWithLegacyFallback(db.settings, key) : null
        }
        const { archive } = eventParamsFromSettings(raw)
        archiveMod.primeEventArchiveParams(archive)
      } catch (e) {
        logger.warn('[workflow-boot] 读取 event:archive 失败（使用内置默认）', e)
      }
      archiveJob = archiveMod.startEventArchiveJob()
    } catch (e) {
      logger.error('[workflow-boot] 事件归档作业启动失败（继续启动）', e)
    }
  }

  // 1. 节点注册表 + 一致性自检（目录↔handler 漂移拒绝启动）
  const registry = createFullNodeRegistry()
  assertNodeRegistryConsistent(registry)

  // 2. 引擎与服务装配（journal 注入：Run Journal 恢复事实源，11 号 E1；
  //    数据源缺失时 journal=null——引擎照跑但无跨重启恢复能力，warn 留痕）
  let journal: import('./engine/journal').WorkflowJournalPort | null = null
  try {
    if (db.dataSource) {
      const { WorkflowRunEventRepository } = await import('@core/database/repositories/workflow-run-event.repository')
      const { DbJournal } = await import('./engine/journal')
      journal = new DbJournal(new WorkflowRunEventRepository(db.dataSource))
    } else {
      logger.warn('[workflow-boot] 数据源不可用：Run Journal 未装配（无跨重启恢复能力）')
    }
  } catch (e) {
    logger.warn('[workflow-boot] Run Journal 装配失败（无跨重启恢复能力）', e)
  }
  // 轨迹仓储（25 号 M2 批1/批2）：harness 落库与 runService 查询共用同一实例；
  // 数据源缺失时不创建——sink 降级为仅摘要，查询降级返回空
  let trajectoryRepo: import('@core/database/repositories/agent-trajectory.repository').AgentTrajectoryRepository | null = null
  /** provider 适配单例（7.2 harness 与 M3 规划/验证/蒸馏共用；构造廉价但 LRU 缓存收敛一处） */
  let providerAdapter: import('@core/platform/agent-runtime/provider/provider-adapter').ProviderAdapter | null = null
  if (db.dataSource) {
    try {
      trajectoryRepo = new (
        await import('@core/database/repositories/agent-trajectory.repository')
      ).AgentTrajectoryRepository(db.dataSource)
    } catch (e) {
      logger.warn('[workflow-boot] 轨迹仓储装配失败（轨迹仅留内存摘要）', e)
    }
  }
  const engine = new WorkflowEngineService(
    makeEngineDeps(db.workflowRuns, db.workflowNodeRuns, journal),
    registry
  )
  // settings 表 wf:defaults 全局执行设置（配置链：默认值 → 全局层 → definition 覆盖；键名走注册表）。
  // 2026-09-13「参数设置」改造：不再 boot 读一次存快照，而是传**读取器**下去 ——
  // 设置页保存后**下一次运行**即生效（引擎侧本来就是每 run 解析一次，这里补上服务层）。
  const readGlobalSettings = async (): Promise<import('@shared/types/workflow.types').WorkflowExecutionSettings> => {
    try {
      const raw = db.settings
        ? await getSettingWithLegacyFallback(db.settings, SETTINGS_KEYS.wfDefaults)
        : null
      return raw && typeof raw === 'object'
        ? (raw as import('@shared/types/workflow.types').WorkflowExecutionSettings)
        : {}
    } catch (e) {
      logger.warn('[workflow-boot] 读取 wf:defaults 失败（使用内置默认值）', e)
      return {}
    }
  }
  /**
   * 工具注册表单例引用（长生命周期）。
   * 2026-09-13：护栏不再"启动读一次就固定"，settings 保存后由重注入钩子调
   * `applyRuntimeOverrides` 刷新，所以需要在装配处留一个引用。
   */
  let agentToolRegistryRef: import('@core/platform/agent-runtime/tools/registry').AgentToolRegistry | null = null

  // 平台预算（agent:budget）：这里只取护栏部分（工具结果截断/审计预览/遍历深度），
  // 并把"进程级限额"（产物/流水/轨迹体积、事件载荷护栏、工作流 agent-loop 与子代理缺省步数）
  // 注入 shared/utils/runtime-limits 持有者。
  //
  // 2026-09-13「参数设置」第二轮：不再"启动读一次、改完必须重启"——使用点都是现读持有者，
  // 所以只要在 settings 写入后**重新注入**即可立刻生效（`settings-reload` 钩子）。
  const applyAgentBudget = async (): Promise<
    | {
        maxToolResultBytes: number
        maxToolResultFieldChars: number
        maxAuditPreviewChars: number
        maxResultWalkDepth: number
      }
    | undefined
  > => {
    try {
      const { budget } = await loadAgentBudget(db.settings ?? null)
      setRuntimeLimits(runtimeLimitsFromBudget(budget))
      return {
        maxToolResultBytes: budget.guards.maxToolResultBytes,
        maxToolResultFieldChars: budget.guards.maxToolResultFieldChars,
        maxAuditPreviewChars: budget.guards.maxAuditPreviewChars,
        maxResultWalkDepth: budget.guards.maxResultWalkDepth,
      }
    } catch (e) {
      logger.warn('[workflow-boot] 读取 agent:budget 护栏失败（使用内置默认）', e)
      return undefined
    }
  }
  const guardOverrides = await applyAgentBudget()
  /** 工作流运行参数（抓取礼貌/长任务轮询/代码沙箱）：启动注入一次 */
  const applyWorkflowParams = async (): Promise<void> => {
    try {
      const raw = db.settings
        ? await getSettingWithLegacyFallback(db.settings, SETTINGS_KEYS.wfDefaults)
        : null
      setWorkflowRuntimeParams(workflowRuntimeParamsFromSettings(raw))
    } catch (e) {
      logger.warn('[workflow-boot] 读取 wf:defaults 运行参数失败（使用内置默认）', e)
    }
  }
  await applyWorkflowParams()
  /** Agent 上下文与记忆参数（窗口/压缩预算/记忆飞轮）：启动注入一次 */
  const applyAgentContextParams = async (): Promise<void> => {
    try {
      const raw: Record<string, unknown> = {}
      for (const key of [SETTINGS_KEYS.agentContext, SETTINGS_KEYS.agentMemory]) {
        raw[key] = db.settings ? await getSettingWithLegacyFallback(db.settings, key) : null
      }
      setAgentContextParams(agentContextParamsFromSettings(raw))
    } catch (e) {
      logger.warn('[workflow-boot] 读取 agent:context/agent:memory 失败（使用内置默认）', e)
    }
  }
  await applyAgentContextParams()
  /** 工具与审批参数（工具执行超时/结果处理/审批超时）：启动注入一次 */
  const applyAgentToolParams = async (): Promise<void> => {
    try {
      const raw: Record<string, unknown> = {}
      for (const key of [SETTINGS_KEYS.agentTools, SETTINGS_KEYS.agentApproval]) {
        raw[key] = db.settings ? await getSettingWithLegacyFallback(db.settings, key) : null
      }
      const params = agentToolParamsFromSettings(raw)
      setAgentToolParams(params)
    } catch (e) {
      logger.warn('[workflow-boot] 读取 agent:tools/agent:approval 失败（使用内置默认）', e)
    }
  }
  await applyAgentToolParams()
  /** 知识库参数（检索/入库导入/章节摘要）：启动注入一次 */
  const applyKnowledgeParams = async (): Promise<void> => {
    try {
      const raw: Record<string, unknown> = {}
      for (const key of [
        SETTINGS_KEYS.knowledgeRetrieval,
        SETTINGS_KEYS.knowledgeIngest,
        SETTINGS_KEYS.knowledgeSummary,
      ]) {
        raw[key] = db.settings ? await getSettingWithLegacyFallback(db.settings, key) : null
      }
      setKnowledgeParams(knowledgeParamsFromSettings(raw))
      // 布尔开关（数字持有者不承载布尔，见 param-holder 注释）
      setKnowledgeSummaryFlags(knowledgeFlagsFromSettings(raw))
    } catch (e) {
      logger.warn('[workflow-boot] 读取 knowledge:* 失败（使用内置默认）', e)
    }
  }
  await applyKnowledgeParams()
  /** 长文写作参数（章节生成主链/故事研讨室）：启动注入一次 */
  const applyLongwritingParams = async (): Promise<void> => {
    try {
      const raw: Record<string, unknown> = {}
      for (const key of [SETTINGS_KEYS.longwritingWriting, SETTINGS_KEYS.longwritingStoryRoom]) {
        raw[key] = db.settings ? await getSettingWithLegacyFallback(db.settings, key) : null
      }
      setLongwritingParams(longwritingParamsFromSettings(raw))
    } catch (e) {
      logger.warn('[workflow-boot] 读取 longwriting:* 失败（使用内置默认）', e)
    }
  }
  await applyLongwritingParams()
  /** 素材与图片参数（素材下载/收藏/整页归档 + 站点图标 + 图片任务轮询）：启动注入一次 */
  const applyAssetParams = async (): Promise<void> => {
    try {
      const raw: Record<string, unknown> = {}
      for (const key of [
        SETTINGS_KEYS.assetLimits,
        SETTINGS_KEYS.faviconFetch,
        SETTINGS_KEYS.imagePolling,
      ]) {
        raw[key] = db.settings ? await getSettingWithLegacyFallback(db.settings, key) : null
      }
      setAssetParams(assetParamsFromSettings(raw))
    } catch (e) {
      logger.warn('[workflow-boot] 读取 asset:*/favicon:*/image:* 失败（使用内置默认）', e)
    }
  }
  await applyAssetParams()
  /** 画像参数（生成默认尺寸与强度）：启动注入一次 */
  const applyPortraitParams = async (): Promise<void> => {
    try {
      const raw: Record<string, unknown> = {
        [SETTINGS_KEYS.portraitImage]: db.settings
          ? await getSettingWithLegacyFallback(db.settings, SETTINGS_KEYS.portraitImage)
          : null,
      }
      setPortraitParams(portraitParamsFromSettings(raw))
    } catch (e) {
      logger.warn('[workflow-boot] 读取 portrait:image 失败（使用内置默认）', e)
    }
  }
  await applyPortraitParams()
  const runService = new WorkflowRunService({
    runs: db.workflowRuns,
    nodeRuns: db.workflowNodeRuns,
    definitions: db.workflowDefinitions,
    engine,
    globalSettingsProvider: readGlobalSettings,
    trajectories: trajectoryRepo,
  })
  const definitionService = new WorkflowDefinitionService(db.workflowDefinitions, registry)

  // 运行执行日志记录器：订阅 wf:run-event（引擎/服务直发或平台总线转发），
  // 与 app-session / video-gen 节点同机制，不改引擎。
  const runLogger = new WorkflowRunLogger()
  runLogger.attach(cb => getEventEmitter().tapEvents?.(cb))

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
  // 7.2 agent-loop 节点 harness（22 号 §8 焊点）：AgentToolRegistry + ProviderAdapter。
  //     装配失败不阻断工作流子系统（其余节点不受影响）；agent-loop 节点执行时
  //     getter fail-fast（getAgentLoopHarness 抛错 → 节点失败，留痕可排障）
  try {
    const { AgentToolRegistry } = await import('@core/platform/agent-runtime/tools/registry')
    const { ProviderAdapter } = await import('@core/platform/agent-runtime/provider/provider-adapter')
    const { registerBuiltinAgentTools } = await import('./tools/agent-builtin-tools')
    const { registerAgentLoopHarness } = await import('./nodes/agent-loop-node')
    // 工具调用审计落库（25 号 M2 批1 / 14 号 §4.1）：registry 审计面 → DB sink
    //（fire-and-forget；数据源缺失/写失败只 warn，不影响工具调用）
    const auditRepo = db.dataSource
      ? new (
          await import('@core/database/repositories/agent-tool-call.repository')
        ).AgentToolCallRepository(db.dataSource)
      : null
    // 工具产物归档端口（39 号 P1-1）：registry 管线截断前落全文；数据源缺失降级
    // null = 不归档（宿主也不注入 get_tool_result——占位指引无死链）
    const artifactStore = db.dataSource
      ? (
          await import('@core/platform/agent-runtime/tools/artifacts')
        ).createToolArtifactStore({
          repo: new (
            await import('@core/database/repositories/agent-tool-artifact.repository')
          ).AgentToolArtifactRepository(db.dataSource),
        })
      : null
    const agentToolRegistry = new AgentToolRegistry({      audit: auditRepo
        ? (record) => {
            void auditRepo
              .append({
                runId: (record.context?.runId as string) ?? null,
                nodeId: (record.context?.nodeId as string) ?? null,
                sessionKey: (record.context?.sessionKey as string) ?? null,
                toolName: record.toolName,
                dangerLevel: record.dangerLevel,
                approval: record.approval,
                status: record.status,
                errorCode: record.errorCode ?? null,
                argsPreview: JSON.stringify(record.args ?? null).slice(0, 500),
                resultPreview: record.resultPreview,
                truncated: record.truncated,
                durationMs: record.durationMs,
                context: record.context,
              })
              .catch((e) => logger.warn('[workflow-boot] 工具审计落库失败', e))
          }
        : undefined,
      // 产物归档（39 号 P1-1）：截断序列化前落完整结果
      artifacts: artifactStore,
      // 护栏（2026-09-13 参数配置化）：settings `agent:budget`.guards → 结果截断/预览/深度
      guards: guardOverrides,
    })
    agentToolRegistryRef = agentToolRegistry
    // 工具执行超时：持有者已在装配前注入，这里同步进注册表 deps（长生命周期单例只读构造值）
    agentToolRegistryRef.applyRuntimeOverrides({
      executeTimeoutMs: agentToolParams().tools.executeTimeoutMs,
    })

    registerBuiltinAgentTools(agentToolRegistry)
    // 本地能力工具（44 号：fs/shell 五件，桌面端限定，围栏未配置时结构化报错）
    const { registerLocalCapabilityTools } = await import('./tools/local-capability-tools')
    registerLocalCapabilityTools(agentToolRegistry)
    providerAdapter = new ProviderAdapter()
    // 核心 harness 先注册（review C8：可选扩展桥的失败不得降级核心功能——
    // 此前 registerCustomAgentTools 抛错会跳过 registerAgentLoopHarness，
    // agent-loop 节点整体不可用）
    registerAgentLoopHarness({
      registry: agentToolRegistry,
      resolveModel: (opts) => providerAdapter!.resolveModel(opts),
      // 轨迹落库端口（25 号 M2 批1，创建于引擎装配区；未装配时 sink 降级仅摘要）
      trajectoryRepo: trajectoryRepo ?? undefined,
    })
    // 节点即工具 + 自定义工具桥（25 号 M2 批3）：source='node'/'tool'；
    // 各自 try 隔离（可选增强，失败 warn 留痕——核心工具面不受影响）
    try {
      const { registerNodeAgentTools } = await import('./tools/node-tool-adapter')
      registerNodeAgentTools(agentToolRegistry)
    } catch (e) {
      logger.warn('[workflow-boot] 节点工具注册失败（核心工具面不受影响）', e)
    }
    try {
      const { registerCustomAgentTools } = await import('./tools/custom-tool-adapter')
      await registerCustomAgentTools(agentToolRegistry)
    } catch (e) {
      logger.warn('[workflow-boot] 自定义工具桥装配失败（核心工具面不受影响）', e)
    }
  } catch (e) {
    logger.error('[workflow-boot] agent-loop harness 装配失败（agent-loop 节点将不可用）', e)
  }

  // 7.5 参数重注入登记（2026-09-13「参数设置」第二轮）：settings 保存后立刻生效，不必重启。
  // 覆盖两类"进程级、启动时装配"的参数：
  // - agent:budget → 进程级限额持有者（体积/事件载荷/agent-loop 与子代理步数）+ 工具注册表护栏
  // - wf:defaults → 工作流运行参数持有者（抓取礼貌/长任务轮询/代码沙箱超时）
  // 钩子失败只记日志，不影响保存本身（见 shared/utils/settings-reload 的纪律）。
  setSettingsReloadLogger({ warn: (msg, e) => logger.warn(msg, e) })
  registerSettingsReloadHook('agent-budget-runtime', async (key) => {
    if (key !== SETTINGS_KEYS.agentBudget) return
    const guards = await applyAgentBudget()
    if (guards) agentToolRegistryRef?.applyRuntimeOverrides({ guards })
  })
  registerSettingsReloadHook('workflow-runtime-params', async (key) => {
    if (key !== SETTINGS_KEYS.wfDefaults) return
    await applyWorkflowParams()
  })
  registerSettingsReloadHook('agent-context-params', async (key) => {
    if (key !== SETTINGS_KEYS.agentContext && key !== SETTINGS_KEYS.agentMemory) return
    await applyAgentContextParams()
  })
  registerSettingsReloadHook('agent-tool-params', async (key) => {
    if (key !== SETTINGS_KEYS.agentTools && key !== SETTINGS_KEYS.agentApproval) return
    await applyAgentToolParams()
    agentToolRegistryRef?.applyRuntimeOverrides({
      executeTimeoutMs: agentToolParams().tools.executeTimeoutMs,
    })
  })
  registerSettingsReloadHook('knowledge-params', async (key) => {
    if (
      key !== SETTINGS_KEYS.knowledgeRetrieval &&
      key !== SETTINGS_KEYS.knowledgeIngest &&
      key !== SETTINGS_KEYS.knowledgeSummary
    ) {
      return
    }
    await applyKnowledgeParams()
  })
  registerSettingsReloadHook('longwriting-params', async (key) => {
    if (key !== SETTINGS_KEYS.longwritingWriting && key !== SETTINGS_KEYS.longwritingStoryRoom) return
    await applyLongwritingParams()
  })
  registerSettingsReloadHook('asset-params', async (key) => {
    if (
      key !== SETTINGS_KEYS.assetLimits &&
      key !== SETTINGS_KEYS.faviconFetch &&
      key !== SETTINGS_KEYS.imagePolling
    ) {
      return
    }
    await applyAssetParams()
  })
  registerSettingsReloadHook('portrait-params', async (key) => {
    if (key !== SETTINGS_KEYS.portraitImage) return
    await applyPortraitParams()
  })
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
    const { WebCollectService, registerWebCollectService } = await import('../assets')
    const { createAssetSourceLinkResolver } = await import('../assets/asset-source-link')
    const assetService = new AssetService(
      new AssetStorageService(),
      db.assets,
      db.assetCategories,
      db.assetGroups ?? undefined,
      createAssetSourceLinkResolver({ runs: db.workflowRuns!, apps: db.appDefinitions! }),
    )
    registerAssetService(assetService)
    // 网页收藏服务（collect-webpage 节点 / 运行页一键收藏）：依赖资产服务
    registerWebCollectService(new WebCollectService({ assetService }))
  } catch (e) {
    logger.error('[workflow-boot] 资产服务装配失败（继续启动）', e)
  }

  // 10. M3 任务树 + 知识飞轮（26 号批2/批4）：装配失败不阻断（子系统照常启动，
  //     agentTasks=null 时 IPC 层返回明确错误——数据源缺失/仓储异常均降级）
  let agentTasks: import('@core/platform/agent-runtime/tasks/task-service').AgentTaskService | null = null
  let memoryFlywheel: import('@core/platform/agent-runtime/memory/memory-flywheel').MemoryFlywheelService | null = null
  let agentSessionRepo: import('@core/database/repositories/agent-session.repository').AgentSessionRepository | null = null
  let draftService: import('@core/platform/workflow/draft/workflow-draft.service').WorkflowDraftService | null = null
  try {
    if (db.dataSource && db.agentTasks && db.agentMemoryEntries) {
      // M2 harness 必须就位（review W7：否则每任务执行时才爆炸并白烧重规划 LLM）
      const { getAgentLoopHarness } = await import('./nodes/agent-loop-node')
      getAgentLoopHarness()
      const { AgentTaskService } = await import('@core/platform/agent-runtime/tasks/task-service')
      const { Planner } = await import('@core/platform/agent-runtime/tasks/planner')
      const { Verifier } = await import('@core/platform/agent-runtime/verify/verifier')
      const { MemoryFlywheelService } = await import('@core/platform/agent-runtime/memory/memory-flywheel')
      const { generateText } = await import('ai')

      const resolveBootModel = async () => {
        if (!providerAdapter) throw new Error('ProviderAdapter 未装配')
        return providerAdapter.resolveModel()
      }
      const planner = new Planner({ plan: async ({ goal, signal }) => {
        const model = await resolveBootModel()
        const r = await generateText({
          model,
          system: (await import('@core/platform/agent-runtime/tasks/planner')).PLANNER_SYSTEM_PROMPT,
          prompt: `目标：${goal}`,
          maxOutputTokens: 4096,
          abortSignal: signal ?? undefined,
        })
        return r.text
      } })
      const verifier = new Verifier({
        llmJudge: async ({ goal, acceptance, output, rubricHints, signal }) => {
          const rubric = [
            '按相关性、完整性、事实性给产出打分（0-1 的小数）并列出具体缺陷。',
            `任务目标：${goal}`,
            acceptance ? `验收标准：${acceptance}` : '',
            ...(rubricHints ?? []),
            '输出严格 JSON：{"score": <0-1>, "defects": ["缺陷1", ...]}。缺陷最多 5 条、每条不超过 20 字；不要输出 JSON 以外的任何文字。',
          ].filter(Boolean).join('\n')
          const model = await resolveBootModel()
          // maxOutputTokens 曾为 1024——话痨模型写长缺陷清单被截断，2/2 评判解析失败（33 号实测）
          const r = await generateText({ model, system: rubric, prompt: `产出：\n${output}`, maxOutputTokens: 2048, abortSignal: signal ?? undefined })
          if (r.finishReason === 'length') logger.warn('[workflow-boot] llmJudge 输出因长度截断（parseJudge 有正则兜底）')
          return (await import('@core/platform/agent-runtime/verify/verifier')).parseJudgeResponse(r.text)
        },
      })
      // ── 知识飞轮（缺省停用，2026-09-12 用户拍板暂停）────────────────────
      // 停用理由与重开条件登记在 36 号契约：产出渠道单一（仅任务树成功蒸馏）、
      // 召回质量控制待深度调研业内主流做法（memory 系统/RAG 记忆层）后重做。
      // 停用语义：蒸馏/复核/代谢/召回全不启动；宿主侧 HostKit flywheel=null
      // 自动降级（本就支持的缺省形态），结构化知识提供方（图谱等）不受影响。
      // 重开：AGENT_MEMORY_FLYWHEEL=on
      if (isMemoryFlywheelEnabled()) {
      // KE-3 向量端口（34 号 v2）：AGENT_MEMORY_EMBEDDING 配置了嵌入模型才启用；
      // 未配置/向量存储未注册 → null → 纯关键词检索（降级语义）
      let memoryVectorPort: import('@core/platform/agent-runtime/memory/memory-flywheel').MemoryVectorPort | null = null
      try {
        const cfgRaw = process.env.AGENT_MEMORY_EMBEDDING
        if (cfgRaw) {
          const embedCfg = JSON.parse(cfgRaw) as { providerConfigId: string; modelId?: string }
          const { KnowledgeBaseService } = await import('@core/platform/services/knowledge-base.service')
          const { getVectorStore } = await import('@core/platform/services/vector/vector-store.interface')
          const kbService = new KnowledgeBaseService()
          const model = embedCfg.modelId ?? 'text-embedding-v3'
          memoryVectorPort = {
            embedTexts: async (texts) => {
              const vectors = await kbService.getEmbeddingVectors(texts, embedCfg)
              return vectors ? { vectors, model } : null
            },
            upsert: async (records) => {
              await getVectorStore().insertBatch(records.map((r) => ({
                id: r.id,
                chunkId: r.id,
                knowledgeBaseId: r.kbId,
                vector: r.vector,
                content: r.content,
                model: r.model,
                createdAt: new Date(),
              })))
            },
            search: async (kbId, vector, topK) => {
              const hits = await getVectorStore().searchSimilar(kbId, vector, topK)
              return hits.map((h) => ({ id: h.chunkId, score: h.score }))
            },
            remove: async (ids) => {
              await getVectorStore().deleteByChunkIds(ids)
            },
          }
          logger.info('[workflow-boot] 记忆向量化端口已启用（embedding 模型：' + model + '）')
        }
      } catch (e) {
        logger.warn('[workflow-boot] 记忆向量化端口初始化失败（降级关键词检索）:', e instanceof Error ? e.message : String(e))
      }
      memoryFlywheel = new MemoryFlywheelService({
        repo: db.agentMemoryEntries,
        vector: memoryVectorPort ?? undefined,
        // 落库前模型复核（48 号复盘要求）：蒸馏器自产自审不可靠——第二意见核
        // 分类正确性（可纠偏 kind）+ 复用价值（拒一次性任务细节/正确但无复用
        // 场景的常识）。失败降级跳过，人工批准闸门仍是最终放行
        review: async ({ goal, candidates, signal }) => {
          const listing = candidates
            .map((c, i) => `${i}. [${c.kind}] ${c.title}\n   ${c.content}`)
            .join('\n')
          const prompt = [
            `任务目标：${goal}`,
            '以下是经验蒸馏器从该任务产出中提取的候选知识条目，逐条审核：',
            listing,
            '审核标准：① kind 分类是否正确（fact=事实知识 / sop=做法流程 / preference=偏好约定 / skill=技能要点；不确定时给出你认为正确的分类）；',
            '② 是否真有复用价值——只对本任务有意义的一次性细节、无需提取的常识、脱离该任务后无法执行的描述，都应拒收；',
            '③ title/content 是否具体可执行（空泛套话应拒收）。',
            '输出严格 JSON：{"verdicts":[{"index":0,"accept":true},{"index":1,"accept":false,"reason":"一句话理由"},{"index":2,"accept":true,"kind":"sop"}]}',
            '每条候选都必须给出裁决。',
          ].join('\n')
          const model = await resolveBootModel()
          const r = await generateText({ model, system: '你是知识库审核员，宁可错杀不可放过的标准只用于明显无复用价值的条目，拿不准时放行（后续有人工批准闸门）。', prompt, maxOutputTokens: 1024, abortSignal: signal ?? undefined })
          const text = r.text
          const start = text.indexOf('{')
          const end = text.lastIndexOf('}')
          if (start < 0 || end <= start) return []
          try {
            const parsed = JSON.parse(text.slice(start, end + 1)) as { verdicts?: Array<{ index?: number; accept?: boolean; kind?: string; reason?: string }> }
            const validKinds = ['fact', 'sop', 'preference', 'skill', 'episode-ref']
            return (parsed.verdicts ?? [])
              .filter((v) => Number.isInteger(v.index))
              .map((v) => ({
                index: Number(v.index),
                accept: v.accept !== false,
                kind: (typeof v.kind === 'string' && validKinds.includes(v.kind) ? v.kind : undefined) as 'fact' | 'sop' | 'preference' | 'skill' | 'episode-ref' | undefined,
                reason: typeof v.reason === 'string' ? v.reason : undefined,
              }))
          } catch {
            return [] // 解析失败 = 未表态 = 全部按通过（人工闸门兜底）
          }
        },
        distill: async ({ goal, output, signal }) => {
          const prompt = [
            `任务目标：${goal}`,
            `任务产出（节选）：${output}`,
            '从中提取最多 3 条可复用经验（做法/事实/SOP），只提取确实可迁移的内容；没有就返回空数组。',
            '输出严格 JSON：{"items": [{"kind": "fact|sop|preference|skill", "title": "...", "content": "一段可执行的经验描述", "confidence": <0-1>}]}',
          ].join('\n')
          const model = await resolveBootModel()
          const r = await generateText({ model, system: '你是经验蒸馏器。', prompt, maxOutputTokens: 2048, abortSignal: signal ?? undefined })
          const text = r.text
          const start = text.indexOf('{')
          const end = text.lastIndexOf('}')
          if (start < 0 || end <= start) return []
          try {
            const parsed = JSON.parse(text.slice(start, end + 1)) as { items?: Array<{ kind?: string; title?: string; content?: string; confidence?: number }> }
            return (parsed.items ?? []).slice(0, 3).map((it) => ({
              kind: (['fact', 'sop', 'preference', 'skill'].includes(String(it.kind)) ? it.kind : 'fact') as 'fact' | 'sop' | 'preference' | 'skill',
              title: String(it.title ?? ''),
              content: String(it.content ?? ''),
              confidence: Math.max(0, Math.min(1, Number(it.confidence) || 0)),
            }))
          } catch {
            return []
          }
        },
      })
      } else {
        logger.info('[workflow-boot] 知识飞轮已停用（缺省暂停；AGENT_MEMORY_FLYWHEEL=on 可重开，登记见 36 号契约）')
      }

      // 会话存储（review W6：宿主 saveState/loadState 曾只 flush 轨迹不落库——
      // 任务循环崩溃后 retry 从零开始；DbAgentSessionStore 即 M1 的 agent_sessions 表）
      const { DbAgentSessionStore } = await import('@core/platform/agent-runtime/memory/session-store')
      const taskSessionStore = new DbAgentSessionStore({ dataSource: db.dataSource })
      // 原始流水（39 号 P0-2）：任务循环的 append-only 记录——压缩改写工作集后原文可回放
      const taskTranscriptRepo = db.dataSource
        ? new (
            await import('@core/database/repositories/agent-session-event.repository')
          ).AgentSessionEventRepository(db.dataSource)
        : null
      // 工作台会话列表数据源（29 号 M5.5）
      const { AgentSessionRepository } = await import('@core/database/repositories/agent-session.repository')
      agentSessionRepo = new AgentSessionRepository(db.dataSource)
      agentTasks = new AgentTaskService({
        tasks: db.agentTasks,
        planner,
        verifier,
        flywheel: memoryFlywheel,
        executors: {
          runAgentLoop: async ({ goal, systemPrompt, toolWhitelist, maxSteps, sessionKey, memoryLines, signal, rootId, modelTier }) => {
            // KE-2 全宿主上下文管理（四大能力①）：任务执行循环同样窗口化+压缩
            const { LoopRunner } = await import('@core/platform/agent-runtime/runtime/loop')
            const { normalizeToolWhitelist, getAgentLoopHarness } = await import('./nodes/agent-loop-node')
            const { TrajectorySink } = await import('@core/platform/agent-runtime/trajectory/sink')
            const { getAgentRunRegistry } = await import('@core/platform/agent-runtime/runtime/run-registry')
            const harness = getAgentLoopHarness()
            const defs = harness.registry.buildToolDefs(normalizeToolWhitelist(toolWhitelist ?? []))
            const scopeKey = `task:${sessionKey.replace(/^task:/, '')}`
            // 轨迹逐条外推（29 号 M5.5：工作台实时时间线；异常在 sink 内收口）
            // 运行登记（29 号 M5.5：工作台运行中徽标 + 停止按钮）。内层 controller
            // 链接服务级取消信号（cancelTree）与工作台 abort——两者都能停掉本轮。
            // 已中止的外层 signal 不再发 abort 事件——立即检查同步（review P1-1）
            const inner = new AbortController()
            const onOuterAbort = () => inner.abort(new Error('任务树已取消'))
            signal?.addEventListener('abort', onOuterAbort, { once: true })
            if (signal?.aborted) onOuterAbort()
            const { ContextManager } = await import('@core/platform/agent-runtime/context/context-manager')
            const taskContext = new ContextManager({
              contextWindowTokens: Number(process.env.AGENT_CONTEXT_WINDOW ?? 32_768) || 32_768,
            })
            const { getCurrentUserId } = await import('@core/context/user-context')
            const runRegistry = getAgentRunRegistry()
            let registered = false
            const runId = `ar_task_${scopeKey}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
            runRegistry.register({
              id: runId,
              definitionId: 'agent-task',
              scopeKey,
              label: goal.slice(0, 40),
              userId: getCurrentUserId(),
              abort: () => inner.abort(new Error('已从工作台停止')),
              metadata: { rootId },
            })
            registered = true
            const sink = new TrajectorySink(trajectoryRepo, {
              scope: 'session',
              scopeKey,
              onEntry: (sk, entry) => {
                try { getEventEmitter().emit('ac:trajectory', { scopeKey: sk, entry }) } catch { /* 广播失败不影响落库 */ }
              },
            })
            // 装配留痕（26 号 §4 验收：轨迹中可见引用——review T9）。
            // kind 用语义化 memory_assembly（36 号对齐：decision 形态会被工作台误计步数）
            if (memoryLines && memoryLines.length > 0) {
              sink.append({ iteration: 0, kind: 'memory_assembly', name: 'memory_assembly', payload: { memoryRefs: memoryLines } })
            }
            // 原始流水（39 号 P0-2）：宿主侧 pending（本轮 goal user 消息）+ loop meta 增量
            let hostPendingAppended: import('ai').ModelMessage[] = []
            let transcriptSeq: number | null = null
            const host: import('@core/platform/agent-runtime/types').AgentHost = {
              signal: inner.signal,
              // 会话持久化（review W6）：崩溃恢复 + retry 续写
              loadState: async () => {
                const history = await taskSessionStore.load(scopeKey)
                if (!history || history.length === 0) return null
                const { initState, } = await import('@core/platform/agent-runtime/runtime/loop')
                const { sanitizeSessionHistory } = await import('@core/platform/agent-runtime/runtime/session-sanitize')
                const state = initState({ definitionId: 'agent-task', scopeId: scopeKey, input: goal, systemPrompt: systemPrompt ?? '', tools: defs, maxSteps: maxSteps ?? 12 }, Date.now())
                // 清洗（悬空 tool-call → provider 400 永续；总收口 B-P1-2）+ 追加本轮
                // 目标为 user 消息（总收口 A-P1-3：带反馈重试的反馈曾因历史覆盖而
                // 从未送达模型——retryOrFail 把反馈拼进 spec.goal，此处 input=goal）
                const userMsg = { role: 'user', content: goal } as import('ai').ModelMessage
                state.messages = [...sanitizeSessionHistory(history), userMsg]
                hostPendingAppended = [userMsg]
                return state
              },
              saveState: async (state, meta) => {
                await taskSessionStore.save(scopeKey, state.messages)
                // 原始流水增量（39 号 P0-2）：宿主 pending 在前、loop meta 在后——时间序
                const appended = meta?.appended?.length ? [...hostPendingAppended, ...meta.appended] : hostPendingAppended
                hostPendingAppended = []
                if (appended.length > 0 && taskTranscriptRepo) {
                  try {
                    if (transcriptSeq === null) transcriptSeq = await taskTranscriptRepo.maxSeq(scopeKey)
                    const rows = appended.map((m) => {
                      const role = typeof (m as { role?: unknown }).role === 'string' ? String((m as { role?: unknown }).role) : 'unknown'
                      return { conversationId: scopeKey, seq: transcriptSeq!++, role, content: truncateTranscriptContent(JSON.stringify(m)) }
                    })
                    await taskTranscriptRepo.appendBatch(rows)
                  } catch (e) {
                    logger.warn('[workflow-boot] 任务原始流水落库失败（观测面不外泄）', e)
                  }
                }
                await sink.flush()
              },
              emitTrajectory: (entry) => { sink.append(entry) },
              emitStream: () => {},
              suspend: () => Promise.reject(new Error('任务执行不支持挂起审批（审批工具会被静默拒绝，白名单请用免批准工具）')),
            }
            // 叶节点模型档位（39 号 P2）：spec.model → env 映射的 provider/modelId；
            // 未配置档位回退默认模型
            const tierPref = modelTier === 'cheap' ? parseModelTierEnv(process.env.AGENT_MODEL_CHEAP)
              : modelTier === 'strong' ? parseModelTierEnv(process.env.AGENT_MODEL_STRONG)
              : undefined
            const result = await new LoopRunner({
              resolveModel: (opts) => harness.resolveModel(opts),
              context: taskContext,
            })
              .run({
                definitionId: 'agent-task',
                scopeId: scopeKey,
                input: goal,
                systemPrompt: systemPrompt ?? '',
                tools: defs,
                maxSteps: maxSteps ?? 12,
                ...(tierPref ? { modelPreference: tierPref } : {}),
              }, host)
              .catch((e: unknown) => {
                // run() 本体抛出（loadState/saveState 链）也要落运行终态（一次性）
                if (registered) {
                  registered = false
                  runRegistry.finish(runId, { id: runId, scopeKey, status: 'error', error: e instanceof Error ? e.message : String(e) })
                }
                throw e
              })
              .finally(() => {
                signal?.removeEventListener('abort', onOuterAbort)
                void sink.flush()
              })
            runRegistry.finish(runId, {
              id: runId,
              scopeKey,
              status: result.stopReason === 'final' ? 'done' : result.stopReason === 'aborted' ? 'aborted' : 'error',
              ...(result.error ? { error: result.error } : {}),
            })
            if (result.stopReason !== 'final') throw new Error(result.error ?? `Agent 循环未收敛（${result.stopReason}）`)
            return { output: result.output, stopReason: result.stopReason }
          },
          runSubWorkflow: async ({ definitionId, inputs, taskId, signal }) => {
            const run = await runService.startRun({ definitionId, triggerType: 'manual', triggerInfo: { source: 'agent-task' }, inputs })
            // 回填任务镜像列（运行森林）+ 任务行 run_id（记忆溯源——review W9/T20）
            if (db.workflowRuns) {
              try { await db.workflowRuns.update(run.id, { taskId, parentRunId: null }) } catch { /* 观测列 */ }
            }
            try { await db.agentTasks?.patch(taskId, { runId: run.id }) } catch { /* 观测列 */ }
            // 等终态（review W1：skipped 即败 / waiting_review·pending 属等待态放宽死线 /
            // 超时取消僵尸运行）
            let deadline = Date.now() + 10 * 60_000
            for (;;) {
              if (signal?.aborted) throw new Error('任务树已取消')
              await new Promise((r) => setTimeout(r, 3000))
              const detail = await runService.getRunDetail(run.id)
              if (!detail) throw new Error(`子工作流运行不存在：${run.id}`)
              const st = detail.run.status
              if (st === 'succeeded') {
                const outputs: Record<string, unknown> = {}
                for (const n of detail.nodeRuns) if (n.output) outputs[n.nodeId] = n.output
                return { output: outputs, status: st, error: null }
              }
              if (['failed', 'cancelled', 'timed_out', 'interrupted'].includes(st)) {
                return { output: null, status: st, error: detail.run.error ?? st }
              }
              // 互斥命中：假运行（skipped）不会流转——立即失败
              if (st === 'skipped') {
                return { output: null, status: 'skipped', error: '子工作流互斥跳过（同定义已有在途运行）' }
              }
              // 等待态（pending 排队 / waiting_review 人工审核）：放宽死线到 30min
              if (['pending', 'waiting_review'].includes(st) && Date.now() > deadline) {
                deadline = Date.now() + 20 * 60_000
                logger.warn(`[task] 子工作流处于 ${st}，等待死线放宽（task=${taskId}）`)
              }
              if (Date.now() > deadline) {
                const { getCurrentUserId } = await import('@core/context/user-context')
                await runService.cancelRun(run.id, getCurrentUserId() ?? '').catch(() => undefined)
                return { output: null, status: 'timed_out', error: '子工作流等待超时（已取消僵尸运行）' }
              }
            }
          },
        },
      })
      logger.info('[workflow-boot] M3 任务树子系统已装配')
    } else {
      logger.warn('[workflow-boot] M3 任务树子系统未装配（数据源/仓储缺失）')
    }
  } catch (e) {
    logger.warn('[workflow-boot] M3 任务树子系统装配失败（继续启动）', e)
  }

  // 10.5 M5.5 运行可见性（29 号批1/批3）：崩溃对账 + 运行注册表广播接线
  try {
    const subsystemForRecover = agentTasks
    if (subsystemForRecover) {
      void subsystemForRecover
        .recoverInterrupted()
        .catch((e) => logger.warn('[workflow-boot] 启动对账异常（不阻断）', e))
    }
    // 运行注册表变更 → 平台广播（工作台实时徽标；harness 不知道广播通道存在——依赖倒置）
    const { getAgentRunRegistry } = await import('@core/platform/agent-runtime/runtime/run-registry')
    getAgentRunRegistry().onChange((event) => {
      try {
        getEventEmitter().emit(
          'ac:run-update',
          event.kind === 'started'
            ? { scopeKey: event.run.scopeKey, definitionId: event.run.definitionId, label: event.run.label, status: 'running' }
            : { scopeKey: event.run.scopeKey, status: event.run.status, error: event.run.error },
        )
      } catch {
        /* 广播失败不影响登记 */
      }
    })
  } catch (e) {
    logger.warn('[workflow-boot] M5.5 运行可见性接线失败（继续启动）', e)
  }

  // 11. M5 系统 agent 工具集（28 号批1）：聊天宿主的可调度面——能力目录/运行工作流/
  //     查询运行/调用技能/创建任务树。必须在 workflow-boot 注册（组合根已持有全部
  //     依赖；业务包 activate 早于本函数，chat 包拿不到）。注册失败不阻断
  //     （聊天 Agent 模式发消息时以"工具未注册"明确降级）。
  try {
    if (!providerAdapter) throw new Error('ProviderAdapter 未装配（M5 系统工具集需要模型解析）')
    const { getAgentLoopHarness } = await import('./nodes/agent-loop-node')
    const harness = getAgentLoopHarness()
    const { registerSystemAgentTools } = await import('./tools/system-agent-tools')
    const { WorkflowDraftService } = await import('./draft/workflow-draft.service')
    draftService = new WorkflowDraftService({
      resolveModel: (opts) => providerAdapter!.resolveModel(opts),
      validate: (graph) => definitionService.validate(graph).errors,
      create: (input) => definitionService.create(input),
      saveDraft: (id, graph) => definitionService.saveDraft(id, graph),
      remove: (id) => definitionService.delete(id),
    })
    // 技能服务失败只降级 invoke_skill（目录技能为空/调用报"不存在"），
    // 不拖垮 run_workflow/discover 等无关工具（对抗 review P3）
    let skills: Parameters<typeof registerSystemAgentTools>[0]['skills']
    try {
      const { getSkillService } = await import('./skills/skill-registry')
      skills = getSkillService()
    } catch {
      skills = { list: () => [], resolveSkill: () => null }
      logger.warn('[workflow-boot] 技能服务未注册，M5 invoke_skill 降级为不可用')
    }
    registerSystemAgentTools({
      registry: harness.registry,
      runService,
      definitions: definitionService,
      tasks: agentTasks,
      skills,
      drafts: draftService,
      resolveModel: (opts) => providerAdapter!.resolveModel(opts),
    })
  } catch (e) {
    logger.warn('[workflow-boot] M5 系统 agent 工具集注册失败（继续启动）', e)
  }

  subsystem = { engine, runService, definitionService, scheduler, appDefinitionService, appSessionService, runLogger, agentTasks, memoryFlywheel, agentSessions: agentSessionRepo, agentTrajectories: trajectoryRepo, draftService }
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
  subsystem?.runLogger?.stop()
  for (const channel of attachedChannels) channel.stop()
  attachedChannels = []
  archiveJob?.stop()
  archiveJob = null
  if (reviewTickerHandle !== null) clearInterval(reviewTickerHandle)
  reviewTickerHandle = null
  subsystem = null
}

/** 飞轮 getter（KE-2：chat/LW/EP 宿主记忆装配用；未装配为 null） */
export function getMemoryFlywheel(): import('@core/platform/agent-runtime/memory/memory-flywheel').MemoryFlywheelService | null {
  return getWorkflowSubsystem().memoryFlywheel ?? null
}

/** 知识飞轮停用开关（2026-09-12 用户拍板暂停，缺省停用）。
 *  停用=蒸馏/复核/代谢/召回全不启动，宿主装配降级（null 形态），历史数据保留在表。
 *  重开：AGENT_MEMORY_FLYWHEEL=on；登记见 tasks/…/36-host-kit-contract.md */
export function isMemoryFlywheelEnabled(): boolean {
  return process.env.AGENT_MEMORY_FLYWHEEL === 'on'
}
