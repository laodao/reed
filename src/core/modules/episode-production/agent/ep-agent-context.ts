/**
 * 剧集制作 Agent 上下文组装
 * @module modules/episode-production/agent/ep-agent-context
 *
 * 决策调用：项目/剧集数据摘要 + 对话历史 + 生产状态 + 用户消息 → 轻量 JSON 决策。
 * 总结调用：决策 reply + 动作执行摘要 + 更新后生产状态 + 用户消息 → 流式自然语言回复。
 *
 * AI 底层复用 LongWritingAIService.agentDecide / agentSummarize（通用系统+用户提示词调用）。
 */

import type { EpAgentActionSummary, EpAgentProductionState } from './ep-agent.types'
import type { EpAgentHistoryItem } from './ep-agent.types'
import { EP_AGENT_HISTORY_LIMIT } from './ep-agent.types'
import { epStateToSummary } from './ep-agent-deps'

// ==================== 决策调用 ====================

const DECISION_SYSTEM_PROMPT = `你是专业剧集制作项目的 AI 制作助手，通过对话帮用户完成从"剧本"到"分镜/资产"的制作流程。
你能通过执行"动作"来真正修改项目数据。动作类型与参数：

- generate_script: 生成整集剧本（剧情大纲 → 结构化场景 + 对白 + 正文）。params.chapterContent（可选，缺省用剧集关联长文/上传原文）、params.requirements（可选，用户具体要求）
- split_scenes: 从已有剧本 synopsis 拆分场景。params.requirements（可选）
- generate_storyboards: 为所有场景生成分镜。params.requirements（可选）
- generate_char_asset: 为角色生成定妆主图。params.name（必填，角色名，用于在项目资产中定位/创建）、params.requirements（可选）
- generate_location_asset: 为地点生成主图。params.name（必填）、params.requirements（可选）
- generate_item_asset: 为物品生成主图。params.name（必填）、params.requirements（可选）
- update_entity: 修改已有资产（角色/地点/物品）。params.type（character/location/item）、params.id（可选，优先按 id）、params.name（可选，按名定位）、params.patch（要改的字段）
- delete_entity: 删除已有资产。params.type、params.id（可选）、params.name（可选）

决策规则：
1. 先判断用户意图：需要改项目数据时才输出 actions；纯提问/咨询/建议时 actions 为空数组。
2. 遵守数据依赖（引擎会校验，但你要主动避免）：
   - split_scenes 需要剧本已存在；generate_storyboards 需要已有场景。
   - 若剧本缺失，用户想生成剧本时优先输出 generate_script。
3. 已有数据不要盲目重复生成；补充生成时在 requirements 里写明"不要重复已有：xxx"。
4. 一次最多输出 3 个动作，按依赖顺序排列。
5. 你的 reply 只是给用户的简短回应（一句话即可），最终详细介绍会在动作执行后生成。
6. 生成单个资产的图时，用 generate_char_asset/location_asset/item_asset，params.name 给出角色/地点/物品名；项目里没有该资产时引擎会 attempt 创建后再生成。

严格只输出一个 JSON 对象（不要 markdown 代码块、不要多余文字）：
{"reply": "简短回应", "actions": [{"type": "动作类型", "params": {...}}]}`

export function buildEpDecisionContext(
  userMessage: string,
  state: EpAgentProductionState,
  history: EpAgentHistoryItem[],
): { systemPrompt: string; userPrompt: string } {
  const historyText = history
    .slice(-EP_AGENT_HISTORY_LIMIT)
    .map(m => `${m.role === 'user' ? '用户' : '助手'}：${m.content.slice(0, 200)}`)
    .join('\n')

  const userPrompt = `【项目当前状态】
${epStateToSummary(state)}

【最近对话】
${historyText || '（无）'}

【用户本条消息】
${userMessage}

请判断是否需要执行动作，输出 JSON。`

  return { systemPrompt: DECISION_SYSTEM_PROMPT, userPrompt }
}

// ==================== 总结调用 ====================

const SUMMARY_SYSTEM_PROMPT = `你是剧集制作项目的 AI 制作助手。以下是用户消息、本轮执行结果和项目最新状态。
请用自然语言（中文）回复用户，要求：
1. 亲切、专业、简洁，像一位懂制作的顾问在对话，而不是报告。
2. 先说明本轮做了什么（执行了哪些动作、生成了什么/改了什么）；若某动作失败，解释原因并给出替代建议。
3. 结合项目最新状态，主动提出下一步建议（可以提到具体可做的事）。
4. 不要逐字复述执行摘要，用自己的话组织；不要输出 JSON。`

export function buildEpSummaryContext(
  userMessage: string,
  decisionReply: string | undefined,
  actionSummaries: EpAgentActionSummary[],
  state: EpAgentProductionState,
): { systemPrompt: string; userPrompt: string } {
  const actionsText =
    actionSummaries.length > 0
      ? actionSummaries.map(a => `- [${a.type}] ${a.message}`).join('\n')
      : '（本轮没有执行数据修改动作）'

  const userPrompt = `【用户消息】
${userMessage}

【决策时回应（可参考语气）】
${decisionReply || '（无）'}

【本轮执行结果】
${actionsText}

【项目最新状态】
${epStateToSummary(state)}

请回复用户。`

  return { systemPrompt: SUMMARY_SYSTEM_PROMPT, userPrompt }
}
