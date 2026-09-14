/**
 * 「上下文与记忆」模块参数登记表
 * @module shared/constants/module-params/agent-context
 *
 * 一个 Tab 覆盖两个 settings 键（框架支持参数级 `settingsKey` 覆盖，这正是它的用武之地）：
 * - `agent:context`：上下文装配与压缩预算（窗口、用户消息保留、剪枝门槛、快照截断）
 * - `agent:memory`：记忆飞轮（召回条数、蒸馏条数、置信度闸门、查重阈值、归档天数）
 *
 * 两个键的载荷都是**平铺**的（键名本身已是"模块:对象"，再套一层 `context.context` 没有意义；
 * 与 `wf:defaults` 的平铺执行护栏同理）。数值来源为 `agent-context-params.types.ts` 的
 * `AGENT_CONTEXT_DEFAULTS` / `AGENT_CONTEXT_LIMITS`。
 *
 * 用户为什么会想调这些（调研结论）：上下文窗口/预算给太小 → 频繁压缩、丢上下文、答非所问；
 * 召回条数与蒸馏条数给太少 → 记忆几乎不起作用；置信度闸门太高 → 蒸馏出来的经验全被丢弃。
 */

import {
  AGENT_CONTEXT_DEFAULTS as D,
  AGENT_CONTEXT_LIMITS as L,
} from '@shared/types/agent-context-params.types'
import type { ModuleParamDefinition } from '@shared/types/module-params.types'
import { SETTINGS_KEYS } from '../settings-keys'

const CONTEXT = SETTINGS_KEYS.agentContext
const MEMORY = SETTINGS_KEYS.agentMemory

export const AGENT_CONTEXT_PARAMS: ModuleParamDefinition = {
  key: 'agentContext',
  name: '上下文与记忆',
  description:
    'Agent 每轮带多少上文、什么时候压缩、压缩时保留什么；以及记忆飞轮蒸馏/查重/召回的尺度。保存后立即生效。',
  settingsKey: CONTEXT,
  effect: 'immediate',
  groups: [
    {
      title: '上下文装配与压缩',
      description:
        '窗口与预算是"一次能带多少上文"。给太小会频繁触发压缩（压缩会丢细节），给太大则更贵、更容易触及模型上限。',
      params: [
        {
          kind: 'number',
          path: 'windowTokens',
          label: '上下文窗口',
          hint: '宿主未单独指定模型窗口时用这个值；调小会更早触发压缩',
          unit: 'Tokens',
          default: D.context.windowTokens,
          ceiling: L.context.windowTokens,
          step: 1024,
        },
        {
          kind: 'number',
          path: 'userMessageBudgetTokens',
          label: '用户消息保留预算',
          hint: '从新到旧原样保留的用户消息预算（永不压缩掉）；调小会让早期对话被折叠',
          unit: 'Tokens',
          default: D.context.userMessageBudgetTokens,
          ceiling: L.context.userMessageBudgetTokens,
          step: 1000,
        },
        {
          kind: 'number',
          path: 'protectedTailTokens',
          label: '近端保护预算',
          hint: '最近的这段上下文不参与剪枝；调小会让更早的工具结果被剪掉',
          unit: 'Tokens',
          default: D.context.protectedTailTokens,
          ceiling: L.context.protectedTailTokens,
          step: 1000,
        },
        {
          kind: 'number',
          path: 'minPruneSavingsTokens',
          label: '纯剪枝最小节省',
          hint: '光靠剪枝省不到这么多就直接进摘要压缩；调小更倾向剪枝（便宜但丢原文）',
          unit: 'Tokens',
          default: D.context.minPruneSavingsTokens,
          ceiling: L.context.minPruneSavingsTokens,
          step: 500,
        },
        {
          kind: 'number',
          path: 'supersedeCollapseMinTokens',
          label: '重复大结果折叠门槛',
          hint: '同参数的大结果重复出现时折叠成占位（只留最新全文）；小于这个体积的不折叠',
          unit: 'Tokens',
          default: D.context.supersedeCollapseMinTokens,
          ceiling: L.context.supersedeCollapseMinTokens,
          step: 500,
        },
        {
          kind: 'number',
          path: 'maxTurnSnapshotChars',
          label: '系统提示词快照截断',
          hint: '轮次快照里保留的系统提示词长度；调小会让排障时看不到完整提示词',
          unit: 'Chars',
          default: D.context.maxTurnSnapshotChars,
          ceiling: L.context.maxTurnSnapshotChars,
          step: 1000,
        },
      ],
    },
    {
      title: '记忆飞轮',
      description:
        '任务结束后蒸馏经验、下次任务召回。条数太少记忆几乎不起作用，闸门太高会把蒸馏出来的经验全丢掉。',
      settingsKey: MEMORY,
      params: [
        {
          kind: 'number',
          path: 'assembleTopK',
          label: '每次召回条数',
          hint: '开始任务时注入几条相关记忆；条数太多会挤占上下文',
          default: D.memory.assembleTopK,
          ceiling: L.memory.assembleTopK,
        },
        {
          kind: 'number',
          path: 'distillMaxItems',
          label: '单次蒸馏条数',
          hint: '一次任务结束最多沉淀几条经验',
          default: D.memory.distillMaxItems,
          ceiling: L.memory.distillMaxItems,
        },
        {
          kind: 'number',
          path: 'confidenceGatePercent',
          label: '置信度闸门',
          hint: '低于这个百分比的候选直接丢弃；调低会有更多（也可能更水的）经验被留下待审',
          unit: 'Percent',
          default: D.memory.confidenceGatePercent,
          ceiling: L.memory.confidenceGatePercent,
          step: 5,
        },
        {
          kind: 'number',
          path: 'dedupOverlapThresholdPercent',
          label: '查重重叠率阈值',
          hint: '新候选与既有记忆重叠到这个百分比就判为重复丢弃；调低会更严格去重',
          unit: 'Percent',
          default: D.memory.dedupOverlapThresholdPercent,
          ceiling: L.memory.dedupOverlapThresholdPercent,
          step: 5,
        },
        {
          kind: 'number',
          path: 'maxDistillInputChars',
          label: '蒸馏输入截断',
          hint: '任务输出太长时只取开头这么多字符送蒸馏；调大会更完整但更贵',
          unit: 'Chars',
          default: D.memory.maxDistillInputChars,
          ceiling: L.memory.maxDistillInputChars,
          step: 1000,
        },
        {
          kind: 'number',
          path: 'archiveStaleDays',
          label: '零命中归档天数',
          hint: '多久没被召回就归档（归档不等于删除，仍可查）',
          default: D.memory.archiveStaleDays,
          ceiling: L.memory.archiveStaleDays,
        },
      ],
    },
  ],
}
