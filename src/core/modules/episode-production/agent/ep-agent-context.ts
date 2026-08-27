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
- query_database: 查询外部数据库（工作流「数据表」节点配置的数据源）。params.dataSourceId（必填，数据源 id，可从【候选数据源名单】的名称（id）里取，名称或 id 均可，引擎会自动解析）、params.sql（必填，SELECT 查询，参数用 $1,$2 占位）、params.params（可选，JSON 数组参数值）。仅允许 SELECT/CTE 读取，禁止写操作。

决策规则：
0. 【最高优先级】用户想生成某个资产的图/内容，但**没有明确指定哪个**（如"给某个角色生成定妆图"）时：**必须输出 choice 让用户选，禁止用大段文字反过来问"给谁做"**。choice 的 choices 从【项目当前状态】的资产名单取（角色/地点/物品名，不要编造）。
0.1 用户想查外部数据库（如"查一下订单数据"），但**没有指定哪个数据源**时：输出 choice 让用户从【候选数据源名单】选（actionType=query_database, param=dataSourceId, choices=数据源名）。只有用户明确给了数据源名/或引擎多轮确认后带参指令时才直接输出 query_database。
1. 先判断用户意图：需要改项目数据时才输出 actions；纯提问/咨询/建议时 actions 为空数组，此时可以正常用文字回答。
2. 遵守数据依赖（引擎会校验，但你要主动避免）：
   - split_scenes 需要剧本已存在；generate_storyboards 需要已有场景。
   - 若剧本缺失，用户想生成剧本时优先输出 generate_script。
3. 已有数据不要盲目重复生成；补充生成时在 requirements 里写明"不要重复已有：xxx"。
4. 一次最多输出 3 个动作，按依赖顺序排列。
5. 你的 reply 只是给用户的简短回应（一句话即可），最终详细介绍会在动作执行后生成。
6. 生成单个资产的图时，用 generate_char_asset/location_asset/item_asset，params.name 给出角色/地点/物品名；项目里没有该资产时引擎会 attempt 创建后再生成。
7. 【多轮确认】若动作所需的必填参数（如 generate_char_asset 的 params.name）无法从整个对话里确定，**不要输出该 action、不要用文字追问**，改为输出 choice：
   {"choice":{"actionType":"generate_char_asset","param":"name","choices":["项目里的角色名列表"],"prompt":"请选择要生成定妆图的角色"}}
8. 用户消息形如 "generate_char_asset param name=杜十娘" / "query_database param dataSourceId=金融库" 时，是引擎多轮确认后的带参指令，直接输出对应 action（用该参数），不要再用 choice 追问。

输出约束（必须严格遵守）：
- 生成图/内容但未指定实体 → 优先 choice，actions 里不要出现缺少必填参数的 action。
- reply 保持一两句，不要大段反问；要追问请用 choice 的 prompt + choices，而不是写在 reply 里。

严格只输出一个 JSON 对象（不要 markdown 代码块、不要多余文字）：
{"reply": "简短回应", "actions": [{"type": "动作类型", "params": {...}}], "choice": {"actionType":"...", "param":"name", "choices":[...], "prompt":"..."}}`

export function buildEpDecisionContext(
  userMessage: string,
  state: EpAgentProductionState,
  history: EpAgentHistoryItem[],
  extra?: { dataSources?: Array<{ id: string; name: string }> },
): { systemPrompt: string; userPrompt: string } {
  const historyText = history
    .slice(-EP_AGENT_HISTORY_LIMIT)
    .map(m => `${m.role === 'user' ? '用户' : '助手'}：${m.content.slice(0, 200)}`)
    .join('\n')

  // 数据源以「名称（id）」成对注入：choice/带参指令里 dataSourceId 填名称或括号内 id 均可，
  // 引擎执行时会按名称自动解析（见 executeQueryDatabase 的 name→id 兜底）。
  const dataSourcesText =
    extra?.dataSources && extra.dataSources.length > 0
      ? `- 数据源：${extra.dataSources.map(s => `${s.name}（${s.id}）`).join('、')}`
      : '（未配置数据源——用户要查外部数据库时，请建议先在「设置 → 数据库数据源」添加）'

  const userPrompt = `【项目当前状态】
${epStateToSummary(state)}

【候选资产名单】（choice 的 choices 请优先从这些名单取，不要编造）
- 角色：${state.assets.characters.names.join('、') || '（无）'}
- 地点：${state.assets.locations.names.join('、') || '（无）'}
- 物品：${state.assets.items.names.join('、') || '（无）'}

【候选数据源名单】（query_database 的 choice 用）
${dataSourcesText}

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
