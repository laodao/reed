/**
 * AI 设定反推 prompt 模板（spec 2026-05-07 §3.4）
 * @module platform/episode-production/assets/prompts/setting-enrichment-prompt
 *
 * 把"AI 角色 / 场景 / 道具设计师"的指令拆成纯字符串拼装函数：
 * - buildSettingEnrichmentSystemPrompt(kind) → system 指令
 * - buildSettingEnrichmentUserPrompt(input)   → user 指令（原文 + 上下文 + 待补清单）
 *
 * 双端共用：core 包，不依赖 fs / browser API。
 */

export type EnrichmentKind = 'character' | 'location' | 'item'

import {
  createDefaultPromptContext,
  renderStoryBackgroundBlock,
  type PromptContext,
} from '../../prompts/prompt-context'

export interface EnrichmentTodo {
  /** binding id */
  id: string
  name: string
  alias: string | null
}

export interface EnrichmentContext {
  name: string
  /** 已填字段（同 kind 已有 binding 的可见字段，作为世界观） */
  fields: Record<string, unknown>
}

export interface BuildUserPromptInput {
  kind: EnrichmentKind
  originalText: string
  existingContext: EnrichmentContext[]
  todo: EnrichmentTodo[]
}

const KIND_LABEL: Record<EnrichmentKind, string> = {
  character: '角色',
  location: '地点',
  item: '物品',
}

/**
 * 人种枚举（§3.6 单一事实源）：此前本文件与 `asset-setting-enrichment.service.ts`
 * 各写一份 7 枚举字面量，两侧改动不同步即数据不一致。现由本模块导出，服务侧 import。
 */
export const RACE_VALUES = [
  'east_asian',
  'south_asian',
  'southeast_asian',
  'central_asian',
  'european',
  'african',
  'south_american',
] as const

export type RaceValue = (typeof RACE_VALUES)[number]

/** 人种枚举的提示词内联写法（从 RACE_VALUES 渲染，不再手写） */
const RACE_HINT = RACE_VALUES.map((v) => `"${v}"`).join(' / ')

/**
 * character 字段说明：description / appearance / outfit / role / gender / age / race
 *                    + styleAnchors（数组）/ outfitsExtra（数组）
 * location  字段说明：description（短语描述地点的氛围、时段、风格）
 * item      字段说明：description
 */
const SCHEMA_HINT: Record<EnrichmentKind, string> = {
  character: `每个角色返回如下字段（任意字段判断没有充分线索时可设为 null 或空字符串，不要编造）：
- description: 一句概括（中文）
- appearance: 外貌（发型 / 体型 / 面部特征，中文）
- outfit: 主要服装（中文）
- role: 定位（"主角" / "配角" / "反派" / "旁白" 之一）。**仅用于叙事参考，不影响图像生成**——它不进图像提示词，请如实填写以便后续叙事分析使用。
- gender: 性别（"男" / "女" / "其他" / "未指定" 之一）
- age: 整数年龄（不确定时给一个合理整数估值）
- race: 人种（${RACE_HINT} 之一）
- styleAnchors: 风格锚点字符串数组（如 ["工笔国风", "水墨"]）
- outfitsExtra: 备选服装字符串数组`,
  location: `每个地点返回如下字段（不能确定时设 null 或空串）：
- description: 一段描述（氛围 / 时段 / 风格 / 环境元素，中文）`,
  item: `每个物品返回如下字段：
- description: 一段描述（材质 / 风格 / 形态，中文）`,
}

/**
 * 设定反推系统提示词。
 *
 * §3.6（2026-10-06）：新增【故事背景】注入——优化前 system/user 均无故事年代/地域，
 * 第一批资产（没有同类参考时）反推人种/服装**完全无时代锚**，只能自由发挥。
 *
 * @param kind 资产类型
 * @param ctx  PromptContext（缺省不注入背景，行为等价优化前）
 */
export function buildSettingEnrichmentSystemPrompt(
  kind: EnrichmentKind,
  ctx: PromptContext = createDefaultPromptContext(),
): string {
  const label = KIND_LABEL[kind]
  const background = renderStoryBackgroundBlock(ctx)
  const backgroundLine = background
    ? `\n${background}\n\n新设计的字段必须与该故事背景的时代与地域相符（服饰/人种/物品形制等）。\n`
    : ''

  return `你是这部剧的${label}设计师。你将拿到一份原文片段和一些待设计的${label}名字清单。
${backgroundLine}
请为每个${label}推断出生成图所需的字段。

强制规则：
1. 原文里明确提到的细节必须忠实遵循，不能改写或反对。
2. 原文未明说但生成图必需的字段（外貌、服装、年龄、人种、风格等），请基于原文整体氛围与已有同类资产合理设计一个和谐、自洽、不与原文矛盾的方案。
3. 你判断某字段没有充分线索且无合理设计依据时，可以输出 null 或空字符串作为空缺，切勿编造完全脱离原文的细节。
4. 输出严格 JSON，结构与下方 schema 一致。
5. 同项目已有的同类资产代表了"已经定下来的世界观"，新设计必须与之相容。

${SCHEMA_HINT[kind]}

输出 JSON 结构示例：
{
  "results": [
    {
      "id": "<待补清单里的 id>",
      "fields": { /* 上述 schema 字段 */ },
      "_evidence": { "<字段名>": "<来源说明：原文片段 或 '设计：理由'>" }
    }
  ]
}`
}

export function buildSettingEnrichmentUserPrompt(input: BuildUserPromptInput): string {
  const { originalText, existingContext, todo } = input
  const ctxText =
    existingContext.length === 0
      ? '（暂无）'
      : existingContext
          .map((c) => `- ${c.name}：${JSON.stringify(c.fields)}`)
          .join('\n')
  const todoText = todo
    .map((t) => `- id=${t.id} 名字="${t.name}"${t.alias ? ` 别名="${t.alias}"` : ''}`)
    .join('\n')
  return `【原文片段】
${originalText || '（原文为空）'}

【同项目已有同类资产（世界观参考）】
${ctxText}

【待设计清单】
${todoText}

请按 system prompt 中给出的 schema 输出严格 JSON。`
}
