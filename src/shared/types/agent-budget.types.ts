/**
 * Agent 预算 / 护栏参数（平台级配置契约；2026-09-13 用户需求）
 * @module shared/types/agent-budget.types
 *
 * ── 背景 ──
 * 用户：「maxCalls=12 这类参数应该以系统配置参数方式管理，而不是写死在代码中」。
 * 现状是同一代码库里三套做法：`wf:defaults`（工作流执行设置）早就走"内置默认 → settings 表 →
 * 硬上限"的配置链，而 agent 侧的单轮步数 / 每工具上限 / 落库额度 / 采集预算 / 并发 / 截断护栏
 * 全部写死在各自模块里。代价很实在：`dl_save_concept` 的 12 次额度在两天内被按症状改了三次。
 *
 * ── settings 参数命名规范（用户 2026-09-13 要求"参数名要统一命名规范"）──
 * 适用于所有进 settings 表的配置（新键必须遵守；存量键的归并见 progress 文档的迁移计划）：
 *
 * 1. **存储键**：`<模块>:<对象>`。模块 = 单个小写单词、不带驼峰、不用缩写；对象 = lowerCamelCase。
 *    例：`agent:budget`、`wf:defaults`。反例：`eventBus:rateLimits`（模块带驼峰）→ 应为 `event:rateLimits`。
 * 2. **顶层字段一律分组**，不平铺（`maxSteps` / `maxCalls` / `domainLearning` / `guards` / `ui`）。
 * 3. **上限类统一 `max<对象>` 前缀**：`maxSteps`、`maxCalls`、`maxSaveBudget`、`maxConcurrentRuns`、
 *    `maxToolResultBytes`。不用 `xxxMax` 后缀（避免 `saveBudgetMax` 与 `maxSaveBudget` 两种写法并存）。
 *    表达"不可超越的顶"用 `...Ceiling`（如 `maxSteps.subagentCeiling`）。
 * 4. **单位后缀**：`Bytes` / `Chars` / `Tokens` / `Ms` / `Depth`；"次数"不加后缀（`maxSteps`、`maxCalls`）。
 * 5. **子模块用全称**：`domainLearning`（不写 `dl`）、`systemAgent`；工具名保持注册名原样（`dl_save_concept`）。
 * 6. **布尔**用形容词/过去分词（`enabled`、`multiTurn`），不用 `isEnabled` / `enableXxx`。
 * 7. **默认值与硬上限常量**：`<域>_<对象>_DEFAULTS` / `_LIMITS`（本文件的 `AGENT_BUDGET_*`）。
 * 8. **环境变量**（仅开发期应急）：`UPPER_SNAKE`，且必须在注释里写明优先级与"仅开发用"。
 *
 * ── 配置链 ──
 * **内置默认（本文件）→ settings 覆盖 → 单轮动态派生**（如"已确认方案按条目数放宽额度"这一层
 * 仍然生效，但其硬顶受 `domainLearning.maxSaveBudget` 约束）。解析在
 * `core/platform/agent-runtime/budget/agent-budget.ts`（纯函数 + 夹取 + 说明）。
 * `AGENT_BUDGET_LIMITS` 是代码级硬上限（不可被用户抬高——它是"配置错了也不会失控"的最终防线）。
 */

import { SETTINGS_KEYS } from '../constants/settings-keys'

/** settings 表键名（命名规范第 1 条：`<模块>:<对象>`；登记在 shared/constants/settings-keys） */
export const AGENT_BUDGET_SETTINGS_KEY = SETTINGS_KEYS.agentBudget

/** 单轮步数（按宿主/场景分开：研究轮与任务轮需要不同预算） */
export interface AgentBudgetMaxSteps {
  /** 领域共学 research 轮（研究概念/起步研究） */
  research: number
  /** 领域共学 task 轮（补全知识地图等任务执行） */
  task: number
  /** 系统助手（chat 包） */
  systemAgent: number
  /** 剧集制作 agent */
  episode: number
  /** 工作流 agent-loop 节点缺省迭代轮数 */
  workflowAgentLoop: number
  /** 子代理（subagent 工具）缺省轮数 */
  subagent: number
  /** 子代理轮数顶（单次调用不可超过它） */
  subagentCeiling: number
}

