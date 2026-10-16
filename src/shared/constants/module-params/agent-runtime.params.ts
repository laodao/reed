/**
 * 「AI 运行时」模块参数登记表（平台级，跨业务模块）
 * @module shared/constants/module-params/agent-runtime
 *
 * 这里放的是**不属于某个具体业务模块**的运行时参数：工作流 Agent 节点与子代理的步数、
 * 以及安全护栏（体积/截断/深度）。业务模块自己的参数在各模块的登记表里（领域共学/系统助手/剧集制作…）。
 *
 * 存在 settings 键 `agent:budget`（第一轮已建好的配置链），默认值与硬上限的唯一来源是
 * `shared/types/agent-budget.types.ts`。
 *
 * 生效时机（2026-09-13 第二轮修正）：这些值由"启动时装配的持有者/单例"提供，
 * 但使用点都是**现读**，且 settings 保存后会走 `settings-reload` 钩子**重新注入**
 * （进程级限额持有者 + 工具注册表护栏），因此**改完不必重启客户端**。
 */

import {
  AGENT_BUDGET_DEFAULTS,
  AGENT_BUDGET_LIMITS,
} from '@shared/types/agent-budget.types'
import type { ModuleParamDefinition } from '@shared/types/module-params.types'
import { SETTINGS_KEYS } from '../settings-keys'

const D = AGENT_BUDGET_DEFAULTS
const L = AGENT_BUDGET_LIMITS
/** 保存后由重注入钩子刷新（使用点现读持有者），无需重启 */
const IMMEDIATE = 'immediate' as const

export const AGENT_RUNTIME_PARAMS: ModuleParamDefinition = {
  key: 'agentRuntime',
  feature: 'workflow',
  name: 'AI 运行时',
  description:
    '跨业务模块的运行时护栏：工作流 Agent 节点与子代理的步数、工具返回值的截断与体积上限。保存后立即生效。',
  settingsKey: SETTINGS_KEYS.agentBudget,
  effect: IMMEDIATE,
  groups: [
    {
      title: '工作流 Agent 节点与子代理',
      params: [
        {
          kind: 'number',
          path: 'maxSteps.workflowAgentLoop',
          label: 'Agent 节点缺省迭代轮数',
          hint: '工作流里 agent-loop 节点没单独配轮数时用它；节点自己配了以节点为准',
          default: D.maxSteps.workflowAgentLoop,
          ceiling: L.maxSteps.workflowAgentLoop,
          effect: IMMEDIATE,
        },
        {
          kind: 'number',
          path: 'maxSteps.subagent',
          label: '子代理缺省步数',
          hint: '主 Agent 派子代理干活时的默认步数',
          default: D.maxSteps.subagent,
          ceiling: L.maxSteps.subagent,
          effect: IMMEDIATE,
        },
        {
          kind: 'number',
          path: 'maxSteps.subagentCeiling',
          label: '子代理步数上限',
          hint: '子代理请求再大的步数也不会超过它（不得小于「子代理缺省步数」）',
          default: D.maxSteps.subagentCeiling,
          ceiling: L.maxSteps.subagentCeiling,
          effect: IMMEDIATE,
        },
      ],
    },
    {
      title: '安全护栏（体积 / 截断 / 深度）',
      description:
        '防止单个工具返回值/产物/日志把内存或数据库撑爆。调大能少丢内容，但更吃内存、更费 token。',
      params: [
        {
          kind: 'number',
          path: 'guards.maxToolResultBytes',
          label: '工具结果上限',
          hint: '单个工具返回值序列化后的字节上限，超了会被截断（截断后模型看不到完整内容）',
          unit: 'Bytes',
          default: D.guards.maxToolResultBytes,
          ceiling: L.guards.maxToolResultBytes,
          step: 1024,
          effect: IMMEDIATE,
        },
        {
          kind: 'number',
          path: 'guards.maxToolResultFieldChars',
          label: '单字段截断长度',
          hint: '工具结果里单个字符串字段的截断长度',
          unit: 'Chars',
          default: D.guards.maxToolResultFieldChars,
          ceiling: L.guards.maxToolResultFieldChars,
          step: 100,
          effect: IMMEDIATE,
        },
        {
          kind: 'number',
          path: 'guards.maxArtifactBytes',
          label: '工具产物上限',
          hint: '工具产物（大结果转存）单条字节上限',
          unit: 'Bytes',
          default: D.guards.maxArtifactBytes,
          ceiling: L.guards.maxArtifactBytes,
          step: 65536,
          effect: IMMEDIATE,
        },
        {
          kind: 'number',
          path: 'guards.maxTranscriptMessageBytes',
          label: '单条会话消息上限',
          hint: '会话流水单条消息的字节上限，超了存占位（回看时看不到原文）',
          unit: 'Bytes',
          default: D.guards.maxTranscriptMessageBytes,
          ceiling: L.guards.maxTranscriptMessageBytes,
          step: 65536,
          effect: IMMEDIATE,
        },
        {
          kind: 'number',
          path: 'guards.maxTrajectoryPayloadBytes',
          label: '轨迹记录上限',
          hint: '单条轨迹 payload 的字节上限，超了降级为摘要（排障时看不到完整请求）',
          unit: 'Bytes',
          default: D.guards.maxTrajectoryPayloadBytes,
          ceiling: L.guards.maxTrajectoryPayloadBytes,
          step: 4096,
          effect: IMMEDIATE,
        },
        {
          kind: 'number',
          path: 'guards.maxAuditPreviewChars',
          label: '审计预览截断',
          hint: '审计日志里参数预览的截断长度',
          unit: 'Chars',
          default: D.guards.maxAuditPreviewChars,
          ceiling: L.guards.maxAuditPreviewChars,
          step: 100,
          effect: IMMEDIATE,
        },
        {
          kind: 'number',
          path: 'guards.maxResultWalkDepth',
          label: '工具结果遍历深度',
          hint: '序列化工具结果时递归的层数；调小会让深层字段被丢掉',
          unit: 'Depth',
          default: D.guards.maxResultWalkDepth,
          ceiling: L.guards.maxResultWalkDepth,
          effect: IMMEDIATE,
        },
        {
          kind: 'number',
          path: 'guards.maxDeepScanDepth',
          label: '事件载荷扫描深度',
          hint: '事件载荷嵌套扫描（找敏感键名）的递归深度',
          unit: 'Depth',
          default: D.guards.maxDeepScanDepth,
          ceiling: L.guards.maxDeepScanDepth,
          effect: IMMEDIATE,
        },
        {
          kind: 'number',
          path: 'guards.maxEventPayloadBytes',
          label: '事件载荷体积上限',
          hint: '单个事件 payload 的字节上限，超了拒绝发布（要求改用引用形态）',
          unit: 'Bytes',
          default: D.guards.maxEventPayloadBytes,
          ceiling: L.guards.maxEventPayloadBytes,
          step: 4096,
          effect: IMMEDIATE,
        },
      ],
    },
  ],
  /** 子代理上限不得低于缺省步数（否则子代理一启动就被夹死） */
  crossFieldGuard: (values) => {
    const steps = values['maxSteps.subagent'] as number
    const ceiling = values['maxSteps.subagentCeiling'] as number
    if (typeof steps === 'number' && typeof ceiling === 'number' && ceiling < steps) {
      values['maxSteps.subagentCeiling'] = steps
      return [`maxSteps.subagentCeiling(${ceiling}) 低于 maxSteps.subagent(${steps})，已抬到后者`]
    }
    return []
  },
}
