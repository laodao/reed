/**
 * 工作流运行参数（分组）默认值与硬上限
 * @module shared/types/workflow-params.types
 *
 * ── 与 `WORKFLOW_DEFAULTS` / `WORKFLOW_LIMITS` 的关系 ──
 * `wf:defaults` 的载荷有两种形态：
 * - **平铺**：引擎级执行护栏（`maxDurationMs` / `maxLoopIterations` / …）—— 这一层同时是
 *   工作流定义层（`definition.settings`）的契约，**保持平铺不动**（见 `WorkflowExecutionSettings`）；
 * - **分组**（本文件）：节点/驱动侧那些以前写死在各自模块里的运行参数（抓取礼貌、长任务轮询、
 *   代码沙箱超时…）—— 新增参数一律分组，符合命名规范第 2 条。
 *
 * 数值来源仍以 `WORKFLOW_DEFAULTS` / `WORKFLOW_LIMITS` 为唯一出处：本文件只做**分组归类**
 * （`crawl.delayMsMin` ← `WORKFLOW_DEFAULTS.crawlDelayMsMin`），不另抄一份数字。
 * 只有原先"完全没有默认值/上限"的项才在这里给出新数值，并注明理由。
 *
 * ── 为什么这些参数以前改不动 ──
 * 它们的读取点是模块级常量（`WORKFLOW_DEFAULTS.x`），改配置要先改代码。
 * 现在统一由 `shared/utils/workflow-runtime-params.ts` 的持有者提供，启动时注入、
 * settings 保存后重新注入（`shared/utils/settings-reload.ts`），**改完不用重启**。
 */

import { WORKFLOW_DEFAULTS as D, WORKFLOW_LIMITS as L } from './workflow.types'

/** 抓取礼貌与网页抓取 */
export interface WorkflowCrawlParams {
  /** 请求前随机间隔下限（毫秒；0 = 不等待） */
  delayMsMin: number
  /** 请求前随机间隔上限（毫秒） */
  delayMsMax: number
  /** 同一站点的最大并发（1 = 同站单线程） */
  hostConcurrency: number
  /** HTTP 请求默认超时（毫秒） */
  httpRequestTimeoutMs: number
  /** 抓取响应体字节上限 */
  responseMaxBytes: number
  /** 正文提取最大字符数 */
  extractMaxChars: number
  /** 每个来源最多提取多少条链接（同时是节点配置的上限） */
  maxLinksPerSource: number
  /** 每个页面最多提取多少条链接（同时是节点配置的上限） */
  maxLinksPerPage: number
  /** 并行抓取的来源数上限（同时是节点配置的上限） */
  maxSources: number
  /** 并行抓取的页面数上限 */
  maxConcurrentPages: number
}

/** 长任务轮询 / 等待（知识库入库、图像生成、语音复刻、子工作流、kb 问答上下文） */
export interface WorkflowPollingParams {
  kbIngestIntervalMs: number
  kbIngestWaitTimeoutMs: number
  imageIntervalMs: number
  imageWaitTimeoutMs: number
  voiceCloneIntervalMs: number
  voiceCloneWaitTimeoutMs: number
  /** kb-qa 节点检索上下文的最大字符数 */
  kbQaContextMaxChars: number
  /** 子工作流节点等待子运行终态的超时（毫秒；同时是节点配置的上限） */
  subflowWaitTimeoutMs: number
  /** 子工作流轮询间隔（毫秒） */
  subflowIntervalMs: number
  /** 视频生成节点的等待上限（毫秒） */
  videoWaitTimeoutMs: number
}

/** 节点侧调用的外部工具（CLI / 解析器 / 下载器）超时 */
export interface WorkflowToolsParams {
  /** 自定义 CLI 工具的默认执行超时（毫秒） */
  cliTimeoutMs: number
  /** 视频来源解析（B 站/抖音等）的请求超时（毫秒） */
  videoUrlResolveTimeoutMs: number
  /** yt-dlp 二进制下载超时（毫秒） */
  ytDlpDownloadTimeoutMs: number
  /** yt-dlp 单次请求 socket 超时（秒；直接传给 --socket-timeout） */
  ytDlpSocketTimeoutSec: number
}

