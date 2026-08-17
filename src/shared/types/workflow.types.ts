/**
 * 工作流领域类型定义
 * @module shared/types/workflow
 * @description 引擎（core）、编辑器（renderer）、IPC 三方共用的图结构契约。
 *
 *              存储格式为自定义结构（非 Vue Flow 原生格式）——引擎不依赖渲染层库，
 *              导入导出格式跨版本稳定；编辑器负责与 Vue Flow 的双向映射
 *              （加载：自定义格式 → Vue Flow nodes/edges；保存：逆映射，只回写 position）。
 *
 *              ⚠️ 关键语义决策（修改前必读）：
 *              1. 显式并行：只有 parallel 节点允许多条 normal 出边（扇出），
 *                 其余节点 normal 出边最多 1 条（graph-validator 强制）。
 *                 防止用户意外连线导致双重执行。
 *              2. 循环体边界：body = 从 loop-body 边目标可达的节点集合，
 *                 body 内节点的非 loop-back 出边禁止逃逸到 body 外（校验器强制）。
 *                 这消除了"某节点每迭代执行还是循环后执行一次"的歧义。
 *              3. 嵌套循环 V1 不支持（校验器报错）——嵌套时"引用循环外节点取哪个迭代
 *                 的输出"语义模糊，明确禁止优于半支持。V2 计划通过命名空间链支持。
 *              4. 运行终态严格语义：任何未恢复（未走 fail 边恢复）的节点失败
 *                 ⇒ 运行失败，即使其它分支已到达 end 节点。
 */

// ==================== 出边类型 ====================

/**
 * 出边类型。
 * - normal        正常出边（parallel 节点可有多条形成扇出，其余节点最多 1 条）
 * - fail          失败出边（节点重试耗尽后的错误分支，每个节点最多 1 条，可选）
 * - approve       人工审核 · 批准出边（含"修改后批准"），审核节点必需
 * - reject        人工审核 · 驳回出边（可选；无则驳回时运行终止）
 * - branch        条件分支 · 命中出边（edge.branchId 区分多路，每路最多 1 条边）
 * - loop-body     循环 · 循环体入口出边（循环节点必需，恰好 1 条）
 * - loop-back     循环体 · 迭代回边（指向所属循环节点；唯一允许构成环的边）
 * - loop-done     循环 · 全部迭代完成出边（循环节点必需，恰好 1 条）
 */
export type WorkflowEdgeKind =
  | 'normal'
  | 'fail'
  | 'approve'
  | 'reject'
  | 'branch'
  | 'loop-body'
  | 'loop-back'
  | 'loop-done'

// ==================== 节点类型 ====================

/** 节点类型全集（与 WorkflowNodeConfigMap 的键一一对应） */
export type WorkflowNodeType =
  // 流程控制
  | 'start'
  | 'end'
  | 'condition'
  | 'parallel'
  | 'parallel-merge'
  | 'loop'
  | 'delay'
  | 'human-review'
  | 'assign'
  // AI 能力（调用本系统已有服务）
  | 'llm-chat'
  | 'kb-retrieve'
  | 'kb-ingest'
  | 'web-search'
  | 'translate'
  | 'image-gen'
  | 'tts'
  | 'stt'
  | 'lw-generate-chapter'
  | 'lw-polish'
  // 通用
  | 'http-request'
  | 'app-notify'
  // 扩展（第三批：对齐 Dify/Bisheng 核心组件面）
  | 'template-transform'
  | 'parameter-extractor'
  | 'web-extract'
  | 'kb-qa'
  | 'report'

// ==================== 开始节点输入参数 ====================

/** 开始节点定义的输入参数（触发运行时以表单/payload/defaultValue 填充） */
export interface WorkflowStartInput {
  /** 参数键（{{start.键}} 引用） */
  key: string
  /** 显示名 */
  label: string
  type: 'string' | 'number' | 'boolean' | 'json' | 'select'
  /** type='select' 时的选项 */
  options?: Array<{ label: string; value: string | number }>
  /** type='select' 时是否多选（提交值为数组） */
  multi?: boolean
  /** 是否必填 */
  required?: boolean
  /** 默认值（定时触发无来源时使用） */
  defaultValue?: unknown
}

