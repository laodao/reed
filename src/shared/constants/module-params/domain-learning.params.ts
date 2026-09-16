/**
 * 「领域共学」模块参数登记表
 * @module shared/constants/module-params/domain-learning
 *
 * 这些参数都存在 settings 键 `agent:budget` 下（第一轮已建好的配置链），
 * 但**归属**于领域共学模块：单轮步数、每工具调用上限、知识地图落库额度、自动推进并发、上下文窗口。
 * 设置页按归属分 Tab，用户找"领域共学一轮能建多少知识点"时不必去翻 agent 的通用护栏。
 *
 * 默认值与硬上限来自 `shared/types/agent-budget.types.ts`（那里是数值的唯一来源）。
 */

import {
  AGENT_BUDGET_DEFAULTS,
  AGENT_BUDGET_LIMITS,
  AGENT_TOOL_MAX_CALLS_CEILING,
} from '@shared/types/agent-budget.types'
import type { ModuleParamDefinition } from '@shared/types/module-params.types'
import { SETTINGS_KEYS } from '../settings-keys'

const D = AGENT_BUDGET_DEFAULTS
const L = AGENT_BUDGET_LIMITS

export const DOMAIN_LEARNING_PARAMS: ModuleParamDefinition = {
  key: 'domainLearning',
  name: '领域共学',
  description:
    '生成/补全知识地图、研究单个知识点时的步数预算、每一次工具的调用次数、一轮能落库多少知识点与关系边，以及自动推进的并发与上下文窗口。',
  settingsKey: SETTINGS_KEYS.agentBudget,
  effect: 'next-run',
  groups: [
    {
      title: '单轮步数',
      description: '一个"轮"= 模型思考一次 + 调用若干工具；步数用完这一轮就结束（没做完的要写进总结）。',
      params: [
        {
          kind: 'number',
          path: 'maxSteps.research',
          label: '研究知识点步数',
          hint: '研究单个知识点/起步研究时每轮的步数；调小会更容易"没研究完就收尾"，调大会更慢更贵',
          default: D.maxSteps.research,
          ceiling: L.maxSteps.research,
        },
        {
          kind: 'number',
          path: 'maxSteps.task',
          label: '任务执行步数',
          hint: '执行任务（如补全知识地图、重做讲义）时的步数；条目多的任务需要更大',
          default: D.maxSteps.task,
          ceiling: L.maxSteps.task,
        },
      ],
    },
    {
      title: '每轮工具调用上限',
      description:
        '按工具名限次，**跨宿主生效**（同一工具在系统助手/剧集制作里也按这个数）。留空=内置默认；表里没有的工具可以自己加。',
      params: [
        {
          kind: 'numberMap',
          path: 'maxCalls.byTool',
          label: '写类工具',
          hint: '一轮里这个工具最多能调几次；给少了会出现"知识点没建完就收尾"',
          defaults: D.maxCalls.byTool,
          ceilings: L.maxCalls.byTool,
          ceiling: AGENT_TOOL_MAX_CALLS_CEILING,
          allowCustomKeys: true,
          labels: {
            discover_capabilities: '查看可用工具',
            invoke_skill: '调用技能',
            dl_save_concept: '落库知识点',
            dl_save_relation: '建立前置关系',
            dl_save_space_prereqs: '主题前置要求',
            dl_save_card: '编写讲义',
            dl_answer_question: '回答问题',
            dl_propose_understanding: '提交诉求理解',
            dl_propose_syllabus: '提交知识体系',
            dl_propose_lesson_plan: '提交讲义方案',
            dl_task_progress: '上报任务进度',
          },
        },
        {
          kind: 'numberMap',
          path: 'maxCalls.read',
          label: '检索/采集工具',
          hint: '一轮里检索或抓取最多几次；给少了资料不足，给多了费时费钱',
          defaults: D.maxCalls.read,
          ceilings: L.maxCalls.read,
          ceiling: AGENT_TOOL_MAX_CALLS_CEILING,
          allowCustomKeys: true,
          labels: {
            wf_kb_retrieve: '知识库检索',
            wf_web_extract: '网页正文提取',
            http_get: '接口/原文抓取',
            web_search: '联网搜索',
          },
        },
      ],
    },
    {
      title: '知识地图落库额度',
      description: '规划落库那一轮能建多少东西；不够用会让后面的知识点"静默消失"。',
      params: [
        {
          kind: 'number',
          path: 'domainLearning.saveBudget.concepts',
          label: '一轮落库知识点',
          hint: '含分支目录；低于方案条目数就会有知识点建不出来',
          default: D.domainLearning.saveBudget.concepts,
          ceiling: L.domainLearning.saveBudget.concepts,
        },
        {
          kind: 'number',
          path: 'domainLearning.saveBudget.relations',
          label: '一轮落库关系边',
          hint: '不能小于知识点数（否则点建完了边建不完，自动被抬到与知识点相同）',
          default: D.domainLearning.saveBudget.relations,
          ceiling: L.domainLearning.saveBudget.relations,
        },
        {
          kind: 'number',
          path: 'domainLearning.maxSaveBudget',
          label: '落库额度硬顶',
          hint: '按方案条目数自动放宽时的天花板，防止一个超大方案把一轮撑爆',
          default: D.domainLearning.maxSaveBudget,
          ceiling: L.domainLearning.maxSaveBudget,
        },
      ],
    },
    {
      title: '自动推进与上下文',
      params: [
        {
          kind: 'number',
          path: 'domainLearning.maxConcurrentRuns',
          label: '自动推进并发',
          hint: '后台自动研究同时跑几个（每空间）；调大更快但更吃 API 配额',
          default: D.domainLearning.maxConcurrentRuns,
          ceiling: L.domainLearning.maxConcurrentRuns,
        },
        {
          kind: 'number',
          path: 'domainLearning.contextWindowTokens',
          label: '上下文窗口',
          hint: '超过就触发压缩；调大更贵但更少丢上下文，调小会频繁压缩',
          unit: 'Tokens',
          default: D.domainLearning.contextWindowTokens,
          ceiling: L.domainLearning.contextWindowTokens,
          floor: 1000,
          step: 1000,
        },
      ],
    },
  ],
  /** 关系边额度不得小于知识点额度：否则建完点必然建不完边（配错了只会让功能半死） */
  crossFieldGuard: (values) => {
    const concepts = values['domainLearning.saveBudget.concepts'] as number
    const relations = values['domainLearning.saveBudget.relations'] as number
    if (typeof concepts === 'number' && typeof relations === 'number' && relations < concepts) {
      values['domainLearning.saveBudget.relations'] = concepts
      return [
        `domainLearning.saveBudget.relations(${relations}) 小于 concepts(${concepts})，已抬到与 concepts 相同`,
      ]
    }
    return []
  },
}
