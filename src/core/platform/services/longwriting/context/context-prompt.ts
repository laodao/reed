/**
 * 上下文 prompt 拼接（步骤1 新增）
 * @module core/platform/services/longwriting/context/context-prompt
 *
 * systemPrompt 原样搬自 longwriting-ai.service.ts:1318-1353（保回归，不改文案）。
 * renderUserPrompt 按 spec §4.2 八分区结构化拼接 ContextSection。
 */

import type { ContextSection, ContextManifest } from './context.types'

/**
 * 系统提示词（写作原则）—— 原样搬自 service:1318-1353，不改文案保回归。
 * 未来用户自定义留 renderSystemPrompt() 钩子（本步骤不实现）。
 */
export const SYSTEM_PROMPT_TEMPLATE = `你是一位资深的网络小说作家，擅长创作情节紧凑、人物生动、场景细腻的章节内容。

## 写作核心原则

### 1. 章节衔接技巧
- **开头衔接**：从上一章结尾自然过渡，避免突兀跳跃
- **时间连贯**：本章开始时间应从上一章结束时间之后自然延续
- **场景过渡**：如果场景转换，需要合理的过渡描写
- **情绪承接**：保持上一章结尾的情绪氛围，或自然转换情绪

### 2. 人物塑造要求
- 对话要符合人物性格特点
- 行为举止要符合人物背景和能力设定
- 外貌描写要与设定保持一致
- 注意人物当前状态

### 3. 场景描写原则
- 场景要具体可感，调动读者的感官体验
- 环境要与时代背景设定一致
- 重要场景要突出独特特征

### 4. 情节推进技巧
- 本章要有明确的推进目标
- 情节要紧凑，避免拖沓和冗余
- 注意呼应前文伏笔
- 适当铺垫后续情节

### 5. 写作禁忌
- **禁止**：已死亡的角色再次出现
- **禁止**：已学会的技能再次"初学"
- **禁止**：已获得的物品再次"首次获得"
- **禁止**：忽略已建立的人物关系
- **禁止**：与世界观设定冲突的内容

### 6. 输出要求
直接输出章节正文内容，不需要标题，不需要额外说明。`

/**
 * 把 ContextSection 渲染成 userPrompt（按 priority 排序的 Markdown 分区）。
 * 只渲染 included=true 的 item。
 *
 * 注：分区标题用 section.title（如"涉及角色完整信息"），item content 直接拼接。
 * 相比旧 generateChapter 的固定"一~六"分区，这里按实际有内容的 section 动态拼接。
 */
export function renderUserPrompt(
  sections: ContextSection[],
  chapterTask: { name: string; summary: string; targetWords: number },
  userExtraPrompt?: string,
): string {
  const parts: string[] = ['# 章节写作任务']

  // 二、当前章节任务（固定在最前，确保 AI 明确任务）
  parts.push(`## 当前章节任务

**章节名称**：${chapterTask.name}
**章节概要**：${chapterTask.summary}
**目标字数**：${chapterTask.targetWords}字`)

  // 按 priority 升序拼接各 section（只含 included items）
  for (const sec of sections) {
    const includedItems = sec.items.filter((it) => it.included)
    if (includedItems.length === 0) continue
    const body = includedItems.map((it) => it.content).join('\n')
    parts.push(`## ${sec.title}\n\n${body}`)
  }

  // 用户附加提示
  if (userExtraPrompt) {
    parts.push(`## 附加要求\n\n${userExtraPrompt}`)
  }

  parts.push('请根据以上所有信息，撰写章节正文内容。直接开始写作，不需要标题。')
  return parts.join('\n\n---\n\n')
}

/**
 * 核算 manifest 的总 token（含 included items）
 */
export function computeManifestTokens(sections: ContextSection[]): number {
  return sections.reduce(
    (acc, sec) => acc + sec.items.filter((it) => it.included).reduce((a, it) => a + estimateContentTokens(it.content), 0),
    0,
  )
}

// 内部：避免与 context-token 循环 import，用同样公式
function estimateContentTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length * 1.5)
}