// ==================== 节点级执行设置 ====================

/** 节点级执行设置（覆盖工作流级默认值） */
export interface WorkflowNodeSettings {
  /** 失败自动重试次数（默认 0；封顶于工作流级 maxRetryCount） */
  retryCount?: number
  /** 重试间隔毫秒（默认 0；封顶 WORKFLOW_LIMITS.retryDelayMs） */
  retryDelayMs?: number
}

// ==================== 节点 config（按类型判别的联合） ====================

/** 条件分支的单个比较条件 */
export interface WorkflowConditionItem {
  /** 左值模板，如 "{{llm1.score}}" */
  left: string
  operator:
    | 'eq'
    | 'ne'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'contains'
    | 'not_contains'
    | 'is_empty'
    | 'not_empty'
    | 'regex'
    | 'starts_with'
    | 'ends_with'
  /** 右值模板（is_empty / not_empty 时可省略） */
  right?: string
}

/** 条件分支的一路 */
export interface WorkflowConditionBranch {
  branchId: string
  label: string
  /** 条件列表，AND 关系（全部满足才命中） */
  conditions: WorkflowConditionItem[]
}

/**
 * 各节点类型的配置。
 * 键 = WorkflowNodeType 字符串（kebab-case），保证 node.type → node.config 正确收窄。
 * 字符串字段均支持 {{}} 模板（引擎执行前统一解析，handler 拿到的是实参）。
 */
export interface WorkflowNodeConfigMap {
  start: {
    /** 输入参数定义 */
    inputs: WorkflowStartInput[]
  }
  end: Record<string, never>

  condition: {
    /** 多路分支：按声明顺序求值，命中第一个即走该路 */
    branches: WorkflowConditionBranch[]
    /** 全部未命中时：fallback=走 fallbackBranchId 边 | fail=节点失败 */
    noMatchPolicy: 'fallback' | 'fail'
    /** noMatchPolicy='fallback' 时必填（指向 branches 中某一路） */
    fallbackBranchId?: string
  }

  parallel: Record<string, never>

  'parallel-merge': {
    /** 等待策略：all=等齐全部入边（默认） | any=任一到达即通过 */
    waitPolicy: 'all' | 'any'
    /** 输出模式：merge=各入边来源输出合并为 { [nodeId]: output } | first=仅首个到达的输出 */
    outputMode: 'merge' | 'first'
  }

  loop: {
    /** 遍历列表：模板表达式，解析结果必须是数组，如 "{{http1.items}}" */
    listExpression: string
    /** 空列表策略：skip=直接走 done 边（输出空 results，默认） | fail=节点失败 */
    emptyPolicy?: 'skip' | 'fail'
  }

  delay: {
    /** 延时毫秒（模板可用；如 "{{start.waitMs}}" 或 "5000"） */
    durationMs: string
  }

  'human-review': {
    /** 送审内容：对象模板的 JSON 字符串或纯文本模板 */
    payload: string
    /** 审核超时毫秒；null=无限等待（默认） */
    timeoutMs?: number | null
    /** 超时策略：approve=视为批准 | reject=视为驳回 | fail=节点失败（默认 fail） */
    timeoutPolicy?: 'approve' | 'reject' | 'fail'
    /** 允许审核人修改的字段（"修改后批准"用）；缺省=不允许修改 */
    editableFields?: Array<{
      key: string
      label: string
      type: 'string' | 'number' | 'boolean' | 'json'
    }>
    /** 交互模式：review=批准/驳回（默认）| choose=选项路由 | input=文本编辑提交 */
    interaction?: 'review' | 'choose' | 'input'
    /** choose 模式的选项（每项对应一条 branch 出边，key=branchId——复用条件分支边机制） */
    options?: Array<{ key: string; label: string }>
  }

  assign: {
    /** 赋值列表：写入本节点输出 {{assignN.values.键}} */
    assignments: Array<{ key: string; value: string }>
  }