/** 调用次数上限（按工具名；两类语义分开，避免"同名不同义"） */
export interface AgentBudgetMaxCalls {
  /**
   * 平台默认表 + 用户覆盖（**领域共学宿主与设置页展示用**）。
   * 注意：不同宿主对同名工具的默认可能不同（如 `invoke_skill` 领域共学 6 / 系统助手 3），
   * 所以**跨宿主接入请读 `overrides`**，不要把这张合并表直接喂给别的宿主（会悄悄放宽成本闸门）。
   */
  byTool: Record<string, number>
  /** 同上（采集读工具） */
  read: Record<string, number>
  /**
   * **仅用户在设置页显式配置过**的工具上限（非法键已剔除、值已夹取）。
   * 各宿主的取数口径：`overrides[工具名] ?? 本宿主内置默认`。
   */
  overrides: Record<string, number>
}

/** 领域共学专项预算 */
export interface AgentBudgetDomainLearning {
  /** 规划落库轮的落库额度（分支+知识点、前置边） */
  saveBudget: { concepts: number; relations: number }
  /** 落库额度硬顶（按方案条目数派生时也不会超过它） */
  maxSaveBudget: number
  /** 自动推进（pace 调度器）并发运行数 */
  maxConcurrentRuns: number
  /** 会话上下文窗口（token；超过会触发压缩） */
  contextWindowTokens: number
}

/** 安全 / 体积护栏（默认值集中在此，不再散落各模块；可调但夹代码级硬上限） */
export interface AgentBudgetGuards {
  /** 工具结果序列化上限（字节） */
  maxToolResultBytes: number
  /** 单字段字符串截断上限（字符） */
  maxToolResultFieldChars: number
  /** 工具产物（artifact）单条上限（字节） */
  maxArtifactBytes: number
  /** 单条 transcript 消息上限（字节） */
  maxTranscriptMessageBytes: number
  /** 轨迹 payload 上限（字节） */
  maxTrajectoryPayloadBytes: number
  /** 审计 resultPreview 截断（字符） */
  maxAuditPreviewChars: number
  /** 结果遍历深度上限 */
  maxResultWalkDepth: number
  /** 事件 payload 深扫深度上限（事件系统模块的 Tab 展示；2026-09-13 起真正接线） */
  maxDeepScanDepth: number
  /** 事件 payload 序列化字节上限（事件系统模块的 Tab 展示；2026-09-13 起真正接线） */
  maxEventPayloadBytes: number
}

/** 解析后的完整预算（全部字段具体化） */
export interface ResolvedAgentBudget {
  maxSteps: AgentBudgetMaxSteps
  maxCalls: AgentBudgetMaxCalls
  domainLearning: AgentBudgetDomainLearning
  guards: AgentBudgetGuards
}

/**
 * settings 表 `agent:budget` 的载荷（全部可缺省；缺省 = 用内置默认）。
 * 分层结构允许只覆盖关心的字段（如只改 `domainLearning.saveBudget.concepts`）。
 *
 * 注意：第一轮曾把"是否向用户开放参数编辑"的开关放在这里（`ui.enabled`）。
 * 第二轮「参数设置」升级为平台级多模块页面后，该开关移到 `ui:params`（见 `SETTINGS_KEYS.uiParams`），
 * 本键只承载**运行时参数**。
 */
export interface AgentBudgetSettings {
  maxSteps?: Partial<AgentBudgetMaxSteps>
  maxCalls?: {
    byTool?: Record<string, number>
    read?: Record<string, number>
  }
  domainLearning?: {
    saveBudget?: { concepts?: number; relations?: number }
    maxSaveBudget?: number
    maxConcurrentRuns?: number
    contextWindowTokens?: number
  }
  guards?: Partial<AgentBudgetGuards>
}

/**
 * 内置默认值（= 改造前写死在代码里的值；不配置时行为与改造前一致）。
 * 改这些数值属于产品决策：改完要同步 `AGENT_BUDGET_LIMITS`（默认必须 ≤ 硬上限）。
 */
