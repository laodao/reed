/**
 * 「系统助手」模块参数登记表
 * @module shared/constants/module-params/system-agent
 *
 * 对话里的系统 Agent（chat 包）单轮步数。改动**下一轮生效**（宿主每轮读一次 settings）。
 * 存储位置是 `agent:budget`（第一轮配置链），归属按模块划分为系统助手。
 */

import {
  AGENT_BUDGET_DEFAULTS,
  AGENT_BUDGET_LIMITS,
} from '@shared/types/agent-budget.types'
import type { ModuleParamDefinition } from '@shared/types/module-params.types'
import { SETTINGS_KEYS } from '../settings-keys'

const D = AGENT_BUDGET_DEFAULTS
const L = AGENT_BUDGET_LIMITS

export const SYSTEM_AGENT_PARAMS: ModuleParamDefinition = {
  key: 'systemAgent',
  feature: 'chat',
  name: '系统助手',
  description: '对话框里系统助手的单轮步数（一轮里能思考并调用工具几次）。',
  settingsKey: SETTINGS_KEYS.agentBudget,
  effect: 'next-run',
  groups: [
    {
      title: '单轮步数',
      params: [
        {
          kind: 'number',
          path: 'maxSteps.systemAgent',
          label: '系统助手步数',
          hint: '对话里系统助手每轮最多走几步；调小会更容易"没查完就答复"',
          default: D.maxSteps.systemAgent,
          ceiling: L.maxSteps.systemAgent,
        },
      ],
    },
  ],
}