  'llm-chat': {
    /** Provider 配置 ID（缺省=用户默认 Provider） */
    providerConfigId?: string
    modelId?: string
    systemPrompt: string
    /** 用户消息模板 */
    prompt: string
    temperature?: number
    maxTokens?: number
    /** 解析 JSON 输出（输出多 parsed 字段；解析失败=节点失败） */
    jsonMode?: boolean
  }

  'kb-retrieve': {
    knowledgeBaseId: string
    query: string
    topK?: number
    /** 相似度阈值 0-1 */
    threshold?: number
  }

  'kb-ingest': {
    knowledgeBaseId: string
    /** 文档标题（模板可用） */
    title: string
    /** 文档内容（模板可用） */
    content: string
    /** 是否等待入库完成（false=提交即成功，默认 true） */
    waitForCompletion?: boolean
  }

  'web-search': {
    query: string
    /** 搜索引擎类型（缺省=用户默认引擎） */
    engineType?: string
    searchConfigId?: string
    maxResults?: number
  }

  translate: {
    text: string
    sourceLang?: string
    targetLang: string
    providerConfigId?: string
    modelId?: string
  }

  'image-gen': {
    prompt: string
    negativePrompt?: string
    width?: number
    height?: number
    count?: number
    /** 图像服务 Provider 配置（缺省=图像服务默认） */
    providerConfigId?: string
    modelId?: string
  }

  tts: {
    text: string
    voiceId?: string
    speed?: number
    providerConfigId?: string
    modelId?: string
  }

  stt: {
    /** 音频来源模板：文件路径或 base64 数据，如 "{{tts1.audioPath}}" */
    audio: string
    language?: string
    providerConfigId?: string
    modelId?: string
  }

  'lw-generate-chapter': {
    projectId: string
    outlineId: string
    targetWords?: number
    providerConfigId?: string
    modelId?: string
    /** 是否等待生成完成（长任务，false=提交即成功并输出 eventId；默认 false） */
    waitForCompletion?: boolean
  }

  'lw-polish': {
    projectId: string
    /** 润色字段（长文模块的 6 个背景字段之一） */
    field: string
    /** 原文内容（模板可用） */
    content: string
    providerConfigId?: string
    modelId?: string
    waitForCompletion?: boolean
  }

  'http-request': {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
    url: string
    headers?: Array<{ key: string; value: string }>
    /** 请求体模板（JSON 字符串或纯文本） */
    body?: string
    /** 超时毫秒（默认 30s；封顶 WORKFLOW_LIMITS.httpTimeoutMs） */
    timeoutMs?: number
  }

  'app-notify': {
    title: string
    message: string
    level?: 'info' | 'success' | 'warning' | 'error'
  }

  'template-transform': {
    /** 输出文本模板：多占位拼接（{{a.x}}-{{b.y}}） */
    template: string
  }

  'parameter-extractor': {
    /** 待抽取的文本来源模板 */
    input: string
    /** 抽取要求（补充给 LLM 的指令） */
    instruction?: string
    /** 抽取字段声明 */
    fields: Array<{ key: string; type?: 'string' | 'number' | 'boolean'; required?: boolean }>
    providerConfigId?: string
    modelId?: string
  }

  'web-extract': {
    url: string
    /** 正文最大长度（默认 100_000） */
    maxLength?: number
  }

  'kb-qa': {
    knowledgeBaseId: string
    question: string
    systemPrompt?: string
    topK?: number
    threshold?: number
    /** 检索上下文最大字符（默认 WORKFLOW_DEFAULTS.kbQaContextMaxChars） */
    resultMaxLength?: number
    providerConfigId?: string
    modelId?: string
    temperature?: number
  }

  'report': {
    title: string
    /** markdown 模板（引擎深解析后即为全文） */
    template: string
    format: 'markdown' | 'docx'
  }
}

// ==================== 图结构 ====================

/**
 * 节点实例（编辑器 + 引擎共用）。
 * 类型收窄：node.type 为具体值时 node.config 自动收窄到对应配置类型。
 */
