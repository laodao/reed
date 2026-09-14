/**
 * 「工具与审批」模块参数登记表
 * @module shared/constants/module-params/agent-tool
 *
 * 一个 Tab 覆盖两个 settings 键：`agent:tools`（工具执行与结果处理）+ `agent:approval`（人工审批）。
 *
 * 这两个键的载荷平铺（键名本身已是"模块:对象"）。数值来源为 `agent-tool-params.types.ts`。
 *
 * 用户为什么会想调（调研结论）：
 * - 工具执行超时 120s：代码执行/跑工作流/生图这类长任务动辄超时失败，而此前**有两份默认值**且
 *   宿主构造时都没传（注册表一份、循环一份）；
 * - 审批超时 5 分钟：用户离开一会儿回来，审批卡已超时自动拒绝（剧集制作另有一份 30 分钟默认值）；
 * - 结果数组只留前 20 项 / 单字段截断：调大才能让模型看到完整的列表型结果。
 */

import {
  AGENT_TOOL_DEFAULTS as D,
  AGENT_TOOL_LIMITS as L,
} from '@shared/types/agent-tool-params.types'
import type { ModuleParamDefinition } from '@shared/types/module-params.types'
import { SETTINGS_KEYS } from '../settings-keys'

const TOOLS = SETTINGS_KEYS.agentTools
const APPROVAL = SETTINGS_KEYS.agentApproval

export const AGENT_TOOL_PARAMS: ModuleParamDefinition = {
  key: 'agentTools',
  name: '工具与审批',
  description:
    '工具执行多久算超时、工具结果太长怎么截断、人工审批卡等多久算超时。保存后立即生效。',
  settingsKey: TOOLS,
  effect: 'immediate',
  groups: [
    {
      title: '工具执行',
      params: [
        {
          kind: 'number',
          path: 'executeTimeoutMs',
          label: '工具执行超时',
          hint: '单个工具调用多久没返回就判超时失败；跑工作流/生成图片/长代码这类慢工具需要调大',
          unit: 'Ms',
          default: D.tools.executeTimeoutMs,
          ceiling: L.tools.executeTimeoutMs,
          step: 10_000,
        },
      ],
    },
    {
      title: '工具结果处理',
      description:
        '结果太大时会被截断再交给模型。调大能少丢内容，但更吃上下文（也更费 token）。',
      params: [
        {
          kind: 'number',
          path: 'maxResultArrayItems',
          label: '数组保留项数',
          hint: '结果是长列表时只把前几项交给模型，其余用「仅保留前 N 项」标注；列表型结果（检索/文件清单）调大更完整',
          default: D.tools.maxResultArrayItems,
          ceiling: L.tools.maxResultArrayItems,
          step: 5,
        },
        {
          kind: 'number',
          path: 'binaryFieldMinChars',
          label: '二进制字段判定长度',
          hint: 'base64/dataUrl 这类字段超过这个长度就不进上下文（只留体积），避免一次请求把窗口撑爆',
          unit: 'Chars',
          default: D.tools.binaryFieldMinChars,
          ceiling: L.tools.binaryFieldMinChars,
          step: 64,
        },
        {
          kind: 'number',
          path: 'hintToolListMax',
          label: '可用工具提示条数',
          hint: '模型调了不在名单里的工具时，提示里最多列举几个可用工具',
          default: D.tools.hintToolListMax,
          ceiling: L.tools.hintToolListMax,
        },
      ],
    },
    {
      title: '人工审批',
      description:
        '需要你点确认的危险操作（写数据、执行代码、发外部请求）。超时按拒绝处理——离开电脑前把超时调大，回来还能批。',
      settingsKey: APPROVAL,
      params: [
        {
          kind: 'number',
          path: 'timeoutMs',
          label: '审批等待超时',
          hint: '一张审批卡最多等多久；超时 = 自动拒绝（不是自动通过）',
          unit: 'Ms',
          default: D.approval.timeoutMs,
          ceiling: L.approval.timeoutMs,
          step: 60_000,
        },
        {
          kind: 'number',
          path: 'maxCardSummaryChars',
          label: '审批卡摘要截断',
          hint: '审批卡上展示的操作摘要长度；调小会让长参数看不全',
          unit: 'Chars',
          default: D.approval.maxCardSummaryChars,
          ceiling: L.approval.maxCardSummaryChars,
          step: 500,
        },
        {
          kind: 'number',
          path: 'sessionCacheCapacity',
          label: '免批缓存容量',
          hint: '同一会话里批准过的同类操作可自动放行，缓存这么多条；0 = 关闭免批（每次都问）',
          default: D.approval.sessionCacheCapacity,
          ceiling: L.approval.sessionCacheCapacity,
          step: 16,
          zeroMeansDisabled: true,
        },
      ],
    },
  ],
}
