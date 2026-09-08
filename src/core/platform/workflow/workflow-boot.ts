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
    trajectories: trajectoryRepo,
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
    const agentToolRegistry = new AgentToolRegistry({
      audit: auditRepo
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
    })

    registerBuiltinAgentTools(agentToolRegistry)
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

      // 会话存储（review W6：宿主 saveState/loadState 曾只 flush 轨迹不落库——
      // 任务循环崩溃后 retry 从零开始；DbAgentSessionStore 即 M1 的 agent_sessions 表）
      const { DbAgentSessionStore } = await import('@core/platform/agent-runtime/memory/session-store')
      const taskSessionStore = new DbAgentSessionStore({ dataSource: db.dataSource })
      // 工作台会话列表数据源（29 号 M5.5）
      const { AgentSessionRepository } = await import('@core/database/repositories/agent-session.repository')
      agentSessionRepo = new AgentSessionRepository(db.dataSource)
      agentTasks = new AgentTaskService({
        tasks: db.agentTasks,
        planner,
        verifier,
        flywheel: memoryFlywheel,
        executors: {
          runAgentLoop: async ({ goal, systemPrompt, toolWhitelist, maxSteps, sessionKey, memoryLines, signal, rootId }) => {
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
            // 装配留痕（26 号 §4 验收：轨迹中可见引用——review T9）
            if (memoryLines && memoryLines.length > 0) {
              sink.append({ iteration: 0, kind: 'decision', name: 'memory_assembly', payload: { memoryRefs: memoryLines } })
            }
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
                state.messages = [...sanitizeSessionHistory(history), { role: 'user', content: goal } as import('ai').ModelMessage]
                return state
              },
              saveState: async (state) => {
                await taskSessionStore.save(scopeKey, state.messages)
                await sink.flush()
              },
              emitTrajectory: (entry) => { sink.append(entry) },
              emitStream: () => {},
              suspend: () => Promise.reject(new Error('任务执行不支持挂起审批（审批工具会被静默拒绝，白名单请用免批准工具）')),
            }
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

  subsystem = { engine, runService, definitionService, scheduler, appDefinitionService, appSessionService, agentTasks, memoryFlywheel, agentSessions: agentSessionRepo, agentTrajectories: trajectoryRepo, draftService }
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

/** 飞轮 getter（KE-2：chat/LW/EP 宿主记忆装配用；未装配为 null） */
export function getMemoryFlywheel(): import('@core/platform/agent-runtime/memory/memory-flywheel').MemoryFlywheelService | null {
  return getWorkflowSubsystem().memoryFlywheel ?? null
}