export interface WorkflowNodeTyped<K extends WorkflowNodeType = WorkflowNodeType> {
  /** 节点实例 ID（编辑器生成 uuid；变量引用 {{nodeId.字段}} 使用此 ID） */
  id: string
  type: K
  /** 显示名（用户可改；运行记录快照 node_name） */
  name: string
  /** 编辑器画布坐标（引擎忽略） */
  position: { x: number; y: number }
  /** 节点级执行设置 */
  settings?: WorkflowNodeSettings
  /** 按类型变化的配置 */
  config: WorkflowNodeConfigMap[K]
}

/** 节点判别联合：type 字符串 → config 正确收窄 */
export type WorkflowNode = {
  [K in WorkflowNodeType]: WorkflowNodeTyped<K>
}[WorkflowNodeType]

/** 边：源节点出边 → 目标节点 */
export interface WorkflowEdge {
  /** 边 ID（编辑器生成） */
  id: string
  sourceNodeId: string
  targetNodeId: string
  /** 出边类型（默认 'normal'） */
  kind: WorkflowEdgeKind
  /** kind='branch' 时：条件分支 branchId */
  branchId?: string
}

/** 整图 */
export interface WorkflowGraph {
  /** 格式版本（导入兼容判断；当前 1） */
  version: 1
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  /** 画布元信息（编辑器用：视口；引擎忽略） */
  viewport?: { x: number; y: number; zoom: number }
}

/** 图校验结果 */
export interface WorkflowValidationResult {
  valid: boolean
  /** 阻断性问题（不可发布/运行） */
  errors: string[]
  /** 非阻断提示（可发布） */
  warnings: string[]
}

// ==================== 工作流级执行设置（防失控） ====================

/** 工作流级执行设置（definition.settings 列；所有项缺省回退 WORKFLOW_DEFAULTS） */
export interface WorkflowExecutionSettings {
  /** 单次运行最长时长毫秒（封顶 24h） */
  maxDurationMs?: number
  /** 循环最大迭代数（封顶 10_000） */
  maxLoopIterations?: number
  /** 单节点输出 JSON 序列化后截断长度（封顶 1_000_000） */
  maxOutputChars?: number
  /** 单节点重试次数封顶 */
  maxRetryCount?: number
  /** 单运行内最大并行节点数（封顶 20） */
  maxParallelNodes?: number
  /** 单节点最大执行次数（防环/重入失控；封顶 1000） */
  maxNodeRuns?: number
}

// ==================== 触发器 ====================

/** 触发器定义（存储于 definition.triggers JSON 列，对发布版生效） */
export type WorkflowTrigger =
  /** 手动触发（始终隐式可用，不入库） */
  | { type: 'manual' }
  | {
      type: 'cron'
      /** cron 表达式（5 段：分 时 日 月 周，本地时区） */
      expression: string
      /** 预设标识：every-minute / hourly / daily / weekly / monthly / custom（UI 还原用） */
      preset?: string
      enabled: boolean
    }
  | {
      type: 'event'
      /** 领域事件名（见 WORKFLOW_TRIGGERABLE_EVENTS 目录） */
      eventName: string
      /** 可选过滤：事件 payload 字段 === 期望值（等值匹配，AND 关系） */
      match?: Record<string, string | number | boolean>
      enabled: boolean
    }

// ==================== 运行状态枚举 ====================

/** 运行状态（workflow_runs.status） */
export type WorkflowRunStatus =
  | 'pending' // 排队中（超出全局并发上限）
  | 'running'
  | 'waiting_review' // 挂起等待人工审核（仍占用同工作流互斥）
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'interrupted' // 应用退出/崩溃中断（可续跑）
  | 'skipped' // 触发被跳过（同工作流运行中），仅留痕
  | 'timed_out' // 超过最长运行时长

/** 节点运行状态（workflow_node_runs.status） */
export type WorkflowNodeRunStatus =
  | 'pending'
  | 'running'
  | 'waiting_review'
  | 'succeeded'
  | 'failed'
  /** 失败但走了 fail 边恢复（不算运行失败，下游可引用 {{nodeId.error}}） */
  | 'failed_recovered'
  | 'cancelled'
  | 'interrupted'
  | 'skipped'
  | 'timed_out'

