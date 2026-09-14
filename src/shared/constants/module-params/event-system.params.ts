/**
 * 「事件系统」模块参数登记表
 * @module shared/constants/module-params/event-system
 *
 * 事件系统的**体积与扫描深度**护栏。存储位置仍是 `agent:budget.guards.*`（第一轮建好的键），
 * 但归属是事件系统 —— 设置页按归属分 Tab，用户不必去 AI 护栏里找"事件"。
 *
 * 背景（2026-09-13 调研发现）：`guards.maxDeepScanDepth` 第一轮登记了却**没有任何读取点**
 * （`payload-guard.ts` 用自己的常量 8），属于"UI 上的假旋钮"。本文件登记后即刻接线
 * （`payload-guard.ts` 改读进程级限额持有者），并把事件 payload 的体积上限也一并纳入。
 * 保存后由 `settings-reload` 钩子重注入持有者，**改完不必重启**。
 */

import {
  AGENT_BUDGET_DEFAULTS,
  AGENT_BUDGET_LIMITS,
} from '@shared/types/agent-budget.types'
import {
  EVENT_PARAMS_DEFAULTS as E,
  EVENT_PARAMS_LIMITS as EL,
} from '@shared/types/event-params.types'
import type { ModuleParamDefinition } from '@shared/types/module-params.types'
import { SETTINGS_KEYS } from '../settings-keys'

const D = AGENT_BUDGET_DEFAULTS
const L = AGENT_BUDGET_LIMITS

export const EVENT_SYSTEM_PARAMS: ModuleParamDefinition = {
  key: 'eventSystem',
  name: '事件系统',
  description:
    '业务事件在模块间广播时的载荷护栏：单条载荷多大算超限、嵌套扫描多深去找敏感键名。保存后立即生效。',
  settingsKey: SETTINGS_KEYS.agentBudget,
  effect: 'immediate',
  groups: [
    {
      title: '事件载荷护栏',
      description:
        '载荷超限会**拒绝发布**（生产者收到报错，提示改用引用形态），不会静默丢弃——所以调小可能让原本能发的通知发不出去。',
      params: [        {
          kind: 'number',
          path: 'guards.maxEventPayloadBytes',
          label: '单条载荷体积上限',
          hint: '事件 payload 序列化后的字节上限；超了拒绝发布并要求改用「只带 id 的引用形态」',
          unit: 'Bytes',
          default: D.guards.maxEventPayloadBytes,
          ceiling: L.guards.maxEventPayloadBytes,
          step: 4096,
          effect: 'immediate',
        },
        {
          kind: 'number',
          path: 'guards.maxDeepScanDepth',
          label: '嵌套扫描深度',
          hint: '在载荷里往下找敏感键名（password/token 等）的层数；调小会让深层敏感键漏过告警',
          unit: 'Depth',
          default: D.guards.maxDeepScanDepth,
          ceiling: L.guards.maxDeepScanDepth,
          effect: 'immediate',
        },
      ],
    },
    {
      title: '事件总线',
      description:
        '事件投递的重试与背压。这些值在**客户端启动时装配**，改完需重启客户端才生效。',
      settingsKey: SETTINGS_KEYS.eventBus,
      effect: 'restart',
      params: [
        {
          kind: 'number',
          path: 'maxAttempts',
          label: '最大投递尝试次数',
          hint: '一条事件投递失败后最多重试几次（含首次）；调大更耐瞬时故障，但失败事件占用更久',
          default: E.bus.maxAttempts,
          ceiling: EL.bus.maxAttempts,
        },
        {
          kind: 'number',
          path: 'sweepIntervalMs',
          label: '兜底扫表间隔',
          hint: '多久扫一次表补投"崩溃窗口漏掉"的事件；调小更及时，但更频繁查库',
          unit: 'Ms',
          default: E.bus.sweepIntervalMs,
          ceiling: EL.bus.sweepIntervalMs,
          step: 1_000,
        },
        {
          kind: 'number',
          path: 'scanBatchSize',
          label: '扫表批量',
          hint: '一次最多取多少条待投事件；事件堆积时调大能更快清空',
          default: E.bus.scanBatchSize,
          ceiling: EL.bus.scanBatchSize,
          step: 100,
        },
        {
          kind: 'number',
          path: 'maxInFlight',
          label: '在途上限（命名消费者）',
          hint: '单个消费者同时最多处理多少条未确认事件；调大吞吐更高，但内存与并发压力更大',
          default: E.bus.maxInFlight,
          ceiling: EL.bus.maxInFlight,
          step: 500,
        },
        {
          kind: 'number',
          path: 'maxAnonymousInFlight',
          label: '在途上限（匿名订阅）',
          hint: '匿名订阅者的在途上限（防一个订阅者拖垮总线）',
          default: E.bus.maxAnonymousInFlight,
          ceiling: EL.bus.maxAnonymousInFlight,
          step: 500,
        },
      ],
    },
    {
      title: '事件归档',
      description:
        '把老事件导出到文件并从库里清掉。人工决策类事件（审核/审批）**永不归档**，这是合规语义，不开放。改完需重启客户端。',
      settingsKey: SETTINGS_KEYS.eventArchive,
      effect: 'restart',
      params: [
        {
          kind: 'number',
          path: 'retentionDays',
          label: '事件保留天数',
          hint: '超过这么多天的普通事件会被归档（导出后从库里删除）；想留更久就调大',
          default: E.archive.retentionDays,
          ceiling: EL.archive.retentionDays,
          step: 30,
        },
        {
          kind: 'number',
          path: 'intervalMs',
          label: '归档作业间隔',
          hint: '多久跑一次归档（默认每天一次）',
          unit: 'Ms',
          default: E.archive.intervalMs,
          ceiling: EL.archive.intervalMs,
          step: 3_600_000,
        },
        {
          kind: 'number',
          path: 'batchSize',
          label: '归档批量',
          hint: '一次最多导出/删除多少条；事件量大时调大能更快清完',
          default: E.archive.batchSize,
          ceiling: EL.archive.batchSize,
          step: 500,
        },
      ],
    },
  ],
}
