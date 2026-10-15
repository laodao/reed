/**
 * 「剧集制作」模块参数登记表
 * @module shared/constants/module-params/episode-production
 *
 * 剧集制作 Agent 单轮步数。改动**下一轮生效**。
 * 存储位置是 `agent:budget`（第一轮配置链），归属按模块划分为剧集制作。
 */

import {
  AGENT_BUDGET_DEFAULTS,
  AGENT_BUDGET_LIMITS,
} from '@shared/types/agent-budget.types'
import type { ModuleParamDefinition } from '@shared/types/module-params.types'
import { SETTINGS_KEYS } from '../settings-keys'

const D = AGENT_BUDGET_DEFAULTS
const L = AGENT_BUDGET_LIMITS

export const EPISODE_PRODUCTION_PARAMS: ModuleParamDefinition = {
  key: 'episodeProduction',
  feature: 'episode-production',
  name: '剧集制作',
  description: '剧本/分镜等剧集制作任务的单轮步数。',
  settingsKey: SETTINGS_KEYS.agentBudget,
  effect: 'next-run',
  groups: [
    {
      title: '单轮步数',
      params: [
        {
          kind: 'number',
          path: 'maxSteps.episode',
          label: '剧集制作步数',
          hint: '剧本/分镜类任务每轮最多走几步；这类任务通常需要比研究轮更多',
          default: D.maxSteps.episode,
          ceiling: L.maxSteps.episode,
        },
      ],
    },
  ],
}