/** 触发方式（workflow_runs.trigger_type） */
export type WorkflowTriggerType = 'manual' | 'cron' | 'event' | 'resume'

// ==================== 运行事件（wf:run-event 通道载荷） ====================

/**
 * 运行事件统一载荷（单通道复用，type 判别）。
 * 引擎产生 → IEventEmitter 推前端；Web 端按 ALS userId 路由。
 */
export type WorkflowRunEvent =
  | {
      type: 'run-status'
      runId: string
      definitionId: string
      status: WorkflowRunStatus
      stats?: { totalNodes: number; doneNodes: number; failedNodes: number; recoveredNodes: number }
      error?: string
    }
  | {
      type: 'node-status'
      runId: string
      nodeId: string
      iterationIndex: number
      status: WorkflowNodeRunStatus
      error?: string
      routeTaken?: string
      startedAt?: number
      finishedAt?: number
    }
  | {
      type: 'node-progress'
      runId: string
      nodeId: string
      iterationIndex: number
      progress: number
      message?: string
    }
  | {
      type: 'review-requested'
      runId: string
      definitionId: string
      nodeId: string
      nodeName: string
      payload: Record<string, unknown>
      waitExpiresAt?: number
    }
  | {
      type: 'notify'
      runId: string
      level: 'info' | 'success' | 'warning' | 'error'
      title: string
      message: string
    }



/** 触发方式常量（与 WorkflowTriggerType 一一对应） */
export const WORKFLOW_TRIGGER_TYPES = {
  manual: 'manual',
  cron: 'cron',
  event: 'event',
  resume: 'resume',
} as const satisfies Record<WorkflowTriggerType, WorkflowTriggerType>

/** 审核决策常量（含超时自动决策） */
export const WORKFLOW_REVIEW_DECISIONS = {
  approve: 'approve',
  approveWithChanges: 'approve_with_changes',
  reject: 'reject',
  timeoutApprove: 'timeout_approve',
  timeoutReject: 'timeout_reject',
} as const

/** 审核超时策略常量 */
export const WORKFLOW_REVIEW_TIMEOUT_POLICIES = {
  approve: 'approve',
  reject: 'reject',
  fail: 'fail',
} as const

/** wf:run-event 载荷判别常量（引擎产生、前端消费，双端契约） */
export const WORKFLOW_RUN_EVENT_TYPES = {
  runStatus: 'run-status',
  nodeStatus: 'node-status',
  nodeProgress: 'node-progress',
  reviewRequested: 'review-requested',
  notify: 'notify',
} as const

/** 导入导出文件格式标识 */
export const WORKFLOW_EXPORT_KIND = 'the-bot-workflow'
export const WORKFLOW_EXPORT_FORMAT_VERSION = 1

// ==================== 常量唯一源（禁止裸字符串比较/赋值） ====================

/**
 * 节点类型常量：键=值，satisfies 保证与 WorkflowNodeType 联合一一对应——
 * 新增类型必须同时加联合与此表（漏加编译报错），杜绝第二套写法。
 */
export const WORKFLOW_NODE_TYPES = {
  start: 'start',
  end: 'end',
  condition: 'condition',
  parallel: 'parallel',
  'parallel-merge': 'parallel-merge',
  loop: 'loop',
  delay: 'delay',
  'human-review': 'human-review',
  assign: 'assign',
  'llm-chat': 'llm-chat',
  'kb-retrieve': 'kb-retrieve',
  'kb-ingest': 'kb-ingest',
  'web-search': 'web-search',
  translate: 'translate',
  'image-gen': 'image-gen',
  tts: 'tts',
  stt: 'stt',
  'lw-generate-chapter': 'lw-generate-chapter',
  'lw-polish': 'lw-polish',
  'http-request': 'http-request',
  'app-notify': 'app-notify',
  'template-transform': 'template-transform',
  'parameter-extractor': 'parameter-extractor',
  'web-extract': 'web-extract',
  'kb-qa': 'kb-qa',
  'report': 'report',
} as const satisfies Record<WorkflowNodeType, WorkflowNodeType>