/** 对话附件检索（把聊天记录/附件切块后检索） */
export interface WorkflowRetrievalParams {
  /** 附件分块大小（字符） */
  dialogFileChunkChars: number
  /** 分块重叠（字符；必须小于分块大小） */
  dialogFileChunkOverlapChars: number
  /** 扫描多少条对话消息 */
  dialogFileMaxMessages: number
  /** 检索返回条数 */
  dialogFileTopK: number
}

/** 代码节点沙箱 */
export interface WorkflowCodeSandboxParams {
  /** 单次执行超时（毫秒）——同步段（vm timeout 拦死循环） */
  timeoutMs: number
  /** 宿主调用整体墙钟超时（毫秒；含所有 await host.* 的等待） */
  asyncTimeoutMs: number
  /** 单次节点执行内宿主函数调用次数上限（防代码内循环绕开引擎循环上限） */
  maxHostCalls: number
}

/** 应用数据表（内置 wf_data_table_*）的容量护栏 */
export interface WorkflowDataTablesParams {
  /** 单表行数上限（超限拒写并提示归档） */
  maxRowsPerTable: number
  /** 单个 definition（app 作用域）的表数上限 */
  maxTablesPerDefinition: number
}

/** 工作流的「系统工具面」（Agent 通过 run_workflow / 能力目录等工具观察与控制工作流） */
export interface WorkflowSystemToolsParams {
  /** 能力目录一次最多列多少条（工作流/技能/工具共用这个上限） */
  catalogMaxItems: number
  /** 等待运行终态的轮询间隔（毫秒） */
  runPollIntervalMs: number
  /** 等待运行终态的超时（毫秒） */
  runWaitTimeoutMs: number
  /** 运行摘要里最多列几个节点 */
  nodeSummaryMax: number
  /** 节点输出摘要的截断长度（字符） */
  nodeOutputDigestChars: number
  /** 失败运行错误摘要的截断长度（字符） */
  runErrorDigestChars: number
  /** 运行"查不到"连续几次就放弃（防 API 抖动导致长等） */
  runMissingStreakLimit: number
}

/** 自然语言生成工作流草稿 */
export interface WorkflowDraftParams {
  /** 生成失败后的最大修复轮数 */
  maxAttempts: number
  /** 单张草稿最多几个节点 */
  maxNodes: number
}

/** 触发与调度（只含热路径可现读的部分；tick 间隔是进程级定时器，见登记表说明） */
export interface WorkflowTriggerParams {
  /** 事件触发的每分钟上限（防自触发链/事件风暴） */
  eventMaxPerMinute: number
  /** cron 错过宽限倍数（× tick；超过视为错过，推进到未来首个触发点） */
  cronGraceFactor: number
}

/** 界面上与工作流相关的展示截断 */
export interface WorkflowUiParams {
  /** 「查看上下文」里文本预览的截断长度（字符） */
  contextTextChars: number
  /** 「查看上下文」里工具入参/出参摘要的截断长度（字符） */
  contextPartChars: number
  /** 审批卡上任务描述的截断长度（字符） */
  approvalTaskChars: number
  /** 列表默认每页条数 */
  defaultPageSize: number
  /** 表单上传文件体积上限（字节） */
  formUploadMaxBytes: number
}

/** 数据源连接池（工作流「数据表」节点连的外部库） */
export interface WorkflowDatasourceParams {
  /** 池空闲回收时长（毫秒；超时即销毁，惰性清扫） */
  poolIdleTtlMs: number
  /** 缓存的连接池数上限 */
  maxPools: number
  /** 单个连接池最大连接数 */
  maxPoolConnections: number
  /** 建连超时（毫秒） */
  connectTimeoutMs: number
  /** SQL 查询超时（毫秒） */
  queryTimeoutMs: number
}

/** 工作流运行参数（分组；存储于 settings 键 `wf:defaults`） */
export interface WorkflowRuntimeParams {
  crawl: WorkflowCrawlParams
  polling: WorkflowPollingParams
  codeSandbox: WorkflowCodeSandboxParams
  dataTables: WorkflowDataTablesParams
  systemTools: WorkflowSystemToolsParams
  draft: WorkflowDraftParams
  trigger: WorkflowTriggerParams
  ui: WorkflowUiParams
  tools: WorkflowToolsParams
  retrieval: WorkflowRetrievalParams
  datasource: WorkflowDatasourceParams
}

