/**
 * 工具执行与人工审批参数默认值 / 硬上限
 * @module shared/types/agent-tool-params.types
 *
 * ── 为什么这些要开放 ──
 * 调研发现两处"改不动的默认值"，用户撞上就只能改代码：
 * 1. **工具执行超时 120s 且有两份默认值**（工具注册表 `registry.ts` 与循环 `loop.ts` 各一份，
 *    宿主构造时都没传）→ 长任务（代码执行、跑工作流、生图）动不动就"工具超时失败"；
 * 2. **人工审批超时 5 分钟**（`approval.ts`），剧集制作另有一份 30 分钟的默认值 →
 *    用户离开一会儿回来审批卡就超时自动拒绝了。
 *
 * 归入「参数设置 → 工具与审批」Tab（两个 settings 键：`agent:tools` / `agent:approval`）。
 */

/** 工具执行与结果处理 */
export interface AgentToolParams {
  /** 直调工具的执行超时（毫秒） */
  executeTimeoutMs: number
  /** 结果序列化时数组保留项数 */
  maxResultArrayItems: number
  /** 二进制字段判定最小长度（字符；短值原样保留） */
  binaryFieldMinChars: number
  /** 「不在白名单」提示里列举可用工具的上限 */
  hintToolListMax: number
}

/** 人工审批 */
export interface AgentApprovalParams {
  /** 每张审批卡超时（毫秒；超时按拒绝处理） */
  timeoutMs: number
  /** 审批卡摘要展示上限（字符） */
  maxCardSummaryChars: number
  /** 会话级免批缓存容量（0 = 关闭 Amendment 免批） */
  sessionCacheCapacity: number
}

/** 工具与审批参数（分组；跨两个 settings 键） */
export interface AgentToolRuntimeParams {
  tools: AgentToolParams
  approval: AgentApprovalParams
}

/** 内置默认值（= 改造前写死在各自模块里的常量） */
export const AGENT_TOOL_DEFAULTS: AgentToolRuntimeParams = {
  tools: {
    executeTimeoutMs: 120_000, // TOOL_EXECUTE_TIMEOUT_MS / loop.ts 内联 120_000
    maxResultArrayItems: 20, // TOOL_RESULT_ARRAY_KEEP
    binaryFieldMinChars: 256, // BINARY_FIELD_MIN_CHARS
    hintToolListMax: 10, // HINT_TOOL_LIST_MAX
  },
  approval: {
    timeoutMs: 300_000, // approval.ts 的 5 * 60_000
    maxCardSummaryChars: 2_000, // CARD_SUMMARY_MAX_CHARS
    sessionCacheCapacity: 64,
  },
}

/** 代码级硬上限（配置值一律夹到这里） */
export const AGENT_TOOL_LIMITS: AgentToolRuntimeParams = {
  tools: {
    executeTimeoutMs: 1_800_000,
    maxResultArrayItems: 200,
    binaryFieldMinChars: 4_096,
    hintToolListMax: 50,
  },
  approval: {
    timeoutMs: 3_600_000,
    maxCardSummaryChars: 20_000,
    sessionCacheCapacity: 512,
  },
}