/** 出边类型常量（键=值，与 WorkflowEdgeKind 一一对应） */
export const WORKFLOW_EDGE_KINDS = {
  normal: 'normal',
  fail: 'fail',
  approve: 'approve',
  reject: 'reject',
  branch: 'branch',
  'loop-body': 'loop-body',
  'loop-back': 'loop-back',
  'loop-done': 'loop-done',
} as const satisfies Record<WorkflowEdgeKind, WorkflowEdgeKind>

/** 运行状态常量（键=值，与 WorkflowRunStatus 一一对应） */
export const WORKFLOW_RUN_STATUSES = {
  pending: 'pending',
  running: 'running',
  waiting_review: 'waiting_review',
  succeeded: 'succeeded',
  failed: 'failed',
  cancelled: 'cancelled',
  interrupted: 'interrupted',
  skipped: 'skipped',
  timed_out: 'timed_out',
} as const satisfies Record<WorkflowRunStatus, WorkflowRunStatus>

/** 节点运行状态常量（键=值，与 WorkflowNodeRunStatus 一一对应） */
export const WORKFLOW_NODE_RUN_STATUSES = {
  pending: 'pending',
  running: 'running',
  waiting_review: 'waiting_review',
  succeeded: 'succeeded',
  failed: 'failed',
  failed_recovered: 'failed_recovered',
  cancelled: 'cancelled',
  interrupted: 'interrupted',
  skipped: 'skipped',
  timed_out: 'timed_out',
} as const satisfies Record<WorkflowNodeRunStatus, WorkflowNodeRunStatus>

// ==================== handleId 编码（编辑器 ↔ 引擎共用） ====================

/** normal 出边的 handleId（Vue Flow sourceHandle） */
export const WORKFLOW_HANDLE_OUT = 'out'

const EDGE_KIND_TO_HANDLE_ID: Record<WorkflowEdgeKind, string> = {
  normal: WORKFLOW_HANDLE_OUT,
  fail: 'fail',
  approve: 'approve',
  reject: 'reject',
  branch: 'branch', // branch 实际编码为 `branch:${branchId}`（见 encodeHandleId）
  'loop-body': 'loop-body',
  'loop-back': 'loop-back',
  'loop-done': 'loop-done',
}

/**
 * 出边 → Vue Flow handleId 编码。
 * branch 边编码为 `branch:${branchId}`，其余为固定 id。
 * 引擎的 node_run.route_taken 也存此编码（单一编码源，双端共用）。
 */
export function encodeWorkflowHandleId(kind: WorkflowEdgeKind, branchId?: string): string {
  if (kind === 'branch') return `branch:${branchId ?? ''}`
  return EDGE_KIND_TO_HANDLE_ID[kind]
}

/** handleId → 出边类型解码（encodeWorkflowHandleId 的逆函数） */
export function decodeWorkflowHandleId(handleId: string): {
  kind: WorkflowEdgeKind
  branchId?: string
} {
  if (handleId.startsWith('branch:')) {
    return { kind: 'branch', branchId: handleId.slice('branch:'.length) || undefined }
  }
  const entry = (Object.entries(EDGE_KIND_TO_HANDLE_ID) as Array<
    [WorkflowEdgeKind, string]
  >).find(([, id]) => id === handleId)
  return entry ? { kind: entry[0] } : { kind: 'normal' }
}

// ==================== 领域事件目录（事件触发器可选源） ====================

/** 节点 id 保留字（变量命名空间冲突：sys=系统变量根；start 已被开始节点语义占用） */
export const WORKFLOW_RESERVED_NODE_ID = 'sys'

/** 运行事件通道名（引擎→前端单通道；双端共用，禁止裸字符串） */
export const WORKFLOW_RUN_EVENT_CHANNEL = 'wf:run-event'

/** 领域事件名常量（埋点处与触发目录同源引用，防拼写漂移静默失配） */
export const WORKFLOW_EVENT_NAMES = {
  kbDocumentCompleted: 'kb:document-completed',
  kbDocumentFailed: 'kb:document-failed',
  imageGenerationCompleted: 'image:generation-completed',
  translationCompleted: 'translation:completed',
  translationFailed: 'translation:failed',
  voiceTtsCompleted: 'voice:tts-completed',
  voiceSttCompleted: 'voice:stt-completed',
} as const