/** 内置默认值（= 改造前写死在各自模块里的常量） */
export const WORKFLOW_PARAMS_DEFAULTS: WorkflowRuntimeParams = {
  crawl: {
    delayMsMin: D.crawlDelayMsMin,
    delayMsMax: D.crawlDelayMsMax,
    hostConcurrency: D.crawlHostConcurrency,
    httpRequestTimeoutMs: D.httpRequestTimeoutMs,
    // 以下 6 项改造前是节点/工具里的内联字面量
    responseMaxBytes: 50 * 1024 * 1024, // response-body.ts MAX_RESPONSE_BYTES
    extractMaxChars: 100_000, // extra-nodes / node-tool-adapter 的 `?? 100_000`
    maxLinksPerSource: 30, // 新闻采集 `?? 30`
    maxLinksPerPage: 50, // 链接采集 `?? 50`
    maxSources: 10, // 新闻采集并行源数 `?? 10`
    maxConcurrentPages: 5, // 链接采集并行页数 `?? 5`
  },
  polling: {
    kbIngestIntervalMs: D.kbIngestPollIntervalMs,
    kbIngestWaitTimeoutMs: D.kbIngestWaitTimeoutMs,
    imageIntervalMs: D.imagePollIntervalMs,
    imageWaitTimeoutMs: D.imagePollTimeoutMs,
    voiceCloneIntervalMs: D.voiceClonePollIntervalMs,
    voiceCloneWaitTimeoutMs: D.voiceCloneWaitTimeoutMs,
    kbQaContextMaxChars: D.kbQaContextMaxChars, // WORKFLOW_DEFAULTS.kbQaContextMaxChars
    subflowWaitTimeoutMs: L.subflowTimeoutMs, // 改造前"默认值=上限"都是 WORKFLOW_LIMITS.subflowTimeoutMs
    subflowIntervalMs: 500, // 子工作流节点里的 `sleep(500)`
    videoWaitTimeoutMs: 70 * 60 * 1000, // video-nodes 里的 `setTimeout(..., 70 * 60 * 1000)`
  },
  codeSandbox: {
    // 改造前 code-nodes 直接拿 WORKFLOW_LIMITS.codeTimeoutMs（5s）当超时用，
    // 于是"上限"同时是"默认值"，节点想配更长也会被夹回 5s；现在默认与上限分开。
    timeoutMs: D.codeTimeoutMs,
    // 宿主调用墙钟（设计 §2.3）：真实 IO 等待期间事件循环空闲、可被墙钟打断
    asyncTimeoutMs: 60_000,
    maxHostCalls: 50,
  },
  dataTables: {
    maxRowsPerTable: 10_000,
    maxTablesPerDefinition: 20,
  },
  systemTools: {
    // 以下 7 项改造前是 system-agent-tools.ts 里的导出常量
    catalogMaxItems: 20, // CATALOG_MAX_WORKFLOWS / _SKILLS / _TOOLS（三处同值，合并为一个参数）
    runPollIntervalMs: 2_000, // RUN_WORKFLOW_POLL_INTERVAL_MS
    runWaitTimeoutMs: 180_000, // RUN_WORKFLOW_WAIT_TIMEOUT_MS
    nodeSummaryMax: 20, // NODE_SUMMARY_MAX
    nodeOutputDigestChars: 400, // NODE_OUTPUT_DIGEST_MAX
    runErrorDigestChars: 2_000, // RUN_ERROR_DIGEST_MAX
    runMissingStreakLimit: 3, // RUN_MISSING_STREAK_LIMIT
  },
  draft: {
    maxAttempts: 2, // DRAFT_MAX_ATTEMPTS
    maxNodes: 20, // DRAFT_MAX_NODES
  },
  trigger: {
    eventMaxPerMinute: 20, // EVENT_TRIGGER_MAX_PER_MINUTE
    cronGraceFactor: D.cronGraceFactor, // WORKFLOW_DEFAULTS.cronGraceFactor
  },
  ui: {
    contextTextChars: 1_600, // CONTEXT_TEXT_LIMIT
    contextPartChars: 400, // CONTEXT_PART_LIMIT
    approvalTaskChars: 200, // APPROVAL_TASK_CONTEXT_MAX_CHARS
    defaultPageSize: 20, // workflow.handler 的 `pageSize ?? 20`
    formUploadMaxBytes: 10 * 1024 * 1024, // workflow.handler 的 10MB 上传上限
  },
  tools: {
    cliTimeoutMs: 30_000, // tool.service 的 `tool.timeoutMs ?? 30000`
    videoUrlResolveTimeoutMs: 10_000, // video-url-resolver 的 5 处 `AbortSignal.timeout(10_000)`
    ytDlpDownloadTimeoutMs: 120_000, // yt-dlp-manager 的 `AbortSignal.timeout(120_000)`
    ytDlpSocketTimeoutSec: 30, // yt-dlp-manager 的 `--socket-timeout 30`
  },
  retrieval: {
    dialogFileChunkChars: 800, // CHUNK_SIZE
    dialogFileChunkOverlapChars: 100, // CHUNK_OVERLAP
    dialogFileMaxMessages: 200, // 对话附件扫描条数
    dialogFileTopK: 5, // 对话附件检索条数
  },
  datasource: {
    poolIdleTtlMs: 5 * 60_000, // POOL_IDLE_TTL_MS
    maxPools: 20, // MAX_POOLS
    maxPoolConnections: 5, // postgresql/mysql/mssql 驱动 pool.max 与 sqlserver max
    connectTimeoutMs: 8_000, // 各驱动建连超时
    queryTimeoutMs: 30_000, // clickhouse-driver 查询超时（pg/mysql/mssql 无读取点，见登记表说明）
  },
}

