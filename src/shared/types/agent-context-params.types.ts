/**
 * Agent 上下文与记忆参数默认值 / 硬上限
 * @module shared/types/agent-context-params.types
 *
 * 这些值以前是 `context-manager.ts` / `host-kit.ts` / `memory-flywheel.ts` 里的模块级常量：
 * 上下文压缩用多少 token 预算、记忆召回几条、蒸馏的置信度闸门多高……
 * 一旦默认不合理（例如上下文窗口给太小、召回条数给太少），用户只能改代码。
 *
 * 现在归入「参数设置 → 上下文与记忆」Tab（两个 settings 键：`agent:context` / `agent:memory`），
 * 由 `shared/utils/agent-context-params.ts` 的持有者提供，装配方在使用点前注入。
 *
 * 数值单位纪律（命名规范）：token 用 `Tokens`、字符用 `Chars`、比率一律存**整数百分比**
 * （框架只收整数；读取点除以 100），条数不加后缀。
 */

/** 上下文装配与压缩 */
export interface AgentContextParams {
  /** 模型上下文窗口（tokens；宿主未显式指定时的通用缺省） */
  windowTokens: number
  /** 用户消息保留预算（tokens；从新到旧原样保留，不被压缩掉） */
  userMessageBudgetTokens: number
  /** 近端保护预算（tokens；保护边界内的工具结果不剪枝） */
  protectedTailTokens: number
  /** 纯剪枝最小节省门槛（tokens；不足则进摘要阶段） */
  minPruneSavingsTokens: number
  /** 同签名大结果折叠门槛（tokens；小于它不折叠，避免把小结果也占位化） */
  supersedeCollapseMinTokens: number
  /** turn_start 快照截断（字符；系统提示词快照只留这么多） */
  maxTurnSnapshotChars: number
}

/** 记忆飞轮（蒸馏 / 查重 / 召回 / 归档） */
export interface AgentMemoryParams {
  /** 每次召回条数（topK） */
  assembleTopK: number
  /** 单次蒸馏最多沉淀几条 */
  distillMaxItems: number
  /** 置信度闸门（百分比；低于它的候选直接丢弃） */
  confidenceGatePercent: number
  /** 查重重叠率阈值（百分比；达到就判为重复） */
  dedupOverlapThresholdPercent: number
  /** 蒸馏输入文本截断（字符；任务输出太长时只取开头） */
  maxDistillInputChars: number
  /** 零命中条目归档天数 */
  archiveStaleDays: number
}

/** 上下文与记忆参数（分组） */
export interface AgentContextRuntimeParams {
  context: AgentContextParams
  memory: AgentMemoryParams
}

/** 内置默认值（= 改造前写死在各自模块里的常量） */
export const AGENT_CONTEXT_DEFAULTS: AgentContextRuntimeParams = {
  context: {
    // host-kit 的 DEFAULT_CONTEXT_WINDOW（宿主未显式给窗口时用；领域共学另有自己的配置）
    windowTokens: 32_768,
    userMessageBudgetTokens: 20_000,
    protectedTailTokens: 8_000,
    minPruneSavingsTokens: 4_000,
    supersedeCollapseMinTokens: 1_500,
    maxTurnSnapshotChars: 8_000,
  },
  memory: {
    assembleTopK: 3,
    distillMaxItems: 3,
    confidenceGatePercent: 70, // 改造前 CONFIDENCE_GATE = 0.7
    dedupOverlapThresholdPercent: 60, // 改造前 DEDUP_OVERLAP_THRESHOLD = 0.6
    maxDistillInputChars: 16_000,
    archiveStaleDays: 30,
  },
}

/** 代码级硬上限（配置值一律夹到这里；下限为 1，避免"配成 0 把功能关死"） */
export const AGENT_CONTEXT_LIMITS: AgentContextRuntimeParams = {
  context: {
    windowTokens: 200_000,
    userMessageBudgetTokens: 100_000,
    protectedTailTokens: 64_000,
    minPruneSavingsTokens: 32_000,
    supersedeCollapseMinTokens: 16_000,
    maxTurnSnapshotChars: 40_000,
  },
  memory: {
    assembleTopK: 20,
    distillMaxItems: 20,
    confidenceGatePercent: 100,
    dedupOverlapThresholdPercent: 95,
    maxDistillInputChars: 200_000,
    archiveStaleDays: 365,
  },
}