export const AGENT_BUDGET_DEFAULTS: ResolvedAgentBudget = {
  maxSteps: {
    research: 12,
    task: 16,
    systemAgent: 12,
    episode: 12,
    workflowAgentLoop: 20,
    subagent: 8,
    subagentCeiling: 16,
  },
  maxCalls: {
    // 领域共学动作工具（原 DL_TOOL_MAX_CALLS）+ 进度工具
    byTool: {
      discover_capabilities: 2,
      invoke_skill: 6,
      dl_save_concept: 12,
      dl_save_relation: 14,
      dl_save_space_prereqs: 2,
      // 书籍建议（2026-10-04）：规划轮最多提交/重发一次清单
      dl_save_book_suggestions: 2,
      dl_save_card: 4,
      dl_answer_question: 1,
      dl_propose_understanding: 3,
      dl_propose_syllabus: 3,
      // 讲义流水线 Plan 阶段（2026-09-14）：一轮里提交/重做讲义方案的次数
      dl_propose_lesson_plan: 3,
      dl_task_progress: 12,
    },
    // 领域共学采集读工具（原 DL_READ_TOOL_MAX_CALLS）
    read: {
      wf_kb_retrieve: 4,
      wf_web_extract: 3,
      http_get: 4,
      web_search: 3,
    },
    overrides: {},
  },
  domainLearning: {
    saveBudget: { concepts: 30, relations: 40 },
    maxSaveBudget: 60,
    maxConcurrentRuns: 3,
    contextWindowTokens: 24_000,
  },
  guards: {
    maxToolResultBytes: 16_384,
    maxToolResultFieldChars: 2_000,
    maxArtifactBytes: 256 * 1024,
    maxTranscriptMessageBytes: 512 * 1024,
    maxTrajectoryPayloadBytes: 16_384,
    maxAuditPreviewChars: 500,
    maxResultWalkDepth: 8,
    maxDeepScanDepth: 8,
    // 事件总线单条 payload 上限（改造前是 payload-guard.ts 里的 MAX_PAYLOAD_BYTES = 64KB）
    maxEventPayloadBytes: 64 * 1024,
  },
}

/**
 * 代码级硬上限（配置值一律夹到这里；下限统一为 1，避免"配成 0 把功能关死"这类误操作）。
 * 注意：本对象**不随用户配置变化**——它是最终防线；用户能在 [1, 上限] 这个区间里调。
 */
export const AGENT_BUDGET_LIMITS: ResolvedAgentBudget = {
  maxSteps: {
    research: 40,
    task: 60,
    systemAgent: 40,
    episode: 40,
    workflowAgentLoop: 500,
    subagent: 40,
    subagentCeiling: 80,
  },
  maxCalls: {
    byTool: {
      // 表内工具的通用封顶见 AGENT_TOOL_MAX_CALLS_CEILING；这里列出需要更严格的特例
      invoke_skill: 30,
      dl_save_card: 20,
      web_search: 30,
    },
    read: {
      wf_kb_retrieve: 30,
      wf_web_extract: 30,
      http_get: 30,
      web_search: 30,
    },
    overrides: {},
  },
  domainLearning: {
    saveBudget: { concepts: 200, relations: 400 },
    maxSaveBudget: 400,
    maxConcurrentRuns: 10,
    contextWindowTokens: 200_000,
  },
  guards: {
    maxToolResultBytes: 1_048_576,
    maxToolResultFieldChars: 20_000,
    maxArtifactBytes: 16 * 1024 * 1024,
    maxTranscriptMessageBytes: 16 * 1024 * 1024,
    maxTrajectoryPayloadBytes: 1024 * 1024,
    maxAuditPreviewChars: 5_000,
    maxResultWalkDepth: 20,
    maxDeepScanDepth: 20,
    maxEventPayloadBytes: 4 * 1024 * 1024,
  },
}

/** 工具单轮上限的通用封顶（未在 AGENT_BUDGET_LIMITS.maxCalls.byTool 特例列出的工具用这个） */
export const AGENT_TOOL_MAX_CALLS_CEILING = 200