/** 可触发工作流的领域事件（进程内事件总线发布；新增埋点时同步维护此目录） */
export const WORKFLOW_TRIGGERABLE_EVENTS: ReadonlyArray<{
  name: string
  label: string
  payloadKeys: string[]
}> = [
  {
    name: WORKFLOW_EVENT_NAMES.kbDocumentCompleted,
    label: '知识库文档入库完成',
    payloadKeys: ['documentId', 'status'],
  },
  {
    name: WORKFLOW_EVENT_NAMES.kbDocumentFailed,
    label: '知识库文档入库失败',
    payloadKeys: ['documentId', 'status'],
  },
  {
    name: WORKFLOW_EVENT_NAMES.imageGenerationCompleted,
    label: '图像生成完成',
    payloadKeys: ['taskId'],
  },
  {
    name: WORKFLOW_EVENT_NAMES.translationCompleted,
    label: '翻译完成',
    payloadKeys: ['translationId'],
  },
  {
    name: WORKFLOW_EVENT_NAMES.translationFailed,
    label: '翻译失败',
    payloadKeys: ['translationId'],
  },
  {
    name: WORKFLOW_EVENT_NAMES.voiceTtsCompleted,
    label: '语音合成完成',
    payloadKeys: ['recordId', 'text'],
  },
  {
    name: WORKFLOW_EVENT_NAMES.voiceSttCompleted,
    label: '语音识别完成',
    payloadKeys: ['recordId', 'text'],
  },
]

// ==================== 默认值与硬性上限（配置链末端） ====================

/**
 * 执行设置默认值（配置链：节点级 → 工作流级 → settings 表 wf:defaults → 此处）。
 * 修改数值属于产品决策，需同步更新功能设计文档。
 */
export const WORKFLOW_DEFAULTS = {
  /** 单次运行最长时长 30 分钟 */
  maxDurationMs: 30 * 60_000,
  /** 循环最大迭代 100 次 */
  maxLoopIterations: 100,
  /** 节点输出截断 64k 字符 */
  maxOutputChars: 64_000,
  /** 节点重试封顶 5 次 */
  maxRetryCount: 5,
  /** 单运行并行节点上限 5 */
  maxParallelNodes: 5,
  /** 全局并发运行数 3 */
  maxConcurrentRuns: 3,
  /** 单节点最大执行次数 50（对齐 Bisheng max_steps，防成环死循环） */
  maxNodeRuns: 50,
  /** cron 调度间隔 30s */
  cronTickMs: 30_000,
  /** cron 错过宽限窗口 = 2 × tick（超过视为错过，推进到未来首个触发点） */
  cronGraceFactor: 2,
  /** 审核超时扫描间隔（独立于 cronTick——语义无关，可独立调优） */
  reviewTimeoutTickMs: 30_000,
  /** HTTP 请求节点默认超时（封顶 WORKFLOW_LIMITS.httpTimeoutMs） */
  httpRequestTimeoutMs: 30_000,
  /** 知识库入库等待：轮询间隔 / 总超时 */
  kbIngestPollIntervalMs: 500,
  kbIngestWaitTimeoutMs: 120_000,
  /** kb-qa 检索上下文最大字符（P4 常量化，禁止 handler 写死） */
  kbQaContextMaxChars: 8_000,
  /** 图像生成等待：轮询间隔 / 总超时 */
  imagePollIntervalMs: 2_000,
  imagePollTimeoutMs: 300_000,
} as const

/** 硬性上限（任何层级的配置都不可超过；防失控的最终防线） */
export const WORKFLOW_LIMITS = {
  maxDurationMs: 24 * 3_600_000,
  maxLoopIterations: 10_000,
  maxOutputChars: 1_000_000,
  maxRetryCount: 10,
  maxParallelNodes: 20,
  maxConcurrentRuns: 10,
  maxNodeRuns: 1000,
  retryDelayMs: 60_000,
  httpTimeoutMs: 300_000,
  imagePollTimeoutMs: 600_000,
} as const
