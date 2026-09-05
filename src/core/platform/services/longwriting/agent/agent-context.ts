/**
 * Agent 上下文组装
 * @module core/platform/services/longwriting/agent/agent-context
 *
 * 决策调用：项目数据摘要 + 对话历史 + 生产状态 + 用户消息 → 轻量 JSON 决策。
 * 总结调用：决策 reply + 动作执行摘要 + 更新后生产状态 + 用户消息 → 流式自然语言回复。
 */

import type { DesignMessage } from '@shared/types/longwriting.types'
import type { AgentActionSummary, AgentProductionState } from './agent.types'
import { AGENT_HISTORY_LIMIT } from './agent.types'

// ==================== 状态摘要 ====================

/** 生产状态 → 人类可读摘要（喂给 AI 判断下一步） */
export function stateToSummary(s: AgentProductionState): string {
  const lines: string[] = []

  const overview = s.overview
  if (overview.exists) {
    lines.push(
      `故事概要：${overview.title || '未命名'}（类型：${overview.storyType || '未指定'}）` +
        (overview.coreConflict ? `，核心冲突：${overview.coreConflict.slice(0, 80)}` : ''),
    )
  } else {
    lines.push('故事概要：尚未生成')
  }

  lines.push(
    `人物：${s.characters.count} 位` +
      (s.characters.names.length > 0 ? `（${s.characters.names.slice(0, 8).join('、')}${s.characters.names.length > 8 ? '…' : ''}）` : ''),
  )

  const w = s.world
  lines.push(
    `世界设定：` +
      `${w.background ? '背景✓' : '背景✗'}、地点${w.locations}、势力${w.factions}、技能${w.skills}、物品${w.items}`,
  )

  lines.push(
    `故事线：${s.plots.count} 条` +
      (s.plots.titles.length > 0 ? `（${s.plots.titles.slice(0, 5).join('、')}${s.plots.titles.length > 5 ? '…' : ''}）` : ''),
  )

  lines.push(
    `大纲：共 ${s.outline.total} 节点，已写 ${s.outline.written} / 未写 ${s.outline.unwrittenLeaves}` +
      (s.outline.nextUnwritten ? `，下一篇未写：「${s.outline.nextUnwritten.name}」` : ''),
  )

  lines.push(`章节：已写 ${s.chapters.written} 章，累计约 ${Math.round(s.chapters.totalWords / 100) / 10} 千字`)

  return lines.join('\n')
}

// ==================== 决策调用 ====================

const DECISION_SYSTEM_PROMPT = `你是长文写作项目的 AI 创作助手，通过对话帮用户完成从"一个想法"到"整本书"的全过程。
你能通过执行"动作"来真正修改项目数据。动作类型与参数：

- generate_overview: 生成/重做故事概要。params.input = 用户的想法/要求（必填）
- generate_characters: 生成/补充人物。params.requirements = 用户的具体要求（可选）
- generate_world: 生成世界设定（背景/地点/势力/技能/物品）
- generate_plots: 生成/补充故事线
- generate_outline: 生成故事大纲。params.structureLevel = 1|2|3（可选，默认 3）
- write_chapter: 写章节。params.outlineId（可选，缺省自动选下一篇未写章节）、params.targetWords（可选）
- update_entity: 修改已有实体。params.type（character/location/faction/skill/item/plot/outline）、params.id、params.patch（要改的字段）
- delete_entity: 删除已有实体。params.type、params.id

决策规则：
1. 先判断用户意图：需要改项目数据时才输出 actions；纯提问/闲聊/建议时 actions 为空数组。
2. 遵守数据依赖（引擎会校验，但你要主动避免）：
   - generate_characters / generate_world / generate_plots / generate_outline 需要故事概要已存在；
     若概要缺失，优先输出 generate_overview（用户给了想法时），或直接建议用户先描述想法。
   - write_chapter 需要大纲存在且有待写节点；没有大纲时不要输出 write_chapter，先建议生成大纲。
3. 已有数据不要盲目重复生成；补充生成时在 requirements 里写明"不要重复已有：xxx"。
4. 一次最多输出 3 个动作（引擎上限 AGENT_MAX_ACTIONS_PER_TURN=3），按依赖顺序排列。
5. 你的 reply 只是给用户的简短回应（一句话即可），最终详细介绍会在动作执行后生成。
6. 用户要求修改/删除某实体时，用 update_entity / delete_entity（params 必须带可定位的 id 或可唯一识别的名称 name；用名称时引擎会解析）。

严格只输出一个 JSON 对象（不要 markdown 代码块、不要多余文字）：
{"reply": "简短回应", "actions": [{"type": "动作类型", "params": {...}}]}`

export function buildDecisionContext(
  userMessage: string,
  state: AgentProductionState,
  history: DesignMessage[],
): { systemPrompt: string; userPrompt: string } {
  const historyText = history
    .slice(-AGENT_HISTORY_LIMIT)
    .map(m => `${m.role === 'user' ? '用户' : '助手'}：${m.content.slice(0, 200)}`)
    .join('\n')

  const userPrompt = `【项目当前状态】
${stateToSummary(state)}

【最近对话】
${historyText || '（无）'}

【用户本条消息】
${userMessage}

请判断是否需要执行动作，输出 JSON。`

  return { systemPrompt: DECISION_SYSTEM_PROMPT, userPrompt }
}

// ==================== 总结调用 ====================

const SUMMARY_SYSTEM_PROMPT = `你是长文写作项目的 AI 创作助手。以下是用户消息、本轮执行结果和项目最新状态。
请用自然语言（中文）回复用户，要求：
1. 亲切、专业、简洁，像一位懂创作的顾问在对话，而不是报告。
2. 先说明本轮做了什么（执行了哪些动作、生成了什么/改了什么）；若某动作失败，解释原因并给出替代建议。
3. 结合项目最新状态，主动提出下一步建议（可以提到具体可做的事）。
4. 不要逐字复述执行摘要，用自己的话组织；不要输出 JSON。`

export function buildSummaryContext(
  userMessage: string,
  decisionReply: string | undefined,
  actionSummaries: AgentActionSummary[],
  state: AgentProductionState,
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
${stateToSummary(state)}

请回复用户。`

  return { systemPrompt: SUMMARY_SYSTEM_PROMPT, userPrompt }
}