/**
 * 代码级硬上限（配置值一律夹到这里）。
 * 表内没有现成上限的项在此给出（抓取间隔下限、各轮询间隔与等待超时）。
 */
export const WORKFLOW_PARAMS_LIMITS: WorkflowRuntimeParams = {
  crawl: {
    delayMsMin: L.crawlDelayMsMin,
    delayMsMax: L.crawlDelayMsMax,
    hostConcurrency: L.crawlHostConcurrency,
    httpRequestTimeoutMs: L.httpTimeoutMs,
    responseMaxBytes: 200 * 1024 * 1024,
    extractMaxChars: 1_000_000,
    maxLinksPerSource: 200,
    maxLinksPerPage: 200,
    maxSources: 20,
    maxConcurrentPages: 20,
  },
  polling: {
    kbIngestIntervalMs: 10_000,
    kbIngestWaitTimeoutMs: 1_800_000,
    imageIntervalMs: 30_000,
    imageWaitTimeoutMs: L.imagePollTimeoutMs,
    voiceCloneIntervalMs: 60_000,
    voiceCloneWaitTimeoutMs: 3_600_000,
    kbQaContextMaxChars: 200_000,
    subflowWaitTimeoutMs: 3_600_000,
    subflowIntervalMs: 10_000,
    videoWaitTimeoutMs: 5_400_000,
  },
  codeSandbox: {
    timeoutMs: L.codeTimeoutMs,
    asyncTimeoutMs: 600_000,
    maxHostCalls: 500,
  },
  dataTables: {
    maxRowsPerTable: 100_000,
    maxTablesPerDefinition: 100,
  },
  systemTools: {
    catalogMaxItems: 100,
    runPollIntervalMs: 30_000,
    runWaitTimeoutMs: 3_600_000,
    nodeSummaryMax: 100,
    nodeOutputDigestChars: 4_000,
    runErrorDigestChars: 20_000,
    runMissingStreakLimit: 20,
  },
  draft: {
    maxAttempts: 5,
    maxNodes: 100,
  },
  trigger: {
    eventMaxPerMinute: 600,
    cronGraceFactor: 10,
  },
  ui: {
    contextTextChars: 20_000,
    contextPartChars: 5_000,
    approvalTaskChars: 2_000,
    defaultPageSize: 100,
    formUploadMaxBytes: 100 * 1024 * 1024,
  },
  datasource: {
    poolIdleTtlMs: 3_600_000, // POOL_IDLE_TTL_MS（5 分钟）
    maxPools: 100, // MAX_POOLS（20）
    maxPoolConnections: 20, // 各驱动 pool max=5
    connectTimeoutMs: 60_000, // 各驱动建连超时 8s
    queryTimeoutMs: 300_000, // ClickHouse 查询超时 30s
  },
  tools: {
    cliTimeoutMs: 600_000,
    videoUrlResolveTimeoutMs: 60_000,
    ytDlpDownloadTimeoutMs: 600_000,
    ytDlpSocketTimeoutSec: 120,
  },
  retrieval: {
    dialogFileChunkChars: 4_000,
    dialogFileChunkOverlapChars: 500,
    dialogFileMaxMessages: 2_000,
    dialogFileTopK: 50,
  },
}
